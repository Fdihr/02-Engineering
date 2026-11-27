import { err, ok, type Result } from "../../core/result.js";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  canonicalJson,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  pathSafeId,
  positiveInteger,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../assurance/validators.js";

export const MEMO_PUBLICATION_DECISION_SCHEMA_VERSION =
  "memo-publication-decision-v2" as const;
export const SUPPORT_CALIBRATION_POLICY_SCHEMA_VERSION =
  "support-calibration-policy-v1" as const;
export const SUPPORT_CALIBRATION_RECORD_SCHEMA_VERSION =
  "support-calibration-record-v1" as const;
export const PUBLISHED_MEMO_PACKAGE_SCHEMA_VERSION =
  "published-memo-package-v1" as const;

export type CalibrationVerdict = "supported" | "unsupported" | "uncertain";

export type SampledObservationVerdict = {
  observationId: string;
  verdict: CalibrationVerdict;
};

export type DrillDownVerdict = {
  targetType: "claim" | "observation" | "source";
  targetId: string;
  clickedAt: string;
  verdict?: CalibrationVerdict;
};

export type MemoPublicationDecision = {
  schemaVersion: typeof MEMO_PUBLICATION_DECISION_SCHEMA_VERSION;
  id: string;
  runId: string;
  memoId: string;
  memoVersion: number;
  reviewerId: string;
  decidedAt: string;
  decision: "approved" | "rejected" | "revision-requested";
  issueType?:
    | "editorial"
    | "external-judgment"
    | "source-analysis"
    | "organizational-relevance"
    | "evidence-gap"
    | "standard-policy";
  feedback?: string;
  sampledVerdicts: SampledObservationVerdict[];
  drillDownVerdicts: DrillDownVerdict[];
};

export type SupportCalibrationPolicy = {
  schemaVersion: typeof SUPPORT_CALIBRATION_POLICY_SCHEMA_VERSION;
  id: string;
  version: number;
  sampleSizePerMemo: number;
  minimumSampledVerdicts: number;
  minimumMemos: number;
  maximumDisagreementRate: number;
  thresholdStatus: "provisional-untested" | "approved";
  unvalidatedLimitation: "support check: model-only, unvalidated";
};

export type SupportCalibrationRecord = {
  schemaVersion: typeof SUPPORT_CALIBRATION_RECORD_SCHEMA_VERSION;
  id: string;
  runId: string;
  memoId: string;
  recordedAt: string;
  publicationDecision: ArtifactBinding;
  calibrationPolicy: ArtifactBinding;
  policyId: string;
  policyVersion: number;
  selectedObservationIds: string[];
  sampledVerdicts: SampledObservationVerdict[];
  drillDownVerdicts: DrillDownVerdict[];
  thresholdStatus: "not-reached" | "eligible-for-governance-review";
};

export type PublicationContractError =
  | "INVALID_PUBLICATION_DECISION"
  | "INVALID_CALIBRATION_POLICY"
  | "INVALID_CALIBRATION_RECORD"
  | "SAMPLED_VERDICT_MISMATCH"
  | "INVALID_ARTIFACT_BINDING";

export type MemoReviewTarget = {
  runId: string;
  memoId: string;
  memoVersion: number;
  memo: ArtifactBinding;
  markdown: ArtifactBinding;
  writer: ArtifactBinding;
  verification: ArtifactBinding;
  gate: ArtifactBinding;
  calibrationPolicy: ArtifactBinding;
};

export type BoundMemoDecision = Omit<MemoPublicationDecision, "schemaVersion"> & {
  schemaVersion: "memo-publication-decision-v3";
  target: MemoReviewTarget;
  selectedObservationIds: string[];
  calibrationStatus: "not-reached";
};

export type MemoPublicationGate = {
  schemaVersion: "memo-publication-gate-v1";
  memoId: string;
  checkedAt: string;
  status: "ready" | "blocked";
  reasons: string[];
  humanApprovalAvailable: boolean;
};

