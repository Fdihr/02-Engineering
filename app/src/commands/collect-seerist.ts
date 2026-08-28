import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { prepareSeeristCollection } from "../modules/collection/seerist-collection.js";

const usage =
  "Usage: npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPathSafeId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown Seerist collection failure";

const main = async (): Promise<void> => {
  const requestedAt = new Date().toISOString();
  const runRoot = resolve(process.env.SEERIST_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "collection-events.jsonl");
  let runId: string | undefined;
  let operationId: string | undefined;
  let researchQuestionId: string | undefined;
  let rawArtifactRef: string | undefined;

  try {
    const [operationPathValue, researchQuestionPathValue, ...extra] = process.argv.slice(2);
    if (!operationPathValue || !researchQuestionPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const operationPath = resolve(operationPathValue);
    const operationBytes = await readFile(operationPath);
    const operationValue: unknown = JSON.parse(operationBytes.toString("utf8"));
    const researchQuestionPath = resolve(researchQuestionPathValue);
    const researchQuestionBytes = await readFile(researchQuestionPath);
    const parsedResearchQuestion: unknown = JSON.parse(researchQuestionBytes.toString("utf8"));
    const researchQuestionValue = isRecord(parsedResearchQuestion)
      ? {
          ...parsedResearchQuestion,
          artifactRef: artifactRef(researchQuestionPath),
          artifactSha256: sha256(researchQuestionBytes)
        }
      : parsedResearchQuestion;
    const prepared = prepareSeeristCollection(
      operationValue,
      researchQuestionValue,
      requestedAt
    );
    if (!prepared.ok) {
      throw new Error(`Provider operation rejected: ${prepared.error}`);
    }

    runId = prepared.value.operation.runId;
    operationId = prepared.value.operation.id;
    researchQuestionId = prepared.value.researchQuestion.id;
    if (!isPathSafeId(runId) || !isPathSafeId(operationId)) {
      throw new Error("Run and operation IDs must be path-safe identifiers.");
    }

    const apiKey = process.env.SEERIST_API_KEY;
    if (!apiKey) {
      throw new Error("SEERIST_API_KEY is not configured.");
    }

    const operationParent = resolve(runRoot, runId, "provider-operations");
    const operationDirectory = resolve(operationParent, operationId);
    await mkdir(operationParent, { recursive: true });
    await mkdir(operationDirectory);
    const requestManifestPath = resolve(operationDirectory, "collection-request.json");
    await writeFile(
      requestManifestPath,
      JSON.stringify(
        {
          operation: prepared.value.operation,
          requestedAt,
          operationArtifactRef: artifactRef(operationPath),
          operationArtifactSha256: sha256(operationBytes),
          researchQuestion: prepared.value.researchQuestion
        },
        null,
        2
      ),
      "utf8"
    );
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        operationId,
        researchQuestionId,
        occurredAt: requestedAt,
        eventType: "seerist.collection",
        status: "started",
        artifactRef: artifactRef(requestManifestPath)
      })}\n`,
      "utf8"
    );

    const response = await fetch(prepared.value.requestUrl, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      }
    });
    const receivedAt = new Date().toISOString();
    const rawResponse = Buffer.from(await response.arrayBuffer());
    const rawResponsePath = resolve(operationDirectory, "raw-response.json");
    await writeFile(rawResponsePath, rawResponse);
    rawArtifactRef = artifactRef(rawResponsePath);
    const responseManifestPath = resolve(operationDirectory, "raw-provider-artifact.json");
    await writeFile(
      responseManifestPath,
      JSON.stringify(
        {
          id: `${operationId}-response`,
          runId,
          operationId,
          researchQuestionId,
          provider: "seerist",
          endpoint: prepared.value.operation.endpoint,
          requestedAt,
          receivedAt,
          httpStatus: response.status,
          mediaType: response.headers.get("content-type") ?? "unknown",
          artifactRef: rawArtifactRef,
          sha256: sha256(rawResponse)
        },
        null,
        2
      ),
      "utf8"
    );
    if (!response.ok) {
      throw new Error(`Seerist returned HTTP ${response.status} ${response.statusText}.`);
    }

    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        operationId,
        researchQuestionId,
        occurredAt: receivedAt,
        eventType: "seerist.collection",
        status: "completed",
        artifactRef: artifactRef(responseManifestPath)
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Question: ${researchQuestionId}`);
    console.log(`Operation: ${operationId}`);
    console.log(`Status: ${response.status}`);
    console.log(`Raw output: ${rawArtifactRef}`);
    console.log(`Manifest: ${artifactRef(responseManifestPath)}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          runId,
          operationId,
          researchQuestionId,
          occurredAt: new Date().toISOString(),
          eventType: "seerist.collection",
          status: "failed",
          artifactRef: rawArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Seerist collection failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();