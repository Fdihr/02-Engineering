import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { measureAssurance, readMeasuredNote } from "../modules/assurance/measure.js";
import { validateReviewPackage } from "../modules/assurance/review/package.js";
import { validateReviewRecord } from "../modules/assurance/review/record.js";
import type { CheckFailure } from "../modules/assurance/types.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadCommitContext,
  loadRunArtifact,
  longPath,
  requireChecksum,
  resolveRunArtifact,
  stageDirectory,
  withSyncRetry,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run measure:assurance -- <source-note.json> <extract-stage-directory> <review-record.json>";

const readAttemptFailures = async (
  extractDir: string
): Promise<CheckFailure[][]> => {
  const attempts = (await readdir(longPath(extractDir), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^attempt-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const failures: CheckFailure[][] = [];
  for (const attempt of attempts) {
    const parsed: unknown = JSON.parse(
      await withSyncRetry(() => readFile(longPath(resolve(extractDir, attempt, "checks.json")), "utf8"))
    );
    if (!Array.isArray(parsed)) {
      throw new Error(`Attempt ${attempt} has an invalid checks record.`);
    }
    failures.push(parsed as CheckFailure[]);
  }
  return failures;
};

const main = async (): Promise<void> => {
  const measuredAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [notePathValue, extractDirValue, recordPathValue, ...extra] =
      process.argv.slice(2);
    if (!notePathValue || !extractDirValue || !recordPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const noteArtifact = await loadRunArtifact(runRoot, notePathValue, "Source note");
    const recordArtifact = await loadRunArtifact(
      runRoot,
      recordPathValue,
      "Review record"
    );
    const extractDir = resolveRunArtifact(
      runRoot,
      extractDirValue,
      "Extract stage directory"
    );

    const commitContext = await loadCommitContext(
      runRoot,
      resolve(extractDir, "extract-commit.json")
    );
    const reviewRecord = validateReviewRecord(
      recordArtifact.value,
      commitContext.policy
    );
    if (!reviewRecord.ok) {
      throw new Error(`Review record rejected: ${reviewRecord.error}`);
    }

    const packageArtifact = requireChecksum(
      await loadRunArtifact(
        runRoot,
        reviewRecord.value.reviewPackage.artifactRef,
        "Review package"
      ),
      reviewRecord.value.reviewPackage.artifactSha256,
      "Review package"
    );
    const reviewPackage = validateReviewPackage(
      packageArtifact.value,
      commitContext.policy
    );
    if (!reviewPackage.ok) {
      throw new Error(`Review package rejected: ${reviewPackage.error}`);
    }

    const note = readMeasuredNote(noteArtifact.value, commitContext.policy);
    if (!note.ok) {
      throw new Error(`Source note rejected: ${note.error}`);
    }
    runId = note.value.runId;
    snapshotId = note.value.snapshotId;
    eventLogPath = resolve(stageDirectory(runRoot, runId, snapshotId), "events.jsonl");

    const metrics = measureAssurance({
      note: note.value,
      reviewPackage: reviewPackage.value,
      reviewRecord: reviewRecord.value,
      attemptFailures: await readAttemptFailures(extractDir),
      measuredAt
    });
    if (!metrics.ok) {
      throw new Error(`Measurement rejected: ${metrics.error}`);
    }

    const stageDir = stageDirectory(runRoot, runId, snapshotId);
    await ensureDirectory(stageDir);
    outputArtifactRef = await writeJsonOnce(
      resolve(stageDir, `metrics-${metrics.value.reviewStatus}.json`),
      metrics.value
    );

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: measuredAt,
        actorType: "controller",
        step: "measurement",
        eventType: "assurance.metrics.recorded",
        status: "completed",
        artifactRef: outputArtifactRef
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Snapshot: ${snapshotId}`);
    console.log(`Review status: ${metrics.value.reviewStatus}`);
    console.log(`Support failure rate: ${metrics.value.supportFailureRate ?? "n/a"}`);
    console.log(`Chrome rate: ${metrics.value.chromeRate ?? "n/a"}`);
    console.log(`Omissions: ${metrics.value.omissionCount}`);
    console.log(
      `Disposition mismatches: ${metrics.value.dispositionMismatches.total} (overclaims ${metrics.value.dispositionMismatches.overclaims}, underclaims ${metrics.value.dispositionMismatches.underclaims})`
    );
    console.log(`Quote fidelity failures: ${metrics.value.quoteFidelityFailures}`);
    for (const recommendation of metrics.value.recommendations) {
      console.log(`Next: ${recommendation}`);
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
          actorType: "controller",
          step: "measurement",
          eventType: "assurance.metrics.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Measurement failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
