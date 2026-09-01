import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";
import { validateApprovedResearchQuestion } from "../modules/research/research-question.js";
import { adaptRetrievedSourceContent } from "../modules/source/retrieved-source-adapter.js";
import { adaptSeeristSourceContent } from "../modules/source/seerist-source-adapter.js";
import {
  createSourceDocument,
  validateSourceDocument
} from "../modules/source/source-document.js";

const usage =
  "Usage: npm run prepare:question-relevance -- <source-document.json>";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown relevance-request failure";

const resolveRunArtifact = (runRoot: string, value: string, label: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

const NATIVE_SOURCE_LIMITATIONS = [
  "Provider-captured content remains untrusted until human evidence review.",
  "Provider capture does not establish factual accuracy or independent corroboration."
];

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = resolve(process.env.QUESTION_RELEVANCE_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "question-relevance-events.jsonl");
  let runId: string | undefined;
  let sourceItemId: string | undefined;
  let sourceDocumentId: string | undefined;
  let requestId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [sourceDocumentPathValue, ...extra] = process.argv.slice(2);
    if (!sourceDocumentPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const sourceDocumentPath = resolveRunArtifact(
      runRoot,
      sourceDocumentPathValue,
      "Source document"
    );
    const sourceDocumentBytes = await readFile(sourceDocumentPath);
    const sourceDocumentValue: unknown = JSON.parse(
      sourceDocumentBytes.toString("utf8")
    );
    const sourceDocument = validateSourceDocument(sourceDocumentValue);
    if (!sourceDocument.ok) {
      throw new Error(`Source document rejected: ${sourceDocument.error}`);
    }
    runId = sourceDocument.value.runId;
    sourceItemId = sourceDocument.value.sourceItemId;
    sourceDocumentId = sourceDocument.value.id;

    const sourceArtifactPath = resolveRunArtifact(
      runRoot,
      sourceDocument.value.sourceArtifactRef,
      "Source artifact"
    );
    const sourceArtifactBytes = await readFile(sourceArtifactPath);
    const sourceArtifactSha256 = sha256(sourceArtifactBytes);
    if (sourceArtifactSha256 !== sourceDocument.value.sourceArtifactSha256) {
      throw new Error("Source artifact checksum does not match the source document.");
    }
    const sourceArtifact: unknown = JSON.parse(sourceArtifactBytes.toString("utf8"));
    const nativeItem =
      isRecord(sourceArtifact) && isRecord(sourceArtifact.item)
        ? sourceArtifact.item
        : undefined;
    const nativeSource = nativeItem?.provider === "seerist";
    const captured = nativeSource
      ? await (async () => {
          const rawArtifactRef = nonEmptyString(nativeItem.rawArtifactRef);
          if (!rawArtifactRef) {
            throw new Error("Native intake is missing its raw artifact reference.");
          }
          const rawArtifactPath = resolveRunArtifact(
            runRoot,
            rawArtifactRef,
            "Raw provider artifact"
          );
          const rawArtifactBytes = await readFile(rawArtifactPath);
          const rawArtifact: unknown = JSON.parse(rawArtifactBytes.toString("utf8"));
          return adaptSeeristSourceContent(
            sourceArtifact,
            rawArtifact,
            artifactRef(sourceArtifactPath),
            sourceArtifactSha256,
            artifactRef(rawArtifactPath),
            sha256(rawArtifactBytes)
          );
        })()
      : adaptRetrievedSourceContent(
          sourceArtifact,
          artifactRef(sourceArtifactPath),
          sourceArtifactSha256
        );
    if (!captured.ok) {
      throw new Error(`Source adapter rejected input: ${captured.error}`);
    }
    const reconstructed = createSourceDocument(captured.value);
    if (!reconstructed.ok || reconstructed.value.id !== sourceDocument.value.id) {
      throw new Error("Source document does not match its captured source artifact.");
    }
    const sourceResearchQuestion = nativeSource
      ? nativeItem.researchQuestion
      : isRecord(sourceArtifact)
        ? sourceArtifact.researchQuestion
        : undefined;
    if (!isRecord(sourceResearchQuestion)) {
      throw new Error("Source artifact is missing approved research-question lineage.");
    }

    const questionArtifactRef = nonEmptyString(
      sourceResearchQuestion.artifactRef
    );
    if (!questionArtifactRef) {
      throw new Error("Source artifact has no research-question artifact reference.");
    }
    const questionPath = resolveRunArtifact(
      runRoot,
      questionArtifactRef,
      "Research question"
    );
    const questionBytes = await readFile(questionPath);
    const questionArtifactSha256 = sha256(questionBytes);
    const parsedQuestion: unknown = JSON.parse(questionBytes.toString("utf8"));
    const questionValue = isRecord(parsedQuestion)
      ? {
          ...parsedQuestion,
          artifactRef: artifactRef(questionPath),
          artifactSha256: questionArtifactSha256
        }
      : parsedQuestion;
    const researchQuestion = validateApprovedResearchQuestion(
      questionValue,
      preparedAt
    );
    const embeddedResearchQuestion = validateApprovedResearchQuestion(
      sourceResearchQuestion,
      preparedAt
    );
    if (
      !researchQuestion.ok ||
      !embeddedResearchQuestion.ok ||
      !isDeepStrictEqual(researchQuestion.value, embeddedResearchQuestion.value)
    ) {
      throw new Error("Research-question artifact does not match source lineage.");
    }

    const request = createQuestionRelevanceRequest({
      preparedAt,
      researchQuestion: researchQuestion.value,
      sourceDocument: sourceDocument.value,
      sourceDocumentArtifactRef: artifactRef(sourceDocumentPath),
      sourceDocumentArtifactSha256: sha256(sourceDocumentBytes),
      sourceLimitations: nativeSource
        ? NATIVE_SOURCE_LIMITATIONS
        : isRecord(sourceArtifact)
          ? sourceArtifact.limitations
          : undefined
    });
    if (!request.ok) {
      throw new Error(`Relevance request rejected: ${request.error}`);
    }
    requestId = request.value.id;

    const outputParent = resolve(
      runRoot,
      runId,
      "sources",
      sourceItemId,
      sourceDocumentId,
      "question-relevance"
    );
    const outputDirectory = resolve(outputParent, requestId);
    await mkdir(outputParent, { recursive: true });
    await mkdir(outputDirectory);
    const outputPath = resolve(outputDirectory, "question-relevance-request.json");
    outputArtifactRef = artifactRef(outputPath);
    await writeFile(outputPath, JSON.stringify(request.value, null, 2), "utf8");
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        sourceItemId,
        sourceDocumentId,
        requestId,
        occurredAt: preparedAt,
        actorType: "controller",
        stage: "question_relevance",
        eventType: "question.relevance.request.prepared",
        status: "completed",
        artifactRef: outputArtifactRef
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Source: ${sourceItemId}`);
    console.log(`Document: ${sourceDocumentId}`);
    console.log(`Request: ${requestId}`);
    console.log(`Output: ${outputArtifactRef}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          runId,
          sourceItemId,
          sourceDocumentId,
          requestId,
          occurredAt: new Date().toISOString(),
          actorType: "controller",
          stage: "question_relevance",
          eventType: "question.relevance.request.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Relevance request failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();