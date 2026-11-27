import type { ApprovedResearchQuestion } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { normalizeSeeristHtmlText } from "../intake/intake.js";
import {
  validateApprovedResearchQuestion,
  type ResearchQuestionError
} from "../research/research-question.js";
import { resolveGeographyAois } from "./seerist-aois.js";
import { assignSourceTier, type SourceTierPolicy } from "./source-tiers.js";

export type SeeristDiscoveryQuery = {
  id: string;
  search: string;
  sources: string;
  aoiId?: string;
};

export type SeeristSupplementalQuery =
  | {
      id: string;
      kind: "breaking-events";
      aoiId?: string;
      pageSize?: number;
    }
  | {
      id: string;
      kind: "verified-events";
      aoiId?: string;
      sources?: string;
      pageSize?: number;
    }
  | {
      id: string;
      kind: "scribe-country";
      aoiId: string;
      date?: string;
    }
  | {
      id: string;
      kind: "hotspots";
      aoiId?: string;
      maxClusterFollowups?: number;
    };

export type SeeristDiscoveryPlan = {
  id: string;
  runId: string;
  researchQuestionId: string;
  provider: "seerist";
  endpoint: "/v1/wod";
  queries: SeeristDiscoveryQuery[];
  supplementalQueries?: SeeristSupplementalQuery[];
  autoExpandGeography?: boolean;
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
  endpoint?: string;
  cacheStatus?: string;
  payload: unknown;
};

export type SeeristPageObservation = {
  operationId: string;
  pageOffset: number;
  pageSize: number;
  total?: number;
  newestObservedAt?: string;
  oldestObservedAt?: string;
  itemIds: string[];
  next?: string;
  prev?: string;
  cacheStatus?: string;
};

export type SeeristPaginationAssessment = {
  operationId: string;
  queryId: string;
  status: "consistent" | "snapshot-drift" | "incomplete" | "not-applicable";
  observations: SeeristPageObservation[];
  reasons: string[];
};

export type SeeristDiscoveryCandidate = {
  providerItemId: string;
  endpoint?: string;
  sourceType?: string;
  breakingStatus?: string;
  providerTimestamp?: string;
  title?: string;
  summary?: string;
  sourceUrl?: string;
  clusterId?: string;
  clusterSize?: number;
  tier: number;
  tierId: string;
  tierLabel: string;
  score: number;
  shortlisted: boolean;
  matchedTerms: string[];
  queryIds: string[];
  rawArtifactRefs: string[];
  collectionLimitations: string[];
};

export type SeeristDiscoveryError =
  | ResearchQuestionError
  | "INVALID_DISCOVERY_PLAN"
  | "MEMO_SCOPE_APPROVAL_REQUIRED"
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

