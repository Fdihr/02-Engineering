export const createLedgerEntry = (runId, decision) => ({
    runId,
    sourceId: decision.sourceId,
    destination: decision.destination,
    ruleId: decision.ruleId,
    reason: decision.reason,
    timestamp: new Date().toISOString()
});
