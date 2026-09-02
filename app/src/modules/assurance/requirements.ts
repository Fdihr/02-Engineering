import { err, ok, type Result } from "../../core/result.js";
import { validateApprovedResearchQuestion } from "../research/research-question.js";
import {
  APPROVED_REQUIREMENTS_SCHEMA_VERSION,
  type ApprovedRequirements,
  type RequirementDefinition
} from "./types.js";
import {
  boundedString,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  pathSafeId,
  validSha256,
  validTime
} from "./validators.js";

export const MAX_REQUIREMENTS = 24;

export type RequirementsError =
  | "INVALID_REQUIREMENTS_PROPOSAL"
  | "INVALID_REQUIREMENT"
  | "DUPLICATE_REQUIREMENT_ID"
  | "INVALID_RESEARCH_QUESTION"
  | "RESEARCH_QUESTION_MISMATCH"
  | "RESEARCH_RUN_MISMATCH"
  | "MISSING_REVIEWER"
  | "INVALID_APPROVAL_TIME"
  | "INVALID_PROPOSAL_ARTIFACT"
  | "INVALID_APPROVED_REQUIREMENTS";

const readRequirements = (
  value: unknown
): Result<RequirementDefinition[], RequirementsError> => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REQUIREMENTS) {
    return err("INVALID_REQUIREMENTS_PROPOSAL");
  }

  const requirements: RequirementDefinition[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["irId", "text"])) {
      return err("INVALID_REQUIREMENT");
    }
    const irId = pathSafeId(entry.irId);
    const text = boundedString(entry.text, 400);
    if (!irId || !text) {
      return err("INVALID_REQUIREMENT");
    }
    if (seen.has(irId)) {
      return err("DUPLICATE_REQUIREMENT_ID");
    }
    seen.add(irId);
    requirements.push({ irId, text });
  }
  return ok(requirements);
};

export type ApproveRequirementsInput = {
  proposalValue: unknown;
  proposalArtifactRef: unknown;
  proposalArtifactSha256: unknown;
  researchQuestionValue: unknown;
  reviewerId: unknown;
  approvedAt: unknown;
};

export const approveRequirements = (
  input: ApproveRequirementsInput
): Result<ApprovedRequirements, RequirementsError> => {
  const proposal = input.proposalValue;
  if (
    !isRecord(proposal) ||
    !hasOnlyKeys(proposal, ["proposalId", "questionId", "runId", "requirements"])
  ) {
    return err("INVALID_REQUIREMENTS_PROPOSAL");
  }

  const proposalId = pathSafeId(proposal.proposalId);
  const questionId = nonEmptyString(proposal.questionId);
  const runId = pathSafeId(proposal.runId);
  if (!proposalId || !questionId || !runId) {
    return err("INVALID_REQUIREMENTS_PROPOSAL");
  }

  const requirements = readRequirements(proposal.requirements);
  if (!requirements.ok) {
    return requirements;
  }

  const approvedAt = validTime(input.approvedAt);
  if (!approvedAt) {
    return err("INVALID_APPROVAL_TIME");
  }
  const reviewerId = nonEmptyString(input.reviewerId);
  if (!reviewerId) {
    return err("MISSING_REVIEWER");
  }

  const proposalArtifactRef = nonEmptyString(input.proposalArtifactRef);
  const proposalArtifactSha256 = validSha256(input.proposalArtifactSha256);
  if (!proposalArtifactRef || !proposalArtifactSha256) {
    return err("INVALID_PROPOSAL_ARTIFACT");
  }

  const question = validateApprovedResearchQuestion(
    input.researchQuestionValue,
    approvedAt
  );
  if (!question.ok) {
    return err("INVALID_RESEARCH_QUESTION");
  }
  if (question.value.id !== questionId) {
    return err("RESEARCH_QUESTION_MISMATCH");
  }
  if (question.value.runId !== runId) {
    return err("RESEARCH_RUN_MISMATCH");
  }

  return ok({
    schemaVersion: APPROVED_REQUIREMENTS_SCHEMA_VERSION,
    approvalId: `approved-${proposalId}`,
    proposalId,
    questionId,
    runId,
    questionArtifactRef: question.value.artifactRef,
    questionArtifactSha256: question.value.artifactSha256,
    proposalArtifactRef,
    proposalArtifactSha256,
    requirements: requirements.value,
    approvedBy: reviewerId,
    approvedAt
  });
};

export const validateApprovedRequirements = (
  value: unknown
): Result<ApprovedRequirements, RequirementsError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "approvalId",
      "proposalId",
      "questionId",
      "runId",
      "questionArtifactRef",
      "questionArtifactSha256",
      "proposalArtifactRef",
      "proposalArtifactSha256",
      "requirements",
      "approvedBy",
      "approvedAt"
    ]) ||
    value.schemaVersion !== APPROVED_REQUIREMENTS_SCHEMA_VERSION
  ) {
    return err("INVALID_APPROVED_REQUIREMENTS");
  }

  const approvalId = pathSafeId(value.approvalId);
  const proposalId = pathSafeId(value.proposalId);
  const questionId = nonEmptyString(value.questionId);
  const runId = pathSafeId(value.runId);
  const questionArtifactRef = nonEmptyString(value.questionArtifactRef);
  const questionArtifactSha256 = validSha256(value.questionArtifactSha256);
  const proposalArtifactRef = nonEmptyString(value.proposalArtifactRef);
  const proposalArtifactSha256 = validSha256(value.proposalArtifactSha256);
  const approvedBy = nonEmptyString(value.approvedBy);
  const approvedAt = validTime(value.approvedAt);
  if (
    !approvalId ||
    !proposalId ||
    !questionId ||
    !runId ||
    !questionArtifactRef ||
    !questionArtifactSha256 ||
    !proposalArtifactRef ||
    !proposalArtifactSha256 ||
    !approvedBy ||
    !approvedAt ||
    approvalId !== `approved-${proposalId}`
  ) {
    return err("INVALID_APPROVED_REQUIREMENTS");
  }

  const requirements = readRequirements(value.requirements);
  if (!requirements.ok) {
    return requirements;
  }

  return ok({
    schemaVersion: APPROVED_REQUIREMENTS_SCHEMA_VERSION,
    approvalId,
    proposalId,
    questionId,
    runId,
    questionArtifactRef,
    questionArtifactSha256,
    proposalArtifactRef,
    proposalArtifactSha256,
    requirements: requirements.value,
    approvedBy,
    approvedAt
  });
};
