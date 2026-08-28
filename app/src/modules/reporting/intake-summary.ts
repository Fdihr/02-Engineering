import type { LedgerEntry, ProviderItem, RouteDecision } from "../../core/types.js";

export type IntakeSummaryInput = {
  item: ProviderItem;
  decision: RouteDecision;
  ledgerEntry: LedgerEntry;
};

const displayValue = (value: string | undefined): string => value ?? "Not provided";

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

export const renderIntakeSummary = ({
  item,
  decision,
  ledgerEntry
}: IntakeSummaryInput): string => {
  const sourceLinks =
    item.sourceLinks.length === 0
      ? "- None recorded"
      : item.sourceLinks.map((link) => `- ${escapeMarkdown(link)}`).join("\n");

  return [
    "# Intake Review",
    "",
    "> Read-only projection of `intake-result.json`. The JSON file is canonical.",
    "",
    "## Status",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Provider item", displayValue(item.providerItemId)),
    row("Role", item.role),
    row("Route", decision.destination),
    row("Approval status", decision.approvalStatus),
    row("Content completeness", item.contentCompleteness),
    "",
    "## Approved Research Question",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Question ID", item.researchQuestion.id),
    row("Question", item.researchQuestion.question),
    row("Rationale", item.researchQuestion.rationale),
    row("Geographies", item.researchQuestion.geographies.join(", ")),
    row(
      "Time window",
      `${item.researchQuestion.timeWindow.from} to ${item.researchQuestion.timeWindow.to}`
    ),
    row("Approved by", item.researchQuestion.approvedBy),
    row("Approved at", item.researchQuestion.approvedAt),
    row("Question artifact", item.researchQuestion.artifactRef),
    "",
    "## Provenance",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Provider", item.provider),
    row("Endpoint", item.endpoint),
    row("Source type", displayValue(item.sourceType)),
    row("Provider timestamp", displayValue(item.providerTimestamp)),
    row("Retrieved at", item.retrievedAt),
    row("Raw artifact", item.rawArtifactRef),
    row("Reference count", String(item.referenceCount)),
    row("Source metadata", item.hasSourceMetadata ? "Present" : "Not present"),
    "",
    "### Source Links",
    "",
    sourceLinks,
    "",
    "## Routing Decision",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Rule", decision.ruleId),
    row("Reason", decision.reason),
    "",
    "## Event",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Run", ledgerEntry.runId),
    row("Occurred at", ledgerEntry.occurredAt),
    row("Type", ledgerEntry.eventType),
    row("Status", ledgerEntry.status),
    ""
  ].join("\n");
};