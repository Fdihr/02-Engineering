import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

test("writes one approved memo scope and refuses to overwrite it", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "memo-scope-"));
  try {
    const proposalPath = resolve(tempRoot, "scope-proposal.json");
    const outputRoot = resolve(tempRoot, "outputs");
    await writeFile(
      proposalPath,
      JSON.stringify({
        id: "scope-command-test",
        runId: "research-run-test",
        version: 1,
        purpose: { value: "Assess operational continuity risk.", origin: "human" },
        threatTopic: { value: "Cyber threats", origin: "human" },
        audience: { value: "Strategic risk leadership", origin: "human" },
        geographies: { value: ["Northern Europe"], origin: "human" },
        timeWindow: {
          value: {
            from: "2026-07-01T00:00:00.000Z",
            to: "2026-08-31T23:59:59.999Z"
          },
          origin: "human"
        },
        requestedOutput: { value: "memo", origin: "human" },
        status: "proposed"
      }),
      "utf8"
    );
    await mkdir(outputRoot);
    const args = [
      "--import",
      "tsx",
      resolve("src/commands/approve-memo-scope.ts"),
      proposalPath,
      "analyst-test"
    ];
    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RESEARCH_RUN_DIR: outputRoot }
    });

    assert.equal(first.status, 0, first.stderr);
    const scopeDirectory = resolve(
      outputRoot,
      "research-run-test",
      "memo-scopes",
      "scope-command-test",
      "v1"
    );
    const approved = JSON.parse(
      await readFile(resolve(scopeDirectory, "approved-memo-scope.json"), "utf8")
    ) as Record<string, unknown>;
    const summary = await readFile(
      resolve(scopeDirectory, "approved-memo-scope-summary.md"),
      "utf8"
    );
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedBy, "analyst-test");
    assert.match(summary, /Assess operational continuity risk\./);
    assert.match(summary, /read-only/i);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RESEARCH_RUN_DIR: outputRoot }
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Memo-scope approval failed/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});