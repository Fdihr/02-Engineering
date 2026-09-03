import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessOutput } from "./process-source.js";
import { reviewEvidence } from "./review-evidence.js";
import { admitEvidenceUnderPolicy } from "./admit-evidence.js";

const intake: ProcessOutput = {
  item: {
    provider: "seerist",
    endpoint: "/v1/wod",
    providerItemId: "1030013",
    sourceType: "analysis",
    providerTimestamp: "2026-08-28T08:38:47.762Z",
    retrievedAt: "2026-08-28T08:55:45.082Z",
    rawArtifactRef: "runs/probe-001/raw-response.json",
    rawArtifactSha256: "a".repeat(64),
    collectionLineage: {
      operationId: "operation-001",
      requestManifestRef: "runs/probe-001/collection-request.json",
      requestManifestSha256: "b".repeat(64),
      responseManifestRef: "runs/probe-001/raw-provider-artifact.json",
      responseManifestSha256: "c".repeat(64),
      rawArtifactRef: "runs/probe-001/raw-response.json",
      rawArtifactSha256: "a".repeat(64)
    },
    sourceLinks: [],
    referenceCount: 0,
    hasSourceMetadata: false,
    researchQuestion: {
      id: "rq-001",
      runId: "intake-run-001",
      scopeVersion: 1,
      question: "What political developments could affect operational continuity in Pakistan?",
      rationale: "Bound synthetic approval test.",
      geographies: ["Pakistan"],
      timeWindow: {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-28T23:59:59.999Z"
      },
      status: "approved",
      approvedBy: "analyst-001",
      approvedAt: "2026-08-27T10:00:00.000Z",
      artifactRef: "runs/intake-run-001/approved-research-question.json",
      artifactSha256: "a".repeat(64)
    },
    role: "evidence_candidate",
    contentCompleteness: "captured_content"
  },
  decision: {
    providerItemId: "1030013",
    role: "evidence_candidate",
    destination: "human_review",
    approvalStatus: "pending_human_review",
    ruleId: "RULE-EVIDENCE-REVIEW-001",
    reason: "Captured analyst material requires explicit human approval"
  },
  ledgerEntry: {
    runId: "intake-run-001",
    occurredAt: "2026-08-28T09:00:00.000Z",
    eventType: "intake.item.routed",
    status: "completed",
    artifactRef: "runs/probe-001/raw-response.json"
  }
};

const request = {
  decisionId: "review-001",
  reviewerId: "analyst-001",
  decidedAt: "2026-08-28T10:00:00.000Z",
  reason: "Source lineage and captured content reviewed.",
  intakeArtifactRef: "runs/intake-run-001/intake-result.json",
  rawArtifactSha256: "a".repeat(64)
};

test("initial native Seerist intake cannot bypass question relevance", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    intake
  });

  assert.deepEqual(result, {
    ok: false,
    error: "NATIVE_CANDIDATE_REQUIRES_QUESTION_RELEVANCE"
  });
});

test("initial native Seerist intake cannot enter evidence rejection", () => {
  const result = reviewEvidence({
    ...request,
    decision: "rejected",
    reason: "Source is not suitable for claim-bearing analysis.",
    intake
  });

  assert.deepEqual(result, {
    ok: false,
    error: "NATIVE_CANDIDATE_REQUIRES_QUESTION_RELEVANCE"
  });
});

test("changed native Seerist raw bytes cannot pass the evidence gate", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    rawArtifactSha256: "f".repeat(64),
    intake
  });

  assert.deepEqual(result, {
    ok: false,
    error: "RAW_ARTIFACT_SHA256_MISMATCH"
  });
});

