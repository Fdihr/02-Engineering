import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import test from "node:test";
import type { ArtifactBinding } from "../modules/assurance/types.js";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const writeJson = async (
  path: string,
  value: unknown
): Promise<ArtifactBinding> => {
  await mkdir(resolve(path, ".."), { recursive: true });
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, contents, "utf8");
  return {
    artifactRef: artifactRef(path),
    artifactSha256: createHash("sha256").update(contents).digest("hex")
  };
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
  if (!match?.[1]) throw new Error(`No output path in: ${stdout}`);
  return resolve(match[1].trim());
};

test("persists bounded key judgements before preparing writer v2", async () => {
  const runRoot = await mkdtemp(resolve(tmpdir(), "key-judgement-flow-"));
  try {
    const runId = "run-key-judgement";
    const buildPath = resolve(runRoot, runId, "synthesis", "build-record.json");
    const buildArtifact = await writeJson(buildPath, {
      schemaVersion: "synthesis-build-record-v1",
      id: "build-record-1",
      recordedAt: "2026-09-03T10:00:00.000Z",
      runId,
      reviewStatus: "reviewed",
      limitedEvidence: true,
      supersedesNoteIds: [],
      envelope: {
        artifactRef: `runs/${runId}/envelope.json`,
        artifactSha256: "a".repeat(64)
      },
      request: {
        artifactRef: `runs/${runId}/build-request.json`,
        artifactSha256: "b".repeat(64)
      },
      response: {
        artifactRef: `runs/${runId}/build-response.json`,
        artifactSha256: "c".repeat(64)
      },
      invocation: { id: "build-invocation" },
      synthesis: {
        schemaVersion: "external-synthesis-v1",
        id: "synthesis-1",
        createdAt: "2026-09-03T10:00:00.000Z",
        runId,
        reviewStatus: "reviewed",
        sourceNoteIds: ["note-1"],
        supersedesNoteIds: [],
        claims: [
          {
            id: "claim-real-id",
            statement: "The visit occurred.",
            kind: "reported-fact",
            authority: "source-reporting",
            supportingSourceNoteIds: ["note-1"],
            supportingObservationIds: ["obs-1"],
            confidence: {
              level: "moderate",
              rationale: "One established source."
            },
            provisional: false,
            synthetic: false,
            independentSourceCount: 1,
            singleSourceDependent: true,
            confidenceCeiling: "moderate",
            confidenceCeilingRuleId: "ceiling-1"
          }
        ],
        questionCoverage: [
          {
            irId: "ir-01",
            disposition: "covered",
            sourceNoteIds: ["note-1"],
            observationIds: ["obs-1"],
            provisional: false
          },
          {
            irId: "ir-02",
            disposition: "silent",
            sourceNoteIds: ["note-1"],
            observationIds: [],
            provisional: false
          }
        ],
        intelligenceGaps: ["ir-02"],
        limitations: [],
        sourceAppendix: [],
        limitedEvidence: true,
        delta: {
          status: "not-computed",
          reason: "no-prior-synthesis",
          claims: []
        }
      }
    });
    const challengePath = resolve(
      runRoot,
      runId,
      "synthesis",
      "challenge-record.json"
    );
    const challengeArtifact = await writeJson(challengePath, {
      schemaVersion: "synthesis-challenge-record-v1",
      id: "challenge-record-1",
      recordedAt: "2026-09-03T10:01:00.000Z",
      runId,
      reviewStatus: "reviewed",
      limitedEvidence: true,
      buildRecord: buildArtifact,
      request: {
        artifactRef: `runs/${runId}/challenge-request.json`,
        artifactSha256: "d".repeat(64)
      },
      response: {
        artifactRef: `runs/${runId}/challenge-response.json`,
        artifactSha256: "e".repeat(64)
      },
      invocation: { id: "challenge-invocation" },
      results: [
        {
          id: "challenge-result-1",
          claimId: "claim-real-id",
          claimAlias: "c01",
          check: "plausible-alternative",
          verdict: "none"
        }
      ],
      metrics: {}
    });
    const adjudicationPath = resolve(
      runRoot,
      runId,
      "synthesis",
      "adjudication.json"
    );
    await writeJson(adjudicationPath, {
      schemaVersion: "synthesis-adjudication-v1",
      id: "adjudication-1",
      createdAt: "2026-09-03T10:02:00.000Z",
      runId,
      adjudicationStatus: "performed",
      reviewStatus: "reviewed",
      limitedEvidence: true,
      buildRecord: buildArtifact,
      challengeRecord: challengeArtifact,
      claims: [
        {
          claimId: "claim-real-id",
          status: "accepted",
          openChallengeIds: []
        }
      ]
    });
    const questionPath = resolve(
      runRoot,
      runId,
      "research-questions",
      "rq-1",
      "approved-research-question.json"
    );
    await writeJson(questionPath, {
      id: "rq-1",
      runId,
      scopeVersion: 1,
      question: "What happened?",
      rationale: "Bounded command test.",
      geographies: ["Testland"],
      timeWindow: {
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-03T23:59:59.999Z"
      },
      status: "approved",
      approvedBy: "TESTER",
      approvedAt: "2026-09-01T00:00:00.000Z"
    });
    const standardPath = resolve(
      "src/modules/memo/standards/memo-standard-v1.json"
    );

    const prepare = run(
      "prepare-key-judgements",
      [buildPath, challengePath, adjudicationPath, standardPath],
      runRoot
    );
    assert.equal(prepare.status, 0, prepare.stderr);
    const requestPath = outputPath(prepare.stdout);
    const request = JSON.parse(await readFile(requestPath, "utf8")) as {
      id: string;
      preparedAt: string;
      prompt: { user: string };
    };
    assert.doesNotMatch(request.prompt.user, /claim-real-id/);

    const responsePath = resolve(requestPath, "..", "copilot-response.json");
    await writeJson(responsePath, {
      schemaVersion: "key-judgement-copilot-response-v1",
      requestId: request.id,
      invocationId: "key-judgement-invocation",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: new Date(Date.parse(request.preparedAt) + 1_000).toISOString(),
      completedAt: new Date(Date.parse(request.preparedAt) + 2_000).toISOString(),
      freshSession: true,
      capturedBy: "TESTER",
      proposal: {
        selections: [
          {
            requirementId: "ir-01",
            claim: "c01",
            judgementText: "The visit is reported by one source."
          }
        ],
        omissions: []
      }
    });
    const record = run(
      "record-key-judgements",
      [requestPath, responsePath],
      runRoot
    );
    assert.equal(record.status, 0, record.stderr);
    const recordPath = outputPath(record.stdout);
    const keyRecord = JSON.parse(await readFile(recordPath, "utf8")) as {
      selection: { selections: unknown[]; requirementsWithoutEligibleClaim: string[] };
    };
    assert.equal(keyRecord.selection.selections.length, 1);
    assert.deepEqual(keyRecord.selection.requirementsWithoutEligibleClaim, [
      "ir-02"
    ]);

    const prepareWriter = run(
      "prepare-memo-writer",
      [
        buildPath,
        challengePath,
        adjudicationPath,
        recordPath,
        questionPath,
        standardPath
      ],
      runRoot
    );
    assert.equal(prepareWriter.status, 0, prepareWriter.stderr);
    const writerRequestPath = outputPath(prepareWriter.stdout);
    const writerRequest = JSON.parse(
      await readFile(writerRequestPath, "utf8")
    ) as {
      id: string;
      preparedAt: string;
      schemaVersion: string;
      keyJudgements: unknown[];
      prompt: { user: string };
    };
    assert.equal(writerRequest.schemaVersion, "memo-writer-request-v2");
    assert.equal(writerRequest.keyJudgements.length, 1);
    assert.doesNotMatch(writerRequest.prompt.user, /claim-real-id/);

    const writerResponsePath = resolve(
      writerRequestPath,
      "..",
      "copilot-response.json"
    );
    await writeJson(writerResponsePath, {
      schemaVersion: "memo-writer-copilot-response-v1",
      requestId: writerRequest.id,
      invocationId: "writer-invocation",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: new Date(
        Date.parse(writerRequest.preparedAt) + 1_000
      ).toISOString(),
      completedAt: new Date(
        Date.parse(writerRequest.preparedAt) + 2_000
      ).toISOString(),
      freshSession: true,
      capturedBy: "TESTER",
      proposal: { statements: [] }
    });
    const recordWriter = run(
      "record-memo-writer",
      [writerRequestPath, writerResponsePath],
      runRoot
    );
    assert.equal(recordWriter.status, 0, recordWriter.stderr);
    const memoMarkdownPath = outputPath(recordWriter.stdout);
    const memo = JSON.parse(
      await readFile(resolve(memoMarkdownPath, "..", "memo.json"), "utf8")
    ) as {
      memoStandardVersion: number;
      keyJudgments: Array<{
        statement: { text: string };
      }>;
      lineage: { keyJudgementRecord?: ArtifactBinding };
    };
    assert.equal(memo.memoStandardVersion, 1);
    assert.equal(
      memo.keyJudgments[0]?.statement.text,
      "The visit is reported by one source."
    );
    assert.ok(memo.lineage.keyJudgementRecord);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});