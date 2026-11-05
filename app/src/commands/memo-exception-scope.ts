import { basename, dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { isRecord, readArtifactBinding, validTime } from "../modules/assurance/validators.js";
import { rssSha256 } from "../modules/collection/rss-capture.js";
import type { ExceptionItem } from "../modules/exceptions/exception-item.js";
import { validateSourceDocument } from "../modules/source/source-document.js";
import { loadArticleAdmissionInputs } from "./admit-article.js";
import { loadArticleReassessment } from "./article-reassessment.js";
import { requireChecksum } from "./assurance-io.js";
import { loadRssAssessment } from "./rss-batch.js";
import { loadRssRunArtifact } from "./rss-io.js";

export const memoRelevanceExceptionScope = async (
  root: string, exception: ExceptionItem, sourceDocuments: ArtifactBinding[],
  snapshots: ArtifactBinding[], participants: Set<string>
): Promise<"unrelated" | "superseded" | null> => {
  if (exception.kind !== "uncertain-relevance" || sourceDocuments.length === 0) return null;
  const run = resolve(root, exception.runId);
  const reopen = async (binding: ArtifactBinding) =>
    requireChecksum(await loadRssRunArtifact(run, binding.artifactRef), binding.artifactSha256, "Exception scope");
  const refs = await Promise.all(exception.refs.map(reopen));
  const sourceIds = new Set<string>();
  for (const binding of sourceDocuments) {
    const parsed = validateSourceDocument((await reopen(binding)).value);
    if (!parsed.ok || parsed.value.runId !== exception.runId) throw new Error("Memo source identity is uncertain.");
    sourceIds.add(parsed.value.sourceItemId);
  }
  const selection = refs.find(ref => isRecord(ref.value) && ref.value.schemaVersion === "rss-batch-selection-v1");
  const assessment = refs.find(ref => basename(ref.path) === "question-relevance-assessment.json");
  if (selection && assessment && !exception.refs.some(ref => participants.has(resolve(ref.artifactRef)))) {
    const verified = await loadRssAssessment(root, selection.path, assessment.path);
    const expectedRefs = [verified.artifact.binding, verified.policyArtifact.binding, verified.selectionArtifact.binding,
      verified.assessmentArtifact.binding, verified.decisionArtifact.binding];
    const id = `rss-${rssSha256(`${exception.runId}\n${verified.document.sourceItemId}`).slice(0, 40)}`;
    const receipt = (await loadRssRunArtifact(run, resolve(run, "rss-admissions", id, "rss-admission-result.json"))).value;
    if (verified.capture.runId === exception.runId && !sourceIds.has(verified.document.sourceItemId) &&
        verified.assessed.assessment.verdict !== "relevant" && isDeepStrictEqual(exception.refs, expectedRefs) &&
        isRecord(receipt) && receipt.schemaVersion === "rss-admission-result-v1" &&
        receipt.runId === exception.runId && receipt.itemId === verified.document.sourceItemId &&
        receipt.outcome === "exception" && receipt.snapshotRef === undefined &&
        receipt.decidedAt === exception.raisedAt && isDeepStrictEqual(receipt.refs, expectedRefs)) return "unrelated";
    return null;
  }
  for (const binding of snapshots) {
    const snapshot = (await reopen(binding)).value;
    if (!isRecord(snapshot) || !isRecord(snapshot.item) || !isRecord(snapshot.item.articleLineage) ||
        !isRecord(snapshot.item.questionRelevance)) continue;
    const authorization = readArtifactBinding(snapshot.item.articleLineage.reassessment);
    if (!authorization) continue;
    const saved = await reopen(authorization);
    const savedValue = saved.value;
    if (!isRecord(savedValue) || !exception.refs.some(ref => isDeepStrictEqual(ref, savedValue.previousAssessment))) continue;
    const reassessment = await loadArticleReassessment(root, saved.path);
    const currentPath = snapshot.item.questionRelevance.assessmentArtifactRef;
    if (typeof currentPath !== "string") throw new Error("Reassessment snapshot lacks its current assessment.");
    const current = await loadArticleAdmissionInputs(root, reassessment.authorization.capture.artifactRef, currentPath, saved.path);
    const prior = (await reopen(reassessment.authorization.previousAdmission)).value;
    const receipt = (await loadRssRunArtifact(run, resolve(dirname(binding.artifactRef), "article-admission-result.json"))).value;
    const expectedRefs = [current.artifact.binding, current.capture.lineage.plan, current.assessment.binding,
      current.decision.binding, authorization, reassessment.authorization.previousAdmission];
    if (sourceDocuments.some(document =>
        document.artifactRef === current.checked.sourceDocumentArtifactRef &&
        document.artifactSha256 === current.checked.sourceDocumentArtifactSha256) &&
        isRecord(prior) && prior.outcome === "exception" && isDeepStrictEqual(prior.refs, exception.refs) &&
        prior.decidedAt === exception.raisedAt && reassessment.authorization.runId === exception.runId &&
        isDeepStrictEqual(current.request.binding, reassessment.request.binding) &&
        current.assessed.assessment.verdict === "relevant" &&
        current.assessment.binding.artifactSha256 === snapshot.item.questionRelevance.assessmentArtifactSha256 &&
        current.decision.binding.artifactRef === snapshot.item.questionRelevance.decisionArtifactRef &&
        current.decision.binding.artifactSha256 === snapshot.item.questionRelevance.decisionArtifactSha256 &&
        isDeepStrictEqual(snapshot.item.articleLineage.capture, current.artifact.binding) &&
        isRecord(receipt) && receipt.schemaVersion === "local-article-admission-result-v1" &&
        receipt.runId === exception.runId && receipt.itemId === current.capture.id && receipt.outcome === "approved" &&
        receipt.snapshotRef === binding.artifactRef && isDeepStrictEqual(receipt.refs, expectedRefs) &&
        typeof receipt.decidedAt === "string" && validTime(receipt.decidedAt) &&
        Date.parse(receipt.decidedAt) >= Date.parse(reassessment.authorization.approvedAt) &&
        !participants.has(resolve(reassessment.authorization.previousAssessment.artifactRef)) &&
        !participants.has(resolve(reassessment.previous.decision.binding.artifactRef))) return "superseded";
  }
  return null;
};
