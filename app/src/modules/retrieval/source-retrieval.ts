import type { ApprovedResearchQuestion } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { validateApprovedResearchQuestion } from "../research/research-question.js";

export type PreparedSourceRetrieval = {
  runId: string;
  providerItemId: string;
  sourceUrl: string;
  attemptedAt: string;
  researchQuestion: ApprovedResearchQuestion;
};

export type SourceRetrievalError =
  | "INVALID_INTAKE_RESULT"
  | "LEAD_NOT_ROUTED_TO_RETRIEVAL"
  | "SOURCE_URL_NOT_ON_LEAD"
  | "UNSAFE_SOURCE_URL"
  | "INVALID_RETRIEVAL_TIME"
  | "INVALID_RESEARCH_QUESTION";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const stringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const values = value.map(nonEmptyString);
  return values.every((entry): entry is string => entry !== undefined)
    ? values
    : undefined;
};

const isPrivateIpv4 = (hostname: string): boolean => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

export const isSafeSourceUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !hostname.endsWith(".local") &&
      hostname !== "localhost" &&
      hostname !== "[::1]" &&
      !hostname.startsWith("[fc") &&
      !hostname.startsWith("[fd") &&
      !hostname.startsWith("[fe8") &&
      !hostname.startsWith("[fe9") &&
      !hostname.startsWith("[fea") &&
      !hostname.startsWith("[feb") &&
      !isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
};

export const prepareSourceRetrieval = (
  intakeValue: unknown,
  requestedSourceUrl: string,
  attemptedAt: string
): Result<PreparedSourceRetrieval, SourceRetrievalError> => {
  if (!nonEmptyString(attemptedAt) || Number.isNaN(Date.parse(attemptedAt))) {
    return err("INVALID_RETRIEVAL_TIME");
  }
  if (!isRecord(intakeValue)) {
    return err("INVALID_INTAKE_RESULT");
  }

  const { item, decision, ledgerEntry } = intakeValue;
  if (!isRecord(item) || !isRecord(decision) || !isRecord(ledgerEntry)) {
    return err("INVALID_INTAKE_RESULT");
  }
  const providerItemId = nonEmptyString(item.providerItemId);
  const decisionItemId = nonEmptyString(decision.providerItemId);
  const runId = nonEmptyString(ledgerEntry.runId);
  const sourceLinks = stringArray(item.sourceLinks);
  if (
    item.provider !== "seerist" ||
    !providerItemId ||
    !decisionItemId ||
    providerItemId !== decisionItemId ||
    !runId ||
    ledgerEntry.eventType !== "intake.item.routed" ||
    ledgerEntry.status !== "completed" ||
    !sourceLinks
  ) {
    return err("INVALID_INTAKE_RESULT");
  }
  if (
    item.role !== "collection_lead" ||
    decision.role !== "collection_lead" ||
    decision.destination !== "source_retrieval" ||
    decision.approvalStatus !== "not_applicable"
  ) {
    return err("LEAD_NOT_ROUTED_TO_RETRIEVAL");
  }

  const sourceUrl = nonEmptyString(requestedSourceUrl);
  if (!sourceUrl || !sourceLinks.includes(sourceUrl)) {
    return err("SOURCE_URL_NOT_ON_LEAD");
  }
  if (!isSafeSourceUrl(sourceUrl)) {
    return err("UNSAFE_SOURCE_URL");
  }

  const researchQuestion = validateApprovedResearchQuestion(
    item.researchQuestion,
    attemptedAt
  );
  if (!researchQuestion.ok || researchQuestion.value.runId !== runId) {
    return err("INVALID_RESEARCH_QUESTION");
  }

  return ok({
    runId,
    providerItemId,
    sourceUrl,
    attemptedAt,
    researchQuestion: researchQuestion.value
  });
};