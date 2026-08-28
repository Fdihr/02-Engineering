import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const SEERIST_BASE_URL = "https://app.seerist.com/hyperionapi/";
const DEFAULT_PATH = "/v1/wod";
const OBSERVED_SOURCE_FIELDS = [
  "id",
  "title",
  "summary",
  "body",
  "sanitizedBody",
  "sanitizedSummary",
  "link",
  "source",
  "@timestamp",
  "publishedDate",
  "lang",
  "author",
  "cluster_id",
  "cluster_size",
  "countries",
  "countryCode",
  "countryName",
  "location_metadata",
  "references",
  "source_metadata",
  "translated",
  "veracity",
  "severity"
] as const;

type QueryValue = string | number | boolean;
type QueryPayload = Record<string, QueryValue>;
type RequestDefinition = {
  path: string;
  query: QueryPayload;
};

type ProbeEvent = {
  runId: string;
  occurredAt: string;
  eventType: string;
  status: "started" | "completed" | "failed";
  artifactRef?: string;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const appendEvent = async (eventLogPath: string, event: ProbeEvent): Promise<void> => {
  await appendFile(eventLogPath, `${JSON.stringify(event)}\n`, "utf8");
};

const parseQuery = (value: unknown): QueryPayload => {
  if (!isRecord(value)) {
    throw new Error("The request query must be a JSON object.");
  }

  const query: QueryPayload = {};
  for (const [key, queryValue] of Object.entries(value)) {
    if (
      typeof queryValue !== "string" &&
      typeof queryValue !== "number" &&
      typeof queryValue !== "boolean"
    ) {
      throw new Error(`Query parameter '${key}' must be a string, number, or boolean.`);
    }

    query[key] = queryValue;
  }

  return query;
};

const readRequestDefinition = async (queryPath: string): Promise<RequestDefinition> => {
  const parsed: unknown = JSON.parse(await readFile(queryPath, "utf8"));

  if (!isRecord(parsed)) {
    throw new Error("The query file must contain a JSON object.");
  }

  if (Object.hasOwn(parsed, "path") || Object.hasOwn(parsed, "query")) {
    if (typeof parsed.path !== "string") {
      throw new Error("The request path must be a string.");
    }

    return {
      path: parsed.path,
      query: parsed.query === undefined ? {} : parseQuery(parsed.query)
    };
  }

  return { path: DEFAULT_PATH, query: parseQuery(parsed) };
};

const buildRequestUrl = (request: RequestDefinition): URL => {
  if (!request.path.startsWith("/") || request.path.startsWith("//")) {
    throw new Error("The request path must be an absolute path within the Seerist API.");
  }

  const url = new URL(request.path.slice(1), SEERIST_BASE_URL);
  if (!url.href.startsWith(SEERIST_BASE_URL)) {
    throw new Error("The request path must remain within the Seerist API base URL.");
  }

  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error("Put query parameters in the request query object, not in the path.");
  }

  const query = request.query;
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
};

const describePayload = (payload: unknown): Record<string, unknown> => {
  if (Array.isArray(payload)) {
    const itemFields = payload.flatMap((item) => isRecord(item) ? Object.keys(item) : []);
    return {
      shape: "array",
      itemCount: payload.length,
      itemFields: [...new Set(itemFields)].sort()
    };
  }

  if (!isRecord(payload)) {
    return { shape: typeof payload };
  }

  if (!Array.isArray(payload.features)) {
    return {
      shape: "object",
      fields: Object.keys(payload).sort()
    };
  }

  const propertyNames = payload.features.flatMap((feature) =>
    isRecord(feature) && isRecord(feature.properties) ? Object.keys(feature.properties) : []
  );
  const geometryTypes = payload.features.flatMap((feature) =>
    isRecord(feature) && isRecord(feature.geometry) && typeof feature.geometry.type === "string"
      ? [feature.geometry.type]
      : []
  );

  return {
    shape: "featureCollection",
    featureCount: payload.features.length,
    metadataFields: isRecord(payload.metadata) ? Object.keys(payload.metadata).sort() : [],
    propertyFields: [...new Set(propertyNames)].sort(),
    geometryTypes: [...new Set(geometryTypes)].sort()
  };
};

const normalizeSources = (payload: unknown): Array<Record<string, unknown>> => {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    throw new Error("The response is not a GeoJSON FeatureCollection with a features array.");
  }

  return payload.features.flatMap((feature): Array<Record<string, unknown>> => {
    if (!isRecord(feature) || !isRecord(feature.properties)) {
      return [];
    }

    const normalized: Record<string, unknown> = {};
    for (const field of OBSERVED_SOURCE_FIELDS) {
      if (Object.hasOwn(feature.properties, field)) {
        normalized[field] = feature.properties[field];
      }
    }
    return [normalized];
  });
};