const readSupplementalQueries = (
  value: unknown
): SeeristSupplementalQuery[] | undefined => {
  if (!Array.isArray(value) || value.length > 12) {
    return undefined;
  }

  const supplemental: SeeristSupplementalQuery[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    const id = nonEmptyString(item.id);
    const kind = nonEmptyString(item.kind);
    if (!id || !kind) {
      return undefined;
    }

    if (kind === "breaking-events") {
      const aoiId = item.aoiId === undefined ? undefined : nonEmptyString(item.aoiId)?.toLowerCase();
      const pageSize = item.pageSize === undefined ? undefined : boundedInteger(item.pageSize, 1, 100);
      if (
        (item.aoiId !== undefined && (!aoiId || !/^[a-z]{2}$/.test(aoiId))) ||
        (item.pageSize !== undefined && pageSize === undefined)
      ) {
        return undefined;
      }
      supplemental.push({
        id,
        kind: "breaking-events",
        ...(aoiId ? { aoiId } : {}),
        ...(pageSize !== undefined ? { pageSize } : {})
      });
      continue;
    }

    if (kind === "verified-events") {
      const aoiId = item.aoiId === undefined ? undefined : nonEmptyString(item.aoiId)?.toLowerCase();
      const sources = item.sources === undefined ? undefined : nonEmptyString(item.sources);
      const pageSize = item.pageSize === undefined ? undefined : boundedInteger(item.pageSize, 1, 100);
      if (
        (item.aoiId !== undefined && (!aoiId || !/^[a-z]{2}$/.test(aoiId))) ||
        (item.sources !== undefined && !sources) ||
        (item.pageSize !== undefined && pageSize === undefined)
      ) {
        return undefined;
      }
      supplemental.push({
        id,
        kind: "verified-events",
        ...(aoiId ? { aoiId } : {}),
        ...(sources ? { sources } : {}),
        ...(pageSize !== undefined ? { pageSize } : {})
      });
      continue;
    }

    if (kind === "scribe-country") {
      const aoiId = nonEmptyString(item.aoiId)?.toLowerCase();
      const date = item.date === undefined ? undefined : nonEmptyString(item.date);
      if (
        !aoiId ||
        !/^[a-z]{2}$/.test(aoiId) ||
        (item.date !== undefined && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)))
      ) {
        return undefined;
      }
      supplemental.push({
        id,
        kind: "scribe-country",
        aoiId,
        ...(date ? { date } : {})
      });
      continue;
    }

    if (kind === "hotspots") {
      const aoiId = item.aoiId === undefined ? undefined : nonEmptyString(item.aoiId)?.toLowerCase();
      const maxClusterFollowups =
        item.maxClusterFollowups === undefined
          ? undefined
          : boundedInteger(item.maxClusterFollowups, 0, 5);
      if (
        (item.aoiId !== undefined && (!aoiId || !/^[a-z]{2}$/.test(aoiId))) ||
        (item.maxClusterFollowups !== undefined && maxClusterFollowups === undefined)
      ) {
        return undefined;
      }
      supplemental.push({
        id,
        kind: "hotspots",
        ...(aoiId ? { aoiId } : {}),
        ...(maxClusterFollowups !== undefined ? { maxClusterFollowups } : {})
      });
      continue;
    }

    return undefined;
  }

  return new Set(supplemental.map((entry) => entry.id)).size === supplemental.length
    ? supplemental
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
  const supplementalQueries =
    value.supplementalQueries === undefined
      ? undefined
      : readSupplementalQueries(value.supplementalQueries);
  const autoExpandGeography =
    value.autoExpandGeography === undefined
      ? undefined
      : typeof value.autoExpandGeography === "boolean"
        ? value.autoExpandGeography
        : null;
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
    (value.supplementalQueries !== undefined && !supplementalQueries) ||
    autoExpandGeography === null ||
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

  if (supplementalQueries) {
    const allIds = [...queries.map((q) => q.id), ...supplementalQueries.map((q) => q.id)];
    if (new Set(allIds).size !== allIds.length) {
      return err("INVALID_DISCOVERY_PLAN");
    }
  }

  return ok({
    id,
    runId,
    researchQuestionId,
    provider: "seerist",
    endpoint: "/v1/wod",
    queries,
    ...(supplementalQueries && supplementalQueries.length > 0
      ? { supplementalQueries }
      : {}),
    ...(autoExpandGeography !== undefined ? { autoExpandGeography } : {}),
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
  if (!researchQuestion.value.scopeApproval) {
    return err("MEMO_SCOPE_APPROVAL_REQUIRED");
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

/**
 * Seerist echoes `x-api-key` inside GeoJSON `metadata.next` and `metadata.prev` links.
 * Strip API key parameters before storing pagination observations in derived artifacts.
 */
export const redactSeeristUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:x-api-key|api[-_]?key)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.href;
  } catch {
    return value
      .replace(/([?&])(?:x-api-key|api[-_]?key)=[^&#]*/gi, "$1")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");
  }
};

export const resolveSupplementalQueries = (
  plan: SeeristDiscoveryPlan,
  geographies: readonly string[]
): SeeristSupplementalQuery[] => {
  const result: SeeristSupplementalQuery[] = [...(plan.supplementalQueries ?? [])];
  if (!plan.autoExpandGeography) {
    return result;
  }

  const usedIds = new Set([
    ...plan.queries.map((q) => q.id),
    ...result.map((q) => q.id)
  ]);
  const hasEntry = (kind: SeeristSupplementalQuery["kind"], aoiId: string): boolean =>
    result.some((q) => q.kind === kind && q.aoiId === aoiId);

  for (const country of resolveGeographyAois(geographies).slice(0, 2)) {
    const aoiId = country.aoiId;
    const candidates: SeeristSupplementalQuery[] = [
      { id: `auto-breaking-${aoiId}`, kind: "breaking-events", aoiId, pageSize: 15 },
      {
        id: `auto-verified-${aoiId}`,
        kind: "verified-events",
        aoiId,
        sources: "news,political,maritime",
        pageSize: 20
      },
      { id: `auto-scribe-${aoiId}`, kind: "scribe-country", aoiId },
      { id: `auto-hotspots-${aoiId}`, kind: "hotspots", aoiId, maxClusterFollowups: 1 }
    ];
    for (const candidate of candidates) {
      if (!hasEntry(candidate.kind, aoiId) && !usedIds.has(candidate.id)) {
        usedIds.add(candidate.id);
        result.push(candidate);
      }
    }
  }
  return result;
};

export const resolveScribeSummaryDate = (
  windowToIso: string,
  referenceNowIso: string
): string => {
  const windowEpoch = Date.parse(windowToIso);
  const yesterdayEpoch = Date.parse(referenceNowIso) - 86_400_000;
  const chosenEpoch =
    Number.isFinite(windowEpoch) && Number.isFinite(yesterdayEpoch)
      ? Math.min(windowEpoch, yesterdayEpoch)
      : Number.isFinite(windowEpoch)
        ? windowEpoch
        : Date.now() - 86_400_000;
  return new Date(chosenEpoch).toISOString().slice(0, 10);
};

export const buildSupplementalSeeristOperation = (input: {
  planId: string;
  runId: string;
  researchQuestion: ApprovedResearchQuestion;
  supplementalQuery: SeeristSupplementalQuery;
  referenceNowIso: string;
}): {
  id: string;
  runId: string;
  researchQuestionId: string;
  provider: "seerist";
  method: "GET";
  endpoint: string;
  filters: Record<string, string | number | boolean>;
} => {
  const { planId, runId, researchQuestion, supplementalQuery, referenceNowIso } = input;
  const id = `${planId}-${supplementalQuery.id}`;

  switch (supplementalQuery.kind) {
    case "breaking-events":
      return {
        id,
        runId,
        researchQuestionId: researchQuestion.id,
        provider: "seerist",
        method: "GET",
        endpoint: "/v1/wod/breaking-events",
        filters: {
          ...(supplementalQuery.aoiId ? { aoiId: supplementalQuery.aoiId } : {}),
          start: researchQuestion.timeWindow.from,
          end: researchQuestion.timeWindow.to,
          pageSize: supplementalQuery.pageSize ?? 15,
          pageOffset: 0,
          sortDirection: "desc"
        }
      };
    case "verified-events":
      return {
        id,
        runId,
        researchQuestionId: researchQuestion.id,
        provider: "seerist",
        method: "GET",
        endpoint: "/v1/wod",
        filters: {
          eventType: "verified",
          sources: supplementalQuery.sources ?? "news,political,maritime",
          ...(supplementalQuery.aoiId ? { aoiId: supplementalQuery.aoiId } : {}),
          start: researchQuestion.timeWindow.from,
          end: researchQuestion.timeWindow.to,
          pageSize: supplementalQuery.pageSize ?? 20,
          pageOffset: 0,
          sortDirection: "desc"
        }
      };
    case "scribe-country":
      return {
        id,
        runId,
        researchQuestionId: researchQuestion.id,
        provider: "seerist",
        method: "GET",
        endpoint: `/v2/auto-summary/${supplementalQuery.aoiId}/country`,
        filters: {
          date:
            supplementalQuery.date ??
            resolveScribeSummaryDate(researchQuestion.timeWindow.to, referenceNowIso)
        }
      };
    case "hotspots":
      return {
        id,
        runId,
        researchQuestionId: researchQuestion.id,
        provider: "seerist",
        method: "GET",
        endpoint: "/v1/hotspots",
        filters: {
          ...(supplementalQuery.aoiId ? { aoiId: supplementalQuery.aoiId } : {}),
          start: researchQuestion.timeWindow.from,
          end: researchQuestion.timeWindow.to,
          pageSize: 10,
          pageOffset: 0
        }
      };
  }
};

export const extractHotspotClusterIds = (
  payload: unknown,
  rankingTerms: readonly string[],
  maxClusters = 2
): string[] => {
  if (!isRecord(payload) || !Array.isArray(payload.features) || maxClusters <= 0) {
    return [];
  }

  const scored: Array<{ clusterId: string; score: number; index: number }> = [];
  let featureIndex = 0;
  for (const feature of payload.features) {
    featureIndex += 1;
    if (!isRecord(feature) || !isRecord(feature.properties)) {
      continue;
    }
    const props = feature.properties;
    const rawClusterIds = Array.isArray(props.clusterIds)
      ? props.clusterIds.map(nonEmptyString).filter((entry): entry is string => Boolean(entry))
      : [];
    if (rawClusterIds.length === 0) {
      continue;
    }

    const headline = typeof props.headline === "string" ? props.headline.toLocaleLowerCase("en") : "";
    const keywordBag = [
      ...(Array.isArray(props.topics) ? props.topics : []),
      ...(Array.isArray(props.keywords) ? props.keywords : [])
    ]
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ")
      .toLocaleLowerCase("en");

    let score = 0;
    for (const term of rankingTerms) {
      const normalized = term.toLocaleLowerCase("en");
      if (headline.includes(normalized)) score += 3;
      else if (keywordBag.includes(normalized)) score += 1;
    }

    if (score > 0) {
      for (const clusterId of rawClusterIds) {
        scored.push({ clusterId, score, index: featureIndex });
      }
    }
  }

  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    if (!seen.has(item.clusterId)) {
      seen.add(item.clusterId);
      unique.push(item.clusterId);
      if (unique.length >= maxClusters) {
        break;
      }
    }
  }
  return unique;
};
const metadataInteger = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : undefined;
};

