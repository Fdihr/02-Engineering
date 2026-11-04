import { randomUUID } from "node:crypto";
import { link, open, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { isRecord, pathSafeId, sha256Text } from "../modules/assurance/validators.js";
import { createBoundMemoDecision, validateSupportCalibrationPolicy,
  type MemoReviewTarget } from "../modules/memo/publication.js";
import { renderMemoMarkdown, validateBoundedWriterRequest } from "../modules/memo/writer.js";
import { validateKeyJudgementRecord } from "../modules/synthesis/key-judgement-stage.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import { assuranceRunRoot, artifactRef, commandError, ensureDirectory, loadJsonArtifact,
  loadRunArtifact, longPath, requireChecksum, sha256 } from "./assurance-io.js";
import { isWriterRecord, loadMemoInputs, reopenMemoRecord } from "./memo-execution-io.js";

const policyPath = resolve("src/modules/memo/standards/support-calibration-policy-v1.json");
const optional = async (path: string) => {
  try { return await loadJsonArtifact(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};

export const inspectMemoReview = async (root: string, runId: string, memoId: string) => {
  if (!pathSafeId(runId) || !pathSafeId(memoId)) throw new Error("Valid run and memo IDs are required.");
  const run = resolve(root, runId);
  const runDelta = relative(await realpath(root), await realpath(run));
  if (runDelta.startsWith("..") || isAbsolute(runDelta)) throw new Error("Memo run escapes the configured root.");
  const directory = resolve(run, "memo", memoId);
  const confine = async (path: string) => {
    const delta = relative(await realpath(run), await realpath(path));
    if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("Memo review escapes the configured root.");
  };
  await confine(directory);
  const files = await Promise.all(["memo.json", "writer-record.json", "verification.json", "publication-gate.json"]
    .map(async name => { const path = resolve(directory, name); await confine(path); return loadJsonArtifact(path); }));
  const [memo, writer, verification, gate] = files;
  if (!memo || !writer || !verification || !gate || !isRecord(writer.value) ||
      !isRecord(writer.value.request) || typeof writer.value.request.artifactRef !== "string" ||
      typeof writer.value.request.artifactSha256 !== "string") throw new Error("Memo handoff is incomplete.");
  const request = requireChecksum(await loadRunArtifact(root, writer.value.request.artifactRef, "Writer request"),
    writer.value.request.artifactSha256, "Writer request");
  const parsed = validateBoundedWriterRequest(request.value);
  if (!parsed.ok || parsed.value.runId !== runId) {
    throw new Error("Only reconstructable writer v2 drafts support version-bound review; historical drafts remain read-only.");
  }
  const authority = { runId, build: parsed.value.buildRecord, challenge: parsed.value.challengeRecord,
    adjudication: parsed.value.adjudication, question: parsed.value.approvedQuestion, standard: parsed.value.memoStandard };
  const input = await loadMemoInputs(root, authority);
  const selection = await reopenMemoRecord(root, "key-judgements", parsed.value.keyJudgementRecord, authority, input);
  const selected = validateKeyJudgementRecord(selection.record);
  if (!selected.ok) throw new Error("Invalid key-judgement record.");
  const reopened = await reopenMemoRecord(root, "writer", writer.binding, authority, input,
    { record: selected.value, binding: selection.binding });
  if (!isWriterRecord(reopened.record)) throw new Error("Invalid writer record.");
  const record = reopened.record;
  if (record.memo.id !== memoId || record.runId !== runId ||
      !isDeepStrictEqual(memo.value, record.memo) ||
      !isDeepStrictEqual(verification.value, record.verification) ||
      !isDeepStrictEqual(gate.value, {
        schemaVersion: "memo-publication-gate-v1", memoId, checkedAt: record.recordedAt,
        status: "blocked", reasons: record.verification.blockers, humanApprovalAvailable: false
      })) throw new Error("Memo, verification or publication gate differs from its recorded output.");
  const markdownPath = resolve(directory, "memo.md");
  await confine(markdownPath);
  const markdown = await readFile(longPath(markdownPath));
  if (markdown.toString("utf8") !== renderMemoMarkdown(record.memo)) throw new Error("Memo Markdown changed; restore or produce a new draft before review.");
  const policyArtifact = await loadJsonArtifact(policyPath);
  const policy = validateSupportCalibrationPolicy(policyArtifact.value);
  if (!policy.ok) throw new Error("Invalid support calibration policy.");
  const target: MemoReviewTarget = { runId, memoId, memoVersion: record.memo.version,
    memo: memo.binding, markdown: { artifactRef: artifactRef(markdownPath), artifactSha256: sha256(markdown) },
    writer: writer.binding, verification: verification.binding, gate: gate.binding,
    calibrationPolicy: policyArtifact.binding };
  const samples: Array<{ observationId: string; text: string; quote: string; sourceNoteId: string }> = [];
  for (const binding of input.lineage.slice(3)) {
    const note = validateSynthesisSourceNote(requireChecksum(
      await loadRunArtifact(root, binding.artifactRef, "Source note"), binding.artifactSha256, "Source note").value);
    if (!note.ok) throw new Error("Invalid source note.");
    for (const observation of note.value.inScopeObservations) {
      samples.push({ observationId: observation.observationId, text: observation.text,
        quote: observation.quote, sourceNoteId: note.value.id });
    }
  }
  if (new Set(samples.map(row => row.observationId)).size !== samples.length) throw new Error("Sample observation IDs are ambiguous.");
  samples.sort((a, b) => sha256Text(`${memo.binding.artifactSha256}:${a.observationId}`)
    .localeCompare(sha256Text(`${memo.binding.artifactSha256}:${b.observationId}`)));
  const selectedSamples = samples.slice(0, policy.value.sampleSizePerMemo);
  const approvalBlockers = [...record.verification.blockers, "PUBLICATION_GATE_BLOCKED"];
  if (selectedSamples.length < policy.value.sampleSizePerMemo) approvalBlockers.push("INSUFFICIENT_CALIBRATION_SAMPLE");
  const existing = await optional(resolve(directory, "review", "decision.json"));
  let decision = null;
  let decisionStatus = "pending";
  if (existing) {
    if (!isRecord(existing.value) || typeof existing.value.decidedAt !== "string" ||
        !Number.isFinite(Date.parse(existing.value.decidedAt)) ||
        Date.parse(existing.value.decidedAt) < Date.parse(record.recordedAt) ||
        Date.parse(existing.value.decidedAt) > Date.now()) throw new Error("Invalid memo review receipt chronology.");
    const value = existing.value;
    if (!isDeepStrictEqual(value.target, target)) {
      decisionStatus = "stale";
    } else {
      const checked = createBoundMemoDecision({
        submitted: { target: value.target, reviewerId: value.reviewerId, decision: value.decision,
          issueType: value.issueType, feedback: value.feedback, sampledVerdicts: value.sampledVerdicts,
          drillDownVerdicts: value.drillDownVerdicts },
        target, selectedObservationIds: selectedSamples.map(row => row.observationId), approvalBlockers,
        decidedAt: existing.value.decidedAt
      });
      if (!checked.ok || !isDeepStrictEqual(checked.value, value)) throw new Error("Memo review receipt does not validate.");
      decision = checked.value;
      decisionStatus = "recorded";
    }
  }
  return { target, draftCreatedAt: record.memo.createdAt, sampleSize: policy.value.sampleSizePerMemo,
    samples: selectedSamples, approvalBlockers, approvalAvailable: false,
    decisionStatus, decision, decisionPath: existing ? artifactRef(existing.path) : null };
};

export const recordMemoReview = async (root: string, runId: string, memoId: string, submitted: unknown) => {
  const review = await inspectMemoReview(root, runId, memoId);
  const result = createBoundMemoDecision({ submitted, target: review.target,
    selectedObservationIds: review.samples.map(row => row.observationId),
    approvalBlockers: review.approvalBlockers, decidedAt: new Date().toISOString() });
  if (!result.ok) throw new Error(`Memo review rejected: ${result.error}`);
  const validTargets = new Set(review.samples.map(row => row.observationId));
  const value = result.value;
  if (value.drillDownVerdicts.some(row => row.targetType !== "observation" || !validTargets.has(row.targetId) ||
      Date.parse(row.clickedAt) < Date.parse(review.draftCreatedAt))) {
    throw new Error("Drill-down verdicts must reference selected observations and follow draft creation.");
  }
  if (review.decisionStatus !== "pending") throw new Error("This memo already has an immutable decision. A revision requires a new draft, not an overwritten decision.");
  const directory = resolve(root, runId, "memo", memoId, "review");
  await ensureDirectory(directory);
  const delta = relative(await realpath(resolve(root, runId)), await realpath(directory));
  if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("Memo decision directory escapes this run.");
  const temporary = resolve(directory, `.decision-${randomUUID()}.tmp`);
  const destination = resolve(directory, "decision.json");
  const file = await open(longPath(temporary), "wx");
  try {
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await file.sync();
    } finally { await file.close(); }
    const current = await inspectMemoReview(root, runId, memoId);
    if (!isDeepStrictEqual(current.target, review.target)) throw new Error("STALE_MEMO_REVIEW");
    await link(longPath(temporary), longPath(destination));
  } finally { await unlink(longPath(temporary)); }
  return { decision: value, path: artifactRef(destination) };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, runId, memoId, payloadPath, ...extra] = process.argv.slice(2);
    if (!runId || !memoId || extra.length || !["inspect", "record"].includes(mode ?? "") ||
        (mode === "record" ? !payloadPath : !!payloadPath)) {
      throw new Error("Usage: npm run review:memo -- inspect|record <run-id> <memo-id> [review-input.json]");
    }
    const result = mode === "record"
      ? await recordMemoReview(assuranceRunRoot(), runId, memoId, (await loadJsonArtifact(resolve(payloadPath!))).value)
      : await inspectMemoReview(assuranceRunRoot(), runId, memoId);
    console.log(`Review: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`Memo review failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
}
