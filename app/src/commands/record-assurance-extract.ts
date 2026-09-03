import { dirname, resolve } from "node:path";
import { recordExtractResponse } from "../modules/assurance/extract/record.js";
import { validateExtractRequest } from "../modules/assurance/extract/request.js";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { createOpenExceptionItem } from "../modules/exceptions/exception-item.js";
import { persistExceptionItem } from "./exception-io.js";
import { validateProfilePolicy } from "../modules/assurance/policy.js";
import { validateApprovedRequirements } from "../modules/assurance/requirements.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadAdmittedSource,
  loadJsonArtifact,
  loadRunArtifact,
  requireChecksum,
  stageDirectory,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run record:assurance-extract -- <extract-request.json> <copilot-response.json>";

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let attempt: number | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [requestPathValue, responsePathValue, ...extra] = process.argv.slice(2);
    if (!requestPathValue || !responsePathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const requestArtifact = await loadRunArtifact(
      runRoot,
      requestPathValue,
      "Extract request"
    );
    const request = validateExtractRequest(requestArtifact.value);
    if (!request.ok) {
      throw new Error(`Extract request rejected: ${request.error}`);
    }
    runId = request.value.runId;
    snapshotId = request.value.snapshotId;
    attempt = request.value.attempt;

    const stageDir = stageDirectory(runRoot, runId, snapshotId);
    eventLogPath = resolve(stageDir, "events.jsonl");

    const admitted = await loadAdmittedSource(
      runRoot,
      resolve(request.value.lineage.snapshot.artifactRef),
      recordedAt
    );

    const requirementsArtifact = requireChecksum(
      await loadRunArtifact(
        runRoot,
        request.value.lineage.requirements.artifactRef,
        "Approved requirements"
      ),
      request.value.lineage.requirements.artifactSha256,
      "Approved requirements"
    );
    const requirements = validateApprovedRequirements(requirementsArtifact.value);
    if (!requirements.ok) {
      throw new Error(`Approved requirements rejected: ${requirements.error}`);
    }

    const policyArtifact = requireChecksum(
      await loadJsonArtifact(resolve(request.value.lineage.policy.artifactRef)),
      request.value.lineage.policy.artifactSha256,
      "Profile policy"
    );
    const policy = validateProfilePolicy(policyArtifact.value);
    if (!policy.ok) {
      throw new Error(`Profile policy rejected: ${policy.error}`);
    }

    const responseArtifact = await loadRunArtifact(
      runRoot,
      responsePathValue,
      "Copilot response"
    );

    const outcome = recordExtractResponse({
      request: request.value,
      requestArtifact: requestArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      admitted,
      requirements: requirements.value,
      requirementsArtifact: requirementsArtifact.binding,
      policy: policy.value,
      policyArtifact: policyArtifact.binding,
      recordedAt
    });
    if (!outcome.ok) {
      throw new Error(`Extract response rejected: ${outcome.error}`);
    }

    const attemptDir = dirname(requestArtifact.path);
    const extractDir = resolve(attemptDir, "..");
    const failures =
      outcome.value.status === "failed" ? outcome.value.failures : [];
    await writeJsonOnce(resolve(attemptDir, "checks.json"), failures);

    if (outcome.value.status === "committed") {
      outputArtifactRef = await writeJsonOnce(
        resolve(extractDir, "extract-commit.json"),
        outcome.value.commit
      );
      await appendAssuranceEvent(
        eventLogPath,
        createAssuranceEvent({
          runId,
          snapshotId,
          occurredAt: recordedAt,
          actorType: "controller",
          step: "extract_record",
          eventType: "assurance.extract.committed",
          status: "completed",
          attempt,
          artifactRef: outputArtifactRef
        })
      );
      console.log(`Status: committed`);
      console.log(`Observations: ${outcome.value.commit.observations.length}`);
      console.log(`Output: ${outputArtifactRef}`);
      return;
    }

    const exhausted = attempt >= policy.value.limits.maxAttempts;
    if (exhausted) {
      outputArtifactRef = await writeJsonOnce(resolve(extractDir, "extract-failed.json"), {
        requestId: request.value.id,
        attempt,
        failedAt: recordedAt,
        failures
      });
      const failureArtifact = await loadRunArtifact(
        runRoot,
        outputArtifactRef,
        "Extract failure"
      );
      const exception = createOpenExceptionItem({
        kind: "bounded-failure",
        runId,
        refs: [failureArtifact.binding, requestArtifact.binding],
        raisedAt: recordedAt
      });
      if (!exception.ok) {
        throw new Error(`Exception item rejected: ${exception.error}`);
      }
      const persistedException = await persistExceptionItem(runRoot, exception.value);
      await appendAssuranceEvent(
        eventLogPath,
        createAssuranceEvent({
          runId,
          snapshotId,
          occurredAt: recordedAt,
          actorType: "controller",
          step: "exception",
          eventType: "exception.bounded-failure.raised",
          status: "completed",
          attempt,
          artifactRef: persistedException.binding.artifactRef,
          artifactSha256: persistedException.binding.artifactSha256
        })
      );
    }
    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: recordedAt,
        actorType: "controller",
        step: "extract_record",
        eventType: exhausted
          ? "assurance.extract.stage.failed"
          : "assurance.extract.attempt.failed",
        status: "failed",
        attempt,
        artifactRef: outputArtifactRef,
        error: failures.map((entry) => `${entry.check}:${entry.count}`).join(",")
      })
    );

    console.log(`Status: ${exhausted ? "stage-failed" : "attempt-failed"}`);
    for (const entry of failures) {
      console.log(`Check ${entry.check}: ${entry.count}`);
    }
    process.exitCode = 1;
  } catch (error) {
    const message = commandError(error);
    try {
      await ensureDirectory(resolve(eventLogPath, ".."));
      await appendAssuranceEvent(
        eventLogPath,
        createAssuranceEvent({
          runId,
          snapshotId,
          occurredAt: new Date().toISOString(),
          actorType: "controller",
          step: "extract_record",
          eventType: "assurance.extract.record.failed",
          status: "failed",
          attempt,
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Extract recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
