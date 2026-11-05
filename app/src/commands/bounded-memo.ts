import { randomUUID } from "node:crypto";
import { link, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { isRecord, pathSafeId, readArtifactBinding, validTime } from "../modules/assurance/validators.js";
import { validateExceptionItem } from "../modules/exceptions/exception-item.js";
import { renderMemoMarkdown } from "../modules/memo/writer.js";
import { DEFAULT_MEMO_STANDARD_PATH } from "../modules/memo/standard-v1.js";
import { validateSourceDocument } from "../modules/source/source-document.js";
import { validatePerformedAdjudication, type KeyJudgementRecord } from "../modules/synthesis/key-judgement-stage.js";
import { MEMO_STAGES, projectBoundedMemo, validateMemoAuthorization,
  type MemoAuthorization, type MemoProgress, type MemoStage } from "../workflow/bounded-memo.js";
import { projectWorkflow, type WorkflowProjectionInput } from "../workflow/workflow-projection.js";
import { assuranceRunRoot, commandError, ensureDirectory, loadJsonArtifact, longPath, requireChecksum } from "./assurance-io.js";
import { runLocalCopilot } from "./local-copilot.js";
import { isWriterRecord, loadMemoInputs, memoSelectionRequest, memoStageRecord, memoWriterRequest,
  reopenMemoRecord, validateMemoRequest, type MemoInputs } from "./memo-execution-io.js";
import { loadChallengeRecordContext } from "./synthesis-io.js";
import { inspectMemoReview } from "./review-memo.js";
import { memoRelevanceExceptionScope } from "./memo-exception-scope.js";

const now = () => new Date().toISOString();
const directoryFor = (root: string, runId: string) => resolve(root, runId, "memo", "execution");
const repairDirectoryFor = (root: string, runId: string) => resolve(directoryFor(root, runId), "length-repair");
const optional = async (path: string) => {
  try { return await loadJsonArtifact(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};
const same = (left: unknown, right: unknown, message: string) => {
  if (!isDeepStrictEqual(left, right)) throw new Error(message);
};
const confined = async (root: string, path: string) => {
  const delta = relative(await realpath(root), await realpath(resolve(path)));
  if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("Memo artifact escapes its configured root.");
};
const filesIn = async (directory: string): Promise<string[]> => {
  const result = (await Promise.all((await readdir(longPath(directory), { withFileTypes: true })).map(entry => {
    if (entry.isSymbolicLink()) throw new Error("Symlinked run artifacts require operator inspection.");
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }))).flat();
  if (result.length > 10_000) throw new Error("Run exceeds the bounded memo scan limit.");
  return result;
};
export const memoWorkerAlive = (pid: unknown) => {
  if (!Number.isSafeInteger(pid) || Number(pid) < 1) throw new Error("Invalid memo worker ownership.");
  try { process.kill(Number(pid), 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    throw error;
  }
};

// Only complete, flushed files become visible, and an existing destination is never replaced.
export const durableMemoText = async (path: string, text: string, reuse = false) => {
  await ensureDirectory(dirname(path));
  const pending = resolve(dirname(path), `.pending-${randomUUID()}.tmp`);
  const file = await open(longPath(pending), "wx");
  try { await file.writeFile(text, "utf8"); await file.sync(); }
  finally { await file.close(); }
  try { await link(longPath(pending), longPath(path)); }
  catch (error) {
    if (!reuse || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readFile(longPath(path), "utf8") !== text) throw new Error("An immutable memo artifact changed.");
  } finally { await unlink(longPath(pending)); }
};
export const durableMemoJson = async (path: string, value: unknown, reuse = false) => {
  await durableMemoText(path, `${JSON.stringify(value, null, 2)}\n`, reuse);
  return (await loadJsonArtifact(path)).binding;
};
const bound = async (root: string, binding: ArtifactBinding, runId?: string) => {
  await confined(runId ? resolve(root, runId) : root, binding.artifactRef);
  return requireChecksum(await loadJsonArtifact(resolve(binding.artifactRef)), binding.artifactSha256, "Frozen memo artifact");
};
const selectionValue = (value: Awaited<ReturnType<typeof reopenMemoRecord>>) => {
  if (isWriterRecord(value.record)) throw new Error("Expected a selection record.");
  return { record: value.record, binding: value.binding };
};
const consumed = async (request: ArtifactBinding) => (await readdir(longPath(dirname(request.artifactRef))))
  .some(name => name === "generation-attempt.json" || name === "copilot-recorded.json" ||
    /^copilot-(response|invocation).*\.json$/.test(name));

export type MemoEffects = {
  runModel: typeof runLocalCopilot;
  afterReceipt?: (phase: string, stage: MemoStage) => Promise<void>;
};

const modelsFromSettings = async (root: string) => {
  const settings = (await loadJsonArtifact(resolve(root, ".copilot-settings.json"))).value;
  if (!isRecord(settings) || typeof settings.model !== "string" ||
      (settings.stages !== undefined && !isRecord(settings.stages))) throw new Error("Save explicit Copilot models in Settings first.");
  const models = { "key-judgements": "", writer: "" };
  for (const stage of MEMO_STAGES) {
    const settingId = stage === "writer" ? "memo-writer" : stage;
    const override = isRecord(settings.stages) ? settings.stages[settingId] : undefined;
    if (override !== undefined && (!isRecord(override) || override.provider !== "github-copilot-sdk" ||
        typeof override.model !== "string")) throw new Error(`Invalid Settings assignment for ${stage}.`);
    models[stage] = isRecord(override) ? String(override.model) : settings.model;
    if (!models[stage].trim() || models[stage] === "auto") throw new Error(`Choose an explicit ${stage} model; no Auto or substitution.`);
  }
  return models;
};

export const checkMemoExceptions = async (root: string, authority: Pick<MemoAuthorization,
  "runId" | "build" | "challenge" | "adjudication" | "question" | "standard" | "lineage">) => {
  const participants = new Set([authority.build, authority.challenge, authority.adjudication, authority.question,
    authority.standard, ...authority.lineage].map(binding => resolve(binding.artifactRef)));
  const sourceIds = new Set<string>();
  const documents: ArtifactBinding[] = [];
  const snapshots: ArtifactBinding[] = [];
  const collectBindings = async (value: unknown) => {
    if (Array.isArray(value)) { for (const entry of value) await collectBindings(entry); }
    else if (isRecord(value)) {
      if (typeof value.sourceItemId === "string") sourceIds.add(value.sourceItemId);
      const binding = readArtifactBinding(value);
      if (binding) participants.add(resolve(binding.artifactRef));
      for (const entry of Object.values(value)) await collectBindings(entry);
    }
  };
  for (const binding of authority.lineage) {
    const value = (await loadJsonArtifact(binding.artifactRef)).value;
    await collectBindings(value);
    if (isRecord(value) && isRecord(value.lineage)) {
      const document = readArtifactBinding(value.lineage.sourceDocument);
      const snapshot = readArtifactBinding(value.lineage.snapshot);
      if (document) documents.push(document);
      if (snapshot) snapshots.push(snapshot);
    }
  }
  for (const path of (await filesIn(resolve(root, authority.runId))).filter(path => basename(path) === "exception-item.json")) {
    const parsed = validateExceptionItem((await loadJsonArtifact(path)).value);
    if (!parsed.ok || parsed.value.runId !== authority.runId) throw new Error("Exception integrity is uncertain.");
    if (parsed.value.status !== "open") continue;
    let unrelated = parsed.value.refs.length > 0;
    for (const binding of parsed.value.refs) {
      const ref = await bound(root, binding, authority.runId);
      const value = ref.value;
      const local = relative(resolve(root, authority.runId), resolve(binding.artifactRef)).replaceAll("\\", "/");
      const establishedSource = /^sources\//.test(local) && validateSourceDocument(value).ok &&
        isRecord(value) && value.runId === authority.runId && typeof value.sourceItemId === "string" &&
        !sourceIds.has(value.sourceItemId);
      unrelated &&= !participants.has(resolve(binding.artifactRef)) && establishedSource;
    }
    if (!unrelated && !(await memoRelevanceExceptionScope(root, parsed.value, documents, snapshots, participants))) {
      throw new Error(`Open exception ${parsed.value.id} affects memo inputs or has uncertain scope.`);
    }
  }
};

const freeze = async (root: string, runId: string, analyst: string, adjudicationPath?: string) => {
  if (!pathSafeId(analyst)) throw new Error("An explicit analyst ID must authorize selection and writing.");
  const files = await filesIn(resolve(root, runId));
  const choices = adjudicationPath ? [resolve(adjudicationPath)] : files.filter(path => basename(path) === "performed-adjudication.json");
  if (choices.length !== 1) throw new Error("Select exactly one performed adjudication round.");
  await confined(resolve(root, runId), choices[0]!);
  const adjudicationArtifact = await loadJsonArtifact(choices[0]!);
  const adjudication = validatePerformedAdjudication(adjudicationArtifact.value);
  if (!adjudication.ok) throw new Error("Performed human adjudication is required, including checked-zero rounds.");
  const challenge = await loadChallengeRecordContext(root, adjudication.value.challengeRecord.artifactRef);
  const questions = new Map<string, ArtifactBinding>();
  for (const source of challenge.build.sources) questions.set(source.note.lineage.researchQuestion.artifactRef, source.note.lineage.researchQuestion);
  if (questions.size !== 1) throw new Error("Memo inputs must share one approved question.");
  const question = [...questions.values()][0]!;
  const models = await modelsFromSettings(root);
  const authority: MemoAuthorization = {
    schemaVersion: "bounded-memo-authorization-v1", id: `memo-authority-${randomUUID()}`, runId,
    approvedBy: analyst, approvedAt: now(), decision: "bounded-selection-writing-authorized",
    build: challenge.build.recordArtifact.binding, challenge: challenge.recordArtifact.binding,
    adjudication: adjudicationArtifact.binding, question,
    standard: (await loadJsonArtifact(resolve(DEFAULT_MEMO_STANDARD_PATH))).binding, lineage: [],
    stages: {
      "key-judgements": { provider: "github-copilot-sdk", model: models["key-judgements"], maxCalls: 1, request: null, record: null },
      writer: { provider: "github-copilot-sdk", model: models.writer, maxCalls: 1, request: null, record: null }
    }, maxCalls: 2
  };
  const input = await loadMemoInputs(root, authority);
  authority.lineage = input.lineage;
  memoSelectionRequest(authority, input, authority.approvedAt);
  let selection: { record: KeyJudgementRecord; binding: ArtifactBinding } | undefined;
  for (const stage of MEMO_STAGES) {
    const recordName = stage === "writer" ? "writer-record.json" : "key-judgement-record.json";
    const requestName = stage === "writer" ? "writer-request.json" : "key-judgement-request.json";
    const matches = [];
    for (const path of files.filter(path => basename(path) === recordName || basename(path) === requestName)) {
      const artifact = await loadJsonArtifact(path);
      const value = artifact.value;
      if (isRecord(value) && isDeepStrictEqual(value.adjudication, authority.adjudication) &&
          isDeepStrictEqual(value.memoStandard, authority.standard)) matches.push(artifact);
      // Records carry their lineage through the request, rather than a top-level memoStandard.
      else if (basename(path) === recordName && isRecord(value) && isRecord(value.request) && typeof value.request.artifactRef === "string") {
        const request = (await loadJsonArtifact(resolve(value.request.artifactRef))).value;
        if (isRecord(request) && isDeepStrictEqual(request.adjudication, authority.adjudication) &&
            isDeepStrictEqual(request.memoStandard, authority.standard)) matches.push(artifact);
      }
    }
    const records = matches.filter(item => basename(item.binding.artifactRef) === recordName);
    const requests = matches.filter(item => basename(item.binding.artifactRef) === requestName);
    if (records.length > 1 || requests.length > 1) throw new Error(`Multiple existing ${stage} artifacts require operator selection.`);
    const entry = authority.stages[stage];
    if (records[0]) {
      const reopened = await reopenMemoRecord(root, stage, records[0].binding, authority, input, selection);
      entry.record = reopened.binding;
      entry.request = reopened.request;
      entry.maxCalls = 0;
      if (stage === "key-judgements") selection = selectionValue(reopened);
    } else if (requests[0]) {
      validateMemoRequest(stage, requests[0].value, authority, input, selection);
      if (await consumed(requests[0].binding)) throw new Error(`Existing ${stage} attempt is consumed; no refill or automatic retry.`);
      entry.request = requests[0].binding;
    }
    if (stage === "writer" && (entry.record || entry.request) && !selection) throw new Error("Writer has no committed selection.");
  }
  authority.maxCalls = MEMO_STAGES.reduce((sum, stage) => sum + authority.stages[stage].maxCalls, 0);
  for (const binding of [authority.build, authority.challenge, authority.adjudication, authority.question]) await bound(root, binding, runId);
  await checkExceptions(root, authority);
  const directory = directoryFor(root, runId);
  const binding = await durable(resolve(directory, "authorization.json"), authority);
  await durable(resolve(directory, "authorized.json"), { authorization: binding, actorType: "human",
    actorId: analyst, occurredAt: authority.approvedAt, decision: authority.decision, maxCalls: authority.maxCalls });
};

export const memoResponseFrom = (raw: unknown, model: string, actor: string, stage: MemoStage, request: { id: string; preparedAt: string }, reservedAt: string) => {
  if (!isRecord(raw) || raw.provider !== "github-copilot-sdk" || raw.model !== model ||
      raw.freshSession !== true || typeof raw.invocationId !== "string" || !raw.invocationId.trim() ||
      !validTime(raw.startedAt) || !validTime(raw.completedAt) || typeof raw.content !== "string" ||
      Date.parse(String(raw.startedAt)) < Math.max(Date.parse(request.preparedAt), Date.parse(reservedAt)) ||
      Date.parse(String(raw.completedAt)) < Date.parse(String(raw.startedAt)) ||
      Date.parse(String(raw.completedAt)) > Date.now()) throw new Error("Invalid saved model identity, fresh-session provenance or chronology.");
  const proposal: unknown = JSON.parse(raw.content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  return { schemaVersion: stage === "writer" ? "memo-writer-copilot-response-v1" : "key-judgement-copilot-response-v1",
    requestId: request.id, invocationId: raw.invocationId, provider: raw.provider, model: raw.model,
    freshSession: true, startedAt: raw.startedAt, completedAt: raw.completedAt, capturedBy: actor, proposal };
};
const responseFrom = (raw: unknown, authority: MemoAuthorization, stage: MemoStage,
  request: { id: string; preparedAt: string }, reservedAt: string) =>
  memoResponseFrom(raw, authority.stages[stage].model, authority.approvedBy, stage, request, reservedAt);
const alive = memoWorkerAlive;
const durable = durableMemoJson;
const durableText = durableMemoText;
const checkExceptions = checkMemoExceptions;

const loadLengthFailure = async (root: string, runId: string): Promise<{
  authority: MemoAuthorization; input: MemoInputs; selection: { record: KeyJudgementRecord; binding: ArtifactBinding }; failedAt: string;
  origin: NonNullable<MemoAuthorization["lengthRepair"]>;
}> => {
  const execution = await inspectBoundedMemo(root, runId, true);
  const directory = directoryFor(root, runId);
  const requestBinding = execution.stages.writer.request;
  if (execution.authority.lengthRepair || execution.status !== "blocked" ||
      execution.error !== 'recording: Writer response rejected: "MEMO_TOO_LONG"' ||
      !requestBinding || !execution.selection || execution.stages.writer.record ||
      execution.stages.writer.phase !== "response-saved" || execution.remainingCalls !== 0) {
    throw new Error("Only a saved original MEMO_TOO_LONG writer failure can receive one length repair.");
  }
  const failure = await loadJsonArtifact(resolve(directory, "failure.json"));
  if (!isRecord(failure.value) || failure.value.stage !== "writer" || failure.value.phase !== "recording" ||
      typeof failure.value.occurredAt !== "string" || !validTime(failure.value.occurredAt) ||
      Date.parse(failure.value.occurredAt) > Date.now()) throw new Error("Length failure receipt is incomplete.");
  const request = validateMemoRequest("writer", (await bound(root, requestBinding, runId)).value,
    execution.authority, execution.input, execution.selection);
  const response = await loadJsonArtifact(resolve(directory, "writer", "copilot-response.json"));
  const invocation = (await loadJsonArtifact(resolve(directory, "writer", "invocation.json"))).value;
  const reserved = (await loadJsonArtifact(resolve(directory, "writer", "reserved.json"))).value;
  const recording = (await loadJsonArtifact(resolve(directory, "writer", "recording.json"))).value;
  if (!isRecord(invocation) || !isRecord(reserved) || !isRecord(recording) || !validTime(recording.recordedAt)) {
    throw new Error("Saved length failure has incomplete writer receipts.");
  }
  same(recording.authorization, execution.authorizationBinding, "Failed recording changed authority.");
  if (Date.parse(failure.value.occurredAt) < Date.parse(String(recording.recordedAt))) {
    throw new Error("Length failure predates its saved recording.");
  }
  same(response.value, responseFrom(invocation.raw, execution.authority, "writer", request, String(reserved.reservedAt)),
    "Saved failed response differs from its invocation.");
  let tooLong = false;
  try {
    memoStageRecord("writer", request, requestBinding, response.value, response.binding, execution.input,
      String(recording.recordedAt), execution.selection.record);
  } catch (issue) {
    if (commandError(issue) !== 'Writer response rejected: "MEMO_TOO_LONG"') throw issue;
    tooLong = true;
  }
  if (!tooLong) throw new Error("Saved writer response no longer reconstructs a length failure.");
  return { authority: execution.authority, input: execution.input, selection: execution.selection, failedAt: failure.value.occurredAt,
    origin: { authorization: execution.authorizationBinding, request: requestBinding,
      response: response.binding, failure: failure.binding } };
};

const freezeLengthRepair = async (root: string, runId: string, analyst: string) => {
  if (!pathSafeId(analyst)) throw new Error("An explicit analyst must authorize one writer-only length repair.");
  const original = await loadLengthFailure(root, runId);
  const approvedAt = now();
  const request = memoWriterRequest(original.authority, original.input, original.selection.record,
    original.selection.binding, approvedAt);
  const requestDirectory = resolve(root, runId, "memo", "requests", request.id);
  await ensureDirectory(requestDirectory);
  await confined(resolve(root, runId), requestDirectory);
  const requestBinding = await durable(resolve(requestDirectory, "writer-request.json"), request);
  const authority: MemoAuthorization = {
    ...original.authority, id: `memo-length-repair-${randomUUID()}`, approvedBy: analyst, approvedAt,
    decision: "bounded-length-repair-authorized", lengthRepair: original.origin, maxCalls: 1,
    stages: {
      "key-judgements": { ...original.authority.stages["key-judgements"], maxCalls: 0,
        request: original.selection.record.request, record: original.selection.binding },
      writer: { ...original.authority.stages.writer, maxCalls: 1, request: requestBinding, record: null }
    }
  };
  const directory = repairDirectoryFor(root, runId);
  const binding = await durable(resolve(directory, "authorization.json"), authority);
  await durable(resolve(directory, "authorized.json"), { authorization: binding, actorType: "human",
    actorId: analyst, occurredAt: approvedAt, decision: authority.decision, maxCalls: 1 });
};

export const writeMemoHandoff = async (root: string, runId: string, record: ReturnType<typeof memoStageRecord>) => {
  if (!isWriterRecord(record)) return durable(resolve(root, runId, "synthesis", "key-judgements", "records",
    record.id, "key-judgement-record.json"), record, true);
  const directory = resolve(root, runId, "memo", record.memo.id);
  const binding = await durable(resolve(directory, "writer-record.json"), record, true);
  await durable(resolve(directory, "memo.json"), record.memo, true);
  await durableText(resolve(directory, "memo.md"), renderMemoMarkdown(record.memo), true);
  await durable(resolve(directory, "verification.json"), record.verification, true);
  await durable(resolve(directory, "publication-gate.json"), {
    schemaVersion: "memo-publication-gate-v1", memoId: record.memo.id, checkedAt: record.recordedAt,
    status: "blocked", reasons: record.verification.blockers, humanApprovalAvailable: false
  }, true);
  return binding;
};

export const verifyMemoHandoff = async (binding: ArtifactBinding, record: ReturnType<typeof memoStageRecord>) => {
  if (!isWriterRecord(record)) return;
  const directory = dirname(binding.artifactRef);
  for (const [file, expected] of [["memo.json", record.memo], ["verification.json", record.verification],
    ["publication-gate.json", { schemaVersion: "memo-publication-gate-v1", memoId: record.memo.id,
      checkedAt: record.recordedAt, status: "blocked", reasons: record.verification.blockers, humanApprovalAvailable: false }]] as const) {
    same((await loadJsonArtifact(resolve(directory, file))).value, expected, "Memo review handoff is incomplete or changed.");
  }
  same(await readFile(longPath(resolve(directory, "memo.md")), "utf8"), renderMemoMarkdown(record.memo), "Memo rendering changed.");
};
const writeHandoff = writeMemoHandoff;
const verifyHandoff = verifyMemoHandoff;

export const inspectBoundedMemo = async (root: string, runId: string, originalOnly = false) => {
  if (!pathSafeId(runId)) throw new Error("A valid run ID is required.");
  await confined(root, resolve(root, runId));
  const directory = !originalOnly && await optional(resolve(repairDirectoryFor(root, runId), "authorization.json"))
    ? repairDirectoryFor(root, runId) : directoryFor(root, runId);
  await confined(resolve(root, runId), directory);
  const artifact = await loadJsonArtifact(resolve(directory, "authorization.json"));
  const parsed = validateMemoAuthorization(artifact.value);
  if (!parsed.ok || parsed.value.runId !== runId || Date.parse(parsed.value.approvedAt) > Date.now()) throw new Error("Invalid frozen memo authorization.");
  const authority = parsed.value;
  const receipt = (await loadJsonArtifact(resolve(directory, "authorized.json"))).value;
  same(receipt, { authorization: artifact.binding, actorType: "human", actorId: authority.approvedBy,
    occurredAt: authority.approvedAt, decision: authority.decision, maxCalls: authority.maxCalls }, "Memo human authority receipt changed.");
  if (authority.lengthRepair) {
    if (directory !== repairDirectoryFor(root, runId)) throw new Error("Use the unique length-repair authorization.");
    const original = await loadLengthFailure(root, runId);
    same(authority.lengthRepair, original.origin, "Length repair changed the original failure or saved response.");
    for (const key of ["build", "challenge", "adjudication", "question", "standard", "lineage"] as const) {
      same(authority[key], original.authority[key], "Length repair changed its frozen evidence or policy.");
    }
    same(authority.stages["key-judgements"].record, original.selection.binding, "Length repair changed selection.");
    for (const stage of MEMO_STAGES) {
      same(authority.stages[stage].model, original.authority.stages[stage].model, "Length repair changed a frozen model.");
    }
    if (Date.parse(authority.approvedAt) < Date.parse(original.failedAt)) {
      throw new Error("Length repair must follow the original failure.");
    }
  } else if (directory === repairDirectoryFor(root, runId)) throw new Error("Length repair lacks explicit repair authority.");
  for (const binding of [authority.build, authority.challenge, authority.adjudication, authority.question]) await bound(root, binding, runId);
  const input = await loadMemoInputs(root, authority);
  same(input.lineage, authority.lineage, "Frozen evidence lineage changed.");
  const worker = (await optional(resolve(directoryFor(root, runId), "worker.lock")))?.value;
  const workerActive = isRecord(worker) && alive(worker.pid);
  const stages = {} as Record<MemoStage, MemoProgress>;
  let selection: { record: KeyJudgementRecord; binding: ArtifactBinding } | undefined;
  for (const stage of MEMO_STAGES) {
    const stageDir = resolve(directory, stage);
    const entry = authority.stages[stage];
    const prepared = (await optional(resolve(stageDir, "prepared.json")))?.value;
    const reserved = (await optional(resolve(stageDir, "reserved.json")))?.value;
    const invocation = (await optional(resolve(stageDir, "invocation.json")))?.value;
    const committed = (await optional(resolve(stageDir, "committed.json")))?.value;
    for (const value of [prepared, reserved, invocation, committed]) {
      if (value !== undefined && (!isRecord(value) || !isDeepStrictEqual(value.authorization, artifact.binding))) throw new Error("Memo receipt has different authority.");
    }
    const request = isRecord(prepared) ? readArtifactBinding(prepared.request) : entry.request ?? undefined;
    const record = isRecord(committed) ? readArtifactBinding(committed.record) : entry.record ?? undefined;
    if (prepared && !request || committed && !record) throw new Error("Invalid memo stage binding.");
    if (entry.request) same(request, entry.request, "Frozen existing request changed.");
    let attempt;
    let parsedRequest;
    if (request) {
      const loaded = await bound(root, request, runId);
      parsedRequest = validateMemoRequest(stage, loaded.value, authority, input, selection);
      if (authority.lengthRepair && stage === "writer" &&
          (!("wordBudget" in parsedRequest) || !parsedRequest.wordBudget ||
           isDeepStrictEqual(request, authority.lengthRepair.request))) throw new Error("Length repair requires a fresh budgeted writer request.");
      attempt = (await optional(resolve(dirname(request.artifactRef), "generation-attempt.json")))?.value;
      if (attempt !== undefined && !entry.record) {
        if (!isRecord(attempt)) throw new Error("Invalid request reservation.");
        same(attempt.authorization, artifact.binding, "Request has a different consumed attempt.");
        same(attempt.request, request, "Request attempt changed.");
      }
    }
    if (reserved !== undefined) {
      if (!isRecord(reserved) || !request || !validTime(reserved.reservedAt) ||
          reserved.model !== entry.model || reserved.maxCalls !== 1 || entry.maxCalls !== 1) throw new Error("Invalid memo reservation.");
      same(reserved.request, request, "Reservation changed request.");
      same(attempt, reserved, "Exclusive request and stage reservations disagree.");
    }
    if (invocation !== undefined) {
      if (!isRecord(invocation) || !reserved || !parsedRequest || !isRecord(reserved)) throw new Error("Saved invocation has no reservation.");
      same(invocation.request, request, "Saved invocation changed request.");
      responseFrom(invocation.raw, authority, stage, parsedRequest, String(reserved.reservedAt));
    }
    if (record) {
      await bound(root, record, runId);
      const loaded = await reopenMemoRecord(root, stage, record, authority, input, selection);
      same(loaded.request, request, "Commit changed its authorized request.");
      if (invocation && isRecord(invocation) && isRecord(reserved) && parsedRequest) {
        const response = await loadJsonArtifact(resolve(stageDir, "copilot-response.json"));
        same(response.value, responseFrom(invocation.raw, authority, stage, parsedRequest, String(reserved.reservedAt)),
          "Committed response differs from saved invocation.");
        same(loaded.record.response, response.binding, "Commit did not use the bounded response.");
      } else if (!entry.record) throw new Error("New commit has no invocation provenance.");
      await verifyHandoff(record, loaded.record);
      if (stage === "key-judgements") selection = selectionValue(loaded);
    }
    stages[stage] = { phase: record ? "committed" : invocation ? "response-saved" : reserved || attempt ? "reserved" : request ? "prepared" : "unused",
      remainingCalls: entry.maxCalls - Number(Boolean(reserved || attempt) && !entry.record),
      ownerAlive: Boolean(workerActive && isRecord(worker) && isRecord(reserved) && worker.id === reserved.workerId),
      ...(request ? { request } : {}), ...(record ? { record } : {}) };
  }
  const failure = (await optional(resolve(directory, "failure.json")))?.value;
  let error: string | undefined;
  if (failure !== undefined) {
    if (!isRecord(failure) || typeof failure.error !== "string") throw new Error("Invalid memo failure receipt.");
    same(failure.authorization, artifact.binding, "Failure receipt changed authority.");
    error = failure.error;
  }
  try { await checkExceptions(root, authority); }
  catch (issue) { error = commandError(issue); }
  const projection = projectBoundedMemo({ stages, workerActive, ...(error ? { error } : {}) });
  const writerBinding = stages.writer.record;
  const review = writerBinding && await optional(resolve(dirname(writerBinding.artifactRef), "review", "decision.json"))
    ? await inspectMemoReview(root, runId, basename(dirname(writerBinding.artifactRef))) : null;
  const paths = [authority.adjudication.artifactRef, ...MEMO_STAGES.flatMap(stage =>
    [stages[stage].request?.artifactRef, stages[stage].record?.artifactRef].filter((path): path is string => Boolean(path)))];
  const human = projection.action === "stop" && projection.status !== "running";
  const work = { id: "bounded:memo", stage: "memo" as const, actor: human ? "human" as const : "machine" as const,
    kind: human ? "checkpoint" as const : "work" as const, surface: "workflow" as const,
    title: review?.decision ? review.decision.decision === "revision-requested" ? "Memo revision requested" : "Memo rejected" :
      review?.decisionStatus === "stale" ? "Inspect stale memo decision" :
      projection.status === "memo-review" ? "Review the memo draft" : human ? "Inspect bounded memo recovery" : "Continue bounded memo",
    detail: projection.error || (review?.decision
      ? "The human decision is recorded. A new draft requires separately authorized work; publication remains blocked."
      : "Only frozen selection and writing are authorized. Publication is a separate human decision."),
    paths, priority: 100, target: { tab: projection.status === "memo-review" ? "memo" : "synthesis", focus: "gate" } };
  const workflowInput: WorkflowProjectionInput = {
    runId, intentApproved: true, evidenceAvailable: true,
    committedOutcomes: MEMO_STAGES.filter(stage => stages[stage].record).map(stage => ({ stage: "memo", paths: [stages[stage].record!.artifactRef] })),
    readyWork: [work], humanDecisions: human ? [{ id: work.id, stage: "memo", paths }] : [],
    interimCheckpoints: human ? [{ id: work.id, stage: "memo", paths }] : [],
    blockers: error ? [{ id: "bounded:memo-integrity", kind: "integrity", scope: "work", paths,
      affectedWorkIds: [work.id], uncertain: true, title: "Bounded memo is paused", detail: error }] : []
  };
  return { ...projection, workflow: projectWorkflow(workflowInput), workflowInput,
    runId, pipeline: "memo", authority, authorizationBinding: artifact.binding, stages, workerActive, directory,
    maxCalls: authority.maxCalls, input, selection, memoReview: review };
};

export const runBoundedMemo = async (root: string, runId: string, mode: "start" | "resume" | "repair",
  analyst?: string, adjudicationPath?: string, injected: Partial<MemoEffects> = {}) => {
  if (!pathSafeId(runId)) throw new Error("A valid run ID is required.");
  await confined(root, resolve(root, runId));
  const effects = { runModel: runLocalCopilot, ...injected };
  const directory = mode === "repair" || await optional(resolve(repairDirectoryFor(root, runId), "authorization.json"))
    ? repairDirectoryFor(root, runId) : directoryFor(root, runId);
  await ensureDirectory(directory);
  await confined(resolve(root, runId), directory);
  const workerPath = resolve(directoryFor(root, runId), "worker.lock");
  await ensureDirectory(dirname(workerPath));
  const workerId = randomUUID();
  const previous = await optional(workerPath);
  if (previous) {
    if (!isRecord(previous.value) || alive(previous.value.pid)) return { status: "running", runId, error: "Memo worker already owns this run." };
    const recovery = resolve(dirname(workerPath), "recovery.lock");
    try { await durable(recovery, { pid: process.pid, previous: previous.binding }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "blocked", runId, error: "Worker recovery already reserved; inspect recovery.lock." };
      throw error;
    }
    try {
      same((await optional(workerPath))?.binding, previous.binding, "Worker changed during recovery.");
      await rename(longPath(workerPath), longPath(resolve(dirname(workerPath), `interrupted-worker-${randomUUID()}.json`)));
    } finally { await unlink(longPath(recovery)); }
  }
  try { await durable(workerPath, { pid: process.pid, id: workerId, startedAt: now() }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "running", runId, error: "Memo worker already owns this run." };
    throw error;
  }
  let phase = "authorization";
  let stage: MemoStage | null = null;
  try {
    if (!(await optional(resolve(directory, "authorization.json")))) {
      if (mode === "repair") await freezeLengthRepair(root, runId, analyst ?? "");
      else {
        if (mode !== "start") throw new Error("Explicit bounded memo start is required.");
        await freeze(root, runId, analyst ?? "", adjudicationPath);
      }
    }
    for (let step = 0; step < 8; step += 1) {
      phase = "preflight";
      const execution = await inspectBoundedMemo(root, runId);
      if (execution.action === "stop") return execution;
      stage = execution.stage;
      const stageDir = resolve(directory, stage);
      const authority = execution.authority;
      const receipt = { authorization: execution.authorizationBinding };
      const entry = execution.stages[stage];
      if (execution.action === "prepare") {
        phase = "preparation";
        const request = stage === "key-judgements" ? memoSelectionRequest(authority, execution.input, authority.approvedAt)
          : memoWriterRequest(authority, execution.input, execution.selection!.record, execution.selection!.binding, now());
        // Writer preparation time is journalled before publication so restart cannot create a fresh request.
        const proposalPath = resolve(stageDir, "preparation.json");
        const saved = await optional(proposalPath);
        const value = saved?.value ?? request;
        validateMemoRequest(stage, value, authority, execution.input, execution.selection);
        if (!saved) await durable(proposalPath, value);
        if (!isRecord(value) || typeof value.id !== "string") throw new Error("Invalid saved request preparation.");
        const requestPath = stage === "key-judgements"
          ? resolve(root, runId, "synthesis", "key-judgements", "requests", value.id, "key-judgement-request.json")
          : resolve(root, runId, "memo", "requests", value.id, "writer-request.json");
        const binding = await durable(requestPath, value, true);
        await durable(resolve(stageDir, "prepared.json"), { ...receipt, request: binding }, true);
        continue;
      }
      const binding = entry.request;
      if (!binding) throw new Error("Stage has no frozen request.");
      const request = validateMemoRequest(stage, (await bound(root, binding, runId)).value, authority, execution.input, execution.selection);
      if (execution.action === "invoke") {
        phase = "model-availability";
        const model = authority.stages[stage].model;
        const catalog = await effects.runModel({ action: "models" });
        if (!isRecord(catalog) || !Array.isArray(catalog.models) ||
            !catalog.models.some(value => isRecord(value) && value.id === model)) throw new Error(`Frozen ${stage} model is unavailable; no substitution.`);
        const refreshed = await inspectBoundedMemo(root, runId);
        if (refreshed.action !== "invoke") return refreshed;
        if (await consumed(binding)) throw new Error("Request already has an attempt or saved answer; no automatic retry.");
        phase = "reservation";
        const reservation = { ...receipt, request: binding, model, maxCalls: 1, workerId, reservedAt: now() };
        await durable(resolve(dirname(binding.artifactRef), "generation-attempt.json"), reservation);
        await durable(resolve(stageDir, "reserved.json"), reservation);
        await effects.afterReceipt?.("reserved", stage);
        phase = "transport";
        const raw = await effects.runModel({ action: "generate", model, prompt: request.prompt });
        phase = "response-persistence";
        await durable(resolve(stageDir, "invocation.json"), { ...receipt, request: binding, raw });
        await effects.afterReceipt?.("response-saved", stage);
        continue;
      }
      phase = "recording";
      const invocation = (await loadJsonArtifact(resolve(stageDir, "invocation.json"))).value;
      const reservation = (await loadJsonArtifact(resolve(stageDir, "reserved.json"))).value;
      if (!isRecord(invocation) || !isRecord(reservation)) throw new Error("Invalid saved invocation.");
      const response = responseFrom(invocation.raw, authority, stage, request, String(reservation.reservedAt));
      const responseBinding = await durable(resolve(stageDir, "copilot-response.json"), response, true);
      const timePath = resolve(stageDir, "recording.json");
      const savedTime = (await optional(timePath))?.value;
      const timestamp = savedTime ?? { ...receipt, recordedAt: now() };
      if (!isRecord(timestamp) || !validTime(timestamp.recordedAt)) throw new Error("Invalid recording receipt.");
      same(timestamp.authorization, receipt.authorization, "Recording changed authority.");
      if (!savedTime) await durable(timePath, timestamp);
      const record = memoStageRecord(stage, request, binding, response, responseBinding, execution.input,
        String(timestamp.recordedAt), execution.selection?.record);
      const committed = await writeHandoff(root, runId, record);
      await effects.afterReceipt?.("recorded", stage);
      await durable(resolve(stageDir, "committed.json"), { ...receipt, record: committed }, true);
    }
    throw new Error("Bounded memo exceeded its deterministic step limit.");
  } catch (issue) {
    const error = `${phase}: ${commandError(issue)}`;
    const authorization = await optional(resolve(directory, "authorization.json"));
    if (authorization && !(await optional(resolve(directory, "failure.json")))) {
      await durable(resolve(directory, "failure.json"), { authorization: authorization.binding, phase, stage, error, occurredAt: now() });
    } else if (!authorization) {
      await durable(resolve(directory, `start-blocked-${randomUUID()}.json`), { error, occurredAt: now(), actorId: analyst ?? null });
    }
    return { status: "blocked", error, runId };
  } finally { await unlink(longPath(workerPath)); }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, runId, analyst, adjudication, ...extra] = process.argv.slice(2);
    if (!runId || !["start", "resume", "status", "repair"].includes(mode ?? "") || extra.length ||
        (mode === "repair" ? !analyst || !!adjudication : mode !== "start" && (analyst || adjudication))) {
      throw new Error("Usage: npm run run:memo -- <start|resume|status|repair> <run-id> [analyst-id] [performed-adjudication.json]");
    }
    const execution = mode === "status" ? await inspectBoundedMemo(assuranceRunRoot(), runId)
      : await runBoundedMemo(assuranceRunRoot(), runId, mode as "start" | "resume" | "repair", analyst, adjudication);
    const presentation = Object.fromEntries(Object.entries(execution).filter(([key]) => key !== "input" && key !== "selection"));
    console.log(`Execution: ${JSON.stringify(presentation)}`);
    if (["blocked", "indeterminate"].includes(execution.status)) process.exitCode = 1;
  } catch (error) {
    console.log(`Execution: ${JSON.stringify({ status: "blocked", error: commandError(error), runId: process.argv[3] })}`);
    process.exitCode = 1;
  }
}
