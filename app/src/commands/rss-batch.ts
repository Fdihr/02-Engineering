import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { RssEvidenceCandidate } from "../core/types.js";
import { rssRecord, rssSha256 } from "../modules/collection/rss-capture.js";
import { createOpenExceptionItem, validateExceptionItem } from "../modules/exceptions/exception-item.js";
import { assessCopilotPocResponse } from "../modules/relevance/copilot-poc.js";
import { validateQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";
import { adaptRssSourceContent } from "../modules/source/rss-source-adapter.js";
import { createSourceDocument } from "../modules/source/source-document.js";
import { admitVerifiedRssEvidence, readRssBatchPolicy } from "../workflow/admit-rss-evidence.js";
import { artifactRef } from "./assurance-io.js";
import { persistExceptionItem } from "./exception-io.js";
import { loadRssCapture, loadRssRunArtifact, rssRunRoot } from "./rss-io.js";

const writeOnce = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, JSON.stringify(value, null, 2), { flag: "wx" });
};
const selectionFor = async (root: string, capturePath: string, policyPath: string) => {
  const verified = await loadRssCapture(root, capturePath);
  const policyArtifact = await loadRssRunArtifact(root, policyPath);
  const parsed = readRssBatchPolicy(policyArtifact.value);
  if (!parsed.ok) throw new Error(parsed.error);
  const policy = parsed.value;
  const { capture } = verified;
  const plan = await loadRssRunArtifact(root, capture.lineage.plan.artifactRef);
  if (policy.runId !== capture.runId || policy.researchQuestionId !== capture.researchQuestion.id ||
      policy.feedId !== capture.feed.id || policy.id !== capture.id ||
      Date.parse(policy.approvedAt) > Date.parse(capture.response.requestedAt) ||
      !rssRecord(plan.value) || !rssRecord(plan.value.permission) ||
      plan.value.permission.reference !== policy.permissionReference ||
      plan.value.permission.confirmedBy !== policy.approvedBy ||
      plan.value.permission.confirmedAt !== policy.approvedAt) {
    throw new Error("RSS batch policy does not bind this capture and permission.");
  }
  return { ...verified, policy, policyArtifact };
};

