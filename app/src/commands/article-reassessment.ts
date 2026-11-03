import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { SourceArtifactLineage } from "../core/types.js";
import { rssPathId, rssRecord } from "../modules/collection/rss-capture.js";
import { createQuestionRelevanceRequest, validateQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";
import { artifactRef, commandError, longPath, writeJsonOnce } from "./assurance-io.js";
import { loadArticleAssessment } from "./article-io.js";
import { articleRunRoot } from "./collect-article.js";
import { loadRssRunArtifact } from "./rss-io.js";

type Authorization = {
  schemaVersion: "local-article-reassessment-v1";
  id: string;
  runId: string;
  sourceItemId: string;
  capture: SourceArtifactLineage;
  previousAssessment: SourceArtifactLineage;
  previousAdmission: SourceArtifactLineage;
  approvedBy: string;
  approvedAt: string;
  reason: string;
  promptPolicyVersion: "question-relevance-prompt-v2";
  maxFetches: 0;
  maxModelCalls: 1;
  admission: "controller-relevant-only";
};

const readBinding = (value: unknown): SourceArtifactLineage => {
  if (!rssRecord(value) || Object.keys(value).length !== 2 ||
      typeof value.artifactRef !== "string" || !value.artifactRef.trim() ||
      typeof value.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.artifactSha256)) {
    throw new Error("Invalid reassessment artifact binding.");
  }
  return { artifactRef: value.artifactRef, artifactSha256: value.artifactSha256 };
};

const validateAuthorization = (value: unknown, now: string): Authorization => {
  if (!rssRecord(value) || Object.keys(value).sort().join(",") !== [
    "schemaVersion", "id", "runId", "sourceItemId", "capture", "previousAssessment", "previousAdmission",
    "approvedBy", "approvedAt", "reason", "promptPolicyVersion", "maxFetches", "maxModelCalls", "admission"
  ].sort().join(",") ||
      value.schemaVersion !== "local-article-reassessment-v1" ||
      !rssPathId(value.id) || !rssPathId(value.runId) || !rssPathId(value.sourceItemId) ||
      value.id === value.sourceItemId ||
      typeof value.approvedBy !== "string" || !value.approvedBy.trim() ||
      typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 2000 ||
      typeof value.approvedAt !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value.approvedAt) ||
      !Number.isFinite(Date.parse(value.approvedAt)) || Date.parse(value.approvedAt) > Date.parse(now) ||
      value.promptPolicyVersion !== "question-relevance-prompt-v2" ||
      value.maxFetches !== 0 || value.maxModelCalls !== 1 || value.admission !== "controller-relevant-only") {
    throw new Error("Invalid or unapproved article reassessment authorization.");
  }
  return {
    schemaVersion: value.schemaVersion, id: value.id, runId: value.runId, sourceItemId: value.sourceItemId,
    capture: readBinding(value.capture), previousAssessment: readBinding(value.previousAssessment),
    previousAdmission: readBinding(value.previousAdmission), approvedBy: value.approvedBy,
    approvedAt: value.approvedAt, reason: value.reason, promptPolicyVersion: value.promptPolicyVersion,
    maxFetches: 0, maxModelCalls: 1, admission: value.admission
  };
};

const loadAuthorization = async (root: string, path: string, now: string) => {
  const artifact = await loadRssRunArtifact(root, path);
  const authorization = validateAuthorization(artifact.value, now);
  const previous = await loadArticleAssessment(root, authorization.capture.artifactRef,
    authorization.previousAssessment.artifactRef);
  const admission = await loadRssRunArtifact(root, authorization.previousAdmission.artifactRef);
  const originalPath = resolve(root, authorization.runId, "article-admissions", authorization.sourceItemId,
    "article-admission-result.json");
  if (!isDeepStrictEqual(previous.artifact.binding, authorization.capture) ||
      !isDeepStrictEqual(previous.assessment.binding, authorization.previousAssessment) ||
      !isDeepStrictEqual(admission.binding, authorization.previousAdmission) ||
      resolve(authorization.previousAdmission.artifactRef) !== originalPath ||
      previous.capture.runId !== authorization.runId || previous.capture.id !== authorization.sourceItemId ||
      previous.checked.promptPolicyVersion !== "question-relevance-prompt-v1" ||
      previous.assessed.assessment.verdict === "relevant" ||
      !rssRecord(admission.value) || admission.value.schemaVersion !== "local-article-admission-result-v1" ||
      admission.value.runId !== authorization.runId || admission.value.itemId !== authorization.sourceItemId ||
      !["exception", "not-relevant"].includes(String(admission.value.outcome)) ||
      !Array.isArray(admission.value.refs) ||
      !admission.value.refs.some(ref => isDeepStrictEqual(ref, previous.assessment.binding)) ||
      !admission.value.refs.some(ref => isDeepStrictEqual(ref, previous.decision.binding)) ||
      typeof admission.value.decidedAt !== "string" ||
      !Number.isFinite(Date.parse(admission.value.decidedAt)) ||
      Date.parse(authorization.approvedAt) < Date.parse(admission.value.decidedAt)) {
    throw new Error("Reassessment must bind the original completed nonpositive v1 admission.");
  }
  return { artifact, authorization, previous };
};