const compactText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > 100 ? `${compacted.slice(0, 97)}...` : compacted;
};

const printSummary = (
  runId: string,
  requestPath: string,
  rawArtifactRef: string,
  cacheStatus: string | null,
  rateLimitHeaders: Array<[string, string]>,
  structure: Record<string, unknown>,
  sources?: Array<Record<string, unknown>>
): void => {
  console.log(`Run: ${runId}`);
  console.log(`Endpoint: ${requestPath}`);
  console.log(`Raw artifact: ${rawArtifactRef}`);
  console.log(`Cache: ${cacheStatus ?? "not reported"}`);
  console.log(
    `Rate limit: ${rateLimitHeaders.length > 0 ? rateLimitHeaders.map(([name, value]) => `${name}=${value}`).join(", ") : "not reported"}`
  );
  console.log(`Shape: ${String(structure.shape)}`);

  if (!sources) {
    const itemCount = structure.itemCount ?? structure.featureCount;
    if (itemCount !== undefined) {
      console.log(`Items: ${String(itemCount)}`);
    }
    return;
  }

  console.log(`Candidates: ${sources.length}`);

  for (const [index, source] of sources.slice(0, 10).entries()) {
    const title = compactText(source.title) ?? "untitled";
    const provider = compactText(source.source) ?? "unknown source";
    const published = compactText(source.publishedDate ?? source["@timestamp"]) ?? "unknown date";
    console.log(`${index + 1}. ${title} | ${provider} | ${published}`);
  }
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown probe failure";

const main = async (): Promise<void> => {
  const runId = `seerist-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
  const runRoot = resolve(process.env.SEERIST_RUN_DIR ?? "runs");
  const runDirectory = resolve(runRoot, runId);
  const eventLogPath = resolve(runRoot, "events.jsonl");
  let rawArtifactRef: string | undefined;

  await mkdir(runDirectory, { recursive: true });
  await appendEvent(eventLogPath, {
    runId,
    occurredAt: new Date().toISOString(),
    eventType: "seerist.probe",
    status: "started"
  });

  try {
    const queryFile = process.argv[2];
    if (!queryFile) {
      throw new Error("Provide a query JSON file path as the first argument.");
    }

    const apiKey = process.env.SEERIST_API_KEY;
    if (!apiKey) {
      throw new Error("SEERIST_API_KEY is not configured.");
    }

    const request = await readRequestDefinition(resolve(queryFile));
    const response = await fetch(buildRequestUrl(request), {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      }
    });

    const rawResponse = Buffer.from(await response.arrayBuffer());
    const rawResponsePath = resolve(runDirectory, "raw-response.json");
    await writeFile(rawResponsePath, rawResponse);
    rawArtifactRef = artifactRef(rawResponsePath);

    if (!response.ok) {
      throw new Error(`Seerist returned HTTP ${response.status} ${response.statusText}.`);
    }

    const payload: unknown = JSON.parse(rawResponse.toString("utf8"));
    const structure = describePayload(payload);
    const structurePath = resolve(runDirectory, "observed-structure.json");
    await writeFile(structurePath, JSON.stringify(structure, null, 2), "utf8");
    const normalizedSources = request.path === DEFAULT_PATH ? normalizeSources(payload) : undefined;
    if (normalizedSources) {
      const normalizedPath = resolve(runDirectory, "normalized-sources.json");
      await writeFile(normalizedPath, JSON.stringify(normalizedSources, null, 2), "utf8");
    }
    const rateLimitHeaders = Array.from(response.headers.entries()).filter(
      ([name]) => name.includes("rate") || name.includes("quota") || name === "retry-after"
    );

    await appendEvent(eventLogPath, {
      runId,
      occurredAt: new Date().toISOString(),
      eventType: "seerist.probe",
      status: "completed",
      artifactRef: rawArtifactRef
    });

    printSummary(
      runId,
      request.path,
      rawArtifactRef,
      response.headers.get("x-cache"),
      rateLimitHeaders,
      structure,
      normalizedSources
    );
  } catch (error) {
    const message = errorMessage(error);
    await appendEvent(eventLogPath, {
      runId,
      occurredAt: new Date().toISOString(),
      eventType: "seerist.probe",
      status: "failed",
      artifactRef: rawArtifactRef,
      error: message
    });
    console.error(`Probe failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();