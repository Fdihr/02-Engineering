import type { CapturedSourceContent } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

export type RetrievedSourceAdapterError =
  | "INVALID_RETRIEVAL_RESULT"
  | "RETRIEVAL_NOT_RESOLVED"
  | "INVALID_RETRIEVAL_CONTENT"
  | "INVALID_RETRIEVAL_LINEAGE"
  | "INVALID_SOURCE_ARTIFACT";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const validSha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const pathSafeId = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized &&
    normalized !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
    ? normalized
    : undefined;
};

export const adaptRetrievedSourceContent = (
  retrievalValue: unknown,
  sourceArtifactRefValue: unknown,
  sourceArtifactSha256Value: unknown
): Result<CapturedSourceContent, RetrievedSourceAdapterError> => {
  const sourceArtifactRef = nonEmptyString(sourceArtifactRefValue);
  const sourceArtifactSha256 = validSha256(sourceArtifactSha256Value);
  if (!sourceArtifactRef || !sourceArtifactSha256) {
    return err("INVALID_SOURCE_ARTIFACT");
  }
  if (!isRecord(retrievalValue)) {
    return err("INVALID_RETRIEVAL_RESULT");
  }

  const retrievalId = pathSafeId(retrievalValue.id);
  const runId = pathSafeId(retrievalValue.runId);
  if (
    !retrievalId ||
    !runId ||
    retrievalValue.resolutionDepth !== 1 ||
    retrievalValue.approvalStatus !== "not_requested" ||
    !isRecord(retrievalValue.accessProvider) ||
    retrievalValue.accessProvider.name !== "firecrawl" ||
    retrievalValue.accessProvider.endpoint !== FIRECRAWL_ENDPOINT ||
    typeof retrievalValue.accessProvider.httpStatus !== "number" ||
    retrievalValue.accessProvider.httpStatus < 200 ||
    retrievalValue.accessProvider.httpStatus >= 300 ||
    !isRecord(retrievalValue.request)
  ) {
    return err("INVALID_RETRIEVAL_RESULT");
  }
  if (
    retrievalValue.outcome !== "resolved" ||
    retrievalValue.reason !== "content_retrieved"
  ) {
    return err("RETRIEVAL_NOT_RESOLVED");
  }
  if (
    retrievalValue.request.format !== "markdown" ||
    retrievalValue.request.onlyMainContent !== true ||
    retrievalValue.request.maxAge !== 0 ||
    retrievalValue.request.storeInCache !== false ||
    retrievalValue.request.skipTlsVerification !== false ||
    !isRecord(retrievalValue.content)
  ) {
    return err("INVALID_RETRIEVAL_RESULT");
  }

  const body = nonEmptyString(retrievalValue.content.body);
  if (
    !body ||
    retrievalValue.content.format !== "markdown" ||
    retrievalValue.content.trust !== "untrusted" ||
    retrievalValue.content.characterCount !== body.length
  ) {
    return err("INVALID_RETRIEVAL_CONTENT");
  }
  if (!isRecord(retrievalValue.lineage)) {
    return err("INVALID_RETRIEVAL_LINEAGE");
  }

  const intakeArtifactRef = nonEmptyString(retrievalValue.lineage.intakeArtifactRef);
  const intakeArtifactSha256 = validSha256(
    retrievalValue.lineage.intakeArtifactSha256
  );
  const requestArtifactRef = nonEmptyString(
    retrievalValue.lineage.requestArtifactRef
  );
  const requestArtifactSha256 = validSha256(
    retrievalValue.lineage.requestArtifactSha256
  );
  const rawArtifactRef = nonEmptyString(retrievalValue.lineage.rawArtifactRef);
  const rawArtifactSha256 = validSha256(retrievalValue.lineage.rawArtifactSha256);
  if (
    !intakeArtifactRef ||
    !intakeArtifactSha256 ||
    !requestArtifactRef ||
    !requestArtifactSha256 ||
    !rawArtifactRef ||
    !rawArtifactSha256
  ) {
    return err("INVALID_RETRIEVAL_LINEAGE");
  }

  return ok({
    runId,
    sourceItemId: retrievalId,
    sourceKind: "retrieved-publisher",
    contentFormat: "markdown",
    body,
    sourceArtifactRef,
    sourceArtifactSha256,
    lineageArtifactRefs: [
      { artifactRef: intakeArtifactRef, artifactSha256: intakeArtifactSha256 },
      { artifactRef: requestArtifactRef, artifactSha256: requestArtifactSha256 },
      { artifactRef: rawArtifactRef, artifactSha256: rawArtifactSha256 }
    ]
  });
};