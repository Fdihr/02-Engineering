import { err, ok, type Result } from "../../core/result.js";
import {
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  positiveInteger,
  validTime
} from "../assurance/validators.js";
import type { KeyJudgementPolicy } from "../synthesis/key-judgements.js";

export const MEMO_STANDARD_V1_SCHEMA_VERSION = "memo-standard-pack-v1" as const;
export const MEMO_STANDARD_V2_SCHEMA_VERSION = "memo-standard-pack-v2" as const;
export const MEMO_STANDARD_V3_SCHEMA_VERSION = "memo-standard-pack-v3" as const;
export const MEMO_STANDARD_V4_SCHEMA_VERSION = "memo-standard-pack-v4" as const;
export const DEFAULT_MEMO_STANDARD_PATH = "src/modules/memo/standards/memo-standard-v4.json";

export type MemoStandardV1 = {
  schemaVersion: typeof MEMO_STANDARD_V1_SCHEMA_VERSION;
  id: "memo-standard-v1";
  version: 1;
  status: "provisional-standard";
  authoredAt: string;
  sourceMemoRefs: [];
  requiredSections: string[];
  confidenceLexicon: Record<"low" | "moderate" | "high", string>;
  citationRule: string;
  prohibitedPatterns: string[];
  limits: {
    maxWords: number;
    blufStatements: 1;
    maxAnalysisStatements: number;
    maxUncertaintyStatements: number;
    maxIndicatorStatements: number;
  };
  keyJudgementPolicy: KeyJudgementPolicy & {
    maxKeyJudgementsStatus: "provisional";
  };
};

export type MemoStandardV1Error = "INVALID_MEMO_STANDARD_V1";
export type MemoStandardV2 = Omit<MemoStandardV1, "schemaVersion" | "id" | "version" | "limits"> & {
  schemaVersion: typeof MEMO_STANDARD_V2_SCHEMA_VERSION;
  id: "memo-standard-v2";
  version: 2;
  limits: Omit<MemoStandardV1["limits"], "maxWords">;
};

export type MemoStandardSourceRef = {
  artifactRef: string;
  sha256: string;
  purpose: string;
};

export type MemoStandardRegressionExample = {
  id: string;
  case: string;
  expected: string[];
};

export type MemoStandardArchiveCoverage = {
  listedMemoCount: number;
  verifiedAndCuratedCount: number;
  excludedCount: number;
  exclusionReasons: string[];
  excludedArtifactRefs: string[];
};

export type MemoStandardV3 = Omit<
  MemoStandardV2,
  "schemaVersion" | "id" | "version" | "status" | "sourceMemoRefs" | "keyJudgementPolicy"
> & {
  schemaVersion: typeof MEMO_STANDARD_V3_SCHEMA_VERSION;
  id: "memo-standard-v3";
  version: 3;
  status: "approved-standard";
  approvedAt: string;
  approvedBy: string;
  sourceMemoRefs: MemoStandardSourceRef[];
  archiveCoverage: MemoStandardArchiveCoverage;
  curationSummary: string[];
  styleGuidance: string[];
  regressionExamples: MemoStandardRegressionExample[];
  keyJudgementPolicy: Omit<MemoStandardV1["keyJudgementPolicy"], "maxKeyJudgementsStatus"> & {
    maxKeyJudgementsStatus: "approved";
  };
};

export type MemoStandardV4Limits = {
  maxBlufStatements: number;
  maxSituationStatements: number;
  maxAnalysisStatements: number;
  maxUncertaintyStatements: number;
  maxIndicatorStatements: number;
};

export type MemoStandardV4 = Omit<
  MemoStandardV3,
  "schemaVersion" | "id" | "version" | "limits"
> & {
  schemaVersion: typeof MEMO_STANDARD_V4_SCHEMA_VERSION;
  id: "memo-standard-v4";
  version: 4;
  limits: MemoStandardV4Limits;
};

export type MemoStandard = MemoStandardV1 | MemoStandardV2 | MemoStandardV3 | MemoStandardV4;

export type MemoStandardV3ForWriter = Pick<
  MemoStandardV3,
  | "schemaVersion"
  | "id"
  | "version"
  | "requiredSections"
  | "confidenceLexicon"
  | "citationRule"
  | "prohibitedPatterns"
  | "limits"
  | "keyJudgementPolicy"
  | "styleGuidance"
>;

export type MemoStandardV4ForWriter = Pick<
  MemoStandardV4,
  | "schemaVersion"
  | "id"
  | "version"
  | "requiredSections"
  | "confidenceLexicon"
  | "citationRule"
  | "prohibitedPatterns"
  | "limits"
  | "keyJudgementPolicy"
  | "styleGuidance"
