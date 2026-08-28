import { processSource } from "./workflow/process-source.js";

const runId = `run-${Date.now()}`;

const output = processSource(runId, {
  sourceId: "SRC-001",
  title: "Q3 Executive Summary - OT Threat Intel",
  body: "Draft intelligence package for analyst review.",
  confidentiality: "internal"
});

if (!output.ok) {
  console.error("Processing failed:", output.error);
  process.exit(1);
} else {
  console.log("Source route:", output.value.decision.destination);
  console.log("Rule:", output.value.decision.ruleId);
  console.log("Ledger entry:", output.value.ledgerEntry);
}
