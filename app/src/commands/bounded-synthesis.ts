import { randomUUID } from "node:crypto";
import { link, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { isRecord, pathSafeId, readArtifactBinding, validTime } from "../modules/assurance/validators.js";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { validateExceptionItem } from "../modules/exceptions/exception-item.js";
import { validateOutletIdentityTable, validateSynthesisProfilePolicy } from "../modules/synthesis/policy.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import { createSynthesisBuildEnvelope } from "../modules/synthesis/build.js";
import {
  projectBoundedSynthesis, validateSynthesisAuthorization, SYNTHESIS_STAGES,
  type SynthesisAuthorization, type SynthesisExecutionFacts, type SynthesisStage, type SynthesisStageProgress
} from "../workflow/bounded-synthesis.js";
import { projectWorkflow, type WorkflowBlocker } from "../workflow/workflow-projection.js";
import { createProvisionalAdjudication } from "../modules/synthesis/challenge.js";
import { validateSourceDocument } from "../modules/source/source-document.js";
import { artifactRef, assuranceRunRoot, commandError, ensureDirectory, loadJsonArtifact, longPath, sha256 } from "./assurance-io.js";
import { runLocalCopilot } from "./local-copilot.js";
import { prepareSynthesisBuild } from "./prepare-synthesis-build.js";
import { prepareSynthesisChallenge } from "./prepare-synthesis-challenge.js";
import { recordSynthesisBuild } from "./record-synthesis-build.js";
import { recordSynthesisChallenge } from "./record-synthesis-challenge.js";
import {
  loadBuildRecordContext, loadBuildRequestContext, loadChallengeRecordContext, loadChallengeRequestContext,
  reopenSynthesisBinding, validateSavedSynthesisResponse, verifySynthesisSourceAuthority
} from "./synthesis-io.js";

const POLICY = "src/modules/synthesis/policies/geopolitical-synthesis-v1.json";
const OUTLETS = "src/modules/synthesis/policies/geopolitical-outlets-v1.json";
const now = () => new Date().toISOString();
const directoryFor = (root: string, runId: string) => resolve(root, runId, "synthesis", "execution");
const alive = (pid: unknown): boolean => {
  if (!Number.isSafeInteger(pid) || Number(pid) < 1) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    throw error;
  }
};

// Publish only flushed, complete receipts. A hard link is atomic and refuses an existing destination.
const writeDurable = async (path: string, value: unknown) => {
  const pending = resolve(dirname(path), `.pending-${randomUUID()}.tmp`);
  const file = await open(longPath(pending), "wx");
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await file.sync(); }
  finally { await file.close(); }
  try { await link(longPath(pending), longPath(path)); }
  finally { await unlink(longPath(pending)); }
  return (await loadJsonArtifact(path)).binding;
};
const optionalJson = async (path: string) => {
  try { return await loadJsonArtifact(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};
const filesIn = async (directory: string): Promise<string[]> => {
  const entries = await readdir(longPath(directory), { withFileTypes: true });
  const files = (await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : Promise.resolve([path]);
  }))).flat();
  if (files.length > 10_000) throw new Error("Run exceeds the bounded artifact-scan limit.");
  return files;
};
const confined = async (root: string, path: string) => {
  const delta = relative(await realpath(root), await realpath(resolve(path)));
  if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("Synthesis lineage must remain inside the configured run root.");
};
const sameRef = (left: string, right: string) => resolve(left) === resolve(right);
const loadCatalog = async (effects: SynthesisEffects) => {
  const catalog = await effects.runModel({ action: "models" });
  if (!isRecord(catalog) || !Array.isArray(catalog.models) ||
      !catalog.models.every(entry => isRecord(entry) && typeof entry.id === "string")) {
    throw new Error("Copilot returned an invalid model catalog.");
  }
  return new Set(catalog.models.map(entry => String(entry.id)));
};
export type SynthesisEffects = {
  runModel: typeof runLocalCopilot;
  prepareBuild: typeof prepareSynthesisBuild;
  prepareChallenge: typeof prepareSynthesisChallenge;
  recordBuild: typeof recordSynthesisBuild;
  recordChallenge: typeof recordSynthesisChallenge;
};
const defaults: SynthesisEffects = {
  runModel: runLocalCopilot, prepareBuild: prepareSynthesisBuild, prepareChallenge: prepareSynthesisChallenge,
  recordBuild: recordSynthesisBuild, recordChallenge: recordSynthesisChallenge
};

const selectedModels = async (root: string) => {
  const settings = (await loadJsonArtifact(resolve(root, ".copilot-settings.json"))).value;
  if (!isRecord(settings) || typeof settings.model !== "string" || !settings.model.trim() ||
      (settings.stages !== undefined && !isRecord(settings.stages))) {
    throw new Error("Choose and save explicit Copilot models in Settings before starting bounded synthesis.");
  }
  const result = { build: "", challenge: "" };
  for (const stage of SYNTHESIS_STAGES) {
    const override = isRecord(settings.stages) ? settings.stages[stage] : undefined;
    if (override !== undefined && (!isRecord(override) ||
        override.provider !== "github-copilot-sdk" || typeof override.model !== "string" || !override.model.trim())) {
      throw new Error(`Invalid Settings model assignment for ${stage}.`);
    }
    result[stage] = isRecord(override) ? String(override.model) : settings.model;
    if (result[stage] === "auto") throw new Error(`Select an explicit available ${stage} model; Auto is not a bounded assignment.`);
  }
  return result;
};