>;

export type MemoStandardForWriter =
  | MemoStandardV1
  | MemoStandardV2
  | MemoStandardV3ForWriter
  | MemoStandardV4ForWriter;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

const isSourceMemoRef = (value: unknown): value is MemoStandardSourceRef =>
  isRecord(value) &&
  hasOnlyKeys(value, ["artifactRef", "sha256", "purpose"]) &&
  isNonEmptyString(value.artifactRef) &&
  !value.artifactRef.startsWith("/") &&
  !value.artifactRef.includes("\\") &&
  !value.artifactRef.split("/").includes("..") &&
  typeof value.sha256 === "string" &&
  /^[a-f0-9]{64}$/.test(value.sha256) &&
  isNonEmptyString(value.purpose);

const isRegressionExample = (value: unknown): value is MemoStandardRegressionExample =>
  isRecord(value) &&
  hasOnlyKeys(value, ["id", "case", "expected"]) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.case) &&
  isStringList(value.expected);

const isArchiveCoverage = (value: unknown): value is MemoStandardArchiveCoverage =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "listedMemoCount",
    "verifiedAndCuratedCount",
    "excludedCount",
    "exclusionReasons",
    "excludedArtifactRefs"
  ]) &&
  isPositiveInteger(value.listedMemoCount) &&
  isPositiveInteger(value.verifiedAndCuratedCount) &&
  isNonNegativeInteger(value.excludedCount) &&
  value.excludedCount >= 0 &&
  value.listedMemoCount === value.verifiedAndCuratedCount + value.excludedCount &&
  isStringList(value.exclusionReasons) &&
  Array.isArray(value.excludedArtifactRefs) &&
  value.excludedArtifactRefs.length === value.excludedCount &&
  value.excludedArtifactRefs.every((entry) =>
    isNonEmptyString(entry) &&
    !entry.startsWith("/") &&
    !entry.includes("\\") &&
    !entry.split("/").includes("..")
  );

export const keyJudgementPolicyFromStandard = (
  standard: MemoStandard
): KeyJudgementPolicy => ({
  policyId: standard.keyJudgementPolicy.policyId,
  maxKeyJudgements: standard.keyJudgementPolicy.maxKeyJudgements,
  allowContested: standard.keyJudgementPolicy.allowContested,
  judgementTextMaxChars: standard.keyJudgementPolicy.judgementTextMaxChars
});

