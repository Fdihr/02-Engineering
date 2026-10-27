import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assignSourceTier, readSourceTierPolicy } from "./source-tiers.js";

const policyValue: unknown = JSON.parse(
  readFileSync(new URL("./policies/source-tiers-v1.json", import.meta.url), "utf8")
);

test("the shipped tier policy is valid and puts Control Risks analysis first", () => {
  const policy = readSourceTierPolicy(policyValue);
  assert.equal(policy.ok, true);
  if (!policy.ok) return;
  assert.deepEqual(assignSourceTier(policy.value, "analysis", undefined), {
    tier: 1, tierId: "control-risks-analysis", tierLabel: "Control Risks analyst report"
  });
  assert.equal(assignSourceTier(policy.value, "news", "https://www.cisa.gov/news-events/ics-advisories/x").tierId, "official");
  assert.equal(assignSourceTier(policy.value, "news", "https://www.ncsc.gov.uk/report").tierId, "official");
  assert.equal(assignSourceTier(policy.value, "news", "https://www.kyivpost.com/post/1").tierId, "established-media");
  assert.equal(assignSourceTier(policy.value, "news", "https://news.usni.org/2026/10/22/x").tierId, "established-media");
  assert.equal(assignSourceTier(policy.value, "reddit", "https://www.reddit.com/r/x").tierId, "social");
});

test("unknown publishers, odd types, and bad URLs fall back to the default tier", () => {
  const policy = readSourceTierPolicy(policyValue);
  assert.equal(policy.ok, true);
  if (!policy.ok) return;
  assert.equal(assignSourceTier(policy.value, "news", "https://www.example-blog.net/a").tier, 4);
  assert.equal(assignSourceTier(policy.value, undefined, "not a url").tier, 4);
  assert.equal(assignSourceTier(policy.value, "political", undefined).tier, 4);
  assert.equal(assignSourceTier(policy.value, "news", "https://notgov.example/a").tier, 4);
});

test("rejects tier policies that are unordered or lack the default tier", () => {
  const base = policyValue as { tiers: unknown[] };
  assert.deepEqual(readSourceTierPolicy({ ...base, defaultTier: 9 }), { ok: false, error: "INVALID_SOURCE_TIER_POLICY" });
  assert.deepEqual(
    readSourceTierPolicy({ ...base, tiers: [...base.tiers].reverse() }),
    { ok: false, error: "INVALID_SOURCE_TIER_POLICY" }
  );
});
