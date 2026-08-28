import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("rejects an unapproved discovery plan before provider credentials", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "seerist-discovery-"));
  try {
    const planPath = resolve(tempRoot, "plan.json");
    const questionPath = resolve(tempRoot, "question.json");
    await writeFile(
      planPath,
      JSON.stringify({
        id: "discovery-command-test",
        runId: "run-test",
        researchQuestionId: "rq-test",
        provider: "seerist",
        endpoint: "/v1/wod",
        queries: [{ id: "person", search: "John Ratcliffe", sources: "news" }],
        rankingTerms: ["John Ratcliffe", "CIA Director"],
        pageSize: 20,
        maxPagesPerQuery: 1,
        maxApiCalls: 1,
        maxResults: 20,
        minimumScore: 3
      }),
      "utf8"
    );
    await writeFile(
      questionPath,
      JSON.stringify({
        id: "rq-test",
        runId: "run-test",
        scopeVersion: 1,
        question: "What confirms the reported visit?",
        rationale: "Synthetic command test.",
        geographies: ["Russia"],
        timeWindow: {
          from: "2026-08-25T00:00:00.000Z",
          to: "2026-08-28T23:59:59.999Z"
        },
        status: "proposed"
      }),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve("src/commands/discover-seerist.ts"), planPath, questionPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SEERIST_API_KEY: "",
          SEERIST_RUN_DIR: resolve(tempRoot, "outputs")
        }
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /RESEARCH_QUESTION_NOT_APPROVED/);
    assert.doesNotMatch(result.stderr, /SEERIST_API_KEY is not configured/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});