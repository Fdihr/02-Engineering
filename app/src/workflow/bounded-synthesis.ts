import { err, ok, type Result } from "../core/result.js";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { hasOnlyKeys, isRecord, pathSafeId, readArtifactBinding, validTime } from "../modules/assurance/validators.js";
import { projectWorkflow, type WorkflowBlocker, type WorkflowProjectionInput, type WorkflowWork } from "./workflow-projection.js";

export const SYNTHESIS_STAGES = ["build", "challenge"] as const;
export type SynthesisStage = typeof SYNTHESIS_STAGES[number];
export type SynthesisAuthorization = {
  schemaVersion: "bounded-synthesis-authorization-v1";
  id: string;
  runId: string;
  approvedBy: string;
  approvedAt: string;
  decision: "bounded-build-challenge-authorized";
  sourceNotes: ArtifactBinding[];
  policy: ArtifactBinding;
  outlets: ArtifactBinding;
  buildEnvelopeId: string;
  buildRequest: ArtifactBinding | null;
  buildRecord: ArtifactBinding | null;
  challengeRequest: ArtifactBinding | null;
  challengeRecord: ArtifactBinding | null;
  stages: Record<SynthesisStage, { provider: "github-copilot-sdk"; model: string; maxCalls: 0 | 1 }>;
  maxCalls: number;
};

export const validateSynthesisAuthorization = (
  value: unknown
): Result<SynthesisAuthorization, "INVALID_SYNTHESIS_AUTHORIZATION"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "id", "runId", "approvedBy", "approvedAt", "decision", "sourceNotes",
    "policy", "outlets", "buildEnvelopeId", "buildRequest", "buildRecord", "challengeRequest", "challengeRecord", "stages", "maxCalls"
  ]) || value.schemaVersion !== "bounded-synthesis-authorization-v1" ||
      !pathSafeId(value.id) || !pathSafeId(value.runId) || !pathSafeId(value.approvedBy) ||
      !validTime(value.approvedAt) || value.decision !== "bounded-build-challenge-authorized" ||
      !Array.isArray(value.sourceNotes) || !value.sourceNotes.length ||
      !value.sourceNotes.every(binding => readArtifactBinding(binding)) ||
      !readArtifactBinding(value.policy) || !readArtifactBinding(value.outlets) ||
      !pathSafeId(value.buildEnvelopeId) ||
      !["buildRequest", "buildRecord", "challengeRequest", "challengeRecord"].every(key =>
        value[key] === null || readArtifactBinding(value[key])) ||
      !isRecord(value.stages) || !hasOnlyKeys(value.stages, [...SYNTHESIS_STAGES])) {
    return err("INVALID_SYNTHESIS_AUTHORIZATION");
  }
  let calls = 0;
  for (const stage of SYNTHESIS_STAGES) {
    const binding = value.stages[stage];
    const committed = value[`${stage}Record`] !== null;
    if (!isRecord(binding) || !hasOnlyKeys(binding, ["provider", "model", "maxCalls"]) ||
        binding.provider !== "github-copilot-sdk" || typeof binding.model !== "string" ||
        !binding.model.trim() || binding.model === "auto" ||
        binding.maxCalls !== (committed ? 0 : 1)) return err("INVALID_SYNTHESIS_AUTHORIZATION");
    calls += committed ? 0 : 1;
  }
  if (value.maxCalls !== calls || calls > 2 ||
      (value.challengeRecord !== null && value.buildRecord === null)) {
    return err("INVALID_SYNTHESIS_AUTHORIZATION");
  }
  return ok(value as SynthesisAuthorization);
};

export type SynthesisStageProgress = {
  phase: "unused" | "prepared" | "reserved" | "response-saved" | "validated" | "committed";
  remainingCalls: number;
  ownerAlive: boolean;
  request?: ArtifactBinding;
  record?: ArtifactBinding;
};
export type SynthesisExecutionFacts = {
  authorization: SynthesisAuthorization;
  stages: Record<SynthesisStage, SynthesisStageProgress>;
  blockers: WorkflowBlocker[];
  failure?: { phase: string; stage: SynthesisStage | null; error: string };
};
export type BoundedSynthesisAction =
  | { kind: "prepare" | "invoke" | "record"; stage: SynthesisStage }
  | { kind: "stop"; status: "running" | "indeterminate" | "failed" | "blocked" | "human-waiting"; error: string };

