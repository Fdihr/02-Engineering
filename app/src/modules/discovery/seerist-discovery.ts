import type { ApprovedResearchQuestion } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  validateApprovedResearchQuestion,
  type ResearchQuestionError
} from "../research/research-question.js";

export type SeeristDiscoveryQuery = {
  id: string;
  search: string;
  sources: string;
  aoiId?: string;
};

export type SeeristDiscoveryPlan = {
  id: string;
  runId: string;
  researchQuestionId: string;
  provider: "seerist";
  endpoint: "/v1/wod";
  queries: SeeristDiscoveryQuery[];
  rankingTerms: string[];
  pageSize: number;
  maxPagesPerQuery: number;
  maxApiCalls: number;
  maxResults: number;
  minimumScore: number;
};

export type PreparedSeeristDiscovery = {
  plan: SeeristDiscoveryPlan;
  researchQuestion: ApprovedResearchQuestion;
};

export type CollectedSeeristPage = {
  queryId: string;
  pageOffset: number;
  artifactRef: string;
  payload: unknown;
};

export type SeeristDiscoveryCandidate = {
  providerItemId: string;
  sourceType?: string;
  providerTimestamp?: string;
  title?: string;
  summary?: string;
  sourceUrl?: string;
  clusterId?: string;
  clusterSize?: number;
  score: number;
  matchedTerms: string[];
  queryIds: string[];
  rawArtifactRefs: string[];
};

export type SeeristDiscoveryError =
  | ResearchQuestionError
  | "INVALID_DISCOVERY_PLAN"
  | "RESEARCH_QUESTION_MISMATCH"
  | "RESEARCH_RUN_MISMATCH";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const nonEmptyUniqueStrings = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const strings = value.map(nonEmptyString);
  if (strings.some((entry) => entry === undefined)) {
    return undefined;
  }
  const unique = [...new Set(strings as string[])];
  return unique.length === strings.length ? unique : undefined;
};

const boundedInteger = (
  value: unknown,
  minimum: number,
  maximum: number
): number | undefined =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum
    ? value
    : undefined;

const readQueries = (value: unknown): SeeristDiscoveryQuery[] | undefined => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    return undefined;
  }

  const queries: SeeristDiscoveryQuery[] = [];
  for (const query of value) {
    if (!isRecord(query)) {
      return undefined;
    }
    const id = nonEmptyString(query.id);
    const search = nonEmptyString(query.search);
    const sources = nonEmptyString(query.sources);
    const aoiId = query.aoiId === undefined ? undefined : nonEmptyString(query.aoiId);
    if (!id || !search || !sources || (query.aoiId !== undefined && !aoiId)) {
      return undefined;
    }
    queries.push({ id, search, sources, ...(aoiId ? { aoiId } : {}) });
  }

  return new Set(queries.map((query) => query.id)).size === queries.length
    ? queries
    : undefined;
};

const readPlan = (
  value: unknown
): Result<SeeristDiscoveryPlan, "INVALID_DISCOVERY_PLAN"> => {
  if (!isRecord(value)) {
    return err("INVALID_DISCOVERY_PLAN");
  }

  const id = nonEmptyString(value.id);
  const runId = nonEmptyString(value.runId);
  const researchQuestionId = nonEmptyString(value.researchQuestionId);
  const queries = readQueries(value.queries);
  const rankingTerms = nonEmptyUniqueStrings(value.rankingTerms);
  const pageSize = boundedInteger(value.pageSize, 1, 100);
  const maxPagesPerQuery = boundedInteger(value.maxPagesPerQuery, 1, 10);
  const maxApiCalls = boundedInteger(value.maxApiCalls, 1, 50);
  const maxResults = boundedInteger(value.maxResults, 1, 500);
  const minimumScore = boundedInteger(value.minimumScore, 1, 100);
  if (
    !id ||
    !runId ||
    !researchQuestionId ||
    value.provider !== "seerist" ||
    value.endpoint !== "/v1/wod" ||
    !queries ||
    !rankingTerms ||
    pageSize === undefined ||
    maxPagesPerQuery === undefined ||
    maxApiCalls === undefined ||
    maxResults === undefined ||
    minimumScore === undefined ||
    queries.length * maxPagesPerQuery > maxApiCalls
  ) {
    return err("INVALID_DISCOVERY_PLAN");
  }

  return ok({
    id,
    runId,
    researchQuestionId,
    provider: "seerist",
    endpoint: "/v1/wod",
    queries,
    rankingTerms,
    pageSize,
    maxPagesPerQuery,
    maxApiCalls,
    maxResults,
    minimumScore
  });
};

