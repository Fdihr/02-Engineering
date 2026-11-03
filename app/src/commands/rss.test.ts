import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { approveMemoScope } from "../modules/research/memo-scope.js";
import { approveResearchQuestion } from "../modules/research/research-question.js";
import { RSS_MAX_BYTES, rssSha256 } from "../modules/collection/rss-capture.js";
import { processSource } from "../workflow/process-source.js";
import { collectRss } from "./collect-rss.js";
import { matchRss } from "./match-rss.js";
import { artifactRef, loadJsonArtifact } from "./assurance-io.js";
import { loadRssCapture } from "./rss-io.js";
import { isPublicRssAddress, readRssBytes, rssRedirect } from "./rss-http.js";

test("RSS HTTP guards reject reserved addresses, unsafe redirects, oversized and truncated bodies", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "224.1.1.1", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1", "2002:7f00:1::"]) {
    assert.equal(isPublicRssAddress(ip), false, ip);
  }
  assert.equal(isPublicRssAddress("8.8.8.8"), true);
  assert.equal(isPublicRssAddress("2606:4700:4700::1111"), true);
  assert.equal(rssRedirect("https://public.org/feed", "/rss.xml", "https://public.org/feed"), "https://public.org/rss.xml");
  for (const url of ["https://other.org/rss", "http://public.org/rss", "https://127.0.0.1/rss", "file:///secret"]) {
    assert.throws(() => rssRedirect("https://public.org/feed", url, "https://public.org/feed"));
  }
  async function* chunks(...buffers: Buffer[]) { yield* buffers; }
  assert.equal((await readRssBytes(chunks(Buffer.from("a"), Buffer.from("b")), "2")).toString(), "ab");
  assert.equal((await readRssBytes(chunks(Buffer.alloc(RSS_MAX_BYTES)), String(RSS_MAX_BYTES))).length, RSS_MAX_BYTES);
  await assert.rejects(readRssBytes(chunks(Buffer.alloc(1)), String(RSS_MAX_BYTES + 1)), /byte limit/);
  await assert.rejects(readRssBytes(chunks(Buffer.alloc(RSS_MAX_BYTES), Buffer.alloc(1))), /byte limit/);
  await assert.rejects(readRssBytes(chunks(Buffer.from("a")), "2"), /truncated/);
});

const setup = async (root: string) => {
  const runRoot = resolve(root, "runs");
  const run = resolve(runRoot, "rss-test");
  await mkdir(run, { recursive: true });
  const scopePath = resolve(run, "scope.json");
  const scope = approveMemoScope({
    id: "scope-1", runId: "rss-test", version: 1, status: "proposed",
    purpose: { value: "Understand industrial incidents", origin: "human" },
    researchThesis: { value: "Industrial disruption merits research", origin: "human" },
    threatTopic: { value: "Industrial incidents", origin: "human" },
    audience: { value: "Leadership", origin: "human" },
    geographies: { value: ["Europe"], origin: "human" },
    timeWindow: { value: { from: "2026-01-01", to: "2026-12-31" }, origin: "human" }
  }, "test-operator", "2026-01-01T00:00:00Z");
  assert.ok(scope.ok, JSON.stringify(scope));
  await writeFile(scopePath, JSON.stringify(scope.value));
  const scopeArtifact = await loadJsonArtifact(scopePath);
  const questionPath = resolve(run, "question.json");
  const question = approveResearchQuestion({
    id: "rq-1", runId: "rss-test", scopeVersion: 1, status: "proposed",
    researchThesis: "Industrial disruption merits research",
    question: "Which industrial incidents occurred?", rationale: "Bounded test",
    geographies: ["Europe"], timeWindow: { from: "2026-01-01", to: "2026-12-31" }
  }, { ...scope.value, ...scopeArtifact.binding }, "test-operator", "2026-01-01T00:00:01Z");
  assert.ok(question.ok, JSON.stringify(question));
  await writeFile(questionPath, JSON.stringify(question.value));
  const planPath = resolve(root, "plan.json");
  await writeFile(planPath, JSON.stringify({
    schemaVersion: "rss-collection-plan-v1", id: "batch-1", runId: "rss-test",
    researchQuestionId: "rq-1", feedId: "industrial-cyber",
    selectionReason: "Bounded industrial incident research",
    permission: { reference: "test-only-permission", confirmedBy: "test-operator", confirmedAt: "2026-01-01T00:00:01Z" }
  }));
  const cataloguePath = resolve(root, "catalogue.json");
  await writeFile(cataloguePath, JSON.stringify({
    catalogueVersion: 2, feeds: [{
      id: "industrial-cyber", name: "Synthetic observed format",
      url: "https://industrialcyber.co/feed/", format: "rss"
    }]
  }));
  return { runRoot, run, scopePath, questionPath, planPath, cataloguePath };
};
const xml = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>' +
  '<item><title>Synthetic source</title><link>https://publisher.example/incident</link><guid>entry-1</guid><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate>' +
  '<description>Short lead</description><content:encoded><![CDATA[<p>A synthetic incident affected a factory in Europe.</p>]]></content:encoded></item>' +
  '<item><title>Lead only</title><link>https://publisher.example/lead</link><guid>entry-2</guid><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate><description>No captured article</description></item>' +
  '</channel></rss>'
);
const fakeFetch = async (url: string, requestedAt?: string) => ({
  raw: xml, response: {
    requestedAt: requestedAt ?? new Date().toISOString(), receivedAt: new Date().toISOString(),
    finalUrl: url, redirects: [], httpStatus: 200, mediaType: "application/rss+xml; charset=utf-8",
    etag: '"synthetic-etag"', lastModified: "Tue, 03 Nov 2026 10:00:00 GMT"
  }
});
const invoke = (command: string, args: string[], runRoot: string) => spawnSync(
  process.execPath, ["--import", "tsx", resolve("src", "commands", command), ...args],
  { encoding: "utf8", env: { ...process.env, RSS_RUN_DIR: runRoot, SOURCE_DOCUMENT_RUN_DIR: runRoot, QUESTION_RELEVANCE_RUN_DIR: runRoot } }
);

