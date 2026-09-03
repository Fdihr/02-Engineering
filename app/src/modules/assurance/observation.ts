import type { SourceAnchor } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { observationId } from "./ids.js";
import type {
  AttributionKind,
  ClaimKind,
  DateRole,
  ExtractObservation,
  Observation,
  ProfilePolicy,
  QuoteMatchProvenance,
  QuoteMatchRule
} from "./types.js";
import {
  boundedString,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  validSha256
} from "./validators.js";

const OBSERVATION_KEYS = [
  "segment",
  "quote",
  "text",
  "claimKind",
  "attribution",
  "date",
  "actor",
  "action",
  "location",
  "affectedEntity",
  "irIds"
];

const ANCHOR_KEYS = [
  "sourceDocumentId",
  "sourceDocumentArtifactRef",
  "sourceDocumentArtifactSha256",
  "segmentId",
  "segmentSha256",
  "quote",
  "quoteStartUtf8Byte",
  "quoteEndUtf8Byte"
];

export const hasAllowedKeys = (
  value: Record<string, unknown>,
  allowed: string[]
): boolean => Object.keys(value).every((key) => allowed.includes(key));

/** Reads the observation fields a model or reviewer may author; anchors and ids stay with code. */
export const readExtractObservation = (
  value: unknown,
  policy: ProfilePolicy
): ExtractObservation | undefined => {
  if (!isRecord(value) || !hasAllowedKeys(value, OBSERVATION_KEYS)) {
    return undefined;
  }

  const segment = nonEmptyString(value.segment);
  const quote = typeof value.quote === "string" && value.quote ? value.quote : undefined;
  const text = boundedString(value.text, policy.limits.textMaxChars);
  const claimKind = policy.claimKinds.includes(value.claimKind as ClaimKind)
    ? (value.claimKind as ClaimKind)
    : undefined;
  if (!segment || !quote || !text || !claimKind || !isRecord(value.attribution)) {
    return undefined;
  }

  const attributionValue = value.attribution;
  if (!hasAllowedKeys(attributionValue, ["kind", "attributedTo"])) {
    return undefined;
  }
  const attributionKind = policy.attributionKinds.includes(
    attributionValue.kind as AttributionKind
  )
    ? (attributionValue.kind as AttributionKind)
    : undefined;
  if (!attributionKind) {
    return undefined;
  }
  const attributedTo =
    attributionValue.attributedTo === undefined
      ? undefined
      : boundedString(attributionValue.attributedTo, 240);
  if (attributionValue.attributedTo !== undefined && !attributedTo) {
    return undefined;
  }

  let date: ExtractObservation["date"];
  if (value.date !== undefined) {
    if (!isRecord(value.date) || !hasAllowedKeys(value.date, ["text", "role"])) {
      return undefined;
    }
    const dateText = boundedString(value.date.text, 120);
    const role = policy.dateRoles.includes(value.date.role as DateRole)
      ? (value.date.role as DateRole)
      : undefined;
    if (!dateText || !role) {
      return undefined;
    }
    date = { text: dateText, role };
  }

  const optionalField = (input: unknown): string | undefined | null => {
    if (input === undefined) {
      return undefined;
    }
    return boundedString(input, 240) ?? null;
  };
  const actor = optionalField(value.actor);
  const action = optionalField(value.action);
  const location = optionalField(value.location);
  const affectedEntity = optionalField(value.affectedEntity);
  if (
    actor === null ||
    action === null ||
    location === null ||
    affectedEntity === null
  ) {
    return undefined;
  }

  if (!Array.isArray(value.irIds) || value.irIds.length > 24) {
    return undefined;
  }
  const irIds = value.irIds.map((entry) => nonEmptyString(entry));
  if (!irIds.every((entry): entry is string => entry !== undefined)) {
    return undefined;
  }

  const observation: ExtractObservation = {
    segment,
    quote,
    text,
    claimKind,
    attribution: attributedTo
      ? { kind: attributionKind, attributedTo }
      : { kind: attributionKind },
    irIds
  };
  if (date) {
    observation.date = date;
  }
  if (actor) {
    observation.actor = actor;
  }
  if (action) {
    observation.action = action;
  }
  if (location) {
    observation.location = location;
  }
  if (affectedEntity) {
    observation.affectedEntity = affectedEntity;
  }
  return observation;
};

