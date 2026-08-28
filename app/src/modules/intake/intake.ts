import type { ContentCompleteness, ProviderItem } from "../../core/types.js";
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

const containsText = (value: unknown): boolean => {
  if (nonEmptyString(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsText);
  }

  return isRecord(value) && Object.values(value).some(containsText);
};

const contentCompleteness = (item: Record<string, unknown>): ContentCompleteness => {
  if (containsText(item.sanitizedBody) || containsText(item.body) || containsText(item.content)) {
    return "captured_content";
  }

  if (containsText(item.sanitizedSummary) || containsText(item.summary)) {
    return "summary_only";
  }

  return "metadata_only";
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

export const validateSource = (input: unknown): Result<ProviderItem, IntakeError> => {
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
  const completeness = contentCompleteness(item);
  const references = Array.isArray(item.references) ? item.references : [];
  const base = {
    provider: "seerist" as const,
    endpoint,
    providerItemId,
    sourceType,
    providerTimestamp: nonEmptyString(item["@timestamp"]) ?? nonEmptyString(item.publishedDate),
    retrievedAt,
    rawArtifactRef,
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
