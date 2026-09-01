import type {
  ApprovedMemoScopeArtifact,
  OriginatedValue
} from "../../core/types.js";

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

const originated = <T>(value: OriginatedValue<T>, render: (item: T) => string): string =>
  `${render(value.value)} (${value.origin}${
    value.assumptionReason ? `: ${value.assumptionReason}` : ""
  })`;

export const renderMemoScopeSummary = (
  scope: ApprovedMemoScopeArtifact
): string =>
  [
    "# Approved Memo Scope",
    "",
    "> Read-only projection of `approved-memo-scope.json`. The JSON file is canonical.",
    "",
    "| Field | Value |",
    "| --- | --- |",
    row("Scope ID", scope.id),
    row("Research run", scope.runId),
    row("Version", String(scope.version)),
    row("Purpose", originated(scope.purpose, String)),
    row("Threat topic", originated(scope.threatTopic, String)),
    row("Audience", originated(scope.audience, String)),
    row("Geographies", originated(scope.geographies, (value) => value.join(", "))),
    row("From", originated(scope.timeWindow, (value) => value.from)),
    row("To", originated(scope.timeWindow, (value) => value.to)),
    row(
      "Requested output",
      scope.requestedOutput
        ? originated(scope.requestedOutput, String)
        : "Not specified"
    ),
    row("Status", scope.status),
    row("Approved by", scope.approvedBy),
    row("Approved at", scope.approvedAt),
    ""
  ].join("\n");