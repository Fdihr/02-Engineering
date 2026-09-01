import assert from "node:assert/strict";
import test from "node:test";
import { processSource } from "../../workflow/process-source.js";
import { adaptSeeristSourceContent } from "./seerist-source-adapter.js";

const runId = "run-native-adapter";
const rawArtifactRef = "runs/run-native-adapter/raw-response.json";
const rawArtifactSha256 = "a".repeat(64);
const feature = {
  type: "Feature",
  properties: {
    id: "analysis-native",
    source: "analysis",
    sanitizedBody: { en: "Provider-captured report body." }
  }
};
const rawProvider = { features: [feature] };
const selected = {
  provider: "seerist",
  endpoint: "/v1/wod",
  retrievedAt: "2026-08-31T08:00:01.000Z",
  rawArtifactRef,
  rawArtifactSha256,
  collectionLineage: {
    operationId: "operation-native",
    requestManifestRef: "runs/run-native-adapter/collection-request.json",
    requestManifestSha256: "b".repeat(64),
    responseManifestRef: "runs/run-native-adapter/raw-provider-artifact.json",
    responseManifestSha256: "c".repeat(64),
    rawArtifactRef,
    rawArtifactSha256
  },
  researchQuestion: {
    id: "rq-native",
    runId,
    scopeVersion: 1,
    question: "What developments could affect operational continuity?",
    rationale: "Bound native adapter test.",
    geographies: ["Global"],
    timeWindow: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z"
    },
    status: "approved" as const,
    approvedBy: "analyst-test",
    approvedAt: "2026-08-30T08:00:00.000Z",
    artifactRef: "runs/run-native-adapter/approved-research-question.json",
    artifactSha256: "d".repeat(64)
  },
  item: feature
};

const makeIntake = () => {
  const result = processSource(runId, "2026-08-31T08:01:00.000Z", selected);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error(result.error.cause);
  }
  return JSON.parse(JSON.stringify(result.value)) as typeof result.value;
};

test("adapts reconstructed native intake into provider-neutral captured content", () => {
  const result = adaptSeeristSourceContent(
    makeIntake(),
    rawProvider,
    "runs/run-native-adapter/intake-result.json",
    "e".repeat(64),
    rawArtifactRef,
    rawArtifactSha256
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.sourceKind, "provider-captured");
    assert.equal(result.value.sourceItemId, "analysis-native");
    assert.equal(result.value.body, "Provider-captured report body.");
    assert.equal(result.value.lineageArtifactRefs.length, 4);
  }
});

test("rejects changed raw lineage and route tampering", () => {
  assert.deepEqual(
    adaptSeeristSourceContent(
      makeIntake(),
      rawProvider,
      "runs/run-native-adapter/intake-result.json",
      "e".repeat(64),
      rawArtifactRef,
      "f".repeat(64)
    ),
    { ok: false, error: "INVALID_NATIVE_INTAKE" }
  );

  const changedRoute = makeIntake();
  changedRoute.decision.destination = "human_review";
  assert.deepEqual(
    adaptSeeristSourceContent(
      changedRoute,
      rawProvider,
      "runs/run-native-adapter/intake-result.json",
      "e".repeat(64),
      rawArtifactRef,
      rawArtifactSha256
    ),
    { ok: false, error: "INVALID_NATIVE_INTAKE" }
  );
});