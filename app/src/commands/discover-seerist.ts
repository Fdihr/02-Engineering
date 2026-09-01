import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { prepareSeeristCollection } from "../modules/collection/seerist-collection.js";
import {
  assessSeeristDiscoveryPagination,
  prepareSeeristDiscovery,
  rankSeeristDiscoveryCandidates,
  type CollectedSeeristPage
} from "../modules/discovery/seerist-discovery.js";
import { renderSeeristDiscoverySummary } from "../modules/reporting/seerist-discovery-summary.js";

const usage =
  "Usage: npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPathSafeId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";

const hasNextPage = (payload: unknown): boolean =>
  isRecord(payload) && isRecord(payload.metadata) &&
  typeof payload.metadata.next === "string" && payload.metadata.next.length > 0;

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown Seerist discovery failure";

const main = async (): Promise<void> => {
  const startedAt = new Date().toISOString();
  const runRoot = resolve(process.env.SEERIST_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "discovery-events.jsonl");
  let runId: string | undefined;
  let planId: string | undefined;

  try {
    const [planPathValue, questionPathValue, ...extra] = process.argv.slice(2);
    if (!planPathValue || !questionPathValue || extra.length > 0) {
      throw new Error(usage);
    }

    const planPath = resolve(planPathValue);
    const planBytes = await readFile(planPath);
    const planValue: unknown = JSON.parse(planBytes.toString("utf8"));
    const questionPath = resolve(questionPathValue);
    const questionBytes = await readFile(questionPath);
    const parsedQuestion: unknown = JSON.parse(questionBytes.toString("utf8"));
    const questionValue = isRecord(parsedQuestion)
      ? {
          ...parsedQuestion,
          artifactRef: artifactRef(questionPath),
          artifactSha256: sha256(questionBytes)
        }
      : parsedQuestion;
    const prepared = prepareSeeristDiscovery(planValue, questionValue, startedAt);
    if (!prepared.ok) {
      throw new Error(`Discovery plan rejected: ${prepared.error}`);
    }

    runId = prepared.value.plan.runId;
    planId = prepared.value.plan.id;
    if (
      !isPathSafeId(runId) ||
      !isPathSafeId(planId) ||
      prepared.value.plan.queries.some((query) => !isPathSafeId(query.id))
    ) {
      throw new Error("Run, plan, and query IDs must be path-safe identifiers.");
    }

    const apiKey = process.env.SEERIST_API_KEY;
    if (!apiKey) {
      throw new Error("SEERIST_API_KEY is not configured.");
    }

    const discoveryParent = resolve(runRoot, runId, "discoveries");
    const discoveryDirectory = resolve(discoveryParent, planId);
    const rawDirectory = resolve(discoveryDirectory, "raw-pages");
    await mkdir(discoveryParent, { recursive: true });
    await mkdir(discoveryDirectory);
    await mkdir(rawDirectory);
    const requestPath = resolve(discoveryDirectory, "discovery-request.json");
    await writeFile(
      requestPath,
      JSON.stringify(
        {
          plan: prepared.value.plan,
          startedAt,
          planArtifactRef: artifactRef(planPath),
          planArtifactSha256: sha256(planBytes),
          researchQuestion: prepared.value.researchQuestion
        },
        null,
        2
      ),
      "utf8"
    );

    const pages: CollectedSeeristPage[] = [];
    const pageManifests: Array<Record<string, unknown>> = [];
    let apiCalls = 0;
    for (const query of prepared.value.plan.queries) {
      for (let page = 0; page < prepared.value.plan.maxPagesPerQuery; page += 1) {
        if (apiCalls >= prepared.value.plan.maxApiCalls) {
          break;
        }
        const pageOffset = page * prepared.value.plan.pageSize;
        const operationId = `${planId}-${query.id}-offset-${pageOffset}`;
        const requestedAt = new Date().toISOString();
        const operation = {
          id: operationId,
          runId,
          researchQuestionId: prepared.value.researchQuestion.id,
          provider: "seerist",
          method: "GET",
          endpoint: "/v1/wod",
          filters: {
            search: query.search,
            sources: query.sources,
            ...(query.aoiId ? { aoiId: query.aoiId } : {}),
            start: prepared.value.researchQuestion.timeWindow.from,
            end: prepared.value.researchQuestion.timeWindow.to,
            pageSize: prepared.value.plan.pageSize,
            pageOffset,
            sortDirection: "desc"
          }
        };
        const preparedOperation = prepareSeeristCollection(
          operation,
          prepared.value.researchQuestion,
          requestedAt
        );
        if (!preparedOperation.ok) {
          throw new Error(
            `Generated provider operation rejected: ${preparedOperation.error}`
          );
        }

        const response = await fetch(preparedOperation.value.requestUrl, {
          headers: { accept: "application/json", "x-api-key": apiKey }
        });
        apiCalls += 1;
        const receivedAt = new Date().toISOString();
        const rawResponse = Buffer.from(await response.arrayBuffer());
        const rawPath = resolve(rawDirectory, `${query.id}-offset-${pageOffset}.json`);
        await writeFile(rawPath, rawResponse);
        const rawArtifactRef = artifactRef(rawPath);
        const manifest = {
          operationId,
          queryId: query.id,
          pageOffset,
          requestedAt,
          receivedAt,
          httpStatus: response.status,
          mediaType: response.headers.get("content-type") ?? "unknown",
          cacheStatus: response.headers.get("x-cache") ?? "unknown",
          artifactRef: rawArtifactRef,
          sha256: sha256(rawResponse)
        };
        pageManifests.push(manifest);
        if (!response.ok) {
          throw new Error(`Seerist returned HTTP ${response.status} ${response.statusText}.`);
        }

        const payload: unknown = JSON.parse(rawResponse.toString("utf8"));
        pages.push({
          queryId: query.id,
          pageOffset,
          artifactRef: rawArtifactRef,
          cacheStatus: response.headers.get("x-cache") ?? undefined,
          payload
        });
        if (!hasNextPage(payload)) {
          break;
        }
      }
    }

    const paginationAssessments = assessSeeristDiscoveryPagination(
      prepared.value.plan,
      pages
    );
    const candidates = rankSeeristDiscoveryCandidates(
      prepared.value.plan,
      pages,
      paginationAssessments
    );
    const completedAt = new Date().toISOString();
    const resultsPath = resolve(discoveryDirectory, "discovery-results.json");
    const summaryPath = resolve(discoveryDirectory, "discovery-summary.md");
    await writeFile(
      resultsPath,
      JSON.stringify(
        {
          runId,
          planId,
          researchQuestionId: prepared.value.researchQuestion.id,
          startedAt,
          completedAt,
          apiCalls,
          pages: pageManifests,
          paginationAssessments,
          candidates
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      summaryPath,
      renderSeeristDiscoverySummary(
        prepared.value.plan,
        prepared.value.researchQuestion.question,
        apiCalls,
        paginationAssessments,
        candidates
      ),
      "utf8"
    );
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        planId,
        researchQuestionId: prepared.value.researchQuestion.id,
        occurredAt: completedAt,
        eventType: "seerist.discovery.completed",
        status: "completed",
        apiCalls,
        candidateCount: candidates.length,
        artifactRef: artifactRef(resultsPath)
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Plan: ${planId}`);
    console.log(`API calls: ${apiCalls}`);
    console.log(`Candidates: ${candidates.length}`);
    console.log(`Output: ${artifactRef(resultsPath)}`);
    console.log(`Review: ${artifactRef(summaryPath)}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          runId,
          planId,
          occurredAt: new Date().toISOString(),
          eventType: "seerist.discovery.failed",
          status: "failed",
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Seerist discovery failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();