export const validateMemoStandard = (
  value: unknown
): Result<MemoStandard, "INVALID_MEMO_STANDARD"> => {
  if (!isRecord(value)) return err("INVALID_MEMO_STANDARD");
  const isV1 = value.schemaVersion === MEMO_STANDARD_V1_SCHEMA_VERSION &&
    value.id === "memo-standard-v1" && value.version === 1;
  const isV2 = value.schemaVersion === MEMO_STANDARD_V2_SCHEMA_VERSION &&
    value.id === "memo-standard-v2" && value.version === 2;
  const isV3 = value.schemaVersion === MEMO_STANDARD_V3_SCHEMA_VERSION &&
    value.id === "memo-standard-v3" && value.version === 3;
  const isV4 = value.schemaVersion === MEMO_STANDARD_V4_SCHEMA_VERSION &&
    value.id === "memo-standard-v4" && value.version === 4;
  const isApproved = isV3 || isV4;
  const approvedKeys = [
    "approvedAt",
    "approvedBy",
    "archiveCoverage",
    "curationSummary",
    "styleGuidance",
    "regressionExamples"
  ];
  if (
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "version",
      "status",
      "authoredAt",
      "sourceMemoRefs",
      "requiredSections",
      "confidenceLexicon",
      "citationRule",
      "prohibitedPatterns",
      "limits",
      "keyJudgementPolicy",
      ...(isApproved ? approvedKeys : [])
    ]) ||
    !(isV1 || isV2 || isV3 || isV4) ||
    value.status !== (isApproved ? "approved-standard" : "provisional-standard") ||
    !validTime(value.authoredAt) ||
    (isApproved && (!validTime(value.approvedAt) || !nonEmptyString(value.approvedBy))) ||
    !Array.isArray(value.sourceMemoRefs) ||
    (isApproved
      ? value.sourceMemoRefs.length === 0 ||
        !value.sourceMemoRefs.every(isSourceMemoRef) ||
        new Set(value.sourceMemoRefs.map((ref) => (ref as MemoStandardSourceRef).artifactRef)).size !== value.sourceMemoRefs.length ||
        !isArchiveCoverage(value.archiveCoverage) ||
        value.archiveCoverage.verifiedAndCuratedCount !== value.sourceMemoRefs.length ||
        !isStringList(value.curationSummary)
      : value.sourceMemoRefs.length !== 0) ||
    !Array.isArray(value.requiredSections) ||
    value.requiredSections.length === 0 ||
    !value.requiredSections.every((section) => Boolean(nonEmptyString(section))) ||
    !isRecord(value.confidenceLexicon) ||
    !hasOnlyKeys(value.confidenceLexicon, ["low", "moderate", "high"]) ||
    !Object.values(value.confidenceLexicon).every((entry) =>
      Boolean(nonEmptyString(entry))
    ) ||
    !nonEmptyString(value.citationRule) ||
    !Array.isArray(value.prohibitedPatterns) ||
    !value.prohibitedPatterns.every((pattern) =>
      Boolean(nonEmptyString(pattern))
    ) ||
    !isRecord(value.limits) ||
    (isV4
      ? !hasOnlyKeys(value.limits, [
          "maxBlufStatements",
          "maxSituationStatements",
          "maxAnalysisStatements",
          "maxUncertaintyStatements",
          "maxIndicatorStatements"
        ]) ||
        !positiveInteger(value.limits.maxBlufStatements) ||
        !positiveInteger(value.limits.maxSituationStatements) ||
        !positiveInteger(value.limits.maxAnalysisStatements) ||
        !positiveInteger(value.limits.maxUncertaintyStatements) ||
        !positiveInteger(value.limits.maxIndicatorStatements)
      : !hasOnlyKeys(value.limits, [
          ...(value.version === 1 ? ["maxWords"] : []),
          "blufStatements",
          "maxAnalysisStatements",
          "maxUncertaintyStatements",
          "maxIndicatorStatements"
        ]) ||
        (value.version === 1 && !positiveInteger(value.limits.maxWords)) ||
        value.limits.blufStatements !== 1 ||
        !positiveInteger(value.limits.maxAnalysisStatements) ||
        !positiveInteger(value.limits.maxUncertaintyStatements) ||
        !positiveInteger(value.limits.maxIndicatorStatements)) ||
    !isRecord(value.keyJudgementPolicy) ||
    !hasOnlyKeys(value.keyJudgementPolicy, [
      "policyId",
      "maxKeyJudgements",
      "maxKeyJudgementsStatus",
      "allowContested",
      "judgementTextMaxChars"
    ]) ||
    !nonEmptyString(value.keyJudgementPolicy.policyId) ||
    !positiveInteger(value.keyJudgementPolicy.maxKeyJudgements) ||
    value.keyJudgementPolicy.maxKeyJudgementsStatus !== (isApproved ? "approved" : "provisional") ||
    typeof value.keyJudgementPolicy.allowContested !== "boolean" ||
    !positiveInteger(value.keyJudgementPolicy.judgementTextMaxChars) ||
    (isApproved &&
      (!isStringList(value.styleGuidance) ||
        !Array.isArray(value.regressionExamples) ||
        value.regressionExamples.length === 0 ||
        !value.regressionExamples.every(isRegressionExample)))
  ) {
    return err("INVALID_MEMO_STANDARD");
  }
  return ok(value as MemoStandard);
};

export const memoStandardForWriter = (standard: MemoStandard): MemoStandardForWriter => {
  if (standard.version !== 3 && standard.version !== 4) return standard;
  return {
    schemaVersion: standard.schemaVersion,
    id: standard.id,
    version: standard.version,
    requiredSections: standard.requiredSections,
    confidenceLexicon: standard.confidenceLexicon,
    citationRule: standard.citationRule,
    prohibitedPatterns: standard.prohibitedPatterns,
    limits: standard.limits,
    keyJudgementPolicy: standard.keyJudgementPolicy,
    styleGuidance: standard.styleGuidance
  } as MemoStandardForWriter;
};

