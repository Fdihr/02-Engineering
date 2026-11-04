import { err, ok, type Result } from "../core/result.js";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { hasOnlyKeys, isRecord, pathSafeId, readArtifactBinding, validTime } from "../modules/assurance/validators.js";
import type { BoundMemoDecision, MemoReviewTarget } from "../modules/memo/publication.js";
import { validateMemoReviewTarget } from "../modules/memo/publication.js";

export type MemoRevisionAuthorization = {
  schemaVersion: "bounded-memo-revision-v1";
  id: string;
  runId: string;
  parentMemoId: string;
  target: MemoReviewTarget;
  decision: ArtifactBinding;
  request: ArtifactBinding;
  approvedBy: string;
  approvedAt: string;
  provider: "github-copilot-sdk";
  model: string;
  maxCalls: 1;
};

export const validateMemoRevisionAuthorization = (value: unknown):
  Result<MemoRevisionAuthorization, "INVALID_REVISION_AUTHORIZATION"> => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "id", "runId", "parentMemoId",
    "target", "decision", "request", "approvedBy", "approvedAt", "provider", "model", "maxCalls"]) ||
      value.schemaVersion !== "bounded-memo-revision-v1" || !pathSafeId(value.id) ||
      !pathSafeId(value.runId) || !pathSafeId(value.parentMemoId) || !pathSafeId(value.approvedBy) ||
      !validTime(value.approvedAt) || !validateMemoReviewTarget(value.target) ||
      value.target.runId !== value.runId || value.target.memoId !== value.parentMemoId ||
      !readArtifactBinding(value.decision) || !readArtifactBinding(value.request) ||
      value.provider !== "github-copilot-sdk" || typeof value.model !== "string" ||
      !value.model.trim() || value.model === "auto" || value.maxCalls !== 1) return err("INVALID_REVISION_AUTHORIZATION");
  return ok(value as MemoRevisionAuthorization);
};

export const memoRevisionRoute = (decision: BoundMemoDecision | null) => {
  if (!decision || decision.decision !== "revision-requested") return {
    eligible: false, route: "review", reason: "Only a recorded revision request can authorize revision."
  };
  if (decision.sampledVerdicts.some(row => row.verdict !== "supported") ||
      decision.issueType === "source-analysis" || decision.issueType === "evidence-gap") return {
    eligible: false, route: "evidence", reason: "Resolve evidence or source concerns before creating a new synthesis and draft."
  };
  if (decision.issueType === "external-judgment" || decision.issueType === "organizational-relevance") return {
    eligible: false, route: "analysis/findings", reason: "Revisit the relevant judgement or approved scope before new synthesis and writing."
  };
  if (decision.issueType === "standard-policy") return {
    eligible: false, route: "audit", reason: "Resolve the governing standard or policy through governance; a writer cannot override it."
  };
  return { eligible: decision.issueType === "editorial", route: "review",
    reason: "Authorize one editorial writer call with unchanged evidence, selected key judgements and publication blockers." };
};
