import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { matchRssArticle, rssPathId, rssRecord } from "../modules/collection/rss-capture.js";
import { selectSeeristFeature } from "../modules/intake/intake.js";
import { processSource } from "../workflow/process-source.js";
import { artifactRef, commandError, longPath, writeJsonOnce } from "./assurance-io.js";
import { loadRssCapture, loadRssRunArtifact, rssRunPath, rssRunRoot } from "./rss-io.js";

export const matchRss = async (args: string[], runRoot: string): Promise<string> => {
  const [capturePath, intakePath, ...extra] = args;
  if (!capturePath || !intakePath || extra.length) {
    throw new Error("Usage: npm run match:rss -- <rss-capture.json> <seerist-intake-result.json>");
  }
  const { capture, artifact } = await loadRssCapture(runRoot, capturePath);
  const intake = await loadRssRunArtifact(runRoot, intakePath);
  const value = intake.value;
  if (!rssRecord(value) || !rssRecord(value.item) || !rssRecord(value.ledgerEntry)) {
    throw new Error("Invalid Seerist lead intake.");
  }
  const item = value.item;
  if (item.provider !== "seerist" || item.role !== "collection_lead" ||
      !rssPathId(item.providerItemId) || typeof item.rawArtifactRef !== "string" ||
      typeof value.ledgerEntry.occurredAt !== "string") throw new Error("Input must be a persisted Seerist collection lead.");
  const raw = await loadRssRunArtifact(runRoot, item.rawArtifactRef);
  if (item.rawArtifactSha256 !== raw.binding.artifactSha256) throw new Error("Seerist raw checksum mismatch.");
  const selected = selectSeeristFeature(raw.value, item.providerItemId);
  if (!selected.ok) throw new Error(`Seerist lead selection failed: ${selected.error}`);
  const reconstructed = processSource(capture.runId, value.ledgerEntry.occurredAt, {
    provider: "seerist", endpoint: item.endpoint, retrievedAt: item.retrievedAt,
    rawArtifactRef: item.rawArtifactRef, rawArtifactSha256: item.rawArtifactSha256,
    collectionLineage: item.collectionLineage, researchQuestion: item.researchQuestion,
    item: selected.value
  });
  if (!reconstructed.ok || !isDeepStrictEqual(JSON.parse(JSON.stringify(reconstructed.value)), value) ||
      !isDeepStrictEqual(reconstructed.value.item.researchQuestion, capture.researchQuestion)) {
    throw new Error("Seerist lead does not match persisted provider data and RSS question lineage.");
  }
  const lead = reconstructed.value.item;
  if (lead.provider !== "seerist" || lead.role !== "collection_lead") throw new Error("RSS matching requires a Seerist lead.");
  const lineage = lead.collectionLineage;
  const request = await loadRssRunArtifact(runRoot, lineage.requestManifestRef);
  const response = await loadRssRunArtifact(runRoot, lineage.responseManifestRef);
  if (request.binding.artifactSha256 !== lineage.requestManifestSha256 ||
      response.binding.artifactSha256 !== lineage.responseManifestSha256 ||
      !rssRecord(request.value) || !rssRecord(request.value.operation) || !rssRecord(response.value) ||
      !isDeepStrictEqual(request.value.researchQuestion, capture.researchQuestion) ||
      request.value.operation.id !== lineage.operationId ||
      request.value.operation.runId !== capture.runId ||
      request.value.operation.researchQuestionId !== capture.researchQuestion.id ||
      request.value.operation.endpoint !== "/v1/wod" ||
      request.value.operation.provider !== "seerist" || request.value.operation.method !== "GET" ||
      request.value.requestedAt !== response.value.requestedAt ||
      typeof request.value.requestedAt !== "string" ||
      !Number.isFinite(Date.parse(request.value.requestedAt)) ||
      Date.parse(request.value.requestedAt) < Date.parse(capture.researchQuestion.approvedAt) ||
      Date.parse(request.value.requestedAt) > Date.parse(lead.retrievedAt) ||
      response.value.runId !== capture.runId || response.value.operationId !== lineage.operationId ||
      response.value.researchQuestionId !== capture.researchQuestion.id ||
      response.value.provider !== "seerist" || response.value.endpoint !== "/v1/wod" ||
      response.value.artifactRef !== raw.binding.artifactRef ||
      response.value.sha256 !== raw.binding.artifactSha256 ||
      response.value.receivedAt !== lead.retrievedAt ||
      typeof response.value.httpStatus !== "number" ||
      response.value.httpStatus < 200 || response.value.httpStatus >= 300) {
    throw new Error("Seerist collection manifests do not match the lead lineage.");
  }
  const result = matchRssArticle(capture.items, reconstructed.value.item.sourceLinks);
  const parent = resolve(runRoot, capture.runId, "rss-matches", capture.id);
  await mkdir(longPath(parent), { recursive: true });
  await rssRunPath(runRoot, parent);
  const path = resolve(parent, item.providerItemId + ".json");
  await writeJsonOnce(path, {
    schemaVersion: "rss-lead-match-v1", runId: capture.runId,
    occurredAt: new Date().toISOString(), sourceLeadProviderItemId: item.providerItemId,
    capture: artifact.binding, intake: intake.binding, ...result,
    limitation: "Identity match only; no relevance, admission, or pending_rss transition."
  });
  await appendFile(longPath(resolve(runRoot, "rss-events.jsonl")), JSON.stringify({
    runId: capture.runId, occurredAt: new Date().toISOString(), actorType: "controller",
    eventType: "rss.match.recorded", status: result.outcome, artifactRef: artifactRef(path)
  }) + "\n");
  return path;
};

const main = async (): Promise<void> => {
  const runRoot = rssRunRoot();
  try { console.log(`RSS match receipt: ${artifactRef(await matchRss(process.argv.slice(2), runRoot))}`); }
  catch (error) {
    const message = commandError(error);
    try {
      await mkdir(longPath(runRoot), { recursive: true });
      await appendFile(longPath(resolve(runRoot, "rss-events.jsonl")), JSON.stringify({
        occurredAt: new Date().toISOString(), actorType: "controller",
        eventType: "rss.match.failed", status: "failed", error: message
      }) + "\n");
    } catch (eventError) { console.error(`RSS event logging failed: ${commandError(eventError)}`); }
    console.error(`RSS match failed: ${message}`);
    process.exitCode = 1;
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