const isMemoStandardV3ForWriter = (value: unknown): value is MemoStandardV3ForWriter =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "schemaVersion",
    "id",
    "version",
    "requiredSections",
    "confidenceLexicon",
    "citationRule",
    "prohibitedPatterns",
    "limits",
    "keyJudgementPolicy",
    "styleGuidance"
  ]) &&
  value.schemaVersion === MEMO_STANDARD_V3_SCHEMA_VERSION &&
  value.id === "memo-standard-v3" &&
  value.version === 3 &&
  isStringList(value.requiredSections) &&
  isRecord(value.confidenceLexicon) &&
  hasOnlyKeys(value.confidenceLexicon, ["low", "moderate", "high"]) &&
  Object.values(value.confidenceLexicon).every((entry) => Boolean(nonEmptyString(entry))) &&
  isNonEmptyString(value.citationRule) &&
  isStringList(value.prohibitedPatterns) &&
  isRecord(value.limits) &&
  hasOnlyKeys(value.limits, [
    "blufStatements",
    "maxAnalysisStatements",
    "maxUncertaintyStatements",
    "maxIndicatorStatements"
  ]) &&
  value.limits.blufStatements === 1 &&
  isPositiveInteger(value.limits.maxAnalysisStatements) &&
  isPositiveInteger(value.limits.maxUncertaintyStatements) &&
  isPositiveInteger(value.limits.maxIndicatorStatements) &&
  isRecord(value.keyJudgementPolicy) &&
  hasOnlyKeys(value.keyJudgementPolicy, [
    "policyId",
    "maxKeyJudgements",
    "maxKeyJudgementsStatus",
    "allowContested",
    "judgementTextMaxChars"
  ]) &&
  isNonEmptyString(value.keyJudgementPolicy.policyId) &&
  isPositiveInteger(value.keyJudgementPolicy.maxKeyJudgements) &&
  value.keyJudgementPolicy.maxKeyJudgementsStatus === "approved" &&
  typeof value.keyJudgementPolicy.allowContested === "boolean" &&
  isPositiveInteger(value.keyJudgementPolicy.judgementTextMaxChars) &&
  isStringList(value.styleGuidance);

const isMemoStandardV4ForWriter = (value: unknown): value is MemoStandardV4ForWriter =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "schemaVersion",
    "id",
    "version",
    "requiredSections",
    "confidenceLexicon",
    "citationRule",
    "prohibitedPatterns",
    "limits",
    "keyJudgementPolicy",
    "styleGuidance"
  ]) &&
  value.schemaVersion === MEMO_STANDARD_V4_SCHEMA_VERSION &&
  value.id === "memo-standard-v4" &&
  value.version === 4 &&
  isStringList(value.requiredSections) &&
  isRecord(value.confidenceLexicon) &&
  hasOnlyKeys(value.confidenceLexicon, ["low", "moderate", "high"]) &&
  Object.values(value.confidenceLexicon).every((entry) => Boolean(nonEmptyString(entry))) &&
  isNonEmptyString(value.citationRule) &&
  isStringList(value.prohibitedPatterns) &&
  isRecord(value.limits) &&
  hasOnlyKeys(value.limits, [
    "maxBlufStatements",
    "maxSituationStatements",
    "maxAnalysisStatements",
    "maxUncertaintyStatements",
    "maxIndicatorStatements"
  ]) &&
  isPositiveInteger(value.limits.maxBlufStatements) &&
  isPositiveInteger(value.limits.maxSituationStatements) &&
  isPositiveInteger(value.limits.maxAnalysisStatements) &&
  isPositiveInteger(value.limits.maxUncertaintyStatements) &&
  isPositiveInteger(value.limits.maxIndicatorStatements) &&
  isRecord(value.keyJudgementPolicy) &&
  hasOnlyKeys(value.keyJudgementPolicy, [
    "policyId",
    "maxKeyJudgements",
    "maxKeyJudgementsStatus",
    "allowContested",
    "judgementTextMaxChars"
  ]) &&
  isNonEmptyString(value.keyJudgementPolicy.policyId) &&
  isPositiveInteger(value.keyJudgementPolicy.maxKeyJudgements) &&
  value.keyJudgementPolicy.maxKeyJudgementsStatus === "approved" &&
  typeof value.keyJudgementPolicy.allowContested === "boolean" &&
  isPositiveInteger(value.keyJudgementPolicy.judgementTextMaxChars) &&
  isStringList(value.styleGuidance);

export const validateMemoStandardForWriter = (
  value: unknown
): Result<MemoStandardForWriter, "INVALID_MEMO_STANDARD"> => {
  if (isRecord(value) && value.version === 3) {
    return isMemoStandardV3ForWriter(value)
      ? ok(value)
      : err("INVALID_MEMO_STANDARD");
  }
  if (isRecord(value) && value.version === 4) {
    return isMemoStandardV4ForWriter(value)
      ? ok(value)
      : err("INVALID_MEMO_STANDARD");
  }
  const result = validateMemoStandard(value);
  return result.ok && result.value.version !== 3 && result.value.version !== 4
    ? ok(result.value)
    : err("INVALID_MEMO_STANDARD");
};

export const validateMemoStandardV1 = (
  value: unknown
): Result<MemoStandardV1, MemoStandardV1Error> => {
  const result = validateMemoStandard(value);
  return result.ok && result.value.version === 1 ? ok(result.value) : err("INVALID_MEMO_STANDARD_V1");
};