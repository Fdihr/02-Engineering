import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessSeeristDiscoveryPagination,
  buildSupplementalSeeristOperation,
  extractHotspotClusterIds,
  prepareSeeristDiscovery,
  rankSeeristDiscoveryCandidates,
  redactSeeristUrl,
  resolveSupplementalQueries,
  type CollectedSeeristPage,
  type SeeristDiscoveryPlan
} from "./seerist-discovery.js";
import { readSourceTierPolicy, type SourceTierPolicy } from "./source-tiers.js";

const tierPolicyResult = readSourceTierPolicy(
  JSON.parse(readFileSync(new URL("./policies/source-tiers-v1.json", import.meta.url), "utf8"))
);
if (!tierPolicyResult.ok) throw new Error("Shipped tier policy is invalid.");
const tierPolicy: SourceTierPolicy = tierPolicyResult.value;

const approvedQuestion = {
  id: "rq-test",
  runId: "run-test",
  scopeVersion: 1,
  question: "What confirms that the CIA Director visited Moscow?",
  rationale: "Synthetic discovery test.",
  geographies: ["Russia", "United States"],
  timeWindow: {
    from: "2026-08-25T00:00:00.000Z",
    to: "2026-08-28T23:59:59.999Z"
  },
  status: "approved",
  approvedBy: "analyst-test",
  approvedAt: "2026-08-28T08:00:00.000Z",
  scopeApproval: {
    scopeId: "scope-test",
    scopeVersion: 1,
    artifactRef: "runs/run-test/memo-scopes/scope-test/v1/approved.json",
    artifactSha256: "b".repeat(64)
  },
  artifactRef: "runs/run-test/research-questions/rq-test/approved.json",
  artifactSha256: "a".repeat(64)
};

const plan: SeeristDiscoveryPlan = {
  id: "discovery-test",
  runId: "run-test",
  researchQuestionId: "rq-test",
  provider: "seerist",
  endpoint: "/v1/wod",
  queries: [
    { id: "person", search: "John Ratcliffe", sources: "news" },
    { id: "role", search: "CIA Director Moscow", sources: "news" }
  ],
  rankingTerms: ["John Ratcliffe", "CIA Director", "Moscow", "NATO"],
  pageSize: 20,
  maxPagesPerQuery: 2,
  maxApiCalls: 4,
  maxResults: 20,
  minimumScore: 4
};

test("validates a bounded discovery plan against approved research intent", () => {
  const result = prepareSeeristDiscovery(
    plan,
    approvedQuestion,
    "2026-08-28T09:00:00.000Z"
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    prepareSeeristDiscovery(
      { ...plan, researchQuestionId: "rq-other" },
      approvedQuestion,
      "2026-08-28T09:00:00.000Z"
    ),
    { ok: false, error: "RESEARCH_QUESTION_MISMATCH" }
  );
});

test("rejects discovery without explicit scope approval lineage", () => {
  const { scopeApproval: _scopeApproval, ...legacyQuestion } = approvedQuestion;
  assert.deepEqual(
    prepareSeeristDiscovery(
      plan,
      legacyQuestion,
      "2026-08-28T09:00:00.000Z"
    ),
    { ok: false, error: "MEMO_SCOPE_APPROVAL_REQUIRED" }
  );
});

test("merges duplicate pages and keeps unrelated results off the shortlist instead of dropping them", () => {
  const relevantFeature = {
    type: "Feature",
    properties: {
      id: "relevant-1",
      source: "news",
      "@timestamp": "2026-08-27T12:00:00.000Z",
      title: "CIA Director John Ratcliffe visits Moscow",
      summary: "The visit included a warning concerning NATO.",
      link: "https://example.invalid/relevant",
      cluster_id: "cluster-1",
      cluster_size: 8
    }
  };
  const pages: CollectedSeeristPage[] = [
    {
      queryId: "person",
      pageOffset: 0,
      artifactRef: "person-page-1.json",
      payload: {
        type: "FeatureCollection",
        features: [
          relevantFeature,
          {
            type: "Feature",
            properties: {
              id: "unrelated-1",
              title: "Municipal waste rules updated",
              summary: "A local authority changed collection schedules."
            }
          }
        ]
      }
    },
    {
      queryId: "role",
      pageOffset: 20,
      artifactRef: "role-page-2.json",
      payload: { type: "FeatureCollection", features: [relevantFeature] }
    }
  ];

  const candidates = rankSeeristDiscoveryCandidates(plan, pages, tierPolicy);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => [candidate.providerItemId, candidate.shortlisted]),
    [["relevant-1", true], ["unrelated-1", false]]
  );
  assert.equal(candidates[0]?.providerItemId, "relevant-1");
  assert.deepEqual(candidates[0]?.queryIds, ["person", "role"]);
  assert.deepEqual(candidates[0]?.rawArtifactRefs, [
    "person-page-1.json",
    "role-page-2.json"
  ]);
  assert.deepEqual(candidates[0]?.matchedTerms, [
    "John Ratcliffe",
    "CIA Director",
    "Moscow",
    "NATO"
  ]);
});

