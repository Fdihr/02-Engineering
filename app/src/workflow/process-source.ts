import type { LedgerEntry, ProviderItem, RouteDecision } from "../core/types.js";
import { err, ok, type Result } from "../core/result.js";
import { validateSource, type IntakeError } from "../modules/intake/intake.js";
import { createLedgerEntry } from "../modules/ledger/ledger.js";
import { decideRoute } from "../modules/routing/routing.js";

export type ProcessError = {
  code: "INTAKE_VALIDATION_FAILED";
  cause: IntakeError | "RESEARCH_QUESTION_RUN_MISMATCH";
};

export type ProcessOutput = {
  item: ProviderItem;
  decision: RouteDecision;
  ledgerEntry: LedgerEntry;
};

export const processSource = (
  runId: string,
  occurredAt: string,
  raw: unknown
): Result<ProcessOutput, ProcessError> => {
  const sourceResult = validateSource(raw);
  if (!sourceResult.ok) {
    return err({
      code: "INTAKE_VALIDATION_FAILED",
      cause: sourceResult.error
    });
  }
  if (sourceResult.value.researchQuestion.runId !== runId) {
    return err({
      code: "INTAKE_VALIDATION_FAILED",
      cause: "RESEARCH_QUESTION_RUN_MISMATCH"
    });
  }

  const decision = decideRoute(sourceResult.value);
  const ledgerEntry = createLedgerEntry(runId, occurredAt, sourceResult.value);

  return ok({
    item: sourceResult.value,
    decision,
    ledgerEntry
  });
};
