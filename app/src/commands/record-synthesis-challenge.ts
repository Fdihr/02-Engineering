import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createChallengeRequest,
  createProvisionalAdjudication,
  recordChallengeResponse,
  validateChallengeRequest
} from "../modules/synthesis/challenge.js";
import { validateSynthesisBuildEnvelope } from "../modules/synthesis/build.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
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
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run record:synthesis-challenge -- <challenge-request.json> <copilot-response.json> [revalidation-authorisation.json]";

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let runId: string | undefined;
  let responseArtifactRef: string | undefined;
  try {
    const [requestPath, responsePath, authorisationPath, ...extra] = process.argv.slice(2);
    if (!requestPath || !responsePath || extra.length > 0) throw new Error(usage);
    const requestArtifact = await loadRunArtifact(runRoot, requestPath, "Challenge request");
    const request = validateChallengeRequest(requestArtifact.value);
    if (!request.ok) throw new Error(`Challenge request rejected: ${request.error}`);
    runId = request.value.runId;
    const buildRecordArtifact = requireChecksum(
      await loadRunArtifact(runRoot, request.value.buildRecord.artifactRef, "Build record"),
      request.value.buildRecord.artifactSha256,
      "Build record"
    );
    const buildRecord = validateSynthesisBuildRecord(buildRecordArtifact.value);
    if (!buildRecord.ok) throw new Error(`Build record rejected: ${buildRecord.error}`);
    const envelopeArtifact = requireChecksum(
      await loadRunArtifact(runRoot, buildRecord.value.envelope.artifactRef, "Build envelope"),
      buildRecord.value.envelope.artifactSha256,
      "Build envelope"
    );
    const envelope = validateSynthesisBuildEnvelope(envelopeArtifact.value);
    if (!envelope.ok) throw new Error(`Build envelope rejected: ${envelope.error}`);
    const sources = [];
    for (const binding of envelope.value.sourceNotes) {
      const artifact = requireChecksum(
        await loadRunArtifact(runRoot, binding.artifactRef, "Source note"),
        binding.artifactSha256,
        "Source note"
      );
      const note = validateSynthesisSourceNote(artifact.value);
      if (!note.ok) throw new Error(`Source note rejected: ${note.error}`);
      sources.push({ note: note.value, artifact: artifact.binding });
    }
    const recomputed = createChallengeRequest({
      buildRecord: buildRecord.value,
      buildRecordArtifact: buildRecordArtifact.binding,
      envelope: envelope.value,
      sources,
      preparedAt: request.value.preparedAt
    });
    if (!recomputed.ok || canonicalJson(recomputed.value) !== canonicalJson(request.value)) {
      throw new Error("Challenge request no longer matches its deterministic inputs.");
    }
    const responseArtifact = await loadRunArtifact(runRoot, responsePath, "Challenge response");
    responseArtifactRef = responseArtifact.binding.artifactRef;
    const authorisationArtifact = authorisationPath
      ? await loadRunArtifact(
          runRoot,
          authorisationPath,
          "Challenge revalidation authorisation"
        )
      : undefined;
    if (authorisationArtifact) {
      const value = authorisationArtifact.value as {
        schemaVersion?: unknown;
        decision?: unknown;
        request?: { artifactSha256?: unknown };
        response?: { artifactSha256?: unknown };
      };
      if (
        value.schemaVersion !== "synthesis-challenge-revalidation-authorisation-v1" ||
        value.decision !== "stored-response-revalidation-authorised" ||
        value.request?.artifactSha256 !== requestArtifact.binding.artifactSha256 ||
        value.response?.artifactSha256 !== responseArtifact.binding.artifactSha256
      ) {
        throw new Error("Challenge revalidation authorisation is invalid or mismatched.");
      }
    }
    const record = recordChallengeResponse({
      request: request.value,
      requestArtifact: requestArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      buildRecord: buildRecord.value,
      buildRecordArtifact: buildRecordArtifact.binding,
      ...(authorisationArtifact
        ? { revalidationAuthorisation: authorisationArtifact.binding }
        : {}),
      recordedAt
    });
    if (!record.ok) throw new Error(`Challenge response rejected: ${record.error}`);
    const recordDir = resolve(
      runRoot,
      record.value.runId,
      "synthesis",
      "challenge",
      "records",
      record.value.id
    );
    await ensureDirectory(recordDir);
    const recordOutput = await writeJsonOnce(
      resolve(recordDir, "challenge-record.json"),
      record.value
    );
    const persistedRecord = await loadJsonArtifact(resolve(recordOutput));
    const metricsOutput = await writeJsonOnce(
      resolve(recordDir, "challenge-metrics.json"),
      record.value.metrics
    );
    const adjudication = createProvisionalAdjudication({
      buildRecord: buildRecord.value,
      buildRecordArtifact: buildRecordArtifact.binding,
      challengeRecord: record.value,
      challengeRecordArtifact: persistedRecord.binding,
      createdAt: recordedAt
    });
    if (!adjudication.ok) {
      throw new Error(`Provisional adjudication rejected: ${adjudication.error}`);
    }
    const adjudicationOutput = await writeJsonOnce(
      resolve(recordDir, "provisional-adjudication.json"),
      adjudication.value
    );
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(runRoot, record.value.runId, "synthesis", "events.jsonl")),
        `${JSON.stringify({
          runId: record.value.runId,
          occurredAt: recordedAt,
          actorType: "controller",
          stage: "external_synthesis",
          step: "challenge_record",
          eventType: "synthesis.challenge.recorded",
          status: "completed",
          artifactRef: recordOutput,
          metricsArtifactRef: metricsOutput,
          adjudicationArtifactRef: adjudicationOutput,
          reviewStatus: record.value.reviewStatus,
          limitedEvidence: record.value.limitedEvidence,
          challengesRaised: record.value.metrics.challengesRaised,
          checklistItemCount: record.value.metrics.checklistItemCount,
          adjudicationStatus: adjudication.value.adjudicationStatus
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${record.value.runId}`);
    console.log(`Challenge record: ${record.value.id}`);
    console.log(`Review status: ${record.value.reviewStatus}`);
    console.log(`Limited evidence: ${record.value.limitedEvidence}`);
    console.log(`Challenges raised: ${record.value.metrics.challengesRaised}/${record.value.metrics.checklistItemCount}`);
    console.log(`Adjudication: ${adjudication.value.adjudicationStatus}`);
    console.log(`Contested claims: ${adjudication.value.claims.filter((claim) => claim.status === "contested").length}`);
    console.log(`Output: ${recordOutput}`);
  } catch (error) {
    const message = commandError(error);
    if (runId) {
      const failedRunId = runId;
      try {
        await withSyncRetry(() =>
          appendFile(
            longPath(resolve(runRoot, failedRunId, "synthesis", "events.jsonl")),
            `${JSON.stringify({
              runId: failedRunId,
              occurredAt: recordedAt,
              actorType: "controller",
              stage: "external_synthesis",
              step: "challenge_record",
              eventType: "synthesis.challenge.rejected",
              status: "failed",
              responseArtifactRef,
              error: message
            })}\n`,
            "utf8"
          )
        );
      } catch (eventError) {
        console.error(`Challenge failure event logging failed: ${commandError(eventError)}`);
      }
    }
    console.error(`Synthesis Challenge recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();