import type { LedgerEntry, SourceRecord } from "../core/types.js";
import { validateSource } from "../modules/intake/intake.js";
import { decideRoute } from "../modules/routing/routing.js";
import { createLedgerEntry } from "../modules/ledger/ledger.js";
import { err, ok, type Result } from "../core/result.js";

export type ProcessError = "INTAKE_VALIDATION_FAILED";

export type ProcessOutput = {
  source: SourceRecord;
  decision: ReturnType<typeof decideRoute>;
  ledgerEntry: LedgerEntry;
};

export const processSource = (
  runId: string,
  raw: Partial<SourceRecord>
): Result<ProcessOutput, ProcessError> => {
  const sourceResult = validateSource(raw);
  if (!sourceResult.ok) {
    return err("INTAKE_VALIDATION_FAILED");
  }

  const decision = decideRoute(sourceResult.value);
  const ledgerEntry = createLedgerEntry(runId, decision);

  return ok({
    source: sourceResult.value,
    decision,
    ledgerEntry
  });
};
