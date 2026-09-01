import assert from "node:assert/strict";
import test from "node:test";
import {
  assessSeeristDiscoveryPagination,
  prepareSeeristDiscovery,
  rankSeeristDiscoveryCandidates,
  type CollectedSeeristPage,
  type SeeristDiscoveryPlan
} from "./seerist-discovery.js";

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

test("merges duplicate pages and deterministically filters unrelated results", () => {
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

  const candidates = rankSeeristDiscoveryCandidates(plan, pages);

  assert.equal(candidates.length, 1);
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
    assessments
  );
  assert.match(
    candidates[0]?.collectionLimitations[0] ?? "",
    /pagination snapshot-drift/
  );
});