const readAnchor = (value: unknown): SourceAnchor | undefined => {
  if (!isRecord(value) || !hasOnlyKeys(value, ANCHOR_KEYS)) {
    return undefined;
  }
  const sourceDocumentId = nonEmptyString(value.sourceDocumentId);
  const sourceDocumentArtifactRef = nonEmptyString(value.sourceDocumentArtifactRef);
  const sourceDocumentArtifactSha256 = validSha256(value.sourceDocumentArtifactSha256);
  const segmentId = nonEmptyString(value.segmentId);
  const segmentSha256 = validSha256(value.segmentSha256);
  const quote = typeof value.quote === "string" && value.quote ? value.quote : undefined;
  const start = value.quoteStartUtf8Byte;
  const end = value.quoteEndUtf8Byte;
  if (
    !sourceDocumentId ||
    !sourceDocumentArtifactRef ||
    !sourceDocumentArtifactSha256 ||
    !segmentId ||
    !segmentSha256 ||
    !quote ||
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < 0 ||
    typeof end !== "number" ||
    !Number.isInteger(end) ||
    end <= start
  ) {
    return undefined;
  }
  return {
    sourceDocumentId,
    sourceDocumentArtifactRef,
    sourceDocumentArtifactSha256,
    segmentId,
    segmentSha256,
    quote,
    quoteStartUtf8Byte: start,
    quoteEndUtf8Byte: end
  };
};

export type ObservationError = "INVALID_OBSERVATION" | "OBSERVATION_ID_MISMATCH";

const KNOWN_QUOTE_MATCH_RULES = [
  "markdown-escape",
  "whitespace-collapse",
  "quote-variants",
  "nfc"
];

const readMatchedVia = (value: unknown): QuoteMatchProvenance | undefined => {
  if (value === "exact") {
    return "exact";
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    !value.every((entry) => KNOWN_QUOTE_MATCH_RULES.includes(entry as string))
  ) {
    return undefined;
  }
  return value as QuoteMatchRule[];
};

export const validateObservation = (
  value: unknown,
  policy: ProfilePolicy
): Result<Observation, ObservationError> => {
  if (!isRecord(value)) {
    return err("INVALID_OBSERVATION");
  }
  const {
    observationId: idValue,
    segmentId: segmentIdValue,
    anchor: anchorValue,
    origin,
    proposedQuote: proposedQuoteValue,
    matchedVia: matchedViaValue,
    ...rest
  } = value;
  const observation = readExtractObservation(rest, policy);
  const anchor = readAnchor(anchorValue);
  const id = nonEmptyString(idValue);
  const segmentId = nonEmptyString(segmentIdValue);
  const proposedQuote =
    typeof proposedQuoteValue === "string" && proposedQuoteValue.trim()
      ? proposedQuoteValue
      : undefined;
  const matchedVia = readMatchedVia(matchedViaValue);
  if (
    !observation ||
    !anchor ||
    !id ||
    !segmentId ||
    !proposedQuote ||
    !matchedVia ||
    (origin !== "model" && origin !== "human") ||
    anchor.segmentId !== segmentId ||
    anchor.quote !== observation.quote
  ) {
    return err("INVALID_OBSERVATION");
  }
  if (observationId(anchor, observation.claimKind, observation.text) !== id) {
    return err("OBSERVATION_ID_MISMATCH");
  }
  return ok({
    ...observation,
    observationId: id,
    segmentId,
    anchor,
    origin,
    proposedQuote,
    matchedVia
  });
};