export const assessSeeristDiscoveryPagination = (
  plan: SeeristDiscoveryPlan,
  pages: CollectedSeeristPage[]
): SeeristPaginationAssessment[] =>
  plan.queries.map((query) => {
    const queryPages = pages
      .filter((page) => page.queryId === query.id)
      .sort((left, right) => left.pageOffset - right.pageOffset);
    const observations: SeeristPageObservation[] = [];
    const driftReasons: string[] = [];
    const incompleteReasons: string[] = [];
    const seenItemOffsets = new Map<string, number>();

    for (const [index, page] of queryPages.entries()) {
      const expectedOffset = index * plan.pageSize;
      if (page.pageOffset !== expectedOffset) {
        incompleteReasons.push(
          `Expected offset ${expectedOffset} but collected offset ${page.pageOffset}.`
        );
      }
      const payload = isRecord(page.payload) ? page.payload : undefined;
      const features = payload && Array.isArray(payload.features) ? payload.features : [];
      const metadata = payload && isRecord(payload.metadata) ? payload.metadata : undefined;
      if (!payload || !Array.isArray(payload.features) || !metadata) {
        incompleteReasons.push(`Offset ${page.pageOffset} is not a complete page.`);
      }

      const itemIds: string[] = [];
      const timestamps: Array<{ value: string; epoch: number }> = [];
      for (const feature of features) {
        if (!isRecord(feature) || !isRecord(feature.properties)) {
          continue;
        }
        const providerItemId =
          typeof feature.properties.id === "number" &&
          Number.isFinite(feature.properties.id)
            ? String(feature.properties.id)
            : nonEmptyString(feature.properties.id);
        if (providerItemId) {
          itemIds.push(providerItemId);
          const priorOffset = seenItemOffsets.get(providerItemId);
          if (priorOffset !== undefined && priorOffset !== page.pageOffset) {
            driftReasons.push(
              `Provider item ${providerItemId} appears at offsets ${priorOffset} and ${page.pageOffset}.`
            );
          } else {
            seenItemOffsets.set(providerItemId, page.pageOffset);
          }
        }
        const timestamp = nonEmptyString(feature.properties["@timestamp"]);
        const epoch = timestamp ? Date.parse(timestamp) : Number.NaN;
        if (timestamp && !Number.isNaN(epoch)) {
          timestamps.push({ value: timestamp, epoch });
        }
      }
      timestamps.sort((left, right) => right.epoch - left.epoch);
      const next = metadata ? redactSeeristUrl(nonEmptyString(metadata.next)) : undefined;
      const prev = metadata ? redactSeeristUrl(nonEmptyString(metadata.prev)) : undefined;
      const total = metadata ? metadataInteger(metadata.total) : undefined;
      const reportedPageSize = metadata
        ? metadataInteger(metadata.pageSize)
        : undefined;
      if (reportedPageSize !== undefined && reportedPageSize !== plan.pageSize) {
        incompleteReasons.push(
          `Offset ${page.pageOffset} reports page size ${reportedPageSize}, expected ${plan.pageSize}.`
        );
      }
      if (index === 0 && prev) {
        incompleteReasons.push("The first page has a contradictory previous link.");
      }
      if (index > 0 && !prev) {
        incompleteReasons.push(`Offset ${page.pageOffset} is missing its previous link.`);
      }
      if (index > 0) {
        const prior = observations[index - 1];
        if (prior && !prior.next) {
          incompleteReasons.push(`Offset ${prior.pageOffset} is missing its next link.`);
        }
        if (prior?.total !== undefined && total !== undefined && prior.total !== total) {
          driftReasons.push(
            `Total changed from ${prior.total} to ${total} between offsets ${prior.pageOffset} and ${page.pageOffset}.`
          );
        }
        if (
          prior?.oldestObservedAt &&
          timestamps[0] &&
          Date.parse(timestamps[0].value) > Date.parse(prior.oldestObservedAt)
        ) {
          driftReasons.push(
            `A newer timestamp appears at offset ${page.pageOffset} after offset ${prior.pageOffset}.`
          );
        }
      }
      if (next && features.length === 0) {
        incompleteReasons.push(`Offset ${page.pageOffset} has a next link but no items.`);
      }

      observations.push({
        operationId: `${plan.id}-${query.id}-offset-${page.pageOffset}`,
        pageOffset: page.pageOffset,
        pageSize: plan.pageSize,
        ...(total !== undefined ? { total } : {}),
        ...(timestamps[0] ? { newestObservedAt: timestamps[0].value } : {}),
        ...(timestamps.at(-1) ? { oldestObservedAt: timestamps.at(-1)?.value } : {}),
        itemIds,
        ...(next ? { next } : {}),
        ...(prev ? { prev } : {}),
        ...(page.cacheStatus ? { cacheStatus: page.cacheStatus } : {})
      });
    }

    const last = observations.at(-1);
    if (!last) {
      incompleteReasons.push("No page was collected for the query.");
    } else if (last.next) {
      const boundaryReached =
        queryPages.length >= plan.maxPagesPerQuery || pages.length >= plan.maxApiCalls;
      incompleteReasons.push(
        boundaryReached
          ? `Collection budget ended with a next page after offset ${last.pageOffset}.`
          : `Collection stopped before the next page after offset ${last.pageOffset}.`
      );
    } else if (
      last.total !== undefined &&
      last.total > last.pageOffset + last.itemIds.length
    ) {
      incompleteReasons.push(
        `Offset ${last.pageOffset} is missing a next link for the reported total.`
      );
    }

    const reasons = [...driftReasons, ...incompleteReasons];
    return {
      operationId: `${plan.id}:${query.id}`,
      queryId: query.id,
      status:
        driftReasons.length > 0
          ? "snapshot-drift"
          : incompleteReasons.length > 0
            ? "incomplete"
            : observations.length > 1
              ? "consistent"
              : "not-applicable",
      observations,
      reasons
    };
  });

