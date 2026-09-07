import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeKeyJudgementEligibility,
  parseKeyJudgementProposal,
  renderEligibilityForPrompt,
  validateKeyJudgementProposal,
  type ClaimForSelection,
  type KeyJudgementEligibility,
  type KeyJudgementPolicy,
  type KeyJudgementProposal
} from "./key-judgements.js";

const policy: KeyJudgementPolicy = {
  policyId: "memo-standard-v0",
  maxKeyJudgements: 3,
  allowContested: true,
  judgementTextMaxChars: 240
};

const requirementIds = ["ir-01", "ir-02", "ir-03"];

const claims: ClaimForSelection[] = [
  {
    claimId: "claim-a",
    requirementIds: ["ir-01"],
    status: "accepted",
    confidence: "moderate",
    ceiling: "moderate",
    provisional: false,
    openChallengeIds: []
  },
  {
    claimId: "claim-b",
    requirementIds: ["ir-01", "ir-02"],
    status: "contested",
    confidence: "low",
    ceiling: "low",
    provisional: true,
    openChallengeIds: ["ch-1", "ch-2"]
  },
  {
    claimId: "claim-c",
    requirementIds: ["ir-03"],
    status: "rejected",
    confidence: "low",
    ceiling: "low",
    provisional: false,
    openChallengeIds: []
  },
  {
    claimId: "claim-d",
    requirementIds: ["ir-02"],
    status: "accepted",
    confidence: "low",
    ceiling: "moderate",
    provisional: false,
    openChallengeIds: []
  }
];

const aliases = {
  "c-01": "claim-a",
  "c-02": "claim-b",
  "c-03": "claim-c",
  "c-04": "claim-d"
};

const eligibilityOrThrow = (): KeyJudgementEligibility => {
  const result = computeKeyJudgementEligibility(claims, requirementIds, policy);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("unreachable");
  }
  return result.value;
};

const failureChecks = (
  proposal: KeyJudgementProposal,
  override?: Partial<KeyJudgementPolicy>
): string[] => {
  const effective = { ...policy, ...override };
  const eligibility = computeKeyJudgementEligibility(
    claims,
    requirementIds,
    effective
  );
  assert.equal(eligibility.ok, true);
  if (!eligibility.ok) {
    throw new Error("unreachable");
  }
  const result = validateKeyJudgementProposal(
    proposal,
    aliases,
    claims,
    eligibility.value,
    effective
  );
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("unreachable");
  }
  assert.equal(result.error.code, "KEY_JUDGEMENT_PROPOSAL_INVALID");
  return result.error.failures.map((failure) => failure.check);
};

const validProposal: KeyJudgementProposal = {
  selections: [
    {
      requirementId: "ir-01",
      claim: "c-01",
      judgementText: "The visit is reported by a single relayed source."
    },
    {
      requirementId: "ir-02",
      claim: "c-04",
      judgementText: "Reported purpose rests on one attributed statement."
    }
  ],
  omissions: []
};

