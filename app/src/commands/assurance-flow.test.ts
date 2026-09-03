import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import test from "node:test";
import { createSourceDocument } from "../modules/source/source-document.js";

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const writeJson = async (path: string, value: unknown): Promise<string> => {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, contents, "utf8");
  return sha256(Buffer.from(contents, "utf8"));
};

const run = (script: string, args: string[], runRoot: string) =>
  spawnSync(
    process.execPath,
    ["--import", "tsx", resolve(`src/commands/${script}.ts`), ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, SOURCE_ASSURANCE_RUN_DIR: runRoot }
    }
  );

const outputPath = (stdout: string): string => {
  const match = stdout.match(/Output: (.+)/);
  if (!match?.[1]) {
    throw new Error(`No output path in: ${stdout}`);
  }
  return resolve(match[1].trim());
};

test("runs one admitted source through the source-assurance commands", async () => {
  const runRoot = await mkdtemp(resolve(tmpdir(), "assurance-flow-"));
  try {
    const runId = "run-1";
    const decisionId = "decision-1";
    const questionDir = resolve(runRoot, runId, "research-questions", "rq-test-001");
    const sourceDir = resolve(runRoot, runId, "sources", "source-1");
    const decisionDir = resolve(runRoot, decisionId);
    const requirementsDir = resolve(runRoot, runId, "requirements");
    await mkdir(questionDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await mkdir(decisionDir, { recursive: true });
    await mkdir(requirementsDir, { recursive: true });

    const questionPath = resolve(questionDir, "approved-research-question.json");
    const questionArtifact = {
      id: "rq-test-001",
      runId,
      scopeVersion: 1,
      question: "Did the ministry announce a formal review?",
      rationale: "Establish whether a review was announced.",
      geographies: ["Testland"],
      timeWindow: {
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-31T00:00:00.000Z"
      },
      status: "approved",
      approvedBy: "TESTER",
      approvedAt: "2026-03-05T00:00:00.000Z"
    };
    const questionSha256 = await writeJson(questionPath, questionArtifact);

    const documentResult = createSourceDocument({
      runId,
      sourceItemId: "source-1",
      sourceKind: "retrieved-publisher",
      contentFormat: "markdown",
      body: [
        "The ministry announced a formal review on 4 March.",
        "",
        "A spokesperson said the review would continue through spring."
      ].join("\n"),
      sourceArtifactRef: `${artifactRef(runRoot)}/${runId}/retrieval.json`,
      sourceArtifactSha256: "c".repeat(64),
      lineageArtifactRefs: []
    });
    assert.equal(documentResult.ok, true);
    if (!documentResult.ok) {
      return;
    }
    const documentPath = resolve(sourceDir, "source-document.json");
    const documentSha256 = await writeJson(documentPath, documentResult.value);

    const embeddedQuestion = {
      ...questionArtifact,
      artifactRef: artifactRef(questionPath),
      artifactSha256: questionSha256
    };
    const snapshotPath = resolve(decisionDir, "approved-evidence-snapshot.json");
    await writeJson(resolve(decisionDir, "evidence-decision.json"), {
      id: decisionId,
      sourceRunId: runId,
      providerItemId: "candidate-1",
      reviewerId: "TESTER",
      decidedAt: "2026-03-06T00:00:00.000Z",
      decision: "approved",
      reason: "it fits",
      intakeArtifactRef: `${artifactRef(runRoot)}/${runId}/intake-result.json`
    });
    await writeJson(snapshotPath, {
      snapshotId: `snapshot-${decisionId}`,
      sourceDecisionId: decisionId,
      sourceRunId: runId,
      providerItemId: "candidate-1",
      admittedBy: "TESTER",
      admittedAt: "2026-03-06T00:00:00.000Z",
      intakeArtifactRef: `${artifactRef(runRoot)}/${runId}/intake-result.json`,
      rawArtifactRef: `${artifactRef(runRoot)}/${runId}/raw.json`,
      rawArtifactSha256: "b".repeat(64),
      item: {
        role: "evidence_candidate",
        providerItemId: "candidate-1",
        contentCompleteness: "captured_content",
        limitations: ["Retrieved content remains untrusted."],
        researchQuestion: embeddedQuestion,
        questionRelevance: {
          assessment: {
            researchQuestionId: "rq-test-001",
            sourceDocumentArtifactRef: artifactRef(documentPath),
            sourceDocumentArtifactSha256: documentSha256
          }
        }
      }
    });

    const proposalPath = resolve(requirementsDir, "req-proposal-1-proposal.json");
    await writeJson(proposalPath, {
      proposalId: "req-proposal-1",
      questionId: "rq-test-001",
      runId,
      requirements: [
        { irId: "ir-01", text: "Was a review announced?" },
        { irId: "ir-02", text: "How long will the review continue?" }
      ]
    });

    const approval = run(
      "approve-requirements",
      [proposalPath, questionPath, "TESTER"],
      runRoot
    );
    assert.equal(approval.status, 0, approval.stderr);
    const requirementsPath = outputPath(approval.stdout);

    const policyPath = resolve(
      "src/modules/assurance/policies/geopolitical-source-assurance-v1.json"
    );
    const prepare = run(
      "prepare-assurance-extract",
      [snapshotPath, requirementsPath, policyPath],
      runRoot
    );
    assert.equal(prepare.status, 0, prepare.stderr);
    const requestPath = outputPath(prepare.stdout);
    const request = JSON.parse(await readFile(requestPath, "utf8")) as {
      id: string;
      preparedAt: string;
      prompt: { system: string; user: string };
      feedback: unknown;
    };
    assert.equal(request.feedback, null);
    assert.match(request.prompt.user, /ir-01/);
    assert.match(request.prompt.user, /\[segment 01\]/);

    const secondPrepare = run(
      "prepare-assurance-extract",
      [snapshotPath, requirementsPath, policyPath],
      runRoot
    );
    assert.notEqual(secondPrepare.status, 0);
    assert.match(secondPrepare.stderr, /has not been recorded/);

    const responsePath = resolve(requestPath, "..", "copilot-response.json");
    await writeJson(responsePath, {
      schemaVersion: "source-assurance-copilot-poc-response-v2",
      requestId: request.id,
      invocationId: "copilot-session-1",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: new Date(Date.parse(request.preparedAt) + 1_000).toISOString(),
      completedAt: new Date(Date.parse(request.preparedAt) + 2_000).toISOString(),
      freshSession: true,
      capturedBy: "TESTER",
      proposal: {
        observations: [
          {
            segment: "01",
            quote: "The ministry announced a formal review on 4 March.",
            text: "The ministry announced a formal review.",
            claimKind: "event",
            attribution: { kind: "direct" },
            date: { text: "4 March", role: "event" },
            irIds: ["ir-01"]
          }
        ],
        dispositions: [
          { irId: "ir-01", disposition: "covered" },
          { irId: "ir-02", disposition: "silent" }
        ]
      }
    });

    const record = run(
      "record-assurance-extract",
      [requestPath, responsePath],
      runRoot
    );
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, /Status: committed/);
    const commitPath = outputPath(record.stdout);

    const closedPrepare = run(
      "prepare-assurance-extract",
      [snapshotPath, requirementsPath, policyPath],
      runRoot
    );
    assert.notEqual(closedPrepare.status, 0);
    assert.match(closedPrepare.stderr, /already closed/);

    const prepareReview = run("prepare-assurance-review", [commitPath], runRoot);
    assert.equal(prepareReview.status, 0, prepareReview.stderr);
    const packagePath = outputPath(prepareReview.stdout);
    const packageSha256 = (
      await readFile(resolve(packagePath, "..", "review-package.sha256"), "utf8")
    ).trim();
    const reviewPackage = JSON.parse(await readFile(packagePath, "utf8")) as {
      observations: Array<{ observationId: string }>;
    };

    const reviewResponsePath = resolve(packagePath, "..", "review-response-1.json");
    await writeJson(reviewResponsePath, {
      packageSha256,
      reviewerId: "TESTER",
      reviewedAt: "2026-03-12T00:00:00.000Z",
      verdicts: reviewPackage.observations.map((entry) => ({
        observationId: entry.observationId,
        verdict: "supported"
      })),
      humanObservations: [
        {
          segment: "02",
          quote: "A spokesperson said the review would continue through spring.",
          text: "A spokesperson said the review would continue through spring.",
          claimKind: "statement",
          attribution: { kind: "attributed", attributedTo: "A spokesperson" },
          irIds: ["ir-02"]
        }
      ],
      irReview: [
        { irId: "ir-01", disposition: "covered" },
        {
          irId: "ir-02",
          disposition: "partial",
          note: "Only a seasonal duration is given."
        }
      ],
      assessment: {
        reliability: {
          access: "indirect",
          accessRationale: "The publisher relays official statements.",
          trackRecord: "unknown",
          trackRecordRationale: "Not established in this experiment.",
          alignment: "No declared alignment was identified."
        },
        dependency: {
          kind: "mixed",
          upstreamSources: ["Ministry statement"],
          rationale: "The article mixes narration with attributed statements."
        },
        limitations: ["Single-source only."]
      }
    });

    const recordReview = run(
      "record-assurance-review",
      [packagePath, reviewResponsePath],
      runRoot
    );
    assert.equal(recordReview.status, 0, recordReview.stderr);
    const recordPath = outputPath(recordReview.stdout);

    const assemble = run(
      "assemble-assurance",
      [snapshotPath, commitPath, recordPath],
      runRoot
    );
    assert.equal(assemble.status, 0, assemble.stderr);
    const notePath = outputPath(assemble.stdout);
    const note = JSON.parse(await readFile(notePath, "utf8")) as {
      inScopeObservations: Array<{ origin: string }>;
      gaps: Array<{ irId: string }>;
      lineage: Record<string, unknown>;
    };
    assert.equal(note.inScopeObservations.length, 2);
    assert.deepEqual(
      note.gaps.map((entry) => entry.irId),
      ["ir-02"]
    );
    assert.ok(note.lineage.snapshot);

    const measure = run(
      "measure-assurance",
      [notePath, resolve(commitPath, ".."), recordPath],
      runRoot
    );
    assert.equal(measure.status, 0, measure.stderr);
    const metricsPath = outputPath(measure.stdout);
    const metrics = JSON.parse(await readFile(metricsPath, "utf8")) as {
      omissionCount: number;
      supportFailureRate: number;
      dispositionMismatches: { total: number; underclaims: number };
      recommendations: string[];
    };
    assert.equal(metrics.omissionCount, 1);
    assert.equal(metrics.supportFailureRate, 0);
    assert.equal(metrics.dispositionMismatches.underclaims, 1);
    assert.ok(metrics.recommendations.length > 0);

    const repeatedAssemble = run(
      "assemble-assurance",
      [snapshotPath, commitPath, recordPath],
      runRoot
    );
    assert.notEqual(repeatedAssemble.status, 0);
    assert.match(repeatedAssemble.stderr, /EEXIST|already/i);

    const events = await readFile(
      resolve(runRoot, runId, "assurance", `snapshot-${decisionId}`, "events.jsonl"),
      "utf8"
    );
    assert.match(events, /assurance\.extract\.committed/);
    assert.doesNotMatch(events, /ministry/);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});
