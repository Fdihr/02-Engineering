import type { EvidenceReviewOutput, RssEvidenceCandidate } from "../core/types.js";
import { err, ok, type Result } from "../core/result.js";
import { rssPathId, rssRecord } from "../modules/collection/rss-capture.js";

export type RssBatchPolicy = {
  schemaVersion: "rss-batch-policy-v1";
  id: string;
  runId: string;
  researchQuestionId: string;
  feedId: string;
  maxItems: number;
  maxModelCalls: number;
  admission: "controller-relevant-only";
  approvedBy: string;
  approvedAt: string;
  permissionReference: string;
};

export const readRssBatchPolicy = (value: unknown): Result<RssBatchPolicy, "INVALID_RSS_BATCH_POLICY"> => {
  if (!rssRecord(value) || value.schemaVersion !== "rss-batch-policy-v1" ||
      !rssPathId(value.id) || !rssPathId(value.runId) || !rssPathId(value.researchQuestionId) ||
      !rssPathId(value.feedId) || !rssPathId(value.approvedBy) ||
      typeof value.approvedAt !== "string" || !Number.isFinite(Date.parse(value.approvedAt)) ||
      typeof value.permissionReference !== "string" || !value.permissionReference.trim() ||
      value.permissionReference.length > 500 || value.admission !== "controller-relevant-only" ||
      typeof value.maxItems !== "number" || !Number.isInteger(value.maxItems) ||
      value.maxItems < 1 || value.maxItems > 5 || value.maxModelCalls !== value.maxItems) {
    return err("INVALID_RSS_BATCH_POLICY");
  }
  return ok({
    schemaVersion: "rss-batch-policy-v1", id: value.id, runId: value.runId,
    researchQuestionId: value.researchQuestionId, feedId: value.feedId,
    maxItems: value.maxItems, maxModelCalls: value.maxItems,
    admission: value.admission, approvedBy: value.approvedBy,
    approvedAt: value.approvedAt, permissionReference: value.permissionReference
  });
};

// The command must reopen capture, policy, canonical document and model artifacts before calling.
export const admitVerifiedRssEvidence = (input: {
  policy: RssBatchPolicy;
  item: RssEvidenceCandidate;
  intakeArtifactRef: string;
  decisionId: string;
  decidedAt: string;
  rawArtifactSha256: string;
}): Result<EvidenceReviewOutput, "RSS_ADMISSION_NOT_RELEVANT" | "RSS_ADMISSION_POLICY_MISMATCH"> => {
  const { item, policy, decisionId, decidedAt, intakeArtifactRef } = input;
  const checked = readRssBatchPolicy(policy);
  if (!checked.ok || policy.runId !== item.researchQuestion.runId ||
      policy.researchQuestionId !== item.researchQuestion.id ||
      Date.parse(policy.approvedAt) > Date.parse(item.retrievedAt) ||
      !Number.isFinite(Date.parse(decidedAt)) || Date.parse(decidedAt) < Date.parse(item.retrievedAt) ||
      !rssPathId(decisionId) || !/^[a-f0-9]{64}$/.test(input.rawArtifactSha256)) {
    return err("RSS_ADMISSION_POLICY_MISMATCH");
  }
  if (item.questionRelevance.assessment.verdict !== "relevant") return err("RSS_ADMISSION_NOT_RELEVANT");
  const actorId = `controller:rss-batch-policy-v1:${policy.id}`;
  const reason = `Admitted captured feed text under explicitly approved RSS batch ${policy.id}; not a complete publisher article.`;
  return ok({
    outcome: "approved",
    decision: {
      id: decisionId, sourceRunId: policy.runId, providerItemId: item.providerItemId,
      reviewerId: actorId, decidedAt, decision: "approved", reason, intakeArtifactRef
    },
    snapshot: {
      snapshotId: `snapshot-${decisionId}`, sourceDecisionId: decisionId,
      sourceRunId: policy.runId, providerItemId: item.providerItemId,
      admittedBy: actorId, admittedAt: decidedAt, intakeArtifactRef,
      rawArtifactRef: item.rawArtifactRef, rawArtifactSha256: input.rawArtifactSha256, item
    },
    event: {
      decisionId, sourceRunId: policy.runId, occurredAt: decidedAt,
      actorType: "controller", actorId, stage: "evidence_admission",
      eventType: "evidence.admission.approved", status: "completed",
      intakeArtifactRef, snapshotId: `snapshot-${decisionId}`
    }
  });
};
