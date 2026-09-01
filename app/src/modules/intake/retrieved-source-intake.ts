import { isDeepStrictEqual } from "node:util";
import type {
  RetrievedSourceEvidenceCandidate,
  RouteDecision,
  LedgerEntry
} from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { createLedgerEntry } from "../ledger/ledger.js";
import { validateQuestionRelevanceAssessment } from "../relevance/question-relevance.js";
import { validateApprovedResearchQuestion } from "../research/research-question.js";
import { decideRoute } from "../routing/routing.js";
import { isSafeSourceUrl, prepareSourceRetrieval } from "../retrieval/source-retrieval.js";
import { validateSourceDocument } from "../source/source-document.js";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape" as const;

export type RetrievedSourceIntakeError =
  | "INVALID_REINTAKE_INPUT"
  | "MISSING_CANDIDATE_ID"
  | "INVALID_CANDIDATE_ID"
  | "INVALID_CANDIDATE_TIME"
  | "INVALID_RETRIEVAL_RESULT"
  | "RETRIEVAL_NOT_RESOLVED"
  | "INVALID_SOURCE_INTAKE"
  | "SOURCE_INTAKE_MISMATCH"
  | "RESEARCH_QUESTION_MISMATCH"
  | "INVALID_ARTIFACT_LINEAGE"
  | "INVALID_SOURCE_DOCUMENT"
  | "SOURCE_DOCUMENT_MISMATCH"
  | "INVALID_RELEVANCE_ASSESSMENT"
  | "NON_POSITIVE_RELEVANCE";

export type RetrievedSourceIntakeOutput = {
  item: RetrievedSourceEvidenceCandidate;
  decision: RouteDecision;
  ledgerEntry: LedgerEntry;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const sha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const validTime = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : undefined;
};

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;

const sameOrigin = (left: string, right: string): boolean => {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
};

