import { err, ok, type Result } from "../../core/result.js";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  canonicalJson,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  pathSafeId,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../assurance/validators.js";

export const EXCEPTION_ITEM_SCHEMA_VERSION = "exception-item-v1" as const;

export const EXCEPTION_KINDS = [
  "uncertain-relevance",
  "unresolved-reconciliation",
  "key-judgement-contest",
  "bounded-failure"
] as const;

export const RESERVED_EXCEPTION_KINDS = [
  "unresolved-reconciliation",
  "key-judgement-contest"
] as const;

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
export type ExceptionDecision = "resume" | "accept-gap" | "exclude" | "reject";

export type ExceptionItem = {
  schemaVersion: typeof EXCEPTION_ITEM_SCHEMA_VERSION;
  id: string;
  kind: ExceptionKind;
  runId: string;
  refs: ArtifactBinding[];
  raisedAt: string;
  status: "open" | "decided";
  decision?: ExceptionDecision;
  decidedBy?: string;
};

export type ExceptionItemError =
  | "INVALID_EXCEPTION_ITEM"
  | "INVALID_EXCEPTION_REFS"
  | "INVALID_EXCEPTION_DECISION";

export const createOpenExceptionItem = (input: {
  kind: ExceptionKind;
  runId: string;
  refs: ArtifactBinding[];
  raisedAt: string;
}): Result<ExceptionItem, ExceptionItemError> => {
  const runId = pathSafeId(input.runId);
  const raisedAt = validTime(input.raisedAt);
  const refs = input.refs.map(readArtifactBinding);
  if (
    !EXCEPTION_KINDS.includes(input.kind) ||
    !runId ||
    !raisedAt ||
    refs.length === 0 ||
    refs.some((ref) => !ref)
  ) {
    return err("INVALID_EXCEPTION_ITEM");
  }
  const validRefs = refs.filter((ref): ref is ArtifactBinding => ref !== undefined);
  const identity = canonicalJson({
    kind: input.kind,
    runId,
    refs: validRefs,
    raisedAt
  });
  return ok({
    schemaVersion: EXCEPTION_ITEM_SCHEMA_VERSION,
    id: `exception-${input.kind}-${sha256Text(identity).slice(0, 24)}`,
    kind: input.kind,
    runId,
    refs: validRefs,
    raisedAt,
    status: "open"
  });
};

export const validateExceptionItem = (
  value: unknown
): Result<ExceptionItem, ExceptionItemError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "kind",
      "runId",
      "refs",
      "raisedAt",
      "status",
      ...(value.status === "decided" ? ["decision", "decidedBy"] : [])
    ]) ||
    value.schemaVersion !== EXCEPTION_ITEM_SCHEMA_VERSION ||
    !pathSafeId(value.id) ||
    !EXCEPTION_KINDS.includes(value.kind as ExceptionKind) ||
    !pathSafeId(value.runId) ||
    !validTime(value.raisedAt) ||
    !Array.isArray(value.refs) ||
    value.refs.length === 0 ||
    !value.refs.every((ref) => readArtifactBinding(ref) !== undefined) ||
    (value.status !== "open" && value.status !== "decided")
  ) {
    return err("INVALID_EXCEPTION_ITEM");
  }
  if (value.status === "open") {
    if (value.decision !== undefined || value.decidedBy !== undefined) {
      return err("INVALID_EXCEPTION_DECISION");
    }
  } else if (
    !["resume", "accept-gap", "exclude", "reject"].includes(
      value.decision as ExceptionDecision
    ) ||
    !nonEmptyString(value.decidedBy)
  ) {
    return err("INVALID_EXCEPTION_DECISION");
  }
  return ok(value as ExceptionItem);
};