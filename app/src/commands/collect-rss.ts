import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createRssCapture, prepareRssCollection, rssSha256
} from "../modules/collection/rss-capture.js";
import {
  artifactRef, commandError, loadJsonArtifact, longPath, writeJsonOnce
} from "./assurance-io.js";
import { fetchRssFeed } from "./rss-http.js";
import {
  loadRssQuestion, rawBindingFor, rssRunPath, rssRunRoot
} from "./rss-io.js";

const usage = "Usage: npm run collect:rss -- <rss-plan.json> <rss-feed-catalogue.json> <approved-research-question.json>";

export const collectRss = async (
  args: string[], runRoot: string, fetchFeed = fetchRssFeed
): Promise<string> => {
  const [planPath, cataloguePath, questionPath, ...extra] = args;
  if (!planPath || !cataloguePath || !questionPath || extra.length) throw new Error(usage);
  const requestedAt = new Date().toISOString();
  const plan = await loadJsonArtifact(resolve(planPath));
  const catalogue = await loadJsonArtifact(resolve(cataloguePath));
  const question = await loadRssQuestion(runRoot, questionPath, requestedAt);
  const prepared = prepareRssCollection(plan.value, catalogue.value, question, requestedAt);
  if (!prepared.ok) throw new Error(`RSS collection rejected: ${prepared.error}`);
  const parent = resolve(runRoot, prepared.value.plan.runId, "rss-captures");
  await mkdir(longPath(parent), { recursive: true });
  await rssRunPath(runRoot, parent);
  const directory = resolve(parent, prepared.value.plan.id);
  await mkdir(longPath(directory));
  const persistInput = async (source: typeof plan, name: string) => {
    const bytes = await readFile(longPath(source.path));
    if (rssSha256(bytes) !== source.binding.artifactSha256) throw new Error("RSS input changed during collection preparation.");
    const path = resolve(directory, name);
    await writeFile(longPath(path), bytes, { flag: "wx" });
    return rawBindingFor(path, bytes);
  };
  const planBinding = await persistInput(plan, "plan.json");
  const catalogueBinding = await persistInput(catalogue, "catalogue.json");
  const request = {
    ...prepared.value, requestedAt,
    plan: { value: prepared.value.plan, binding: planBinding },
    catalogue: catalogueBinding
  };
  const requestPath = resolve(directory, "request.json");
  await writeJsonOnce(requestPath, request);
  const requestBinding = (await loadJsonArtifact(requestPath)).binding;
  const eventLog = resolve(runRoot, "rss-events.jsonl");
  await appendFile(longPath(eventLog), JSON.stringify({
    runId: question.runId, collectionId: prepared.value.plan.id,
    occurredAt: requestedAt, actorType: "controller",
    eventType: "rss.collection.started", status: "started",
    artifactRef: artifactRef(requestPath)
  }) + "\n");
  const fetched = await fetchFeed(prepared.value.feed.url, requestedAt);
  const rawPath = resolve(directory, "raw-response.xml");
  await writeFile(longPath(rawPath), fetched.raw, { flag: "wx" });
  const responsePath = resolve(directory, "response.json");
  await writeJsonOnce(responsePath, fetched.response);
  const capture = createRssCapture(prepared.value, fetched.raw, fetched.response, {
    plan: planBinding, catalogue: catalogueBinding, request: requestBinding,
    response: (await loadJsonArtifact(responsePath)).binding,
    raw: rawBindingFor(rawPath, fetched.raw)
  });
  if (!capture.ok) throw new Error(`RSS response rejected: ${capture.error}; raw response retained.`);
  const capturePath = resolve(directory, "rss-capture.json");
  await writeJsonOnce(capturePath, capture.value);
  await appendFile(longPath(eventLog), JSON.stringify({
    runId: question.runId, collectionId: capture.value.id,
    occurredAt: fetched.response.receivedAt, actorType: "controller",
    eventType: "rss.collection.completed", status: "completed",
    itemCount: capture.value.items.length, artifactRef: artifactRef(capturePath)
  }) + "\n");
  return capturePath;
};

const main = async (): Promise<void> => {
  const runRoot = rssRunRoot();
  try {
    const path = await collectRss(process.argv.slice(2), runRoot);
    console.log(`RSS capture: ${artifactRef(path)}`);
    console.log("Status: captured feed snapshot; no evidence admitted.");
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(longPath(runRoot), { recursive: true });
      await appendFile(longPath(resolve(runRoot, "rss-events.jsonl")), JSON.stringify({
        occurredAt: new Date().toISOString(), actorType: "controller",
        eventType: "rss.collection.failed", status: "failed", error: message
      }) + "\n");
    } catch (eventError) { console.error(`RSS event logging failed: ${commandError(eventError)}`); }
    console.error(`RSS collection failed: ${message}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