export const reintakeRetrievedSource = (
  input: unknown
): Result<RetrievedSourceIntakeOutput, RetrievedSourceIntakeError> => {
  if (!isRecord(input)) {
    return err("INVALID_REINTAKE_INPUT");
  }

  const candidateId = nonEmptyString(input.candidateId);
  if (!candidateId) {
    return err("MISSING_CANDIDATE_ID");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidateId) || candidateId === "..") {
    return err("INVALID_CANDIDATE_ID");
  }
  const convertedAt = validTime(input.convertedAt);
  if (!convertedAt) {
    return err("INVALID_CANDIDATE_TIME");
  }
  if (!isRecord(input.retrieval) || !isRecord(input.artifactChecksums)) {
    return err("INVALID_REINTAKE_INPUT");
  }

  const retrieval = input.retrieval;
  const retrievalId = nonEmptyString(retrieval.id);
  const runId = nonEmptyString(retrieval.runId);
  const sourceLeadProviderItemId = nonEmptyString(retrieval.providerItemId);
  const attemptedAt = validTime(retrieval.attemptedAt);
  const receivedAt = validTime(retrieval.receivedAt);
  if (
    !retrievalId ||
    !runId ||
    !sourceLeadProviderItemId ||
    !attemptedAt ||
    !receivedAt ||
    retrieval.resolutionDepth !== 1 ||
    retrieval.approvalStatus !== "not_requested" ||
    !isRecord(retrieval.accessProvider) ||
    retrieval.accessProvider.name !== "firecrawl" ||
    retrieval.accessProvider.endpoint !== FIRECRAWL_ENDPOINT ||
    typeof retrieval.accessProvider.httpStatus !== "number" ||
    retrieval.accessProvider.httpStatus < 200 ||
    retrieval.accessProvider.httpStatus >= 300 ||
    !isRecord(retrieval.source) ||
    !isRecord(retrieval.request) ||
    !isRecord(retrieval.lineage) ||
    !isRecord(retrieval.content)
  ) {
    return err("INVALID_RETRIEVAL_RESULT");
  }
  if (retrieval.outcome !== "resolved" || retrieval.reason !== "content_retrieved") {
    return err("RETRIEVAL_NOT_RESOLVED");
  }
  const requestedUrl = nonEmptyString(retrieval.source.requestedUrl);
  const finalUrl = nonEmptyString(retrieval.source.finalUrl);
  const publisherHost = nonEmptyString(retrieval.source.publisherHost);
  const body = nonEmptyString(retrieval.content.body);
  if (
    !requestedUrl ||
    !finalUrl ||
    !publisherHost ||
    !body ||
    !isSafeSourceUrl(requestedUrl) ||
    !isSafeSourceUrl(finalUrl) ||
    !sameOrigin(requestedUrl, finalUrl) ||
    new URL(finalUrl).hostname.toLowerCase() !== publisherHost.toLowerCase() ||
    retrieval.content.format !== "markdown" ||
    retrieval.content.trust !== "untrusted" ||
    retrieval.content.characterCount !== body.length ||
    retrieval.request.format !== "markdown" ||
    retrieval.request.onlyMainContent !== true ||
    retrieval.request.maxAge !== 0 ||
    retrieval.request.storeInCache !== false ||
    retrieval.request.skipTlsVerification !== false
  ) {
    return err("INVALID_RETRIEVAL_RESULT");
  }

  const researchQuestion = validateApprovedResearchQuestion(
    retrieval.researchQuestion,
    attemptedAt
  );
  if (!researchQuestion.ok || researchQuestion.value.runId !== runId) {
    return err("RESEARCH_QUESTION_MISMATCH");
  }

  const preparedSource = prepareSourceRetrieval(
    input.sourceIntake,
    requestedUrl,
    attemptedAt
  );
  if (!preparedSource.ok) {
    return err("INVALID_SOURCE_INTAKE");
  }
  if (
    preparedSource.value.runId !== runId ||
    preparedSource.value.providerItemId !== sourceLeadProviderItemId ||
    preparedSource.value.researchQuestion.id !== researchQuestion.value.id ||
    preparedSource.value.researchQuestion.artifactSha256 !==
      researchQuestion.value.artifactSha256
  ) {
    return err("SOURCE_INTAKE_MISMATCH");
  }

  const sourceIntakeArtifactRef = nonEmptyString(input.sourceIntakeArtifactRef);
  const retrievalArtifactRef = nonEmptyString(input.retrievalArtifactRef);
  const sourceDocumentArtifactRef = nonEmptyString(input.sourceDocumentArtifactRef);
  const assessmentArtifactRef = nonEmptyString(input.assessmentArtifactRef);
  const decisionArtifactRef = nonEmptyString(input.decisionArtifactRef);
  const requestArtifactRef = nonEmptyString(retrieval.lineage.requestArtifactRef);
  const rawArtifactRef = nonEmptyString(retrieval.lineage.rawArtifactRef);
  const recordedSourceIntakeSha256 = sha256(retrieval.lineage.intakeArtifactSha256);
  const recordedRequestSha256 = sha256(retrieval.lineage.requestArtifactSha256);
  const recordedRawSha256 = sha256(retrieval.lineage.rawArtifactSha256);
  const sourceIntakeSha256 = sha256(input.artifactChecksums.sourceIntakeSha256);
  const retrievalSha256 = sha256(input.artifactChecksums.retrievalSha256);
  const requestSha256 = sha256(input.artifactChecksums.requestSha256);
  const rawSha256 = sha256(input.artifactChecksums.rawSha256);
  const sourceDocumentSha256 = sha256(
    input.artifactChecksums.sourceDocumentSha256
  );
  const assessmentSha256 = sha256(input.artifactChecksums.assessmentSha256);
  const decisionSha256 = sha256(input.artifactChecksums.decisionSha256);
  const promptSha256 = sha256(input.artifactChecksums.promptSha256);
  const responseSha256 = sha256(input.artifactChecksums.responseSha256);
  if (
    !sourceIntakeArtifactRef ||
    sourceIntakeArtifactRef !== retrieval.lineage.intakeArtifactRef ||
    !retrievalArtifactRef ||
    !sourceDocumentArtifactRef ||
    !assessmentArtifactRef ||
    !decisionArtifactRef ||
    !requestArtifactRef ||
    !rawArtifactRef ||
    !recordedSourceIntakeSha256 ||
    !recordedRequestSha256 ||
    !recordedRawSha256 ||
    !sourceIntakeSha256 ||
    !retrievalSha256 ||
    !requestSha256 ||
    !rawSha256 ||
    !sourceDocumentSha256 ||
    !assessmentSha256 ||
    !decisionSha256 ||
    !promptSha256 ||
    !responseSha256 ||
    sourceIntakeSha256 !== recordedSourceIntakeSha256 ||
    requestSha256 !== recordedRequestSha256 ||
    rawSha256 !== recordedRawSha256
  ) {
    return err("INVALID_ARTIFACT_LINEAGE");
  }

  const sourceDocument = validateSourceDocument(input.sourceDocument);
  if (!sourceDocument.ok) {
    return err("INVALID_SOURCE_DOCUMENT");
  }
  if (
    sourceDocument.value.runId !== runId ||
    sourceDocument.value.sourceItemId !== retrievalId ||
    sourceDocument.value.sourceKind !== "retrieved-publisher" ||
    sourceDocument.value.sourceArtifactRef !== retrievalArtifactRef ||
    sourceDocument.value.sourceArtifactSha256 !== retrievalSha256 ||
    !isDeepStrictEqual(sourceDocument.value.lineageArtifactRefs, [
      {
        artifactRef: sourceIntakeArtifactRef,
        artifactSha256: sourceIntakeSha256
      },
      { artifactRef: requestArtifactRef, artifactSha256: requestSha256 },
      { artifactRef: rawArtifactRef, artifactSha256: rawSha256 }
    ])
  ) {
    return err("SOURCE_DOCUMENT_MISMATCH");
  }

  if (!isRecord(input.relevanceAssessment) || !isRecord(input.relevanceDecision)) {
    return err("INVALID_RELEVANCE_ASSESSMENT");
  }
  const relevance = validateQuestionRelevanceAssessment({
    assessedAt: input.relevanceAssessment.assessedAt,
    researchQuestion: researchQuestion.value,
    sourceDocument: sourceDocument.value,
    sourceDocumentArtifactRef,
    sourceDocumentArtifactSha256: sourceDocumentSha256,
    modelInvocation: input.relevanceAssessment.modelInvocation,
    proposal: {
      verdict: input.relevanceAssessment.verdict,
      rationale: input.relevanceAssessment.rationale,
      support: input.relevanceAssessment.support,
      limitations: input.relevanceAssessment.limitations
    }
  });
  if (
    !relevance.ok ||
    !isDeepStrictEqual(relevance.value.assessment, input.relevanceAssessment) ||
    !isDeepStrictEqual(relevance.value.decision, input.relevanceDecision)
  ) {
    return err("INVALID_RELEVANCE_ASSESSMENT");
  }
  if (
    relevance.value.decision.destination !== "evidence_candidate_proposal" ||
    relevance.value.decision.approvalStatus !== "pending_human_review" ||
    (relevance.value.assessment.verdict !== "relevant" &&
      relevance.value.assessment.verdict !== "partially-relevant")
  ) {
    return err("NON_POSITIVE_RELEVANCE");
  }
  if (
    Date.parse(convertedAt) < Date.parse(relevance.value.assessment.assessedAt) ||
    relevance.value.assessment.modelInvocation.promptArtifactSha256 !==
      promptSha256 ||
    relevance.value.assessment.modelInvocation.responseArtifactSha256 !==
      responseSha256
  ) {
    return err("INVALID_ARTIFACT_LINEAGE");
  }

  const limitations = stringArray(retrieval.limitations);
  if (!limitations) {
    return err("INVALID_RETRIEVAL_RESULT");
  }

  const item: RetrievedSourceEvidenceCandidate = {
    provider: "source_retrieval",
    endpoint: FIRECRAWL_ENDPOINT,
    providerItemId: candidateId,
    sourceType: "publisher_source",
    retrievedAt: receivedAt,
    rawArtifactRef,
    sourceLinks: requestedUrl === finalUrl ? [requestedUrl] : [requestedUrl, finalUrl],
    referenceCount: 1,
    hasSourceMetadata: true,
    researchQuestion: researchQuestion.value,
    role: "evidence_candidate",
    contentCompleteness: "captured_content",
    source: {
      requestedUrl,
      finalUrl,
      publisherHost,
      title: nonEmptyString(retrieval.source.title)
    },
    retrievalLineage: {
      retrievalId,
      sourceLeadProviderItemId,
      sourceIntakeArtifactRef,
      sourceIntakeArtifactSha256: sourceIntakeSha256,
      retrievalArtifactRef,
      retrievalArtifactSha256: retrievalSha256,
      requestArtifactRef,
      requestArtifactSha256: requestSha256,
      rawArtifactRef,
      rawArtifactSha256: rawSha256
    },
    questionRelevance: {
      assessmentArtifactRef,
      assessmentArtifactSha256: assessmentSha256,
      decisionArtifactRef,
      decisionArtifactSha256: decisionSha256,
      assessment: relevance.value.assessment,
      decision: relevance.value.decision
    },
    limitations
  };

  return ok({
    item,
    decision: decideRoute(item),
    ledgerEntry: createLedgerEntry(runId, convertedAt, item)
  });
};