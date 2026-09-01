import type {
  CollectionLead,
  ContentCompleteness,
  ContextItem,
  SeeristCollectionLineage,
  SeeristEvidenceCandidate
} from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  validateApprovedResearchQuestion,
  type ResearchQuestionError
} from "../research/research-question.js";

export type IntakeError =
  | "INVALID_SELECTION"
  | "UNSUPPORTED_PROVIDER"
  | "UNSUPPORTED_ENDPOINT"
  | "INVALID_RETRIEVED_AT"
  | "MISSING_RAW_ARTIFACT_REF"
  | "INVALID_RAW_ARTIFACT_SHA256"
  | "INVALID_COLLECTION_LINEAGE"
  | "INVALID_ITEM"
  | "MISSING_PROVIDER_ITEM_ID"
  | "MISSING_SOURCE_TYPE"
  | ResearchQuestionError;

export type ArtifactSelectionError =
  | "INVALID_FEATURE_COLLECTION"
  | "ITEM_ID_REQUIRED"
  | "ITEM_NOT_FOUND"
  | "DUPLICATE_ITEM_ID";

const CONTEXT_ENDPOINT_PREFIXES = [
  "/v1/wod/country-background/",
  "/v1/wod/risk-rating/",
  "/v2/pulse/"
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const providerIdentifier = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return nonEmptyString(value);
};

const sha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const pathSafeId = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized &&
    normalized !== "." &&
    normalized !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
    ? normalized
    : undefined;
};

const containsText = (value: unknown): boolean => {
  if (nonEmptyString(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsText);
  }

  return isRecord(value) && Object.values(value).some(containsText);
};

const capturedText = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const english = value.en;
  if (typeof english === "string" && english.trim()) {
    return english;
  }
  const localizedValues = Object.values(value).filter(
    (entry): entry is string => typeof entry === "string" && Boolean(entry.trim())
  );
  return localizedValues.length === 1 ? localizedValues[0] : undefined;
};

export const readSeeristCapturedBody = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const item = isRecord(value.properties) ? value.properties : value;
  return capturedText(item.sanitizedBody) ?? capturedText(item.body);
};

const contentCompleteness = (
  item: Record<string, unknown>,
  allowGenericContent: boolean
): ContentCompleteness => {
  if (
    readSeeristCapturedBody(item) ||
    (allowGenericContent && containsText(item.content))
  ) {
    return "captured_content";
  }

  if (containsText(item.sanitizedSummary) || containsText(item.summary)) {
    return "summary_only";
  }

  return "metadata_only";
};

const readCollectionLineage = (
  value: unknown,
  rawArtifactRef: string,
  rawArtifactSha256: string
): SeeristCollectionLineage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const operationId = pathSafeId(value.operationId);
  const requestManifestRef = nonEmptyString(value.requestManifestRef);
  const requestManifestSha256 = sha256(value.requestManifestSha256);
  const responseManifestRef = nonEmptyString(value.responseManifestRef);
  const responseManifestSha256 = sha256(value.responseManifestSha256);
  const lineageRawArtifactRef = nonEmptyString(value.rawArtifactRef);
  const lineageRawArtifactSha256 = sha256(value.rawArtifactSha256);
  if (
    !operationId ||
    !requestManifestRef ||
    !requestManifestSha256 ||
    !responseManifestRef ||
    !responseManifestSha256 ||
    lineageRawArtifactRef !== rawArtifactRef ||
    lineageRawArtifactSha256 !== rawArtifactSha256
  ) {
    return undefined;
  }
  return {
    operationId,
    requestManifestRef,
    requestManifestSha256,
    responseManifestRef,
    responseManifestSha256,
    rawArtifactRef: lineageRawArtifactRef,
    rawArtifactSha256: lineageRawArtifactSha256
  };
};

const stringValues = (...values: unknown[]): string[] =>
  values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => nonEmptyString(entry) ?? []);
    }

    return nonEmptyString(value) ?? [];
  });

const isContextEndpoint = (endpoint: string): boolean =>
  CONTEXT_ENDPOINT_PREFIXES.some((prefix) => endpoint.startsWith(prefix));

const isSupportedEndpoint = (endpoint: string): boolean =>
  endpoint === "/v1/wod" || isContextEndpoint(endpoint);