export const prepareSeeristDiscovery = (
  planValue: unknown,
  researchQuestionValue: unknown,
  requestedAt: string
): Result<PreparedSeeristDiscovery, SeeristDiscoveryError> => {
  const researchQuestion = validateApprovedResearchQuestion(
    researchQuestionValue,
    requestedAt
  );
  if (!researchQuestion.ok) {
    return researchQuestion;
  }

  const plan = readPlan(planValue);
  if (!plan.ok) {
    return plan;
  }
  if (plan.value.researchQuestionId !== researchQuestion.value.id) {
    return err("RESEARCH_QUESTION_MISMATCH");
  }
  if (plan.value.runId !== researchQuestion.value.runId) {
    return err("RESEARCH_RUN_MISMATCH");
  }

  return ok({ plan: plan.value, researchQuestion: researchQuestion.value });
};

const normalizedText = (value: unknown): string =>
  typeof value === "string" ? value.toLocaleLowerCase("en") : "";

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const rankSeeristDiscoveryCandidates = (
  plan: SeeristDiscoveryPlan,
  pages: CollectedSeeristPage[]
): SeeristDiscoveryCandidate[] => {
  const candidates = new Map<string, SeeristDiscoveryCandidate>();

  for (const page of pages) {
    if (!isRecord(page.payload) || !Array.isArray(page.payload.features)) {
      continue;
    }

    for (const feature of page.payload.features) {
      if (!isRecord(feature) || !isRecord(feature.properties)) {
        continue;
      }
      const properties = feature.properties;
      const providerItemId =
        typeof properties.id === "number" && Number.isFinite(properties.id)
          ? String(properties.id)
          : nonEmptyString(properties.id);
      if (!providerItemId) {
        continue;
      }

      const title = optionalString(properties.title);
      const summary = optionalString(properties.summary);
      const titleText = normalizedText(title);
      const summaryText = normalizedText(summary);
      const matchedTerms: string[] = [];
      let score = 0;
      for (const term of plan.rankingTerms) {
        const normalizedTerm = term.toLocaleLowerCase("en");
        const titleMatch = titleText.includes(normalizedTerm);
        const summaryMatch = summaryText.includes(normalizedTerm);
        if (titleMatch || summaryMatch) {
          matchedTerms.push(term);
          score += (titleMatch ? 3 : 0) + (summaryMatch ? 1 : 0);
        }
      }

      const existing = candidates.get(providerItemId);
      if (existing) {
        existing.queryIds = [...new Set([...existing.queryIds, page.queryId])].sort();
        existing.rawArtifactRefs = [
          ...new Set([...existing.rawArtifactRefs, page.artifactRef])
        ].sort();
        continue;
      }

      candidates.set(providerItemId, {
        providerItemId,
        ...(optionalString(properties.source) ? { sourceType: properties.source as string } : {}),
        ...(optionalString(properties["@timestamp"])
          ? { providerTimestamp: properties["@timestamp"] as string }
          : {}),
        ...(title ? { title } : {}),
        ...(summary ? { summary } : {}),
        ...(optionalString(properties.link ?? properties.source_url)
          ? { sourceUrl: (properties.link ?? properties.source_url) as string }
          : {}),
        ...(optionalString(properties.cluster_id)
          ? { clusterId: properties.cluster_id as string }
          : {}),
        ...(finiteNumber(properties.cluster_size) !== undefined
          ? { clusterSize: properties.cluster_size as number }
          : {}),
        score,
        matchedTerms,
        queryIds: [page.queryId],
        rawArtifactRefs: [page.artifactRef]
      });
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.score >= plan.minimumScore)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.providerTimestamp ?? "").localeCompare(left.providerTimestamp ?? "") ||
        left.providerItemId.localeCompare(right.providerItemId)
    )
    .slice(0, plan.maxResults);
};