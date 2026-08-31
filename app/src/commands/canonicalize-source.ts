import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { adaptRetrievedSourceContent } from "../modules/source/retrieved-source-adapter.js";
import { createSourceDocument } from "../modules/source/source-document.js";

const usage =
  "Usage: npm run canonicalize:source -- <source-retrieval-result.json>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown source canonicalization failure";

const resolveRunArtifact = (runRoot: string, value: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error("Retrieval result must remain inside the configured run directory.");
  }
  return path;
};

const main = async (): Promise<void> => {
  const occurredAt = new Date().toISOString();
  const runRoot = resolve(process.env.SOURCE_DOCUMENT_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "source-document-events.jsonl");
  let runId: string | undefined;
  let sourceItemId: string | undefined;
  let documentId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [retrievalPathValue, ...extra] = process.argv.slice(2);
    if (!retrievalPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const retrievalPath = resolveRunArtifact(runRoot, retrievalPathValue);
    const retrievalBytes = await readFile(retrievalPath);
    const retrieval: unknown = JSON.parse(retrievalBytes.toString("utf8"));
    const captured = adaptRetrievedSourceContent(
      retrieval,
      artifactRef(retrievalPath),
      sha256(retrievalBytes)
    );
    if (!captured.ok) {
      throw new Error(`Source adapter rejected retrieval: ${captured.error}`);
    }
    runId = captured.value.runId;
    sourceItemId = captured.value.sourceItemId;

    const result = createSourceDocument(captured.value);
    if (!result.ok) {
      throw new Error(`Source canonicalization rejected content: ${result.error}`);
    }
    documentId = result.value.id;

    const outputParent = resolve(runRoot, runId, "sources");
    const outputDirectory = resolve(outputParent, sourceItemId);
    await mkdir(outputParent, { recursive: true });
    await mkdir(outputDirectory);
    const outputPath = resolve(outputDirectory, "source-document.json");
    outputArtifactRef = artifactRef(outputPath);
    await writeFile(outputPath, JSON.stringify(result.value, null, 2), "utf8");
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        sourceItemId,
        documentId,
        occurredAt,
        actorType: "controller",
        stage: "source_canonicalization",
        eventType: "source.document.created",
        status: "completed",
        artifactRef: outputArtifactRef
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Source: ${sourceItemId}`);
    console.log(`Document: ${documentId}`);
    console.log(`Segments: ${result.value.segments.length}`);
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
          documentId,
          occurredAt: new Date().toISOString(),
          actorType: "controller",
          stage: "source_canonicalization",
          eventType: "source.document.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Source canonicalization failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();