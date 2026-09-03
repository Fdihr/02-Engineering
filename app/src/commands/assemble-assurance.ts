import { resolve } from "node:path";
import { assembleSourceNote } from "../modules/assurance/assemble.js";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { validateReviewPackage } from "../modules/assurance/review/package.js";
import { validateReviewRecord } from "../modules/assurance/review/record.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import {
  appendAssuranceEvent,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadAdmittedSource,
  loadCommitContext,
  loadRunArtifact,
  requireChecksum,
  stageDirectory,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run assemble:assurance -- <approved-evidence-snapshot.json> <extract-commit.json> <review-record.json> [superseded-provisional-note.json]";

const main = async (): Promise<void> => {
  const assembledAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let runId: string | undefined;
  let snapshotId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [snapshotPathValue, commitPathValue, recordPathValue, supersededPathValue, ...extra] =
      process.argv.slice(2);
    if (!snapshotPathValue || !commitPathValue || !recordPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const admitted = await loadAdmittedSource(runRoot, snapshotPathValue, assembledAt);
    runId = admitted.runId;
    snapshotId = admitted.snapshotId;
    eventLogPath = resolve(stageDirectory(runRoot, runId, snapshotId), "events.jsonl");

    const context = await loadCommitContext(runRoot, commitPathValue);
    const recordArtifact = await loadRunArtifact(
      runRoot,
      recordPathValue,
      "Review record"
    );
    const reviewRecord = validateReviewRecord(recordArtifact.value, context.policy);
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
    const reviewPackage = validateReviewPackage(packageArtifact.value, context.policy);
    if (!reviewPackage.ok) {
      throw new Error(`Review package rejected: ${reviewPackage.error}`);
    }

    let supersededNote;
    if (supersededPathValue) {
      const supersededArtifact = await loadRunArtifact(
        runRoot,
        supersededPathValue,
        "Superseded provisional note"
      );
      const parsed = validateSynthesisSourceNote(supersededArtifact.value);
      if (!parsed.ok) {
        throw new Error(`Superseded note rejected: ${parsed.error}`);
      }
      supersededNote = parsed.value;
    }

    const note = assembleSourceNote({
      admitted,
      commit: context.commit,
      commitArtifact: context.commitArtifact.binding,
      reviewPackage: reviewPackage.value,
      reviewRecord: reviewRecord.value,
      reviewRecordArtifact: recordArtifact.binding,
      ...(supersededNote ? { supersededNote } : {}),
      requirements: context.requirements,
      policy: context.policy,
      assembledAt
    });
    if (!note.ok) {
      throw new Error(`Source note rejected: ${note.error}`);
    }

    const stageDir = stageDirectory(runRoot, runId, snapshotId);
    await ensureDirectory(stageDir);
    outputArtifactRef = await writeJsonOnce(
      resolve(stageDir, `source-note-${note.value.reviewStatus}.json`),
      note.value
    );

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: assembledAt,
        actorType: "controller",
        step: "note_assembly",
        eventType: "assurance.note.assembled",
        status: "completed",
        artifactRef: outputArtifactRef
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Snapshot: ${snapshotId}`);
    console.log(`Note: ${note.value.id}`);
    console.log(`Review status: ${note.value.reviewStatus}`);
    console.log(`In-scope observations: ${note.value.inScopeObservations.length}`);
    console.log(`Out-of-IR observations: ${note.value.outOfIrObservations.length}`);
    console.log(`Gaps: ${note.value.gaps.length}`);
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
          step: "note_assembly",
          eventType: "assurance.note.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Source note assembly failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
