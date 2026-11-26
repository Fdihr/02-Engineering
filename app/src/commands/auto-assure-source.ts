import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleSourceNote } from "../modules/assurance/assemble.js";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import { createReviewPackage, validateReviewPackage } from "../modules/assurance/review/package.js";
import {
  createAutomatedReviewResponse,
  recordReview,
  validateReviewRecord
} from "../modules/assurance/review/record.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import {
  appendAssuranceEvent,
  artifactRef,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadAdmittedSource,
  loadCommitContext,
  loadJsonArtifact,
  longPath,
  sha256,
  stageDirectory,
  writeJsonOnce,
  writeOnce
} from "./assurance-io.js";

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(longPath(path));
    return true;
  } catch {
    return false;
  }
};

export const autoAssureSource = async (
  runRoot: string,
  snapshotPathValue: string,
  commitPathValue: string,
  reviewerId = "automated-byte-anchor-check"
): Promise<string> => {
  const now = new Date().toISOString();
  const admitted = await loadAdmittedSource(runRoot, snapshotPathValue, now);
  const { runId, snapshotId } = admitted;
  const stageDir = stageDirectory(runRoot, runId, snapshotId);
  await ensureDirectory(stageDir);
  const existingNotePath = resolve(stageDir, "source-note-reviewed.json");
  if (await exists(existingNotePath)) {
    const loaded = await loadJsonArtifact(existingNotePath);
    const valid = validateSynthesisSourceNote(loaded.value);
    if (!valid.ok) {
      throw new Error(`Existing source note rejected: ${valid.error}`);
    }
    return existingNotePath;
  }

  const eventLogPath = resolve(stageDir, "events.jsonl");
  const context = await loadCommitContext(runRoot, commitPathValue);
  const reviewDir = resolve(stageDir, "review");
  await ensureDirectory(reviewDir);

  const packagePath = resolve(reviewDir, "review-package.json");
  if (!(await exists(packagePath))) {
    const createdAt = new Date().toISOString();
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
    const contents = `${JSON.stringify(reviewPackage.value, null, 2)}\n`;
    const packageSha256 = sha256(Buffer.from(contents, "utf8"));
    const pkgRef = await writeOnce(packagePath, contents);
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
        artifactRef: pkgRef,
        artifactSha256: packageSha256
      })
    );
  }

  const packageArtifact = await loadJsonArtifact(packagePath);
  const parsedPackage = validateReviewPackage(packageArtifact.value, context.policy);
  if (!parsedPackage.ok) {
    throw new Error(`Review package rejected: ${parsedPackage.error}`);
  }

  const responsePath = resolve(reviewDir, "review-response-automated.json");
  if (!(await exists(responsePath))) {
    const reviewedAt = new Date().toISOString();
    const automatedResponse = createAutomatedReviewResponse({
      reviewPackage: parsedPackage.value,
      packageSha256: packageArtifact.binding.artifactSha256,
      requirements: context.requirements,
      reviewedAt,
      reviewerId
    });
    await writeJsonOnce(responsePath, automatedResponse);
  }

  const responseArtifact = await loadJsonArtifact(responsePath);
  const recordPath = resolve(reviewDir, "review-record.json");
  if (!(await exists(recordPath))) {
    const recordedAt = new Date().toISOString();
    const recordResult = recordReview({
      reviewPackage: parsedPackage.value,
      packageArtifact: packageArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      document: context.document,
      documentArtifact: context.documentArtifact.binding,
      requirements: context.requirements,
      policy: context.policy,
      recordedAt
    });
    if (!recordResult.ok) {
      throw new Error(`Automated review record rejected: ${recordResult.error}`);
    }
    const recordRef = await writeJsonOnce(recordPath, recordResult.value);
    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        snapshotId,
        occurredAt: recordedAt,
        actorType: "controller",
        actorId: reviewerId,
        step: "review_record",
        eventType: "assurance.review.recorded",
        status: "completed",
        artifactRef: recordRef
      })
    );
  }

  const recordArtifact = await loadJsonArtifact(recordPath);
  const parsedRecord = validateReviewRecord(recordArtifact.value, context.policy);
  if (!parsedRecord.ok) {
    throw new Error(`Review record rejected: ${parsedRecord.error}`);
  }

  const assembledAt = new Date().toISOString();
  const note = assembleSourceNote({
    admitted,
    commit: context.commit,
    commitArtifact: context.commitArtifact.binding,
    reviewPackage: parsedPackage.value,
    reviewRecord: parsedRecord.value,
    reviewRecordArtifact: recordArtifact.binding,
    requirements: context.requirements,
    policy: context.policy,
    assembledAt
  });
  if (!note.ok) {
    throw new Error(`Source note rejected: ${note.error}`);
  }
  const outputRef = await writeJsonOnce(existingNotePath, note.value);
  await appendAssuranceEvent(
    eventLogPath,
    createAssuranceEvent({
      runId,
      snapshotId,
      occurredAt: assembledAt,
      actorType: "controller",
      step: "note_assembly",
      eventType: "assurance.source_note.assembled",
      status: "completed",
      artifactRef: outputRef
    })
  );
  return existingNotePath;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [snapshotPath, commitPath, reviewerId, ...extra] = process.argv.slice(2);
    if (!snapshotPath || !commitPath || extra.length > 0) {
      throw new Error("Usage: npm run auto-assure:source -- <approved-evidence-snapshot.json> <extract-commit.json> [reviewer-id]");
    }
    const out = await autoAssureSource(assuranceRunRoot(), snapshotPath, commitPath, reviewerId);
    console.log(`Output: ${artifactRef(out)}`);
  } catch (error) {
    console.error(`Automated source assurance failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
}
