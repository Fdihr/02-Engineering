import assert from "node:assert/strict";
import test from "node:test";
import { adaptRetrievedSourceContent } from "./retrieved-source-adapter.js";

const body = "Substantive publisher content.";
const makeRetrieval = () => ({
  id: "retrieval-1",
  runId: "run-1",
  resolutionDepth: 1,
  outcome: "resolved",
  reason: "content_retrieved",
  approvalStatus: "not_requested",
  accessProvider: {
    name: "firecrawl",
    endpoint: "https://api.firecrawl.dev/v2/scrape",
    httpStatus: 200
  },
  request: {
    format: "markdown",
    onlyMainContent: true,
    maxAge: 0,
    storeInCache: false,
    skipTlsVerification: false
  },
  lineage: {
    intakeArtifactRef: "runs/run-1/intake.json",
    intakeArtifactSha256: "a".repeat(64),
    requestArtifactRef: "runs/run-1/request.json",
    requestArtifactSha256: "b".repeat(64),
    rawArtifactRef: "runs/run-1/raw.json",
    rawArtifactSha256: "c".repeat(64)
  },
  content: {
    format: "markdown",
    trust: "untrusted",
    characterCount: body.length,
    body
  }
});

test("adapts a resolved retrieval into provider-neutral captured content", () => {
  const result = adaptRetrievedSourceContent(
    makeRetrieval(),
    "runs/run-1/result.json",
    "d".repeat(64)
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.sourceKind, "retrieved-publisher");
    assert.equal(result.value.sourceItemId, "retrieval-1");
    assert.equal(result.value.body, body);
    assert.equal(result.value.lineageArtifactRefs.length, 3);
  }
});

test("rejects unresolved, altered, and unsafe retrieval structures", () => {
  const unresolved = makeRetrieval();
  unresolved.outcome = "unresolved";
  assert.deepEqual(
    adaptRetrievedSourceContent(unresolved, "runs/result.json", "d".repeat(64)),
    { ok: false, error: "RETRIEVAL_NOT_RESOLVED" }
  );

  const alteredContent = makeRetrieval();
  alteredContent.content.characterCount += 1;
  assert.deepEqual(
    adaptRetrievedSourceContent(alteredContent, "runs/result.json", "d".repeat(64)),
    { ok: false, error: "INVALID_RETRIEVAL_CONTENT" }
  );

  const weakenedRequest = makeRetrieval();
  weakenedRequest.request.skipTlsVerification = true;
  assert.deepEqual(
    adaptRetrievedSourceContent(weakenedRequest, "runs/result.json", "d".repeat(64)),
    { ok: false, error: "INVALID_RETRIEVAL_RESULT" }
  );
});