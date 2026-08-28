import type { EvidenceReviewOutput } from "../../core/types.js";

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

export const renderEvidenceDecisionSummary = (output: EvidenceReviewOutput): string => {
  const snapshotRows =
    output.outcome === "approved"
      ? [
          "",
          "## Approved Snapshot",
          "",
          "| Field | Value |",
          "| --- | --- |",
          row("Snapshot", output.snapshot.snapshotId),
          row("Raw artifact", output.snapshot.rawArtifactRef),
          row("Raw SHA-256", output.snapshot.rawArtifactSha256)
        ]
      : [];

  return [
    "# Evidence Admission Decision",
    "",
    "> Read-only projection of `evidence-decision.json`. JSON artifacts are canonical.",
    "",
    "## Decision",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Decision", output.decision.decision),
    row("Decision ID", output.decision.id),
    row("Provider item", output.decision.providerItemId),
    row("Reviewer", output.decision.reviewerId),
    row("Decided at", output.decision.decidedAt),
    row("Reason", output.decision.reason),
    row("Source run", output.decision.sourceRunId),
    row("Intake artifact", output.decision.intakeArtifactRef),
    row(
      "Research question",
      output.outcome === "approved"
        ? output.snapshot.item.researchQuestion.id
        : "Bound in intake artifact"
    ),
    ...snapshotRows,
    "",
    "## Event",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Type", output.event.eventType),
    row("Actor type", output.event.actorType),
    row("Actor", output.event.actorId),
    row("Status", output.event.status),
    ""
  ].join("\n");
};