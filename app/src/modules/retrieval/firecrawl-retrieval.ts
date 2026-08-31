import { err, ok, type Result } from "../../core/result.js";
import type {
  SourceRetrievalReason,
  SourceRetrievalResult
} from "../../core/types.js";
import {
  isSafeSourceUrl,
  type PreparedSourceRetrieval
} from "./source-retrieval.js";

export const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
export const FIRECRAWL_REQUEST_TIMEOUT_MS = 30_000;
export const FIRECRAWL_CLIENT_TIMEOUT_MS = 35_000;
export const FIRECRAWL_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MIN_RETRIEVED_CONTENT_CHARACTERS = 200;

export type FirecrawlScrapeRequest = {
  url: string;
  formats: ["markdown"];
  onlyMainContent: true;
  onlyCleanContent: false;
  maxAge: 0;
  storeInCache: false;
  skipTlsVerification: false;
  removeBase64Images: true;
  blockAds: true;
  waitFor: 0;
  mobile: false;
  timeout: number;
};

export type InterpretedFirecrawlResponse = {
  outcome: "resolved" | "unresolved";
  reason: SourceRetrievalReason;
  accessProviderHttpStatus: number;
  accessProviderErrorCode?: string;
  targetStatusCode?: number;
  reportedSourceUrl?: string;
  finalUrl?: string;
  redirectStatus: "not_reported" | "none_observed" | "same_origin" | "cross_origin";
  sourceHost: string;
  title?: string;
  description?: string;
  language?: string;
  contentType?: string;
  markdown?: string;
  limitations: string[];
};

export type FirecrawlResponseError =
  | "INVALID_RESPONSE_TIME"
  | "INVALID_HTTP_STATUS"
  | "MALFORMED_RESPONSE"
  | "SOURCE_URL_MISMATCH"
  | "UNSAFE_REPORTED_URL";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const metadataString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value.map(nonEmptyString).find((entry) => entry !== undefined);
  }
  return nonEmptyString(value);
};

const integerStatus = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;

const normalizedUrl = (value: string): string | undefined => {
  try {
    return new URL(value).href;
  } catch {
    return undefined;
  }
};

const cleanPageStatus = (status: number): boolean =>
  (status >= 200 && status <= 299) || status === 304;

const unresolved = (
  prepared: PreparedSourceRetrieval,
  accessProviderHttpStatus: number,
  reason: Exclude<SourceRetrievalReason, "content_retrieved">,
  values: Partial<InterpretedFirecrawlResponse> = {}
): InterpretedFirecrawlResponse => ({
  outcome: "unresolved",
  reason,
  accessProviderHttpStatus,
  redirectStatus: "not_reported",
  sourceHost: new URL(prepared.sourceUrl).hostname.toLowerCase(),
  limitations: [],
  ...values
});

export const createFirecrawlScrapeRequest = (
  prepared: PreparedSourceRetrieval
): FirecrawlScrapeRequest => ({
  url: prepared.sourceUrl,
  formats: ["markdown"],
  onlyMainContent: true,
  onlyCleanContent: false,
  maxAge: 0,
  storeInCache: false,
  skipTlsVerification: false,
  removeBase64Images: true,
  blockAds: true,
  waitFor: 0,
  mobile: false,
  timeout: FIRECRAWL_REQUEST_TIMEOUT_MS
});