export type PublishedMemoPackage = {
  schemaVersion: typeof PUBLISHED_MEMO_PACKAGE_SCHEMA_VERSION;
  id: string;
  runId: string;
  memoId: string;
  memoVersion: number;
  publishedAt: string;
  publishedBy: string;
  publicationStatus: "published";
  audience: string;
  format: "markdown+json";
  approval: ArtifactBinding;
  reviewTarget: MemoReviewTarget;
  lineage: Record<string, ArtifactBinding>;
  memo: unknown;
  markdown: string;
};

export const createMemoPublicationGate = (input: {
  memoId: string;
  checkedAt: string;
  blockers: string[];
}): MemoPublicationGate => ({
  schemaVersion: "memo-publication-gate-v1",
  memoId: input.memoId,
  checkedAt: input.checkedAt,
  status: input.blockers.length ? "blocked" : "ready",
  reasons: input.blockers,
  humanApprovalAvailable: input.blockers.length === 0
});

export const createPublishedMemoPackage = (input: Omit<PublishedMemoPackage,
  "schemaVersion" | "id">): Result<PublishedMemoPackage, "INVALID_PUBLISHED_MEMO_PACKAGE"> => {
  if (!pathSafeId(input.runId) || !pathSafeId(input.memoId) || !positiveInteger(input.memoVersion) ||
      !validTime(input.publishedAt) || !pathSafeId(input.publishedBy) ||
      input.publicationStatus !== "published" || !nonEmptyString(input.audience) ||
      input.format !== "markdown+json" || !readArtifactBinding(input.approval) ||
      !validateMemoReviewTarget(input.reviewTarget) || input.reviewTarget.runId !== input.runId ||
      input.reviewTarget.memoId !== input.memoId || input.reviewTarget.memoVersion !== input.memoVersion ||
      !isRecord(input.memo) || input.memo.id !== input.memoId || input.memo.runId !== input.runId ||
      input.memo.version !== input.memoVersion || typeof input.markdown !== "string" ||
      !input.markdown.trim() || !isRecord(input.lineage) ||
      !Object.values(input.lineage).every(binding => !!readArtifactBinding(binding))) {
    return err("INVALID_PUBLISHED_MEMO_PACKAGE");
  }
  const body = { ...input };
  return ok({
    schemaVersion: PUBLISHED_MEMO_PACKAGE_SCHEMA_VERSION,
    id: `published-memo-${sha256Text(canonicalJson(body)).slice(0, 24)}`,
    ...body
  });
};

export const validatePublishedMemoPackage = (
  value: unknown
): Result<PublishedMemoPackage, "INVALID_PUBLISHED_MEMO_PACKAGE"> => {
  if (!isRecord(value) || value.schemaVersion !== PUBLISHED_MEMO_PACKAGE_SCHEMA_VERSION) {
    return err("INVALID_PUBLISHED_MEMO_PACKAGE");
  }
  const id = pathSafeId(value.id);
  const runId = pathSafeId(value.runId);
  const memoId = pathSafeId(value.memoId);
  const memoVersion = positiveInteger(value.memoVersion);
  const publishedAt = validTime(value.publishedAt);
  const publishedBy = pathSafeId(value.publishedBy);
  const publicationStatus = value.publicationStatus;
  const audience = nonEmptyString(value.audience);
  const approval = readArtifactBinding(value.approval);
  const reviewTarget = value.reviewTarget;
  const memo = value.memo;
  const markdown = value.markdown;
  const lineage = value.lineage;
  if (!id || !runId || !memoId || !memoVersion || !publishedAt || !publishedBy || !audience ||
      publicationStatus !== "published" || value.format !== "markdown+json" ||
      !approval || !validateMemoReviewTarget(reviewTarget) ||
      !isRecord(memo) || typeof markdown !== "string" || !markdown.trim() || !isRecord(lineage) ||
      !Object.values(lineage).every(binding => !!readArtifactBinding(binding))) {
    return err("INVALID_PUBLISHED_MEMO_PACKAGE");
  }
  const validatedLineage = Object.fromEntries(Object.entries(lineage).map(([key, binding]) =>
    [key, readArtifactBinding(binding)!]));
  const packageResult = createPublishedMemoPackage({
    runId,
    memoId,
    memoVersion,
    publishedAt,
    publishedBy,
    publicationStatus,
    audience,
    format: value.format,
    approval,
    reviewTarget,
    lineage: validatedLineage,
    memo,
    markdown
  });
  if (!packageResult.ok || packageResult.value.id !== value.id ||
      !hasOnlyKeys(value, ["schemaVersion", "id", "runId", "memoId", "memoVersion", "publishedAt",
        "publishedBy", "publicationStatus", "audience", "format", "approval", "reviewTarget", "lineage", "memo", "markdown"])) {
    return err("INVALID_PUBLISHED_MEMO_PACKAGE");
  }
  return ok(value as PublishedMemoPackage);
};

