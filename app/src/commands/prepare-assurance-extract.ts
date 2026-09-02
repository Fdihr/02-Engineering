import { access, mkdir, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createExtractRequest } from "../modules/assurance/extract/request.js";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { validateProfilePolicy } from "../modules/assurance/policy.js";
import { validateApprovedRequirements } from "../modules/assurance/requirements.js";
import type { CheckFailure } from "../modules/assurance/types.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadAdmittedSource,
  loadJsonArtifact,
  loadRunArtifact,
  sha256,
  stageDirectory,
  writeOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run prepare:assurance-extract -- <approved-evidence-snapshot.json> <approved-requirements.json> <profile-policy.json>";

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const readPreviousFailures = async (path: string): Promise<CheckFailure[]> => {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The previous attempt recorded no check failures to retry.");
  }
  return parsed as CheckFailure[];
};

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let attempt: number | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [snapshotPathValue, requirementsPathValue, policyPathValue, ...extra] =
      process.argv.slice(2);
    if (
      !snapshotPathValue ||
      !requirementsPathValue ||
      !policyPathValue ||
      extra.length > 0
    ) {
      throw new Error(usage);
    }

    const admitted = await loadAdmittedSource(runRoot, snapshotPathValue, preparedAt);
    runId = admitted.runId;
    snapshotId = admitted.snapshotId;

    const requirementsArtifact = await loadRunArtifact(
      runRoot,
      requirementsPathValue,
      "Approved requirements"
    );
    const requirements = validateApprovedRequirements(requirementsArtifact.value);
    if (!requirements.ok) {
      throw new Error(`Approved requirements rejected: ${requirements.error}`);
    }

    const policyArtifact = await loadJsonArtifact(resolve(policyPathValue));
    const policy = validateProfilePolicy(policyArtifact.value);
    if (!policy.ok) {
      throw new Error(`Profile policy rejected: ${policy.error}`);
    }

    const stageDir = stageDirectory(runRoot, runId, snapshotId);
    const extractDir = resolve(stageDir, "extract");
    eventLogPath = resolve(stageDir, "events.jsonl");
    await ensureDirectory(extractDir);

    if (
      (await exists(resolve(extractDir, "extract-commit.json"))) ||
      (await exists(resolve(extractDir, "extract-failed.json")))
    ) {
      throw new Error("The extract stage is already closed for this snapshot.");
    }

    const recorded = (await readdir(extractDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^attempt-\d+$/.test(entry.name))
      .map((entry) => Number.parseInt(entry.name.replace("attempt-", ""), 10))
      .sort((left, right) => left - right);
    if (recorded.some((value, index) => value !== index + 1)) {
      throw new Error("Extract attempt directories are not contiguous.");
    }

    attempt = recorded.length + 1;
    if (attempt > policy.value.limits.maxAttempts) {
      throw new Error("The extract attempt budget is exhausted.");
    }

    let feedback: CheckFailure[] | null = null;
    if (attempt > 1) {
      const previousChecks = resolve(extractDir, `attempt-${attempt - 1}`, "checks.json");
      if (!(await exists(previousChecks))) {
        throw new Error("The previous extract attempt has not been recorded.");
      }
      feedback = await readPreviousFailures(previousChecks);
    }

    const request = createExtractRequest({
      admitted,
      requirements: requirements.value,
      requirementsArtifact: requirementsArtifact.binding,
      policy: policy.value,
      policyArtifact: policyArtifact.binding,
      attempt,
      preparedAt,
      feedback
    });
    if (!request.ok) {
      throw new Error(`Extract request rejected: ${request.error}`);
    }

    const attemptDir = resolve(extractDir, `attempt-${attempt}`);
    await mkdir(attemptDir);
    const contents = `${JSON.stringify(request.value, null, 2)}\n`;
    const requestSha256 = sha256(Buffer.from(contents, "utf8"));
    outputArtifactRef = await writeOnce(
      resolve(attemptDir, "extract-request.json"),
      contents
    );
    await writeOnce(resolve(attemptDir, "extract-request.sha256"), `${requestSha256}\n`);

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: preparedAt,
        actorType: "controller",
        step: "extract_request",
        eventType: "assurance.extract.request.prepared",
        status: "completed",
        attempt,
        artifactRef: outputArtifactRef,
        artifactSha256: requestSha256
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Snapshot: ${snapshotId}`);
    console.log(`Attempt: ${attempt}`);
    console.log(`Request: ${request.value.id}`);
    console.log(`Output: ${outputArtifactRef}`);
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
          step: "extract_request",
          eventType: "assurance.extract.request.failed",
          status: "failed",
          attempt,
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Extract request failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