export const interpretFirecrawlResponse = (
  prepared: PreparedSourceRetrieval,
  accessProviderHttpStatus: number,
  responseValue: unknown,
  receivedAt: string
): Result<InterpretedFirecrawlResponse, FirecrawlResponseError> => {
  if (!nonEmptyString(receivedAt) || Number.isNaN(Date.parse(receivedAt))) {
    return err("INVALID_RESPONSE_TIME");
  }
  if (!integerStatus(accessProviderHttpStatus)) {
    return err("INVALID_HTTP_STATUS");
  }
  if (!isRecord(responseValue) || typeof responseValue.success !== "boolean") {
    return err("MALFORMED_RESPONSE");
  }

  if (!responseValue.success || accessProviderHttpStatus !== 200) {
    return ok(
      unresolved(prepared, accessProviderHttpStatus, "access_provider_error", {
        accessProviderErrorCode: nonEmptyString(responseValue.code),
        limitations: [
          `Firecrawl did not return source content (HTTP ${accessProviderHttpStatus}).`
        ]
      })
    );
  }

  const data = responseValue.data;
  if (!isRecord(data)) {
    return err("MALFORMED_RESPONSE");
  }
  const metadata = data.metadata;
  if (!isRecord(metadata)) {
    return err("MALFORMED_RESPONSE");
  }
  const reportedSourceUrl = nonEmptyString(metadata.sourceURL);
  if (!reportedSourceUrl) {
    return err("MALFORMED_RESPONSE");
  }
  if (!isSafeSourceUrl(reportedSourceUrl)) {
    return err("UNSAFE_REPORTED_URL");
  }
  if (normalizedUrl(reportedSourceUrl) !== normalizedUrl(prepared.sourceUrl)) {
    return err("SOURCE_URL_MISMATCH");
  }

  const finalUrl = nonEmptyString(metadata.url);
  if (finalUrl && !isSafeSourceUrl(finalUrl)) {
    return err("UNSAFE_REPORTED_URL");
  }
  const requestedOrigin = new URL(prepared.sourceUrl).origin;
  const finalOrigin = finalUrl ? new URL(finalUrl).origin : undefined;
  const redirectStatus: InterpretedFirecrawlResponse["redirectStatus"] = !finalUrl
    ? "not_reported"
    : normalizedUrl(finalUrl) === normalizedUrl(prepared.sourceUrl)
      ? "none_observed"
      : finalOrigin === requestedOrigin
        ? "same_origin"
        : "cross_origin";
  const targetStatusCode = integerStatus(metadata.statusCode);
  const common = {
    targetStatusCode,
    reportedSourceUrl,
    finalUrl,
    redirectStatus,
    sourceHost: new URL(finalUrl ?? reportedSourceUrl).hostname.toLowerCase(),
    title: metadataString(metadata.title),
    description: metadataString(metadata.description),
    language: metadataString(metadata.language),
    contentType: nonEmptyString(metadata.contentType)
  };

  if (redirectStatus === "cross_origin") {
    return ok(
      unresolved(prepared, accessProviderHttpStatus, "cross_origin_redirect", {
        ...common,
        limitations: [
          "The target redirected to a different origin, so returned content was not admitted."
        ]
      })
    );
  }
  if (redirectStatus === "not_reported") {
    return ok(
      unresolved(prepared, accessProviderHttpStatus, "final_url_missing", {
        ...common,
        limitations: [
          "Firecrawl did not report the final URL, so redirect safety could not be established."
        ]
      })
    );
  }
  if (!targetStatusCode || !cleanPageStatus(targetStatusCode)) {
    return ok(
      unresolved(prepared, accessProviderHttpStatus, "target_page_error", {
        ...common,
        limitations: [
          targetStatusCode
            ? `The publisher returned HTTP ${targetStatusCode}.`
            : "Firecrawl did not report the publisher HTTP status."
        ]
      })
    );
  }

  const markdown = nonEmptyString(data.markdown);
  if (!markdown) {
    return ok(
      unresolved(prepared, accessProviderHttpStatus, "content_missing", {
        ...common,
        limitations: ["Firecrawl returned no non-empty Markdown content."]
      })
    );
  }
  if (markdown.length < MIN_RETRIEVED_CONTENT_CHARACTERS) {
    return ok(
      unresolved(prepared, accessProviderHttpStatus, "content_insufficient", {
        ...common,
        limitations: [
          `Retrieved content was shorter than ${MIN_RETRIEVED_CONTENT_CHARACTERS} characters.`
        ]
      })
    );
  }

  const limitations = [
    "Firecrawl is the access provider; the publisher URL remains the source.",
    "Retrieved Markdown is untrusted data and has not been admitted as evidence.",
    "A successful scrape does not independently prove source liveness or factual accuracy."
  ];
  if (redirectStatus === "same_origin") {
    limitations.push("The publisher redirected the request within the same origin.");
  }

  return ok({
    outcome: "resolved",
    reason: "content_retrieved",
    accessProviderHttpStatus,
    ...common,
    markdown,
    limitations
  });
};

export type SourceRetrievalArtifactInput = {
  retrievalId: string;
  receivedAt: string;
  mediaType: string;
  intakeArtifactRef: string;
  intakeArtifactSha256: string;
  requestArtifactRef: string;
  requestArtifactSha256: string;
  rawArtifactRef: string;
  rawArtifactSha256: string;
};

export const createSourceRetrievalResult = (
  prepared: PreparedSourceRetrieval,
  interpreted: InterpretedFirecrawlResponse,
  artifacts: SourceRetrievalArtifactInput
): SourceRetrievalResult => ({
  id: artifacts.retrievalId,
  runId: prepared.runId,
  providerItemId: prepared.providerItemId,
  attemptedAt: prepared.attemptedAt,
  receivedAt: artifacts.receivedAt,
  resolutionDepth: 1,
  outcome: interpreted.outcome,
  reason: interpreted.reason,
  approvalStatus: "not_requested",
  researchQuestion: prepared.researchQuestion,
  accessProvider: {
    name: "firecrawl",
    endpoint: FIRECRAWL_SCRAPE_ENDPOINT,
    httpStatus: interpreted.accessProviderHttpStatus,
    mediaType: artifacts.mediaType,
    ...(interpreted.accessProviderErrorCode
      ? { errorCode: interpreted.accessProviderErrorCode }
      : {})
  },
  source: {
    requestedUrl: prepared.sourceUrl,
    ...(interpreted.reportedSourceUrl
      ? { reportedSourceUrl: interpreted.reportedSourceUrl }
      : {}),
    ...(interpreted.finalUrl ? { finalUrl: interpreted.finalUrl } : {}),
    publisherHost: interpreted.sourceHost,
    ...(interpreted.targetStatusCode
      ? { statusCode: interpreted.targetStatusCode }
      : {}),
    redirectStatus: interpreted.redirectStatus,
    ...(interpreted.title ? { title: interpreted.title } : {}),
    ...(interpreted.description ? { description: interpreted.description } : {}),
    ...(interpreted.language ? { language: interpreted.language } : {}),
    ...(interpreted.contentType ? { contentType: interpreted.contentType } : {})
  },
  request: {
    format: "markdown",
    onlyMainContent: true,
    maxAge: 0,
    storeInCache: false,
    skipTlsVerification: false,
    timeoutMs: FIRECRAWL_REQUEST_TIMEOUT_MS
  },
  lineage: {
    intakeArtifactRef: artifacts.intakeArtifactRef,
    intakeArtifactSha256: artifacts.intakeArtifactSha256,
    requestArtifactRef: artifacts.requestArtifactRef,
    requestArtifactSha256: artifacts.requestArtifactSha256,
    rawArtifactRef: artifacts.rawArtifactRef,
    rawArtifactSha256: artifacts.rawArtifactSha256
  },
  ...(interpreted.outcome === "resolved" && interpreted.markdown
    ? {
        content: {
          format: "markdown" as const,
          trust: "untrusted" as const,
          characterCount: interpreted.markdown.length,
          body: interpreted.markdown
        }
      }
    : {}),
  limitations: interpreted.limitations
});