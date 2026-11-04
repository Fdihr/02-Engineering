import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createChallengeRequest
} from "../modules/synthesis/challenge.js";
import { loadBuildRecordContext, writeSynthesisArtifact } from "./synthesis-io.js";
import {
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  longPath,
  withSyncRetry
} from "./assurance-io.js";

const usage =
  "Usage: npm run prepare:synthesis-challenge -- <synthesis-build-record.json>";

export const prepareSynthesisChallenge = async (runRoot: string, recordPath: string, preparedAt: string, reuse = false) => {
  const context = await loadBuildRecordContext(runRoot, recordPath);
  const request = createChallengeRequest({
    buildRecord: context.record, buildRecordArtifact: context.recordArtifact.binding,
    envelope: context.envelope, sources: context.sources, preparedAt
  });
  if (!request.ok) throw new Error(`Challenge request rejected: ${request.error}`);
  const requestDir = resolve(runRoot, request.value.runId, "synthesis", "challenge", "requests", request.value.id);
  await ensureDirectory(requestDir);
  const output = await writeSynthesisArtifact(resolve(requestDir, "challenge-request.json"), request.value, reuse);
  return { request: request.value, output };
};

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  try {
    const [recordPath, ...extra] = process.argv.slice(2);
    if (!recordPath || extra.length > 0) throw new Error(usage);
    const { request: value, output } = await prepareSynthesisChallenge(runRoot, recordPath, preparedAt);
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(runRoot, value.runId, "synthesis", "events.jsonl")),
        `${JSON.stringify({
          runId: value.runId,
          occurredAt: preparedAt,
          actorType: "controller",
          stage: "external_synthesis",
          step: "challenge_request",
          eventType: "synthesis.challenge.request.prepared",
          status: "completed",
          artifactRef: output,
          reviewStatus: value.reviewStatus,
          limitedEvidence: value.limitedEvidence,
          claimCount: value.claims.length,
          checklistItems: value.claims.length * value.checklist.length
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${value.runId}`);
    console.log(`Challenge request: ${value.id}`);
    console.log(`Review status: ${value.reviewStatus}`);
    console.log(`Limited evidence: ${value.limitedEvidence}`);
    console.log(`Claims: ${value.claims.length}`);
    console.log(`Checklist answers required: ${value.claims.length * value.checklist.length}`);
    console.log(`Output: ${output}`);
  } catch (error) {
    console.error(`Synthesis Challenge preparation failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();