const normalizedText = (value: unknown): string =>
  typeof value === "string" ? value.toLocaleLowerCase("en") : "";

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

// Analyst reports carry language maps such as { en: "..." } instead of plain strings.
const localizedString = (value: unknown): string | undefined =>
  optionalString(value) ??
  (isRecord(value)
    ? optionalString(value.en) ?? Object.values(value).map(optionalString).find(Boolean)
    : undefined);

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const httpUrl = (value: unknown): string | undefined => {
  const str = nonEmptyString(value);
  return str && (str.startsWith("https://") || str.startsWith("http://"))
    ? str
    : undefined;
};

const extractExternalSourceEntries = (
  sourcesValue: unknown,
  primarySourceValue: unknown
): Array<{ url: string; name?: string }> => {
  const entries: Array<{ url: string; name?: string }> = [];
  const seen = new Set<string>();
  const addEntry = (url: string | undefined, name?: string): void => {
    if (!url) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ url, ...(name ? { name } : {}) });
  };

  if (Array.isArray(sourcesValue)) {
    for (const item of sourcesValue) {
      if (typeof item === "string") {
        addEntry(httpUrl(item));
      } else if (isRecord(item)) {
        addEntry(httpUrl(item.url), nonEmptyString(item.name));
      }
    }
  }
  addEntry(httpUrl(primarySourceValue));
  return entries;
};