export const validateMemoReviewTarget = (value: unknown): value is MemoReviewTarget =>
  isRecord(value) && hasOnlyKeys(value, ["runId", "memoId", "memoVersion", "memo",
    "markdown", "writer", "verification", "gate", "calibrationPolicy"]) &&
  !!pathSafeId(value.runId) && !!pathSafeId(value.memoId) && !!positiveInteger(value.memoVersion) &&
  ["memo", "markdown", "writer", "verification", "gate", "calibrationPolicy"]
    .every(key => !!readArtifactBinding(value[key]));

export const createBoundMemoDecision = (input: {
  submitted: unknown;
  target: MemoReviewTarget;
  selectedObservationIds: string[];
  approvalBlockers: string[];
  decidedAt: string;
}): Result<BoundMemoDecision, "INVALID_MEMO_REVIEW" | "STALE_MEMO_REVIEW" |
  "INCOMPLETE_MEMO_SAMPLE" | "PUBLICATION_BLOCKED"> => {
  const value = input.submitted;
  if (!isRecord(value) ||
      !(hasOnlyKeys(value, ["target", "reviewerId", "decision", "feedback", "sampledVerdicts", "drillDownVerdicts"]) ||
        hasOnlyKeys(value, ["target", "reviewerId", "decision", "issueType", "feedback", "sampledVerdicts", "drillDownVerdicts"])) ||
      typeof value.reviewerId !== "string" || !pathSafeId(value.reviewerId) || !validTime(input.decidedAt) ||
      !["approved", "rejected", "revision-requested"].includes(String(value.decision)) ||
      typeof value.feedback !== "string" || value.feedback.trim().length < 3 ||
      value.feedback.length > 2000 ||
      !validateMemoReviewTarget(value.target)) return err("INVALID_MEMO_REVIEW");
  const issueTypes = ["editorial", "external-judgment", "source-analysis", "organizational-relevance",
    "evidence-gap", "standard-policy"];
  if ((value.decision === "approved" && value.issueType !== undefined && !issueTypes.includes(String(value.issueType))) ||
      (value.decision !== "approved" && !issueTypes.includes(String(value.issueType)))) {
    return err("INVALID_MEMO_REVIEW");
  }
  if (canonicalJson(value.target) !== canonicalJson(input.target)) return err("STALE_MEMO_REVIEW");
  const sampledVerdicts = readSampledVerdicts(value.sampledVerdicts);
  const drillDownVerdicts = readDrillDownVerdicts(value.drillDownVerdicts);
  if (!sampledVerdicts || !drillDownVerdicts ||
      drillDownVerdicts.some(row => Date.parse(row.clickedAt) > Date.parse(input.decidedAt))) {
    return err("INVALID_MEMO_REVIEW");
  }
  if (sampledVerdicts.length !== input.selectedObservationIds.length ||
      sampledVerdicts.some(row => !input.selectedObservationIds.includes(row.observationId))) {
    return err("INCOMPLETE_MEMO_SAMPLE");
  }
  if (value.decision === "approved" && (input.approvalBlockers.length ||
      sampledVerdicts.some(row => row.verdict !== "supported"))) return err("PUBLICATION_BLOCKED");
  const body = {
    runId: input.target.runId, memoId: input.target.memoId, memoVersion: input.target.memoVersion,
    reviewerId: value.reviewerId, decidedAt: input.decidedAt,
    decision: value.decision as MemoPublicationDecision["decision"],
    ...(value.issueType !== undefined
      ? { issueType: value.issueType as NonNullable<MemoPublicationDecision["issueType"]> }
      : {}),
    feedback: value.feedback.trim(), sampledVerdicts, drillDownVerdicts,
    target: input.target, selectedObservationIds: input.selectedObservationIds,
    calibrationStatus: "not-reached" as const
  };
  return ok({ schemaVersion: "memo-publication-decision-v3",
    id: `publication-${sha256Text(canonicalJson(body)).slice(0, 24)}`, ...body });
};

