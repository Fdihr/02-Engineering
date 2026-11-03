import { appendFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { rssRecord } from "../modules/collection/rss-capture.js";
import type { LocalArticleEvidenceCandidate } from "../core/types.js";
import { createOpenExceptionItem, validateExceptionItem } from "../modules/exceptions/exception-item.js";
import { admitVerifiedArticle } from "../workflow/admit-article-evidence.js";
import { artifactRef, commandError, longPath, writeJsonOnce } from "./assurance-io.js";
import { loadArticleAssessment } from "./article-io.js";
import { loadArticleReassessment } from "./article-reassessment.js";
import { articleRunRoot } from "./collect-article.js";
import { persistExceptionItem } from "./exception-io.js";
import { loadRssRunArtifact } from "./rss-io.js";

export const admitArticle = async (
  root: string, capturePath: string, assessmentPath: string, reassessmentPath?: string
): Promise<{ outcome: string; snapshotRef?: string }> => {
  const verified = await loadArticleAssessment(root, capturePath, assessmentPath);
  const { capture, artifact, assessment, decision, assessed } = verified;
  const reassessment = reassessmentPath ? await loadArticleReassessment(root, reassessmentPath) : undefined;
  if (reassessment && (!isDeepStrictEqual(reassessment.authorization.capture, artifact.binding) ||
      !isDeepStrictEqual(reassessment.request.binding, verified.request.binding) ||
      Date.parse(assessed.assessment.modelInvocation.startedAt) < Date.parse(reassessment.request.value.preparedAt))) {
    throw new Error("Reassessment request or invocation does not bind this authorization.");
  }
  if (reassessment) {
    const attempt = await loadRssRunArtifact(root, resolve(reassessment.directory, "generation-attempt.json"));
    const invocation = await loadRssRunArtifact(root, resolve(reassessment.directory, "invocation.json"));
    const provenance = assessed.assessment.modelInvocation;
    if (!rssRecord(attempt.value) || !rssRecord(invocation.value) ||
        attempt.value.requestId !== verified.checked.id || attempt.value.maxModelCalls !== 1 ||
        attempt.value.maxFetches !== 0 || attempt.value.model !== provenance.model ||
        typeof attempt.value.reservedAt !== "string" ||
        !Number.isFinite(Date.parse(attempt.value.reservedAt)) ||
        Date.parse(attempt.value.reservedAt) < Date.parse(verified.checked.preparedAt) ||
        Date.parse(attempt.value.reservedAt) > Date.parse(provenance.startedAt) ||
        invocation.value.invocationId !== provenance.id || invocation.value.provider !== provenance.provider ||
        invocation.value.model !== provenance.model || invocation.value.freshSession !== true ||
        invocation.value.startedAt !== provenance.startedAt || invocation.value.completedAt !== provenance.completedAt) {
      throw new Error("Reassessment generation receipt does not bind the recorded invocation.");
    }
  }
  if (assessed.decision.destination === "human_exception_triage") {
    const exceptions = resolve(root, capture.runId, "exceptions");
    let found = false;
    for (const entry of await readdir(longPath(exceptions))) {
      const saved = await loadRssRunArtifact(root, resolve(exceptions, entry, "exception-item.json"));
      const checkedException = validateExceptionItem(saved.value);
      if (checkedException.ok && checkedException.value.kind === "uncertain-relevance" &&
          checkedException.value.refs.some(ref => isDeepStrictEqual(ref, assessment.binding)) &&
          checkedException.value.refs.some(ref => isDeepStrictEqual(ref, decision.binding))) found = true;
    }
    if (!found) throw new Error("Recorded article relevance exception is missing.");
  }
  const decisionId = reassessment?.authorization.id ?? capture.id;
  const directory = reassessment
    ? resolve(root, capture.runId, "article-admissions", capture.id, "reassessments", decisionId)
    : resolve(root, capture.runId, "article-admissions", capture.id);
  await mkdir(longPath(dirname(directory)), { recursive: true });
  await mkdir(longPath(directory)); // Fail closed on repeated or incomplete decisions.
  const decidedAt = new Date().toISOString();
  const refs = [artifact.binding, capture.lineage.plan, assessment.binding, decision.binding];
  if (reassessment) refs.push(reassessment.artifact.binding, reassessment.authorization.previousAdmission);
  let outcome: string = assessed.assessment.verdict;
  let snapshotRef: string | undefined;
  if (outcome === "relevant") {
    const item: LocalArticleEvidenceCandidate = {
      provider: "local_article", endpoint: capture.plan.url, providerItemId: capture.id,
      sourceType: "publisher_source", providerTimestamp: capture.publishedAt ?? undefined,
      retrievedAt: capture.response.receivedAt, rawArtifactRef: capture.lineage.raw.artifactRef,
      rawArtifactSha256: capture.lineage.raw.artifactSha256,
      sourceLinks: [capture.response.finalUrl], referenceCount: 1, hasSourceMetadata: true,
      researchQuestion: capture.researchQuestion, role: "evidence_candidate", contentCompleteness: "captured_content",
      source: { requestedUrl: capture.plan.url, finalUrl: capture.response.finalUrl,
        publisherHost: new URL(capture.response.finalUrl).hostname, title: capture.title },
      articleLineage: { capture: artifact.binding, plan: capture.lineage.plan,
        ...(reassessment ? { reassessment: reassessment.artifact.binding } : {}) },
      questionRelevance: {
        assessmentArtifactRef: assessment.binding.artifactRef, assessmentArtifactSha256: assessment.binding.artifactSha256,
        decisionArtifactRef: decision.binding.artifactRef, decisionArtifactSha256: decision.binding.artifactSha256,
        ...assessed
      },
      limitations: capture.limitations
    };
    const intakePath = resolve(root, capture.runId, "source-reintakes", decisionId, "intake-result.json");
    const admitted = admitVerifiedArticle({
      plan: capture.plan, item, intakeArtifactRef: artifactRef(intakePath),
      decisionId, decidedAt,
      ...(reassessment ? { reassessment: {
        id: decisionId, approvedAt: reassessment.authorization.approvedAt
      } } : {})
    });
    if (!admitted.ok || admitted.value.outcome !== "approved") throw new Error(admitted.ok ? "Article admission failed." : admitted.error);
    await mkdir(longPath(dirname(intakePath)), { recursive: true });
    await writeJsonOnce(intakePath, { runId: capture.runId, item, decision: {
      providerItemId: capture.id, role: "evidence_candidate", destination: "human_review",
      approvalStatus: "pending_human_review", ruleId: "RULE-LOCAL-ARTICLE-001",
      reason: "Relevance proposal; admission is recorded separately under the approved one-source policy."
    } });
    await writeJsonOnce(resolve(directory, "evidence-decision.json"), admitted.value.decision);
    const snapshot = resolve(directory, "approved-evidence-snapshot.json");
    await writeJsonOnce(snapshot, admitted.value.snapshot);
    snapshotRef = artifactRef(snapshot);
    await appendFile(longPath(resolve(root, "evidence-events.jsonl")), JSON.stringify(admitted.value.event) + "\n");
    outcome = "approved";
  } else if (outcome !== "not-relevant") {
    // The recorder already raises the uncertain verdict's exception.
    if (assessed.decision.destination !== "human_exception_triage") {
      const exception = createOpenExceptionItem({ kind: "uncertain-relevance", runId: capture.runId, refs, raisedAt: decidedAt });
      if (!exception.ok) throw new Error(exception.error);
      await persistExceptionItem(root, exception.value);
    }
    outcome = "exception";
  }
  await writeJsonOnce(resolve(directory, "article-admission-result.json"), {
    schemaVersion: "local-article-admission-result-v1", runId: capture.runId, itemId: capture.id,
    outcome, refs, decidedAt, ...(snapshotRef ? { snapshotRef } : {})
  });
  return { outcome, ...(snapshotRef ? { snapshotRef } : {}) };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [capture, assessment, reassessment, ...extra] = process.argv.slice(2);
    if (!capture || !assessment || extra.length) throw new Error("Usage: article:admit -- <article-capture.json> <recorded-assessment.json> [reassessment-authorization.json]");
    const result = await admitArticle(articleRunRoot(), capture, assessment, reassessment);
    console.log(`Outcome: ${result.outcome}`);
    if (result.snapshotRef) console.log(`Snapshot: ${result.snapshotRef}`);
  } catch (error) { console.error(`Article admission failed: ${commandError(error)}`); process.exitCode = 1; }
}
