import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createOpenExceptionItem } from "../modules/exceptions/exception-item.js";
import { loadExceptionState, persistExceptionItem, recordExceptionDecision } from "./exception-io.js";

test("persists exception items once under the run-level directory", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "exception-item-"));
  try {
    const item = createOpenExceptionItem({
      kind: "uncertain-relevance",
      runId: "run-1",
      refs: [{
        artifactRef: "runs/run-1/assessment.json",
        artifactSha256: "a".repeat(64)
      }],
      raisedAt: "2026-09-03T10:00:00.000Z"
    });
    if (!item.ok) throw new Error(item.error);
    const persisted = await persistExceptionItem(root, item.value);
    assert.match(
      persisted.path.replaceAll("\\", "/"),
      /run-1\/exceptions\/exception-uncertain-relevance-.+\/exception-item\.json$/
    );
    await assert.rejects(() => persistExceptionItem(root, item.value));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
const openItem = async (root: string) => {
  const item = createOpenExceptionItem({
    kind: "uncertain-relevance", runId: "run-1",
    refs: [{ artifactRef: "runs/run-1/assessment.json", artifactSha256: "a".repeat(64) }],
    raisedAt: "2026-09-03T10:00:00.000Z"
  });
  if (!item.ok) throw new Error(item.error);
  return persistExceptionItem(root, item.value);
};

test("records one decision beside the exception and closes it", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "exception-decision-"));
  try {
    const persisted = await openItem(root);
    assert.equal((await loadExceptionState(persisted.path)).open, true);
    const input = { runRoot: root, itemPath: persisted.path, decision: "exclude", decidedBy: "FDIHR",
      reason: "Context only; not admitted.", decidedAt: "2026-11-05T13:00:00.000Z" };
    const { state } = await recordExceptionDecision(input);
    assert.equal(state.open, false);
    assert.equal(state.decision?.decision, "exclude");
    assert.equal(state.decision?.exception.artifactSha256, persisted.binding.artifactSha256);
    await assert.rejects(() => recordExceptionDecision(input), /already decided/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsupported decisions, bad reasons, and paths outside the run layout", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "exception-decision-"));
  try {
    const persisted = await openItem(root);
    const base = { runRoot: root, itemPath: persisted.path, decidedBy: "FDIHR",
      reason: "Valid reason.", decidedAt: "2026-11-05T13:00:00.000Z" };
    await assert.rejects(() => recordExceptionDecision({ ...base, decision: "resume" }), /UNSUPPORTED_EXCEPTION_DECISION/);
    await assert.rejects(() => recordExceptionDecision({ ...base, decision: "exclude", reason: "x" }), /INVALID_EXCEPTION_DECISION_RECORD/);
    await assert.rejects(() => recordExceptionDecision({ ...base, decision: "exclude", decidedBy: "../x" }), /INVALID_EXCEPTION_DECISION_RECORD/);
    await assert.rejects(() => recordExceptionDecision({ ...base, decision: "exclude", runRoot: resolve(root, "other") }), /inside the run root/);
    assert.equal((await loadExceptionState(persisted.path)).open, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("treats a decision that does not bind the item bytes as an integrity failure", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "exception-decision-"));
  try {
    const persisted = await openItem(root);
    const { decisionPath } = await recordExceptionDecision({ runRoot: root, itemPath: persisted.path,
      decision: "accept-gap", decidedBy: "FDIHR", reason: "Gap accepted.", decidedAt: "2026-11-05T13:00:00.000Z" });
    const saved = JSON.parse(await readFile(decisionPath, "utf8"));
    await writeFile(decisionPath, JSON.stringify({ ...saved, exception: { ...saved.exception, artifactSha256: "b".repeat(64) } }));
    await assert.rejects(() => loadExceptionState(persisted.path), /INVALID_EXCEPTION_DECISION_RECORD/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