const requestConsumed = async (path: string) => {
  const names = await readdir(longPath(dirname(path)));
  return names.some(name => name === "generation-attempt.json" || name === "copilot-recorded.json" ||
    /^copilot-(invocation|response).*\.json$/.test(name));
};

const freezeAuthorization = async (root: string, runId: string, analyst: string, effects: SynthesisEffects) => {
  if (!pathSafeId(analyst)) throw new Error("An explicit analyst ID is required to authorize bounded synthesis.");
  const approvedAt = now();
  const files = await filesIn(resolve(root, runId));
  const builds = [];
  for (const path of files.filter(path => basename(path) === "synthesis-build-record.json")) {
    const loaded = await loadJsonArtifact(path);
    const record = validateSynthesisBuildRecord(loaded.value);
    if (!record.ok) throw new Error("A recorded Build has invalid state; inspect it before starting.");
    builds.push({ path, record: record.value });
  }
  builds.sort((a, b) => a.record.recordedAt.localeCompare(b.record.recordedAt) || a.path.localeCompare(b.path));
  // Finish an existing round before even considering an unused, later Build request.
  const target = builds.at(-1);
  let buildRequest: ArtifactBinding | null = null;
  let buildRecord: ArtifactBinding | null = null;
  let challengeRequest: ArtifactBinding | null = null;
  let challengeRecord: ArtifactBinding | null = null;
  let sources: ArtifactBinding[];
  let policy: ArtifactBinding;
  let outlets: ArtifactBinding;
  let buildEnvelopeId: string;
  if (target) {
    const context = await loadBuildRecordContext(root, target.path);
    buildRecord = context.recordArtifact.binding;
    buildRequest = context.requestArtifact.binding;
    sources = context.envelope.sourceNotes;
    policy = context.policyArtifact.binding;
    outlets = context.outletArtifact.binding;
    buildEnvelopeId = context.envelope.id;
    const challenges = [];
    for (const path of files.filter(path => basename(path) === "challenge-record.json")) {
      const value = (await loadJsonArtifact(path)).value;
      if (isRecord(value) && isRecord(value.buildRecord) && typeof value.buildRecord.artifactRef === "string" &&
          sameRef(value.buildRecord.artifactRef, target.path)) challenges.push(path);
    }
    if (challenges.length > 1) throw new Error("This Build has multiple Challenge records; select its historical round manually.");
    if (challenges[0]) {
      const challenge = await loadChallengeRecordContext(root, challenges[0]);
      challengeRecord = challenge.recordArtifact.binding;
      challengeRequest = challenge.requestArtifact.binding;
    } else {
      const requests = [];
      for (const path of files.filter(path => basename(path) === "challenge-request.json")) {
        const value = (await loadJsonArtifact(path)).value;
        if (isRecord(value) && isRecord(value.buildRecord) && typeof value.buildRecord.artifactRef === "string" &&
            sameRef(value.buildRecord.artifactRef, target.path)) requests.push(path);
      }
      if (requests.length > 1) throw new Error("This Build has multiple prepared Challenges; select the authorized request manually.");
      if (requests[0]) {
        if (await requestConsumed(requests[0])) throw new Error("The existing Challenge attempt is consumed or indeterminate; no new call is authorized.");
        challengeRequest = (await loadChallengeRequestContext(root, requests[0])).requestArtifact.binding;
      }
    }
  } else {
    const requests = files.filter(path => basename(path) === "build-request.json");
    const ready = [];
    for (const path of requests) if (!(await requestConsumed(path))) ready.push(path);
    if (ready.length > 1) throw new Error("Multiple ready Build requests exist; select the intended round manually.");
    if (!ready.length && requests.length) throw new Error("Existing Build attempts are consumed or indeterminate; starting will not create a fresh round.");
    if (ready[0]) {
      const context = await loadBuildRequestContext(root, ready[0]);
      buildRequest = context.requestArtifact.binding;
      sources = context.envelope.sourceNotes;
      policy = context.policyArtifact.binding;
      outlets = context.outletArtifact.binding;
      buildEnvelopeId = context.envelope.id;
    } else {
      const notes = new Map<string, string>();
      for (const path of files.filter(path => /^source-note-(reviewed|provisional)\.json$/.test(basename(path))).sort()) {
        const parent = dirname(path);
        if (!notes.has(parent) || basename(path) === "source-note-reviewed.json") notes.set(parent, path);
      }
      if (!notes.size) throw new Error("No assembled source notes are available for bounded synthesis.");
      sources = await Promise.all([...notes.values()].map(async path => (await loadJsonArtifact(path)).binding));
      policy = (await loadJsonArtifact(resolve(POLICY))).binding;
      outlets = (await loadJsonArtifact(resolve(OUTLETS))).binding;
      const checkedPolicy = validateSynthesisProfilePolicy((await loadJsonArtifact(policy.artifactRef)).value);
      const checkedOutlets = validateOutletIdentityTable((await loadJsonArtifact(outlets.artifactRef)).value);
      if (!checkedPolicy.ok || !checkedOutlets.ok) throw new Error("Synthesis policy or outlet table is invalid.");
      const envelope = createSynthesisBuildEnvelope({
        sources: await Promise.all(sources.map(binding => verifySynthesisSourceAuthority(root, binding, approvedAt))),
        policy: checkedPolicy.value, policyArtifact: policy,
        outletIdentityTable: checkedOutlets.value, outletIdentityArtifact: outlets, createdAt: approvedAt
      });
      if (!envelope.ok) throw new Error(`Build envelope rejected before authorization: ${envelope.error}`);
      buildEnvelopeId = envelope.value.id;
    }
  }
  const models = await selectedModels(root);
  const authorization: SynthesisAuthorization = {
    schemaVersion: "bounded-synthesis-authorization-v1", id: `synthesis-execution-${randomUUID()}`,
    runId, approvedBy: analyst, approvedAt, decision: "bounded-build-challenge-authorized",
    sourceNotes: sources, policy, outlets, buildEnvelopeId, buildRequest, buildRecord, challengeRequest, challengeRecord,
    stages: {
      build: { provider: "github-copilot-sdk", model: models.build, maxCalls: buildRecord ? 0 : 1 },
      challenge: { provider: "github-copilot-sdk", model: models.challenge, maxCalls: challengeRecord ? 0 : 1 }
    }, maxCalls: Number(!buildRecord) + Number(!challengeRecord)
  };
  await verifyAuthorizationInputs(root, authorization);
  const blockers = await scopedBlockers(root, authorization);
  const preliminary = projectBoundedSynthesis({
    authorization, blockers,
    stages: {
      build: { phase: buildRecord ? "committed" : buildRequest ? "prepared" : "unused",
        remainingCalls: authorization.stages.build.maxCalls, ownerAlive: false },
      challenge: { phase: challengeRecord ? "committed" : challengeRequest ? "prepared" : "unused",
        remainingCalls: authorization.stages.challenge.maxCalls, ownerAlive: false }
    }
  });
  if (preliminary.action.kind === "stop" && preliminary.action.status === "blocked") throw new Error(preliminary.error);
  if (authorization.maxCalls) {
    const catalog = await loadCatalog(effects);
    for (const stage of SYNTHESIS_STAGES) if (authorization.stages[stage].maxCalls && !catalog.has(models[stage])) {
      throw new Error(`The Settings-selected ${stage} model '${models[stage]}' is unavailable; no substitute or call was made.`);
    }
  }
  const directory = directoryFor(root, runId);
  const binding = await writeDurable(resolve(directory, "authorization.json"), authorization);
  await writeDurable(resolve(directory, "authorized.json"), {
    authorization: binding, actorType: "human", actorId: analyst, occurredAt: approvedAt,
    eventType: "synthesis.bounded.authorized", maxCalls: authorization.maxCalls
  });
  return authorization;
};

