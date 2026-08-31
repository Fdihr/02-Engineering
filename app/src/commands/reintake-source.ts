import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { reintakeRetrievedSource } from "../modules/intake/retrieved-source-intake.js";
import { renderRetrievedSourceIntakeSummary } from "../modules/reporting/retrieved-source-intake-summary.js";

type CommandOptions = {
  retrievalPath: string;
  analystId: string;
  relevanceToQuestion: string;
  candidateId: string;
};

const usage =
  "Usage: npm run reintake:source -- <source-retrieval-result.json> <analyst-id> <relevance-to-question> [candidate-id]";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const parseOptions = (args: string[]): CommandOptions => {
  const [retrievalPath, analystId, relevanceToQuestion, requestedCandidateId, ...extra] =
    args;
  if (!retrievalPath || !analystId || !relevanceToQuestion || extra.length > 0) {
    throw new Error(usage);
  }
  return {
    retrievalPath,
    analystId,
    relevanceToQuestion,
    candidateId: requestedCandidateId ?? `retrieved-source-${randomUUID()}`
  };
};

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown retrieved-source re-intake failure";

const resolveRunArtifact = (runRoot: string, value: string, label: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

const readRetrievalLineageRefs = (
  retrieval: unknown
): { sourceIntake: string; request: string; raw: string } => {
  if (!isRecord(retrieval) || !isRecord(retrieval.lineage)) {
    throw new Error("The retrieval artifact does not contain lineage references.");
  }
  const sourceIntake = nonEmptyString(retrieval.lineage.intakeArtifactRef);
  const request = nonEmptyString(retrieval.lineage.requestArtifactRef);
  const raw = nonEmptyString(retrieval.lineage.rawArtifactRef);
  if (!sourceIntake || !request || !raw) {
    throw new Error("The retrieval artifact contains incomplete lineage references.");
  }
  return { sourceIntake, request, raw };
};

const main = async (): Promise<void> => {
  const assessedAt = new Date().toISOString();
  const runRoot = resolve(process.env.SOURCE_REINTAKE_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "source-reintake-events.jsonl");
  let candidateId: string | undefined;
  let analystId: string | undefined;
  let runId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const options = parseOptions(process.argv.slice(2));
    candidateId = options.candidateId;
    analystId = options.analystId;
    const retrievalPath = resolveRunArtifact(
      runRoot,
      options.retrievalPath,
      "Retrieval result"
    );
    const retrievalBytes = await readFile(retrievalPath);
    const retrieval: unknown = JSON.parse(retrievalBytes.toString("utf8"));
    const refs = readRetrievalLineageRefs(retrieval);
    const sourceIntakePath = resolveRunArtifact(runRoot, refs.sourceIntake, "Source intake");
    const requestPath = resolveRunArtifact(runRoot, refs.request, "Retrieval request");
    const rawPath = resolveRunArtifact(runRoot, refs.raw, "Raw retrieval response");
    const [sourceIntakeBytes, requestBytes, rawBytes] = await Promise.all([
      readFile(sourceIntakePath),
      readFile(requestPath),
      readFile(rawPath)
    ]);
    const sourceIntake: unknown = JSON.parse(sourceIntakeBytes.toString("utf8"));
    const result = reintakeRetrievedSource({
      candidateId,
      analystId,
      assessedAt,
      relevanceToQuestion: options.relevanceToQuestion,
      sourceIntakeArtifactRef: refs.sourceIntake,
      retrievalArtifactRef: artifactRef(retrievalPath),
      sourceIntake,
      retrieval,
      artifactChecksums: {
        sourceIntakeSha256: sha256(sourceIntakeBytes),
        retrievalSha256: sha256(retrievalBytes),
        requestSha256: sha256(requestBytes),
        rawSha256: sha256(rawBytes)
      }
    });
    if (!result.ok) {
      throw new Error(`Retrieved-source re-intake rejected: ${result.error}`);
    }
    runId = result.value.ledgerEntry.runId;

    const outputParent = resolve(runRoot, runId, "source-reintakes");
    const outputDirectory = resolve(outputParent, candidateId);
    await mkdir(outputParent, { recursive: true });
    await mkdir(outputDirectory);
    const intakePath = resolve(outputDirectory, "intake-result.json");
    const summaryPath = resolve(outputDirectory, "intake-summary.md");
    outputArtifactRef = artifactRef(intakePath);
    await writeFile(intakePath, JSON.stringify(result.value, null, 2), "utf8");
    await writeFile(summaryPath, renderRetrievedSourceIntakeSummary(result.value), "utf8");
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        candidateId,
        runId,
        occurredAt: assessedAt,
        actorType: "human",
        actorId: analystId,
        stage: "retrieved_source_reintake",
        eventType: "source.reintake.completed",
        status: "completed",
        artifactRef: outputArtifactRef
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Candidate: ${candidateId}`);
    console.log(`Role: ${result.value.item.role}`);
    console.log(`Destination: ${result.value.decision.destination}`);
    console.log(`Approval: ${result.value.decision.approvalStatus}`);
    console.log(`Output: ${outputArtifactRef}`);
    console.log(`Review: ${artifactRef(summaryPath)}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          candidateId,
          runId,
          occurredAt: new Date().toISOString(),
          actorType: "human",
          actorId: analystId,
          stage: "retrieved_source_reintake",
          eventType: "source.reintake.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Retrieved-source re-intake failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();