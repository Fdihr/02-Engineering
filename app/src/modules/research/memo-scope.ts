import type {
  ApprovedMemoScope,
  ApprovedMemoScopeArtifact,
  OriginatedValue
} from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";

export type MemoScopeError =
  | "MISSING_MEMO_SCOPE"
  | "INVALID_MEMO_SCOPE"
  | "MEMO_SCOPE_NOT_APPROVED"
  | "INVALID_MEMO_SCOPE_TIME_WINDOW"
  | "SCOPE_APPROVED_AFTER_USE";

export type MemoScopeApprovalError =
  | "INVALID_MEMO_SCOPE"
  | "MEMO_SCOPE_NOT_PROPOSED"
  | "MISSING_SCOPE_REVIEWER"
  | "INVALID_SCOPE_APPROVAL_TIME"
  | "INVALID_MEMO_SCOPE_TIME_WINDOW";

type MemoScopeDefinition = Omit<
  ApprovedMemoScopeArtifact,
  "status" | "approvedBy" | "approvedAt"
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readOrigin = (
  value: unknown
): { origin: "human" | "inferred"; assumptionReason?: string } | undefined => {
  if (!isRecord(value) || (value.origin !== "human" && value.origin !== "inferred")) {
    return undefined;
  }
  const assumptionReason = nonEmptyString(value.assumptionReason);
  if (value.origin === "inferred" && !assumptionReason) {
    return undefined;
  }
  return assumptionReason
    ? { origin: value.origin, assumptionReason }
    : { origin: value.origin };
};

const readOriginatedString = (
  value: unknown
): OriginatedValue<string> | undefined => {
  const origin = readOrigin(value);
  const content = isRecord(value) ? nonEmptyString(value.value) : undefined;
  return origin && content ? { value: content, ...origin } : undefined;
};

const readOriginatedStrings = (
  value: unknown
): OriginatedValue<string[]> | undefined => {
  const origin = readOrigin(value);
  if (!origin || !isRecord(value) || !Array.isArray(value.value) || value.value.length === 0) {
    return undefined;
  }
  const content = value.value.map(nonEmptyString);
  return content.every((entry): entry is string => entry !== undefined)
    ? { value: content, ...origin }
    : undefined;
};

const readOriginatedTimeWindow = (
  value: unknown
): Result<OriginatedValue<{ from: string; to: string }>, MemoScopeApprovalError> => {
  const origin = readOrigin(value);
  if (!origin || !isRecord(value) || !isRecord(value.value)) {
    return err("INVALID_MEMO_SCOPE");
  }
  const from = nonEmptyString(value.value.from);
  const to = nonEmptyString(value.value.to);
  if (
    !from ||
    !to ||
    Number.isNaN(Date.parse(from)) ||
    Number.isNaN(Date.parse(to)) ||
    Date.parse(from) > Date.parse(to)
  ) {
    return err("INVALID_MEMO_SCOPE_TIME_WINDOW");
  }
  return ok({ value: { from, to }, ...origin });
};

const readRequestedOutput = (
  value: unknown
): OriginatedValue<"brief" | "memo" | "assessment"> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const origin = readOrigin(value);
  return origin &&
    (value.value === "brief" || value.value === "memo" || value.value === "assessment")
    ? { value: value.value, ...origin }
    : undefined;
};

const readScopeDefinition = (
  value: Record<string, unknown>
): Result<MemoScopeDefinition, MemoScopeApprovalError> => {
  const id = nonEmptyString(value.id);
  const runId = nonEmptyString(value.runId);
  const purpose = readOriginatedString(value.purpose);
  const threatTopic = readOriginatedString(value.threatTopic);
  const audience = readOriginatedString(value.audience);
  const geographies = readOriginatedStrings(value.geographies);
  const timeWindow = readOriginatedTimeWindow(value.timeWindow);
  const requestedOutput =
    value.requestedOutput === undefined
      ? undefined
      : readRequestedOutput(value.requestedOutput);
  if (
    !id ||
    !runId ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !purpose ||
    !threatTopic ||
    !audience ||
    !geographies ||
    !timeWindow.ok ||
    (value.requestedOutput !== undefined && !requestedOutput)
  ) {
    return timeWindow.ok ? err("INVALID_MEMO_SCOPE") : timeWindow;
  }
  return ok({
    id,
    runId,
    version: value.version,
    purpose,
    threatTopic,
    audience,
    geographies,
    timeWindow: timeWindow.value,
    ...(requestedOutput ? { requestedOutput } : {})
  });
};

export const approveMemoScope = (
  value: unknown,
  reviewerId: string,
  approvedAt: string
): Result<ApprovedMemoScopeArtifact, MemoScopeApprovalError> => {
  if (!isRecord(value)) {
    return err("INVALID_MEMO_SCOPE");
  }
  if (value.status !== "proposed") {
    return err("MEMO_SCOPE_NOT_PROPOSED");
  }
  const approvedBy = nonEmptyString(reviewerId);
  if (!approvedBy) {
    return err("MISSING_SCOPE_REVIEWER");
  }
  if (!nonEmptyString(approvedAt) || Number.isNaN(Date.parse(approvedAt))) {
    return err("INVALID_SCOPE_APPROVAL_TIME");
  }
  const definition = readScopeDefinition(value);
  return definition.ok
    ? ok({ ...definition.value, status: "approved", approvedBy, approvedAt })
    : definition;
};

export const validateApprovedMemoScope = (
  value: unknown,
  usedAt: string
): Result<ApprovedMemoScope, MemoScopeError> => {
  if (value === undefined || value === null) {
    return err("MISSING_MEMO_SCOPE");
  }
  if (!isRecord(value)) {
    return err("INVALID_MEMO_SCOPE");
  }
  if (value.status !== "approved") {
    return err("MEMO_SCOPE_NOT_APPROVED");
  }
  const definition = readScopeDefinition(value);
  if (!definition.ok) {
    return err(
      definition.error === "INVALID_MEMO_SCOPE_TIME_WINDOW"
        ? "INVALID_MEMO_SCOPE_TIME_WINDOW"
        : "INVALID_MEMO_SCOPE"
    );
  }
  const approvedBy = nonEmptyString(value.approvedBy);
  const approvedAt = nonEmptyString(value.approvedAt);
  const artifactRef = nonEmptyString(value.artifactRef);
  const artifactSha256 = nonEmptyString(value.artifactSha256)?.toLowerCase();
  if (
    !approvedBy ||
    !approvedAt ||
    Number.isNaN(Date.parse(approvedAt)) ||
    !artifactRef ||
    !artifactSha256 ||
    !/^[a-f0-9]{64}$/.test(artifactSha256)
  ) {
    return err("INVALID_MEMO_SCOPE");
  }
  if (Number.isNaN(Date.parse(usedAt)) || Date.parse(approvedAt) > Date.parse(usedAt)) {
    return err("SCOPE_APPROVED_AFTER_USE");
  }
  return ok({
    ...definition.value,
    status: "approved",
    approvedBy,
    approvedAt,
    artifactRef,
    artifactSha256
  });
};