describe("computeKeyJudgementEligibility", () => {
  it("excludes rejected claims, orders by confidence then status then id, and lists gaps", () => {
    const eligibility = eligibilityOrThrow();
    assert.deepEqual(eligibility.eligibleByRequirement, {
      "ir-01": ["claim-a", "claim-b"],
      "ir-02": ["claim-d", "claim-b"]
    });
    assert.deepEqual(eligibility.requirementsWithoutEligibleClaim, ["ir-03"]);
  });

  it("excludes contested claims when the policy disallows them", () => {
    const result = computeKeyJudgementEligibility(claims, requirementIds, {
      ...policy,
      allowContested: false
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.value.eligibleByRequirement, {
      "ir-01": ["claim-a"],
      "ir-02": ["claim-d"]
    });
  });

  it("rejects duplicate claim ids", () => {
    const result = computeKeyJudgementEligibility(
      [...claims, claims[0] as ClaimForSelection],
      requirementIds,
      policy
    );
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.error.code, "DUPLICATE_CLAIM_ID");
  });

  it("rejects a claim answering an unapproved requirement", () => {
    const stray: ClaimForSelection = {
      ...(claims[0] as ClaimForSelection),
      claimId: "claim-x",
      requirementIds: ["ir-99"]
    };
    const result = computeKeyJudgementEligibility(
      [...claims, stray],
      requirementIds,
      policy
    );
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.error.code, "CLAIM_REQUIREMENT_NOT_APPROVED");
    assert.deepEqual(result.error.claimIds, ["claim-x"]);
  });

  it("rejects confidence above ceiling as a data error", () => {
    const inflated: ClaimForSelection = {
      ...(claims[3] as ClaimForSelection),
      claimId: "claim-y",
      confidence: "high"
    };
    const result = computeKeyJudgementEligibility(
      [...claims, inflated],
      requirementIds,
      policy
    );
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.error.code, "CLAIM_CONFIDENCE_EXCEEDS_CEILING");
  });

  it("rejects an invalid policy", () => {
    const result = computeKeyJudgementEligibility(claims, requirementIds, {
      ...policy,
      maxKeyJudgements: 0
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.error.code, "INVALID_POLICY");
  });
});

