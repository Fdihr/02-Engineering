import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createAttemptAuthorisation } from "../modules/assurance/authorisation.js";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { validateProfilePolicy } from "../modules/assurance/policy.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadJsonArtifact,
  loadRunArtifact,
  longPath,
  stageDirectory,
  withSyncRetry,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run authorise:assurance-attempt -- <extract-failed.json> <profile-policy.json> <reviewer-id> <reason> [--revalidates=<copilot-response.json>]";

const main = async (): Promise<void> => {
  const authorisedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let reviewerId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const args = process.argv.slice(2);
    const revalidatesArg = args.find((entry) =>
      entry.startsWith("--revalidates=")
    );
    const [failedPathValue, policyPathValue, reviewerIdValue, ...reasonParts] =
      args.filter((entry) => entry !== revalidatesArg);
    if (
      !failedPathValue ||
      !policyPathValue ||
      !reviewerIdValue ||
      reasonParts.length === 0
    ) {
      throw new Error(usage);
    }
    reviewerId = reviewerIdValue;

    const revalidated = revalidatesArg
      ? await loadRunArtifact(
          runRoot,
          revalidatesArg.replace("--revalidates=", ""),
          "Originating response"
        )
      : undefined;

    const failure = await loadRunArtifact(
      runRoot,
      failedPathValue,
      "Failed extract stage"
    );
    const failedStageDir = dirname(failure.path);
    const assuranceDir = resolve(failedStageDir, "..");
    snapshotId = basename(assuranceDir);
    runId = basename(resolve(assuranceDir, "..", ".."));
    eventLogPath = resolve(assuranceDir, "events.jsonl");

    const policyArtifact = await loadJsonArtifact(resolve(policyPathValue));
    const policy = validateProfilePolicy(policyArtifact.value);
    if (!policy.ok) {
      throw new Error(`Profile policy rejected: ${policy.error}`);
    }

    const stages = (await readdir(longPath(assuranceDir), { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() && /^extract(-\d+)?$/.test(entry.name)
      ).length;

    const authorisation = createAttemptAuthorisation({
      runId,
      snapshotId,
      sequence: stages + 1,
      supersededStageDirectory: basename(failedStageDir),
      failureValue: failure.value,
      failureArtifact: failure.binding,
      policy: policy.value,
      policyArtifact: policyArtifact.binding,
      reviewerId,
      reason: reasonParts.join(" "),
      authorisedAt,
      revalidatedResponseValue: revalidated?.value,
      revalidatedResponseArtifact: revalidated?.binding
    });
    if (!authorisation.ok) {
      throw new Error(`Attempt authorisation rejected: ${authorisation.error}`);
    }

    const parent = resolve(assuranceDir, "authorisations");
    const directory = resolve(parent, authorisation.value.id);
    await ensureDirectory(parent);
    await withSyncRetry(() => mkdir(longPath(directory)));
    outputArtifactRef = await writeJsonOnce(
      resolve(directory, "attempt-authorisation.json"),
      authorisation.value
    );

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: authorisedAt,
        actorType: "human",
        actorId: reviewerId,
        step: "extract_request",
        eventType: "assurance.extract.attempt.authorised",
        status: "completed",
        artifactRef: outputArtifactRef,
        artifactSha256: authorisation.value.supersededFailure.artifactSha256
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Snapshot: ${snapshotId}`);
    console.log(`Authorisation: ${authorisation.value.id}`);
    console.log(`Stage: ${authorisation.value.stageDirectory}`);
    console.log(`Supersedes: ${authorisation.value.supersededStageDirectory}`);
    console.log(`Policy: ${authorisation.value.policyId}`);
    if (authorisation.value.revalidation) {
      console.log(
        `Revalidates: ${authorisation.value.revalidation.originatingInvocationId}`
      );
    }
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
          actorType: "human",
          actorId: reviewerId,
          step: "extract_request",
          eventType: "assurance.extract.attempt.authorisation.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Attempt authorisation failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
