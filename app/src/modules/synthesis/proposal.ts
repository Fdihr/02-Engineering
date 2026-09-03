import { err, ok, type Result } from "../../core/result.js";
import { boundedString, isRecord } from "../assurance/validators.js";
import type { BuildClaimProposal, ExternalClaimKind } from "./types.js";

export const BUILD_CLAIM_FIELD_ALIASES = {
  statement: ["statement", "text"],
  kind: ["kind", "claimKind"],
  supportAliases: ["supportAliases", "support"],
  attributedTo: ["attributedTo"],
  analyticRationale: ["analyticRationale"],
  confidence: ["confidence"]
} as const;

export const BUILD_PROPOSAL_WRAPPERS = ["claims", "output", "result"] as const;

export const BUILD_RESPONSE_SHAPE_TEXT =
  "{ claims: Array<{ text | statement: string; kind | claimKind: reported-fact | statement | analytic-assessment | analytic-forecast; support | supportAliases: string[]; attributedTo?: string; analyticRationale?: string; confidence: { level: unknown | low | moderate | high; rationale: string } }> }";

export const createBuildResponseStructuralExample = (): unknown => ({
  claims: [
    {
      text: "<atomic claim statement>",
      kind: "statement",
      attributedTo: "<named speaker or upstream source>",
      support: ["<n#-o##>"],
      confidence: {
        level: "low",
        rationale: "<rationale tied to the selected evidence>"
      }
    }
  ]
});

export type BuildProposalParseError = "INVALID_BUILD_RESPONSE";

const claimKinds: ExternalClaimKind[] = [
  "reported-fact",
  "statement",
  "analytic-assessment",
  "analytic-forecast"
];
const confidenceLevels = ["unknown", "low", "moderate", "high"] as const;

export const readStrictAliasedValue = (
  value: Record<string, unknown>,
  aliases: readonly string[]
): { present: boolean; value?: unknown } | undefined => {
  const present = aliases.filter((alias) => alias in value);
  if (present.length > 1) return undefined;
  return present.length === 1
    ? { present: true, value: value[present[0] ?? ""] }
    : { present: false };
};

export const unwrapStrictArray = (
  value: unknown,
  wrappers: readonly string[]
): unknown[] | undefined => {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length !== 1) return undefined;
  const key = keys[0];
  if (!key || !wrappers.includes(key)) {
    return undefined;
  }
  const nested = value[key];
  return Array.isArray(nested) ? nested : unwrapStrictArray(nested, wrappers);
};

const readClaim = (value: unknown): BuildClaimProposal | undefined => {
  if (!isRecord(value)) return undefined;
  const allowedKeys = new Set(Object.values(BUILD_CLAIM_FIELD_ALIASES).flat());
  if (Object.keys(value).some((key) => !allowedKeys.has(key as never))) return undefined;

  const statementValue = readStrictAliasedValue(value, BUILD_CLAIM_FIELD_ALIASES.statement);
  const kindValue = readStrictAliasedValue(value, BUILD_CLAIM_FIELD_ALIASES.kind);
  const supportValue = readStrictAliasedValue(value, BUILD_CLAIM_FIELD_ALIASES.supportAliases);
  const attributedValue = readStrictAliasedValue(value, BUILD_CLAIM_FIELD_ALIASES.attributedTo);
  const analyticValue = readStrictAliasedValue(value, BUILD_CLAIM_FIELD_ALIASES.analyticRationale);
  const confidenceValue = readStrictAliasedValue(value, BUILD_CLAIM_FIELD_ALIASES.confidence);
  if (
    !statementValue?.present ||
    !kindValue?.present ||
    !supportValue?.present ||
    !confidenceValue?.present ||
    !attributedValue ||
    !analyticValue
  ) return undefined;

  const statement = boundedString(statementValue.value, 1_000);
  const kind = claimKinds.includes(kindValue.value as ExternalClaimKind)
    ? (kindValue.value as ExternalClaimKind)
    : undefined;
  const supportAliases = Array.isArray(supportValue.value)
    ? supportValue.value.map((entry) => boundedString(entry, 80))
    : undefined;
  const attributedTo = attributedValue.present
    ? boundedString(attributedValue.value, 240)
    : undefined;
  const analyticRationale = analyticValue.present
    ? boundedString(analyticValue.value, 1_000)
    : undefined;
  if (
    !statement ||
    !kind ||
    !supportAliases ||
    supportAliases.length === 0 ||
    !supportAliases.every((entry): entry is string => entry !== undefined) ||
    new Set(supportAliases).size !== supportAliases.length ||
    (attributedValue.present && !attributedTo) ||
    (analyticValue.present && !analyticRationale) ||
    !isRecord(confidenceValue.value) ||
    Object.keys(confidenceValue.value).length !== 2 ||
    !("level" in confidenceValue.value) ||
    !("rationale" in confidenceValue.value)
  ) return undefined;
  const level = confidenceLevels.includes(
    confidenceValue.value.level as (typeof confidenceLevels)[number]
  )
    ? (confidenceValue.value.level as BuildClaimProposal["confidence"]["level"])
    : undefined;
  const rationale = boundedString(confidenceValue.value.rationale, 1_000);
  if (!level || !rationale) return undefined;
  return {
    statement,
    kind,
    ...(attributedTo ? { attributedTo } : {}),
    ...(analyticRationale ? { analyticRationale } : {}),
    supportAliases,
    confidence: { level, rationale }
  };
};

export const parseBuildProposal = (
  value: unknown
): Result<{ claims: BuildClaimProposal[] }, BuildProposalParseError> => {
  const claims = unwrapStrictArray(value, BUILD_PROPOSAL_WRAPPERS);
  if (!claims || claims.length > 60) return err("INVALID_BUILD_RESPONSE");
  const parsed = claims.map(readClaim);
  return parsed.every((claim): claim is BuildClaimProposal => claim !== undefined)
    ? ok({ claims: parsed })
    : err("INVALID_BUILD_RESPONSE");
};