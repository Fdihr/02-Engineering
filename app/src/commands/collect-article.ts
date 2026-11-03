import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createArticleCapture, prepareArticle } from "../modules/collection/article-capture.js";
import { rssSha256 } from "../modules/collection/rss-capture.js";
import { artifactRef, commandError, loadJsonArtifact, longPath, writeJsonOnce } from "./assurance-io.js";
import { fetchRssFeed } from "./rss-http.js";
import { loadRssQuestion, rawBindingFor, rssRunPath } from "./rss-io.js";
import { loadArticleCapture } from "./article-io.js";

export const articleRunRoot = () => resolve(process.env.ARTICLE_RUN_DIR ?? "runs");

const fetchArticle = (url: string, requestedAt: string) => fetchRssFeed(url, requestedAt, "text/html");

export const collectArticle = async (
  args: string[], root: string, fetchPage = fetchArticle
): Promise<string> => {
  const [planPath, questionPath, ...extra] = args;
  if (!planPath || !questionPath || extra.length) throw new Error("Usage: collect:article -- <approved-article-plan.json> <approved-question.json>");
  const requestedAt = new Date().toISOString();
  const planArtifact = await loadJsonArtifact(resolve(planPath));
  const question = await loadRssQuestion(root, questionPath, requestedAt);
  const plan = prepareArticle(planArtifact.value, question, requestedAt);
  if (!plan.ok) throw new Error(plan.error);
  const parent = resolve(root, question.runId, "article-captures");
  await mkdir(longPath(parent), { recursive: true });
  await rssRunPath(root, parent);
  const directory = resolve(parent, plan.value.id);
  await mkdir(longPath(directory)); // Reserve the one-fetch plan before any network operation.
  const events = resolve(root, "article-events.jsonl");
  try {
    const planBytes = await readFile(longPath(planArtifact.path));
    if (rssSha256(planBytes) !== planArtifact.binding.artifactSha256) throw new Error("Article plan changed during preparation.");
    const persistedPlan = resolve(directory, "plan.json");
    await writeFile(longPath(persistedPlan), planBytes, { flag: "wx" });
    const planBinding = rawBindingFor(persistedPlan, planBytes);
    const requestPath = resolve(directory, "request.json");
    await writeJsonOnce(requestPath, { plan: plan.value, planBinding, researchQuestion: question, requestedAt });
    await appendFile(longPath(events), JSON.stringify({
      runId: question.runId, articleId: plan.value.id, occurredAt: requestedAt,
      actorType: "controller", eventType: "article.collection.started", status: "started",
      artifactRef: artifactRef(requestPath)
    }) + "\n");
    // Reuse the RSS transport's public-DNS, same-origin redirects, 8 MiB and 20s limits.
    const fetched = await fetchPage(plan.value.url, requestedAt);
    const rawPath = resolve(directory, "raw-response.html");
    await writeFile(longPath(rawPath), fetched.raw, { flag: "wx" });
    const responsePath = resolve(directory, "response.json");
    await writeJsonOnce(responsePath, fetched.response);
    const result = createArticleCapture(plan.value, question, fetched.raw, fetched.response, {
      plan: planBinding, request: (await loadJsonArtifact(requestPath)).binding,
      response: (await loadJsonArtifact(responsePath)).binding, raw: rawBindingFor(rawPath, fetched.raw)
    });
    if (!result.ok) throw new Error(`${result.error}; raw response retained.`);
    const output = resolve(directory, "article-capture.json");
    await writeJsonOnce(output, result.value);
    await appendFile(longPath(events), JSON.stringify({
      runId: question.runId, articleId: plan.value.id, occurredAt: fetched.response.receivedAt,
      actorType: "controller", eventType: "article.collection.completed", status: "completed",
      artifactRef: artifactRef(output)
    }) + "\n");
    return output;
  } catch (error) {
    await writeJsonOnce(resolve(directory, "failure.json"), { at: new Date().toISOString(), error: commandError(error) });
    await appendFile(longPath(events), JSON.stringify({
      runId: question.runId, articleId: plan.value.id, occurredAt: new Date().toISOString(),
      actorType: "controller", eventType: "article.collection.failed", status: "failed", error: commandError(error)
    }) + "\n");
    throw error;
  }
};

export const reextractArticle = async (root: string, receiptPath: string): Promise<string> => {
  const { capture } = await loadArticleCapture(root, receiptPath);
  const raw = await readFile(longPath(await rssRunPath(root, capture.lineage.raw.artifactRef)));
  const result = createArticleCapture(capture.plan, capture.researchQuestion, raw, capture.response, capture.lineage);
  if (!result.ok) throw new Error(result.error);
  const path = resolve(dirname(receiptPath), "article-capture-v2.json");
  await writeJsonOnce(path, result.value);
  await appendFile(longPath(resolve(root, "article-events.jsonl")), JSON.stringify({
    runId: capture.runId, articleId: capture.id, occurredAt: new Date().toISOString(),
    actorType: "controller", eventType: "article.extraction.updated", status: "completed",
    artifactRef: artifactRef(path), previousReceipt: artifactRef(resolve(receiptPath)), networkRequests: 0
  }) + "\n");
  return path;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "reextract" && args.length !== 2) throw new Error("Usage: collect:article -- reextract <preserved-article-capture.json>");
    const path = args[0] === "reextract" && args[1]
      ? await reextractArticle(articleRunRoot(), args[1])
      : await collectArticle(args, articleRunRoot());
    console.log(`Output: ${artifactRef(path)}`);
  }
  catch (error) { console.error(`Article collection failed: ${commandError(error)}`); process.exitCode = 1; }
}
