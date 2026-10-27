import { err, ok, type Result } from "../../core/result.js";

export type SourceTier = {
  tier: number;
  id: string;
  label: string;
  basis: string;
  sourceTypes: string[];
  domains: string[];
};

export type SourceTierPolicy = {
  schemaVersion: "source-tier-policy-v1";
  id: string;
  version: number;
  defaultTier: number;
  tiers: SourceTier[];
};

export type SourceTierAssignment = {
  tier: number;
  tierId: string;
  tierLabel: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const lowerCaseStrings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => nonEmptyString(entry) !== undefined)
    ? value.map((entry) => (entry as string).trim().toLowerCase())
    : undefined;

export const readSourceTierPolicy = (
  value: unknown
): Result<SourceTierPolicy, "INVALID_SOURCE_TIER_POLICY"> => {
  if (!isRecord(value) || value.schemaVersion !== "source-tier-policy-v1" || !Array.isArray(value.tiers)) {
    return err("INVALID_SOURCE_TIER_POLICY");
  }
  const id = nonEmptyString(value.id);
  const version = value.version;
  const tiers: SourceTier[] = [];
  for (const entry of value.tiers) {
    if (!isRecord(entry) || !Number.isInteger(entry.tier)) {
      return err("INVALID_SOURCE_TIER_POLICY");
    }
    const tierId = nonEmptyString(entry.id);
    const label = nonEmptyString(entry.label);
    const basis = nonEmptyString(entry.basis);
    const sourceTypes = lowerCaseStrings(entry.sourceTypes);
    const domains = lowerCaseStrings(entry.domains);
    const previous = tiers.at(-1);
    if (!tierId || !label || !basis || !sourceTypes || !domains ||
        (previous && (entry.tier as number) <= previous.tier)) {
      return err("INVALID_SOURCE_TIER_POLICY");
    }
    tiers.push({ tier: entry.tier as number, id: tierId, label, basis, sourceTypes, domains });
  }
  if (
    !id ||
    !Number.isInteger(version) ||
    tiers.length === 0 ||
    new Set(tiers.map((tier) => tier.id)).size !== tiers.length ||
    !tiers.some((tier) => tier.tier === value.defaultTier)
  ) {
    return err("INVALID_SOURCE_TIER_POLICY");
  }
  return ok({
    schemaVersion: "source-tier-policy-v1",
    id,
    version: version as number,
    defaultTier: value.defaultTier as number,
    tiers
  });
};

const hostOf = (sourceUrl: string | undefined): string => {
  try {
    return sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
};

// Tiers only order and label leads; every lead keeps exactly one tier and none is dropped.
export const assignSourceTier = (
  policy: SourceTierPolicy,
  sourceType: string | undefined,
  sourceUrl: string | undefined
): SourceTierAssignment => {
  const type = sourceType?.toLowerCase() ?? "";
  const host = hostOf(sourceUrl);
  const matched =
    policy.tiers.find(
      (tier) =>
        (type !== "" && tier.sourceTypes.includes(type)) ||
        (host !== "" && tier.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)))
    ) ?? policy.tiers.find((tier) => tier.tier === policy.defaultTier);
  const tier = matched as SourceTier;
  return { tier: tier.tier, tierId: tier.id, tierLabel: tier.label };
};
