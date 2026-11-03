import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Parser } from "htmlparser2";
import type { ApprovedResearchQuestion, SourceArtifactLineage } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { validateApprovedResearchQuestion } from "../research/research-question.js";

export const RSS_MAX_BYTES = 8 * 1024 * 1024;
export const RSS_TIMEOUT_MS = 20_000;
export const RSS_MAX_ITEMS = 500;
export const RSS_TEXT_VERSION = "rss-html-text-v1" as const;
export const OBSERVED_RSS_FEEDS: Readonly<Record<string, string>> = {
  "industrial-cyber": "https://industrialcyber.co/feed/",
  "cisa-advisories": "https://www.cisa.gov/cybersecurity-advisories/all.xml"
};
const CONTENT_NAMESPACE = "http://purl.org/rss/1.0/modules/content/";

export type RssPlan = {
  schemaVersion: "rss-collection-plan-v1";
  id: string;
  runId: string;
  researchQuestionId: string;
  feedId: string;
  selectionReason: string;
  permission: { reference: string; confirmedBy: string; confirmedAt: string };
};
export type PreparedRssCollection = {
  plan: RssPlan;
  feed: { id: string; url: string; name: string };
  researchQuestion: ApprovedResearchQuestion;
};
export type RssItem = {
  id: string;
  itemIdentity: string | null;
  articleUrl: string | null;
  title: string;
  publisherDate: string | null;
  publishedAt: string | null;
  timeStatus: "in-window" | "out-of-window" | "unknown";
  description: string;
  contentHtml: string | null;
  body: string | null;
  contentStatus: "captured-feed-text" | "lead-only";
  duplicateCount: number;
};
export type RssResponse = {
  requestedAt: string;
  receivedAt: string;
  finalUrl: string;
  redirects: string[];
  httpStatus: number;
  mediaType: string;
  etag: string | null;
  lastModified: string | null;
};
export type RssCapture = {
  schemaVersion: "rss-capture-v1";
  id: string;
  runId: string;
  feed: PreparedRssCollection["feed"];
  researchQuestion: ApprovedResearchQuestion;
  response: RssResponse;
  textExtractionVersion: typeof RSS_TEXT_VERSION;
  lineage: {
    plan: SourceArtifactLineage;
    catalogue: SourceArtifactLineage;
    request: SourceArtifactLineage;
    response: SourceArtifactLineage;
    raw: SourceArtifactLineage;
  };
  items: RssItem[];
  limitations: string[];
  approvalStatus: "not_requested";
};
export type RssError =
  | "INVALID_RSS_PLAN" | "INVALID_RSS_QUESTION" | "UNSUPPORTED_RSS_FEED"
  | "INVALID_RSS_CATALOGUE" | "RSS_PERMISSION_REQUIRED" | "RSS_TOO_LARGE"
  | "RSS_UNSAFE_XML" | "RSS_INVALID_XML" | "RSS_UNSUPPORTED_FORMAT"
  | "RSS_TOO_MANY_ITEMS" | "RSS_INVALID_ITEM" | "RSS_INVALID_RESPONSE";

export const rssSha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
export const rssRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
export const rssPathId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

export const isPublicFeedUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.hash && !url.port && !isIP(host.replace(/^\[|\]$/g, "")) &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) &&
      !/\.(?:localhost|local|internal|test|invalid|example|home|lan)$/.test(host);
  } catch {
    return false;
  }
};

export const prepareRssCollection = (
  planValue: unknown, catalogue: unknown, questionValue: unknown, requestedAt: string
): Result<PreparedRssCollection, RssError> => {
  const question = validateApprovedResearchQuestion(questionValue, requestedAt);
  if (!question.ok || !question.value.scopeApproval) return err("INVALID_RSS_QUESTION");
  if (!rssRecord(planValue) || planValue.schemaVersion !== "rss-collection-plan-v1" ||
      !rssPathId(planValue.id) || !rssPathId(planValue.runId) ||
      planValue.runId !== question.value.runId ||
      planValue.researchQuestionId !== question.value.id ||
      !text(planValue.feedId) || !text(planValue.selectionReason) ||
      !Number.isFinite(Date.parse(requestedAt))) return err("INVALID_RSS_PLAN");
  const permission = planValue.permission;
  if (!rssRecord(permission) || !text(permission.reference) || !text(permission.confirmedBy) ||
      !text(permission.confirmedAt) || !Number.isFinite(Date.parse(text(permission.confirmedAt))) ||
      Date.parse(text(permission.confirmedAt)) > Date.parse(requestedAt)) {
    return err("RSS_PERMISSION_REQUIRED");
  }
  if (!rssRecord(catalogue) || catalogue.catalogueVersion !== 2 ||
      !Array.isArray(catalogue.feeds)) return err("INVALID_RSS_CATALOGUE");
  const feeds = catalogue.feeds.filter((f: unknown) =>
    rssRecord(f) && f.id === planValue.feedId);
  if (feeds.length !== 1 || !rssRecord(feeds[0])) return err("INVALID_RSS_CATALOGUE");
  const feed = feeds[0];
  const id = text(feed.id);
  const url = text(feed.url);
  if (!Object.hasOwn(OBSERVED_RSS_FEEDS, id) || OBSERVED_RSS_FEEDS[id] !== url ||
      feed.format !== "rss" || !text(feed.name) || !isPublicFeedUrl(url)) {
    return err("UNSUPPORTED_RSS_FEED");
  }
  return ok({
    plan: {
      schemaVersion: "rss-collection-plan-v1", id: planValue.id,
      runId: planValue.runId, researchQuestionId: question.value.id,
      feedId: id, selectionReason: text(planValue.selectionReason),
      permission: {
        reference: text(permission.reference), confirmedBy: text(permission.confirmedBy),
        confirmedAt: text(permission.confirmedAt)
      }
    },
    feed: { id, url, name: text(feed.name) },
    researchQuestion: question.value
  });
};

