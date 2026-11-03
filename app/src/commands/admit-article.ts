import { appendFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { LocalArticleEvidenceCandidate } from "../core/types.js";
import { adaptArticleContent } from "../modules/collection/article-capture.js";
import { rssRecord } from "../modules/collection/rss-capture.js";
import { createOpenExceptionItem, validateExceptionItem } from "../modules/exceptions/exception-item.js";
import { assessCopilotPocResponse } from "../modules/relevance/copilot-poc.js";
import { validateQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";
import { createSourceDocument } from "../modules/source/source-document.js";
import { admitVerifiedArticle } from "../workflow/admit-article-evidence.js";
import { artifactRef, commandError, longPath, writeJsonOnce } from "./assurance-io.js";
import { loadArticleCapture } from "./article-io.js";
import { articleRunRoot } from "./collect-article.js";
import { persistExceptionItem } from "./exception-io.js";
import { loadRssRunArtifact } from "./rss-io.js";

export const admitArticle = async (
  root: string, capturePath: string, assessmentPath: string
): Promise<{ outcome: string; snapshotRef?: string }> => {
  const { capture, artifact } = await loadArticleCapture(root, capturePath);
  const assessment = await loadRssRunArtifact(root, assessmentPath);
  const a = assessment.value;
  if (!rssRecord(a) || !rssRecord(a.modelInvocation) || a.sourceItemId !== capture.id ||
      typeof a.modelInvocation.promptArtifactRef !== "string" ||
      typeof a.modelInvocation.responseArtifactRef !== "string") throw new Error("Article assessment does not bind this capture.");
  const request = await loadRssRunArtifact(root, a.modelInvocation.promptArtifactRef);
  const response = await loadRssRunArtifact(root, a.modelInvocation.responseArtifactRef);
  const checked = validateQuestionRelevanceRequest(request.value);
  if (!checked.ok) throw new Error("Invalid article relevance request.");
  const source = adaptArticleContent(capture, artifact.binding);
  const document = source.ok ? createSourceDocument(source.value) : source;
  const documentArtifact = await loadRssRunArtifact(root, checked.value.sourceDocumentArtifactRef);
  if (!document.ok || !isDeepStrictEqual(document.value, checked.value.sourceDocument) ||
      !isDeepStrictEqual(document.value, documentArtifact.value) ||
      documentArtifact.binding.artifactSha256 !== checked.value.sourceDocumentArtifactSha256 ||
      !isDeepStrictEqual(capture.researchQuestion, checked.value.researchQuestion) ||
      !isDeepStrictEqual(capture.limitations, checked.value.sourceLimitations)) {
    throw new Error("Article canonical content or question does not reconstruct.");
  }
  const assessed = assessCopilotPocResponse(request.value, request.binding.artifactRef,
    request.binding.artifactSha256, response.value, response.binding.artifactRef, response.binding.artifactSha256);
  const decision = await loadRssRunArtifact(root, resolve(dirname(assessmentPath), "question-relevance-decision.json"));
  if (!assessed.ok || !isDeepStrictEqual(a, assessed.value.assessment) ||
      !isDeepStrictEqual(decision.value, assessed.value.decision)) throw new Error("Article relevance does not reconstruct.");
  const expected = resolve(root, capture.runId, "sources", capture.id, document.value.id,
    "question-relevance", checked.value.id, "assessments", assessed.value.assessment.id, "question-relevance-assessment.json");
  if (resolve(assessmentPath) !== expected) throw new Error("Article admission requires the recorded assessment path.");
  if (assessed.value.decision.destination === "human_exception_triage") {
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
  const directory = resolve(root, capture.runId, "article-admissions", capture.id);
  await mkdir(longPath(dirname(directory)), { recursive: true });
  await mkdir(longPath(directory)); // Fail closed on repeated or incomplete decisions.
  const decidedAt = new Date().toISOString();
  const refs = [artifact.binding, capture.lineage.plan, assessment.binding, decision.binding];
  let outcome: string = assessed.value.assessment.verdict;
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
      articleLineage: { capture: artifact.binding, plan: capture.lineage.plan },
      questionRelevance: {
        assessmentArtifactRef: assessment.binding.artifactRef, assessmentArtifactSha256: assessment.binding.artifactSha256,
        decisionArtifactRef: decision.binding.artifactRef, decisionArtifactSha256: decision.binding.artifactSha256,
        ...assessed.value
      },
      limitations: capture.limitations
    };
    const intakePath = resolve(root, capture.runId, "source-reintakes", capture.id, "intake-result.json");
    const admitted = admitVerifiedArticle({
      plan: capture.plan, item, intakeArtifactRef: artifactRef(intakePath),
      decisionId: capture.id, decidedAt
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
    if (assessed.value.decision.destination !== "human_exception_triage") {
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
    const [capture, assessment, ...extra] = process.argv.slice(2);
    if (!capture || !assessment || extra.length) throw new Error("Usage: article:admit -- <article-capture.json> <recorded-assessment.json>");
    const result = await admitArticle(articleRunRoot(), capture, assessment);
    console.log(`Outcome: ${result.outcome}`);
    if (result.snapshotRef) console.log(`Snapshot: ${result.snapshotRef}`);
  } catch (error) { console.error(`Article admission failed: ${commandError(error)}`); process.exitCode = 1; }
}
