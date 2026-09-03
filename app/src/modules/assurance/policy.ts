import { err, ok, type Result } from "../../core/result.js";
import type {
  AttributionKind,
  ClaimKind,
  DateRole,
  Disposition,
  ProfilePolicy,
  QuoteMatchRule,
  ReviewVerdict
} from "./types.js";
import {
  boundedString,
  hasOnlyKeys,
  isRecord,
  positiveInteger
} from "./validators.js";

export type ProfilePolicyError =
  | "INVALID_PROFILE_POLICY"
  | "INVALID_POLICY_VALUES"
  | "INVALID_POLICY_LIMITS";

const CLAIM_KINDS: ClaimKind[] = ["event", "statement", "assessment", "forecast"];
const ATTRIBUTION_KINDS: AttributionKind[] = ["direct", "attributed", "relayed"];
const DATE_ROLES: DateRole[] = [
  "event",
  "reporting",
  "publication",
  "reference",
  "unknown"
];
const DISPOSITIONS: Disposition[] = [
  "covered",
  "partial",
  "silent",
  "contradicted"
];
const REVIEW_VERDICTS: ReviewVerdict[] = [
  "supported",
  "unsupported",
  "duplicate",
  "chrome"
];

const KNOWN_QUOTE_MATCH_RULES: QuoteMatchRule[] = [
  "markdown-escape",
  "whitespace-collapse",
  "quote-variants",
  "nfc"
];

const POLICY_KEYS = [
  "policyId",
  "claimKinds",
  "attributionKinds",
  "dateRoles",
  "dispositions",
  "reviewVerdicts",
  "quoteMatchRules",
  "limits"
];

const REQUIRED_POLICY_KEYS = POLICY_KEYS.filter(
  (key) => key !== "quoteMatchRules"
);

/** Absent rules mean exact-only matching; anything outside the closed set is rejected. */
const readQuoteMatchRules = (value: unknown): QuoteMatchRule[] | undefined => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rules = value.filter((entry): entry is QuoteMatchRule =>
    KNOWN_QUOTE_MATCH_RULES.includes(entry as QuoteMatchRule)
  );
  return rules.length === value.length && new Set(rules).size === rules.length
    ? rules
    : undefined;
};

const sameValues = <T extends string>(value: unknown, expected: T[]): T[] | undefined =>
  Array.isArray(value) &&
  value.length === expected.length &&
  expected.every((entry, index) => value[index] === entry)
    ? [...expected]
    : undefined;

export const validateProfilePolicy = (
  value: unknown
): Result<ProfilePolicy, ProfilePolicyError> => {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) => POLICY_KEYS.includes(key)) ||
    !REQUIRED_POLICY_KEYS.every((key) => key in value) ||
    !isRecord(value.limits)
  ) {
    return err("INVALID_PROFILE_POLICY");
  }

  const policyId = boundedString(value.policyId, 120);
  const claimKinds = sameValues(value.claimKinds, CLAIM_KINDS);
  const attributionKinds = sameValues(value.attributionKinds, ATTRIBUTION_KINDS);
  const dateRoles = sameValues(value.dateRoles, DATE_ROLES);
  const dispositions = sameValues(value.dispositions, DISPOSITIONS);
  const reviewVerdicts = sameValues(value.reviewVerdicts, REVIEW_VERDICTS);
  const quoteMatchRules = readQuoteMatchRules(value.quoteMatchRules);
  if (
    !policyId ||
    !claimKinds ||
    !attributionKinds ||
    !dateRoles ||
    !dispositions ||
    !reviewVerdicts ||
    !quoteMatchRules
  ) {
    return err("INVALID_POLICY_VALUES");
  }

  const limitsValue = value.limits;
  if (
    !hasOnlyKeys(limitsValue, [
      "quoteMinUtf8Bytes",
      "quoteMaxUtf8Bytes",
      "textMaxChars",
      "maxObservations",
      "maxAttempts"
    ])
  ) {
    return err("INVALID_POLICY_LIMITS");
  }

  const quoteMinUtf8Bytes = positiveInteger(limitsValue.quoteMinUtf8Bytes);
  const quoteMaxUtf8Bytes = positiveInteger(limitsValue.quoteMaxUtf8Bytes);
  const textMaxChars = positiveInteger(limitsValue.textMaxChars);
  const maxAttempts = positiveInteger(limitsValue.maxAttempts);
  const maxObservations = limitsValue.maxObservations;
  if (
    !quoteMinUtf8Bytes ||
    !quoteMaxUtf8Bytes ||
    !textMaxChars ||
    !maxAttempts ||
    typeof maxObservations !== "number" ||
    !Number.isInteger(maxObservations) ||
    maxObservations < 0 ||
    quoteMinUtf8Bytes > quoteMaxUtf8Bytes
  ) {
    return err("INVALID_POLICY_LIMITS");
  }

  return ok({
    policyId,
    claimKinds,
    attributionKinds,
    dateRoles,
    dispositions,
    reviewVerdicts,
    quoteMatchRules,
    limits: {
      quoteMinUtf8Bytes,
      quoteMaxUtf8Bytes,
      textMaxChars,
      maxObservations,
      maxAttempts
    }
  });
};
