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

export const keyJudgementPolicyFromStandard = (
  standard: MemoStandardV1
): KeyJudgementPolicy => ({
  policyId: standard.keyJudgementPolicy.policyId,
  maxKeyJudgements: standard.keyJudgementPolicy.maxKeyJudgements,
  allowContested: standard.keyJudgementPolicy.allowContested,
  judgementTextMaxChars: standard.keyJudgementPolicy.judgementTextMaxChars
});

export const validateMemoStandardV1 = (
  value: unknown
): Result<MemoStandardV1, MemoStandardV1Error> => {
  if (
    !isRecord(value) ||
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
      "keyJudgementPolicy"
    ]) ||
    value.schemaVersion !== MEMO_STANDARD_V1_SCHEMA_VERSION ||
    value.id !== "memo-standard-v1" ||
    value.version !== 1 ||
    value.status !== "provisional-standard" ||
    !validTime(value.authoredAt) ||
    !Array.isArray(value.sourceMemoRefs) ||
    value.sourceMemoRefs.length !== 0 ||
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
    !hasOnlyKeys(value.limits, [
      "maxWords",
      "blufStatements",
      "maxAnalysisStatements",
      "maxUncertaintyStatements",
      "maxIndicatorStatements"
    ]) ||
    !positiveInteger(value.limits.maxWords) ||
    value.limits.blufStatements !== 1 ||
    !positiveInteger(value.limits.maxAnalysisStatements) ||
    !positiveInteger(value.limits.maxUncertaintyStatements) ||
    !positiveInteger(value.limits.maxIndicatorStatements) ||
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
    value.keyJudgementPolicy.maxKeyJudgementsStatus !== "provisional" ||
    typeof value.keyJudgementPolicy.allowContested !== "boolean" ||
    !positiveInteger(value.keyJudgementPolicy.judgementTextMaxChars)
  ) {
    return err("INVALID_MEMO_STANDARD_V1");
  }
  return ok(value as MemoStandardV1);
};