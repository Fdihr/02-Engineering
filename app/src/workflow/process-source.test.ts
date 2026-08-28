import assert from "node:assert/strict";
import test from "node:test";
import { processSource } from "./process-source.js";

const runId = "run-intake-test-001";
const occurredAt = "2026-08-28T10:00:00.000Z";

const selectedItem = (item: Record<string, unknown>, endpoint = "/v1/wod") => ({
  provider: "seerist" as const,
  endpoint,
  retrievedAt: "2026-08-28T09:55:00.000Z",
  rawArtifactRef: "runs/probe-001/raw-response.json",
  item
});

test("routes a captured analyst report to human review", () => {
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
  assert.equal(result.value.item.contentCompleteness, "captured_content");
  assert.equal(result.value.decision.destination, "human_review");
  assert.equal(result.value.decision.approvalStatus, "pending_human_review");
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

test("delivery-like wording cannot advance an item to approval", () => {
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

  assert.equal(result.value.decision.destination, "human_review");
  assert.equal(result.value.decision.approvalStatus, "pending_human_review");
});