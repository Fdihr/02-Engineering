import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateApprovedResearchQuestion } from "../modules/research/research-question.js";
import {
  validateChallengeRecord,
  validateProvisionalAdjudication
} from "../modules/synthesis/challenge.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import {
  createWriterRequest,
  validateMemoStandardV0
} from "../modules/memo/writer.js";
import {
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadJsonArtifact,
  loadRunArtifact,
  longPath,
  requireChecksum,
  withSyncRetry,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run prepare:memo-writer -- <build-record.json> <challenge-record.json> <provisional-adjudication.json> <approved-question.json> <memo-standard-v0.json>";

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  try {
    const [buildPath, challengePath, adjudicationPath, questionPath, standardPath, ...extra] =
      process.argv.slice(2);
    if (!buildPath || !challengePath || !adjudicationPath || !questionPath || !standardPath || extra.length > 0) {
      throw new Error(usage);
    }
    const buildArtifact = await loadRunArtifact(runRoot, buildPath, "Build record");
    const build = validateSynthesisBuildRecord(buildArtifact.value);
    if (!build.ok) throw new Error(`Build record rejected: ${build.error}`);
    const challengeArtifact = await loadRunArtifact(runRoot, challengePath, "Challenge record");
    const challenge = validateChallengeRecord(challengeArtifact.value);
    if (!challenge.ok) throw new Error(`Challenge record rejected: ${challenge.error}`);
    const adjudicationArtifact = await loadRunArtifact(
      runRoot,
      adjudicationPath,
      "Provisional adjudication"
    );
    const adjudication = validateProvisionalAdjudication(adjudicationArtifact.value);
    if (!adjudication.ok) throw new Error(`Adjudication rejected: ${adjudication.error}`);
    requireChecksum(
      buildArtifact,
      adjudication.value.buildRecord.artifactSha256,
      "Adjudication Build record"
    );
    requireChecksum(
      challengeArtifact,
      adjudication.value.challengeRecord.artifactSha256,
      "Adjudication Challenge record"
    );
    const questionArtifact = await loadRunArtifact(runRoot, questionPath, "Approved question");
    const question = validateApprovedResearchQuestion(
      {
        ...(questionArtifact.value as object),
        artifactRef: questionArtifact.binding.artifactRef,
        artifactSha256: questionArtifact.binding.artifactSha256
      },
      preparedAt
    );
    if (!question.ok) throw new Error(`Approved question rejected: ${question.error}`);
    const standardArtifact = await loadJsonArtifact(resolve(standardPath));
    const standard = validateMemoStandardV0(standardArtifact.value);
    if (!standard.ok) throw new Error(`Memo standard rejected: ${standard.error}`);
    const request = createWriterRequest({
      buildRecord: build.value,
      buildRecordArtifact: buildArtifact.binding,
      challengeRecord: challenge.value,
      challengeRecordArtifact: challengeArtifact.binding,
      adjudication: adjudication.value,
      adjudicationArtifact: adjudicationArtifact.binding,
      question: question.value,
      questionArtifact: questionArtifact.binding,
      standard: standard.value,
      standardArtifact: standardArtifact.binding,
      preparedAt
    });
    if (!request.ok) throw new Error(`Writer request rejected: ${request.error}`);
    const requestDir = resolve(
      runRoot,
      request.value.runId,
      "memo",
      "requests",
      request.value.id
    );
    await ensureDirectory(requestDir);
    const output = await writeJsonOnce(resolve(requestDir, "writer-request.json"), request.value);
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(runRoot, request.value.runId, "memo", "events.jsonl")),
        `${JSON.stringify({
          runId: request.value.runId,
          occurredAt: preparedAt,
          actorType: "controller",
          stage: "memo_writer",
          eventType: "memo.writer.request.prepared",
          status: "completed",
          artifactRef: output,
          reviewStatus: request.value.reviewStatus,
          limitedEvidence: request.value.limitedEvidence,
          approvedScope: null
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${request.value.runId}`);
    console.log(`Writer request: ${request.value.id}`);
    console.log(`Review status: ${request.value.reviewStatus}`);
    console.log(`Limited evidence: ${request.value.limitedEvidence}`);
    console.log(`Claims: ${request.value.claims.length}`);
    console.log(`Required alternatives: ${request.value.requiredAlternativeCount}`);
    console.log(`Required gaps: ${request.value.requiredGaps.length}`);
    console.log(`Output: ${output}`);
  } catch (error) {
    console.error(`Memo writer preparation failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

await main();