export const selectSeeristFeature = (
  payload: unknown,
  itemId: string
): Result<Record<string, unknown>, ArtifactSelectionError> => {
  if (!itemId.trim()) {
    return err("ITEM_ID_REQUIRED");
  }
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    return err("INVALID_FEATURE_COLLECTION");
  }

  const matches = payload.features.filter((feature) => {
    if (!isRecord(feature) || !isRecord(feature.properties)) {
      return false;
    }

    const providerItemId =
      providerIdentifier(feature.properties.id) ?? providerIdentifier(feature.id);
    return providerItemId === itemId;
  });

  if (matches.length === 0) {
    return err("ITEM_NOT_FOUND");
  }
  if (matches.length > 1) {
    return err("DUPLICATE_ITEM_ID");
  }

  const selected = matches[0];
  return isRecord(selected) ? ok(selected) : err("INVALID_FEATURE_COLLECTION");
};

export const validateSource = (
  input: unknown
): Result<SeeristEvidenceCandidate | CollectionLead | ContextItem, IntakeError> => {
  if (!isRecord(input)) {
    return err("INVALID_SELECTION");
  }
  if (input.provider !== "seerist") {
    return err("UNSUPPORTED_PROVIDER");
  }

  const endpoint = nonEmptyString(input.endpoint);
  if (!endpoint || !isSupportedEndpoint(endpoint)) {
    return err("UNSUPPORTED_ENDPOINT");
  }

  const retrievedAt = nonEmptyString(input.retrievedAt);
  if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) {
    return err("INVALID_RETRIEVED_AT");
  }

  const rawArtifactRef = nonEmptyString(input.rawArtifactRef);
  if (!rawArtifactRef) {
    return err("MISSING_RAW_ARTIFACT_REF");
  }
  const rawArtifactSha256 = sha256(input.rawArtifactSha256);
  if (!rawArtifactSha256) {
    return err("INVALID_RAW_ARTIFACT_SHA256");
  }
  const collectionLineage = readCollectionLineage(
    input.collectionLineage,
    rawArtifactRef,
    rawArtifactSha256
  );
  if (!collectionLineage) {
    return err("INVALID_COLLECTION_LINEAGE");
  }

  const researchQuestionResult = validateApprovedResearchQuestion(
    input.researchQuestion,
    retrievedAt
  );
  if (!researchQuestionResult.ok) {
    return researchQuestionResult;
  }

  if (!isRecord(input.item)) {
    return err("INVALID_ITEM");
  }

  const rawItem = input.item;
  const item = isRecord(rawItem.properties) ? rawItem.properties : rawItem;
  const providerItemId = providerIdentifier(item.id) ?? providerIdentifier(rawItem.id);
  const sourceValue = nonEmptyString(item.source);
  const sourceType = sourceValue?.startsWith("http") ? undefined : sourceValue;
  const contextMaterial = isContextEndpoint(endpoint) || sourceType === "country-background";
  const completeness = contentCompleteness(item, contextMaterial);
  const references = Array.isArray(item.references) ? item.references : [];
  const base = {
    provider: "seerist" as const,
    endpoint,
    providerItemId,
    sourceType,
    providerTimestamp: nonEmptyString(item["@timestamp"]) ?? nonEmptyString(item.publishedDate),
    retrievedAt,
    rawArtifactRef,
    rawArtifactSha256,
    collectionLineage,
    sourceLinks: stringValues(
      item.link,
      item.source_url,
      sourceValue?.startsWith("http") ? sourceValue : undefined
    ),
    referenceCount: references.length,
    hasSourceMetadata: isRecord(item.source_metadata),
    researchQuestion: researchQuestionResult.value
  };

  if (isContextEndpoint(endpoint) || sourceType === "country-background") {
    return ok({
      ...base,
      role: "context",
      contentCompleteness: completeness
    });
  }

  if (!providerItemId) {
    return err("MISSING_PROVIDER_ITEM_ID");
  }
  if (!sourceType) {
    return err("MISSING_SOURCE_TYPE");
  }

  if (sourceType === "analysis" && completeness === "captured_content") {
    return ok({
      ...base,
      providerItemId,
      role: "evidence_candidate",
      contentCompleteness: "captured_content"
    });
  }

  return ok({
    ...base,
    providerItemId,
    role: "collection_lead",
    contentCompleteness: completeness
  });
};