const verifyAuthorizationInputs = async (root: string, authorization: SynthesisAuthorization) => {
  if (Date.parse(authorization.approvedAt) > Date.now()) throw new Error("Synthesis authorization is future-dated.");
  const questions = new Set<string>();
  for (const source of authorization.sourceNotes) {
    await confined(root, source.artifactRef);
    const verified = await verifySynthesisSourceAuthority(root, source, now());
    if (verified.note.runId !== authorization.runId) throw new Error("Frozen source note belongs to a different run.");
    questions.add(verified.question.artifactSha256);
    for (const [key, value] of Object.entries(verified.note.lineage)) {
      const binding = readArtifactBinding(value);
      if (binding && key !== "policy") await confined(root, binding.artifactRef);
    }
    await confined(root, verified.note.lineage.invocation.request.artifactRef);
    await confined(root, verified.note.lineage.invocation.response.artifactRef);
  }
  if (questions.size !== 1) throw new Error("The frozen source notes must share one approved research question.");
  const policy = await loadJsonArtifact(resolve(authorization.policy.artifactRef));
  const outlets = await loadJsonArtifact(resolve(authorization.outlets.artifactRef));
  if (!isDeepStrictEqual(policy.binding, authorization.policy) || !validateSynthesisProfilePolicy(policy.value).ok ||
      !isDeepStrictEqual(outlets.binding, authorization.outlets) || !validateOutletIdentityTable(outlets.value).ok) {
    throw new Error("Frozen synthesis policy or outlet table changed or is invalid.");
  }
};

