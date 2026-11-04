import { randomUUID } from "node:crypto";
import { readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { isRecord, pathSafeId, validTime } from "../modules/assurance/validators.js";
import { editorialWriterRequest, type EditorialRevision } from "../modules/memo/writer.js";
import { memoRevisionRoute, validateMemoRevisionAuthorization, type MemoRevisionAuthorization } from "../workflow/memo-revision.js";
import { projectWorkflow, type WorkflowProjectionInput } from "../workflow/workflow-projection.js";
import { assuranceRunRoot, commandError, ensureDirectory, loadJsonArtifact, longPath, requireChecksum } from "./assurance-io.js";
import { durableMemoJson as durable, memoWorkerAlive, checkMemoExceptions, memoResponseFrom,
  verifyMemoHandoff, writeMemoHandoff } from "./bounded-memo.js";
import { memoStageRecord, memoWriterRequest, validateMemoRequest } from "./memo-execution-io.js";
import { runLocalCopilot } from "./local-copilot.js";
import { inspectMemoReview, loadMemoDraft } from "./review-memo.js";

const now = () => new Date().toISOString();
const directoryFor = (root: string, runId: string, parent: string) => resolve(root, runId, "memo", "revisions", parent);
const optional = async (path: string) => {
  try { return await loadJsonArtifact(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};
const same = (left: unknown, right: unknown, label: string) => {
  if (!isDeepStrictEqual(left, right)) throw new Error(label);
};
const confine = async (root: string, path: string) => {
  const delta = relative(await realpath(root), await realpath(resolve(path)));
  if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("Revision artifact escapes this run.");
};
const bound = async (run: string, binding: ArtifactBinding) => {
  await confine(run, binding.artifactRef);
  return requireChecksum(await loadJsonArtifact(resolve(binding.artifactRef)), binding.artifactSha256, "Revision artifact");
};
const context = async (root: string, runId: string, parent: string) => {
  const review = await inspectMemoReview(root, runId, parent);
  const route = memoRevisionRoute(review.decision);
  if (!route.eligible || !review.decisionPath || !review.decision) throw new Error(route.reason);
  const draft = await loadMemoDraft(root, runId, parent);
  const decision = (await loadJsonArtifact(resolve(review.decisionPath))).binding;
  const revision: EditorialRevision = { parentMemo: review.target.memo, parentMemoId: parent,
    parentVersion: review.target.memoVersion, decision, feedback: review.decision.feedback!,
    previousDraft: await readFile(longPath(resolve(review.target.markdown.artifactRef)), "utf8") };
  await checkMemoExceptions(root, { ...draft.authority, lineage: draft.input.lineage });
  return { review, draft, revision };
};
const latestIs = async (run: string, allowed: string[]) => {
  const drafts = [];
  for (const entry of await readdir(longPath(resolve(run, "memo")), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Symlinked memo folders require inspection.");
    if (!entry.isDirectory()) continue;
    const memo = (await optional(resolve(run, "memo", entry.name, "memo.json")))?.value;
    if (isRecord(memo) && typeof memo.id === "string" && typeof memo.createdAt === "string") drafts.push(memo);
  }
  drafts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!drafts[0] || !allowed.includes(String(drafts[0].id))) throw new Error("A newer draft exists; review it instead of revising an older memo.");
};
const freeze = async (root: string, runId: string, parent: string, analyst: string) => {
  if (!pathSafeId(analyst)) throw new Error("An explicit analyst must authorize one editorial revision.");
  const { review, draft, revision } = await context(root, runId, parent);
  if (review.target.memoVersion >= 16) throw new Error("Revision depth limit reached; operator inspection required.");
  await latestIs(resolve(root, runId), [parent]);
  const settings = (await loadJsonArtifact(resolve(root, ".copilot-settings.json"))).value;
  if (!isRecord(settings) || typeof settings.model !== "string" ||
      (settings.stages !== undefined && !isRecord(settings.stages))) throw new Error("Save a writer model in Settings first.");
  const override = isRecord(settings.stages) ? settings.stages["memo-writer"] : undefined;
  if (override !== undefined && (!isRecord(override) || override.provider !== "github-copilot-sdk" ||
      typeof override.model !== "string")) throw new Error("Editorial revision requires a Copilot SDK writer model.");
  const model = isRecord(override) ? String(override.model) : settings.model;
  if (!model.trim() || model === "auto") throw new Error("Choose an explicit writer model; no Auto or substitution.");
  const approvedAt = now();
  const request = editorialWriterRequest(memoWriterRequest(draft.authority, draft.input,
    draft.selection.record, draft.selection.binding, approvedAt), revision);
  const requestDirectory = resolve(root, runId, "memo", "requests", request.id);
  await ensureDirectory(requestDirectory);
  await confine(resolve(root, runId), requestDirectory);
  const requestBinding = await durable(resolve(requestDirectory, "writer-request.json"), request);
  const authority: MemoRevisionAuthorization = {
    schemaVersion: "bounded-memo-revision-v1", id: `memo-revision-${randomUUID()}`, runId, parentMemoId: parent,
    target: review.target, decision: revision.decision, request: requestBinding, approvedBy: analyst,
    approvedAt, provider: "github-copilot-sdk", model, maxCalls: 1
  };
  const directory = directoryFor(root, runId, parent);
  await confine(resolve(root, runId), directory);
  const binding = await durable(resolve(directory, "authorization.json"), authority);
  await durable(resolve(directory, "authorized.json"), { authorization: binding, actorType: "human",
    actorId: analyst, occurredAt: approvedAt, decision: "editorial-revision-authorized", maxCalls: 1 });
};

export const inspectMemoRevision = async (root: string, runId: string, parent: string) => {
  if (!pathSafeId(runId) || !pathSafeId(parent)) throw new Error("Valid run and parent memo IDs are required.");
  const run = resolve(root, runId);
  await confine(root, run);
  const directory = directoryFor(root, runId, parent);
  await confine(run, directory);
  const authorityArtifact = await loadJsonArtifact(resolve(directory, "authorization.json"));
  const parsed = validateMemoRevisionAuthorization(authorityArtifact.value);
  if (!parsed.ok || parsed.value.runId !== runId || parsed.value.parentMemoId !== parent ||
      Date.parse(parsed.value.approvedAt) > Date.now()) throw new Error("Invalid revision authorization.");
  const authority = parsed.value;
  same((await loadJsonArtifact(resolve(directory, "authorized.json"))).value,
    { authorization: authorityArtifact.binding, actorType: "human", actorId: authority.approvedBy,
      occurredAt: authority.approvedAt, decision: "editorial-revision-authorized", maxCalls: 1 },
    "Revision human authorization receipt is missing or changed.");
  const input = await context(root, runId, parent);
  same(authority.target, input.review.target, "Revision parent target changed.");
  same(authority.decision, input.revision.decision, "Revision feedback changed.");
  const request = validateMemoRequest("writer", (await bound(run, authority.request)).value, input.draft.authority,
    input.draft.input, input.draft.selection, input.revision);
  const receipt = { authorization: authorityArtifact.binding, request: authority.request };
  const reservation = (await optional(resolve(directory, "reserved.json")))?.value;
  const attempt = (await optional(resolve(dirname(authority.request.artifactRef), "generation-attempt.json")))?.value;
  const invocation = (await optional(resolve(directory, "invocation.json")))?.value;
  const commit = (await optional(resolve(directory, "committed.json")))?.value;
  const failure = (await optional(resolve(directory, "failure.json")))?.value;
  if (reservation !== undefined && (!isRecord(reservation) || !validTime(reservation.reservedAt) ||
      typeof reservation.workerId !== "string")) throw new Error("Invalid revision reservation.");
  if (reservation !== undefined) {
    same({ authorization: reservation.authorization, request: reservation.request }, receipt, "Reservation changed authority.");
    same(attempt, reservation, "Revision request/stage reservations differ.");
    if (reservation.model !== authority.model || reservation.maxCalls !== 1) throw new Error("Reservation model or allowance changed.");
  }
  let response;
  if (invocation !== undefined) {
    if (!isRecord(invocation) || !isRecord(reservation)) throw new Error("Saved revision output has no reservation.");
    same({ authorization: invocation.authorization, request: invocation.request }, receipt, "Invocation changed authority.");
    response = memoResponseFrom(invocation.raw, authority.model, authority.approvedBy, "writer", request, String(reservation.reservedAt));
  }
  let memoId: string | null = null;
  if (commit !== undefined) {
    if (!isRecord(commit) || !isRecord(commit.record) || typeof commit.record.artifactRef !== "string" ||
        typeof commit.record.artifactSha256 !== "string" || !response) throw new Error("Invalid revision commit.");
    same(commit.authorization, authorityArtifact.binding, "Commit changed authority.");
    const record = await bound(run, { artifactRef: commit.record.artifactRef, artifactSha256: commit.record.artifactSha256 });
    const draftId = basename(dirname(record.path));
    const draft = await loadMemoDraft(root, runId, draftId);
    await verifyMemoHandoff(record.binding, draft.record);
    same(draft.record.request, authority.request, "Revision commit used a different request.");
    same((await bound(run, draft.record.response)).value, response, "Revision commit differs from saved output.");
    memoId = draft.record.memo.id;
  }
  const recording = (await optional(resolve(directory, "recording.json")))?.value;
  let pendingMemoId: string | null = null;
  if (response && recording !== undefined) {
    if (!isRecord(recording) || !validTime(recording.recordedAt)) throw new Error("Invalid revision recording time.");
    same(recording.authorization, authorityArtifact.binding, "Recording changed authority.");
    const responseArtifact = await loadJsonArtifact(resolve(directory, "copilot-response.json"));
    same(responseArtifact.value, response, "Recorded response changed saved output.");
    const expected = memoStageRecord("writer", request, authority.request, response, responseArtifact.binding,
      input.draft.input, String(recording.recordedAt), input.draft.selection.record);
    if (!("memo" in expected)) throw new Error("Invalid revision writer result.");
    pendingMemoId = expected.memo.id;
  }
  await latestIs(run, [parent, ...(memoId ? [memoId] : []), ...(pendingMemoId ? [pendingMemoId] : [])]);
  const worker = (await optional(resolve(run, "memo", "execution", "worker.lock")))?.value;
  const workerActive = isRecord(worker) && memoWorkerAlive(worker.pid);
  if (failure !== undefined && (!isRecord(failure) || typeof failure.error !== "string")) throw new Error("Invalid revision failure receipt.");
  if (isRecord(failure)) same(failure.authorization, authorityArtifact.binding, "Failure changed authority.");
  const status = failure ? "blocked" : memoId ? "memo-review" : response ? "response-saved" : reservation || attempt
    ? workerActive && isRecord(reservation) && isRecord(worker) && worker.id === reservation.workerId ? "running" : "indeterminate"
    : "prepared";
  const error = isRecord(failure) ? String(failure.error) : status === "indeterminate"
    ? "An editorial invocation was reserved without saved output. Inspect it; it cannot be replayed." : "";
  const paths = [authority.target.memo.artifactRef, authority.decision.artifactRef, authority.request.artifactRef];
  const human = ["memo-review", "blocked", "indeterminate"].includes(status);
  const work = { id: "bounded:revision", stage: "memo" as const, actor: human ? "human" as const : "machine" as const,
    kind: human ? "checkpoint" as const : "work" as const, surface: "workflow" as const, paths, priority: 100,
    title: memoId ? "Review the revised memo" : human ? "Inspect editorial revision recovery" : "Continue bounded editorial revision",
    detail: error || "One frozen writer call; earlier evidence and judgement decisions remain unchanged. Publication is not authorized.",
    target: { tab: "memo" } };
  const workflowInput: WorkflowProjectionInput = {
    runId, intentApproved: true, evidenceAvailable: true,
    committedOutcomes: memoId ? [{ stage: "memo", paths: [resolve(run, "memo", memoId, "memo.json")] }] : [],
    readyWork: [work], humanDecisions: human ? [{ id: work.id, stage: "memo", paths }] : [],
    interimCheckpoints: human ? [{ id: work.id, stage: "memo", paths }] : [],
    blockers: error ? [{ id: "revision:blocked", kind: "integrity", scope: "work", paths,
      affectedWorkIds: [work.id], uncertain: true, title: "Editorial revision is paused", detail: error }] : []
  };
  return { authorized: true, pipeline: "memo", runId, parentMemoId: parent, status, remainingCalls: reservation || attempt ? 0 : 1,
    error, workflowInput, workflow: projectWorkflow(workflowInput),
    workerActive, memoId, authority, authorization: authorityArtifact.binding, request, input, response, directory };
};

export type RevisionEffects = { runModel: typeof runLocalCopilot; afterReceipt?: (phase: string) => Promise<void> };
export const runMemoRevision = async (root: string, runId: string, parent: string, mode: "start" | "resume",
  analyst?: string, injected: Partial<RevisionEffects> = {}) => {
  if (!pathSafeId(runId) || !pathSafeId(parent)) throw new Error("Valid run and parent memo IDs are required.");
  const run = resolve(root, runId);
  await confine(root, run);
  const directory = directoryFor(root, runId, parent);
  await ensureDirectory(directory);
  await confine(run, directory);
  const workerPath = resolve(run, "memo", "execution", "worker.lock");
  await ensureDirectory(dirname(workerPath));
  await confine(run, dirname(workerPath));
  const previous = await optional(workerPath);
  if (previous) {
    if (!isRecord(previous.value) || memoWorkerAlive(previous.value.pid)) return { status: "running", error: "Memo work already owns this run.", runId };
    const recovery = resolve(dirname(workerPath), "recovery.lock");
    await durable(recovery, { pid: process.pid, previous: previous.binding });
    try {
      same((await loadJsonArtifact(workerPath)).binding, previous.binding, "Memo worker changed during recovery.");
      await rename(longPath(workerPath), longPath(resolve(dirname(workerPath), `interrupted-worker-${randomUUID()}.json`)));
    } finally { await unlink(longPath(recovery)); }
  }
  const workerId = randomUUID();
  try { await durable(workerPath, { pid: process.pid, id: workerId, mode: "editorial-revision", parentMemoId: parent }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "running", error: "Memo worker already owns this run.", runId };
    throw error;
  }
  const effects = { runModel: runLocalCopilot, ...injected };
  let phase = "authorization";
  try {
    if (!(await optional(resolve(directory, "authorization.json")))) {
      if (mode !== "start") throw new Error("Explicit editorial revision start is required.");
      await freeze(root, runId, parent, analyst ?? "");
    }
    let execution = await inspectMemoRevision(root, runId, parent);
    if (execution.status === "prepared") {
      phase = "availability";
      const catalog = await effects.runModel({ action: "models" });
      if (!isRecord(catalog) || !Array.isArray(catalog.models) ||
          !catalog.models.some(row => isRecord(row) && row.id === execution.authority.model)) throw new Error("Frozen writer model is unavailable; no substitution.");
      execution = await inspectMemoRevision(root, runId, parent);
      if (execution.status !== "prepared") return execution;
      const receipt = { authorization: execution.authorization, request: execution.authority.request };
      const reservation = { ...receipt, workerId, model: execution.authority.model, maxCalls: 1, reservedAt: now() };
      phase = "reservation";
      await durable(resolve(dirname(execution.authority.request.artifactRef), "generation-attempt.json"), reservation);
      await durable(resolve(directory, "reserved.json"), reservation);
      await effects.afterReceipt?.("reserved");
      phase = "transport";
      const raw = await effects.runModel({ action: "generate", model: execution.authority.model, prompt: execution.request.prompt });
      phase = "response-persistence";
      await durable(resolve(directory, "invocation.json"), { ...receipt, raw });
      await effects.afterReceipt?.("response-saved");
      execution = await inspectMemoRevision(root, runId, parent);
    }
    if (execution.status === "response-saved") {
      phase = "recording";
      const binding = await durable(resolve(directory, "copilot-response.json"), execution.response, true);
      const timePath = resolve(directory, "recording.json");
      const saved = (await optional(timePath))?.value ?? { authorization: execution.authorization, recordedAt: now() };
      if (!isRecord(saved) || !validTime(saved.recordedAt)) throw new Error("Invalid revision recording time.");
      same(saved.authorization, execution.authorization, "Recording changed authority.");
      await durable(timePath, saved, true);
      const record = memoStageRecord("writer", execution.request, execution.authority.request,
        execution.response, binding, execution.input.draft.input, String(saved.recordedAt), execution.input.draft.selection.record);
      if (!("memo" in record)) throw new Error("Invalid revision writer result.");
      const outputDirectory = resolve(run, "memo", record.memo.id);
      await ensureDirectory(outputDirectory);
      await confine(run, outputDirectory);
      const committed = await writeMemoHandoff(root, runId, record);
      await effects.afterReceipt?.("recorded");
      await durable(resolve(directory, "committed.json"), { authorization: execution.authorization, record: committed }, true);
    }
    return await inspectMemoRevision(root, runId, parent);
  } catch (issue) {
    const error = `${phase}: ${commandError(issue)}`;
    const authority = await optional(resolve(directory, "authorization.json"));
    if (authority && !(await optional(resolve(directory, "failure.json")))) {
      await durable(resolve(directory, "failure.json"), { authorization: authority.binding, phase, error });
    }
    else if (!authority) await durable(resolve(directory, `start-blocked-${randomUUID()}.json`), { error, occurredAt: now() });
    return { status: "blocked", error, runId, parentMemoId: parent };
  } finally { await unlink(longPath(workerPath)); }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, runId, parent, analyst, ...extra] = process.argv.slice(2);
    if (!runId || !parent || extra.length || !["start", "status", "resume"].includes(mode ?? "") ||
        (mode === "start" ? !analyst : !!analyst)) throw new Error("Usage: npm run revise:memo -- start|status|resume <run-id> <parent-memo-id> [analyst-id]");
    const result = mode === "status" ? await inspectMemoRevision(assuranceRunRoot(), runId, parent)
      : await runMemoRevision(assuranceRunRoot(), runId, parent, mode as "start" | "resume", analyst);
    const { input, response, request, ...output } = result as Partial<Awaited<ReturnType<typeof inspectMemoRevision>>>;
    console.log(`Revision: ${JSON.stringify(output)}`);
  } catch (error) { console.error(`Memo revision failed: ${commandError(error)}`); process.exitCode = 1; }
}