const blockTags = new Set(["p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "section", "article", "pre"]);
const hiddenTags = new Set(["script", "style", "noscript", "template"]);
export const extractRssHtmlText = (html: string): string => {
  const parts: string[] = [];
  let hidden = 0;
  const parser = new Parser({
    onopentag(name) {
      if (hiddenTags.has(name)) hidden++;
      if (!hidden && name !== "br" && blockTags.has(name)) parts.push("\n");
    },
    ontext(value) { if (!hidden) parts.push(value); },
    onclosetag(name) {
      if (hiddenTags.has(name)) hidden = Math.max(0, hidden - 1);
      if (!hidden && blockTags.has(name)) parts.push("\n");
    }
  }, { decodeEntities: true });
  parser.end(html);
  return parts.join("").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n").trim();
};

const scalar = (value: unknown): string | undefined =>
  typeof value === "string" ? value : rssRecord(value) && typeof value["#text"] === "string" ? value["#text"] : undefined;
const single = (value: unknown): unknown => Array.isArray(value) ? undefined : value;
const articleUrl = (value: unknown): string | null => {
  const original = scalar(single(value))?.trim();
  if (!original) return null;
  try {
    const url = new URL(original);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username && !url.password && !url.hash ? original : null;
  } catch {
    return null;
  }
};
const publicationDate = (raw: string | null): string | null => {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  const rfc = raw.match(/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}|\d{4}) (\d{2}):(\d{2})(?::(\d{2}))? (?:GMT|UTC|[+-]\d{4})$/);
  if (!iso && !rfc) return null;
  const yearText = iso?.[1] ?? rfc?.[3] ?? "";
  const rawYear = Number(yearText);
  // RFC 2822 obsolete two-digit years, as observed in the CISA feed.
  const year = yearText.length === 2 ? rawYear + (rawYear < 50 ? 2000 : 1900) : rawYear;
  const month = iso ? Number(iso[2]) : "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ").indexOf(rfc?.[2] ?? "") + 1;
  const day = Number(iso?.[3] ?? rfc?.[1]);
  if (Number(iso?.[4] ?? rfc?.[4]) > 23 || Number(iso?.[5] ?? rfc?.[5]) > 59 ||
      Number(iso?.[6] ?? rfc?.[6] ?? 0) > 59) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day) return null;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
};

