import { err, ok } from "../core/result.js";
import { validateSource } from "../modules/intake/intake.js";
import { createLedgerEntry } from "../modules/ledger/ledger.js";
import { decideRoute } from "../modules/routing/routing.js";
export const processSource = (runId, occurredAt, raw) => {
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
