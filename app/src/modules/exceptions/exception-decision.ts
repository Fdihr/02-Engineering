import { err, ok, type Result } from "../../core/result.js";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  canonicalJson,
  hasOnlyKeys,
  isRecord,
  pathSafeId,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../assurance/validators.js";
import type { ExceptionItem } from "./exception-item.js";

export const EXCEPTION_DECISION_SCHEMA_VERSION = "exception-decision-v1" as const;

// `resume` and `reject` need routing to an owning stage, which no stage implements yet.
export const SUPPORTED_EXCEPTION_DECISIONS = ["exclude", "accept-gap"] as const;
export type SupportedExceptionDecision = (typeof SUPPORTED_EXCEPTION_DECISIONS)[number];

export type ExceptionDecisionRecord = {
  schemaVersion: typeof EXCEPTION_DECISION_SCHEMA_VERSION;
  id: string;
  runId: string;
  exceptionId: string;
  exception: ArtifactBinding;
  decision: SupportedExceptionDecision;
  decidedBy: string;
  decidedAt: string;
  reason: string;
};

export type ExceptionDecisionError =
  | "INVALID_EXCEPTION_DECISION_RECORD"
  | "EXCEPTION_NOT_OPEN"
  | "UNSUPPORTED_EXCEPTION_DECISION";

const REASON_MIN = 3;
const REASON_MAX = 1000;

const normalizeReason = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const reason = value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return reason.length >= REASON_MIN && reason.length <= REASON_MAX ? reason : undefined;
};

const isSupported = (value: unknown): value is SupportedExceptionDecision =>
  SUPPORTED_EXCEPTION_DECISIONS.includes(value as SupportedExceptionDecision);

export const createExceptionDecision = (input: {
  exception: ExceptionItem;
  exceptionBinding: ArtifactBinding;
  decision: string;
  decidedBy: string;
  decidedAt: string;
  reason: string;
}): Result<ExceptionDecisionRecord, ExceptionDecisionError> => {
  if (input.exception.status !== "open") return err("EXCEPTION_NOT_OPEN");
  if (!isSupported(input.decision)) return err("UNSUPPORTED_EXCEPTION_DECISION");
  const decidedBy = pathSafeId(input.decidedBy);
  const decidedAt = validTime(input.decidedAt);
  const reason = normalizeReason(input.reason);
  const binding = readArtifactBinding(input.exceptionBinding);
  if (!decidedBy || !decidedAt || !reason || !binding ||
      Date.parse(decidedAt) < Date.parse(input.exception.raisedAt)) {
    return err("INVALID_EXCEPTION_DECISION_RECORD");
  }
  const identity = canonicalJson({ exception: binding, decision: input.decision, decidedBy, decidedAt });
  return ok({
    schemaVersion: EXCEPTION_DECISION_SCHEMA_VERSION,
    id: `exception-decision-${sha256Text(identity).slice(0, 24)}`,
    runId: input.exception.runId,
    exceptionId: input.exception.id,
    exception: binding,
    decision: input.decision,
    decidedBy,
    decidedAt,
    reason
  });
};

/** Validates a saved decision against the exact exception item bytes it claims to decide. */
export const validateExceptionDecision = (
  value: unknown,
  exception: ExceptionItem,
  exceptionBinding: ArtifactBinding
): Result<ExceptionDecisionRecord, ExceptionDecisionError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["schemaVersion", "id", "runId", "exceptionId", "exception", "decision", "decidedBy", "decidedAt", "reason"]) ||
    value.schemaVersion !== EXCEPTION_DECISION_SCHEMA_VERSION ||
    !pathSafeId(value.id) ||
    value.runId !== exception.runId ||
    value.exceptionId !== exception.id ||
    !isSupported(value.decision) ||
    !pathSafeId(value.decidedBy) ||
    !validTime(value.decidedAt) ||
    normalizeReason(value.reason) !== value.reason
  ) {
    return err("INVALID_EXCEPTION_DECISION_RECORD");
  }
  const binding = readArtifactBinding(value.exception);
  if (!binding || binding.artifactSha256 !== exceptionBinding.artifactSha256) {
    return err("INVALID_EXCEPTION_DECISION_RECORD");
  }
  return ok(value as ExceptionDecisionRecord);
};