const scopedBlockers = async (root: string, authorization: SynthesisAuthorization): Promise<WorkflowBlocker[]> => {
  const participants = new Set<string>([authorization.policy.artifactRef, authorization.outlets.artifactRef,
    ...authorization.sourceNotes.map(binding => binding.artifactRef),
    ...[authorization.buildRequest, authorization.buildRecord, authorization.challengeRequest, authorization.challengeRecord]
      .filter((binding): binding is ArtifactBinding => binding !== null).map(binding => binding.artifactRef)].map(path => resolve(path)));
  for (const binding of authorization.sourceNotes) {
    const note = (await reopenSynthesisBinding(root, binding, "Source note")).value;
    if (isRecord(note) && isRecord(note.lineage)) for (const value of Object.values(note.lineage)) {
      const reference = readArtifactBinding(value);
      if (reference) participants.add(resolve(reference.artifactRef));
    }
  }
  const blockers: WorkflowBlocker[] = [];
  for (const path of (await filesIn(resolve(root, authorization.runId))).filter(path => basename(path) === "exception-item.json")) {
    const loaded = await loadJsonArtifact(path);
    const exception = validateExceptionItem(loaded.value);
    if (!exception.ok || exception.value.runId !== authorization.runId) throw new Error("Invalid run exception; execution integrity is uncertain.");
    if (exception.value.status !== "open") continue;
    let relevant = false;
    let knownScope = exception.value.refs.length > 0;
    const paths = [];
    for (const binding of exception.value.refs) {
      await confined(root, binding.artifactRef);
      if (sha256(await readFile(longPath(resolve(binding.artifactRef)))) !== binding.artifactSha256) {
        throw new Error("Open exception reference checksum changed; its affected scope is uncertain.");
      }
      paths.push(binding.artifactRef);
      const participating = participants.has(resolve(binding.artifactRef));
      relevant ||= participating;
      let sourceScoped = false;
      const within = relative(resolve(root, authorization.runId), resolve(binding.artifactRef)).replaceAll("\\", "/");
      if (/^(assurance|sources|article-captures|article-reassessments|rss-captures|rss-batches|source-reintakes)\//.test(within) &&
          binding.artifactRef.endsWith(".json")) {
        const value = (await loadJsonArtifact(resolve(binding.artifactRef))).value;
        sourceScoped = isRecord(value) && value.runId === authorization.runId &&
          (validateSourceDocument(value).ok || [
            "local-article-capture-v1", "local-article-reassessment-authorization-v1",
            "rss-capture-v1", "rss-batch-selection-v1", "source-intelligence-note-v2",
            "question-relevance-assessment-v1", "question-relevance-assessment-v2"
          ].includes(String(value.schemaVersion)));
      }
      knownScope &&= participating || sourceScoped;
    }
    const scope = knownScope ? "work" : "unknown";
    blockers.push({
      id: exception.value.id, kind: "exception", scope, paths: [artifactRef(path), ...paths],
      affectedWorkIds: relevant ? ["bounded:build", "bounded:challenge", "bounded:adjudication"] : [],
      uncertain: scope === "unknown", title: !knownScope ? "Exception scope is not established" :
        relevant ? "Frozen synthesis source has an open exception" : "Scoped source exception",
      detail: !knownScope ? "Exception scope is uncertain; execution is conservatively paused." :
        relevant ? "An open exception affects the frozen synthesis lineage; dependent execution is paused." :
          "Only the referenced source is blocked; unrelated synthesis inputs remain eligible."
    });
  }
  return blockers;
};

