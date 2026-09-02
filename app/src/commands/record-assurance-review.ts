import { resolve } from "node:path";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { validateReviewPackage } from "../modules/assurance/review/package.js";
import { recordReview } from "../modules/assurance/review/record.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadCommitContext,
  loadRunArtifact,
  requireChecksum,
  stageDirectory,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run record:assurance-review -- <review-package.json> <review-response.json>";

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let reviewerId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [packagePathValue, responsePathValue, ...extra] = process.argv.slice(2);
    if (!packagePathValue || !responsePathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const packageArtifact = await loadRunArtifact(
      runRoot,
      packagePathValue,
      "Review package"
    );
    const packageLineage = (
      packageArtifact.value as {
        extractCommit?: { artifactRef?: string; artifactSha256?: string };
      }
    ).extractCommit;
    if (!packageLineage?.artifactRef || !packageLineage.artifactSha256) {
      throw new Error("The review package has no extract-commit reference.");
    }

    const context = await loadCommitContext(runRoot, packageLineage.artifactRef);
    requireChecksum(
      context.commitArtifact,
      packageLineage.artifactSha256,
      "Extract commit"
    );

    const reviewPackage = validateReviewPackage(packageArtifact.value, context.policy);
    if (!reviewPackage.ok) {
      throw new Error(`Review package rejected: ${reviewPackage.error}`);
    }
    runId = reviewPackage.value.runId;
    snapshotId = reviewPackage.value.snapshotId;
    eventLogPath = resolve(stageDirectory(runRoot, runId, snapshotId), "events.jsonl");

    const responseArtifact = await loadRunArtifact(
      runRoot,
      responsePathValue,
      "Review response"
    );

    const record = recordReview({
      reviewPackage: reviewPackage.value,
      packageArtifact: packageArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      document: context.document,
      documentArtifact: context.documentArtifact.binding,
      requirements: context.requirements,
      policy: context.policy,
      recordedAt
    });
    if (!record.ok) {
      throw new Error(`Review response rejected: ${record.error}`);
    }
    reviewerId = record.value.reviewerId;

    const reviewDir = resolve(stageDirectory(runRoot, runId, snapshotId), "review");
    await ensureDirectory(reviewDir);
    outputArtifactRef = await writeJsonOnce(
      resolve(reviewDir, "review-record.json"),
      record.value
    );

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: recordedAt,
        actorType: "human",
        actorId: reviewerId,
        step: "review_record",
        eventType: "assurance.review.recorded",
        status: "completed",
        artifactRef: outputArtifactRef
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Snapshot: ${snapshotId}`);
    console.log(`Reviewer: ${reviewerId}`);
    console.log(`Verdicts: ${record.value.verdicts.length}`);
    console.log(`Human observations: ${record.value.humanObservations.length}`);
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
          step: "review_record",
          eventType: "assurance.review.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Review recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
