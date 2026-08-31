import type { SourceRetrievalResult } from "../../core/types.js";

const displayValue = (value: string | number | undefined): string =>
  value === undefined ? "Not reported" : String(value);

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

const row = (label: string, value: string | number | undefined): string =>
  `| ${label} | ${escapeMarkdown(displayValue(value))} |`;

export const renderSourceRetrievalSummary = (
  result: SourceRetrievalResult
): string => {
  const limitations = result.limitations.length
    ? result.limitations.map((value) => `- ${escapeMarkdown(value)}`).join("\n")
    : "- None recorded";

  return [
    "# Source Retrieval Receipt",
    "",
    "> Read-only projection of `source-retrieval-result.json`. The JSON file is canonical. Retrieved content is untrusted and is not reproduced here.",
    "",
    "## Resolution",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Retrieval", result.id),
    row("Run", result.runId),
    row("Provider item", result.providerItemId),
    row("Outcome", result.outcome),
    row("Reason", result.reason),
    row("Approval", result.approvalStatus),
    row("Resolution depth", result.resolutionDepth),
    row("Attempted at", result.attemptedAt),
    row("Received at", result.receivedAt),
    "",
    "## Research Intent",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Question ID", result.researchQuestion.id),
    row("Question", result.researchQuestion.question),
    row("Approved by", result.researchQuestion.approvedBy),
    row("Approved at", result.researchQuestion.approvedAt),
    "",
    "## Provider and Source",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Access provider", result.accessProvider.name),
    row("Access endpoint", result.accessProvider.endpoint),
    row("Access-provider HTTP", result.accessProvider.httpStatus),
    row("Publisher host", result.source.publisherHost),
    row("Requested URL", result.source.requestedUrl),
    row("Reported source URL", result.source.reportedSourceUrl),
    row("Final URL", result.source.finalUrl),
    row("Publisher HTTP", result.source.statusCode),
    row("Redirect status", result.source.redirectStatus),
    row("Title", result.source.title),
    row("Content type", result.source.contentType),
    row("Retrieved characters", result.content?.characterCount),
    "",
    "## Lineage",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Intake artifact", result.lineage.intakeArtifactRef),
    row("Intake SHA-256", result.lineage.intakeArtifactSha256),
    row("Request artifact", result.lineage.requestArtifactRef),
    row("Request SHA-256", result.lineage.requestArtifactSha256),
    row("Raw response", result.lineage.rawArtifactRef),
    row("Raw response SHA-256", result.lineage.rawArtifactSha256),
    "",
    "## Limitations",
    "",
    limitations,
    ""
  ].join("\n");
};