export const inspectBoundedSynthesis = async (root: string, runId: string) => {
  if (!pathSafeId(runId)) throw new Error("A valid run ID is required.");
  await confined(root, resolve(root, runId));
  const directory = directoryFor(root, runId);
  const artifact = await loadJsonArtifact(resolve(directory, "authorization.json"));
  const parsed = validateSynthesisAuthorization(artifact.value);
  if (!parsed.ok) throw new Error(parsed.error);
  const authorization = parsed.value;
  if (authorization.runId !== runId) throw new Error("Synthesis authorization run identity changed.");
  const receipt = (await loadJsonArtifact(resolve(directory, "authorized.json"))).value;
  if (!isRecord(receipt) || !isDeepStrictEqual(receipt.authorization, artifact.binding) ||
      receipt.actorType !== "human" || receipt.actorId !== authorization.approvedBy ||
      receipt.occurredAt !== authorization.approvedAt || receipt.maxCalls !== authorization.maxCalls) {
    throw new Error("The analyst authorization receipt does not match its frozen authority.");
  }
  await verifyAuthorizationInputs(root, authorization);
  const worker = (await optionalJson(resolve(directory, "worker.lock")))?.value;
  const files = await filesIn(resolve(root, runId, "synthesis"));
  const stages = {} as Record<SynthesisStage, SynthesisStageProgress>;
  for (const stage of SYNTHESIS_STAGES) {
    const stageDir = resolve(directory, stage);
    const prepared = (await optionalJson(resolve(stageDir, "prepared.json")))?.value;
    const reserved = (await optionalJson(resolve(stageDir, "reserved.json")))?.value;
    const saved = await optionalJson(resolve(stageDir, "invocation.json"));
    const validated = (await optionalJson(resolve(stageDir, "validated.json")))?.value;
    const committed = (await optionalJson(resolve(stageDir, "committed.json")))?.value;
    const originalRequest = stage === "build" ? authorization.buildRequest : authorization.challengeRequest;
    const originalRecord = stage === "build" ? authorization.buildRecord : authorization.challengeRecord;
    const request = isRecord(prepared) ? readArtifactBinding(prepared.request) : originalRequest ?? undefined;
    let record = isRecord(committed) ? readArtifactBinding(committed.record) : originalRecord ?? undefined;
    for (const value of [prepared, reserved, validated, committed]) {
      if (value !== undefined && (!isRecord(value) || !isDeepStrictEqual(value.authorization, artifact.binding))) {
        throw new Error(`The ${stage} execution receipt is not bound to its authorization.`);
      }
    }
    if (reserved !== undefined && (!isRecord(reserved) || !isDeepStrictEqual(reserved.request, request) ||
        reserved.model !== authorization.stages[stage].model || reserved.maxCalls !== 1 ||
        authorization.stages[stage].maxCalls !== 1 || !validTime(reserved.reservedAt))) {
      throw new Error(`Invalid ${stage} invocation reservation.`);
    }
    if (originalRequest && !isDeepStrictEqual(request, originalRequest)) {
      throw new Error(`The prepared ${stage} request changed the frozen existing round.`);
    }
    let requestAttempt;
    if (request) {
      await reopenSynthesisBinding(root, request, `${stage} request`);
      requestAttempt = (await optionalJson(resolve(dirname(request.artifactRef), "generation-attempt.json")))?.value;
      if (requestAttempt !== undefined && (!isRecord(requestAttempt) ||
          !isDeepStrictEqual(requestAttempt.authorization, artifact.binding) ||
          !isDeepStrictEqual(requestAttempt.request, request))) {
        if (!record) throw new Error(`The ${stage} request has a different or consumed attempt reservation.`);
      }
    }
    if (saved && (!isRecord(saved.value) || !isDeepStrictEqual(saved.value.authorization, artifact.binding) ||
        !isDeepStrictEqual(saved.value.request, request) || !reserved)) throw new Error(`Invalid saved ${stage} invocation lineage.`);
    if (validated !== undefined && (!saved || !isRecord(validated) ||
        !isDeepStrictEqual(validated.invocation, saved.binding) || !validTime(validated.recordedAt))) {
      throw new Error(`Invalid ${stage} validation receipt.`);
    }
    if (!record && request && saved) {
      const matches = [];
      for (const path of files.filter(path => basename(path) === (stage === "build" ? "synthesis-build-record.json" : "challenge-record.json"))) {
        const candidate = await loadJsonArtifact(path);
        if (isRecord(candidate.value) && isDeepStrictEqual(candidate.value.request, request)) matches.push(candidate.binding);
      }
      if (matches.length > 1) throw new Error(`Multiple committed records exist for the authorized ${stage} request.`);
      record = matches[0];
    }
    if (request) {
      const challenge = stage === "challenge" ? await loadChallengeRequestContext(root, request.artifactRef) : undefined;
      const build = challenge ? challenge.build : await loadBuildRequestContext(root, request.artifactRef);
      if (build.envelope.id !== authorization.buildEnvelopeId ||
          !isDeepStrictEqual(build.envelope.sourceNotes, authorization.sourceNotes) ||
          !isDeepStrictEqual(build.policyArtifact.binding, authorization.policy) ||
          !isDeepStrictEqual(build.outletArtifact.binding, authorization.outlets)) {
        throw new Error(`The ${stage} request expanded or changed frozen synthesis inputs.`);
      }
      if (challenge && !isDeepStrictEqual(challenge.build.recordArtifact.binding, stages.build.record)) {
        throw new Error("Challenge changed the frozen Build round.");
      }
    }
    if (record) {
      await reopenSynthesisBinding(root, record, `${stage} record`);
      if (stage === "build") {
        const context = await loadBuildRecordContext(root, record.artifactRef);
        if (!isDeepStrictEqual(context.requestArtifact.binding, request)) throw new Error("Build commit is not bound to its authorized request.");
      } else {
        const context = await loadChallengeRecordContext(root, record.artifactRef);
        if (!isDeepStrictEqual(context.requestArtifact.binding, request)) throw new Error("Challenge commit is not bound to its authorized request.");
        const metrics = await loadJsonArtifact(resolve(record.artifactRef, "..", "challenge-metrics.json"));
        const adjudication = await loadJsonArtifact(resolve(record.artifactRef, "..", "provisional-adjudication.json"));
        const expected = createProvisionalAdjudication({
          buildRecord: context.build.record, buildRecordArtifact: context.build.recordArtifact.binding,
          challengeRecord: context.record, challengeRecordArtifact: context.recordArtifact.binding,
          createdAt: context.record.recordedAt
        });
        if (!expected.ok || !isDeepStrictEqual(metrics.value, context.record.metrics) ||
            !isDeepStrictEqual(adjudication.value, expected.value)) {
          throw new Error("The recorded Challenge handoff is incomplete or invalid; recovery is required.");
        }
      }
      if (saved) {
        const context = stage === "build" ? await loadBuildRecordContext(root, record.artifactRef)
          : await loadChallengeRecordContext(root, record.artifactRef);
        const response = await loadJsonArtifact(resolve(stageDir, "copilot-response.json"));
        if (!isRecord(saved.value) || !isRecord(reserved) || !isRecord(validated) ||
            !isDeepStrictEqual(context.record.response, response.binding) ||
            context.record.recordedAt !== validated.recordedAt ||
            !isDeepStrictEqual(response.value, invocationProposal(saved.value.raw, authorization.stages[stage].model,
              context.request.id, stage, authorization.approvedBy, context.request.preparedAt, String(reserved.reservedAt)))) {
          throw new Error(`The committed ${stage} does not match its saved and validated invocation.`);
        }
      }
    }
    const ownAttempt = isRecord(requestAttempt) && isDeepStrictEqual(requestAttempt.authorization, artifact.binding);
    stages[stage] = {
      phase: record ? "committed" : validated ? "validated" : saved ? "response-saved" :
        reserved || requestAttempt ? "reserved" : request ? "prepared" : "unused",
      remainingCalls: authorization.stages[stage].maxCalls - Number(Boolean(reserved || ownAttempt)),
      ownerAlive: isRecord(worker) && isRecord(reserved) && worker.id === reserved.workerId && alive(worker.pid),
      ...(request ? { request } : {}), ...(record ? { record } : {})
    };
  }
  const failure = (await optionalJson(resolve(directory, "failure.json")))?.value;
  if (failure !== undefined && (!isRecord(failure) || typeof failure.error !== "string" ||
      typeof failure.phase !== "string" || !(failure.stage === null || SYNTHESIS_STAGES.includes(failure.stage as SynthesisStage)) ||
      !isDeepStrictEqual(failure.authorization, artifact.binding))) throw new Error("Invalid bounded synthesis failure receipt.");
  const facts: SynthesisExecutionFacts = {
    authorization, stages, blockers: await scopedBlockers(root, authorization),
    ...(isRecord(failure) ? { failure: { error: String(failure.error), phase: String(failure.phase),
      stage: failure.stage as SynthesisStage | null } } : {})
  };
  const projection = projectBoundedSynthesis(facts);
  return { ...projection, authorization, authorizationBinding: artifact.binding, directory,
    workerActive: isRecord(worker) && alive(worker.pid) };
};