export const prepareRssBatch = async (
  root: string, capturePath: string, policyPath: string
): Promise<string> => {
  const { capture, artifact, policy, policyArtifact } = await selectionFor(root, capturePath, policyPath);
  const batchDir = dirname(resolve(policyPath));
  const eligible = capture.items.filter(item => adaptRssSourceContent(capture, item.id, artifact.binding).ok);
  const prior = new Set<string>();
  const admissions = resolve(root, capture.runId, "rss-admissions");
  let entries: string[] = [];
  try { entries = await readdir(admissions); } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  for (const id of entries) {
    let receipt;
    try { receipt = await loadRssRunArtifact(root, resolve(admissions, id, "rss-admission-result.json")); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Incomplete RSS admission ${id}; inspect it before starting another batch.`);
      }
      throw error;
    }
    if (rssRecord(receipt.value) && typeof receipt.value.itemId === "string") prior.add(receipt.value.itemId);
  }
  const available = eligible.filter(item => !prior.has(item.id));
  await writeOnce(resolve(batchDir, "capture-index.json"), {
    schemaVersion: "rss-capture-index-v1", capture: artifact.binding, feed: capture.feed,
    researchQuestionId: capture.researchQuestion.id, receivedAt: capture.response.receivedAt,
    items: capture.items.map(item => ({
      id: item.id, title: item.title.slice(0, 1000), articleUrl: item.articleUrl,
      publishedAt: item.publishedAt, timeStatus: item.timeStatus,
      contentStatus: item.contentStatus, duplicateCount: item.duplicateCount
    }))
  });
  const path = resolve(batchDir, "selection.json");
  await writeOnce(path, {
    schemaVersion: "rss-batch-selection-v1", capture: artifact.binding, policy: policyArtifact.binding,
    itemIds: available.slice(0, policy.maxItems).map(item => item.id),
    eligible: eligible.length, alreadyProcessed: eligible.length - available.length,
    deferred: Math.max(0, available.length - policy.maxItems),
    basis: "Feed order; bounded processing budget, not an evidence ranking. All unselected items remain in the capture."
  });
  return artifactRef(path);
};

export const admitRss = async (
  root: string, selectionPath: string, assessmentPath: string
): Promise<{ outcome: string; snapshotRef?: string }> => {
  const selectionArtifact = await loadRssRunArtifact(root, selectionPath);
  const selection = selectionArtifact.value;
  if (!rssRecord(selection) || selection.schemaVersion !== "rss-batch-selection-v1" ||
      !rssRecord(selection.capture) || typeof selection.capture.artifactRef !== "string" ||
      !rssRecord(selection.policy) || typeof selection.policy.artifactRef !== "string" ||
      !Array.isArray(selection.itemIds)) throw new Error("Invalid RSS batch selection.");
  const verified = await selectionFor(root, selection.capture.artifactRef, selection.policy.artifactRef);
  const { capture, artifact, policy, policyArtifact } = verified;
  const eligibleIds = new Set(capture.items.filter(item => adaptRssSourceContent(capture, item.id, artifact.binding).ok).map(item => item.id));
  if (!isDeepStrictEqual(selection.capture, artifact.binding) ||
      !isDeepStrictEqual(selection.policy, policyArtifact.binding) ||
      selection.itemIds.length > policy.maxItems || selection.itemIds.length < 1 ||
      new Set(selection.itemIds).size !== selection.itemIds.length ||
      !selection.itemIds.every(id => typeof id === "string" && eligibleIds.has(id)) ||
      resolve(selectionPath) !== resolve(dirname(selection.policy.artifactRef), "selection.json")) {
    throw new Error("RSS selection exceeds its approved budget or lineage.");
  }
  const assessmentArtifact = await loadRssRunArtifact(root, assessmentPath);
  const a = assessmentArtifact.value;
  if (!rssRecord(a) || !rssRecord(a.modelInvocation) || typeof a.sourceItemId !== "string" ||
      !selection.itemIds.includes(a.sourceItemId) || typeof a.modelInvocation.promptArtifactRef !== "string" ||
      typeof a.modelInvocation.responseArtifactRef !== "string") throw new Error("RSS assessment is not in this batch.");
  const request = await loadRssRunArtifact(root, a.modelInvocation.promptArtifactRef);
  const response = await loadRssRunArtifact(root, a.modelInvocation.responseArtifactRef);
  const checked = validateQuestionRelevanceRequest(request.value);
  if (!checked.ok) throw new Error("Invalid RSS relevance request.");
  const source = adaptRssSourceContent(capture, a.sourceItemId, artifact.binding);
  const document = source.ok ? createSourceDocument(source.value) : source;
  const documentArtifact = await loadRssRunArtifact(root, checked.value.sourceDocumentArtifactRef);
  if (!document.ok || !isDeepStrictEqual(document.value, checked.value.sourceDocument) ||
      !isDeepStrictEqual(document.value, documentArtifact.value) ||
      documentArtifact.binding.artifactSha256 !== checked.value.sourceDocumentArtifactSha256 ||
      !isDeepStrictEqual(capture.researchQuestion, checked.value.researchQuestion)) {
    throw new Error("RSS canonical source or approved question does not reconstruct.");
  }
  const assessed = assessCopilotPocResponse(request.value, request.binding.artifactRef,
    request.binding.artifactSha256, response.value, response.binding.artifactRef, response.binding.artifactSha256);
  const decisionArtifact = await loadRssRunArtifact(root, resolve(dirname(assessmentPath), "question-relevance-decision.json"));
  if (!assessed.ok || !isDeepStrictEqual(a, assessed.value.assessment) ||
      !isDeepStrictEqual(decisionArtifact.value, assessed.value.decision)) {
    throw new Error("RSS relevance assessment or decision does not reconstruct.");
  }
  const expectedAssessmentPath = resolve(root, capture.runId, "sources", a.sourceItemId,
    document.value.id, "question-relevance", checked.value.id, "assessments",
    assessed.value.assessment.id, "question-relevance-assessment.json");
  if (resolve(assessmentPath) !== expectedAssessmentPath) throw new Error("RSS admission requires the recorded assessment path.");
  const id = `rss-${rssSha256(`${capture.runId}\n${a.sourceItemId}`).slice(0, 40)}`;
  const directory = resolve(root, capture.runId, "rss-admissions", id);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // A run/item is consumed once across every batch, including failures.
  const decidedAt = new Date().toISOString();
  const refs = [artifact.binding, policyArtifact.binding, selectionArtifact.binding, assessmentArtifact.binding, decisionArtifact.binding];
  let outcome: string = assessed.value.assessment.verdict;
  let snapshotRef: string | undefined;
  if (outcome === "relevant") {
    const rssItem = capture.items.find(item => item.id === a.sourceItemId);
    if (!rssItem?.articleUrl) throw new Error("RSS item URL is missing.");
    const candidateId = `rss-candidate-${a.sourceItemId.slice(4, 44)}`;
    const candidate: RssEvidenceCandidate = {
      provider: "rss", endpoint: capture.feed.url, providerItemId: candidateId,
      sourceType: "captured_feed_item", providerTimestamp: rssItem.publishedAt ?? undefined,
      retrievedAt: capture.response.receivedAt, rawArtifactRef: capture.lineage.raw.artifactRef,
      rawArtifactSha256: capture.lineage.raw.artifactSha256,
      sourceLinks: [rssItem.articleUrl], referenceCount: 1, hasSourceMetadata: true,
      researchQuestion: capture.researchQuestion, role: "evidence_candidate", contentCompleteness: "captured_content",
      source: { feedUrl: capture.feed.url, articleUrl: rssItem.articleUrl,
        publisherHost: new URL(capture.feed.url).hostname, title: rssItem.title },
      rssLineage: { capture: artifact.binding, policy: policyArtifact.binding, selection: selectionArtifact.binding, itemId: rssItem.id },
      questionRelevance: {
        assessmentArtifactRef: assessmentArtifact.binding.artifactRef,
        assessmentArtifactSha256: assessmentArtifact.binding.artifactSha256,
        decisionArtifactRef: decisionArtifact.binding.artifactRef,
        decisionArtifactSha256: decisionArtifact.binding.artifactSha256,
        ...assessed.value
      },
      limitations: [...capture.limitations, "Captured feed text, not a complete publisher article.",
        "Article URL is reported by the feed, not fetched or redirect-verified.", "support check: model-only, unvalidated"]
    };
    const intakePath = resolve(root, capture.runId, "source-reintakes", candidateId, "intake-result.json");
    const result = admitVerifiedRssEvidence({
      policy, item: candidate, intakeArtifactRef: artifactRef(intakePath),
      decisionId: id, decidedAt, rawArtifactSha256: capture.lineage.raw.artifactSha256
    });
    if (!result.ok || result.value.outcome !== "approved") throw new Error(result.ok ? "RSS admission failed." : result.error);
    await mkdir(dirname(intakePath), { recursive: true });
    await writeOnce(intakePath, { runId: capture.runId, item: candidate, decision: {
      providerItemId: candidateId, role: "evidence_candidate", destination: "human_review",
      approvalStatus: "pending_human_review", ruleId: "RULE-RSS-POLICY-001",
      reason: "RSS relevance proposal; admission is recorded separately by the approved controller policy."
    } });
    await writeOnce(resolve(directory, "evidence-decision.json"), result.value.decision);
    const snapshotPath = resolve(directory, "approved-evidence-snapshot.json");
    await writeOnce(snapshotPath, result.value.snapshot);
    snapshotRef = artifactRef(snapshotPath);
    await appendFile(resolve(root, "evidence-events.jsonl"), `${JSON.stringify(result.value.event)}\n`);
    outcome = "approved";
  } else if (outcome !== "not-relevant") {
    let existing = false;
    if (assessed.value.decision.destination === "human_exception_triage") {
      const exceptionRoot = resolve(root, capture.runId, "exceptions");
      for (const entry of await readdir(exceptionRoot)) {
        const artifact = await loadRssRunArtifact(root, resolve(exceptionRoot, entry, "exception-item.json"));
        const checkedException = validateExceptionItem(artifact.value);
        if (checkedException.ok && checkedException.value.kind === "uncertain-relevance" &&
            checkedException.value.refs.some(ref => isDeepStrictEqual(ref, assessmentArtifact.binding)) &&
            checkedException.value.refs.some(ref => isDeepStrictEqual(ref, decisionArtifact.binding))) existing = true;
      }
      if (!existing) throw new Error("The recorded relevance exception is missing.");
    }
    if (!existing) {
      const exception = createOpenExceptionItem({ kind: "uncertain-relevance", runId: capture.runId, refs, raisedAt: decidedAt });
      if (!exception.ok) throw new Error(exception.error);
      await persistExceptionItem(root, exception.value);
    }
    outcome = "exception";
  }
  await writeOnce(resolve(directory, "rss-admission-result.json"), {
    schemaVersion: "rss-admission-result-v1", itemId: a.sourceItemId, runId: capture.runId,
    outcome, refs, decidedAt, ...(snapshotRef ? { snapshotRef } : {})
  });
  return { outcome, ...(snapshotRef ? { snapshotRef } : {}) };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [operation, first, second, ...extra] = process.argv.slice(2);
  try {
    if (!first || !second || extra.length || !["prepare", "admit"].includes(operation ?? "")) throw new Error("Usage: rss:batch -- <prepare capture policy | admit selection assessment>");
    if (operation === "prepare") console.log(`Output: ${await prepareRssBatch(rssRunRoot(), first, second)}`);
    else {
      const result = await admitRss(rssRunRoot(), first, second);
      console.log(`Outcome: ${result.outcome}`);
      if (result.snapshotRef) console.log(`Snapshot: ${result.snapshotRef}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "RSS batch failed.");
    process.exitCode = 1;
  }
}