describe("parseKeyJudgementProposal", () => {
  it("accepts the exact shape", () => {
    const result = parseKeyJudgementProposal(validProposal);
    assert.equal(result.ok, true);
  });

  it("rejects unknown top-level keys", () => {
    const result = parseKeyJudgementProposal({
      ...validProposal,
      rationale: "x"
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.error.code, "KEY_JUDGEMENT_SHAPE_INVALID");
    assert.deepEqual(
      result.error.failures.map((failure) => failure.check),
      ["S1"]
    );
  });

  it("counts malformed entries without exposing content", () => {
    const result = parseKeyJudgementProposal({
      selections: [
        { requirementId: "ir-01", claim: "c-01" },
        { requirementId: "ir-02", claim: 4, judgementText: "t" }
      ],
      omissions: [{ requirementId: "ir-03" }]
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.deepEqual(
      result.error.failures.map((failure) => [failure.check, failure.count]),
      [
        ["S3", 2],
        ["S5", 1]
      ]
    );
  });
});

describe("validateKeyJudgementProposal", () => {
  it("accepts a bounded proposal and attaches claim-derived fields", () => {
    const eligibility = eligibilityOrThrow();
    const result = validateKeyJudgementProposal(
      validProposal,
      aliases,
      claims,
      eligibility,
      policy
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.policyId, "memo-standard-v0");
    assert.equal(result.value.selections.length, 2);
    assert.deepEqual(result.value.requirementsWithoutEligibleClaim, ["ir-03"]);
    assert.equal(result.value.provisional, false);
    assert.deepEqual(result.value.selections[0], {
      requirementId: "ir-01",
      claimId: "claim-a",
      judgementText: "The visit is reported by a single relayed source.",
      confidence: "moderate",
      ceiling: "moderate",
      status: "accepted",
      provisional: false,
      openChallengeIds: []
    });
  });

  it("carries open challenges and the provisional flag when a contested claim is selected", () => {
    const eligibility = eligibilityOrThrow();
    const proposal: KeyJudgementProposal = {
      selections: [
        {
          requirementId: "ir-01",
          claim: "c-02",
          judgementText: "Contested: the visit's date is disputed."
        }
      ],
      omissions: [
        {
          requirementId: "ir-02",
          reason: "Purpose claims rest on one statement; not decision-relevant yet."
        }
      ]
    };
    const result = validateKeyJudgementProposal(
      proposal,
      aliases,
      claims,
      eligibility,
      policy
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.value.selections[0]?.openChallengeIds, [
      "ch-1",
      "ch-2"
    ]);
    assert.equal(result.value.selections[0]?.status, "contested");
    assert.equal(result.value.provisional, true);
    assert.equal(result.value.omissions.length, 1);
  });

  it("KJ1: unknown alias", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-09", judgementText: "t" }
      ],
      omissions: [{ requirementId: "ir-02", reason: "r" }]
    });
    assert.deepEqual(checks, ["KJ1"]);
  });

  it("KJ2: unapproved requirement", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-01", judgementText: "t" },
        { requirementId: "ir-02", claim: "c-04", judgementText: "t" },
        { requirementId: "ir-77", claim: "c-01", judgementText: "t" }
      ],
      omissions: []
    });
    assert.deepEqual(checks, ["KJ2"]);
  });

  it("KJ3: claim not eligible for that requirement", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-04", judgementText: "t" },
        { requirementId: "ir-02", claim: "c-04", judgementText: "t" }
      ],
      omissions: []
    });
    assert.deepEqual(checks, ["KJ3"]);
  });

  it("KJ3: rejected claim is never eligible", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-01", judgementText: "t" },
        { requirementId: "ir-02", claim: "c-04", judgementText: "t" },
        { requirementId: "ir-03", claim: "c-03", judgementText: "t" }
      ],
      omissions: []
    });
    assert.deepEqual(checks, ["KJ3"]);
  });

  it("KJ4: two selections for one requirement", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-01", judgementText: "t" },
        { requirementId: "ir-01", claim: "c-02", judgementText: "t" },
        { requirementId: "ir-02", claim: "c-04", judgementText: "t" }
      ],
      omissions: []
    });
    assert.deepEqual(checks, ["KJ4"]);
  });

  it("KJ5: overall cap", () => {
    const checks = failureChecks(validProposal, { maxKeyJudgements: 1 });
    assert.deepEqual(checks, ["KJ5"]);
  });

  it("KJ6: requirement with eligible claims neither selected nor omitted", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-01", judgementText: "t" }
      ],
      omissions: []
    });
    assert.deepEqual(checks, ["KJ6"]);
  });

  it("KJ7: omission of a gap requirement, of a selected requirement, and without a reason", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-01", judgementText: "t" },
        { requirementId: "ir-02", claim: "c-04", judgementText: "t" }
      ],
      omissions: [
        { requirementId: "ir-03", reason: "gap, not an omission" },
        { requirementId: "ir-02", reason: "also selected" },
        { requirementId: "ir-01", reason: "  " }
      ]
    });
    assert.deepEqual(checks, ["KJ7"]);
  });

  it("KJ8: empty or oversized judgement text", () => {
    const proposal: KeyJudgementProposal = {
      selections: [
        { requirementId: "ir-01", claim: "c-01", judgementText: "   " },
        {
          requirementId: "ir-02",
          claim: "c-04",
          judgementText: "x".repeat(241)
        }
      ],
      omissions: []
    };
    const checks = failureChecks(proposal);
    assert.deepEqual(checks, ["KJ8"]);
    const eligibility = eligibilityOrThrow();
    const result = validateKeyJudgementProposal(
      proposal,
      aliases,
      claims,
      eligibility,
      policy
    );
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.error.failures[0]?.count, 2);
  });

  it("aggregates every failing check in one result", () => {
    const checks = failureChecks({
      selections: [
        { requirementId: "ir-01", claim: "c-09", judgementText: "" },
        { requirementId: "ir-77", claim: "c-01", judgementText: "t" }
      ],
      omissions: []
    });
    assert.deepEqual(checks, ["KJ1", "KJ2", "KJ6", "KJ8"]);
  });
});

describe("renderEligibilityForPrompt", () => {
  it("renders aliases per requirement, skips gaps, and never shows claim ids", () => {
    const eligibility = eligibilityOrThrow();
    const byClaimId = Object.fromEntries(
      Object.entries(aliases).map(([alias, claimId]) => [claimId, alias])
    );
    const text = renderEligibilityForPrompt(eligibility, byClaimId, policy);
    assert.match(text, /ir-01: eligible c-01, c-02/);
    assert.match(text, /ir-02: eligible c-04, c-02/);
    assert.doesNotMatch(text, /ir-03:/);
    assert.doesNotMatch(text, /claim-/);
  });
});