export const parseRssItems = (
  raw: Uint8Array, feedUrl: string, question: ApprovedResearchQuestion
): Result<RssItem[], RssError> => {
  if (raw.byteLength > RSS_MAX_BYTES) return err("RSS_TOO_LARGE");
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { return err("RSS_INVALID_XML"); }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) return err("RSS_UNSAFE_XML");
  const encoding = xml.match(/<\?xml[^?]*encoding\s*=\s*["']([^"']+)["']/i)?.[1];
  if (encoding && !/^utf-8$/i.test(encoding)) return err("RSS_UNSUPPORTED_FORMAT");
  if (XMLValidator.validate(xml) !== true) return err("RSS_INVALID_XML");
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
      trimValues: false, processEntities: true, ignoreDeclaration: true,
      isArray: (name: string) => name === "item"
    }).parse(xml);
  } catch { return err("RSS_INVALID_XML"); }
  if (!rssRecord(parsed) || !rssRecord(parsed.rss) ||
      parsed.rss["@_version"] !== "2.0" || !rssRecord(parsed.rss.channel)) {
    return err("RSS_UNSUPPORTED_FORMAT");
  }
  const entries = parsed.rss.channel.item ?? [];
  if (!Array.isArray(entries)) return err("RSS_INVALID_XML");
  if (entries.length > RSS_MAX_ITEMS) return err("RSS_TOO_MANY_ITEMS");
  const items = new Map<string, RssItem>();
  const windowEnd = /^\d{4}-\d{2}-\d{2}$/.test(question.timeWindow.to)
    ? question.timeWindow.to + "T23:59:59.999Z" : question.timeWindow.to;
  for (const entry of entries) {
    if (!rssRecord(entry)) return err("RSS_INVALID_ITEM");
    const link = articleUrl(entry.link);
    const guid = scalar(single(entry.guid))?.trim() || null;
    const title = scalar(single(entry.title))?.trim() || "";
    if (!title && !link && !guid) return err("RSS_INVALID_ITEM");
    const publisherDate = scalar(single(entry.pubDate))?.trim() || null;
    const publishedAt = publicationDate(publisherDate);
    const namespaces = { ...parsed.rss, ...parsed.rss.channel, ...entry };
    const contentKeys = Object.keys(entry).filter(key => {
      const [prefix, local, extra] = key.split(":");
      const element = entry[key];
      const namespace = rssRecord(element) && element["@_xmlns:" + prefix] !== undefined
        ? element["@_xmlns:" + prefix] : namespaces["@_xmlns:" + prefix];
      return local === "encoded" && !extra && namespace === CONTENT_NAMESPACE;
    });
    if (contentKeys.length > 1) return err("RSS_INVALID_ITEM");
    const contentHtml = contentKeys[0] ? scalar(single(entry[contentKeys[0]])) ?? null : null;
    const body = contentHtml ? extractRssHtmlText(contentHtml) || null : null;
    const fields = {
      itemIdentity: guid, articleUrl: link, title, publisherDate, publishedAt,
      timeStatus: !publishedAt ? "unknown" as const :
        Date.parse(publishedAt) >= Date.parse(question.timeWindow.from) &&
        Date.parse(publishedAt) <= Date.parse(windowEnd) ? "in-window" as const : "out-of-window" as const,
      description: scalar(single(entry.description)) || "",
      contentHtml, body,
      contentStatus: body ? "captured-feed-text" as const : "lead-only" as const
    };
    const id = "rss-" + rssSha256(feedUrl + "\n" + JSON.stringify(fields));
    const existing = items.get(id);
    if (existing) existing.duplicateCount++;
    else items.set(id, { id, ...fields, duplicateCount: 0 });
  }
  return ok([...items.values()]);
};

export const createRssCapture = (
  prepared: PreparedRssCollection, raw: Uint8Array,
  response: RssResponse, lineage: RssCapture["lineage"]
): Result<RssCapture, RssError> => {
  const requested = Date.parse(response.requestedAt);
  const received = Date.parse(response.receivedAt);
  const chain = [prepared.feed.url, ...response.redirects, response.finalUrl];
  const charset = response.mediaType.match(/charset\s*=\s*["']?([^"';\s]+)/i)?.[1];
  if (response.httpStatus !== 200 || !Number.isFinite(requested) ||
      !Number.isFinite(received) || received < requested || response.redirects.length > 3 ||
      response.finalUrl !== (response.redirects.at(-1) ?? prepared.feed.url) ||
      chain.some(url => !isPublicFeedUrl(url) || new URL(url).origin !== new URL(prepared.feed.url).origin) ||
      !/^(?:application\/(?:rss\+xml|xml)|text\/xml)(?:;|$)/i.test(response.mediaType) ||
      (charset !== undefined && charset.toLowerCase() !== "utf-8") ||
      Object.values(lineage).some(binding => !binding.artifactRef || !/^[a-f0-9]{64}$/.test(binding.artifactSha256)) ||
      lineage.raw.artifactSha256 !== rssSha256(raw)) return err("RSS_INVALID_RESPONSE");
  const items = parseRssItems(raw, prepared.feed.url, prepared.researchQuestion);
  if (!items.ok) return items;
  return ok({
    schemaVersion: "rss-capture-v1", id: prepared.plan.id, runId: prepared.plan.runId,
    feed: prepared.feed, researchQuestion: prepared.researchQuestion, response,
    textExtractionVersion: RSS_TEXT_VERSION, lineage, items: items.value,
    approvalStatus: "not_requested",
    limitations: [
      "RSS is a current feed snapshot, not an archive or complete research-window coverage.",
      "Feed content is untrusted; content:encoded does not certify full publisher-page capture.",
      "Descriptions, missing dates and out-of-window items remain discovery leads.",
      "Feed membership and exact URL matches establish neither relevance nor evidence admission."
    ]
  });
};

export const matchRssArticle = (items: RssItem[], sourceLinks: string[]) => {
  const matches = items.filter(item => item.articleUrl && sourceLinks.includes(item.articleUrl));
  return {
    outcome: matches.length === 1 ? "matched" as const : "unresolved" as const,
    reason: matches.length === 1 ? "exact_article_url" : matches.length ? "ambiguous_exact_url" : "no_exact_url",
    itemIds: matches.map(item => item.id),
    capturedContentAvailable: matches.length === 1 && matches[0]?.contentStatus === "captured-feed-text",
    approvalStatus: "not_requested" as const
  };
};