const scoreAgainstTerms = (
  rankingTerms: readonly string[],
  title: string | undefined,
  summary: string | undefined
): { score: number; matchedTerms: string[] } => {
  const titleText = normalizedText(title);
  const summaryText = normalizedText(summary);
  const matchedTerms: string[] = [];
  let score = 0;
  for (const term of rankingTerms) {
    const normalizedTerm = term.toLocaleLowerCase("en");
    const titleMatch = titleText.includes(normalizedTerm);
    const summaryMatch = summaryText.includes(normalizedTerm);
    if (titleMatch || summaryMatch) {
      matchedTerms.push(term);
      score += (titleMatch ? 3 : 0) + (summaryMatch ? 1 : 0);
    }
  }
  return { score, matchedTerms };
};

const safeProviderId = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";

const extractScribeEvents = (payload: Record<string, unknown>): Record<string, unknown>[] => {
  const narrative = isRecord(payload.narrative) ? payload.narrative : undefined;
  if (!narrative) {
    return [];
  }
  const events: Record<string, unknown>[] = [];
  const topEvents = isRecord(narrative.top_events) && Array.isArray(narrative.top_events.events)
    ? narrative.top_events.events
    : [];
  for (const entry of topEvents) {
    if (isRecord(entry)) events.push(entry);
  }
  if (isRecord(narrative.hotspots) && isRecord(narrative.hotspots.event)) {
    events.push(narrative.hotspots.event);
  }
  if (isRecord(narrative.explanation) && isRecord(narrative.explanation.event)) {
    events.push(narrative.explanation.event);
  }
  return events;
};

