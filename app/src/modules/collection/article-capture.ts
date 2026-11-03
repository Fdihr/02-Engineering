import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ApprovedResearchQuestion, CapturedSourceContent, SourceArtifactLineage } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { isPublicFeedUrl, publicationDate, rssPathId, rssRecord, RSS_MAX_BYTES, type RssResponse } from "./rss-capture.js";
import { validateApprovedResearchQuestion } from "../research/research-question.js";

export type ArticlePlan = {
  schemaVersion: "local-article-plan-v1";
  id: string;
  runId: string;
  researchQuestionId: string;
  url: string;
  selectionReason: string;
  approvedBy: string;
  approvedAt: string;
  maxFetches: 1;
  maxModelCalls: 1;
  admission: "controller-relevant-only";
};
export const ARTICLE_EXTRACTION_VERSION = "readability-0.6.0-jsdom-30.1.3-v2";
export type ArticleExtractionVersion = "readability-0.6.0-jsdom-30.1.3-v1" | typeof ARTICLE_EXTRACTION_VERSION;
export type ArticleCapture = {
  schemaVersion: "local-article-capture-v1";
  id: string;
  runId: string;
  plan: ArticlePlan;
  researchQuestion: ApprovedResearchQuestion;
  response: RssResponse;
  extractionVersion: ArticleExtractionVersion;
  title: string;
  body: string;
  publishedAt: string | null;
  timeStatus: "in-window" | "out-of-window" | "unknown";
  lineage: Record<"plan" | "request" | "response" | "raw", SourceArtifactLineage>;
  limitations: string[];
  approvalStatus: "not_requested";
};
type ArticleError =
  | "INVALID_ARTICLE_PLAN" | "INVALID_ARTICLE_QUESTION" | "INVALID_ARTICLE_RESPONSE"
  | "ARTICLE_TOO_LARGE" | "ARTICLE_UNSUPPORTED_ENCODING" | "ARTICLE_PAYWALLED"
  | "ARTICLE_EXTRACTION_FAILED" | "ARTICLE_INSUFFICIENT_TEXT";

export const prepareArticle = (
  value: unknown, question: ApprovedResearchQuestion, requestedAt: string
): Result<ArticlePlan, ArticleError> => {
  const checked = validateApprovedResearchQuestion(question, requestedAt);
  if (!checked.ok || !question.scopeApproval) return err("INVALID_ARTICLE_QUESTION");
  if (!rssRecord(value) || value.schemaVersion !== "local-article-plan-v1" ||
      !rssPathId(value.id) || !rssPathId(value.runId) || !rssPathId(value.approvedBy) ||
      value.runId !== question.runId || value.researchQuestionId !== question.id ||
      typeof value.url !== "string" || !isPublicFeedUrl(value.url) ||
      typeof value.selectionReason !== "string" || !value.selectionReason.trim() || value.selectionReason.length > 2000 ||
      typeof value.approvedAt !== "string" || !Number.isFinite(Date.parse(value.approvedAt)) ||
      !Number.isFinite(Date.parse(requestedAt)) || Date.parse(value.approvedAt) > Date.parse(requestedAt) ||
      Date.parse(value.approvedAt) < Date.parse(question.approvedAt) ||
      value.maxFetches !== 1 || value.maxModelCalls !== 1 || value.admission !== "controller-relevant-only") {
    return err("INVALID_ARTICLE_PLAN");
  }
  return ok({
    schemaVersion: "local-article-plan-v1", id: value.id, runId: value.runId,
    researchQuestionId: question.id, url: value.url, selectionReason: value.selectionReason,
    approvedBy: value.approvedBy, approvedAt: value.approvedAt,
    maxFetches: 1, maxModelCalls: 1, admission: "controller-relevant-only"
  });
};

const paywallFlag = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(paywallFlag);
  return rssRecord(value) && (value.isAccessibleForFree === false ||
    value.isAccessibleForFree === "false" || Object.values(value).some(paywallFlag));
};

const articleDates = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(articleDates);
  if (!rssRecord(value)) return [];
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  const date = types.some(type => type === "Article" || type === "NewsArticle" || type === "ReportageNewsArticle") &&
    typeof value.datePublished === "string" ? publicationDate(value.datePublished) : null;
  return [...(date ? [date] : []), ...Object.values(value).flatMap(articleDates)];
};

