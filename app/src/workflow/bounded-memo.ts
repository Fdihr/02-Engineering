import { err, ok, type Result } from "../core/result.js";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { hasOnlyKeys, isRecord, pathSafeId, readArtifactBinding, validTime } from "../modules/assurance/validators.js";

export const MEMO_STAGES = ["key-judgements", "writer"] as const;
export type MemoStage = typeof MEMO_STAGES[number];
export type MemoAuthorization = {
  schemaVersion: "bounded-memo-authorization-v1";
  id: string;
  runId: string;
  approvedBy: string;
  approvedAt: string;
  decision: "bounded-selection-writing-authorized" | "bounded-length-repair-authorized";
  lengthRepair?: {
    authorization: ArtifactBinding;
    request: ArtifactBinding;
    response: ArtifactBinding;
    failure: ArtifactBinding;
  };
  build: ArtifactBinding;
  challenge: ArtifactBinding;
  adjudication: ArtifactBinding;
  question: ArtifactBinding;
  standard: ArtifactBinding;
  lineage: ArtifactBinding[];
  stages: Record<MemoStage, {
    provider: "github-copilot-sdk";
    model: string;
    maxCalls: 0 | 1;
    request: ArtifactBinding | null;
    record: ArtifactBinding | null;
  }>;
  maxCalls: number;
};

export const validateMemoAuthorization = (value: unknown): Result<MemoAuthorization, "INVALID_MEMO_AUTHORIZATION"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "id", "runId", "approvedBy", "approvedAt",
    "decision", ...(value.lengthRepair !== undefined ? ["lengthRepair"] : []),
    "build", "challenge", "adjudication", "question", "standard", "lineage", "stages", "maxCalls"]) ||
      value.schemaVersion !== "bounded-memo-authorization-v1" || !pathSafeId(value.id) ||
      !pathSafeId(value.runId) || !pathSafeId(value.approvedBy) || !validTime(value.approvedAt) ||
      !["bounded-selection-writing-authorized", "bounded-length-repair-authorized"].includes(String(value.decision)) ||
      !["build", "challenge", "adjudication", "question", "standard"].every(key => readArtifactBinding(value[key])) ||
      !Array.isArray(value.lineage) || !value.lineage.length || !value.lineage.every(readArtifactBinding) ||
      !isRecord(value.stages) || !hasOnlyKeys(value.stages, [...MEMO_STAGES])) return err("INVALID_MEMO_AUTHORIZATION");
  let calls = 0;
  for (const stage of MEMO_STAGES) {
    const entry = value.stages[stage];
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["provider", "model", "maxCalls", "request", "record"]) ||
        entry.provider !== "github-copilot-sdk" || typeof entry.model !== "string" ||
        !entry.model.trim() || entry.model === "auto" ||
        !(entry.request === null || readArtifactBinding(entry.request)) ||
        !(entry.record === null || readArtifactBinding(entry.record)) ||
        (entry.record !== null && entry.request === null) ||
        entry.maxCalls !== (entry.record === null ? 1 : 0)) return err("INVALID_MEMO_AUTHORIZATION");
    calls += Number(entry.record === null);
  }
  const stages = value.stages as MemoAuthorization["stages"];
  if (value.decision === "bounded-length-repair-authorized") {
    if (!isRecord(value.lengthRepair) || !hasOnlyKeys(value.lengthRepair, ["authorization", "request", "response", "failure"]) ||
        ![value.lengthRepair.authorization, value.lengthRepair.request, value.lengthRepair.response, value.lengthRepair.failure]
          .every(readArtifactBinding) ||
        stages["key-judgements"].record === null || stages.writer.record !== null ||
        stages.writer.request === null || value.maxCalls !== 1) return err("INVALID_MEMO_AUTHORIZATION");
  } else if (value.lengthRepair !== undefined) return err("INVALID_MEMO_AUTHORIZATION");
  if (value.maxCalls !== calls || (stages.writer.record !== null &&
      stages["key-judgements"].record === null)) return err("INVALID_MEMO_AUTHORIZATION");
  return ok(value as MemoAuthorization);
};

export type MemoProgress = {
  request?: ArtifactBinding;
  record?: ArtifactBinding;
  phase: "unused" | "prepared" | "reserved" | "response-saved" | "committed";
  remainingCalls: number;
  ownerAlive: boolean;
};
export const projectBoundedMemo = (input: {
  stages: Record<MemoStage, MemoProgress>;
  workerActive: boolean;
  error?: string;
}) => {
  const stage: MemoStage = input.stages["key-judgements"].record ? "writer" : "key-judgements";
  const current = input.stages[stage];
  const status = input.error ? "blocked" : input.stages.writer.record ? "memo-review" :
    current.phase === "reserved" ? (current.ownerAlive ? "running" : "indeterminate") :
      current.phase === "response-saved" ? "response-saved" : current.remainingCalls > 0 ? current.phase : "blocked";
  return { status, stage, remainingCalls: MEMO_STAGES.reduce((sum, key) => sum + input.stages[key].remainingCalls, 0),
    error: input.error || (status === "indeterminate"
      ? "An invocation was reserved without a saved response. Inspect it; it will not be replayed."
      : status === "memo-review" ? "" : status === "blocked" ? "Stage allowance exhausted." : ""),
    action: status === "unused" ? "prepare" : status === "prepared" ? "invoke" :
      status === "response-saved" ? "record" : "stop" };
};
