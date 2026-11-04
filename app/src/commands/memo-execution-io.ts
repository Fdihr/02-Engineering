import { isAbsolute, relative, resolve } from "node:path";
import { mkdir, open, readdir, realpath, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { isRecord, readArtifactBinding } from "../modules/assurance/validators.js";
import { keyJudgementPolicyFromStandard, validateMemoStandardV1 } from "../modules/memo/standard-v1.js";
import { createBoundedWriterRequest, editorialWriterRequest, recordWriterResponse, validateBoundedWriterRequest,
  type EditorialRevision, type WriterRecord } from "../modules/memo/writer.js";
import { createKeyJudgementRequest, recordKeyJudgementResponse, validateKeyJudgementRequest,
  validatePerformedAdjudication, type KeyJudgementRecord } from "../modules/synthesis/key-judgement-stage.js";
import type { MemoAuthorization, MemoStage } from "../workflow/bounded-memo.js";
import { loadJsonArtifact, loadRunArtifact, requireChecksum } from "./assurance-io.js";
import { loadRssQuestion } from "./rss-io.js";
import { loadChallengeRecordContext, verifySynthesisSourceAuthority } from "./synthesis-io.js";

export const reserveManualMemo = async (root: string, runId: string) => {
  const directory = resolve(root, runId, "memo", "execution");
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, "worker.lock");
  const lock = await open(lockPath, "wx");
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, id: randomUUID(), mode: "manual-compatibility" }));
    await lock.sync();
  } finally { await lock.close(); }
  try {
    const revisions = resolve(root, runId, "memo", "revisions");
    try {
      for (const entry of await readdir(revisions)) {
        try {
          await stat(resolve(revisions, entry, "authorization.json"));
          throw new Error("This run has bounded editorial revision authority. Use revise:memo status/resume; manual memo work is excluded.");
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await stat(resolve(directory, "authorization.json")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return async () => { await unlink(lockPath); };
      throw error;
    }
    throw new Error("This run has bounded memo authority. Use run:memo status/resume; manual preparation or recording cannot replace its frozen work.");
  } catch (error) { await unlink(lockPath); throw error; }
};

export type MemoInputBindings = Pick<MemoAuthorization,
  "runId" | "build" | "challenge" | "adjudication" | "question" | "standard">;

export const loadMemoInputs = async (root: string, authority: MemoInputBindings) => {
  const challenge = await loadChallengeRecordContext(root, authority.challenge.artifactRef);
  requireChecksum(challenge.recordArtifact, authority.challenge.artifactSha256, "Frozen Challenge");
  if (!isDeepStrictEqual(challenge.build.recordArtifact.binding, authority.build) ||
      challenge.record.runId !== authority.runId) throw new Error("Frozen memo round does not match its Build.");
  const adjudicationArtifact = requireChecksum(await loadRunArtifact(root, authority.adjudication.artifactRef, "Adjudication"),
    authority.adjudication.artifactSha256, "Frozen adjudication");
  const adjudication = validatePerformedAdjudication(adjudicationArtifact.value);
  if (!adjudication.ok || !isDeepStrictEqual(adjudication.value.buildRecord, authority.build) ||
      !isDeepStrictEqual(adjudication.value.challengeRecord, authority.challenge) ||
      adjudication.value.runId !== authority.runId) throw new Error("A matching performed human adjudication is required.");
  if (Date.parse(adjudication.value.createdAt) < Date.parse(challenge.record.recordedAt) ||
      Date.parse(adjudication.value.createdAt) > Date.now()) throw new Error("Adjudication chronology does not follow its Challenge.");
  const confine = async (binding: ArtifactBinding) => {
    const delta = relative(await realpath(root), await realpath(resolve(binding.artifactRef)));
    if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("Memo source lineage escapes the configured root.");
  };
  for (const binding of [challenge.build.envelopeArtifact.binding, challenge.build.requestArtifact.binding,
    challenge.build.record.response, challenge.requestArtifact.binding, challenge.record.response]) await confine(binding);
  const questionArtifact = requireChecksum(await loadRunArtifact(root, authority.question.artifactRef, "Question"),
    authority.question.artifactSha256, "Frozen question");
  const question = await loadRssQuestion(root, questionArtifact.binding.artifactRef, new Date().toISOString());
  if (question.runId !== authority.runId) throw new Error("Approved question belongs to another run.");
  if (question.scopeApproval) await confine(question.scopeApproval);
  for (const note of challenge.build.envelope.sourceNotes) {
    await confine(note);
    const source = await verifySynthesisSourceAuthority(root, note, new Date().toISOString());
    for (const [key, value] of Object.entries(source.note.lineage)) {
      const binding = readArtifactBinding(value);
      if (binding && key !== "policy") await confine(binding);
    }
    await confine(source.note.lineage.invocation.request);
    await confine(source.note.lineage.invocation.response);
    if (source.question.artifactSha256 !== authority.question.artifactSha256 ||
        source.question.artifactRef !== authority.question.artifactRef) throw new Error("Source notes do not share the frozen question.");
  }
  const standardArtifact = requireChecksum(await loadJsonArtifact(resolve(authority.standard.artifactRef)),
    authority.standard.artifactSha256, "Frozen memo standard");
  const standard = validateMemoStandardV1(standardArtifact.value);
  if (!standard.ok) throw new Error("Memo standard v1 is invalid.");
  return { build: challenge.build.record, challenge: challenge.record, adjudication: adjudication.value,
    question, standard: standard.value, policy: keyJudgementPolicyFromStandard(standard.value),
    lineage: [challenge.build.envelopeArtifact.binding, challenge.build.policyArtifact.binding,
      challenge.build.outletArtifact.binding, ...challenge.build.envelope.sourceNotes] };
};
export type MemoInputs = Awaited<ReturnType<typeof loadMemoInputs>>;

export const memoSelectionRequest = (authority: MemoInputBindings, input: MemoInputs, preparedAt: string) => {
  const result = createKeyJudgementRequest({
    buildRecord: input.build, buildRecordArtifact: authority.build,
    challengeRecord: input.challenge, challengeRecordArtifact: authority.challenge,
    adjudication: input.adjudication, adjudicationArtifact: authority.adjudication,
    memoStandardArtifact: authority.standard, policy: input.policy, preparedAt
  });
  if (!result.ok) throw new Error(`Key-judgement inputs rejected: ${JSON.stringify(result.error)}`);
  return result.value;
};
export const memoWriterRequest = (authority: MemoInputBindings, input: MemoInputs,
  selection: KeyJudgementRecord, binding: ArtifactBinding, preparedAt: string) => {
  const result = createBoundedWriterRequest({
    buildRecord: input.build, buildRecordArtifact: authority.build,
    challengeRecord: input.challenge, challengeRecordArtifact: authority.challenge,
    adjudication: input.adjudication, adjudicationArtifact: authority.adjudication,
    question: input.question, questionArtifact: authority.question,
    standard: input.standard, standardArtifact: authority.standard,
    keyJudgementRecord: selection, keyJudgementRecordArtifact: binding, preparedAt
  });
  if (!result.ok) throw new Error(`Writer inputs rejected: ${JSON.stringify(result.error)}`);
  return result.value;
};
export type MemoRequest = ReturnType<typeof memoSelectionRequest> | ReturnType<typeof memoWriterRequest>;

export const validateMemoRequest = (stage: MemoStage, value: unknown, authority: MemoInputBindings,
  input: MemoInputs, selection?: { record: KeyJudgementRecord; binding: ArtifactBinding },
  revision?: EditorialRevision): MemoRequest => {
  if (stage === "key-judgements") {
    const parsed = validateKeyJudgementRequest(value);
    if (!parsed.ok || !isDeepStrictEqual(parsed.value, memoSelectionRequest(authority, input, parsed.value.preparedAt))) {
      throw new Error("Selection request no longer matches frozen inputs.");
    }
    return parsed.value;
  }
  const parsed = validateBoundedWriterRequest(value);
  const base = parsed.ok && selection ? memoWriterRequest(authority, input, selection.record, selection.binding, parsed.value.preparedAt) : null;
  if (!parsed.ok || !base || !isDeepStrictEqual(parsed.value, revision ? editorialWriterRequest(base, revision) : base)) {
    throw new Error("Writer request no longer matches frozen selection.");
  }
  return parsed.value;
};

export const memoStageRecord = (stage: MemoStage, request: MemoRequest, requestBinding: ArtifactBinding,
  response: unknown, responseBinding: ArtifactBinding, input: MemoInputs, recordedAt: string,
  selection?: KeyJudgementRecord) => {
  if (stage === "key-judgements") {
    const parsed = validateKeyJudgementRequest(request);
    if (!parsed.ok) throw new Error("Invalid selection request.");
    const result = recordKeyJudgementResponse({
      request: parsed.value, requestArtifact: requestBinding, responseValue: response, responseArtifact: responseBinding,
      buildRecord: input.build, challengeRecord: input.challenge, adjudication: input.adjudication,
      policy: input.policy, recordedAt
    });
    if (!result.ok) throw new Error(`Selection response rejected: ${JSON.stringify(result.error)}`);
    return result.value;
  }
  const parsed = validateBoundedWriterRequest(request);
  if (!parsed.ok || !selection) throw new Error("Invalid bounded writer handoff.");
  const result = recordWriterResponse({
    request: parsed.value, requestArtifact: requestBinding, responseValue: response, responseArtifact: responseBinding,
    buildRecord: input.build, challengeRecord: input.challenge, adjudication: input.adjudication,
    question: input.question, standard: input.standard, keyJudgementRecord: selection, recordedAt
  });
  if (!result.ok) throw new Error(`Writer response rejected: ${JSON.stringify(result.error)}`);
  return result.value;
};

export const reopenMemoRecord = async (root: string, stage: MemoStage, binding: ArtifactBinding,
  authority: MemoInputBindings, input: MemoInputs, selection?: { record: KeyJudgementRecord; binding: ArtifactBinding },
  revision?: EditorialRevision) => {
  const artifact = requireChecksum(await loadRunArtifact(root, binding.artifactRef, "Stage record"), binding.artifactSha256, "Stage record");
  const value = artifact.value;
  if (!isRecord(value) || typeof value.recordedAt !== "string" ||
      !isRecord(value.request) || typeof value.request.artifactRef !== "string" ||
      !isRecord(value.response) || typeof value.response.artifactRef !== "string") throw new Error("Invalid saved memo record.");
  const request = requireChecksum(await loadRunArtifact(root, value.request.artifactRef, "Recorded request"),
    String(value.request.artifactSha256), "Recorded request");
  const response = requireChecksum(await loadRunArtifact(root, value.response.artifactRef, "Recorded response"),
    String(value.response.artifactSha256), "Recorded response");
  const parsed = validateMemoRequest(stage, request.value, authority, input, selection, revision);
  const expected = memoStageRecord(stage, parsed, request.binding, response.value, response.binding, input,
    value.recordedAt, selection?.record);
  if (!isDeepStrictEqual(expected, value)) throw new Error("Memo record does not reconstruct from its saved inputs.");
  return { record: expected, binding: artifact.binding, request: request.binding };
};

export const isWriterRecord = (record: KeyJudgementRecord | WriterRecord): record is WriterRecord => "memo" in record;