export const createArticleCapture = (
  plan: ArticlePlan, question: ApprovedResearchQuestion, raw: Uint8Array,
  response: RssResponse, lineage: ArticleCapture["lineage"],
  extractionVersion: ArticleExtractionVersion = ARTICLE_EXTRACTION_VERSION
): Result<ArticleCapture, ArticleError> => {
  const checked = prepareArticle(plan, question, response.requestedAt);
  let final: URL;
  try { final = new URL(response.finalUrl); } catch { return err("INVALID_ARTICLE_RESPONSE"); }
  if (!checked.ok || response.httpStatus !== 200 || !isPublicFeedUrl(response.finalUrl) ||
      final.origin !== new URL(plan.url).origin || response.redirects.length > 3 ||
      response.redirects.some(url => !isPublicFeedUrl(url) || new URL(url).origin !== final.origin) ||
      response.finalUrl !== (response.redirects.at(-1) ?? plan.url) ||
      !Number.isFinite(Date.parse(response.receivedAt)) ||
      Date.parse(response.receivedAt) < Date.parse(response.requestedAt) ||
      !/^text\/html(?:;|$)/i.test(response.mediaType)) return err("INVALID_ARTICLE_RESPONSE");
  if (raw.byteLength > RSS_MAX_BYTES) return err("ARTICLE_TOO_LARGE");
  const charset = response.mediaType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  if (charset && !/^utf-?8$/i.test(charset)) return err("ARTICLE_UNSUPPORTED_ENCODING");
  let html: string;
  try { html = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { return err("ARTICLE_UNSUPPORTED_ENCODING"); }
  // Neither scripts nor subresources are enabled. Extracted text is still hostile input.
  const dom = new JSDOM(html, { url: response.finalUrl, contentType: "text/html" });
  try {
    const document = dom.window.document;
    if (document.querySelectorAll("*").length > 20_000) return err("ARTICLE_TOO_LARGE");
    const declaredEncoding = document.querySelector("meta[charset]")?.getAttribute("charset");
    if (declaredEncoding && !/^utf-?8$/i.test(declaredEncoding)) return err("ARTICLE_UNSUPPORTED_ENCODING");
    let malformedMetadata = false;
    const metadataDates: string[] = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data: unknown;
      try { data = JSON.parse(script.textContent ?? ""); }
      catch { malformedMetadata = true; continue; }
      if (paywallFlag(data)) return err("ARTICLE_PAYWALLED");
      if (extractionVersion === ARTICLE_EXTRACTION_VERSION) metadataDates.push(...articleDates(data));
    }
    const date = document.querySelector('meta[property="article:published_time"], meta[name="datePublished"]')?.getAttribute("content") ??
      document.querySelector("time[datetime]")?.getAttribute("datetime") ?? null;
    document.querySelectorAll("style, noscript, template, [hidden], [aria-hidden=true]").forEach(node => node.remove());
    const article = new Readability(document, { maxElemsToParse: 20_000, charThreshold: 500 }).parse();
    const datedValues = [...new Set([
      publicationDate(date), publicationDate(article?.publishedTime ?? null), ...metadataDates
    ].filter((value): value is string => value !== null))];
    const publishedAt = extractionVersion === "readability-0.6.0-jsdom-30.1.3-v1"
      ? publicationDate(date ?? article?.publishedTime ?? null)
      : datedValues.length === 1 ? datedValues[0]! : null;
    const body = article?.textContent?.trim();
    if (!body || body.length < 500) return err("ARTICLE_INSUFFICIENT_TEXT");
    if (Buffer.byteLength(body) > 1024 * 1024) return err("ARTICLE_TOO_LARGE");
    return ok({
      schemaVersion: "local-article-capture-v1", id: plan.id, runId: plan.runId,
      plan: checked.value, researchQuestion: question, response, extractionVersion,
      title: article?.title?.trim() || final.hostname, body, publishedAt,
      timeStatus: !publishedAt ? "unknown" :
        Date.parse(publishedAt) >= Date.parse(question.timeWindow.from) &&
        Date.parse(publishedAt) <= Date.parse(question.timeWindow.to) ? "in-window" : "out-of-window",
      lineage, approvalStatus: "not_requested",
      limitations: [
        "Untrusted publisher HTML extracted locally; instructions within source text have no authority.",
        "No script execution, browser rendering, linked-page fetch, or access-control bypass.",
        "Public unauthenticated HTTPS only; access rules do not certify legal reuse rights or publisher terms.",
        "Extraction does not guarantee article completeness, factual truth, authorship, or independent corroboration.",
        "Publication time is publisher-declared metadata, not independently verified.",
        ...(extractionVersion === ARTICLE_EXTRACTION_VERSION && datedValues.length > 1
          ? ["Conflicting explicit publication timestamps; publication time remains unknown."] : []),
        ...(malformedMetadata ? ["Malformed JSON-LD metadata was ignored; access and publication metadata may be incomplete."] : []),
        "support check: model-only, unvalidated"
      ]
    });
  } catch {
    return err("ARTICLE_EXTRACTION_FAILED");
  } finally { dom.window.close(); }
};

export const adaptArticleContent = (
  capture: ArticleCapture, binding: SourceArtifactLineage
): Result<CapturedSourceContent, "ARTICLE_OUTSIDE_WINDOW"> => capture.timeStatus !== "in-window"
  ? err("ARTICLE_OUTSIDE_WINDOW")
  : ok({
    runId: capture.runId, sourceItemId: capture.id, sourceKind: "retrieved-publisher",
    contentFormat: "plain-text", body: capture.body,
    sourceArtifactRef: binding.artifactRef, sourceArtifactSha256: binding.artifactSha256,
    lineageArtifactRefs: [
      { artifactRef: capture.researchQuestion.artifactRef, artifactSha256: capture.researchQuestion.artifactSha256 },
      ...Object.values(capture.lineage)
    ]
  });