const verdict = (value: unknown): value is CalibrationVerdict =>
  value === "supported" || value === "unsupported" || value === "uncertain";

const readSampledVerdicts = (
  value: unknown
): SampledObservationVerdict[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const rows: SampledObservationVerdict[] = [];
  for (const row of value) {
    const observationId = isRecord(row) ? pathSafeId(row.observationId) : undefined;
    if (
      !isRecord(row) ||
      !hasOnlyKeys(row, ["observationId", "verdict"]) ||
      !observationId ||
      !verdict(row.verdict)
    ) return undefined;
    rows.push({ observationId, verdict: row.verdict });
  }
  return new Set(rows.map((row) => row.observationId)).size === rows.length
    ? rows
    : undefined;
};

const readDrillDownVerdicts = (value: unknown): DrillDownVerdict[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const rows: DrillDownVerdict[] = [];
  for (const row of value) {
    const targetId = isRecord(row) ? pathSafeId(row.targetId) : undefined;
    const clickedAt = isRecord(row) ? validTime(row.clickedAt) : undefined;
    if (
      !isRecord(row) ||
      !hasOnlyKeys(row, [
        "targetType",
        "targetId",
        "clickedAt",
        ...(row.verdict === undefined ? [] : ["verdict"])
      ]) ||
      (row.targetType !== "claim" &&
        row.targetType !== "observation" &&
        row.targetType !== "source") ||
      !targetId ||
      !clickedAt ||
      (row.verdict !== undefined && !verdict(row.verdict))
    ) return undefined;
    rows.push({
      targetType: row.targetType,
      targetId,
      clickedAt,
      ...(row.verdict ? { verdict: row.verdict } : {})
    });
  }
  return rows;
};

export const validateMemoPublicationDecision = (
  value: unknown
): Result<MemoPublicationDecision, PublicationContractError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== MEMO_PUBLICATION_DECISION_SCHEMA_VERSION ||
    !pathSafeId(value.id) ||
    !pathSafeId(value.runId) ||
    !pathSafeId(value.memoId) ||
    !positiveInteger(value.memoVersion) ||
    !nonEmptyString(value.reviewerId) ||
    !validTime(value.decidedAt) ||
    (value.decision !== "approved" &&
      value.decision !== "rejected" &&
      value.decision !== "revision-requested")
  ) return err("INVALID_PUBLICATION_DECISION");
  const sampledVerdicts = readSampledVerdicts(value.sampledVerdicts);
  const drillDownVerdicts = readDrillDownVerdicts(value.drillDownVerdicts);
  if (!sampledVerdicts || !drillDownVerdicts) {
    return err("INVALID_PUBLICATION_DECISION");
  }
  return ok(value as MemoPublicationDecision);
};

const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const validateSupportCalibrationPolicy = (
  value: unknown
): Result<SupportCalibrationPolicy, PublicationContractError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "version",
      "sampleSizePerMemo",
      "minimumSampledVerdicts",
      "minimumMemos",
      "maximumDisagreementRate",
      "thresholdStatus",
      "unvalidatedLimitation"
    ]) ||
    value.schemaVersion !== SUPPORT_CALIBRATION_POLICY_SCHEMA_VERSION ||
    !pathSafeId(value.id) ||
    !positiveInteger(value.version) ||
    !nonNegativeInteger(value.sampleSizePerMemo) ||
    !nonNegativeInteger(value.minimumSampledVerdicts) ||
    !nonNegativeInteger(value.minimumMemos) ||
    typeof value.maximumDisagreementRate !== "number" ||
    value.maximumDisagreementRate < 0 ||
    value.maximumDisagreementRate > 1 ||
    (value.thresholdStatus !== "provisional-untested" &&
      value.thresholdStatus !== "approved") ||
    value.unvalidatedLimitation !== "support check: model-only, unvalidated"
  ) return err("INVALID_CALIBRATION_POLICY");
  return ok(value as SupportCalibrationPolicy);
};