test("reads multilingual analyst titles and orders by tier before score", () => {
  const pages: CollectedSeeristPage[] = [
    {
      queryId: "person",
      pageOffset: 0,
      artifactRef: "tiers.json",
      payload: {
        features: [
          { properties: { id: "post", source: "reddit", title: "John Ratcliffe CIA Director Moscow NATO", link: "https://www.reddit.com/r/x" } },
          { properties: { id: "wire", source: "news", title: "CIA Director John Ratcliffe in Moscow", link: "https://www.reuters.com/world/x" } },
          { properties: { id: "cr", source: "analysis", title: { en: "Cyber Weekly: CIA Director travel" }, summary: { en: "Moscow talks." } } }
        ]
      }
    }
  ];

  const candidates = rankSeeristDiscoveryCandidates(plan, pages, tierPolicy);

  assert.deepEqual(
    candidates.map((candidate) => [candidate.providerItemId, candidate.tier, candidate.tierId]),
    [["cr", 1, "control-risks-analysis"], ["wire", 3, "established-media"], ["post", 5, "social"]]
  );
  assert.equal(candidates[0]?.title, "Cyber Weekly: CIA Director travel");
  assert.equal(candidates[0]?.summary, "Moscow talks.");
  assert.equal(candidates[0]?.score, 4);
});

test("flags changing totals, timestamp inversions, duplicate IDs, and exhausted pages", () => {
  const boundedPlan: SeeristDiscoveryPlan = {
    ...plan,
    pageSize: 2,
    maxPagesPerQuery: 2,
    maxApiCalls: 4,
    minimumScore: 3
  };
  const pages: CollectedSeeristPage[] = [
    {
      queryId: "person",
      pageOffset: 0,
      artifactRef: "person-offset-0.json",
      payload: {
        features: [
          { properties: { id: "item-1", title: "John Ratcliffe", "@timestamp": "2026-08-28T10:00:00.000Z" } },
          { properties: { id: "item-2", "@timestamp": "2026-08-28T09:00:00.000Z" } }
        ],
        metadata: { pageSize: "2", total: 4, prev: null, next: "page-2" }
      }
    },
    {
      queryId: "person",
      pageOffset: 2,
      artifactRef: "person-offset-2.json",
      payload: {
        features: [
          { properties: { id: "item-3", "@timestamp": "2026-08-28T11:00:00.000Z" } },
          { properties: { id: "item-2", "@timestamp": "2026-08-28T08:00:00.000Z" } }
        ],
        metadata: { pageSize: "2", total: 5, prev: "page-1", next: "page-3" }
      }
    }
  ];

  const assessments = assessSeeristDiscoveryPagination(boundedPlan, pages);

  assert.equal(assessments[0]?.status, "snapshot-drift");
  assert.deepEqual(assessments[0]?.reasons, [
    "Provider item item-2 appears at offsets 0 and 2.",
    "Total changed from 4 to 5 between offsets 0 and 2.",
    "A newer timestamp appears at offset 2 after offset 0.",
    "Collection budget ended with a next page after offset 2."
  ]);
  assert.equal(assessments[1]?.status, "incomplete");
  assert.deepEqual(assessments[1]?.reasons, ["No page was collected for the query."]);
  const candidates = rankSeeristDiscoveryCandidates(
    boundedPlan,
    pages,
    tierPolicy,
    assessments
  );
  assert.match(
    candidates[0]?.collectionLimitations[0] ?? "",
    /pagination snapshot-drift/
  );
});

test("redacts x-api-key query parameters from persisted pagination metadata URLs", () => {
  assert.equal(
    redactSeeristUrl(
      "https://app.seerist.com/hyperionapi/v1/wod?pageOffset=20&pageSize=20&x-api-key=SUPER_SECRET_KEY"
    ),
    "https://app.seerist.com/hyperionapi/v1/wod?pageOffset=20&pageSize=20"
  );

  const assessments = assessSeeristDiscoveryPagination(plan, [
    {
      queryId: "person",
      pageOffset: 0,
      artifactRef: "person-0.json",
      payload: {
        features: [{ properties: { id: "item-1", title: "John Ratcliffe" } }],
        metadata: {
          pageSize: "20",
          total: 25,
          prev: null,
          next: "https://app.seerist.com/hyperionapi/v1/wod?pageOffset=20&x-api-key=LEAKED_TOKEN"
        }
      }
    }
  ]);
  const serialized = JSON.stringify(assessments);
  assert.equal(serialized.includes("LEAKED_TOKEN"), false);
  assert.equal(
    assessments[0]?.observations[0]?.next,
    "https://app.seerist.com/hyperionapi/v1/wod?pageOffset=20"
  );
});