export const rankSeeristDiscoveryCandidates = (
  plan: SeeristDiscoveryPlan,
  pages: CollectedSeeristPage[],
  tierPolicy: SourceTierPolicy,
  paginationAssessments: SeeristPaginationAssessment[] = []
): SeeristDiscoveryCandidate[] => {
  const candidates = new Map<string, SeeristDiscoveryCandidate>();
  const upsertCandidate = (
    id: string,
    page: CollectedSeeristPage,
    build: () => SeeristDiscoveryCandidate
  ): void => {
    const existing = candidates.get(id);
    if (existing) {
      existing.queryIds = [...new Set([...existing.queryIds, page.queryId])].sort();
      existing.rawArtifactRefs = [
        ...new Set([...existing.rawArtifactRefs, page.artifactRef])
      ].sort();
      return;
    }
    candidates.set(id, build());
  };

  for (const page of pages) {
    if (!isRecord(page.payload)) {
      continue;
    }

    // Scribe auto-summary (`/v2/auto-summary/*`): extract source-linked event leads only, never AI narrative prose.
    if (isRecord(page.payload.narrative)) {
      const scribeEvents = extractScribeEvents(page.payload);
      for (const [index, event] of scribeEvents.entries()) {
        const sourceUrl = httpUrl(event.source_url ?? event.link);
        if (!sourceUrl) {
          continue;
        }
        const rawEventId =
          optionalString(event.id) ??
          optionalString(event.cluster_id) ??
          `${page.queryId}-${index + 1}`;
        const providerItemId = `scribe-${safeProviderId(rawEventId)}`;
        const title = localizedString(event.title);
        const summary = localizedString(event.summary);
        const { score, matchedTerms } = scoreAgainstTerms(plan.rankingTerms, title, summary);
        const providerTimestamp = optionalString(
          event["@timestamp"] ?? event.published_date ?? event.publishedDate
        );
        const clusterId = optionalString(event.cluster_id);

        upsertCandidate(providerItemId, page, () => ({
          providerItemId,
          ...(page.endpoint && page.endpoint !== "/v1/wod"
            ? { endpoint: page.endpoint }
            : {}),
          sourceType: "scribe-event",
          ...(providerTimestamp ? { providerTimestamp } : {}),
          ...(title ? { title } : {}),
          ...(summary ? { summary } : {}),
          sourceUrl,
          ...(clusterId ? { clusterId } : {}),
          ...assignSourceTier(tierPolicy, "news", sourceUrl),
          score,
          shortlisted: false,
          matchedTerms,
          queryIds: [page.queryId],
          rawArtifactRefs: [page.artifactRef],
          collectionLimitations: []
        }));
      }
      continue;
    }

    if (!Array.isArray(page.payload.features)) {
      continue;
    }
    if (page.endpoint === "/v1/hotspots") {
      // Hotspots are anomaly signals whose clusterIds expand into `/v1/wod` items; do not treat unexpanded hotspot polygons as leads.
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

      const isBreakingEvent =
        properties.subtype === "breaking-event" ||
        page.endpoint === "/v1/wod/breaking-events";

      if (isBreakingEvent) {
        const title = localizedString(properties.title);
        const plainBody = normalizeSeeristHtmlText(localizedString(properties.content) ?? "");
        const summary = plainBody ? plainBody.slice(0, 600) : localizedString(properties.summary);
        const { score, matchedTerms } = scoreAgainstTerms(
          plan.rankingTerms,
          title,
          plainBody ?? summary
        );
        const providerTimestamp = optionalString(
          properties.revisedPublishedDate ??
            properties.initialPublishedDate ??
            properties["@timestamp"]
        );
        const breakingStatus = nonEmptyString(properties.status);
        const externalEntries = extractExternalSourceEntries(
          properties.sources,
          properties.source
        );
        const primaryUrl = externalEntries[0]?.url;

        upsertCandidate(providerItemId, page, () => ({
          providerItemId,
          endpoint: "/v1/wod/breaking-events",
          sourceType: "breaking-event",
          ...(breakingStatus ? { breakingStatus } : {}),
          ...(providerTimestamp ? { providerTimestamp } : {}),
          ...(title ? { title } : {}),
          ...(summary ? { summary } : {}),
          ...(primaryUrl ? { sourceUrl: primaryUrl } : {}),
          ...assignSourceTier(tierPolicy, "breaking-event", undefined),
          score,
          shortlisted: false,
          matchedTerms,
          queryIds: [page.queryId],
          rawArtifactRefs: [page.artifactRef],
          collectionLimitations: []
        }));

        for (const [leadIndex, entry] of externalEntries.entries()) {
          const leadId = `breaking-${safeProviderId(providerItemId)}-lead-${leadIndex + 1}`;
          const leadTitle =
            entry.name && title ? `${title} (${entry.name})` : title;
          upsertCandidate(leadId, page, () => ({
            providerItemId: leadId,
            endpoint: "/v1/wod/breaking-events",
            sourceType: "news",
            ...(providerTimestamp ? { providerTimestamp } : {}),
            ...(leadTitle ? { title: leadTitle } : {}),
            ...(summary ? { summary } : {}),
            sourceUrl: entry.url,
            ...assignSourceTier(tierPolicy, "news", entry.url),
            score,
            shortlisted: false,
            matchedTerms,
            queryIds: [page.queryId],
            rawArtifactRefs: [page.artifactRef],
            collectionLimitations: []
          }));
        }
        continue;
      }

      const title = localizedString(properties.title);
      const summary = localizedString(properties.summary);
      const { score, matchedTerms } = scoreAgainstTerms(plan.rankingTerms, title, summary);

      const rawSource = optionalString(properties.source);
      const sourceType = rawSource && !rawSource.startsWith("http") ? rawSource : optionalString(properties.subtype);
      const fallbackExternal = extractExternalSourceEntries(
        properties.sources ?? properties.references,
        rawSource?.startsWith("http") ? rawSource : undefined
      )[0]?.url;
      const sourceUrl = optionalString(properties.link ?? properties.source_url) ?? fallbackExternal;

      upsertCandidate(providerItemId, page, () => ({
        providerItemId,
        ...(page.endpoint && page.endpoint !== "/v1/wod"
          ? { endpoint: page.endpoint }
          : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(optionalString(properties["@timestamp"])
          ? { providerTimestamp: properties["@timestamp"] as string }
          : {}),
        ...(title ? { title } : {}),
        ...(summary ? { summary } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(optionalString(properties.cluster_id)
          ? { clusterId: properties.cluster_id as string }
          : {}),
        ...(finiteNumber(properties.cluster_size) !== undefined
          ? { clusterSize: properties.cluster_size as number }
          : {}),
        ...assignSourceTier(tierPolicy, sourceType, sourceUrl),
        score,
        shortlisted: false,
        matchedTerms,
        queryIds: [page.queryId],
        rawArtifactRefs: [page.artifactRef],
        collectionLimitations: []
      }));
    }
  }

  const assessmentByQuery = new Map(
    paginationAssessments.map((assessment) => [assessment.queryId, assessment])
  );
  for (const candidate of candidates.values()) {
    candidate.collectionLimitations = candidate.queryIds.flatMap((queryId) => {
      const assessment = assessmentByQuery.get(queryId);
      return assessment &&
        (assessment.status === "snapshot-drift" || assessment.status === "incomplete")
        ? assessment.reasons.map(
            (reason) =>
              `Query ${queryId} pagination ${assessment.status}: ${reason}`
          )
        : [];
    });
  }

  // Every lead is kept; minimumScore and maxResults only decide the shortlist flag.
  const ordered = [...candidates.values()].sort(
    (left, right) =>
      left.tier - right.tier ||
      right.score - left.score ||
      (right.providerTimestamp ?? "").localeCompare(left.providerTimestamp ?? "") ||
      left.providerItemId.localeCompare(right.providerItemId)
  );
  let shortlistCount = 0;
  for (const candidate of ordered) {
    if (candidate.score >= plan.minimumScore && shortlistCount < plan.maxResults) {
      candidate.shortlisted = true;
      shortlistCount += 1;
    }
  }
  return ordered;
};