/**
 * Bounded key-judgement selection.
 *
 * Division of labour, same as every other stage:
 *   - code computes the eligible set per approved requirement (IR) from adjudicated claims;
 *   - the model's judgement is limited to choosing one eligible claim per IR (or declaring
 *     an explicit omission) and wording the judgement;
 *   - code validates the proposal against the eligible set and the policy cap, and attaches
 *     confidence, ceiling, status, provisional flag and open challenges from the claim.
 *
 * The model never restates confidence, never copies challenge ids, and never sees claim
 * ids: the prompt layer renders claims by alias, and validation resolves aliases first.
 *
 * Integration notes (adjust to the repo's actual types):
 *   - `ClaimForSelection` is a projection of the committed synthesis claim; build it in
 *     the record layer from the claim's id, code-derived IR coverage, adjudicated status,
 *     confidence, ceiling, provisional flag and open challenge ids.
 *   - `KeyJudgementPolicy` values come from the memo standard pack. Until a curated pack
 *     exists, `maxKeyJudgements` is provisional and should be marked so in the pack.
 *   - `CheckFailure` mirrors the assurance module's shape (check, count, rule) so the
 *     existing retry-feedback rendering can be reused unchanged.
 */
import { err, ok, type Result } from "../../core/result.js";

export type Confidence = "low" | "moderate" | "high";
export type SelectableStatus = "accepted" | "contested";

export type CheckFailure = {
  check: string;
  count: number;
  rule: string;
};

export type KeyJudgementPolicy = {
  policyId: string;
  /** Overall cap on key judgements per memo. Provisional until a memo standard pack sets it. */
  maxKeyJudgements: number;
  /** Whether contested claims may be key judgements. Their open challenges are attached by code. */
  allowContested: boolean;
  judgementTextMaxChars: number;
};

/** Projection of an adjudicated claim, as far as selection needs to know. */
export type ClaimForSelection = {
  claimId: string;
  /** Approved IR ids this claim answers, from the code-derived coverage rollup. */
  requirementIds: string[];
  status: "accepted" | "contested" | "rejected";
  confidence: Confidence;
  ceiling: Confidence;
  provisional: boolean;
  openChallengeIds: string[];
};

export type KeyJudgementEligibility = {
  policyId: string;
  requirementIds: string[];
  /** IR id -> eligible claim ids, best candidate first. Only IRs with at least one eligible claim appear. */
  eligibleByRequirement: Record<string, string[]>;
  /** IRs with no eligible claim: these are gaps, not omissions, and need no model input. */
  requirementsWithoutEligibleClaim: string[];
};

export type EligibilityError =
  | { code: "DUPLICATE_CLAIM_ID"; claimIds: string[] }
  | { code: "CLAIM_REQUIREMENT_NOT_APPROVED"; claimIds: string[] }
  | { code: "CLAIM_CONFIDENCE_EXCEEDS_CEILING"; claimIds: string[] }
  | { code: "INVALID_POLICY"; failures: CheckFailure[] };

/** What the model returns. `claim` is an alias rendered by the prompt layer, never a claim id. */
export type KeyJudgementProposal = {
  selections: Array<{
    requirementId: string;
    claim: string;
    judgementText: string;
  }>;
  omissions: Array<{
    requirementId: string;
    reason: string;
  }>;
};

export type SelectedKeyJudgement = {
  requirementId: string;
  claimId: string;
  judgementText: string;
  confidence: Confidence;
  ceiling: Confidence;
  status: SelectableStatus;
  provisional: boolean;
  /** Attached by code from the claim. A contested key judgement carries its contest. */
  openChallengeIds: string[];
};

export type KeyJudgementSelection = {
  policyId: string;
  selections: SelectedKeyJudgement[];
  omissions: Array<{ requirementId: string; reason: string }>;
  requirementsWithoutEligibleClaim: string[];
  /** True when any selected claim is provisional. */
  provisional: boolean;
};

export type KeyJudgementError =
  | { code: "KEY_JUDGEMENT_SHAPE_INVALID"; failures: CheckFailure[] }
  | { code: "KEY_JUDGEMENT_PROPOSAL_INVALID"; failures: CheckFailure[] };

export type ClaimAliasMap = Record<string, string>;

