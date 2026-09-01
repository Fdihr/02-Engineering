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
    const outputRoot = resolve(tempRoot, "outputs");
    const rawPath = resolve(outputRoot, "source-artifacts", "raw-response.json");
    const assessmentPath = resolve(
      outputRoot,
      "source-artifacts",
      "question-relevance-assessment.json"
    );
    const relevanceDecisionPath = resolve(
      outputRoot,
      "source-artifacts",
      "question-relevance-decision.json"
    );
    const intakePath = resolve(outputRoot, "source-intakes", "intake-result.json");
    const rawContent = JSON.stringify({ synthetic: "captured source" });
    const rawArtifactSha256 = createHash("sha256").update(rawContent).digest("hex");
    await mkdir(resolve(rawPath, ".."), { recursive: true });
    await mkdir(resolve(intakePath, ".."), { recursive: true });
    await writeFile(rawPath, rawContent, "utf8");
    await writeFile(
      intakePath,
      JSON.stringify({
        item: {
          provider: "source_retrieval",
          endpoint: "https://api.firecrawl.dev/v2/scrape",
          providerItemId: "retrieved-synthetic-001",
          sourceType: "publisher_source",
          retrievedAt: "2026-08-28T08:55:45.000Z",
          rawArtifactRef: rawPath,
          sourceLinks: ["https://news.example/report"],
          referenceCount: 1,
          hasSourceMetadata: true,
          researchQuestion: {
            id: "rq-001",
            runId: "synthetic-intake-001",
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
            artifactRef: "runs/synthetic-intake-001/approved-research-question.json",
            artifactSha256: "a".repeat(64)
          },
          role: "evidence_candidate",
          contentCompleteness: "captured_content",
          source: {
            requestedUrl: "https://news.example/report",
            finalUrl: "https://news.example/report",
            publisherHost: "news.example",
            title: "Synthetic publisher report"
          },
          retrievalLineage: {
            retrievalId: "retrieval-synthetic-001",
            sourceLeadProviderItemId: "lead-synthetic-001",
            sourceIntakeArtifactRef: "runs/source-intake.json",
            sourceIntakeArtifactSha256: "b".repeat(64),
            retrievalArtifactRef: "runs/retrieval-result.json",
            retrievalArtifactSha256: "c".repeat(64),
            requestArtifactRef: "runs/retrieval-request.json",
            requestArtifactSha256: "d".repeat(64),
            rawArtifactRef: rawPath,
            rawArtifactSha256
          },
          questionRelevance: {
            assessmentArtifactRef: assessmentPath,
            assessmentArtifactSha256: "1".repeat(64),
            decisionArtifactRef: relevanceDecisionPath,
            decisionArtifactSha256: "2".repeat(64),
            assessment: {
              schemaVersion: "question-relevance-assessment-v1",
              id: "question-relevance-assessment-command-test",
              status: "proposed",
              runId: "synthetic-intake-001",
              sourceItemId: "retrieval-synthetic-001",
              researchQuestionId: "rq-001",
              researchQuestionArtifactRef:
                "runs/synthetic-intake-001/approved-research-question.json",
              researchQuestionArtifactSha256: "a".repeat(64),
              sourceDocumentId: "source-document-command-test",
              sourceDocumentArtifactRef:
                "runs/synthetic-intake-001/source-document.json",
              sourceDocumentArtifactSha256: "3".repeat(64),
              assessedAt: "2026-08-28T09:00:00.000Z",
              modelInvocation: {
                id: "model-invocation-command-test",
                provider: "github-copilot-vscode",
                model: "not-exposed-by-host",
                promptPolicyVersion: "question-relevance-prompt-v1",
                promptArtifactRef:
                  "runs/synthetic-intake-001/question-relevance-request.json",
                promptArtifactSha256: "4".repeat(64),
                responseArtifactRef:
                  "runs/synthetic-intake-001/copilot-response.json",
                responseArtifactSha256: "5".repeat(64),
                startedAt: "2026-08-28T08:57:00.000Z",
                completedAt: "2026-08-28T08:59:00.000Z"
              },
              verdict: "relevant",
              rationale: "The source addresses the approved question.",
              support: [
                {
                  anchor: {
                    sourceDocumentId: "source-document-command-test",
                    sourceDocumentArtifactRef:
                      "runs/synthetic-intake-001/source-document.json",
                    sourceDocumentArtifactSha256: "3".repeat(64),
                    segmentId: "source-segment-command-test",
                    segmentSha256: "6".repeat(64),
                    quote: "Synthetic captured source.",
                    quoteStartUtf8Byte: 0,
                    quoteEndUtf8Byte: 26
                  },
                  relationToQuestion: "The source addresses the question."
                }
              ],
              limitations: ["Synthetic source remains untrusted until review."]
            },
            decision: {
              assessmentId: "question-relevance-assessment-command-test",
              verdict: "relevant",
              destination: "evidence_candidate_proposal",
              approvalStatus: "pending_human_review",
              ruleId: "question-relevance-positive-v1",
              reason: "A grounded positive assessment may be proposed for review."
            }
          },
          limitations: ["Synthetic source remains untrusted until review."]
        },
        decision: {
          providerItemId: "retrieved-synthetic-001",
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
    const intakeValue = JSON.parse(await readFile(intakePath, "utf8")) as {
      item: {
        questionRelevance: {
          assessmentArtifactSha256: string;
          decisionArtifactSha256: string;
          assessment: unknown;
          decision: unknown;
        };
      };
    };
    const assessmentContent = JSON.stringify(
      intakeValue.item.questionRelevance.assessment,
      null,
      2
    );
    const relevanceDecisionContent = JSON.stringify(
      intakeValue.item.questionRelevance.decision,
      null,
      2
    );
    await writeFile(assessmentPath, assessmentContent, "utf8");
    await writeFile(relevanceDecisionPath, relevanceDecisionContent, "utf8");
    intakeValue.item.questionRelevance.assessmentArtifactSha256 = createHash(
      "sha256"
    )
      .update(assessmentContent)
      .digest("hex");
    intakeValue.item.questionRelevance.decisionArtifactSha256 = createHash(
      "sha256"
    )
      .update(relevanceDecisionContent)
      .digest("hex");
    await writeFile(intakePath, JSON.stringify(intakeValue), "utf8");
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
      rawArtifactSha256
    );
    assert.equal(
      (snapshot.item as { questionRelevance: { assessment: { verdict: string } } })
        .questionRelevance.assessment.verdict,
      "relevant"
    );
    assert.match(summary, /read-only/i);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EVIDENCE_RUN_DIR: outputRoot }
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Evidence review failed/);

    const outsidePath = resolve(tempRoot, "outside-intake.json");
    await writeFile(outsidePath, "{}", "utf8");
    const outside = spawnSync(
      process.execPath,
      [...args.slice(0, 3), outsidePath, ...args.slice(4, -1), "outside-review"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, EVIDENCE_RUN_DIR: outputRoot }
      }
    );
    assert.notEqual(outside.status, 0);
    assert.match(outside.stderr, /must remain inside the configured run directory/);

    const revision = spawnSync(
      process.execPath,
      [
        ...args.slice(0, 4),
        "revise",
        "analyst-test",
        "Correct the anchored rationale before admission.",
        "revision-command-test"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, EVIDENCE_RUN_DIR: outputRoot }
      }
    );
    assert.equal(revision.status, 0, revision.stderr);
    const revisionDirectory = resolve(outputRoot, "revision-command-test");
    const revisionDecision = JSON.parse(
      await readFile(resolve(revisionDirectory, "evidence-decision.json"), "utf8")
    ) as Record<string, unknown>;
    assert.equal(revisionDecision.decision, "revision_requested");
    await assert.rejects(
      readFile(resolve(revisionDirectory, "approved-evidence-snapshot.json"))
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});