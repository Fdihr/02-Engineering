import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("rejects unapproved intent before reading provider credentials", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "seerist-collection-"));
  try {
    const operationPath = resolve(tempRoot, "operation.json");
    const questionPath = resolve(tempRoot, "question.json");
    await writeFile(
      operationPath,
      JSON.stringify({
        id: "seerist-command-test",
        runId: "research-run-test",
        researchQuestionId: "rq-command-test",
        provider: "seerist",
        method: "GET",
        endpoint: "/v1/wod",
        filters: { size: 1 }
      }),
      "utf8"
    );
    await writeFile(
      questionPath,
      JSON.stringify({
        id: "rq-command-test",
        runId: "research-run-test",
        scopeVersion: 1,
        question: "What cyber threats could disrupt wind-farm operations?",
        rationale: "Synthetic collection command test.",
        geographies: ["Northern Europe"],
        timeWindow: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-28T23:59:59.999Z"
        },
        status: "proposed"
      }),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/collect-seerist.ts"),
        operationPath,
        questionPath
      ],
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