import assert from "node:assert/strict";
import test from "node:test";
import { processSource } from "./process-source.js";

const runId = "run-intake-test-001";
const occurredAt = "2026-08-28T10:00:00.000Z";

const researchQuestion = {
  id: "rq-001",
  runId,
  scopeVersion: 1,
  question: "What political developments could affect operational continuity in Pakistan?",
  rationale: "Bound collection to operational continuity indicators.",
  geographies: ["Pakistan"],
  timeWindow: {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-28T23:59:59.999Z"
  },
  status: "approved" as const,
  approvedBy: "analyst-001",
  approvedAt: "2026-08-27T10:00:00.000Z",
  artifactRef: `runs/${runId}/approved-research-question.json`,
  artifactSha256: "a".repeat(64)
};

const selectedItem = (
  item: Record<string, unknown>,
  endpoint = "/v1/wod",
  question: unknown = researchQuestion
) => ({
  provider: "seerist" as const,
  endpoint,
  retrievedAt: "2026-08-28T09:55:00.000Z",
  rawArtifactRef: "runs/probe-001/raw-response.json",
  rawArtifactSha256: "b".repeat(64),
  collectionLineage: {
    operationId: "operation-001",
    requestManifestRef: "runs/probe-001/collection-request.json",
    requestManifestSha256: "c".repeat(64),
    responseManifestRef: "runs/probe-001/raw-provider-artifact.json",
    responseManifestSha256: "d".repeat(64),
    rawArtifactRef: "runs/probe-001/raw-response.json",
    rawArtifactSha256: "b".repeat(64)
  },
  researchQuestion: question,
  item
});

test("routes a captured analyst report to source canonicalization", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem({
      id: 1030013,
      source: "analysis",
      title: "Synthetic analyst report",
      summary: "Synthetic summary",
      sanitizedBody: { en: "Synthetic captured report content." },
      references: ["reference-001"]
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.item.role, "evidence_candidate");
  assert.equal(result.value.item.providerItemId, "1030013");
  assert.equal(result.value.item.researchQuestion.id, "rq-001");
  assert.equal(result.value.item.researchQuestion.status, "approved");
  assert.equal(result.value.item.contentCompleteness, "captured_content");
  assert.equal(result.value.decision.destination, "source_canonicalization");
  assert.equal(result.value.decision.approvalStatus, "not_applicable");
  assert.equal(result.value.ledgerEntry.occurredAt, occurredAt);
});

test("routes a source-linked news summary to retrieval", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem({
      id: "news-001",
      source: "news",
      title: "Synthetic news item",
      summary: "Synthetic summary without captured article content.",
      link: "https://example.invalid/source",
      references: ["reference-001"]
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.item.role, "collection_lead");
  assert.equal(result.value.item.contentCompleteness, "summary_only");
  assert.equal(result.value.decision.destination, "source_retrieval");
  assert.equal(result.value.decision.approvalStatus, "not_applicable");
});

test("routes provider-authored country material to context only", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem(
      {
        title: "Synthetic country background",
        content: { en: "Synthetic provider-authored context." }
      },
      "/v1/wod/country-background/DNK"
    )
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.item.role, "context");
  assert.equal(result.value.decision.destination, "context_only");
  assert.equal(result.value.decision.approvalStatus, "not_applicable");
});

test("classifies a country-background source from the aggregate endpoint as context", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem({
      id: "context-001",
      source: "country-background",
      title: "Synthetic country background",
      sanitizedBody: { en: "Synthetic provider-authored context." }
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.item.role, "context");
  assert.equal(result.value.decision.destination, "context_only");
});

test("returns a typed validation error for an evidence candidate without an id", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem({
      source: "analysis",
      title: "Synthetic malformed analyst report",
      sanitizedBody: { en: "Synthetic captured report content." }
    })
  );

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INTAKE_VALIDATION_FAILED",
      cause: "MISSING_PROVIDER_ITEM_ID"
    }
  });
});

test("delivery-like wording cannot bypass canonicalization and relevance", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem({
      id: "analysis-002",
      source: "analysis",
      title: "Final approved executive report",
      sanitizedBody: { en: "Synthetic captured report content." }
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.decision.destination, "source_canonicalization");
  assert.equal(result.value.decision.approvalStatus, "not_applicable");
});

test("rejects intake without approved research-question lineage", () => {
  const result = processSource(runId, occurredAt, {
    provider: "seerist",
    endpoint: "/v1/wod",
    retrievedAt: "2026-08-28T09:55:00.000Z",
    rawArtifactRef: "runs/probe-001/raw-response.json",
    rawArtifactSha256: "b".repeat(64),
    collectionLineage: {
      operationId: "operation-001",
      requestManifestRef: "runs/probe-001/collection-request.json",
      requestManifestSha256: "c".repeat(64),
      responseManifestRef: "runs/probe-001/raw-provider-artifact.json",
      responseManifestSha256: "d".repeat(64),
      rawArtifactRef: "runs/probe-001/raw-response.json",
      rawArtifactSha256: "b".repeat(64)
    },
    item: {
      id: "analysis-unbound",
      source: "analysis",
      sanitizedBody: { en: "Synthetic captured report content." }
    }
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INTAKE_VALIDATION_FAILED",
      cause: "MISSING_RESEARCH_QUESTION"
    }
  });
});

test("rejects a question approved after provider retrieval", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem(
      {
        id: "analysis-late-question",
        source: "analysis",
        sanitizedBody: { en: "Synthetic captured report content." }
      },
      "/v1/wod",
      {
        ...researchQuestion,
        approvedAt: "2026-08-28T10:00:00.000Z"
      }
    )
  );

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INTAKE_VALIDATION_FAILED",
      cause: "QUESTION_APPROVED_AFTER_RETRIEVAL"
    }
  });
});

test("rejects intake assigned to a different run than the approved question", () => {
  const result = processSource(
    "different-run",
    occurredAt,
    selectedItem({
      id: "analysis-wrong-run",
      source: "analysis",
      sanitizedBody: { en: "Synthetic captured report content." }
    })
  );

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INTAKE_VALIDATION_FAILED",
      cause: "RESEARCH_QUESTION_RUN_MISMATCH"
    }
  });
});

test("does not treat arbitrary nested content as a captured analyst report", () => {
  const result = processSource(
    runId,
    occurredAt,
    selectedItem({
      id: "analysis-metadata-content",
      source: "analysis",
      content: { metadata: { label: "Not a report body" } },
      summary: "Synthetic summary"
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.item.role, "collection_lead");
  assert.equal(result.value.item.contentCompleteness, "summary_only");
});