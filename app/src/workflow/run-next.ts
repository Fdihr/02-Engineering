import {
  projectWorkflow,
  type WorkflowBlocker,
  type WorkflowProjection,
  type WorkflowProjectionInput,
  type WorkflowStage,
  type WorkflowWork
} from "./workflow-projection.js";

export type DeterministicRunStep = {
  command:
    | "record:synthesis-build"
    | "record:synthesis-challenge"
    | "record:key-judgements"
    | "record:memo-writer";
  requestPath: string;
  responsePath: string;
};

export type RunNextFacts = {
  hasIntentApproval: boolean;
  runId?: string;
  committedOutcomes?: WorkflowProjectionInput["committedOutcomes"];
  openExceptionPaths: string[];
  openExceptions?: Array<{ path: string; refs: string[] }>;
  deterministicSteps: DeterministicRunStep[];
  pendingModelRequestPaths: string[];
  publicationGatePath?: string;
  publicationApprovalAvailable?: boolean;
  governanceBlockerPaths: string[];
  evidenceAvailable?: boolean;
};

export type RunNextAction =
  | { kind: "execute"; step: DeterministicRunStep }
  | {
      kind: "human-wait";
      surface: "intent" | "publication" | "exceptions" | "governance" | "collection" | "workflow";
      paths: string[];
    }
  | { kind: "machine-wait"; replacement: "foundry-adapter"; paths: string[] }
  | { kind: "complete" };

const requestStage = (path: string): WorkflowStage => {
  if (path.includes("/assurance/") || path.startsWith("assurance/")) return "assure";
  if (path.includes("/memo/") || path.startsWith("memo/")) return "memo";
  return "synthesise";
};

const toProjectionInput = (facts: RunNextFacts): WorkflowProjectionInput => {
  const deterministic: WorkflowWork[] = facts.deterministicSteps.map((step) => ({
    id: `record:${step.requestPath}`,
    stage: step.command === "record:memo-writer" ? "memo" : "synthesise",
    actor: "machine",
    kind: "work",
    title: step.command,
    detail: "Record the validated response",
    paths: [step.requestPath, step.responsePath],
    priority: 100
  }));
  const model: WorkflowWork[] = facts.pendingModelRequestPaths.map((path) => ({
    id: `model:${path}`,
    stage: requestStage(path),
    actor: "machine",
    kind: "checkpoint",
    title: "Complete the prepared model request",
    detail: "The existing request awaits its manual model transport",
    paths: [path],
    priority: 90
  }));
  const exceptions = facts.openExceptions ??
    facts.openExceptionPaths.map((path) => ({ path, refs: [] }));
  const work = [...deterministic, ...model];
  const scopedExceptions = exceptions.map((exception) => {
    const affectedWorkIds = work
      .filter((item) => item.paths.some((path) => exception.refs.includes(path)))
      .map((item) => item.id);
    const blocker: WorkflowBlocker = {
      id: exception.path,
      kind: "exception",
      scope: affectedWorkIds.length ? "work" : "unknown",
      paths: [exception.path, ...exception.refs],
      affectedWorkIds,
      uncertain: affectedWorkIds.length === 0,
      title: affectedWorkIds.length ? "Scoped exception" : "Exception scope is not established",
      detail: affectedWorkIds.length
        ? "Only work bound to the referenced artifact is blocked."
        : "Artifact references do not identify affected work; execution is conservatively paused."
    };
    const action: WorkflowWork = {
      id: `exception:${exception.path}`,
      stage: "evidence",
      actor: "human",
      kind: "decision",
      surface: "exceptions",
      title: "Resolve an open exception",
      detail: blocker.detail,
      paths: [exception.path, ...exception.refs],
      priority: 10
    };
    return { blocker, action };
  });
  const blockers = scopedExceptions.map(({ blocker }) => blocker);
  const governanceBlockers: WorkflowBlocker[] = facts.governanceBlockerPaths.map((path) => ({
    id: `governance:${path}`,
    kind: "publication",
    scope: "publication",
    paths: [path],
    affectedWorkIds: [],
    uncertain: false,
    title: "Publication governance blocker",
    detail: "Publication remains blocked by governance."
  }));
  const publication: WorkflowWork[] =
    facts.publicationGatePath && facts.publicationApprovalAvailable
      ? [{
          id: `publication:${facts.publicationGatePath}`,
          stage: "publication",
          actor: "human",
          kind: "decision",
          surface: "publication",
          title: "Review publication gate",
          detail: "A human publication decision is available",
          paths: [facts.publicationGatePath],
          priority: 0
        }]
      : [];
  return {
    runId: facts.runId ?? "run-next",
    intentApproved: facts.hasIntentApproval,
    evidenceAvailable: facts.evidenceAvailable ?? true,
    committedOutcomes: facts.committedOutcomes ?? [],
    readyWork: [...work, ...scopedExceptions.map(({ action }) => action), ...publication],
    humanDecisions: [
      ...(!facts.hasIntentApproval
        ? [{ id: `intent:${facts.runId ?? "run-next"}`, stage: "intent" as const, paths: [] }]
        : []),
      ...exceptions.map((exception) => ({
        id: exception.path,
        stage: "evidence" as const,
        paths: [exception.path, ...exception.refs]
      })),
      ...(facts.publicationGatePath && facts.publicationApprovalAvailable
        ? [{
            id: `publication:${facts.publicationGatePath}`,
            stage: "publication" as const,
            paths: [facts.publicationGatePath]
          }]
        : [])
    ],
    interimCheckpoints: facts.pendingModelRequestPaths.map((path) => ({
      id: path,
      stage: requestStage(path),
      paths: [path]
    })),
    blockers: [...blockers, ...governanceBlockers],
    ...(facts.publicationGatePath && facts.publicationApprovalAvailable
      ? { publication: { path: facts.publicationGatePath, approvalAvailable: true } }
      : {})
  };
};

export const projectRunNextWorkflow = (facts: RunNextFacts): WorkflowProjection =>
  projectWorkflow(toProjectionInput(facts));

export const chooseRunNextAction = (facts: RunNextFacts): RunNextAction => {
  const next = projectRunNextWorkflow(facts).recommendedNextAction;
  if (next.kind === "machine") {
    const step = facts.deterministicSteps.find(
      (candidate) => next.work.id === `record:${candidate.requestPath}`
    );
    if (step) return { kind: "execute", step };
    return {
      kind: "machine-wait",
      replacement: "foundry-adapter",
      paths: next.work.paths
    };
  }
  if (next.kind === "blocked") {
    return {
      kind: "human-wait",
      surface: next.blocker.kind === "exception" ? "exceptions" : "governance",
      paths: next.blocker.paths
    };
  }
  if (next.kind === "human") {
    return { kind: "human-wait", surface: next.surface, paths: next.paths };
  }
  return { kind: "complete" };
};
