import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("writes one approved question artifact and refuses to overwrite it", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "research-question-"));
  try {
    const proposalPath = resolve(tempRoot, "proposal.json");
    const scopeProposalPath = resolve(tempRoot, "scope-proposal.json");
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
    await writeFile(
      scopeProposalPath,
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
        status: "proposed"
      }),
      "utf8"
    );
    await mkdir(outputRoot);

    const env = { ...process.env, RESEARCH_RUN_DIR: outputRoot };
    const scopeApproval = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/approve-memo-scope.ts"),
        scopeProposalPath,
        "analyst-test"
      ],
      { cwd: process.cwd(), encoding: "utf8", env }
    );
    assert.equal(scopeApproval.status, 0, scopeApproval.stderr);
    const scopePath = resolve(
      outputRoot,
      "research-run-test",
      "memo-scopes",
      "scope-command-test",
      "v1",
      "approved-memo-scope.json"
    );

    const args = [
      "--import",
      "tsx",
      resolve("src/commands/approve-research-question.ts"),
      proposalPath,
      scopePath,
      "analyst-test"
    ];
    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env
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
    const scopeLineage = approved.scopeApproval as Record<string, unknown>;
    assert.equal(scopeLineage.scopeId, "scope-command-test");
    assert.equal(scopeLineage.scopeVersion, 1);
    assert.equal(
      scopeLineage.artifactRef,
      relative(process.cwd(), scopePath).replaceAll("\\", "/")
    );
    assert.match(String(scopeLineage.artifactSha256), /^[a-f0-9]{64}$/);
    assert.match(summary, /What cyber threats could disrupt wind-farm operations\?/);
    assert.match(summary, /read-only/i);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Research-question approval failed/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});