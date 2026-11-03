import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ARTICLE_EXTRACTION_VERSION, adaptArticleContent, createArticleCapture, prepareArticle } from "../modules/collection/article-capture.js";
import { assessCopilotPocResponse } from "../modules/relevance/copilot-poc.js";
import { validateQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";
import { createSourceDocument } from "../modules/source/source-document.js";
import { rssRecord, rssSha256, type RssResponse } from "../modules/collection/rss-capture.js";
import { longPath, type LoadedArtifact } from "./assurance-io.js";
import { loadRssQuestion, loadRssRunArtifact, rssRunPath } from "./rss-io.js";

export const loadArticleCapture = async (root: string, path: string) => {
  const artifact = await loadRssRunArtifact(root, path);
  const value = artifact.value;
  if (!rssRecord(value) || value.schemaVersion !== "local-article-capture-v1" ||
      !rssRecord(value.lineage) || !rssRecord(value.researchQuestion) ||
      typeof value.researchQuestion.artifactRef !== "string") throw new Error("Invalid local article receipt.");
  const reopen = async (binding: unknown): Promise<LoadedArtifact> => {
    if (!rssRecord(binding) || typeof binding.artifactRef !== "string") throw new Error("Missing article lineage.");
    const loaded = await loadRssRunArtifact(root, binding.artifactRef);
    if (!isDeepStrictEqual(loaded.binding, binding)) throw new Error("Article artifact checksum mismatch.");
    return loaded;
  };

  const planArtifact = await reopen(value.lineage.plan);
  const request = await reopen(value.lineage.request);
  const response = await reopen(value.lineage.response);
  const r = response.value;
  if (!rssRecord(r) || typeof r.requestedAt !== "string" || typeof r.receivedAt !== "string" ||
      typeof r.finalUrl !== "string" || typeof r.mediaType !== "string" || typeof r.httpStatus !== "number" ||
      !Array.isArray(r.redirects) || !r.redirects.every((url: unknown) => typeof url === "string") ||
      !(r.etag === null || typeof r.etag === "string") ||
      !(r.lastModified === null || typeof r.lastModified === "string")) throw new Error("Invalid article response metadata.");
  const typedResponse: RssResponse = {
    requestedAt: r.requestedAt, receivedAt: r.receivedAt, finalUrl: r.finalUrl, mediaType: r.mediaType,
    httpStatus: r.httpStatus, redirects: r.redirects, etag: r.etag, lastModified: r.lastModified
  };
  const question = await loadRssQuestion(root, value.researchQuestion.artifactRef, r.requestedAt);
  const plan = prepareArticle(planArtifact.value, question, r.requestedAt);
  if (!plan.ok || !isDeepStrictEqual(request.value, {
    plan: plan.value, planBinding: planArtifact.binding, researchQuestion: question, requestedAt: r.requestedAt
  })) throw new Error("Article plan or request does not reconstruct.");
  const rawBinding = value.lineage.raw;
  if (!rssRecord(rawBinding) || typeof rawBinding.artifactRef !== "string") throw new Error("Missing article raw binding.");
  const raw = await readFile(longPath(await rssRunPath(root, rawBinding.artifactRef)));
  if (rssSha256(raw) !== rawBinding.artifactSha256) throw new Error("Article raw checksum mismatch.");
  if (value.extractionVersion !== ARTICLE_EXTRACTION_VERSION &&
      value.extractionVersion !== "readability-0.6.0-jsdom-30.1.3-v1") throw new Error("Unsupported article extraction version.");
  const reconstructed = createArticleCapture(plan.value, question, raw, typedResponse, {
    plan: planArtifact.binding, request: request.binding, response: response.binding,
    raw: { artifactRef: rawBinding.artifactRef, artifactSha256: rssSha256(raw) }
  }, value.extractionVersion);
  if (!reconstructed.ok || !isDeepStrictEqual(reconstructed.value, value)) {
    throw new Error("Article receipt does not reconstruct from raw HTML and approved inputs.");
  }
  return { capture: reconstructed.value, artifact };
};

export const loadArticleAssessment = async (root: string, capturePath: string, assessmentPath: string) => {
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
  return { capture, artifact, assessment, request, response, checked: checked.value,
    document: document.value, assessed: assessed.value, decision };
};
