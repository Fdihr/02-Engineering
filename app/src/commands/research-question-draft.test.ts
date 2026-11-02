import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

test("prepares and records a thesis-aligned research-question proposal", async () => {
  const runRoot = await mkdtemp(resolve(tmpdir(), "research-question-draft-"));
  try {
    const scopeDirectory = resolve(runRoot, "run-1", "memo-scopes", "scope-1");
    await mkdir(scopeDirectory, { recursive: true });
    const scopePath = resolve(scopeDirectory, "approved-memo-scope.json");
    const scope = {
      id: "scope-1",
      runId: "run-1",
      version: 1,
      purpose: { value: "Assess operational continuity risk.", origin: "human" },
      researchThesis: {
        value: "Third-party operational dependencies are a more likely disruption path than direct attacks.",
        origin: "human"
      },
      threatTopic: { value: "Cyber threats", origin: "human" },
      audience: { value: "Risk leadership", origin: "human" },
      geographies: { value: ["Northern Europe"], origin: "human" },
      timeWindow: {
        value: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-31T23:59:59.999Z"
        },
        origin: "human"
      },
      status: "approved",
      approvedBy: "analyst-1",
      approvedAt: "2026-06-30T10:00:00.000Z"
    };
    await writeFile(scopePath, JSON.stringify(scope, null, 2), "utf8");
    const env = { ...process.env, RESEARCH_RUN_DIR: runRoot };
    const prepare = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/prepare-research-question.ts"),
        scopePath
      ],
      { cwd: process.cwd(), encoding: "utf8", env }
    );
    assert.equal(prepare.status, 0, prepare.stderr);
    const requestPath = resolve(
      prepare.stdout.match(/Output: (.+research-question-draft-request\.json)/)?.[1] ??
        "missing"
    );
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.match(request.prompt.user, /Third-party operational dependencies/);

    const responsePath = resolve(requestPath, "..", "copilot-response.json");
    await writeFile(
      responsePath,
      JSON.stringify({
        schemaVersion: "research-question-draft-copilot-response-v1",
        provider: "github-copilot-vscode",
        requestId: request.id,
        invocationId: "copilot-invocation-1",
        startedAt: request.preparedAt,
        completedAt: request.preparedAt,
        proposal: {
          question: "How do third-party attacks affect continuity?",
          rationale: "This question directly tests the thesis within the approved scope."
        }
      }),
      "utf8"
    );
    const record = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/record-research-question-draft.ts"),
        requestPath,
        responsePath
      ],
      { cwd: process.cwd(), encoding: "utf8", env }
    );
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, /Status: proposed/);
    assert.match(record.stdout, /approve:question/);
    const proposalPath = resolve(
      record.stdout.match(/Output: (.+proposed-research-question\.json)/)?.[1] ??
        "missing"
    );
    const proposal = JSON.parse(await readFile(proposalPath, "utf8"));
    assert.equal(proposal.status, "proposed");
    assert.equal(proposal.researchThesis, scope.researchThesis.value);
    assert.deepEqual(proposal.geographies, ["Northern Europe"]);
    assert.equal(
      proposal.timeWindow.to,
      "2026-08-31T23:59:59.999Z"
    );
    const approval = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/approve-research-question.ts"),
        proposalPath,
        scopePath,
        "analyst-1"
      ],
      { cwd: process.cwd(), encoding: "utf8", env }
    );
    assert.equal(approval.status, 0, approval.stderr);
    const approvedPath = resolve(
      approval.stdout.match(/Output: (.+approved-research-question\.json)/)?.[1] ??
        "missing"
    );
    const approved = JSON.parse(await readFile(approvedPath, "utf8"));
    assert.equal(approved.status, "approved");
    assert.equal(approved.researchThesis, scope.researchThesis.value);
    const summaryPath = resolve(approvedPath, "..", "approved-research-question-summary.md");
    assert.match(await readFile(summaryPath, "utf8"), /Research thesis/);
    const events = await readFile(resolve(runRoot, "research-events.jsonl"), "utf8");
    assert.match(events, /research\.question\.draft\.proposed/);
    assert.match(events, /research\.question\.draft\.validated/);
    const eventEntries = events
      .trim()
      .split("\n")
      .map((entry) => JSON.parse(entry));
    const preparedEvent = eventEntries.find(
      (entry) => entry.eventType === "research.question.draft.request.prepared"
    );
    const proposedEvent = eventEntries.find(
      (entry) => entry.eventType === "research.question.draft.proposed"
    );
    assert.equal(preparedEvent.artifactSha256, sha256(await readFile(requestPath)));
    assert.equal(
      proposedEvent.responseArtifactSha256,
      sha256(await readFile(responsePath))
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});
