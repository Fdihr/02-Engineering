import type { EvidenceReviewOutput, LocalArticleEvidenceCandidate } from "../core/types.js";
import { err, ok, type Result } from "../core/result.js";
import { prepareArticle, type ArticlePlan } from "../modules/collection/article-capture.js";
import { rssPathId } from "../modules/collection/rss-capture.js";

// Only called after reconstructing the capture, question, exact anchors and model assessment.
export const admitVerifiedArticle = (input: {
  plan: ArticlePlan; item: LocalArticleEvidenceCandidate; intakeArtifactRef: string;
  decisionId: string; decidedAt: string;
  reassessment?: { id: string; approvedAt: string };
}): Result<EvidenceReviewOutput, "ARTICLE_ADMISSION_POLICY_MISMATCH" | "ARTICLE_ADMISSION_NOT_RELEVANT"> => {
  const { plan, item, decisionId, decidedAt, intakeArtifactRef } = input;
  if (!prepareArticle(plan, item.researchQuestion, item.retrievedAt).ok ||
      item.source.requestedUrl !== plan.url || item.providerItemId !== plan.id ||
      !rssPathId(decisionId) || !intakeArtifactRef ||
      !/^[a-f0-9]{64}$/.test(item.rawArtifactSha256) ||
      !Number.isFinite(Date.parse(decidedAt)) ||
      (input.reassessment
        ? decisionId !== input.reassessment.id || !item.articleLineage.reassessment ||
          !Number.isFinite(Date.parse(input.reassessment.approvedAt)) ||
          Date.parse(input.reassessment.approvedAt) > Date.parse(item.questionRelevance.assessment.modelInvocation.startedAt)
        : decisionId !== plan.id || !!item.articleLineage.reassessment) ||
      Date.parse(decidedAt) < Date.parse(item.questionRelevance.assessment.assessedAt)) {
    return err("ARTICLE_ADMISSION_POLICY_MISMATCH");
  }
  if (item.questionRelevance.assessment.verdict !== "relevant" ||
      item.questionRelevance.decision.destination !== "evidence_candidate_proposal") return err("ARTICLE_ADMISSION_NOT_RELEVANT");
  const actorId = input.reassessment
    ? `controller:local-article-reassessment-v1:${input.reassessment.id}`
    : `controller:local-article-plan-v1:${plan.id}`;
  return ok({
    outcome: "approved",
    decision: {
      id: decisionId, sourceRunId: plan.runId, providerItemId: item.providerItemId,
      reviewerId: actorId, decidedAt, decision: "approved",
      reason: `Admitted under explicitly approved ${input.reassessment ? `reassessment ${decisionId}` : `one-source local article plan ${plan.id}`}; assurance remains separate.`,
      intakeArtifactRef
    },
    snapshot: {
      snapshotId: `snapshot-${decisionId}`, sourceDecisionId: decisionId,
      sourceRunId: plan.runId, providerItemId: item.providerItemId, admittedBy: actorId,
      admittedAt: decidedAt, intakeArtifactRef, rawArtifactRef: item.rawArtifactRef,
      rawArtifactSha256: item.rawArtifactSha256, item
    },
    event: {
      decisionId, sourceRunId: plan.runId, occurredAt: decidedAt, actorType: "controller",
      actorId, stage: "evidence_admission", eventType: "evidence.admission.approved",
      status: "completed", intakeArtifactRef, snapshotId: `snapshot-${decisionId}`
    }
  });
};
