import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ApprovedResearchQuestion, SourceArtifactLineage } from "../core/types.js";
import {
  createRssCapture, prepareRssCollection, rssRecord, rssSha256,
  type RssCapture, type RssResponse
} from "../modules/collection/rss-capture.js";
import { validateApprovedResearchQuestion } from "../modules/research/research-question.js";
import { validateApprovedMemoScope } from "../modules/research/memo-scope.js";
import { artifactRef, loadJsonArtifact, longPath, type LoadedArtifact } from "./assurance-io.js";

export const rssRunRoot = (): string => resolve(process.env.RSS_RUN_DIR ?? "runs");
export const loadRssRunArtifact = async (
  runRoot: string, value: string
): Promise<LoadedArtifact> => loadJsonArtifact(await rssRunPath(runRoot, value));

export const rssRunPath = async (runRoot: string, value: string): Promise<string> => {
  const path = resolve(value);
  const delta = relative(await realpath(runRoot), await realpath(path));
  if (delta.startsWith("..") || isAbsolute(delta)) throw new Error("RSS artifact must remain inside the configured run directory.");
  return path;
};

export const loadRssQuestion = async (
  runRoot: string, questionPath: string, usedAt: string
): Promise<ApprovedResearchQuestion> => {
  const questionArtifact = await loadRssRunArtifact(runRoot, questionPath);
  const result = validateApprovedResearchQuestion(
    rssRecord(questionArtifact.value) ? { ...questionArtifact.value, ...questionArtifact.binding } : questionArtifact.value,
    usedAt
  );
  if (!result.ok || !result.value.scopeApproval) throw new Error("RSS requires an approved question with approved scope lineage.");
  const question = result.value;
  const reference = question.scopeApproval;
  if (!reference) throw new Error("RSS scope approval is missing.");
  const scopeArtifact = await loadRssRunArtifact(runRoot, reference.artifactRef);
  if (scopeArtifact.binding.artifactSha256 !== reference.artifactSha256) throw new Error("RSS scope checksum mismatch.");
  const scope = validateApprovedMemoScope(
    rssRecord(scopeArtifact.value) ? { ...scopeArtifact.value, ...scopeArtifact.binding } : scopeArtifact.value,
    usedAt
  );
  if (!scope.ok || scope.value.id !== reference.scopeId ||
      scope.value.version !== reference.scopeVersion || scope.value.runId !== question.runId ||
      !question.geographies.every(geo => scope.value.geographies.value.includes(geo)) ||
      Date.parse(question.timeWindow.from) < Date.parse(scope.value.timeWindow.value.from) ||
      Date.parse(question.timeWindow.to) > Date.parse(scope.value.timeWindow.value.to) ||
      (scope.value.researchThesis && question.researchThesis !== scope.value.researchThesis.value)) {
    throw new Error("RSS approved scope does not bind this question.");
  }
  return question;
};

const binding = (value: unknown): SourceArtifactLineage => {
  if (!rssRecord(value) || typeof value.artifactRef !== "string" ||
      typeof value.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.artifactSha256)) {
    throw new Error("RSS artifact binding is invalid.");
  }
  return { artifactRef: value.artifactRef, artifactSha256: value.artifactSha256 };
};
const reopen = async (runRoot: string, value: unknown): Promise<LoadedArtifact> => {
  const expected = binding(value);
  const artifact = await loadRssRunArtifact(runRoot, expected.artifactRef);
  if (artifact.binding.artifactSha256 !== expected.artifactSha256) throw new Error("RSS artifact checksum mismatch.");
  return artifact;
};

export const loadRssCapture = async (
  runRoot: string, capturePath: string
): Promise<{ capture: RssCapture; artifact: LoadedArtifact }> => {
  const artifact = await loadRssRunArtifact(runRoot, capturePath);
  const value = artifact.value;
  if (!rssRecord(value) || value.schemaVersion !== "rss-capture-v1" ||
      !rssRecord(value.lineage) || !rssRecord(value.response) ||
      !rssRecord(value.researchQuestion)) throw new Error("Invalid RSS capture receipt.");
  const plan = await reopen(runRoot, value.lineage.plan);
  const catalogue = await reopen(runRoot, value.lineage.catalogue);
  const request = await reopen(runRoot, value.lineage.request);
  const response = await reopen(runRoot, value.lineage.response);
  const rawBinding = binding(value.lineage.raw);
  const raw = await readFile(longPath(await rssRunPath(runRoot, rawBinding.artifactRef)));
  if (rssSha256(raw) !== rawBinding.artifactSha256) throw new Error("RSS raw checksum mismatch.");
  const requestedAt = value.response.requestedAt;
  if (typeof requestedAt !== "string" || typeof value.researchQuestion.artifactRef !== "string") {
    throw new Error("RSS receipt is missing question or request time.");
  }
  const question = await loadRssQuestion(runRoot, value.researchQuestion.artifactRef, requestedAt);
  const prepared = prepareRssCollection(plan.value, catalogue.value, question, requestedAt);
  if (!prepared.ok) throw new Error(`RSS inputs rejected: ${prepared.error}`);
  const expectedRequest = {
    ...prepared.value, requestedAt,
    plan: { value: prepared.value.plan, binding: plan.binding },
    catalogue: catalogue.binding
  };
  if (!isDeepStrictEqual(request.value, expectedRequest) ||
      !isDeepStrictEqual(response.value, value.response)) throw new Error("RSS request/response binding mismatch.");
  // The comparison below validates every response field before it is treated as typed.
  const responseValue = response.value;
  if (!rssRecord(responseValue) || typeof responseValue.requestedAt !== "string" ||
      typeof responseValue.receivedAt !== "string" || typeof responseValue.finalUrl !== "string" ||
      !Array.isArray(responseValue.redirects) || !responseValue.redirects.every((v: unknown) => typeof v === "string") ||
      typeof responseValue.httpStatus !== "number" || typeof responseValue.mediaType !== "string" ||
      !(responseValue.etag === null || typeof responseValue.etag === "string") ||
      !(responseValue.lastModified === null || typeof responseValue.lastModified === "string")) {
    throw new Error("Invalid RSS response metadata.");
  }
  const typedResponse: RssResponse = {
    requestedAt: responseValue.requestedAt, receivedAt: responseValue.receivedAt,
    finalUrl: responseValue.finalUrl, redirects: responseValue.redirects,
    httpStatus: responseValue.httpStatus, mediaType: responseValue.mediaType,
    etag: responseValue.etag, lastModified: responseValue.lastModified
  };
  const reconstructed = createRssCapture(prepared.value, raw, typedResponse, {
    plan: plan.binding, catalogue: catalogue.binding, request: request.binding,
    response: response.binding, raw: rawBinding
  });
  if (!reconstructed.ok || !isDeepStrictEqual(reconstructed.value, value)) {
    throw new Error("RSS receipt does not match persisted inputs and raw feed.");
  }
  return { capture: reconstructed.value, artifact };
};

export const rawBindingFor = (path: string, bytes: Uint8Array): SourceArtifactLineage => ({
  artifactRef: artifactRef(path), artifactSha256: rssSha256(bytes)
});
