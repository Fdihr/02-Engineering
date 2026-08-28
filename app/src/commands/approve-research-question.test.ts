import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("writes one approved question artifact and refuses to overwrite it", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "research-question-"));
  try {
    const proposalPath = resolve(tempRoot, "proposal.json");
    const outputRoot = resolve(tempRoot, "outputs");
    await writeFile(
      proposalPath,
      JSON.stringify({
        id: "rq-command-test",
        runId: "research-run-test",
        scopeVersion: 1,
        question: "What cyber threats could disrupt wind-farm operations?",
        rationale: "Bound synthetic command test.",
        geographies: ["Northern Europe"],
        timeWindow: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-28T23:59:59.999Z"
        },
        status: "proposed"
      }),
      "utf8"
    );
    await mkdir(outputRoot);

    const args = [
      "--import",
      "tsx",
      resolve("src/commands/approve-research-question.ts"),
      proposalPath,
      "analyst-test"
    ];
    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RESEARCH_RUN_DIR: outputRoot }
    });

    assert.equal(first.status, 0, first.stderr);
    const questionDirectory = resolve(
      outputRoot,
      "research-run-test",
      "research-questions",
      "rq-command-test"
    );
    const approved = JSON.parse(
      await readFile(resolve(questionDirectory, "approved-research-question.json"), "utf8")
    ) as Record<string, unknown>;
    const summary = await readFile(
      resolve(questionDirectory, "approved-research-question-summary.md"),
      "utf8"
    );
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedBy, "analyst-test");
    assert.match(summary, /What cyber threats could disrupt wind-farm operations\?/);
    assert.match(summary, /read-only/i);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RESEARCH_RUN_DIR: outputRoot }
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Research-question approval failed/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});