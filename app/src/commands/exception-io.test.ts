import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createOpenExceptionItem } from "../modules/exceptions/exception-item.js";
import { persistExceptionItem } from "./exception-io.js";

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