import assert from "node:assert/strict";
import test from "node:test";
import {
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