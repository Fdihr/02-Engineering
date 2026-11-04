import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { recordSynthesisBuildResponse } from "../modules/synthesis/response.js";
import {
  artifactRef, assuranceRunRoot, commandError, ensureDirectory, loadRunArtifact,
  longPath, withSyncRetry, writeJsonOnce
} from "./assurance-io.js";
import { loadBuildRequestContext } from "./synthesis-io.js";

export const recordSynthesisBuild = async (
  root: string, requestPath: string, responsePath: string, recordedAt = new Date().toISOString()
) => {
  const context = await loadBuildRequestContext(root, requestPath);
  const response = await loadRunArtifact(root, responsePath, "Build response");
  const record = recordSynthesisBuildResponse({
    request: context.request, requestArtifact: context.requestArtifact.binding,
    responseValue: response.value, responseArtifact: response.binding,
    envelope: context.envelope, envelopeArtifact: context.envelopeArtifact.binding,
    sources: context.sources, policy: context.policy, outletIdentityTable: context.outlets, recordedAt
  });
  if (!record.ok) throw new Error(`Build response rejected: ${record.error}`);
  const directory = resolve(root, record.value.runId, "synthesis", "records", record.value.id);
  await ensureDirectory(directory);
  const output = await writeJsonOnce(resolve(directory, "synthesis-build-record.json"), record.value);
  await withSyncRetry(() => appendFile(longPath(resolve(root, record.value.runId, "synthesis", "events.jsonl")),
    `${JSON.stringify({
      runId: record.value.runId, occurredAt: recordedAt, actorType: "controller",
      stage: "external_synthesis", step: "build_record", eventType: "synthesis.build.recorded",
      status: "completed", artifactRef: output, reviewStatus: record.value.reviewStatus,
      limitedEvidence: record.value.limitedEvidence
    })}\n`, "utf8"));
  return { record: record.value, output };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = assuranceRunRoot();
  const recordedAt = new Date().toISOString();
  const [requestPath, responsePath, ...extra] = process.argv.slice(2);
  try {
    if (!requestPath || !responsePath || extra.length) {
      throw new Error("Usage: npm run record:synthesis-build -- <build-request.json> <copilot-response.json>");
    }
    const { record, output } = await recordSynthesisBuild(root, requestPath, responsePath, recordedAt);
    console.log(`Run: ${record.runId}\nBuild record: ${record.id}\nReview status: ${record.reviewStatus}`);
    console.log(`Limited evidence: ${record.limitedEvidence}\nClaims: ${record.synthesis.claims.length}\nOutput: ${output}`);
  } catch (error) {
    const message = commandError(error);
    if (requestPath) {
      try {
        const context = await loadBuildRequestContext(root, requestPath);
        await withSyncRetry(() => appendFile(longPath(resolve(root, context.request.runId, "synthesis", "events.jsonl")),
          `${JSON.stringify({
            runId: context.request.runId, occurredAt: recordedAt, actorType: "controller",
            stage: "external_synthesis", step: "build_record", eventType: "synthesis.build.rejected",
            status: "failed", responseArtifactRef: responsePath ? artifactRef(responsePath) : null, error: message
          })}\n`, "utf8"));
      } catch (eventError) {
        console.error(`Build failure event logging failed: ${commandError(eventError)}`);
      }
    }
    console.error(`Synthesis Build recording failed: ${message}`);
    process.exitCode = 1;
  }
}
