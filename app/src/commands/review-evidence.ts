import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { EvidenceReviewFailureEvent } from "../core/types.js";
import { renderEvidenceDecisionSummary } from "../modules/reporting/evidence-decision-summary.js";
import { reviewEvidence } from "../workflow/review-evidence.js";

type CommandOptions = {
  intakePath: string;
  decision: "approved" | "rejected";
  reviewerId: string;
  reason: string;
  decisionId?: string;
};

const usage =
  "Usage: npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseOptions = (args: string[]): CommandOptions => {
  const [intakePath, requestedDecision, reviewerId, reason, decisionId, ...extra] = args;
  if (!intakePath || !requestedDecision || !reviewerId || !reason || extra.length > 0) {
    throw new Error(usage);
  }
  if (requestedDecision !== "approve" && requestedDecision !== "reject") {
    throw new Error(usage);
  }
  if (decisionId && (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(decisionId) || decisionId === "..")) {
    throw new Error("Decision ID must be a path-safe identifier.");
  }

  return {
    intakePath,
    decision: requestedDecision === "approve" ? "approved" : "rejected",
    reviewerId,
    reason,
    decisionId
  };
};

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown evidence review failure";

const rawArtifactReference = (intake: unknown): string => {
  if (
    !isRecord(intake) ||
    !isRecord(intake.item) ||
    typeof intake.item.rawArtifactRef !== "string" ||
    !intake.item.rawArtifactRef.trim()
  ) {
    throw new Error("The intake artifact does not contain a raw artifact reference.");
  }

  return intake.item.rawArtifactRef;
};

const main = async (): Promise<void> => {
  const decidedAt = new Date().toISOString();
  let decisionId = `review-${decidedAt.replaceAll(":", "-")}-${randomUUID()}`;
  let reviewerId: string | undefined;
  let intakeArtifactRef: string | undefined;
  const runRoot = resolve(process.env.EVIDENCE_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "evidence-events.jsonl");

  try {
    const options = parseOptions(process.argv.slice(2));
    decisionId = options.decisionId ?? decisionId;
    reviewerId = options.reviewerId;
    const intakePath = resolve(options.intakePath);
    intakeArtifactRef = artifactRef(intakePath);
    const intake: unknown = JSON.parse(await readFile(intakePath, "utf8"));
    const rawArtifactRef = rawArtifactReference(intake);
    const rawArtifact = await readFile(resolve(rawArtifactRef));
    const rawArtifactSha256 = createHash("sha256").update(rawArtifact).digest("hex");
    const result = reviewEvidence({
      decisionId,
      reviewerId,
      decidedAt,
      decision: options.decision,
      reason: options.reason,
      intakeArtifactRef,
      rawArtifactSha256,
      intake
    });
    if (!result.ok) {
      throw new Error(`Evidence review failed: ${result.error}`);
    }

    await mkdir(runRoot, { recursive: true });
    const reviewDirectory = resolve(runRoot, decisionId);
    await mkdir(reviewDirectory);
    const decisionPath = resolve(reviewDirectory, "evidence-decision.json");
    const summaryPath = resolve(reviewDirectory, "evidence-decision-summary.md");
    await writeFile(decisionPath, JSON.stringify(result.value.decision, null, 2), "utf8");
    if (result.value.outcome === "approved") {
      const snapshotPath = resolve(reviewDirectory, "approved-evidence-snapshot.json");
      await writeFile(snapshotPath, JSON.stringify(result.value.snapshot, null, 2), "utf8");
    }
    await writeFile(summaryPath, renderEvidenceDecisionSummary(result.value), "utf8");
    await appendFile(eventLogPath, `${JSON.stringify(result.value.event)}\n`, "utf8");

    console.log(`Decision: ${result.value.outcome}`);
    console.log(`Decision ID: ${decisionId}`);
    console.log(`Reviewer: ${reviewerId}`);
    console.log(`Item: ${result.value.decision.providerItemId}`);
    console.log(`Output: ${artifactRef(decisionPath)}`);
    console.log(`Review: ${artifactRef(summaryPath)}`);
  } catch (error) {
    const message = commandError(error);
    const failureEvent: EvidenceReviewFailureEvent = {
      decisionId,
      occurredAt: decidedAt,
      actorType: "human",
      actorId: reviewerId,
      stage: "evidence_admission",
      eventType: "evidence.admission.failed",
      status: "failed",
      intakeArtifactRef,
      error: message
    };
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(eventLogPath, `${JSON.stringify(failureEvent)}\n`, "utf8");
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Evidence review failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();