const prepareStage = async (root: string, execution: Awaited<ReturnType<typeof inspectBoundedSynthesis>>,
  stage: SynthesisStage, effects: SynthesisEffects) => {
  const stageDir = resolve(execution.directory, stage);
  await ensureDirectory(stageDir);
  let output: string;
  if (stage === "build") {
    const sources = await Promise.all(execution.authorization.sourceNotes.map(binding =>
      verifySynthesisSourceAuthority(root, binding, now())));
    const policy = (await loadJsonArtifact(resolve(execution.authorization.policy.artifactRef))).value;
    const outlets = (await loadJsonArtifact(resolve(execution.authorization.outlets.artifactRef))).value;
    const checkedPolicy = validateSynthesisProfilePolicy(policy);
    const checkedOutlets = validateOutletIdentityTable(outlets);
    if (!checkedPolicy.ok || !checkedOutlets.ok) throw new Error("Frozen synthesis policy is invalid.");
    output = (await effects.prepareBuild(root, {
      sources, policy: checkedPolicy.value, policyArtifact: execution.authorization.policy,
      outletIdentityTable: checkedOutlets.value, outletIdentityArtifact: execution.authorization.outlets,
      createdAt: execution.authorization.approvedAt
    }, true)).output;
  } else {
    const record = execution.stages.build.record;
    if (!record) throw new Error("Challenge has no committed Build handoff.");
    const context = await loadBuildRecordContext(root, record.artifactRef);
    const preparedAt = Date.parse(context.record.recordedAt) > Date.parse(execution.authorization.approvedAt)
      ? context.record.recordedAt : execution.authorization.approvedAt;
    output = (await effects.prepareChallenge(root, record.artifactRef, preparedAt, true)).output;
  }
  const request = (await loadJsonArtifact(resolve(output))).binding;
  await writeDurable(resolve(stageDir, "prepared.json"), { authorization: execution.authorizationBinding, request, preparedAt: now() });
};

