export const createLedgerEntry = (runId, occurredAt, item) => ({
    runId,
    occurredAt,
    eventType: "intake.item.routed",
    status: "completed",
    artifactRef: item.rawArtifactRef
});
export const createFailedLedgerEntry = (runId, occurredAt, artifactRef, error) => ({
    runId,
    occurredAt,
    eventType: "intake.item.failed",
    status: "failed",
    artifactRef,
    error
});
