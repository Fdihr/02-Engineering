import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateApprovedResearchQuestion } from "../modules/research/research-question.js";
import {
  validateChallengeRecord,
  validateProvisionalAdjudication
} from "../modules/synthesis/challenge.js";
import {
  validateKeyJudgementRecord,
  validatePerformedAdjudication,
  type KeyJudgementRecord,
  type PerformedAdjudication
} from "../modules/synthesis/key-judgement-stage.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import {
  createBoundedWriterRequest,
  createWriterRequest,
  recordWriterResponse,
  renderMemoMarkdown,
  validateBoundedWriterRequest,
  validateMemoStandardV0,
  validateWriterRequest,
  type AnyWriterRequest,
  type MemoStandardV0
} from "../modules/memo/writer.js";
import {
  validateMemoStandardV1,
  type MemoStandardV1
} from "../modules/memo/standard-v1.js";
import type { ProvisionalAdjudication } from "../modules/synthesis/challenge.js";
import { canonicalJson } from "../modules/assurance/validators.js";
import {
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadJsonArtifact,
  loadRunArtifact,
  longPath,
  requireChecksum,
  withSyncRetry,
  writeJsonOnce,
  writeOnce
} from "./assurance-io.js";

const usage = "Usage: npm run record:memo-writer -- <writer-request.json> <copilot-response.json> [rerender-authorisation.json]";

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let runId: string | undefined;
  let responseArtifactRef: string | undefined;
  try {
    const [requestPath, responsePath, authorisationPath, ...extra] = process.argv.slice(2);
    if (!requestPath || !responsePath || extra.length > 0) throw new Error(usage);
    const requestArtifact = await loadRunArtifact(runRoot, requestPath, "Writer request");
    const boundedRequest = validateBoundedWriterRequest(requestArtifact.value);
    const legacyRequest = validateWriterRequest(requestArtifact.value);
    const request: AnyWriterRequest | undefined = boundedRequest.ok
      ? boundedRequest.value
      : legacyRequest.ok
        ? legacyRequest.value
        : undefined;
    if (!request) throw new Error("Writer request rejected: INVALID_WRITER_REQUEST");
    const isBounded = boundedRequest.ok;
    runId = request.runId;
    const buildArtifact = requireChecksum(
      await loadRunArtifact(runRoot, request.buildRecord.artifactRef, "Build record"),
      request.buildRecord.artifactSha256,
      "Build record"
    );
    const build = validateSynthesisBuildRecord(buildArtifact.value);
    if (!build.ok) throw new Error(`Build record rejected: ${build.error}`);
    const challengeArtifact = requireChecksum(
      await loadRunArtifact(runRoot, request.challengeRecord.artifactRef, "Challenge record"),
      request.challengeRecord.artifactSha256,
      "Challenge record"
    );
    const challenge = validateChallengeRecord(challengeArtifact.value);
    if (!challenge.ok) throw new Error(`Challenge record rejected: ${challenge.error}`);
    const adjudicationBinding = isBounded
      ? boundedRequest.value.adjudication
      : legacyRequest.ok
        ? legacyRequest.value.provisionalAdjudication
        : undefined;
    if (!adjudicationBinding) {
      throw new Error("Writer request has no valid adjudication binding.");
    }
    const adjudicationArtifact = requireChecksum(
      await loadRunArtifact(
        runRoot,
        adjudicationBinding.artifactRef,
        isBounded ? "Performed adjudication" : "Provisional adjudication"
      ),
      adjudicationBinding.artifactSha256,
      isBounded ? "Performed adjudication" : "Provisional adjudication"
    );
    let adjudication: PerformedAdjudication | ProvisionalAdjudication;
    if (isBounded) {
      const validated = validatePerformedAdjudication(adjudicationArtifact.value);
      if (!validated.ok) {
        throw new Error(`Adjudication rejected: ${JSON.stringify(validated.error)}`);
      }
      adjudication = validated.value;
    } else {
      const validated = validateProvisionalAdjudication(adjudicationArtifact.value);
      if (!validated.ok) {
        throw new Error(`Adjudication rejected: ${validated.error}`);
      }
      adjudication = validated.value;
    }
    let keyJudgementArtifact:
      | Awaited<ReturnType<typeof loadRunArtifact>>
      | undefined;
    let keyJudgement: KeyJudgementRecord | undefined;
    if (isBounded) {
      keyJudgementArtifact = requireChecksum(
        await loadRunArtifact(
          runRoot,
          boundedRequest.value.keyJudgementRecord.artifactRef,
          "Key-judgement record"
        ),
        boundedRequest.value.keyJudgementRecord.artifactSha256,
        "Key-judgement record"
      );
      const validated = validateKeyJudgementRecord(keyJudgementArtifact.value);
      if (!validated.ok) {
        throw new Error(
          `Key-judgement record rejected: ${JSON.stringify(validated.error)}`
        );
      }
      keyJudgement = validated.value;
    }
    const questionArtifact = requireChecksum(
      await loadRunArtifact(runRoot, request.approvedQuestion.artifactRef, "Approved question"),
      request.approvedQuestion.artifactSha256,
      "Approved question"
    );
    const question = validateApprovedResearchQuestion(
      {
        ...(questionArtifact.value as object),
        artifactRef: questionArtifact.binding.artifactRef,
        artifactSha256: questionArtifact.binding.artifactSha256
      },
      recordedAt
    );
    if (!question.ok) throw new Error(`Approved question rejected: ${question.error}`);
    const standardArtifact = requireChecksum(
      await loadJsonArtifact(resolve(request.memoStandard.artifactRef)),
      request.memoStandard.artifactSha256,
      "Memo standard"
    );
    let standard: MemoStandardV0 | MemoStandardV1;
    if (isBounded) {
      const validated = validateMemoStandardV1(standardArtifact.value);
      if (!validated.ok) {
        throw new Error(`Memo standard rejected: ${validated.error}`);
      }
      standard = validated.value;
    } else {
      const validated = validateMemoStandardV0(standardArtifact.value);
      if (!validated.ok) {
        throw new Error(`Memo standard rejected: ${validated.error}`);
      }
      standard = validated.value;
    }
    const recomputed = isBounded
      ? createBoundedWriterRequest({
          buildRecord: build.value,
          buildRecordArtifact: buildArtifact.binding,
          challengeRecord: challenge.value,
          challengeRecordArtifact: challengeArtifact.binding,
          adjudication: adjudication as PerformedAdjudication,
          adjudicationArtifact: adjudicationArtifact.binding,
          keyJudgementRecord: keyJudgement!,
          keyJudgementRecordArtifact: keyJudgementArtifact!.binding,
          question: question.value,
          questionArtifact: questionArtifact.binding,
          standard: standard as MemoStandardV1,
          standardArtifact: standardArtifact.binding,
          preparedAt: request.preparedAt
        })
      : createWriterRequest({
          buildRecord: build.value,
          buildRecordArtifact: buildArtifact.binding,
          challengeRecord: challenge.value,
          challengeRecordArtifact: challengeArtifact.binding,
          adjudication: adjudication as ProvisionalAdjudication,
          adjudicationArtifact: adjudicationArtifact.binding,
          question: question.value,
          questionArtifact: questionArtifact.binding,
          standard: standard as MemoStandardV0,
          standardArtifact: standardArtifact.binding,
          preparedAt: request.preparedAt
        });
    if (!recomputed.ok || canonicalJson(recomputed.value) !== canonicalJson(request)) {
      throw new Error("Writer request no longer matches its deterministic inputs.");
    }
    const responseArtifact = await loadRunArtifact(runRoot, responsePath, "Writer response");
    responseArtifactRef = responseArtifact.binding.artifactRef;
    const authorisationArtifact = authorisationPath
      ? await loadRunArtifact(runRoot, authorisationPath, "Memo rerender authorisation")
      : undefined;
    let supersedesMemoId: string | undefined;
    if (authorisationArtifact) {
      const value = authorisationArtifact.value as {
        schemaVersion?: unknown;
        decision?: unknown;
        request?: { artifactSha256?: unknown };
        response?: { artifactSha256?: unknown };
        supersedesMemoId?: unknown;
      };
      if (
        value.schemaVersion !== "memo-rerender-authorisation-v1" ||
        value.decision !== "stored-response-rerender-authorised" ||
        value.request?.artifactSha256 !== requestArtifact.binding.artifactSha256 ||
        value.response?.artifactSha256 !== responseArtifact.binding.artifactSha256 ||
        typeof value.supersedesMemoId !== "string" ||
        !value.supersedesMemoId
      ) {
        throw new Error("Memo rerender authorisation is invalid or mismatched.");
      }
      supersedesMemoId = value.supersedesMemoId;
    }
    const record = recordWriterResponse({
      request,
      requestArtifact: requestArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      buildRecord: build.value,
      challengeRecord: challenge.value,
      adjudication,
      ...(keyJudgement ? { keyJudgementRecord: keyJudgement } : {}),
      question: question.value,
      standard,
      ...(authorisationArtifact
        ? { revalidationAuthorisation: authorisationArtifact.binding }
        : {}),
      ...(supersedesMemoId ? { supersedesMemoId } : {}),
      recordedAt
    });
    if (!record.ok) throw new Error(`Writer response rejected: ${record.error}`);
    const outputDir = resolve(runRoot, record.value.runId, "memo", record.value.memo.id);
    await ensureDirectory(outputDir);
    const recordOutput = await writeJsonOnce(
      resolve(outputDir, "writer-record.json"),
      record.value
    );
    const memoOutput = await writeJsonOnce(resolve(outputDir, "memo.json"), record.value.memo);
    const markdownOutput = await writeOnce(
      resolve(outputDir, "memo.md"),
      renderMemoMarkdown(record.value.memo)
    );
    const verificationOutput = await writeJsonOnce(
      resolve(outputDir, "verification.json"),
      record.value.verification
    );
    const publicationGateOutput = await writeJsonOnce(
      resolve(outputDir, "publication-gate.json"),
      {
        schemaVersion: "memo-publication-gate-v1",
        memoId: record.value.memo.id,
        checkedAt: recordedAt,
        status: "blocked",
        reasons: record.value.verification.blockers,
        humanApprovalAvailable: false
      }
    );
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(runRoot, record.value.runId, "memo", "events.jsonl")),
        `${JSON.stringify({
          runId: record.value.runId,
          occurredAt: recordedAt,
          actorType: "controller",
          stage: "memo_writer",
          eventType: "memo.writer.recorded",
          status: "completed",
          artifactRef: recordOutput,
          memoArtifactRef: memoOutput,
          markdownArtifactRef: markdownOutput,
          verificationArtifactRef: verificationOutput,
          publicationGateArtifactRef: publicationGateOutput,
          reviewStatus: record.value.reviewStatus,
          limitedEvidence: record.value.limitedEvidence,
          publicationStatus: "blocked"
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${record.value.runId}`);
    console.log(`Memo: ${record.value.memo.id}`);
    console.log(`Review status: ${record.value.reviewStatus}`);
    console.log(`Limited evidence: ${record.value.limitedEvidence}`);
    console.log(`Key judgments: ${record.value.memo.keyJudgments.length}`);
    console.log(`Competing explanations: ${record.value.memo.competingExplanations.length}`);
    console.log(`Gaps: ${record.value.memo.gaps.length}`);
    console.log(`Publication: blocked`);
    console.log(`Output: ${markdownOutput}`);
  } catch (error) {
    const message = commandError(error);
    if (runId) {
      const failedRunId = runId;
      try {
        await withSyncRetry(() =>
          appendFile(
            longPath(resolve(runRoot, failedRunId, "memo", "events.jsonl")),
            `${JSON.stringify({
              runId: failedRunId,
              occurredAt: recordedAt,
              actorType: "controller",
              stage: "memo_writer",
              eventType: "memo.writer.rejected",
              status: "failed",
              responseArtifactRef,
              error: message
            })}\n`,
            "utf8"
          )
        );
      } catch (eventError) {
        console.error(`Writer failure event logging failed: ${commandError(eventError)}`);
      }
    }
    console.error(`Memo writer recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();