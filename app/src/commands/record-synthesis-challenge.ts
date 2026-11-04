import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createProvisionalAdjudication, recordChallengeResponse } from "../modules/synthesis/challenge.js";
import { isRecord } from "../modules/assurance/validators.js";
import {
  artifactRef, assuranceRunRoot, commandError, ensureDirectory, loadJsonArtifact, loadRunArtifact,
  longPath, withSyncRetry, writeJsonOnce
} from "./assurance-io.js";
import { loadChallengeRequestContext } from "./synthesis-io.js";

export const recordSynthesisChallenge = async (
  root: string, requestPath: string, responsePath: string,
  recordedAt = new Date().toISOString(), authorisationPath?: string
) => {
  const context = await loadChallengeRequestContext(root, requestPath);
  const response = await loadRunArtifact(root, responsePath, "Challenge response");
  const authorisation = authorisationPath
    ? await loadRunArtifact(root, authorisationPath, "Challenge revalidation authorisation") : undefined;
  if (authorisation) {
    const value = authorisation.value;
    if (!isRecord(value) || value.schemaVersion !== "synthesis-challenge-revalidation-authorisation-v1" ||
        value.decision !== "stored-response-revalidation-authorised" ||
        !isRecord(value.request) || !isRecord(value.response) ||
        value.request.artifactSha256 !== context.requestArtifact.binding.artifactSha256 ||
        value.response.artifactSha256 !== response.binding.artifactSha256) {
      throw new Error("Challenge revalidation authorisation is invalid or mismatched.");
    }
  }
  const record = recordChallengeResponse({
    request: context.request, requestArtifact: context.requestArtifact.binding,
    responseValue: response.value, responseArtifact: response.binding,
    buildRecord: context.build.record, buildRecordArtifact: context.build.recordArtifact.binding,
    ...(authorisation ? { revalidationAuthorisation: authorisation.binding } : {}), recordedAt
  });
  if (!record.ok) throw new Error(`Challenge response rejected: ${record.error}`);
  const directory = resolve(root, record.value.runId, "synthesis", "challenge", "records", record.value.id);
  await ensureDirectory(directory);
  const output = await writeJsonOnce(resolve(directory, "challenge-record.json"), record.value);
  const persisted = await loadJsonArtifact(resolve(output));
  const metricsOutput = await writeJsonOnce(resolve(directory, "challenge-metrics.json"), record.value.metrics);
  const adjudication = createProvisionalAdjudication({
    buildRecord: context.build.record, buildRecordArtifact: context.build.recordArtifact.binding,
    challengeRecord: record.value, challengeRecordArtifact: persisted.binding, createdAt: recordedAt
  });
  if (!adjudication.ok) throw new Error(`Provisional adjudication rejected: ${adjudication.error}`);
  const adjudicationOutput = await writeJsonOnce(resolve(directory, "provisional-adjudication.json"), adjudication.value);
  await withSyncRetry(() => appendFile(longPath(resolve(root, record.value.runId, "synthesis", "events.jsonl")),
    `${JSON.stringify({
      runId: record.value.runId, occurredAt: recordedAt, actorType: "controller",
      stage: "external_synthesis", step: "challenge_record", eventType: "synthesis.challenge.recorded",
      status: "completed", artifactRef: output, metricsArtifactRef: metricsOutput,
      adjudicationArtifactRef: adjudicationOutput, reviewStatus: record.value.reviewStatus,
      limitedEvidence: record.value.limitedEvidence, challengesRaised: record.value.metrics.challengesRaised,
      checklistItemCount: record.value.metrics.checklistItemCount, adjudicationStatus: adjudication.value.adjudicationStatus
    })}\n`, "utf8"));
  return { record: record.value, output, adjudication: adjudication.value };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = assuranceRunRoot();
  const recordedAt = new Date().toISOString();
  const [requestPath, responsePath, authorisationPath, ...extra] = process.argv.slice(2);
  try {
    if (!requestPath || !responsePath || extra.length) {
      throw new Error("Usage: npm run record:synthesis-challenge -- <challenge-request.json> <copilot-response.json> [revalidation-authorisation.json]");
    }
    const { record, output, adjudication } =
      await recordSynthesisChallenge(root, requestPath, responsePath, recordedAt, authorisationPath);
    console.log(`Run: ${record.runId}\nChallenge record: ${record.id}\nReview status: ${record.reviewStatus}`);
    console.log(`Limited evidence: ${record.limitedEvidence}\nChallenges raised: ${record.metrics.challengesRaised}/${record.metrics.checklistItemCount}`);
    console.log(`Adjudication: ${adjudication.adjudicationStatus}\nContested claims: ${adjudication.claims.filter(c => c.status === "contested").length}`);
    console.log(`Output: ${output}`);
  } catch (error) {
    const message = commandError(error);
    if (requestPath) {
      try {
        const context = await loadChallengeRequestContext(root, requestPath);
        await withSyncRetry(() => appendFile(longPath(resolve(root, context.request.runId, "synthesis", "events.jsonl")),
          `${JSON.stringify({
            runId: context.request.runId, occurredAt: recordedAt, actorType: "controller",
            stage: "external_synthesis", step: "challenge_record", eventType: "synthesis.challenge.rejected",
            status: "failed", responseArtifactRef: responsePath ? artifactRef(responsePath) : null, error: message
          })}\n`, "utf8"));
      } catch (eventError) {
        console.error(`Challenge failure event logging failed: ${commandError(eventError)}`);
      }
    }
    console.error(`Synthesis Challenge recording failed: ${message}`);
    process.exitCode = 1;
  }
}