test("autoExpandGeography synthesizes AOI-scoped supplemental operations and extracts breaking, Scribe, and hotspot leads", () => {
  const expandedPlan: SeeristDiscoveryPlan = {
    ...plan,
    autoExpandGeography: true,
    maxApiCalls: 12
  };
  const validated = prepareSeeristDiscovery(
    expandedPlan,
    approvedQuestion,
    "2026-08-28T09:00:00.000Z"
  );
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const supplementals = resolveSupplementalQueries(
    validated.value.plan,
    approvedQuestion.geographies
  );
  assert.deepEqual(
    supplementals.map((q) => [q.id, q.kind]),
    [
      ["auto-breaking-ru", "breaking-events"],
      ["auto-verified-ru", "verified-events"],
      ["auto-scribe-ru", "scribe-country"],
      ["auto-hotspots-ru", "hotspots"],
      ["auto-breaking-us", "breaking-events"],
      ["auto-verified-us", "verified-events"],
      ["auto-scribe-us", "scribe-country"],
      ["auto-hotspots-us", "hotspots"]
    ]
  );

  const breakingOp = buildSupplementalSeeristOperation({
    planId: expandedPlan.id,
    runId: expandedPlan.runId,
    researchQuestion: validated.value.researchQuestion,
    supplementalQuery: supplementals[0]!,
    referenceNowIso: "2026-08-28T09:00:00.000Z"
  });
  assert.equal(breakingOp.endpoint, "/v1/wod/breaking-events");
  assert.equal(breakingOp.filters?.aoiId, "ru");

  const hotspotPayload = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          headline: "Moscow diplomatic quarter security alert",
          topics: ["Security"],
          keywords: ["Moscow", "NATO"],
          clusterIds: ["cluster-moscow-1"]
        }
      },
      {
        type: "Feature",
        properties: {
          headline: "Regional weather update",
          topics: ["Weather"],
          keywords: ["rain"],
          clusterIds: ["cluster-other-2"]
        }
      }
    ]
  };
  assert.deepEqual(
    extractHotspotClusterIds(hotspotPayload, expandedPlan.rankingTerms, 1),
    ["cluster-moscow-1"]
  );

  const multiPages: CollectedSeeristPage[] = [
    {
      queryId: "auto-breaking-ru",
      pageOffset: 0,
      endpoint: "/v1/wod/breaking-events",
      artifactRef: "breaking.json",
      payload: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              id: "8680",
              subtype: "breaking-event",
              status: "Confirmed",
              publishedDate: "2026-08-27T14:00:00.000Z",
              title: "CIA Director John Ratcliffe delegation arrives in Moscow",
              content: { en: "<p>Delegation held NATO security talks in Moscow.</p>" },
              source: "https://www.reuters.com/world/ratcliffe-moscow/",
              sources: [
                { name: "Reuters", url: "https://www.reuters.com/world/ratcliffe-moscow/" }
              ]
            }
          }
        ]
      }
    },
    {
      queryId: "auto-scribe-ru",
      pageOffset: 0,
      endpoint: "/v2/auto-summary/ru/country",
      artifactRef: "scribe-ru.json",
      payload: {
        narrative: {
          summary: "AI-generated narrative that must never become direct evidence.",
          top_events: {
            events: [
              {
                id: "evt-901",
                title: "Moscow airport security cordon for US delegation",
                summary: "John Ratcliffe convoy reported near diplomatic quarter.",
                source_url: "https://www.bbc.com/news/world-europe-901"
              }
            ]
          }
        }
      }
    }
  ];

  const ranked = rankSeeristDiscoveryCandidates(validated.value.plan, multiPages, tierPolicy);
  assert.deepEqual(
    ranked.map((c) => [c.providerItemId, c.sourceType, c.tier, c.endpoint ?? "/v1/wod"]),
    [
      ["8680", "breaking-event", 1, "/v1/wod/breaking-events"],
      ["breaking-8680-lead-1", "news", 3, "/v1/wod/breaking-events"],
      ["scribe-evt-901", "scribe-event", 3, "/v2/auto-summary/ru/country"]
    ]
  );
  assert.equal(ranked[0]?.breakingStatus, "Confirmed");
});