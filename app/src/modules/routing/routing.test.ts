import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "../../core/types.js";
import { decideRoute } from "./routing.js";

const source = (overrides: Partial<SourceRecord> = {}): SourceRecord => ({
  sourceId: "SRC-TEST-001",
  title: "Routine source",
  body: "Collected material awaiting review.",
  confidentiality: "internal",
  ...overrides
});

test("routes restricted content to controlled handling", () => {
  const decision = decideRoute(source({ confidentiality: "restricted" }));

  assert.equal(decision.destination, "archive");
  assert.equal(decision.ruleId, "RULE-RESTRICTED-001");
});

test("does not approve content based on delivery-like wording", () => {
  const decision = decideRoute(source({ title: "Final Report Executive Summary" }));

  assert.equal(decision.destination, "analysis");
  assert.equal(decision.ruleId, "RULE-HUMAN-REVIEW-002");
});