test("explicit approval preserves retrieved-source assessment and lineage", () => {
  const retrievedIntake = {
    item: {
      provider: "source_retrieval",
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      providerItemId: "retrieved-source-001",
      sourceType: "publisher_source",
      retrievedAt: "2026-08-28T09:00:05.000Z",
      rawArtifactRef: "runs/retrieval-001/raw-firecrawl-response.json",
      sourceLinks: ["https://news.example/report"],
      referenceCount: 1,
      hasSourceMetadata: true,
      researchQuestion: intake.item.researchQuestion,
      role: "evidence_candidate",
      contentCompleteness: "captured_content",
      source: {
        requestedUrl: "https://news.example/report",
        finalUrl: "https://news.example/report",
        publisherHost: "news.example",
        title: "Publisher report"
      },
      retrievalLineage: {
        retrievalId: "retrieval-001",
        sourceLeadProviderItemId: "lead-001",
        sourceIntakeArtifactRef: "runs/intake-001/intake-result.json",
        sourceIntakeArtifactSha256: "b".repeat(64),
        retrievalArtifactRef: "runs/retrieval-001/source-retrieval-result.json",
        retrievalArtifactSha256: "c".repeat(64),
        requestArtifactRef: "runs/retrieval-001/retrieval-request.json",
        requestArtifactSha256: "d".repeat(64),
        rawArtifactRef: "runs/retrieval-001/raw-firecrawl-response.json",
        rawArtifactSha256: "e".repeat(64)
      },
      questionRelevance: {
        assessmentArtifactRef:
          "runs/retrieval-001/question-relevance-assessment.json",
        assessmentArtifactSha256: "1".repeat(64),
        decisionArtifactRef:
          "runs/retrieval-001/question-relevance-decision.json",
        decisionArtifactSha256: "2".repeat(64),
        assessment: {
          schemaVersion: "question-relevance-assessment-v1",
          id: "question-relevance-assessment-001",
          status: "proposed",
          runId: intake.item.researchQuestion.runId,
          sourceItemId: "retrieval-001",
          researchQuestionId: intake.item.researchQuestion.id,
          researchQuestionArtifactRef:
            intake.item.researchQuestion.artifactRef,
          researchQuestionArtifactSha256:
            intake.item.researchQuestion.artifactSha256,
          sourceDocumentId: "source-document-001",
          sourceDocumentArtifactRef:
            "runs/retrieval-001/source-document.json",
          sourceDocumentArtifactSha256: "3".repeat(64),
          assessedAt: "2026-08-28T09:30:00.000Z",
          modelInvocation: {
            id: "model-invocation-001",
            provider: "github-copilot-vscode",
            model: "not-exposed-by-host",
            promptPolicyVersion: "question-relevance-prompt-v1",
            promptArtifactRef:
              "runs/retrieval-001/question-relevance-request.json",
            promptArtifactSha256: "4".repeat(64),
            responseArtifactRef: "runs/retrieval-001/copilot-response.json",
            responseArtifactSha256: "5".repeat(64),
            startedAt: "2026-08-28T09:20:00.000Z",
            completedAt: "2026-08-28T09:25:00.000Z"
          },
          verdict: "relevant",
          rationale: "The publisher report directly addresses the approved question.",
          support: [
            {
              anchor: {
                sourceDocumentId: "source-document-001",
                sourceDocumentArtifactRef:
                  "runs/retrieval-001/source-document.json",
                sourceDocumentArtifactSha256: "3".repeat(64),
                segmentId: "source-segment-001",
                segmentSha256: "6".repeat(64),
                quote: "Bounded publisher fact.",
                quoteStartUtf8Byte: 0,
                quoteEndUtf8Byte: 23
              },
              relationToQuestion: "The fact addresses the approved question."
            }
          ],
          limitations: ["The source remains untrusted until human review."]
        },
        decision: {
          assessmentId: "question-relevance-assessment-001",
          verdict: "relevant",
          destination: "evidence_candidate_proposal",
          approvalStatus: "pending_human_review",
          ruleId: "question-relevance-positive-v1",
          reason: "A grounded positive assessment may be proposed for review."
        }
      },
      limitations: ["Retrieved content remains untrusted until reviewed."]
    },
    decision: {
      ...intake.decision,
      providerItemId: "retrieved-source-001"
    },
    ledgerEntry: {
      ...intake.ledgerEntry,
      artifactRef: "runs/retrieval-001/raw-firecrawl-response.json"
    }
  };
  const questionRelevanceArtifacts = {
    assessmentArtifactSha256: "1".repeat(64),
    decisionArtifactSha256: "2".repeat(64),
    assessment: structuredClone(
      retrievedIntake.item.questionRelevance.assessment
    ),
    decision: structuredClone(retrievedIntake.item.questionRelevance.decision)
  };
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    rawArtifactSha256: "e".repeat(64),
    questionRelevanceArtifacts,
    intake: retrievedIntake
  });

  assert.equal(result.ok, true);
  if (!result.ok || result.value.outcome !== "approved") {
    return;
  }
  assert.equal(result.value.snapshot.item.provider, "source_retrieval");
  if (result.value.snapshot.item.provider === "source_retrieval") {
    assert.equal(
      result.value.snapshot.item.questionRelevance.assessment.researchQuestionId,
      intake.item.researchQuestion.id
    );
    assert.equal(result.value.snapshot.item.retrievalLineage.retrievalId, "retrieval-001");
  }

  const autoAdmit = {
    relevance: "relevant" as const,
    requireCodeValidatedAnchors: true as const,
    readiness: ["ready", "qualified"] as Array<"ready" | "qualified">,
    rejectSynthetic: true as const,
    requireWithinBudget: true as const
  };
  const humanMode = admitEvidenceUnderPolicy({
    policy: {
      policyId: "compatibility-human-admission-v1",
      version: 1,
      mode: "human",
      autoAdmit
    },
    humanReview: {
      ...request,
      decision: "approved",
      rawArtifactSha256: "e".repeat(64),
      questionRelevanceArtifacts,
      intake: retrievedIntake
    }
  });
  assert.deepEqual(humanMode, result);

  const controllerInput = {
    decisionId: "controller-admission-001",
    decidedAt: "2026-08-28T10:00:00.000Z",
    intakeArtifactRef: request.intakeArtifactRef,
    rawArtifactSha256: "e".repeat(64),
    questionRelevanceArtifacts,
    intake: retrievedIntake,
    readiness: "ready" as const,
    anchorsCodeValidated: true,
    synthetic: false,
    withinBudget: true
  };
  const controllerMode = admitEvidenceUnderPolicy({
    policy: {
      policyId: "controller-admission-v1",
      version: 1,
      mode: "controller",
      autoAdmit
    },
    controller: controllerInput
  });
  assert.equal(controllerMode.ok, true);
  if (controllerMode.ok && controllerMode.value.outcome === "approved") {
    assert.deepEqual(
      Object.keys(controllerMode.value.snapshot).sort(),
      Object.keys(result.value.snapshot).sort()
    );
    assert.equal(
      controllerMode.value.snapshot.admittedBy,
      "controller:controller-admission-v1"
    );
    assert.equal(controllerMode.value.event.actorType, "controller");
  } else {
    assert.fail("Expected controller admission approval");
  }

  assert.deepEqual(
    admitEvidenceUnderPolicy({
      policy: {
        policyId: "controller-admission-v1",
        version: 1,
        mode: "controller",
        autoAdmit
      },
      controller: { ...controllerInput, withinBudget: false }
    }),
    { ok: false, error: "CONTROLLER_ADMISSION_CHECK_FAILED" }
  );

  const partialIntake = structuredClone(retrievedIntake);
  partialIntake.item.questionRelevance.assessment.verdict = "partially-relevant";
  partialIntake.item.questionRelevance.decision.verdict = "partially-relevant";
  const partialArtifacts = structuredClone(questionRelevanceArtifacts);
  partialArtifacts.assessment.verdict = "partially-relevant";
  partialArtifacts.decision.verdict = "partially-relevant";
  const partial = admitEvidenceUnderPolicy({
    policy: {
      policyId: "controller-admission-v1",
      version: 1,
      mode: "controller",
      autoAdmit
    },
    controller: {
      ...controllerInput,
      questionRelevanceArtifacts: partialArtifacts,
      intake: partialIntake
    }
  });
  assert.equal(partial.ok, true);
  if (partial.ok) {
    assert.equal(partial.value.outcome, "exception");
    if (partial.value.outcome === "exception") {
      assert.equal(partial.value.exception.kind, "uncertain-relevance");
      assert.equal(partial.value.exception.status, "open");
    }
  }

  const revision = reviewEvidence({
    ...request,
    decision: "revision_requested",
    reason: "The anchored rationale needs correction before admission.",
    rawArtifactSha256: "e".repeat(64),
    questionRelevanceArtifacts,
    intake: retrievedIntake
  });
  assert.equal(revision.ok, true);
  if (revision.ok) {
    assert.deepEqual(revision.value, {
      outcome: "revision_requested",
      decision: {
        id: request.decisionId,
        sourceRunId: "intake-run-001",
        providerItemId: "retrieved-source-001",
        reviewerId: request.reviewerId,
        decidedAt: request.decidedAt,
        decision: "revision_requested",
        reason: "The anchored rationale needs correction before admission.",
        intakeArtifactRef: request.intakeArtifactRef
      },
      event: {
        decisionId: request.decisionId,
        sourceRunId: "intake-run-001",
        occurredAt: request.decidedAt,
        actorType: "human",
        actorId: request.reviewerId,
        stage: "evidence_admission",
        eventType: "evidence.admission.revision_requested",
        status: "completed",
        intakeArtifactRef: request.intakeArtifactRef
      }
    });
  }

  const changedRawArtifact = reviewEvidence({
    ...request,
    decision: "approved",
    rawArtifactSha256: "f".repeat(64),
    questionRelevanceArtifacts,
    intake: retrievedIntake
  });
  assert.deepEqual(changedRawArtifact, {
    ok: false,
    error: "RAW_ARTIFACT_SHA256_MISMATCH"
  });

  const changedRelevanceRoute = structuredClone(retrievedIntake);
  changedRelevanceRoute.item.questionRelevance.decision.destination =
    "audited_exclusion";
  assert.deepEqual(
    reviewEvidence({
      ...request,
      decision: "approved",
      rawArtifactSha256: "e".repeat(64),
      questionRelevanceArtifacts,
      intake: changedRelevanceRoute
    }),
    { ok: false, error: "INVALID_INTAKE_ARTIFACT" }
  );

  const changedAssessmentArtifact = structuredClone(questionRelevanceArtifacts);
  changedAssessmentArtifact.assessment.rationale = "Changed after conversion.";
  assert.deepEqual(
    reviewEvidence({
      ...request,
      decision: "approved",
      rawArtifactSha256: "e".repeat(64),
      questionRelevanceArtifacts: changedAssessmentArtifact,
      intake: retrievedIntake
    }),
    { ok: false, error: "QUESTION_RELEVANCE_ARTIFACT_MISMATCH" }
  );
});