export const createSupportCalibrationRecord = (input: {
  decision: MemoPublicationDecision;
  decisionArtifact: ArtifactBinding;
  policy: SupportCalibrationPolicy;
  policyArtifact: ArtifactBinding;
  selectedObservationIds: string[];
  recordedAt: string;
  cumulativeSampledVerdicts: number;
  cumulativeMemos: number;
  cumulativeDisagreementRate: number | null;
}): Result<SupportCalibrationRecord, PublicationContractError> => {
  const decisionArtifact = readArtifactBinding(input.decisionArtifact);
  const policyArtifact = readArtifactBinding(input.policyArtifact);
  const recordedAt = validTime(input.recordedAt);
  if (!decisionArtifact || !policyArtifact || !recordedAt) {
    return err("INVALID_ARTIFACT_BINDING");
  }
  const selected = input.selectedObservationIds.map(pathSafeId);
  if (
    selected.length !== input.policy.sampleSizePerMemo ||
    !selected.every((id): id is string => id !== undefined) ||
    new Set(selected).size !== selected.length ||
    input.decision.sampledVerdicts.length !== selected.length ||
    input.decision.sampledVerdicts.some(
      (row) => !selected.includes(row.observationId)
    )
  ) return err("SAMPLED_VERDICT_MISMATCH");
  const thresholdStatus: SupportCalibrationRecord["thresholdStatus"] =
    input.policy.thresholdStatus === "approved" &&
    input.cumulativeSampledVerdicts >= input.policy.minimumSampledVerdicts &&
    input.cumulativeMemos >= input.policy.minimumMemos &&
    input.cumulativeDisagreementRate !== null &&
    input.cumulativeDisagreementRate <= input.policy.maximumDisagreementRate
      ? "eligible-for-governance-review"
      : "not-reached";
  const body = {
    runId: input.decision.runId,
    memoId: input.decision.memoId,
    recordedAt,
    publicationDecision: decisionArtifact,
    calibrationPolicy: policyArtifact,
    policyId: input.policy.id,
    policyVersion: input.policy.version,
    selectedObservationIds: selected,
    sampledVerdicts: input.decision.sampledVerdicts,
    drillDownVerdicts: input.decision.drillDownVerdicts,
    thresholdStatus
  };
  return ok({
    schemaVersion: SUPPORT_CALIBRATION_RECORD_SCHEMA_VERSION,
    id: `support-calibration-${sha256Text(canonicalJson(body)).slice(0, 24)}`,
    ...body
  });
};

export const validateSupportCalibrationRecord = (
  value: unknown
): Result<SupportCalibrationRecord, PublicationContractError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SUPPORT_CALIBRATION_RECORD_SCHEMA_VERSION ||
    !pathSafeId(value.id) ||
    !pathSafeId(value.runId) ||
    !pathSafeId(value.memoId) ||
    !validTime(value.recordedAt) ||
    !readArtifactBinding(value.publicationDecision) ||
    !readArtifactBinding(value.calibrationPolicy) ||
    !pathSafeId(value.policyId) ||
    !positiveInteger(value.policyVersion) ||
    !Array.isArray(value.selectedObservationIds) ||
    !readSampledVerdicts(value.sampledVerdicts) ||
    !readDrillDownVerdicts(value.drillDownVerdicts) ||
    (value.thresholdStatus !== "not-reached" &&
      value.thresholdStatus !== "eligible-for-governance-review")
  ) return err("INVALID_CALIBRATION_RECORD");
  return ok(value as SupportCalibrationRecord);
};