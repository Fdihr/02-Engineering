import type { LedgerEntry, RouteDecision } from "../../core/types.js";

export const createLedgerEntry = (runId: string, decision: RouteDecision): LedgerEntry => ({
  runId,
  sourceId: decision.sourceId,
  destination: decision.destination,
  ruleId: decision.ruleId,
  reason: decision.reason,
  timestamp: new Date().toISOString()
});