const CONFIDENCE_RANK: Record<Confidence, number> = {
  low: 0,
  moderate: 1,
  high: 2
};
const STATUS_RANK: Record<SelectableStatus, number> = {
  accepted: 0,
  contested: 1
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => key in value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePolicy = (policy: KeyJudgementPolicy): CheckFailure[] => {
  const failures: CheckFailure[] = [];
  if (!isNonEmptyString(policy.policyId)) {
    failures.push({
      check: "P1",
      count: 1,
      rule: "policyId must be a non-empty string"
    });
  }
  if (!Number.isInteger(policy.maxKeyJudgements) || policy.maxKeyJudgements < 1) {
    failures.push({
      check: "P2",
      count: 1,
      rule: "maxKeyJudgements must be an integer of at least 1"
    });
  }
  if (
    !Number.isInteger(policy.judgementTextMaxChars) ||
    policy.judgementTextMaxChars < 1
  ) {
    failures.push({
      check: "P3",
      count: 1,
      rule: "judgementTextMaxChars must be an integer of at least 1"
    });
  }
  return failures;
};

/**
 * Deterministic. Order within an IR: higher confidence first, then accepted before contested,
 * then claim id, so the rendering order the model sees is stable across runs.
 */
export const computeKeyJudgementEligibility = (
  claims: readonly ClaimForSelection[],
  requirementIds: readonly string[],
  policy: KeyJudgementPolicy
): Result<KeyJudgementEligibility, EligibilityError> => {
  const policyFailures = validatePolicy(policy);
  if (policyFailures.length > 0) {
    return err({ code: "INVALID_POLICY", failures: policyFailures });
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const claim of claims) {
    if (seen.has(claim.claimId)) {
      duplicates.add(claim.claimId);
    }
    seen.add(claim.claimId);
  }
  if (duplicates.size > 0) {
    return err({ code: "DUPLICATE_CLAIM_ID", claimIds: [...duplicates].sort() });
  }

  const approved = new Set(requirementIds);
  const unapproved = claims
    .filter((claim) =>
      claim.requirementIds.some((requirementId) => !approved.has(requirementId))
    )
    .map((claim) => claim.claimId)
    .sort();
  if (unapproved.length > 0) {
    return err({ code: "CLAIM_REQUIREMENT_NOT_APPROVED", claimIds: unapproved });
  }

  const overCeiling = claims
    .filter(
      (claim) =>
        CONFIDENCE_RANK[claim.confidence] > CONFIDENCE_RANK[claim.ceiling]
    )
    .map((claim) => claim.claimId)
    .sort();
  if (overCeiling.length > 0) {
    return err({
      code: "CLAIM_CONFIDENCE_EXCEEDS_CEILING",
      claimIds: overCeiling
    });
  }

  const eligible = claims.filter(
    (claim): claim is ClaimForSelection & { status: SelectableStatus } =>
      claim.status === "accepted" ||
      (claim.status === "contested" && policy.allowContested)
  );

  const eligibleByRequirement: Record<string, string[]> = {};
  const withoutEligible: string[] = [];
  for (const requirementId of requirementIds) {
    const candidates = eligible
      .filter((claim) => claim.requirementIds.includes(requirementId))
      .sort((left, right) => {
        const byConfidence =
          CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
        if (byConfidence !== 0) {
          return byConfidence;
        }
        const byStatus =
          STATUS_RANK[left.status] - STATUS_RANK[right.status];
        if (byStatus !== 0) {
          return byStatus;
        }
        return left.claimId < right.claimId
          ? -1
          : left.claimId > right.claimId
            ? 1
            : 0;
      })
      .map((claim) => claim.claimId);
    if (candidates.length === 0) {
      withoutEligible.push(requirementId);
    } else {
      eligibleByRequirement[requirementId] = candidates;
    }
  }

  return ok({
    policyId: policy.policyId,
    requirementIds: [...requirementIds],
    eligibleByRequirement,
    requirementsWithoutEligibleClaim: withoutEligible
  });
};

/** Shape only. Exact keys, no unknown fields; the record layer's safe unwrapping runs before this. */
export const parseKeyJudgementProposal = (
  value: unknown
): Result<KeyJudgementProposal, KeyJudgementError> => {
  const failures: CheckFailure[] = [];
  const fail = (check: string, rule: string): void => {
    failures.push({ check, count: 1, rule });
  };

  if (!isRecord(value) || !hasOnlyKeys(value, ["selections", "omissions"])) {
    return err({
      code: "KEY_JUDGEMENT_SHAPE_INVALID",
      failures: [
        {
          check: "S1",
          count: 1,
          rule: "response must be an object with exactly selections and omissions"
        }
      ]
    });
  }

  const selections: KeyJudgementProposal["selections"] = [];
  if (!Array.isArray(value.selections)) {
    fail("S2", "selections must be an array");
  } else {
    let bad = 0;
    for (const entry of value.selections) {
      if (
        isRecord(entry) &&
        hasOnlyKeys(entry, ["requirementId", "claim", "judgementText"]) &&
        isNonEmptyString(entry.requirementId) &&
        isNonEmptyString(entry.claim) &&
        typeof entry.judgementText === "string"
      ) {
        selections.push({
          requirementId: entry.requirementId,
          claim: entry.claim,
          judgementText: entry.judgementText
        });
      } else {
        bad += 1;
      }
    }
    if (bad > 0) {
      failures.push({
        check: "S3",
        count: bad,
        rule: "each selection has exactly requirementId, claim and judgementText, all strings"
      });
    }
  }

  const omissions: KeyJudgementProposal["omissions"] = [];
  if (!Array.isArray(value.omissions)) {
    fail("S4", "omissions must be an array");
  } else {
    let bad = 0;
    for (const entry of value.omissions) {
      if (
        isRecord(entry) &&
        hasOnlyKeys(entry, ["requirementId", "reason"]) &&
        isNonEmptyString(entry.requirementId) &&
        typeof entry.reason === "string"
      ) {
        omissions.push({
          requirementId: entry.requirementId,
          reason: entry.reason
        });
      } else {
        bad += 1;
      }
    }
    if (bad > 0) {
      failures.push({
        check: "S5",
        count: bad,
        rule: "each omission has exactly requirementId and reason, both strings"
      });
    }
  }

  if (failures.length > 0) {
    return err({ code: "KEY_JUDGEMENT_SHAPE_INVALID", failures });
  }
  return ok({ selections, omissions });
};

/**
 * All checks run; failures are aggregated so retry feedback carries the whole list.
 * Failures carry counts and rules only, never proposal content.
 */
export const validateKeyJudgementProposal = (
  proposal: KeyJudgementProposal,
  aliases: ClaimAliasMap,
  claims: readonly ClaimForSelection[],
  eligibility: KeyJudgementEligibility,
  policy: KeyJudgementPolicy
): Result<KeyJudgementSelection, KeyJudgementError> => {
  const failures: CheckFailure[] = [];
  const add = (check: string, count: number, rule: string): void => {
    if (count > 0) {
      failures.push({ check, count, rule });
    }
  };

  const claimsById = new Map(
    claims.map((claim) => [claim.claimId, claim] as const)
  );
  const approved = new Set(eligibility.requirementIds);
  const eligibleRequirements = new Set(
    Object.keys(eligibility.eligibleByRequirement)
  );

  // KJ1: every alias resolves to a known claim.
  let unresolved = 0;
  const resolved: Array<{
    requirementId: string;
    claimId: string | null;
    judgementText: string;
  }> = [];
  for (const selection of proposal.selections) {
    const claimId = aliases[selection.claim];
    if (claimId === undefined || !claimsById.has(claimId)) {
      unresolved += 1;
      resolved.push({
        requirementId: selection.requirementId,
        claimId: null,
        judgementText: selection.judgementText
      });
    } else {
      resolved.push({
        requirementId: selection.requirementId,
        claimId,
        judgementText: selection.judgementText
      });
    }
  }
  add(
    "KJ1",
    unresolved,
    "every claim reference must be one of the aliases listed in the request"
  );

  // KJ2: requirement ids are approved (selections and omissions).
  const unapprovedSelections = resolved.filter(
    (entry) => !approved.has(entry.requirementId)
  ).length;
  const unapprovedOmissions = proposal.omissions.filter(
    (entry) => !approved.has(entry.requirementId)
  ).length;
  add(
    "KJ2",
    unapprovedSelections + unapprovedOmissions,
    "every requirementId must be an approved IR id"
  );

  // KJ3: the chosen claim is eligible for that requirement.
  const ineligible = resolved.filter((entry) => {
    if (entry.claimId === null || !approved.has(entry.requirementId)) {
      return false;
    }
    const candidates =
      eligibility.eligibleByRequirement[entry.requirementId] ?? [];
    return !candidates.includes(entry.claimId);
  }).length;
  add(
    "KJ3",
    ineligible,
    "a key judgement may only use a claim listed as eligible for that requirement"
  );

  // KJ4: at most one selection per requirement.
  const selectionCounts = new Map<string, number>();
  for (const entry of resolved) {
    selectionCounts.set(
      entry.requirementId,
      (selectionCounts.get(entry.requirementId) ?? 0) + 1
    );
  }
  const duplicatedRequirements = [...selectionCounts.values()].filter(
    (count) => count > 1
  ).length;
  add("KJ4", duplicatedRequirements, "at most one key judgement per requirement");

  // KJ5: overall cap.
  add(
    "KJ5",
    proposal.selections.length > policy.maxKeyJudgements ? 1 : 0,
    `at most ${policy.maxKeyJudgements} key judgements in total`
  );

  // KJ6: every requirement with eligible claims is either selected or explicitly omitted.
  const omittedRequirements = new Set(
    proposal.omissions.map((entry) => entry.requirementId)
  );
  const selectedRequirements = new Set(
    resolved.map((entry) => entry.requirementId)
  );
  const unaddressed = [...eligibleRequirements].filter(
    (requirementId) =>
      !selectedRequirements.has(requirementId) &&
      !omittedRequirements.has(requirementId)
  ).length;
  add(
    "KJ6",
    unaddressed,
    "every requirement with an eligible claim needs a key judgement or an explicit omission"
  );

  // KJ7: omissions only for eligible, unselected requirements, once, with a reason.
  const omissionCounts = new Map<string, number>();
  for (const entry of proposal.omissions) {
    omissionCounts.set(
      entry.requirementId,
      (omissionCounts.get(entry.requirementId) ?? 0) + 1
    );
  }
  const badOmissions =
    proposal.omissions.filter(
      (entry) =>
        approved.has(entry.requirementId) &&
        (!eligibleRequirements.has(entry.requirementId) ||
          selectedRequirements.has(entry.requirementId) ||
          !isNonEmptyString(entry.reason))
    ).length +
    [...omissionCounts.values()].filter((count) => count > 1).length;
  add(
    "KJ7",
    badOmissions,
    "an omission names a requirement that has eligible claims, is not also selected, appears once, and gives a reason"
  );

  // KJ8: judgement text bounds.
  const badText = resolved.filter(
    (entry) =>
      !isNonEmptyString(entry.judgementText) ||
      entry.judgementText.length > policy.judgementTextMaxChars
  ).length;
  add(
    "KJ8",
    badText,
    `judgementText must be non-empty and at most ${policy.judgementTextMaxChars} characters`
  );

  if (failures.length > 0) {
    return err({ code: "KEY_JUDGEMENT_PROPOSAL_INVALID", failures });
  }

  const selections: SelectedKeyJudgement[] = resolved.map((entry) => {
    const claim = claimsById.get(entry.claimId as string) as ClaimForSelection & {
      status: SelectableStatus;
    };
    return {
      requirementId: entry.requirementId,
      claimId: claim.claimId,
      judgementText: entry.judgementText.trim(),
      confidence: claim.confidence,
      ceiling: claim.ceiling,
      status: claim.status,
      provisional: claim.provisional,
      openChallengeIds: [...claim.openChallengeIds]
    };
  });

  return ok({
    policyId: policy.policyId,
    selections,
    omissions: proposal.omissions.map((entry) => ({
      requirementId: entry.requirementId,
      reason: entry.reason.trim()
    })),
    requirementsWithoutEligibleClaim: [
      ...eligibility.requirementsWithoutEligibleClaim
    ],
    provisional: selections.some((selection) => selection.provisional)
  });
};

/**
 * Prompt-side rendering of the bounded choice. Content-free of claim ids: the model sees
 * aliases, the IRs, and per-IR the eligible aliases in the eligibility order. Claim text is
 * rendered by the caller next to each alias; this helper only fixes the structure.
 */
export const renderEligibilityForPrompt = (
  eligibility: KeyJudgementEligibility,
  aliasesByClaimId: Record<string, string>,
  policy: KeyJudgementPolicy
): string => {
  const lines: string[] = [];
  lines.push(
    `Key judgements: at most ${policy.maxKeyJudgements} in total, at most one per requirement.`
  );
  lines.push(
    "For each requirement below, choose one eligible claim or declare an explicit omission with a reason."
  );
  lines.push(
    "Requirements with no eligible claim are already recorded as gaps; do not address them."
  );
  for (const requirementId of eligibility.requirementIds) {
    const candidates = eligibility.eligibleByRequirement[requirementId];
    if (candidates === undefined) {
      continue;
    }
    const rendered = candidates
      .map((claimId) => aliasesByClaimId[claimId] ?? "?")
      .join(", ");
    lines.push(`${requirementId}: eligible ${rendered}`);
  }
  return lines.join("\n");
};