import type { ApprovedResearchQuestion, SourceDocument } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { validateApprovedResearchQuestion } from "../research/research-question.js";
import { validateSourceDocument } from "../source/source-document.js";
import type { AdmittedSource } from "./types.js";
import {
  boundedStringArray,
  isRecord,
  nonEmptyString,
  pathSafeId,
  validSha256,
  validTime
} from "./validators.js";

export type AdmittedSourceError =
  | "INVALID_SNAPSHOT_ARTIFACT"
  | "INVALID_EVIDENCE_DECISION"
  | "EVIDENCE_DECISION_MISMATCH"
  | "EVIDENCE_NOT_APPROVED"
  | "INVALID_EVIDENCE_CANDIDATE"
  | "INVALID_QUESTION_RELEVANCE_LINEAGE"
  | "INVALID_RESEARCH_QUESTION"
  | "RESEARCH_QUESTION_MISMATCH"
  | "SOURCE_DOCUMENT_CHECKSUM_MISMATCH"
  | "INVALID_SOURCE_DOCUMENT"
  | "RESEARCH_RUN_MISMATCH";

export type AdmittedSourceInput = {
  snapshotValue: unknown;
  snapshotArtifactRef: unknown;
  snapshotArtifactSha256: unknown;
  decisionValue: unknown;
  decisionArtifactRef: unknown;
  decisionArtifactSha256: unknown;
  researchQuestionValue: unknown;
  sourceDocumentValue: unknown;
  sourceDocumentArtifactRef: unknown;
  sourceDocumentArtifactSha256: unknown;
  validatedAt: string;
};

type QuestionRelevanceLineage = {
  sourceDocumentArtifactRef: string;
  sourceDocumentArtifactSha256: string;
  researchQuestionId: string;
};

const readQuestionRelevanceLineage = (
  item: Record<string, unknown>
): QuestionRelevanceLineage | undefined => {
  if (!isRecord(item.questionRelevance) || !isRecord(item.questionRelevance.assessment)) {
    return undefined;
  }
  const assessment = item.questionRelevance.assessment;
  const sourceDocumentArtifactRef = nonEmptyString(
    assessment.sourceDocumentArtifactRef
  );
  const sourceDocumentArtifactSha256 = validSha256(
    assessment.sourceDocumentArtifactSha256
  );
  const researchQuestionId = nonEmptyString(assessment.researchQuestionId);
  return sourceDocumentArtifactRef &&
    sourceDocumentArtifactSha256 &&
    researchQuestionId
    ? {
        sourceDocumentArtifactRef,
        sourceDocumentArtifactSha256,
        researchQuestionId
      }
    : undefined;
};

/**
 * Binds Panel 2 to the exact human-admitted evidence: snapshot, sibling decision,
 * approved question, and the canonical source document referenced by admission.
 */
