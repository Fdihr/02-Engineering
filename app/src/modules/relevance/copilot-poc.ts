import type {
  QuestionRelevanceRequest
} from "../../core/types.js";
import { err, type Result } from "../../core/result.js";
import {
  validateQuestionRelevanceAssessment,
  validateQuestionRelevanceRequest,
  type QuestionRelevanceError,
  type QuestionRelevanceOutput
} from "./question-relevance.js";

export const COPILOT_POC_RESPONSE_SCHEMA_VERSION =
  "question-relevance-copilot-poc-response-v1" as const;
export const COPILOT_POC_PROVIDER = "github-copilot-vscode" as const;
export const COPILOT_POC_MODEL = "not-exposed-by-host" as const;

export type CopilotPocResponseError =
  | QuestionRelevanceError
  | "INVALID_RELEVANCE_REQUEST"
  | "INVALID_POC_RESPONSE"
  | "RELEVANCE_REQUEST_MISMATCH";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const validSha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

export const assessCopilotPocResponse = (
  requestValue: unknown,
  requestArtifactRefValue: unknown,
  requestArtifactSha256Value: unknown,
  responseValue: unknown,
  responseArtifactRefValue: unknown,
  responseArtifactSha256Value: unknown
): Result<QuestionRelevanceOutput, CopilotPocResponseError> => {
  const request = validateQuestionRelevanceRequest(requestValue);
  if (!request.ok) {
    return err("INVALID_RELEVANCE_REQUEST");
  }
  const requestArtifactRef = nonEmptyString(requestArtifactRefValue);
  const requestArtifactSha256 = validSha256(requestArtifactSha256Value);
  const responseArtifactRef = nonEmptyString(responseArtifactRefValue);
  const responseArtifactSha256 = validSha256(responseArtifactSha256Value);
  if (
    !requestArtifactRef ||
    !requestArtifactSha256 ||
    !responseArtifactRef ||
    !responseArtifactSha256 ||
    !isRecord(responseValue) ||
    !hasOnlyKeys(responseValue, [
      "schemaVersion",
      "requestId",
      "invocationId",
      "startedAt",
      "completedAt",
      "proposal"
    ])
  ) {
    return err("INVALID_POC_RESPONSE");
  }
  if (
    responseValue.schemaVersion !== COPILOT_POC_RESPONSE_SCHEMA_VERSION ||
    responseValue.requestId !== request.value.id
  ) {
    return err("RELEVANCE_REQUEST_MISMATCH");
  }
  const invocationId = nonEmptyString(responseValue.invocationId);
  if (!invocationId) {
    return err("INVALID_POC_RESPONSE");
  }

  return validateQuestionRelevanceAssessment({
    assessedAt: responseValue.completedAt,
    researchQuestion: request.value.researchQuestion,
    sourceDocument: request.value.sourceDocument,
    sourceDocumentArtifactRef: request.value.sourceDocumentArtifactRef,
    sourceDocumentArtifactSha256: request.value.sourceDocumentArtifactSha256,
    modelInvocation: {
      id: invocationId,
      provider: COPILOT_POC_PROVIDER,
      model: COPILOT_POC_MODEL,
      promptPolicyVersion: request.value.promptPolicyVersion,
      promptArtifactRef: requestArtifactRef,
      promptArtifactSha256: requestArtifactSha256,
      responseArtifactRef,
      responseArtifactSha256,
      startedAt: responseValue.startedAt,
      completedAt: responseValue.completedAt
    },
    proposal: responseValue.proposal
  });
};