const invocationProposal = (value: unknown, model: string, requestId: string, stage: SynthesisStage,
  capturedBy: string, preparedAt: string, reservedAt: string) => {
  if (!isRecord(value) || value.provider !== "github-copilot-sdk" || value.model !== model ||
      value.freshSession !== true || typeof value.invocationId !== "string" || !value.invocationId.trim() ||
      !validTime(value.startedAt) || !validTime(value.completedAt) ||
      Date.parse(String(value.startedAt)) < Math.max(Date.parse(preparedAt), Date.parse(reservedAt)) ||
      Date.parse(String(value.completedAt)) < Date.parse(String(value.startedAt)) ||
      Date.parse(String(value.completedAt)) > Date.now() ||
      typeof value.content !== "string" || !value.content.trim()) {
    throw new Error("Model transport returned invalid invocation identity, model, fresh-session provenance or chronology.");
  }
  const cleaned = value.content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  const proposal: unknown = JSON.parse(cleaned);
  return {
    schemaVersion: stage === "build" ? "synthesis-build-copilot-response-v1" : "synthesis-challenge-copilot-response-v1",
    requestId, invocationId: value.invocationId, provider: value.provider, model: value.model,
    freshSession: true, startedAt: value.startedAt, completedAt: value.completedAt, capturedBy, proposal
  };
};

