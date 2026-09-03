import { err, ok, type Result } from "../../core/result.js";
import type { ClaimKind } from "../assurance/types.js";
import {
  isRecord,
  nonEmptyString,
  positiveInteger
} from "../assurance/validators.js";
import {
  OUTLET_IDENTITY_SCHEMA_VERSION,
  SYNTHESIS_POLICY_SCHEMA_VERSION,
  type ConfidenceCeilingRule,
  type ExternalClaimKind,
  type OutletIdentityTable,
  type ReliabilityBand,
  type SynthesisProfilePolicy
} from "./types.js";

export type SynthesisPolicyError =
  | "INVALID_OUTLET_IDENTITY_TABLE"
  | "INVALID_SYNTHESIS_POLICY";

const CLAIM_KINDS: ClaimKind[] = ["event", "statement", "assessment", "forecast"];
const EXTERNAL_CLAIM_KINDS: ExternalClaimKind[] = [
  "reported-fact",
  "statement",
  "analytic-assessment",
  "analytic-forecast"
];
const SOURCE_COUNTS = ["zero-or-unknown", "one", "two-plus"] as const;
const RELIABILITY: Array<ReliabilityBand | "any"> = [
  "unknown-or-limited",
  "established",
  "any"
];
const CONFIDENCE = ["unknown", "low", "moderate", "high"] as const;

const stringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.map((entry) => nonEmptyString(entry));
  return result.every((entry): entry is string => entry !== undefined)
    ? result
    : undefined;
};

export const validateOutletIdentityTable = (
  value: unknown
): Result<OutletIdentityTable, SynthesisPolicyError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== OUTLET_IDENTITY_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !positiveInteger(value.version) ||
    !Array.isArray(value.outlets)
  ) {
    return err("INVALID_OUTLET_IDENTITY_TABLE");
  }
  const outletIds = new Set<string>();
  const identities = new Set<string>();
  for (const outlet of value.outlets) {
    if (!isRecord(outlet)) {
      return err("INVALID_OUTLET_IDENTITY_TABLE");
    }
    const outletId = nonEmptyString(outlet.outletId);
    const canonicalName = nonEmptyString(outlet.canonicalName);
    const aliases = stringArray(outlet.aliases);
    const domains = stringArray(outlet.domains);
    if (!outletId || !canonicalName || !aliases || !domains || outletIds.has(outletId)) {
      return err("INVALID_OUTLET_IDENTITY_TABLE");
    }
    outletIds.add(outletId);
    for (const identity of [canonicalName, ...aliases, ...domains]) {
      const normalized = normalizeOutletIdentity(identity);
      if (identities.has(normalized)) {
        return err("INVALID_OUTLET_IDENTITY_TABLE");
      }
      identities.add(normalized);
    }
  }
  return ok(value as OutletIdentityTable);
};

export const validateSynthesisProfilePolicy = (
  value: unknown
): Result<SynthesisProfilePolicy, SynthesisPolicyError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SYNTHESIS_POLICY_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !positiveInteger(value.version) ||
    !nonEmptyString(value.outletIdentityTableId) ||
    !Array.isArray(value.claimKindRules) ||
    !Array.isArray(value.confidenceCeilingRules)
  ) {
    return err("INVALID_SYNTHESIS_POLICY");
  }
  const caveatPrefixes = stringArray(value.coverageCaveatPrefixes);
  if (!caveatPrefixes || caveatPrefixes.length === 0) {
    return err("INVALID_SYNTHESIS_POLICY");
  }
  const kindRows = new Set<ClaimKind>();
  for (const rule of value.claimKindRules) {
    if (!isRecord(rule)) {
      return err("INVALID_SYNTHESIS_POLICY");
    }
    const kind = rule.supportingObservationKind as ClaimKind;
    const permitted = stringArray(rule.permittedClaimKinds);
    if (
      !nonEmptyString(rule.id) ||
      !CLAIM_KINDS.includes(kind) ||
      kindRows.has(kind) ||
      !permitted ||
      permitted.some((entry) => !EXTERNAL_CLAIM_KINDS.includes(entry as ExternalClaimKind))
    ) {
      return err("INVALID_SYNTHESIS_POLICY");
    }
    kindRows.add(kind);
  }
  if (kindRows.size !== CLAIM_KINDS.length) {
    return err("INVALID_SYNTHESIS_POLICY");
  }

  const ceilingIds = new Set<string>();
  for (const rule of value.confidenceCeilingRules) {
    if (!isRecord(rule)) {
      return err("INVALID_SYNTHESIS_POLICY");
    }
    const typed = rule as unknown as ConfidenceCeilingRule;
    if (
      !nonEmptyString(typed.id) ||
      ceilingIds.has(typed.id) ||
      !SOURCE_COUNTS.includes(typed.independentSourceCount) ||
      !RELIABILITY.includes(typed.minimumSourceReliability) ||
      (typed.claimKind !== "any" && !EXTERNAL_CLAIM_KINDS.includes(typed.claimKind)) ||
      !CONFIDENCE.includes(typed.ceiling) ||
      (typed.testStatus !== "tested" && typed.testStatus !== "untested")
    ) {
      return err("INVALID_SYNTHESIS_POLICY");
    }
    ceilingIds.add(typed.id);
  }
  return ok(value as SynthesisProfilePolicy);
};

export const normalizeOutletIdentity = (value: string): string =>
  value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

export const resolveOutletId = (
  value: string | undefined,
  table: OutletIdentityTable
): string | undefined => {
  if (!value) {
    return undefined;
  }
  const target = normalizeOutletIdentity(value);
  return table.outlets.find((outlet) =>
    [outlet.canonicalName, ...outlet.aliases, ...outlet.domains]
      .map(normalizeOutletIdentity)
      .includes(target)
  )?.outletId;
};