test("RSS capture persists raw provenance, reconstructs, canonicalizes and prepares relevance without approval", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "rss-command-"));
  try {
    const f = await setup(root);
    let calls = 0;
    const fetch = async (url: string, requestedAt?: string) => { calls++; return fakeFetch(url, requestedAt); };
    const capturePath = await collectRss([f.planPath, f.cataloguePath, f.questionPath], f.runRoot, fetch);
    assert.equal(calls, 1);
    const loaded = await loadRssCapture(f.runRoot, capturePath);
    assert.equal(loaded.capture.items.length, 2);
    assert.equal(loaded.capture.approvalStatus, "not_requested");
    const rawPath = resolve(loaded.capture.lineage.raw.artifactRef);
    assert.deepEqual(await readFile(rawPath), xml);
    await assert.rejects(collectRss([f.planPath, f.cataloguePath, f.questionPath], f.runRoot, fetch), /EEXIST/);
    assert.equal(calls, 1, "write-once guard must run before HTTP");
    const id = loaded.capture.items[0]!.id;
    const canonical = invoke("canonicalize-source.ts", [capturePath, id], f.runRoot);
    assert.equal(canonical.status, 0, canonical.stderr);
    assert.doesNotMatch(canonical.stdout, /factory in Europe/);
    const documentPath = resolve(canonical.stdout.match(/Output: (.+)/)?.[1]?.trim() ?? "missing");
    const relevance = invoke("prepare-question-relevance.ts", [documentPath], f.runRoot);
    assert.equal(relevance.status, 0, relevance.stderr);
    const requestPath = resolve(relevance.stdout.match(/Output: (.+)/)?.[1]?.trim() ?? "missing");
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.equal(request.sourceDocument.sourceKind, "rss-feed");
    assert.equal(request.researchQuestion.id, "rq-1");
    assert.ok(request.sourceLimitations.length);
    const segment = request.sourceDocument.segments[0];
    const responsePath = resolve(f.run, "synthetic-relevance-response.json");
    await writeFile(responsePath, JSON.stringify({
      schemaVersion: "question-relevance-copilot-poc-response-v1",
      requestId: request.id, invocationId: "synthetic-test-only",
      startedAt: new Date(Date.parse(request.preparedAt) + 1).toISOString(),
      completedAt: new Date(Date.parse(request.preparedAt) + 2).toISOString(),
      proposal: {
        verdict: "relevant", rationale: "Synthetic industrial incident is on topic.",
        support: [{
          anchor: {
            sourceDocumentId: request.sourceDocument.id,
            sourceDocumentArtifactRef: request.sourceDocumentArtifactRef,
            sourceDocumentArtifactSha256: request.sourceDocumentArtifactSha256,
            segmentId: segment.id, segmentSha256: segment.textSha256,
            quote: segment.text, quoteStartUtf8Byte: 0,
            quoteEndUtf8Byte: Buffer.byteLength(segment.text)
          },
          relationToQuestion: "Synthetic passage describes an industrial incident."
        }],
        limitations: ["Synthetic test data; not source assurance."]
      }
    }));
    const recorded = invoke("record-question-relevance.ts", [requestPath, responsePath], f.runRoot);
    assert.equal(recorded.status, 0, recorded.stderr);
    assert.match(recorded.stdout, /Destination: evidence_candidate_proposal/);
    assert.match(recorded.stdout, /Approval: pending_human_review/);
    const leadOnly = invoke("canonicalize-source.ts", [capturePath, loaded.capture.items[1]!.id], f.runRoot);
    assert.notEqual(leadOnly.status, 0);
    assert.match(leadOnly.stderr, /RSS_ITEM_IS_LEAD_ONLY/);
    const noId = invoke("canonicalize-source.ts", [capturePath], f.runRoot);
    assert.notEqual(noId.status, 0);
    const receipt = JSON.parse(await readFile(capturePath, "utf8"));
    receipt.items[0].body = "Tampered";
    await writeFile(capturePath, JSON.stringify(receipt));
    await assert.rejects(loadRssCapture(f.runRoot, capturePath), /does not match/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("RSS checks approvals and scope checksums before HTTP, and retains rejected response bytes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "rss-gates-"));
  try {
    const f = await setup(root);
    let calls = 0;
    const fetch = async (url: string, requestedAt?: string) => { calls++; return fakeFetch(url, requestedAt); };
    const originalScope = await readFile(f.scopePath);
    await writeFile(f.scopePath, originalScope.toString() + "\n");
    await assert.rejects(collectRss([f.planPath, f.cataloguePath, f.questionPath], f.runRoot, fetch), /scope checksum/);
    assert.equal(calls, 0);
    await writeFile(f.scopePath, originalScope);
    await assert.rejects(collectRss([f.planPath, f.cataloguePath, f.questionPath], f.runRoot,
      async (url, at) => ({ ...await fakeFetch(url, at), raw: Buffer.from("<bad>") })), /RSS_INVALID_XML/);
    const rawPath = resolve(f.run, "rss-captures", "batch-1", "raw-response.xml");
    assert.equal(await readFile(rawPath, "utf8"), "<bad>");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("RSS reload verifies raw checksums, request bindings, scope and path confinement", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "rss-tamper-"));
  try {
    const f = await setup(root);
    const path = await collectRss([f.planPath, f.cataloguePath, f.questionPath], f.runRoot, fakeFetch);
    const { capture } = await loadRssCapture(f.runRoot, path);
    const rawPath = resolve(capture.lineage.raw.artifactRef);
    await writeFile(rawPath, Buffer.concat([xml, Buffer.from(" ")]));
    await assert.rejects(loadRssCapture(f.runRoot, path), /raw checksum/);
    await writeFile(rawPath, xml);
    const requestPath = resolve(capture.lineage.request.artifactRef);
    await writeFile(requestPath, "{}");
    await assert.rejects(loadRssCapture(f.runRoot, path), /checksum/);
    const outside = resolve(root, "outside.json");
    await writeFile(outside, "{}");
    await assert.rejects(loadRssCapture(f.runRoot, outside), /inside the configured run/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("verified Seerist lead matches exact RSS item without rewriting its pending route", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "rss-match-"));
  try {
    const f = await setup(root);
    const path = await collectRss([f.planPath, f.cataloguePath, f.questionPath], f.runRoot, fakeFetch);
    const { capture } = await loadRssCapture(f.runRoot, path);
    const rawPath = resolve(f.run, "seerist-raw.json");
    const feature = { type: "Feature", properties: {
      id: "lead-1", source: "news", title: "Not used for matching",
      link: "https://publisher.example/incident"
    } };
    await writeFile(rawPath, JSON.stringify({ features: [feature] }));
    const raw = await loadJsonArtifact(rawPath);
    const requestPath = resolve(f.run, "seerist-request.json");
    const responsePath = resolve(f.run, "seerist-response.json");
    const requestedAt = "2026-11-03T10:01:00Z";
    const receivedAt = "2026-11-03T10:01:01Z";
    await writeFile(requestPath, JSON.stringify({
      operation: { id: "op-1", runId: "rss-test", researchQuestionId: "rq-1", provider: "seerist", method: "GET", endpoint: "/v1/wod" },
      researchQuestion: capture.researchQuestion, requestedAt
    }));
    await writeFile(responsePath, JSON.stringify({
      runId: "rss-test", operationId: "op-1", researchQuestionId: "rq-1", provider: "seerist",
      endpoint: "/v1/wod", httpStatus: 200, requestedAt, receivedAt,
      artifactRef: raw.binding.artifactRef, sha256: raw.binding.artifactSha256
    }));
    const request = await loadJsonArtifact(requestPath);
    const response = await loadJsonArtifact(responsePath);
    const intake = processSource("rss-test", receivedAt, {
      provider: "seerist", endpoint: "/v1/wod", retrievedAt: receivedAt,
      rawArtifactRef: raw.binding.artifactRef, rawArtifactSha256: raw.binding.artifactSha256,
      collectionLineage: {
        operationId: "op-1", requestManifestRef: request.binding.artifactRef, requestManifestSha256: request.binding.artifactSha256,
        responseManifestRef: response.binding.artifactRef, responseManifestSha256: response.binding.artifactSha256,
        rawArtifactRef: raw.binding.artifactRef, rawArtifactSha256: raw.binding.artifactSha256
      },
      researchQuestion: capture.researchQuestion, item: feature
    });
    assert.ok(intake.ok, JSON.stringify(intake));
    const intakePath = resolve(f.run, "intake.json");
    await writeFile(intakePath, JSON.stringify(intake.value));
    const before = await readFile(intakePath);
    const matchPath = await matchRss([path, intakePath], f.runRoot);
    const match = JSON.parse(await readFile(matchPath, "utf8"));
    assert.equal(match.outcome, "matched");
    assert.equal(match.capturedContentAvailable, true);
    assert.deepEqual(await readFile(intakePath), before);
    await writeFile(rawPath, "{}");
    await assert.rejects(matchRss([path, intakePath], f.runRoot), /raw checksum/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