test("collection leads cannot pass the evidence gate", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    intake: {
      ...intake,
      item: {
        ...intake.item,
        role: "collection_lead",
        contentCompleteness: "summary_only"
      },
      decision: {
        ...intake.decision,
        role: "collection_lead",
        destination: "source_retrieval",
        approvalStatus: "not_applicable"
      }
    }
  });

  assert.deepEqual(result, {
    ok: false,
    error: "INELIGIBLE_PROVIDER_ROLE"
  });
});

test("mismatched provider item IDs cannot pass the gate", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    intake: {
      ...intake,
      decision: {
        ...intake.decision,
        providerItemId: "different-item"
      }
    }
  });

  assert.deepEqual(result, {
    ok: false,
    error: "PROVIDER_ITEM_ID_MISMATCH"
  });
});

test("reviewer identity and reason are required", () => {
  const missingReviewer = reviewEvidence({
    ...request,
    reviewerId: " ",
    decision: "approved",
    intake
  });
  const missingReason = reviewEvidence({
    ...request,
    reason: " ",
    decision: "approved",
    intake
  });

  assert.deepEqual(missingReviewer, { ok: false, error: "MISSING_REVIEWER_ID" });
  assert.deepEqual(missingReason, { ok: false, error: "MISSING_DECISION_REASON" });
});