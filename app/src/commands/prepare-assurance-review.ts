import { resolve } from "node:path";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { createReviewPackage } from "../modules/assurance/review/package.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadCommitContext,
  sha256,
  stageDirectory,
  writeOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run prepare:assurance-review -- <extract-commit.json>";

const main = async (): Promise<void> => {
  const createdAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [commitPathValue, ...extra] = process.argv.slice(2);
    if (!commitPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const context = await loadCommitContext(runRoot, commitPathValue);
    runId = context.commit.runId;
    snapshotId = context.commit.snapshotId;
    eventLogPath = resolve(stageDirectory(runRoot, runId, snapshotId), "events.jsonl");

    const reviewPackage = createReviewPackage({
      commit: context.commit,
      commitArtifact: context.commitArtifact.binding,
      requirements: context.requirements,
      document: context.document,
      createdAt
    });
    if (!reviewPackage.ok) {
      throw new Error(`Review package rejected: ${reviewPackage.error}`);
    }

    const reviewDir = resolve(stageDirectory(runRoot, runId, snapshotId), "review");
    await ensureDirectory(reviewDir);
    const contents = `${JSON.stringify(reviewPackage.value, null, 2)}\n`;
    const packageSha256 = sha256(Buffer.from(contents, "utf8"));
    outputArtifactRef = await writeOnce(
      resolve(reviewDir, "review-package.json"),
      contents
    );
    await writeOnce(resolve(reviewDir, "review-package.sha256"), `${packageSha256}\n`);

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: createdAt,
        actorType: "controller",
        step: "review_package",
        eventType: "assurance.review.package.prepared",
        status: "completed",
        artifactRef: outputArtifactRef,
        artifactSha256: packageSha256
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Snapshot: ${snapshotId}`);
    console.log(`Package: ${reviewPackage.value.id}`);
    console.log(`Observations: ${reviewPackage.value.observations.length}`);
    console.log(`Package SHA-256: ${packageSha256}`);
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
          step: "review_package",
          eventType: "assurance.review.package.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Review package failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
