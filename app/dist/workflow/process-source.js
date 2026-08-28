import { validateSource } from "../modules/intake/intake.js";
import { decideRoute } from "../modules/routing/routing.js";
import { createLedgerEntry } from "../modules/ledger/ledger.js";
import { err, ok } from "../core/result.js";
export const processSource = (runId, raw) => {
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