export const validateAdmittedSource = (
  input: AdmittedSourceInput
): Result<AdmittedSource, AdmittedSourceError> => {
  const snapshot = input.snapshotValue;
  if (!isRecord(snapshot) || !isRecord(snapshot.item)) {
    return err("INVALID_SNAPSHOT_ARTIFACT");
  }

  const snapshotId = pathSafeId(snapshot.snapshotId);
  const sourceDecisionId = pathSafeId(snapshot.sourceDecisionId);
  const runId = pathSafeId(snapshot.sourceRunId);
  const candidateId = pathSafeId(snapshot.providerItemId);
  const reviewerId = nonEmptyString(snapshot.admittedBy);
  const admittedAt = validTime(snapshot.admittedAt);
  const intakeArtifactRef = nonEmptyString(snapshot.intakeArtifactRef);
  const snapshotArtifactRef = nonEmptyString(input.snapshotArtifactRef);
  const snapshotArtifactSha256 = validSha256(input.snapshotArtifactSha256);
  if (
    !snapshotId ||
    !sourceDecisionId ||
    !runId ||
    !candidateId ||
    !reviewerId ||
    !admittedAt ||
    !intakeArtifactRef ||
    !snapshotArtifactRef ||
    !snapshotArtifactSha256 ||
    snapshotId !== `snapshot-${sourceDecisionId}`
  ) {
    return err("INVALID_SNAPSHOT_ARTIFACT");
  }

  const decision = input.decisionValue;
  const decisionArtifactRef = nonEmptyString(input.decisionArtifactRef);
  const decisionArtifactSha256 = validSha256(input.decisionArtifactSha256);
  if (!isRecord(decision) || !decisionArtifactRef || !decisionArtifactSha256) {
    return err("INVALID_EVIDENCE_DECISION");
  }
  if (decision.decision !== "approved") {
    return err("EVIDENCE_NOT_APPROVED");
  }
  if (
    decision.id !== sourceDecisionId ||
    decision.sourceRunId !== runId ||
    decision.providerItemId !== candidateId ||
    decision.reviewerId !== reviewerId ||
    decision.intakeArtifactRef !== intakeArtifactRef
  ) {
    return err("EVIDENCE_DECISION_MISMATCH");
  }

  const item = snapshot.item;
  const limitations = boundedStringArray(item.limitations, 24, 2_000);
  if (
    item.role !== "evidence_candidate" ||
    item.providerItemId !== candidateId ||
    item.contentCompleteness !== "captured_content" ||
    !limitations
  ) {
    return err("INVALID_EVIDENCE_CANDIDATE");
  }

  const lineage = readQuestionRelevanceLineage(item);
  if (!lineage) {
    return err("INVALID_QUESTION_RELEVANCE_LINEAGE");
  }

  const question = validateApprovedResearchQuestion(
    input.researchQuestionValue,
    input.validatedAt
  );
  if (!question.ok) {
    return err("INVALID_RESEARCH_QUESTION");
  }
  const embedded = validateApprovedResearchQuestion(
    item.researchQuestion,
    input.validatedAt
  );
  if (!embedded.ok) {
    return err("INVALID_RESEARCH_QUESTION");
  }
  if (
    question.value.id !== embedded.value.id ||
    question.value.artifactSha256 !== embedded.value.artifactSha256 ||
    question.value.artifactRef !== embedded.value.artifactRef ||
    question.value.id !== lineage.researchQuestionId
  ) {
    return err("RESEARCH_QUESTION_MISMATCH");
  }

  const sourceDocumentArtifactRef = nonEmptyString(input.sourceDocumentArtifactRef);
  const sourceDocumentArtifactSha256 = validSha256(
    input.sourceDocumentArtifactSha256
  );
  if (
    !sourceDocumentArtifactRef ||
    !sourceDocumentArtifactSha256 ||
    sourceDocumentArtifactSha256 !== lineage.sourceDocumentArtifactSha256 ||
    sourceDocumentArtifactRef !== lineage.sourceDocumentArtifactRef
  ) {
    return err("SOURCE_DOCUMENT_CHECKSUM_MISMATCH");
  }

  const document = validateSourceDocument(input.sourceDocumentValue);
  if (!document.ok) {
    return err("INVALID_SOURCE_DOCUMENT");
  }
  if (document.value.runId !== runId || question.value.runId !== runId) {
    return err("RESEARCH_RUN_MISMATCH");
  }

  const researchQuestion: ApprovedResearchQuestion = question.value;
  const sourceDocument: SourceDocument = document.value;

  return ok({
    snapshotId,
    sourceDecisionId,
    runId,
    candidateId,
    reviewerId,
    admittedAt,
    snapshot: {
      artifactRef: snapshotArtifactRef,
      artifactSha256: snapshotArtifactSha256
    },
    evidenceDecision: {
      artifactRef: decisionArtifactRef,
      artifactSha256: decisionArtifactSha256
    },
    sourceDocumentArtifact: {
      artifactRef: sourceDocumentArtifactRef,
      artifactSha256: sourceDocumentArtifactSha256
    },
    researchQuestion,
    sourceDocument,
    sourceLimitations: limitations
  });
};
