import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  createFirecrawlScrapeRequest,
  createSourceRetrievalResult,
  interpretFirecrawlResponse
} from "../modules/retrieval/firecrawl-retrieval.js";
import { renderSourceRetrievalSummary } from "../modules/reporting/source-retrieval-summary.js";
import { prepareSourceRetrieval } from "../modules/retrieval/source-retrieval.js";
import { requestFirecrawlScrape } from "./firecrawl-http.js";

const usage =
  "Usage: npm run retrieve:source -- <intake-result.json> <exact-source-url>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown source retrieval failure";

const main = async (): Promise<void> => {
  const attemptedAt = new Date().toISOString();
  const runRoot = resolve(process.env.SOURCE_RETRIEVAL_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "source-retrieval-events.jsonl");
  let runId: string | undefined;
  let providerItemId: string | undefined;
  let retrievalId: string | undefined;
  let rawArtifactRef: string | undefined;

  try {
    const [intakePathValue, sourceUrl, ...extra] = process.argv.slice(2);
    if (!intakePathValue || !sourceUrl || extra.length > 0) {
      throw new Error(usage);
    }

    const intakePath = resolve(intakePathValue);
    const intakeBytes = await readFile(intakePath);
    const intakeValue: unknown = JSON.parse(intakeBytes.toString("utf8"));
    const prepared = prepareSourceRetrieval(intakeValue, sourceUrl, attemptedAt);
    if (!prepared.ok) {
      throw new Error(`Source retrieval rejected: ${prepared.error}`);
    }
    runId = prepared.value.runId;
    providerItemId = prepared.value.providerItemId;

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey?.trim()) {
      throw new Error("FIRECRAWL_API_KEY is not configured.");
    }

    retrievalId = `source-retrieval-${randomUUID()}`;
    const retrievalParent = resolve(runRoot, runId, "source-retrievals");
    const retrievalDirectory = resolve(retrievalParent, retrievalId);
    await mkdir(retrievalParent, { recursive: true });
    await mkdir(retrievalDirectory);

    const request = createFirecrawlScrapeRequest(prepared.value);
    const requestPath = resolve(retrievalDirectory, "retrieval-request.json");
    const requestBytes = Buffer.from(
      JSON.stringify(
        {
          retrievalId,
          runId,
          providerItemId,
          accessProvider: "firecrawl",
          endpoint: "https://api.firecrawl.dev/v2/scrape",
          request,
          intakeArtifactRef: artifactRef(intakePath),
          intakeArtifactSha256: sha256(intakeBytes),
          researchQuestion: prepared.value.researchQuestion
        },
        null,
        2
      )
    );
    await writeFile(requestPath, requestBytes);
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        retrievalId,
        runId,
        providerItemId,
        occurredAt: attemptedAt,
        eventType: "source.retrieval",
        status: "started",
        artifactRef: artifactRef(requestPath)
      })}\n`,
      "utf8"
    );

    const response = await requestFirecrawlScrape(apiKey, request);
    const receivedAt = new Date().toISOString();
    const rawPath = resolve(retrievalDirectory, "raw-firecrawl-response.json");
    await writeFile(rawPath, response.rawBody);
    rawArtifactRef = artifactRef(rawPath);

    let responseValue: unknown;
    try {
      responseValue = JSON.parse(response.rawBody.toString("utf8"));
    } catch {
      throw new Error(
        `Firecrawl returned a non-JSON response (HTTP ${response.status} ${response.statusText}).`
      );
    }
    const interpreted = interpretFirecrawlResponse(
      prepared.value,
      response.status,
      responseValue,
      receivedAt
    );
    if (!interpreted.ok) {
      throw new Error(`Firecrawl response rejected: ${interpreted.error}`);
    }

    const result = createSourceRetrievalResult(prepared.value, interpreted.value, {
      retrievalId,
      receivedAt,
      mediaType: response.mediaType,
      intakeArtifactRef: artifactRef(intakePath),
      intakeArtifactSha256: sha256(intakeBytes),
      requestArtifactRef: artifactRef(requestPath),
      requestArtifactSha256: sha256(requestBytes),
      rawArtifactRef,
      rawArtifactSha256: sha256(response.rawBody)
    });
    const resultPath = resolve(retrievalDirectory, "source-retrieval-result.json");
    const summaryPath = resolve(retrievalDirectory, "source-retrieval-summary.md");
    await writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    await writeFile(summaryPath, renderSourceRetrievalSummary(result), "utf8");
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        retrievalId,
        runId,
        providerItemId,
        occurredAt: receivedAt,
        eventType: "source.retrieval",
        status: "completed",
        outcome: result.outcome,
        artifactRef: artifactRef(resultPath)
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Item: ${providerItemId}`);
    console.log(`Retrieval: ${retrievalId}`);
    console.log(`Outcome: ${result.outcome}`);
    console.log(`Reason: ${result.reason}`);
    console.log(`Approval: ${result.approvalStatus}`);
    console.log(`Output: ${artifactRef(resultPath)}`);
    console.log(`Review: ${artifactRef(summaryPath)}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          retrievalId,
          runId,
          providerItemId,
          occurredAt: new Date().toISOString(),
          eventType: "source.retrieval",
          status: "failed",
          artifactRef: rawArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Source retrieval failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();