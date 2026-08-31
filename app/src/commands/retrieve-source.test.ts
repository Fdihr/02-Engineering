import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

test("rejects an ineligible lead before reading Firecrawl credentials", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "source-retrieval-command-"));
  try {
    const sourceUrl = "https://example.invalid/article";
    const intakePath = resolve(tempRoot, "intake.json");
    await writeFile(
      intakePath,
      JSON.stringify({
        item: {
          provider: "seerist",
          providerItemId: "lead-1",
          sourceLinks: [sourceUrl],
          role: "collection_lead",
          researchQuestion: {}
        },
        decision: {
          providerItemId: "lead-1",
          role: "collection_lead",
          destination: "human_review",
          approvalStatus: "not_applicable"
        },
        ledgerEntry: {
          runId: "run-1",
          eventType: "intake.item.routed",
          status: "completed"
        }
      }),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/retrieve-source.ts"),
        intakePath,
        sourceUrl
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          FIRECRAWL_API_KEY: "",
          SOURCE_RETRIEVAL_RUN_DIR: resolve(tempRoot, "outputs")
        }
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LEAD_NOT_ROUTED_TO_RETRIEVAL/);
    assert.doesNotMatch(result.stderr, /FIRECRAWL_API_KEY is not configured/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});