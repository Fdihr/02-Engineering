import type {
  SeeristDiscoveryCandidate,
  SeeristDiscoveryPlan
} from "../discovery/seerist-discovery.js";

const escapeMarkdown = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("<", "\\<")
    .replaceAll(">", "\\>")
    .replaceAll(/\r?\n/g, " ");

const row = (label: string, value: string): string =>
  `| ${label} | ${escapeMarkdown(value)} |`;

const renderCandidate = (
  candidate: SeeristDiscoveryCandidate,
  index: number
): string[] => [
  `## ${index + 1}. ${escapeMarkdown(candidate.title ?? "Untitled provider record")}`,
  "",
  "| Field | Value |",
  "| --- | --- |",
  row("Provider item", candidate.providerItemId),
  row("Score", String(candidate.score)),
  row("Matched terms", candidate.matchedTerms.join(", ")),
  row("Matched queries", candidate.queryIds.join(", ")),
  row("Source type", candidate.sourceType ?? "Not provided"),
  row("Provider timestamp", candidate.providerTimestamp ?? "Not provided"),
  row("Cluster", candidate.clusterId ?? "Not provided"),
  row("Cluster size", candidate.clusterSize?.toString() ?? "Not provided"),
  row("Source URL", candidate.sourceUrl ?? "Not provided"),
  "",
  candidate.summary ? escapeMarkdown(candidate.summary) : "_No summary provided._",
  ""
];

export const renderSeeristDiscoverySummary = (
  plan: SeeristDiscoveryPlan,
  question: string,
  apiCalls: number,
  candidates: SeeristDiscoveryCandidate[]
): string =>
  [
    "# Seerist Discovery Review",
    "",
    "> Read-only projection of `discovery-results.json`. Candidate ranking is deterministic and does not approve evidence.",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Plan", plan.id),
    row("Research question", question),
    row("Queries", plan.queries.map((query) => query.id).join(", ")),
    row("API calls", String(apiCalls)),
    row("Candidate count", String(candidates.length)),
    row("Minimum score", String(plan.minimumScore)),
    "",
    ...candidates.flatMap(renderCandidate)
  ].join("\n");