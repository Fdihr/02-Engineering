import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCEPTION_KINDS,
  RESERVED_EXCEPTION_KINDS,
  createOpenExceptionItem,
  validateExceptionItem
} from "./exception-item.js";

const ref = {
  artifactRef: "runs/run-1/artifact.json",
  artifactSha256: "a".repeat(64)
};

test("creates all four exception kinds and reserves future emitters", () => {
  for (const kind of EXCEPTION_KINDS) {
    const item = createOpenExceptionItem({
      kind,
      runId: "run-1",
      refs: [ref],
      raisedAt: "2026-09-03T10:00:00.000Z"
    });
    assert.equal(item.ok, true);
    if (item.ok) {
      assert.equal(validateExceptionItem(item.value).ok, true);
      assert.equal(item.value.status, "open");
    }
  }
  assert.deepEqual(RESERVED_EXCEPTION_KINDS, [
    "unresolved-reconciliation",
    "key-judgement-contest"
  ]);
});

test("enforces open and decided exception invariants", () => {
  const open = createOpenExceptionItem({
    kind: "bounded-failure",
    runId: "run-1",
    refs: [ref],
    raisedAt: "2026-09-03T10:00:00.000Z"
  });
  if (!open.ok) throw new Error(open.error);
  assert.deepEqual(
    validateExceptionItem({ ...open.value, decision: "resume" }),
    { ok: false, error: "INVALID_EXCEPTION_ITEM" }
  );
  const decided = {
    ...open.value,
    status: "decided",
    decision: "accept-gap",
    decidedBy: "reviewer-1"
  };
  assert.equal(validateExceptionItem(decided).ok, true);
  assert.deepEqual(
    validateExceptionItem({ ...decided, decidedBy: "" }),
    { ok: false, error: "INVALID_EXCEPTION_DECISION" }
  );
});