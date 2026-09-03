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
    !positiveInteger(value.sampleSizePerMemo) ||
    !positiveInteger(value.minimumSampledVerdicts) ||
    !positiveInteger(value.minimumMemos) ||
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