export type SourceRecord = {
  sourceId: string;
  title: string;
  body: string;
  confidentiality: "public" | "internal" | "restricted";
};

export type RouteDecision = {
  sourceId: string;
  destination: "analysis" | "approved" | "archive";
  ruleId: string;
  reason: string;
};

export type LedgerEntry = {
  runId: string;
  sourceId: string;
  destination: RouteDecision["destination"];
  ruleId: string;
  reason: string;
  timestamp: string;
};