export const projectBoundedSynthesis = (facts: SynthesisExecutionFacts) => {
  const { authorization, stages } = facts;
  const stage: SynthesisStage = stages.build.phase === "committed" ? "challenge" : "build";
  const current = stages[stage];
  let action: BoundedSynthesisAction;
  if (facts.failure) {
    action = { kind: "stop", status: "failed", error: `${facts.failure.phase}: ${facts.failure.error}` };
  } else if (stages.challenge.phase === "committed") {
    action = { kind: "stop", status: "human-waiting", error: "" };
  } else if (current.phase === "reserved") {
    action = { kind: "stop", status: current.ownerAlive ? "running" : "indeterminate",
      error: current.ownerAlive ? "An exclusive stage invocation is running." :
        "An invocation was reserved without a saved response. Recovery is required; it will not be reissued." };
  } else if (current.phase === "response-saved" || current.phase === "validated") {
    action = { kind: "record", stage };
  } else if (current.remainingCalls < 1) {
    action = { kind: "stop", status: "blocked", error: `The authorized ${stage} call budget is exhausted.` };
  } else {
    action = { kind: current.phase === "unused" ? "prepare" : "invoke", stage };
  }
  const paths = [
    ...authorization.sourceNotes.map(binding => binding.artifactRef),
    ...SYNTHESIS_STAGES.flatMap(key => [stages[key].request?.artifactRef, stages[key].record?.artifactRef])
      .filter((path): path is string => Boolean(path))
  ];
  const work: WorkflowWork = {
    id: action.kind === "stop" && action.status === "human-waiting" ? "bounded:adjudication" : `bounded:${stage}`,
    stage: "synthesise", actor: action.kind === "stop" && action.status !== "running" ? "human" : "machine",
    kind: action.kind === "stop" && action.status !== "running" ? "checkpoint" : "work", surface: "workflow",
    title: action.kind === "stop" && action.status === "human-waiting"
      ? "Adjudicate the challenged claims" : action.kind === "stop" && action.status === "running"
        ? `Wait for bounded ${stage}` : action.kind === "stop" ? "Inspect bounded synthesis recovery" : `Continue bounded ${stage}`,
    detail: action.kind === "stop" ? action.error || "Challenge is recorded; human adjudication is still required, including when no checks were raised."
      : `${action.kind} only the frozen ${stage} stage`,
    paths, priority: 100, target: { tab: "synthesis", focus: "gate" }
  };
  const workflowInput: WorkflowProjectionInput = {
    runId: authorization.runId, intentApproved: true, evidenceAvailable: true,
    committedOutcomes: SYNTHESIS_STAGES.filter(key => stages[key].phase === "committed")
      .map(key => ({ stage: "synthesise", paths: stages[key].record ? [stages[key].record.artifactRef] : [] })),
    readyWork: [work], humanDecisions: work.actor === "human" ? [{ id: work.id, stage: work.stage, paths }] : [],
    interimCheckpoints: work.actor === "human" ? [{ id: work.id, stage: work.stage, paths }] : [],
    blockers: facts.blockers
  };
  const workflow = projectWorkflow(workflowInput);
  const blocker = workflow.blockers.find(item =>
    item.scope === "run" || item.scope === "unknown" || item.affectedWorkIds.includes(work.id));
  if (blocker && !facts.failure) action = { kind: "stop", status: "blocked", error: blocker.detail };
  return {
    authorizationId: authorization.id, runId: authorization.runId,
    status: action.kind === "stop" ? action.status : current.phase === "unused" ? "prepared" : current.phase,
    error: action.kind === "stop" ? action.error : "", action, stages, workflow, workflowInput,
    remainingCalls: stages.build.remainingCalls + stages.challenge.remainingCalls,
    maxCalls: authorization.maxCalls
  };
};
