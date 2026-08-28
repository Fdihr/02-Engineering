import type {
  ApprovedResearchQuestion,
  ApprovedResearchQuestionArtifact
} from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";

export type ResearchQuestionError =
  | "MISSING_RESEARCH_QUESTION"
  | "INVALID_RESEARCH_QUESTION"
  | "RESEARCH_QUESTION_NOT_APPROVED"
  | "INVALID_RESEARCH_TIME_WINDOW"
  | "QUESTION_APPROVED_AFTER_RETRIEVAL";

export type ResearchQuestionApprovalError =
  | "INVALID_RESEARCH_QUESTION"
  | "RESEARCH_QUESTION_NOT_PROPOSED"
  | "MISSING_RESEARCH_REVIEWER"
  | "INVALID_RESEARCH_APPROVAL_TIME"
  | "INVALID_RESEARCH_TIME_WINDOW";

type ResearchQuestionDefinition = Omit<
  ApprovedResearchQuestionArtifact,
  "status" | "approvedBy" | "approvedAt"
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const nonEmptyStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const normalized = value.map(nonEmptyString);
  return normalized.every((entry): entry is string => entry !== undefined)
    ? normalized
    : undefined;
};

const readQuestionDefinition = (
  value: Record<string, unknown>
): Result<
  ResearchQuestionDefinition,
  "INVALID_RESEARCH_QUESTION" | "INVALID_RESEARCH_TIME_WINDOW"
> => {
  const id = nonEmptyString(value.id);
  const runId = nonEmptyString(value.runId);
  const question = nonEmptyString(value.question);
  const rationale = nonEmptyString(value.rationale);
  const geographies = nonEmptyStringArray(value.geographies);
  if (
    !id ||
    !runId ||
    typeof value.scopeVersion !== "number" ||
    !Number.isInteger(value.scopeVersion) ||
    value.scopeVersion < 1 ||
    !question ||
    !rationale ||
    !geographies ||
    !isRecord(value.timeWindow)
  ) {
    return err("INVALID_RESEARCH_QUESTION");
  }

  const from = nonEmptyString(value.timeWindow.from);
  const to = nonEmptyString(value.timeWindow.to);
  if (
    !from ||
    !to ||
    Number.isNaN(Date.parse(from)) ||
    Number.isNaN(Date.parse(to)) ||
    Date.parse(from) > Date.parse(to)
  ) {
    return err("INVALID_RESEARCH_TIME_WINDOW");
  }

  return ok({
    id,
    runId,
    scopeVersion: value.scopeVersion,
    question,
    rationale,
    geographies,
    timeWindow: { from, to }
  });
};

export const approveResearchQuestion = (
  value: unknown,
  reviewerId: string,
  approvedAt: string
): Result<ApprovedResearchQuestionArtifact, ResearchQuestionApprovalError> => {
  if (!isRecord(value)) {
    return err("INVALID_RESEARCH_QUESTION");
  }
  if (value.status !== "proposed") {
    return err("RESEARCH_QUESTION_NOT_PROPOSED");
  }

  const approvedBy = nonEmptyString(reviewerId);
  if (!approvedBy) {
    return err("MISSING_RESEARCH_REVIEWER");
  }
  if (!nonEmptyString(approvedAt) || Number.isNaN(Date.parse(approvedAt))) {
    return err("INVALID_RESEARCH_APPROVAL_TIME");
  }

  const definition = readQuestionDefinition(value);
  if (!definition.ok) {
    return definition;
  }

  return ok({
    ...definition.value,
    status: "approved",
    approvedBy,
    approvedAt
  });
};

export const validateApprovedResearchQuestion = (
  value: unknown,
  retrievedAt: string
): Result<ApprovedResearchQuestion, ResearchQuestionError> => {
  if (value === undefined || value === null) {
    return err("MISSING_RESEARCH_QUESTION");
  }
  if (!isRecord(value)) {
    return err("INVALID_RESEARCH_QUESTION");
  }
  if (value.status !== "approved") {
    return err("RESEARCH_QUESTION_NOT_APPROVED");
  }

  const definition = readQuestionDefinition(value);
  if (!definition.ok) {
    return definition;
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
    return err("INVALID_RESEARCH_QUESTION");
  }
  if (Date.parse(approvedAt) > Date.parse(retrievedAt)) {
    return err("QUESTION_APPROVED_AFTER_RETRIEVAL");
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