export const runBoundedSynthesis = async (
  root: string, runId: string, mode: "start" | "resume", analyst?: string, injected: Partial<SynthesisEffects> = {}
) => {
  if (!pathSafeId(runId)) throw new Error("A valid run ID is required.");
  await confined(root, resolve(root, runId));
  const effects = { ...defaults, ...injected };
  const directory = directoryFor(root, runId);
  await ensureDirectory(directory);
  const workerPath = resolve(directory, "worker.lock");
  const previous = await optionalJson(workerPath);
  const recoveryPath = resolve(directory, "worker-recovery.lock");
  let recovery = false;
  if (previous) {
    if (!isRecord(previous.value) || alive(previous.value.pid)) {
      return { status: "running", error: "Bounded synthesis already has an exclusive worker.", runId };
    }
    // Preserve stale ownership evidence. A stage reservation still prevents an ambiguous call from being replayed.
    try {
      await writeDurable(recoveryPath, { pid: process.pid, recovering: previous.binding, startedAt: now() });
      recovery = true;
      const current = await optionalJson(workerPath);
      if (!current || !isDeepStrictEqual(current.binding, previous.binding)) {
        await unlink(longPath(recoveryPath));
        return { status: "running", error: "Another worker changed the execution ownership.", runId };
      }
      await rename(longPath(workerPath), longPath(resolve(directory, `interrupted-worker-${randomUUID()}.json`)));
    }
    catch (error) {
      if (recovery) await unlink(longPath(recoveryPath));
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const owner = (await optionalJson(recoveryPath))?.value;
        const active = isRecord(owner) && alive(owner.pid);
        return { status: active ? "running" : "blocked", error: active
          ? "Another worker is resuming this authorization."
          : "Worker recovery was interrupted. Inspect worker-recovery.lock before any further execution.", runId };
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "running", error: "Another worker changed execution ownership.", runId };
      throw error;
    }
  }
  const workerId = randomUUID();
  try { await writeDurable(workerPath, { id: workerId, pid: process.pid, startedAt: now(), runId }); }
  catch (error) {
    if (recovery) await unlink(longPath(recoveryPath));
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "running", error: "Bounded synthesis already has an exclusive worker.", runId };
    throw error;
  }
  if (recovery) await unlink(longPath(recoveryPath));
  let phase = "authorization";
  let stage: SynthesisStage | null = null;
  try {
    const existing = await optionalJson(resolve(directory, "authorization.json"));
    if (!existing) {
      if (mode !== "start") throw new Error("No bounded synthesis authorization exists; use the explicit analyst start action.");
      await freezeAuthorization(root, runId, analyst ?? "", effects);
    }
    for (let step = 0; step < 8; step += 1) {
      const execution = await inspectBoundedSynthesis(root, runId);
      const action = execution.action;
      if (action.kind === "stop") return execution;
      stage = action.stage;
      phase = "preflight";
      await verifyAuthorizationInputs(root, execution.authorization);
      const stageDir = resolve(directory, stage);
      await ensureDirectory(stageDir);
      if (action.kind === "prepare") {
        phase = "handoff-preparation";
        await prepareStage(root, execution, stage, effects);
        continue;
      }
      const binding = execution.stages[stage].request;
      if (!binding) throw new Error("The frozen stage has no prepared request.");
      const context = stage === "build" ? await loadBuildRequestContext(root, binding.artifactRef)
        : await loadChallengeRequestContext(root, binding.artifactRef);
      if (action.kind === "invoke") {
        phase = "model-availability";
        const model = execution.authorization.stages[stage].model;
        if (!(await loadCatalog(effects)).has(model)) throw new Error(`The authorized ${stage} model '${model}' is unavailable; no substitution.`);
        // Recheck inputs and scoped blockers after catalog I/O, immediately before spending authority.
        await verifyAuthorizationInputs(root, execution.authorization);
        const refreshed = await inspectBoundedSynthesis(root, runId);
        if (refreshed.action.kind === "stop") return refreshed;
        if (await requestConsumed(binding.artifactRef)) throw new Error(`The ${stage} request attempt is already consumed; no automatic retry.`);
        const reservation = {
          authorization: execution.authorizationBinding, request: binding, model,
          maxCalls: 1, reservedAt: now(), pid: process.pid, workerId,
          basis: "Consumes this stage allowance even if transport, validation or recording fails. No automatic retry."
        };
        phase = "reservation";
        await writeDurable(resolve(dirname(binding.artifactRef), "generation-attempt.json"), reservation);
        await writeDurable(resolve(stageDir, "reserved.json"), reservation);
        phase = "transport";
        const raw = await effects.runModel({ action: "generate", model, prompt: context.request.prompt });
        phase = "response-persistence";
        await writeDurable(resolve(stageDir, "invocation.json"), {
          authorization: execution.authorizationBinding, request: binding, raw, receivedAt: now()
        });
        continue;
      }
      phase = "output-validation";
      const raw = await loadJsonArtifact(resolve(stageDir, "invocation.json"));
      const reservation = (await loadJsonArtifact(resolve(stageDir, "reserved.json"))).value;
      if (!isRecord(raw.value) || !isRecord(reservation)) throw new Error("Saved invocation receipt is invalid.");
      const responseValue = invocationProposal(raw.value.raw, execution.authorization.stages[stage].model,
        context.request.id, stage, execution.authorization.approvedBy, context.request.preparedAt, String(reservation.reservedAt));
      const responsePath = resolve(stageDir, "copilot-response.json");
      const previousResponse = await optionalJson(responsePath);
      if (previousResponse && !isDeepStrictEqual(previousResponse.value, responseValue)) throw new Error("Saved response does not match the original invocation.");
      if (!previousResponse) await writeDurable(responsePath, responseValue);
      const validatedPath = resolve(stageDir, "validated.json");
      let validated = (await optionalJson(validatedPath))?.value;
      if (!validated) {
        const validationReceipt = { authorization: execution.authorizationBinding, invocation: raw.binding, recordedAt: now() };
        await validateSavedSynthesisResponse(root, stage, binding.artifactRef, responsePath, validationReceipt.recordedAt);
        await writeDurable(validatedPath, validationReceipt);
        validated = validationReceipt;
      }
      if (!isRecord(validated)) throw new Error("Validation receipt is invalid.");
      phase = "recording";
      const record = stage === "build" ? await effects.recordBuild(root, binding.artifactRef, responsePath, String(validated.recordedAt))
        : await effects.recordChallenge(root, binding.artifactRef, responsePath, String(validated.recordedAt));
      phase = "commit-receipt";
      const recorded = (await loadJsonArtifact(resolve(record.output))).binding;
      await writeDurable(resolve(stageDir, "committed.json"), {
        authorization: execution.authorizationBinding, record: recorded, committedAt: now()
      });
    }
    throw new Error("Bounded synthesis exceeded its deterministic step limit.");
  } catch (error) {
    const message = commandError(error);
    const auth = await optionalJson(resolve(directory, "authorization.json"));
    if (auth && !(await optionalJson(resolve(directory, "failure.json")))) {
      await writeDurable(resolve(directory, "failure.json"), {
        authorization: auth.binding, phase, stage, error: message, failedAt: now(), noAutomaticRetry: true
      });
    } else if (!auth) {
      await writeDurable(resolve(directory, `start-blocked-${randomUUID()}.json`), {
        actorType: "human", actorId: analyst ?? null, phase, error: message, occurredAt: now(), maxCallsSpent: 0
      });
    }
    return { status: phase === "preflight" || phase === "authorization" || phase === "model-availability" ? "blocked" : "failed",
      error: `${phase}: ${message}`, runId };
  } finally {
    await unlink(longPath(workerPath));
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, runId, analyst, ...extra] = process.argv.slice(2);
    if (!runId || !["start", "resume", "status"].includes(mode ?? "") || extra.length ||
        (mode !== "start" && analyst)) throw new Error("Usage: npm run run:synthesis -- <start|resume|status> <run-id> [analyst-id]");
    const result = mode === "status" ? await inspectBoundedSynthesis(assuranceRunRoot(), runId)
      : await runBoundedSynthesis(assuranceRunRoot(), runId, mode as "start" | "resume", analyst);
    console.log(`Execution: ${JSON.stringify(result)}`);
    if (["failed", "blocked", "indeterminate"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    const runId = process.argv[3] ?? "invalid-run";
    const message = commandError(error);
    const blocker: WorkflowBlocker = {
      id: "bounded:integrity", kind: "integrity", scope: "run", paths: [], affectedWorkIds: [],
      uncertain: true, title: "Bounded synthesis requires recovery", detail: message
    };
    console.log(`Execution: ${JSON.stringify({
      runId, status: "blocked", error: message,
      workflow: projectWorkflow({
        runId, intentApproved: true, evidenceAvailable: true, committedOutcomes: [],
        readyWork: [], humanDecisions: [], interimCheckpoints: [], blockers: [blocker]
      })
    })}`);
    console.error(`Bounded synthesis failed: ${message}`);
    process.exitCode = 1;
  }
}
