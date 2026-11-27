import { randomUUID } from "node:crypto";
import { link, open, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { isRecord, pathSafeId, readArtifactBinding, sha256Text } from "../modules/assurance/validators.js";
import { createBoundMemoDecision, validateSupportCalibrationPolicy,
  createMemoPublicationGate, createPublishedMemoPackage, validatePublishedMemoPackage,
  type MemoReviewTarget, type PublishedMemoPackage } from "../modules/memo/publication.js";
import { renderMemoMarkdown, validateBoundedWriterRequest, type EditorialRevision } from "../modules/memo/writer.js";
import { validateApprovedMemoScope } from "../modules/research/memo-scope.js";
import { validateKeyJudgementRecord } from "../modules/synthesis/key-judgement-stage.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import { assuranceRunRoot, artifactRef, commandError, ensureDirectory, loadJsonArtifact,
  loadRunArtifact, longPath, requireChecksum, sha256, writeJsonOnce } from "./assurance-io.js";
import { isWriterRecord, loadMemoInputs, reopenMemoRecord } from "./memo-execution-io.js";
import { memoRevisionRoute } from "../workflow/memo-revision.js";

export const LEGACY_CALIBRATION_POLICY_PATH = resolve("src/modules/memo/standards/support-calibration-policy-v1.json");
export const DEFAULT_CALIBRATION_POLICY_PATH = resolve("src/modules/memo/standards/support-calibration-policy-v2.json");
const KNOWN_CALIBRATION_POLICY_PATHS = [DEFAULT_CALIBRATION_POLICY_PATH, LEGACY_CALIBRATION_POLICY_PATH];
const optional = async (path: string) => {
  try { return await loadJsonArtifact(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};

const resolveCalibrationPolicyPath = async (root: string, runId: string, memoId: string, overridePath?: string) => {
  if (overridePath) return resolve(overridePath);
  const existing = await optional(resolve(root, runId, "memo", memoId, "review", "decision.json"));
  if (existing && isRecord(existing.value) && isRecord(existing.value.target)) {
    const binding = readArtifactBinding(existing.value.target.calibrationPolicy);
    if (binding) {
      const candidate = resolve(binding.artifactRef);
      if (KNOWN_CALIBRATION_POLICY_PATHS.some((known) => known === candidate)) {
        return candidate;
      }
    }
  }
  return DEFAULT_CALIBRATION_POLICY_PATH;
};

export const loadMemoDraft = async (root: string, runId: string, memoId: string, depth = 0, policyPathOverride?: string) => {
  if (depth > 16) throw new Error("Memo revision lineage exceeds the supported depth.");
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
  let revision: EditorialRevision | undefined;
  if (parsed.value.editorialRevision) {
    const saved = parsed.value.editorialRevision;
    const parent = await inspectMemoReview(root, runId, saved.parentMemoId, depth + 1);
    if (!parent.decision || parent.decision.decision !== "revision-requested" || parent.decision.issueType !== "editorial" ||
        !parent.decisionPath || parent.decision.sampledVerdicts.some(row => row.verdict !== "supported")) {
      throw new Error("Editorial revision requires a matching recorded editorial decision with supported samples.");
    }
    const decisionArtifact = await loadRunArtifact(root, parent.decisionPath, "Parent decision");
    revision = { parentMemo: parent.target.memo, parentMemoId: parent.target.memoId, parentVersion: parent.target.memoVersion,
      decision: decisionArtifact.binding, feedback: parent.decision.feedback!,
      previousDraft: await readFile(longPath(resolve(parent.target.markdown.artifactRef)), "utf8") };
    if (!isDeepStrictEqual(saved, revision)) throw new Error("Revision no longer matches its parent memo and decision.");
  }
  const reopened = await reopenMemoRecord(root, "writer", writer.binding, authority, input,
    { record: selected.value, binding: selection.binding }, revision);
  if (!isWriterRecord(reopened.record)) throw new Error("Invalid writer record.");
  const record = reopened.record;
  if (record.memo.id !== memoId || record.runId !== runId ||
      !isDeepStrictEqual(memo.value, record.memo) ||
      !isDeepStrictEqual(verification.value, record.verification) ||
      record.verification.publicationVerdict !== (record.verification.blockers.length ? "block" : "eligible") ||
      !isDeepStrictEqual(gate.value, createMemoPublicationGate({
        memoId, checkedAt: record.recordedAt, blockers: record.verification.blockers
      }))) throw new Error("Memo, verification or publication gate differs from its recorded output.");
  const markdownPath = resolve(directory, "memo.md");
  await confine(markdownPath);
  const markdown = await readFile(longPath(markdownPath));
  if (markdown.toString("utf8") !== renderMemoMarkdown(record.memo)) throw new Error("Memo Markdown changed; restore or produce a new draft before review.");
  let audience: string | null = null;
  const scopeBinding = readArtifactBinding(record.memo.approvedScope);
  if (scopeBinding) {
    const scopeArtifact = requireChecksum(
      await loadRunArtifact(root, scopeBinding.artifactRef, "Approved memo scope"),
      scopeBinding.artifactSha256,
      "Approved memo scope"
    );
    const scope = validateApprovedMemoScope({
      ...(scopeArtifact.value as object),
      artifactRef: scopeArtifact.binding.artifactRef,
      artifactSha256: scopeArtifact.binding.artifactSha256
    }, record.memo.createdAt);
    if (!scope.ok) throw new Error("Approved memo audience is invalid.");
    audience = scope.value.audience.value;
  }
  const resolvedPolicyPath = await resolveCalibrationPolicyPath(root, runId, memoId, policyPathOverride);
  const policyArtifact = await loadJsonArtifact(resolvedPolicyPath);
  const policy = validateSupportCalibrationPolicy(policyArtifact.value);
  if (!policy.ok) throw new Error("Invalid support calibration policy.");
  const target: MemoReviewTarget = { runId, memoId, memoVersion: record.memo.version,
    memo: memo.binding, markdown: { artifactRef: artifactRef(markdownPath), artifactSha256: sha256(markdown) },
    writer: writer.binding, verification: verification.binding, gate: gate.binding,
    calibrationPolicy: policyArtifact.binding };
  return { target, record, authority, input, selection: { record: selected.value, binding: selection.binding },
    markdown: markdown.toString("utf8"), audience, gate: gate.value, policy: policy.value };
};

type MemoReviewInspection = {
  target: MemoReviewTarget; draftCreatedAt: string; sampleSize: number;
  samples: Array<{ observationId: string; text: string; quote: string; sourceNoteId: string }>;
  approvalBlockers: string[]; approvalAvailable: boolean; decisionStatus: string;
  decision: import("../modules/memo/publication.js").BoundMemoDecision | null; decisionPath: string | null;
  audience: string | null; publishedArtifactRef: string | null; publishedAt: string | null;
  publishedBy: string | null;
  revisionRoute: ReturnType<typeof memoRevisionRoute>;
};

export const inspectMemoReview = async (root: string, runId: string, memoId: string, depth = 0, policyPathOverride?: string): Promise<MemoReviewInspection> => {
  const { target, record, input, audience, gate, policy } = await loadMemoDraft(root, runId, memoId, depth, policyPathOverride);
  const directory = resolve(root, runId, "memo", memoId);
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
  samples.sort((a, b) => sha256Text(`${target.memo.artifactSha256}:${a.observationId}`)
    .localeCompare(sha256Text(`${target.memo.artifactSha256}:${b.observationId}`)));
  const selectedSamples = samples.slice(0, policy.sampleSizePerMemo);
  const approvalBlockers = [...record.verification.blockers];
  if (!isRecord(gate) || gate.humanApprovalAvailable !== true) approvalBlockers.push("PUBLICATION_GATE_BLOCKED");
  if (selectedSamples.length < policy.sampleSizePerMemo) approvalBlockers.push("INSUFFICIENT_CALIBRATION_SAMPLE");
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
  let publishedArtifactRef: string | null = null;
  let publishedAt: string | null = null;
  let publishedBy: string | null = null;
  const published = await optional(resolve(root, runId, "published", memoId, "publication.json"));
  if (published) {
    if (!decision || decision.decision !== "approved" || !audience) {
      throw new Error("Published package has no matching approved memo decision.");
    }
    const checkedPackage = validatePublishedMemoPackage(published.value);
    const decisionArtifact = await loadJsonArtifact(resolve(root, runId, "memo", memoId, "review", "decision.json"));
    if (!checkedPackage.ok || !isDeepStrictEqual(checkedPackage.value.reviewTarget, target) ||
        !isDeepStrictEqual(checkedPackage.value.approval, decisionArtifact.binding) ||
        !isDeepStrictEqual(checkedPackage.value.memo, record.memo) ||
        checkedPackage.value.markdown !== renderMemoMarkdown(record.memo) ||
        checkedPackage.value.audience !== audience ||
        !isDeepStrictEqual(checkedPackage.value.lineage, record.memo.lineage)) {
      throw new Error("Published package no longer matches its approved memo.");
    }
    publishedArtifactRef = published.binding.artifactRef;
    publishedAt = checkedPackage.value.publishedAt;
    publishedBy = checkedPackage.value.publishedBy;
  }
  return { target, draftCreatedAt: record.memo.createdAt, sampleSize: policy.sampleSizePerMemo,
    samples: selectedSamples, approvalBlockers,
    approvalAvailable: approvalBlockers.length === 0 && selectedSamples.length === policy.sampleSizePerMemo,
    decisionStatus, decision, decisionPath: existing ? artifactRef(existing.path) : null,
    audience, publishedArtifactRef, publishedAt, publishedBy, revisionRoute: memoRevisionRoute(decision) };
};

export const recordMemoReview = async (root: string, runId: string, memoId: string, submitted: unknown, policyPathOverride?: string) => {
  const review = await inspectMemoReview(root, runId, memoId, 0, policyPathOverride);
  const result = createBoundMemoDecision({ submitted, target: review.target,
    selectedObservationIds: review.samples.map(row => row.observationId),
    approvalBlockers: review.approvalBlockers, decidedAt: new Date().toISOString() });
  if (!result.ok) throw new Error(`Memo review rejected: ${result.error}`);
  const value = result.value;
  if (review.sampleSize > 0) {
    const validTargets = new Set(review.samples.map(row => row.observationId));
    if (value.drillDownVerdicts.some(row => row.targetType !== "observation" || !validTargets.has(row.targetId) ||
        Date.parse(row.clickedAt) < Date.parse(review.draftCreatedAt))) {
      throw new Error("Drill-down verdicts must reference selected observations and follow draft creation.");
    }
  } else if (value.drillDownVerdicts.length > 0) {
    const draft = await loadMemoDraft(root, runId, memoId, 0, policyPathOverride);
    const validClaims = new Set(draft.input.build.synthesis.claims.map((claim) => claim.id));
    const validObservations = new Set<string>();
    const validSources = new Set<string>();
    for (const binding of draft.input.lineage.slice(3)) {
      const note = validateSynthesisSourceNote(requireChecksum(
        await loadRunArtifact(root, binding.artifactRef, "Source note"), binding.artifactSha256, "Source note").value);
      if (!note.ok) throw new Error("Invalid source note.");
      validSources.add(note.value.id);
      validSources.add(note.value.sourceDocumentId);
      for (const obs of note.value.inScopeObservations) validObservations.add(obs.observationId);
    }
    const invalidDrillDown = value.drillDownVerdicts.some((row) =>
      Date.parse(row.clickedAt) < Date.parse(review.draftCreatedAt) ||
      (row.targetType === "claim" && !validClaims.has(row.targetId)) ||
      (row.targetType === "observation" && !validObservations.has(row.targetId)) ||
      (row.targetType === "source" && !validSources.has(row.targetId))
    );
    if (invalidDrillDown) {
      throw new Error("Drill-down verdicts must reference memo lineage items and follow draft creation.");
    }
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
    const current = await inspectMemoReview(root, runId, memoId, 0, policyPathOverride);
    if (!isDeepStrictEqual(current.target, review.target)) throw new Error("STALE_MEMO_REVIEW");
    await link(longPath(temporary), longPath(destination));
  } finally { await unlink(longPath(temporary)); }
  return { decision: value, path: artifactRef(destination) };
};

export const publishMemo = async (root: string, runId: string, memoId: string, publisherId: string) => {
  if (!pathSafeId(publisherId)) throw new Error("An explicit publisher ID is required.");
  const review = await inspectMemoReview(root, runId, memoId);
  if (!review.decision || review.decision.decision !== "approved") {
    throw new Error("Only a memo with a recorded approval decision can be published.");
  }
  if (review.publishedArtifactRef) {
    return { path: review.publishedArtifactRef, publishedAt: review.publishedAt, publishedBy: review.publishedBy };
  }
  if (!review.approvalAvailable || !review.audience || !review.decisionPath) {
    throw new Error(`Memo is not eligible for publication: ${review.approvalBlockers.join(", ") || "approved audience unavailable"}.`);
  }
  if (review.decision.sampledVerdicts.some(row => row.verdict !== "supported")) {
    throw new Error("Publication requires supported verdicts for every sampled observation.");
  }
  const draft = await loadMemoDraft(root, runId, memoId);
  const decisionArtifact = await loadJsonArtifact(resolve(root, runId, "memo", memoId, "review", "decision.json"));
  if (decisionArtifact.binding.artifactRef !== review.decisionPath) throw new Error("Approved decision binding changed.");
  const lineage: Record<string, import("../modules/assurance/types.js").ArtifactBinding> = {};
  if (!isRecord(draft.record.memo.lineage)) throw new Error("Memo lineage is unavailable.");
  for (const [key, value] of Object.entries(draft.record.memo.lineage)) {
    const binding = readArtifactBinding(value);
    if (!binding) throw new Error("Memo lineage contains an invalid artifact binding.");
    lineage[key] = binding;
  }
  const packageResult = createPublishedMemoPackage({
    runId, memoId, memoVersion: draft.record.memo.version, publishedAt: new Date().toISOString(),
    publishedBy: publisherId, publicationStatus: "published", audience: review.audience, format: "markdown+json",
    approval: decisionArtifact.binding, reviewTarget: review.target, lineage,
    memo: draft.record.memo, markdown: draft.markdown
  });
  if (!packageResult.ok) throw new Error(`Published memo package rejected: ${packageResult.error}.`);
  const directory = resolve(root, runId, "published", memoId);
  await ensureDirectory(directory);
  const relativeDirectory = relative(await realpath(resolve(root, runId)), await realpath(directory));
  if (relativeDirectory.startsWith("..") || isAbsolute(relativeDirectory)) throw new Error("Published package escapes its run.");
  const output = resolve(directory, "publication.json");
  try {
    await writeJsonOnce(output, packageResult.value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await inspectMemoReview(root, runId, memoId);
    if (!existing.publishedArtifactRef) throw new Error("An existing publication package could not be verified.");
    return { path: existing.publishedArtifactRef, publishedAt: existing.publishedAt, publishedBy: existing.publishedBy };
  }
  const saved = await inspectMemoReview(root, runId, memoId);
  if (!saved.publishedArtifactRef) throw new Error("Published package was written but could not be verified.");
  return { path: saved.publishedArtifactRef, publishedAt: saved.publishedAt, publishedBy: saved.publishedBy };
};

export const approveAndPublishMemo = async (
  root: string,
  runId: string,
  memoId: string,
  reviewerId: string,
  feedback = "Approved for publication.",
  drillDownVerdicts: import("../modules/memo/publication.js").DrillDownVerdict[] = []
) => {
  const review = await inspectMemoReview(root, runId, memoId);
  if (review.decisionStatus === "pending") {
    await recordMemoReview(root, runId, memoId, {
      target: review.target,
      reviewerId,
      decision: "approved",
      feedback: feedback.trim().length >= 3 ? feedback.trim() : "Approved for publication.",
      sampledVerdicts: review.samples.map((row) => ({
        observationId: row.observationId,
        verdict: "supported" as const
      })),
      drillDownVerdicts
    });
  }
  return publishMemo(root, runId, memoId, reviewerId);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, runId, memoId, payloadPath, ...extra] = process.argv.slice(2);
    const invalidExtra = mode === "approve-and-publish" ? extra.length > 1 : extra.length > 0;
    if (!runId || !memoId || invalidExtra || !["inspect", "record", "publish", "approve-and-publish"].includes(mode ?? "") ||
        (mode === "record" ? !payloadPath : (mode === "publish" || mode === "approve-and-publish") ? !payloadPath : !!payloadPath)) {
      throw new Error("Usage: npm run review:memo -- inspect <run-id> <memo-id> | record <run-id> <memo-id> <review-input.json> | publish <run-id> <memo-id> <publisher-id> | approve-and-publish <run-id> <memo-id> <reviewer-id> [feedback]");
    }
    const result = mode === "record"
      ? await recordMemoReview(assuranceRunRoot(), runId, memoId, (await loadJsonArtifact(resolve(payloadPath!))).value)
      : mode === "publish"
        ? await publishMemo(assuranceRunRoot(), runId, memoId, payloadPath!)
        : mode === "approve-and-publish"
          ? await approveAndPublishMemo(assuranceRunRoot(), runId, memoId, payloadPath!, extra[0])
          : await inspectMemoReview(assuranceRunRoot(), runId, memoId);
    console.log(`${mode === "publish" || mode === "approve-and-publish" ? "Published" : "Review"}: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`Memo review failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
}
