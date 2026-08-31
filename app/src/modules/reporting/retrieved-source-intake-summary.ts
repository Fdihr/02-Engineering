import type { RetrievedSourceIntakeOutput } from "../intake/retrieved-source-intake.js";

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

export const renderRetrievedSourceIntakeSummary = (
  output: RetrievedSourceIntakeOutput
): string => {
  const { item, decision } = output;
  const limitations = item.limitations.length
    ? item.limitations.map((value) => `- ${escapeMarkdown(value)}`).join("\n")
    : "- None recorded";

  return [
    "# Retrieved Source Re-intake Receipt",
    "",
    "> Read-only projection of `intake-result.json`. The JSON file is canonical. Retrieved publisher content is untrusted and is not reproduced here.",
    "",
    "## Candidate",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Candidate", item.providerItemId),
    row("Role", item.role),
    row("Destination", decision.destination),
    row("Approval", decision.approvalStatus),
    row("Retrieval", item.retrievalLineage.retrievalId),
    row("Source lead", item.retrievalLineage.sourceLeadProviderItemId),
    "",
    "## Research Relevance",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Question ID", item.researchQuestion.id),
    row("Question", item.researchQuestion.question),
    row("Analyst", item.analystAssessment.analystId),
    row("Assessed at", item.analystAssessment.assessedAt),
    row("Relevance", item.analystAssessment.relevanceToQuestion),
    "",
    "## Source",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Publisher host", item.source.publisherHost),
    row("Requested URL", item.source.requestedUrl),
    row("Final URL", item.source.finalUrl),
    row("Title", item.source.title ?? "Not reported"),
    "",
    "## Lineage",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Source intake", item.retrievalLineage.sourceIntakeArtifactRef),
    row("Source intake SHA-256", item.retrievalLineage.sourceIntakeArtifactSha256),
    row("Retrieval result", item.retrievalLineage.retrievalArtifactRef),
    row("Retrieval result SHA-256", item.retrievalLineage.retrievalArtifactSha256),
    row("Request", item.retrievalLineage.requestArtifactRef),
    row("Request SHA-256", item.retrievalLineage.requestArtifactSha256),
    row("Raw response", item.retrievalLineage.rawArtifactRef),
    row("Raw response SHA-256", item.retrievalLineage.rawArtifactSha256),
    "",
    "## Limitations",
    "",
    limitations,
    ""
  ].join("\n");
};