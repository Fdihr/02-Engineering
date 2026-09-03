import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createChallengeRequest
} from "../modules/synthesis/challenge.js";
import { validateSynthesisBuildEnvelope } from "../modules/synthesis/build.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
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
  "Usage: npm run prepare:synthesis-challenge -- <synthesis-build-record.json>";

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  try {
    const [recordPath, ...extra] = process.argv.slice(2);
    if (!recordPath || extra.length > 0) throw new Error(usage);
    const recordArtifact = await loadRunArtifact(runRoot, recordPath, "Build record");
    const record = validateSynthesisBuildRecord(recordArtifact.value);
    if (!record.ok) throw new Error(`Build record rejected: ${record.error}`);
    const envelopeArtifact = requireChecksum(
      await loadRunArtifact(runRoot, record.value.envelope.artifactRef, "Build envelope"),
      record.value.envelope.artifactSha256,
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
    const request = createChallengeRequest({
      buildRecord: record.value,
      buildRecordArtifact: recordArtifact.binding,
      envelope: envelope.value,
      sources,
      preparedAt
    });
    if (!request.ok) throw new Error(`Challenge request rejected: ${request.error}`);
    const requestDir = resolve(
      runRoot,
      request.value.runId,
      "synthesis",
      "challenge",
      "requests",
      request.value.id
    );
    await ensureDirectory(requestDir);
    const output = await writeJsonOnce(
      resolve(requestDir, "challenge-request.json"),
      request.value
    );
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(runRoot, request.value.runId, "synthesis", "events.jsonl")),
        `${JSON.stringify({
          runId: request.value.runId,
          occurredAt: preparedAt,
          actorType: "controller",
          stage: "external_synthesis",
          step: "challenge_request",
          eventType: "synthesis.challenge.request.prepared",
          status: "completed",
          artifactRef: output,
          reviewStatus: request.value.reviewStatus,
          limitedEvidence: request.value.limitedEvidence,
          claimCount: request.value.claims.length,
          checklistItems: request.value.claims.length * request.value.checklist.length
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${request.value.runId}`);
    console.log(`Challenge request: ${request.value.id}`);
    console.log(`Review status: ${request.value.reviewStatus}`);
    console.log(`Limited evidence: ${request.value.limitedEvidence}`);
    console.log(`Claims: ${request.value.claims.length}`);
    console.log(`Checklist answers required: ${request.value.claims.length * request.value.checklist.length}`);
    console.log(`Output: ${output}`);
  } catch (error) {
    console.error(`Synthesis Challenge preparation failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

await main();