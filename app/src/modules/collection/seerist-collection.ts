import type { ApprovedResearchQuestion } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  validateApprovedResearchQuestion,
  type ResearchQuestionError
} from "../research/research-question.js";

const SEERIST_BASE_URL = "https://app.seerist.com/hyperionapi/";

type QueryValue = string | number | boolean;

export type SeeristProviderOperation = {
  id: string;
  runId: string;
  researchQuestionId: string;
  provider: "seerist";
  method: "GET";
  endpoint: string;
  filters: Record<string, QueryValue>;
};

export type PreparedSeeristCollection = {
  operation: SeeristProviderOperation;
  researchQuestion: ApprovedResearchQuestion;
  requestedAt: string;
  requestUrl: string;
};

export type SeeristCollectionError =
  | ResearchQuestionError
  | "INVALID_COLLECTION_TIME"
  | "INVALID_PROVIDER_OPERATION"
  | "RESEARCH_QUESTION_MISMATCH"
  | "RESEARCH_RUN_MISMATCH";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readFilters = (value: unknown): Record<string, QueryValue> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const filters: Record<string, QueryValue> = {};
  for (const [key, filterValue] of Object.entries(value)) {
    if (
      !key.trim() ||
      (typeof filterValue !== "string" &&
        typeof filterValue !== "number" &&
        typeof filterValue !== "boolean") ||
      (typeof filterValue === "number" && !Number.isFinite(filterValue))
    ) {
      return undefined;
    }
    filters[key] = filterValue;
  }
  return filters;
};

const readOperation = (
  value: unknown
): Result<SeeristProviderOperation, "INVALID_PROVIDER_OPERATION"> => {
  if (!isRecord(value)) {
    return err("INVALID_PROVIDER_OPERATION");
  }

  const id = nonEmptyString(value.id);
  const runId = nonEmptyString(value.runId);
  const researchQuestionId = nonEmptyString(value.researchQuestionId);
  const endpoint = nonEmptyString(value.endpoint);
  const filters = readFilters(value.filters);
  if (
    !id ||
    !runId ||
    !researchQuestionId ||
    value.provider !== "seerist" ||
    value.method !== "GET" ||
    endpoint !== "/v1/wod" ||
    filters === undefined
  ) {
    return err("INVALID_PROVIDER_OPERATION");
  }

  const url = new URL(endpoint.slice(1), SEERIST_BASE_URL);
  if (
    !url.href.startsWith(SEERIST_BASE_URL) ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    return err("INVALID_PROVIDER_OPERATION");
  }
  for (const [key, filterValue] of Object.entries(filters)) {
    url.searchParams.set(key, String(filterValue));
  }

  return ok({
    id,
    runId,
    researchQuestionId,
    provider: "seerist",
    method: "GET",
    endpoint,
    filters
  });
};

export const prepareSeeristCollection = (
  operationValue: unknown,
  researchQuestionValue: unknown,
  requestedAt: string
): Result<PreparedSeeristCollection, SeeristCollectionError> => {
  if (!nonEmptyString(requestedAt) || Number.isNaN(Date.parse(requestedAt))) {
    return err("INVALID_COLLECTION_TIME");
  }

  const researchQuestion = validateApprovedResearchQuestion(
    researchQuestionValue,
    requestedAt
  );
  if (!researchQuestion.ok) {
    return researchQuestion;
  }

  const operation = readOperation(operationValue);
  if (!operation.ok) {
    return operation;
  }
  if (operation.value.researchQuestionId !== researchQuestion.value.id) {
    return err("RESEARCH_QUESTION_MISMATCH");
  }
  if (operation.value.runId !== researchQuestion.value.runId) {
    return err("RESEARCH_RUN_MISMATCH");
  }

  const requestUrl = new URL(operation.value.endpoint.slice(1), SEERIST_BASE_URL);
  for (const [key, filterValue] of Object.entries(operation.value.filters)) {
    requestUrl.searchParams.set(key, String(filterValue));
  }

  return ok({
    operation: operation.value,
    researchQuestion: researchQuestion.value,
    requestedAt,
    requestUrl: requestUrl.href
  });
};