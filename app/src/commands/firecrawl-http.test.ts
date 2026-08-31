import assert from "node:assert/strict";
import test from "node:test";
import {
  FIRECRAWL_MAX_RESPONSE_BYTES,
  FIRECRAWL_SCRAPE_ENDPOINT,
  createFirecrawlScrapeRequest
} from "../modules/retrieval/firecrawl-retrieval.js";
import type { PreparedSourceRetrieval } from "../modules/retrieval/source-retrieval.js";
import { requestFirecrawlScrape } from "./firecrawl-http.js";

const prepared = {
  runId: "run-1",
  providerItemId: "lead-1",
  sourceUrl: "https://news.example/article",
  attemptedAt: "2026-08-28T09:00:00.000Z",
  researchQuestion: {}
} as PreparedSourceRetrieval;

test("posts only the constrained request to the fixed Firecrawl endpoint", async () => {
  let observedInput: string | URL | Request | undefined;
  let observedInit: RequestInit | undefined;
  const response = await requestFirecrawlScrape(
    "synthetic-secret",
    createFirecrawlScrapeRequest(prepared),
    async (input, init) => {
      observedInput = input;
      observedInit = init;
      return new Response('{"success":false,"error":"synthetic"}', {
        status: 429,
        headers: { "content-type": "application/json" }
      });
    }
  );

  assert.equal(observedInput, FIRECRAWL_SCRAPE_ENDPOINT);
  assert.equal(observedInit?.method, "POST");
  assert.equal(observedInit?.redirect, "error");
  assert.equal(
    (observedInit?.headers as Record<string, string>).authorization,
    "Bearer synthetic-secret"
  );
  const body = JSON.parse(String(observedInit?.body)) as Record<string, unknown>;
  assert.deepEqual(body.formats, ["markdown"]);
  assert.equal(body.skipTlsVerification, false);
  assert.equal(body.storeInCache, false);
  assert.equal(body.maxAge, 0);
  assert.equal("actions" in body, false);
  assert.equal("headers" in body, false);
  assert.equal("profile" in body, false);
  assert.equal("prompt" in body, false);
  assert.equal(response.status, 429);
});

test("rejects a declared oversized response before reading it", async () => {
  await assert.rejects(
    requestFirecrawlScrape(
      "synthetic-secret",
      createFirecrawlScrapeRequest(prepared),
      async () =>
        new Response("not read", {
          headers: {
            "content-length": String(FIRECRAWL_MAX_RESPONSE_BYTES + 1)
          }
        })
    ),
    /response exceeds/i
  );
});