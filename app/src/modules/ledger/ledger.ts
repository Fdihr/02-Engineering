import type { LedgerEntry, ProviderItem } from "../../core/types.js";

export const createLedgerEntry = (
  runId: string,
  occurredAt: string,
  item: ProviderItem
): LedgerEntry => ({
  runId,
  occurredAt,
  eventType: "intake.item.routed",
  status: "completed",
  artifactRef: item.rawArtifactRef
});

export const createFailedLedgerEntry = (
  runId: string,
  occurredAt: string,
  artifactRef: string | undefined,
  error: string
): LedgerEntry => ({
  runId,
  occurredAt,
  eventType: "intake.item.failed",
  status: "failed",
  artifactRef,
  error
});