export const prepareArticleReassessment = async (root: string, path: string) => {
  const preparedAt = new Date().toISOString();
  const { artifact, authorization, previous } = await loadAuthorization(root, path, preparedAt);
  const created = createQuestionRelevanceRequest({
    preparedAt, researchQuestion: previous.checked.researchQuestion,
    sourceDocument: previous.checked.sourceDocument,
    sourceDocumentArtifactRef: previous.checked.sourceDocumentArtifactRef,
    sourceDocumentArtifactSha256: previous.checked.sourceDocumentArtifactSha256,
    sourceLimitations: previous.checked.sourceLimitations
  });
  if (!created.ok) throw new Error(created.error);
  const requestPath = resolve(dirname(previous.request.binding.artifactRef), "..", created.value.id,
    "question-relevance-request.json");
  const directory = resolve(root, authorization.runId, "article-reassessments", authorization.id);
  await mkdir(longPath(dirname(directory)), { recursive: true });
  await mkdir(longPath(directory));
  const savedAuthorization = resolve(directory, "authorization.json");
  await writeJsonOnce(savedAuthorization, authorization);
  // Capture-level lock prevents two authorizations from spending another call on the same saved source.
  await writeJsonOnce(resolve(dirname(authorization.capture.artifactRef), "production-reassessment.json"), {
    authorization: (await loadRssRunArtifact(root, savedAuthorization)).binding,
    requestId: created.value.id, preparedAt
  });
  await mkdir(longPath(dirname(requestPath)), { recursive: true });
  await writeJsonOnce(requestPath, created.value);
  const request = await loadRssRunArtifact(root, requestPath);
  await writeJsonOnce(resolve(directory, "prepared.json"), {
    schemaVersion: "local-article-reassessment-prepared-v1",
    authorization: (await loadRssRunArtifact(root, savedAuthorization)).binding,
    approvalInput: artifact.binding, request: request.binding, preparedAt,
    basis: "One additional production call; no refetch, automatic retry or change to original history."
  });
  return { authorizationPath: artifactRef(savedAuthorization), requestPath: artifactRef(requestPath) };
};

export const loadArticleReassessment = async (root: string, path: string) => {
  const loaded = await loadAuthorization(root, path, new Date().toISOString());
  const { authorization } = loaded;
  const directory = resolve(root, authorization.runId, "article-reassessments", authorization.id);
  if (resolve(path) !== resolve(directory, "authorization.json")) throw new Error("Use the reserved reassessment authorization.");
  const prepared = await loadRssRunArtifact(root, resolve(directory, "prepared.json"));
  const lock = await loadRssRunArtifact(root, resolve(dirname(authorization.capture.artifactRef), "production-reassessment.json"));
  if (!rssRecord(prepared.value) || prepared.value.schemaVersion !== "local-article-reassessment-prepared-v1" ||
      !isDeepStrictEqual(prepared.value.authorization, loaded.artifact.binding) ||
      !rssRecord(lock.value) || !isDeepStrictEqual(lock.value.authorization, loaded.artifact.binding)) {
    throw new Error("Reassessment reservation does not reconstruct.");
  }
  const approvalInput = await loadRssRunArtifact(root, readBinding(prepared.value.approvalInput).artifactRef);
  if (!isDeepStrictEqual(approvalInput.binding, prepared.value.approvalInput) ||
      !isDeepStrictEqual(approvalInput.value, authorization)) throw new Error("Reassessment approval drift.");
  const request = await loadRssRunArtifact(root, readBinding(prepared.value.request).artifactRef);
  const checked = validateQuestionRelevanceRequest(request.value);
  const expected = createQuestionRelevanceRequest({
    ...loaded.previous.checked, preparedAt: prepared.value.preparedAt
  });
  if (!checked.ok || !expected.ok || !isDeepStrictEqual(checked.value, expected.value) ||
      !isDeepStrictEqual(request.binding, prepared.value.request) || lock.value.requestId !== checked.value.id ||
      lock.value.preparedAt !== checked.value.preparedAt ||
      Date.parse(checked.value.preparedAt) < Date.parse(authorization.approvedAt)) {
    throw new Error("Reassessment prepared request does not reconstruct.");
  }
  return { ...loaded, request: { ...request, value: checked.value }, directory };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [action, path, ...extra] = process.argv.slice(2);
    if (!path || extra.length || (action !== "prepare" && action !== "verify")) {
      throw new Error("Usage: article:reassessment -- <prepare|verify> <authorization.json>");
    }
    if (action === "prepare") console.log(JSON.stringify(await prepareArticleReassessment(articleRunRoot(), path)));
    else {
      const loaded = await loadArticleReassessment(articleRunRoot(), path);
      console.log(JSON.stringify({ requestPath: loaded.request.binding.artifactRef,
        capturePath: loaded.authorization.capture.artifactRef, directory: artifactRef(loaded.directory) }));
    }
  } catch (error) {
    console.error(`Article reassessment failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
}
