import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("writes approved artifacts once and refuses to overwrite them", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "evidence-review-"));
  try {
    const rawPath = resolve(tempRoot, "raw-response.json");
    const intakePath = resolve(tempRoot, "intake-result.json");
    const outputRoot = resolve(tempRoot, "outputs");
    const rawContent = JSON.stringify({ synthetic: "captured source" });
    await writeFile(rawPath, rawContent, "utf8");
    await writeFile(
      intakePath,
      JSON.stringify({
        item: {
          provider: "seerist",
          endpoint: "/v1/wod",
          providerItemId: "synthetic-001",
          sourceType: "analysis",
          retrievedAt: "2026-08-28T08:55:45.000Z",
          rawArtifactRef: rawPath,
          sourceLinks: [],
          referenceCount: 0,
          hasSourceMetadata: false,
          researchQuestion: {
            id: "rq-001",
            runId: "research-run-001",
            scopeVersion: 1,
            question: "What developments could affect operational continuity?",
            rationale: "Bound synthetic command test.",
            geographies: ["Global"],
            timeWindow: {
              from: "2026-08-01T00:00:00.000Z",
              to: "2026-08-28T23:59:59.999Z"
            },
            status: "approved",
            approvedBy: "analyst-test",
            approvedAt: "2026-08-27T10:00:00.000Z",
            artifactRef: "runs/research-run-001/approved-research-question.json",
            artifactSha256: "a".repeat(64)
          },
          role: "evidence_candidate",
          contentCompleteness: "captured_content"
        },
        decision: {
          providerItemId: "synthetic-001",
          role: "evidence_candidate",
          destination: "human_review",
          approvalStatus: "pending_human_review",
          ruleId: "RULE-EVIDENCE-REVIEW-001",
          reason: "Synthetic test route"
        },
        ledgerEntry: {
          runId: "synthetic-intake-001",
          occurredAt: "2026-08-28T09:00:00.000Z",
          eventType: "intake.item.routed",
          status: "completed",
          artifactRef: rawPath
        }
      }),
      "utf8"
    );
    await mkdir(outputRoot);

    const args = [
      "--import",
      "tsx",
      resolve("src/commands/review-evidence.ts"),
      intakePath,
      "approve",
      "analyst-test",
      "Synthetic command approval.",
      "review-command-test"
    ];
    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EVIDENCE_RUN_DIR: outputRoot }
    });

    assert.equal(first.status, 0, first.stderr);
    const reviewDirectory = resolve(outputRoot, "review-command-test");
    const decision = JSON.parse(
      await readFile(resolve(reviewDirectory, "evidence-decision.json"), "utf8")
    ) as Record<string, unknown>;
    const snapshot = JSON.parse(
      await readFile(resolve(reviewDirectory, "approved-evidence-snapshot.json"), "utf8")
    ) as Record<string, unknown>;
    const summary = await readFile(
      resolve(reviewDirectory, "evidence-decision-summary.md"),
      "utf8"
    );
    assert.equal(decision.decision, "approved");
    assert.equal(
      snapshot.rawArtifactSha256,
      createHash("sha256").update(rawContent).digest("hex")
    );
    assert.match(summary, /read-only/i);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EVIDENCE_RUN_DIR: outputRoot }
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Evidence review failed/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});