import { err, ok, type Result } from "../../core/result.js";
import type {
  AttributionKind,
  ClaimKind,
  DateRole,
  Disposition,
  ProfilePolicy,
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
    !hasOnlyKeys(value, [
      "policyId",
      "claimKinds",
      "attributionKinds",
      "dateRoles",
      "dispositions",
      "reviewVerdicts",
      "limits"
    ]) ||
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
  if (
    !policyId ||
    !claimKinds ||
    !attributionKinds ||
    !dateRoles ||
    !dispositions ||
    !reviewVerdicts
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
    limits: {
      quoteMinUtf8Bytes,
      quoteMaxUtf8Bytes,
      textMaxChars,
      maxObservations,
      maxAttempts
    }
  });
};
