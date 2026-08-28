import type { ApprovedResearchQuestionArtifact } from "../../core/types.js";

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

export const renderResearchQuestionSummary = (
  question: ApprovedResearchQuestionArtifact
): string =>
  [
    "# Approved Research Question",
    "",
    "> Read-only projection of `approved-research-question.json`. The JSON file is canonical.",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Question ID", question.id),
    row("Research run", question.runId),
    row("Scope version", String(question.scopeVersion)),
    row("Question", question.question),
    row("Rationale", question.rationale),
    row("Geographies", question.geographies.join(", ")),
    row("From", question.timeWindow.from),
    row("To", question.timeWindow.to),
    row("Status", question.status),
    row("Approved by", question.approvedBy),
    row("Approved at", question.approvedAt),
    ""
  ].join("\n");