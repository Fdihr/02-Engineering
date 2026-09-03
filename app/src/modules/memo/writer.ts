import { err, ok, type Result } from "../../core/result.js";
import type { ApprovedResearchQuestion } from "../../core/types.js";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  boundedString,
  canonicalJson,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../assurance/validators.js";
import type {
  ChallengeCheck,
  ChallengeRecord,
  ProvisionalAdjudication
} from "../synthesis/challenge.js";
import {
  readStrictAliasedValue,
  unwrapStrictArray
} from "../synthesis/proposal.js";
import type { BuiltClaim, SynthesisBuildRecord } from "../synthesis/types.js";

export const MEMO_STANDARD_SCHEMA_VERSION = "memo-standard-pack-v0" as const;
export const WRITER_REQUEST_SCHEMA_VERSION = "memo-writer-request-v1" as const;
export const WRITER_RESPONSE_SCHEMA_VERSION = "memo-writer-copilot-response-v1" as const;
export const MEMO_DOCUMENT_SCHEMA_VERSION = "intelligence-memo-v1" as const;
export const MEMO_VERIFICATION_SCHEMA_VERSION = "memo-deterministic-verification-v1" as const;
export const WRITER_RECORD_SCHEMA_VERSION = "memo-writer-record-v1" as const;
export const WRITER_PROVIDER = "github-copilot-vscode" as const;
export const WRITER_MODEL = "not-exposed-by-host" as const;

export const WRITER_SECTIONS = [
  "bluf",
  "key-judgments",
  "analysis",
  "uncertainties",
  "indicators"
] as const;
export type WriterSection = (typeof WRITER_SECTIONS)[number];

export type MemoStandardV0 = {
  schemaVersion: typeof MEMO_STANDARD_SCHEMA_VERSION;
  id: "memo-standard-v0";
  version: 0;
  status: "provisional-standard";
  authoredAt: string;
  sourceMemoRefs: [];
  requiredSections: string[];
  confidenceLexicon: Record<"low" | "moderate" | "high", string>;
  citationRule: string;
  prohibitedPatterns: string[];
  limits: {
    maxWords: number;
    blufStatements: 1;
    keyJudgmentsPerClaim: 1;
    maxAnalysisStatements: number;
    maxUncertaintyStatements: number;
    maxIndicatorStatements: number;
  };
};

export type WriterStatementProposal = {
  section: WriterSection;
  text: string;
  claimAliases: string[];
};

export type WriterRequest = {
  schemaVersion: typeof WRITER_REQUEST_SCHEMA_VERSION;
  id: string;
  preparedAt: string;
  runId: string;
  stage: "memo-writer";
  provider: typeof WRITER_PROVIDER;
  model: typeof WRITER_MODEL;
  reviewStatus: SynthesisBuildRecord["reviewStatus"];
  limitedEvidence: boolean;
  informationCutoffAt: string;
  buildRecord: ArtifactBinding;
  challengeRecord: ArtifactBinding;
  provisionalAdjudication: ArtifactBinding;
  approvedQuestion: ArtifactBinding;
  approvedScope: null;
  memoStandard: ArtifactBinding;
  claims: Array<{
    alias: string;
    claimId: string;
    statement: string;
    kind: BuiltClaim["kind"];
    attributedTo?: string;
    status: "proposed" | "contested";
    openChallenges: Array<{
      id: string;
      check: string;
      rationale: string;
    }>;
    confidenceLevel: BuiltClaim["confidence"]["level"];
    confidenceCeiling: BuiltClaim["confidenceCeiling"];
  }>;
  requiredAlternativeCount: number;
  requiredGaps: Array<{ irId: string; disposition: "partial" | "silent" }>;
  derivedSourcingSummary: string;
  derivedLimitations: string[];
  standard: MemoStandardV0;
  prompt: { system: string; user: string };
};

export type MemoStatement = {
  id: string;
  section: WriterSection;
  text: string;
  claimIds: string[];
  claimCitations: string[];
  status: "proposed" | "contested";
  openChallengeIds: string[];
  openChallengeChecks: string[];
};

export type MemoDocument = {
  schemaVersion: typeof MEMO_DOCUMENT_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  runId: string;
  version: 1;
  status: "draft";
  supersedesMemoId?: string;
  reviewStatus: SynthesisBuildRecord["reviewStatus"];
  limitedEvidence: boolean;
  informationCutoffAt: string;
  notForPublication: true;
  publicationBlockers: string[];
  memoStandardId: string;
  memoStandardVersion: 0;
  approvedQuestionId: string;
  approvedScope: null;
  lineage: {
    buildRecord: ArtifactBinding;
    challengeRecord: ArtifactBinding;
    provisionalAdjudication: ArtifactBinding;
    approvedQuestion: ArtifactBinding;
    memoStandard: ArtifactBinding;
  };
  bluf: MemoStatement[];
  keyJudgments: Array<{
    statement: MemoStatement;
    confidence: {
      level: "unknown" | "low" | "moderate" | "high";
      ceiling: "unknown" | "low" | "moderate" | "high";
      boundedByClaimIds: string[];
      rationale: string;
    };
  }>;
  analysis: MemoStatement[];
  uncertainties: MemoStatement[];
  competingExplanations: Array<{
    id: string;
    claimId: string;
    challengeId: string;
    status: "hypothesis";
    text: string;
    claimCitation: string;
  }>;
  gaps: Array<{ irId: string; disposition: "partial" | "silent" }>;
  sourcingSummary: {
    claimBearingSourceCount: number;
    singleSourceDependent: boolean;
    reportingDependencies: string[];
    syntheticLineage: boolean;
    text: string;
  };
  indicators: MemoStatement[];
  limitations: string[];
  retainedSourceLimitationIds: string[];
};

export type MemoVerification = {
  schemaVersion: typeof MEMO_VERIFICATION_SCHEMA_VERSION;
  memoId: string;
  verifiedAt: string;
  contentVerdict: "pass";
  publicationVerdict: "block";
  checks: Array<{ check: string; status: "pass" }>;
  blockers: string[];
};

export type WriterRecord = {
  schemaVersion: typeof WRITER_RECORD_SCHEMA_VERSION;
  id: string;
  recordedAt: string;
  runId: string;
  reviewStatus: SynthesisBuildRecord["reviewStatus"];
  limitedEvidence: boolean;
  request: ArtifactBinding;
  response: ArtifactBinding;
  revalidationAuthorisation?: ArtifactBinding;
  invocation: {
    id: string;
    provider: typeof WRITER_PROVIDER;
    model: typeof WRITER_MODEL;
    startedAt: string;
    completedAt: string;
    freshSession: true;
    capturedBy: string;
  };
  memo: MemoDocument;
  verification: MemoVerification;
};

export type WriterError =
  | "INVALID_MEMO_STANDARD"
  | "INVALID_WRITER_REQUEST"
  | "WRITER_INPUT_MISMATCH"
  | "INVALID_WRITER_RESPONSE"
  | "INVALID_WRITER_COVERAGE"
  | "PROHIBITED_MEMO_PATTERN"
  | "MEMO_TOO_LONG"
  | "INVALID_INVOCATION_CHRONOLOGY"
  | "FRESH_SESSION_NOT_ATTESTED"
  | "INVALID_ARTIFACT_BINDING";

const confidenceRank = { unknown: 0, low: 1, moderate: 2, high: 3 } as const;
const countWord = (value: number): string =>
  ["zero", "one", "two", "three", "four", "five", "six"][value] ?? String(value);

export const validateMemoStandardV0 = (
  value: unknown
): Result<MemoStandardV0, WriterError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== MEMO_STANDARD_SCHEMA_VERSION ||
    value.id !== "memo-standard-v0" ||
    value.version !== 0 ||
    value.status !== "provisional-standard" ||
    !validTime(value.authoredAt) ||
    !Array.isArray(value.sourceMemoRefs) ||
    value.sourceMemoRefs.length !== 0 ||
    !Array.isArray(value.requiredSections) ||
    !isRecord(value.confidenceLexicon) ||
    !nonEmptyString(value.citationRule) ||
    !Array.isArray(value.prohibitedPatterns) ||
    !isRecord(value.limits)
  ) return err("INVALID_MEMO_STANDARD");
  return ok(value as MemoStandardV0);
};

const reportingDependencies = (build: SynthesisBuildRecord): string[] =>
  build.synthesis.limitations
    .map((entry) => entry.text)
    .filter((text) => text.includes("relayed from"));

const sourceSummary = (build: SynthesisBuildRecord): WriterRequest["derivedSourcingSummary"] => {
  const claimSources = new Set(
    build.synthesis.claims.flatMap((claim) => claim.supportingSourceNoteIds)
  );
  const relayed = reportingDependencies(build);
  const evidenceStatus = build.synthesis.claims.some((claim) => claim.provisional)
    ? "provisional"
    : "reviewed";
  return [
    `The claim picture rests on ${claimSources.size} ${evidenceStatus} claim-bearing publisher source.`,
    relayed.length > 0
      ? "Parts of the source reporting relay NYT or WSJ."
      : "No relayed outlet dependency is recorded for the claim support.",
    build.reviewStatus === "synthetic"
      ? "A synthetic non-evidence input remains in lineage."
      : "No synthetic input is present."
  ].join(" ");
};

const derivedLimitations = (build: SynthesisBuildRecord): string[] => [
  ...(build.synthesis.claims.some((claim) => claim.provisional)
    ? ["Evidence is provisional because its observations were not reviewed by a human."]
    : []),
  ...(build.reviewStatus === "synthetic"
    ? ["Synthetic source lineage is present; this memo is not for publication."]
    : []),
  "No checksum-bound approved scope artifact exists for this legacy question.",
  "support check: model-only, unvalidated"
];

const writerPrompt = (request: Omit<WriterRequest, "schemaVersion" | "id" | "prompt">): WriterRequest["prompt"] => ({
  system: [
    "Write a very short threat-intelligence memo proposal.",
    "Return only statement text, section placement, and existing claim aliases.",
    "Do not set confidence, status, challenges, alternatives, gaps, sourcing, limitations, cutoff, citations, or publication state; code derives them.",
    "Provide exactly one BLUF statement citing all claims and exactly one key-judgment statement per claim.",
    "Analysis, uncertainties, and indicators are optional within the standard limits.",
    "Do not introduce facts beyond the supplied claims. Do not hide that claims are contested.",
    "Use only these sections: bluf, key-judgments, analysis, uncertainties, indicators.",
    "Return a bare statements array or one object under statements, output, or result. Unknown fields are rejected."
  ].join("\n"),
  user: JSON.stringify({
    task: "Place concise claim-linked statement text into the allowed memo sections.",
    claims: request.claims,
    requiredAlternativeCount: request.requiredAlternativeCount,
    requiredGaps: request.requiredGaps,
    derivedSourcingSummary: request.derivedSourcingSummary,
    derivedLimitations: request.derivedLimitations,
    standard: request.standard,
    responseShape: {
      statements: [
        {
          section: "bluf | key-judgments | analysis | uncertainties | indicators",
          text: "<concise statement>",
          claims: ["c01"]
        }
      ]
    }
  }, null, 2)
});

export const createWriterRequest = (input: {
  buildRecord: SynthesisBuildRecord;
  buildRecordArtifact: ArtifactBinding;
  challengeRecord: ChallengeRecord;
  challengeRecordArtifact: ArtifactBinding;
  adjudication: ProvisionalAdjudication;
  adjudicationArtifact: ArtifactBinding;
  question: ApprovedResearchQuestion;
  questionArtifact: ArtifactBinding;
  standard: MemoStandardV0;
  standardArtifact: ArtifactBinding;
  preparedAt: string;
}): Result<WriterRequest, WriterError> => {
  const preparedAt = validTime(input.preparedAt);
  const bindings = [
    input.buildRecordArtifact,
    input.challengeRecordArtifact,
    input.adjudicationArtifact,
    input.questionArtifact,
    input.standardArtifact
  ].map(readArtifactBinding);
  if (!preparedAt || bindings.some((binding) => !binding)) {
    return err("INVALID_ARTIFACT_BINDING");
  }
  if (
    input.buildRecord.runId !== input.challengeRecord.runId ||
    input.buildRecord.runId !== input.adjudication.runId ||
    input.buildRecord.runId !== input.question.runId ||
    input.adjudication.adjudicationStatus !== "not-performed"
  ) return err("WRITER_INPUT_MISMATCH");
  const challengeById = new Map(
    input.challengeRecord.results.map((result) => [result.id, result])
  );
  const adjudicationByClaim = new Map(
    input.adjudication.claims.map((claim) => [claim.claimId, claim])
  );
  const claims = input.buildRecord.synthesis.claims.map((claim, index) => {
    const adjudicated = adjudicationByClaim.get(claim.id);
    if (!adjudicated) return undefined;
    return {
      alias: `c${String(index + 1).padStart(2, "0")}`,
      claimId: claim.id,
      statement: claim.statement,
      kind: claim.kind,
      ...(claim.attributedTo ? { attributedTo: claim.attributedTo } : {}),
      status: adjudicated.status,
      openChallenges: adjudicated.openChallengeIds.map((id) => {
        const challenge = challengeById.get(id);
        return challenge
          ? { id, check: challenge.check, rationale: challenge.rationale ?? "" }
          : undefined;
      }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
      confidenceLevel: claim.confidence.level,
      confidenceCeiling: claim.confidenceCeiling
    };
  });
  if (claims.some((claim) => !claim)) return err("WRITER_INPUT_MISMATCH");
  const alternatives = input.challengeRecord.results.filter(
    (result) => result.alternativeHypothesis?.status === "hypothesis"
  );
  const requiredGaps = input.buildRecord.synthesis.questionCoverage
    .filter((entry) => entry.disposition === "partial" || entry.disposition === "silent")
    .map((entry) => ({ irId: entry.irId, disposition: entry.disposition as "partial" | "silent" }));
  const body = {
    preparedAt,
    runId: input.buildRecord.runId,
    stage: "memo-writer" as const,
    provider: WRITER_PROVIDER,
    model: WRITER_MODEL,
    reviewStatus: input.buildRecord.reviewStatus,
    limitedEvidence: input.buildRecord.limitedEvidence,
    informationCutoffAt: input.question.timeWindow.to,
    buildRecord: bindings[0]!,
    challengeRecord: bindings[1]!,
    provisionalAdjudication: bindings[2]!,
    approvedQuestion: bindings[3]!,
    approvedScope: null,
    memoStandard: bindings[4]!,
    claims: claims.filter((claim): claim is NonNullable<typeof claim> => Boolean(claim)),
    requiredAlternativeCount: alternatives.length,
    requiredGaps,
    derivedSourcingSummary: sourceSummary(input.buildRecord),
    derivedLimitations: [
      ...derivedLimitations(input.buildRecord),
      "Human adjudication was not performed; open challenges remain unresolved."
    ],
    standard: input.standard
  };
  return ok({
    schemaVersion: WRITER_REQUEST_SCHEMA_VERSION,
    id: `memo-writer-request-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body,
    prompt: writerPrompt(body)
  });
};

export const validateWriterRequest = (value: unknown): Result<WriterRequest, WriterError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== WRITER_REQUEST_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.preparedAt) ||
    !nonEmptyString(value.runId) ||
    value.stage !== "memo-writer" ||
    value.provider !== WRITER_PROVIDER ||
    value.model !== WRITER_MODEL ||
    !readArtifactBinding(value.buildRecord) ||
    !readArtifactBinding(value.challengeRecord) ||
    !readArtifactBinding(value.provisionalAdjudication) ||
    !readArtifactBinding(value.approvedQuestion) ||
    !readArtifactBinding(value.memoStandard) ||
    value.approvedScope !== null ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.requiredGaps) ||
    !Array.isArray(value.derivedLimitations) ||
    !isRecord(value.standard) ||
    !isRecord(value.prompt)
  ) return err("INVALID_WRITER_REQUEST");
  return ok(value as WriterRequest);
};

const parseWriterProposal = (value: unknown): Result<WriterStatementProposal[], WriterError> => {
  const rows = unwrapStrictArray(value, ["statements", "output", "result"]);
  if (!rows) return err("INVALID_WRITER_RESPONSE");
  const parsed: WriterStatementProposal[] = [];
  for (const row of rows) {
    if (!isRecord(row)) return err("INVALID_WRITER_RESPONSE");
    const allowed = new Set(["section", "text", "statement", "claims", "claimAliases"]);
    if (Object.keys(row).some((key) => !allowed.has(key))) {
      return err("INVALID_WRITER_RESPONSE");
    }
    const section = WRITER_SECTIONS.includes(row.section as WriterSection)
      ? (row.section as WriterSection)
      : undefined;
    const textValue = readStrictAliasedValue(row, ["text", "statement"]);
    const claimsValue = readStrictAliasedValue(row, ["claims", "claimAliases"]);
    const text = textValue?.present ? boundedString(textValue.value, 1_000) : undefined;
    const claimAliases = claimsValue?.present && Array.isArray(claimsValue.value)
      ? claimsValue.value.map((entry) => boundedString(entry, 20))
      : undefined;
    if (
      !section ||
      !text ||
      !claimAliases ||
      claimAliases.length === 0 ||
      !claimAliases.every((entry): entry is string => entry !== undefined) ||
      new Set(claimAliases).size !== claimAliases.length
    ) return err("INVALID_WRITER_RESPONSE");
    parsed.push({ section, text, claimAliases });
  }
  return ok(parsed);
};

const minimumConfidence = (claims: BuiltClaim[]): "unknown" | "low" | "moderate" | "high" =>
  claims
    .map((claim) => claim.confidence.level)
    .sort((left, right) => confidenceRank[left] - confidenceRank[right])[0] ?? "unknown";

export const recordWriterResponse = (input: {
  request: WriterRequest;
  requestArtifact: ArtifactBinding;
  responseValue: unknown;
  responseArtifact: ArtifactBinding;
  buildRecord: SynthesisBuildRecord;
  challengeRecord: ChallengeRecord;
  adjudication: ProvisionalAdjudication;
  question: ApprovedResearchQuestion;
  standard: MemoStandardV0;
  revalidationAuthorisation?: ArtifactBinding;
  supersedesMemoId?: string;
  recordedAt: string;
}): Result<WriterRecord, WriterError> => {
  const recordedAt = validTime(input.recordedAt);
  const requestArtifact = readArtifactBinding(input.requestArtifact);
  const responseArtifact = readArtifactBinding(input.responseArtifact);
  const revalidationAuthorisation = input.revalidationAuthorisation
    ? readArtifactBinding(input.revalidationAuthorisation)
    : undefined;
  if (
    !recordedAt ||
    !requestArtifact ||
    !responseArtifact ||
    (input.revalidationAuthorisation && !revalidationAuthorisation)
  ) {
    return err("INVALID_ARTIFACT_BINDING");
  }
  if (
    !isRecord(input.responseValue) ||
    !hasOnlyKeys(input.responseValue, [
      "schemaVersion", "requestId", "invocationId", "provider", "model",
      "startedAt", "completedAt", "freshSession", "capturedBy", "proposal"
    ]) ||
    input.responseValue.schemaVersion !== WRITER_RESPONSE_SCHEMA_VERSION ||
    input.responseValue.requestId !== input.request.id ||
    input.responseValue.provider !== WRITER_PROVIDER ||
    input.responseValue.model !== WRITER_MODEL
  ) return err("INVALID_WRITER_RESPONSE");
  if (input.responseValue.freshSession !== true) return err("FRESH_SESSION_NOT_ATTESTED");
  const invocationId = nonEmptyString(input.responseValue.invocationId);
  const startedAt = validTime(input.responseValue.startedAt);
  const completedAt = validTime(input.responseValue.completedAt);
  const capturedBy = nonEmptyString(input.responseValue.capturedBy);
  if (!invocationId || !startedAt || !completedAt || !capturedBy) {
    return err("INVALID_WRITER_RESPONSE");
  }
  if (
    Date.parse(startedAt) < Date.parse(input.request.preparedAt) ||
    Date.parse(startedAt) > Date.parse(completedAt)
  ) return err("INVALID_INVOCATION_CHRONOLOGY");
  const proposal = parseWriterProposal(input.responseValue.proposal);
  if (!proposal.ok) return proposal;
  const claimByAlias = new Map(input.request.claims.map((claim) => [claim.alias, claim]));
  if (proposal.value.some((statement) => statement.claimAliases.some((alias) => !claimByAlias.has(alias)))) {
    return err("INVALID_WRITER_COVERAGE");
  }
  const bluf = proposal.value.filter((entry) => entry.section === "bluf");
  const judgments = proposal.value.filter((entry) => entry.section === "key-judgments");
  const allAliases = input.request.claims.map((claim) => claim.alias).sort();
  if (
    bluf.length !== 1 ||
    [...bluf[0]!.claimAliases].sort().join() !== allAliases.join() ||
    judgments.length !== input.request.claims.length ||
    judgments.some((entry) => entry.claimAliases.length !== 1) ||
    [...judgments.map((entry) => entry.claimAliases[0])].sort().join() !== allAliases.join() ||
    proposal.value.filter((entry) => entry.section === "analysis").length > input.standard.limits.maxAnalysisStatements ||
    proposal.value.filter((entry) => entry.section === "uncertainties").length > input.standard.limits.maxUncertaintyStatements ||
    proposal.value.filter((entry) => entry.section === "indicators").length > input.standard.limits.maxIndicatorStatements
  ) return err("INVALID_WRITER_COVERAGE");
  const modelWords = proposal.value
    .flatMap((entry) => entry.text.trim().split(/\s+/))
    .filter(Boolean).length;
  if (modelWords > input.standard.limits.maxWords) return err("MEMO_TOO_LONG");
  const prohibited = input.standard.prohibitedPatterns.map((pattern) => pattern.toLowerCase());
  if (proposal.value.some((entry) => prohibited.some((pattern) => entry.text.toLowerCase().includes(pattern)))) {
    return err("PROHIBITED_MEMO_PATTERN");
  }
  const adjudicationByClaim = new Map(input.adjudication.claims.map((claim) => [claim.claimId, claim]));
  const claimSourceCount = new Set(
    input.buildRecord.synthesis.claims.flatMap((claim) => claim.supportingSourceNoteIds)
  ).size;
  const contestedCount = input.adjudication.claims.filter(
    (claim) => claim.status === "contested"
  ).length;
  const alternativeCount = input.challengeRecord.results.filter(
    (result) => result.alternativeHypothesis?.status === "hypothesis"
  ).length;
  const silentCount = input.buildRecord.synthesis.questionCoverage.filter(
    (entry) => entry.disposition === "silent"
  ).length;
  const hasRelayedReporting = reportingDependencies(input.buildRecord).length > 0;
  const evidenceStatus = input.buildRecord.synthesis.claims.some(
    (claim) => claim.provisional
  )
    ? "provisional"
    : "reviewed";
  const derivedBluf = [
    `This not-for-publication picture rests on ${countWord(claimSourceCount)} ${evidenceStatus} claim-bearing source${claimSourceCount === 1 ? "" : "s"}${hasRelayedReporting ? " with relayed reporting" : ""}:`,
    `${countWord(contestedCount)} contested low-confidence claims,`,
    `${countWord(alternativeCount)} competing explanation${alternativeCount === 1 ? "" : "s"}, and`,
    `${countWord(silentCount)} silent information requirement${silentCount === 1 ? "" : "s"}.`
  ].join(" ");
  const makeStatement = (entry: WriterStatementProposal): MemoStatement => {
    const claims = entry.claimAliases.map((alias) => claimByAlias.get(alias)!).map((requestClaim) =>
      input.buildRecord.synthesis.claims.find((claim) => claim.id === requestClaim.claimId)!
    );
    const openChallengeIds = claims.flatMap(
      (claim) => adjudicationByClaim.get(claim.id)?.openChallengeIds ?? []
    );
    const openChallengeChecks = [
      ...new Set(
        openChallengeIds
          .map((id) => input.challengeRecord.results.find((result) => result.id === id)?.check)
          .filter((check): check is ChallengeCheck => check !== undefined)
      )
    ];
    const claimIds = claims.map((claim) => claim.id);
    const text = entry.section === "bluf" ? derivedBluf : entry.text;
    return {
      id: `memo-statement-${sha256Text(canonicalJson({ section: entry.section, text, claimIds })).slice(0, 24)}`,
      section: entry.section,
      text,
      claimIds,
      claimCitations: claimIds.map((id) => `[claim:${id}]`),
      status: openChallengeIds.length > 0 ? "contested" : "proposed",
      openChallengeIds: [...new Set(openChallengeIds)],
      openChallengeChecks
    };
  };
  const statements = proposal.value.map(makeStatement);
  const keyJudgments = statements
    .filter((statement) => statement.section === "key-judgments")
    .map((statement) => {
      const claims = statement.claimIds.map((id) =>
        input.buildRecord.synthesis.claims.find((claim) => claim.id === id)!
      );
      const level = minimumConfidence(claims);
      const ceiling = claims
        .map((claim) => claim.confidenceCeiling)
        .sort((left, right) => confidenceRank[left] - confidenceRank[right])[0] ?? "unknown";
      return {
        statement,
        confidence: {
          level: confidenceRank[level] <= confidenceRank[ceiling] ? level : ceiling,
          ceiling,
          boundedByClaimIds: statement.claimIds,
          rationale: input.standard.confidenceLexicon[ceiling === "unknown" ? "low" : ceiling]
        }
      };
    });
  const alternatives = input.challengeRecord.results
    .filter((result) => result.alternativeHypothesis?.status === "hypothesis")
    .map((result) => ({
      id: `memo-alternative-${result.id}`,
      claimId: result.claimId,
      challengeId: result.id,
      status: "hypothesis" as const,
      text: result.alternativeHypothesis!.text,
      claimCitation: `[claim:${result.claimId}]`
    }));
  const gaps = input.buildRecord.synthesis.questionCoverage
    .filter((entry) => entry.disposition === "partial" || entry.disposition === "silent")
    .map((entry) => ({
      irId: entry.irId,
      disposition: entry.disposition as "partial" | "silent"
    }));
  const claimSourceIds = new Set(
    input.buildRecord.synthesis.claims.flatMap((claim) => claim.supportingSourceNoteIds)
  );
  const dependencies = reportingDependencies(input.buildRecord);
  const blockers = [
    ...(input.buildRecord.reviewStatus === "synthetic" ? ["SYNTHETIC_SOURCE_LINEAGE"] : []),
    ...(input.buildRecord.synthesis.claims.some((claim) => claim.provisional)
      ? ["PROVISIONAL_SOURCE_LINEAGE"]
      : []),
    "ADJUDICATION_NOT_PERFORMED",
    "PROVISIONAL_MEMO_STANDARD",
    "LEGACY_SCOPE_LINEAGE_UNAVAILABLE"
  ];
  const memoBody = {
    createdAt: recordedAt,
    runId: input.request.runId,
    version: 1 as const,
    status: "draft" as const,
    ...(input.supersedesMemoId ? { supersedesMemoId: input.supersedesMemoId } : {}),
    reviewStatus: input.buildRecord.reviewStatus,
    limitedEvidence: input.buildRecord.limitedEvidence,
    informationCutoffAt: input.request.informationCutoffAt,
    notForPublication: true as const,
    publicationBlockers: blockers,
    memoStandardId: input.standard.id,
    memoStandardVersion: 0 as const,
    approvedQuestionId: input.question.id,
    approvedScope: null,
    lineage: {
      buildRecord: input.request.buildRecord,
      challengeRecord: input.request.challengeRecord,
      provisionalAdjudication: input.request.provisionalAdjudication,
      approvedQuestion: input.request.approvedQuestion,
      memoStandard: input.request.memoStandard
    },
    bluf: statements.filter((statement) => statement.section === "bluf"),
    keyJudgments,
    analysis: statements.filter((statement) => statement.section === "analysis"),
    uncertainties: statements.filter((statement) => statement.section === "uncertainties"),
    competingExplanations: alternatives,
    gaps,
    sourcingSummary: {
      claimBearingSourceCount: claimSourceIds.size,
      singleSourceDependent: input.buildRecord.synthesis.claims.every(
        (claim) => claim.singleSourceDependent
      ),
      reportingDependencies: dependencies,
      syntheticLineage: input.buildRecord.reviewStatus === "synthetic",
      text: input.request.derivedSourcingSummary
    },
    indicators: statements.filter((statement) => statement.section === "indicators"),
    limitations: input.request.derivedLimitations,
    retainedSourceLimitationIds: input.buildRecord.synthesis.limitations.map((entry) => entry.id)
  };
  const memo: MemoDocument = {
    schemaVersion: MEMO_DOCUMENT_SCHEMA_VERSION,
    id: `memo-${sha256Text(canonicalJson(memoBody)).slice(0, 32)}`,
    ...memoBody
  };
  const renderedWordCount = renderMemoMarkdown(memo)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (renderedWordCount > input.standard.limits.maxWords) {
    return err("MEMO_TOO_LONG");
  }
  const checks = [
    "required-sections-present",
    "bluf-derived-from-evidence-counts",
    "all-statements-resolve-to-claims",
    "all-contested-claims-retain-open-challenges",
    "key-judgment-confidence-bounded",
    "all-alternatives-preserved",
    "all-gaps-preserved",
    "sourcing-summary-derived",
    "plain-provisional-and-synthetic-limitations",
    "information-cutoff-present",
    "word-limit-and-prohibited-patterns"
  ].map((check) => ({ check, status: "pass" as const }));
  const verification: MemoVerification = {
    schemaVersion: MEMO_VERIFICATION_SCHEMA_VERSION,
    memoId: memo.id,
    verifiedAt: recordedAt,
    contentVerdict: "pass",
    publicationVerdict: "block",
    checks,
    blockers
  };
  const body = {
    recordedAt,
    runId: input.request.runId,
    reviewStatus: input.buildRecord.reviewStatus,
    limitedEvidence: input.buildRecord.limitedEvidence,
    request: requestArtifact,
    response: responseArtifact,
    ...(revalidationAuthorisation ? { revalidationAuthorisation } : {}),
    invocation: {
      id: invocationId,
      provider: WRITER_PROVIDER,
      model: WRITER_MODEL,
      startedAt,
      completedAt,
      freshSession: true as const,
      capturedBy
    },
    memo,
    verification
  };
  return ok({
    schemaVersion: WRITER_RECORD_SCHEMA_VERSION,
    id: `memo-writer-record-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body
  });
};

const renderStatements = (statements: MemoStatement[]): string[] =>
  statements.length === 0
    ? []
    : statements.map((statement) =>
        `- ${statement.text} ${statement.claimCitations.join(" ")} ${
          statement.openChallengeIds.length > 0
            ? `**Contested: ${statement.openChallengeIds.length} open challenge${statement.openChallengeIds.length === 1 ? "" : "s"}.**`
            : "**Status: proposed.**"
        }`
      );

export const renderMemoMarkdown = (memo: MemoDocument): string => [
  "# Threat Intelligence Memo",
  "",
  "> **NOT FOR PUBLICATION**",
  `> Blockers: ${memo.publicationBlockers.join(", ")}`,
  "",
  `Information cutoff: ${memo.informationCutoffAt}`,
  "",
  "## BLUF",
  ...renderStatements(memo.bluf),
  "",
  "## Key Judgements",
  ...memo.keyJudgments.flatMap((entry) => [
    ...renderStatements([entry.statement]),
    `  Confidence: **${entry.confidence.level}** (ceiling: ${entry.confidence.ceiling}).`
  ]),
  "",
  "## Analysis",
  ...renderStatements(memo.analysis),
  "",
  "## Uncertainties",
  ...renderStatements(memo.uncertainties),
  "",
  "## Competing Explanations",
  ...memo.competingExplanations.map(
    (entry) => `- **Hypothesis:** ${entry.text} ${entry.claimCitation}`
  ),
  "",
  "## Gaps",
  ...memo.gaps.map((gap) => `- ${gap.irId}: ${gap.disposition}`),
  "",
  "## Sourcing Summary",
  memo.sourcingSummary.text,
  "",
  "## Indicators",
  ...renderStatements(memo.indicators),
  "",
  "## Limitations",
  ...memo.limitations.map((limitation) => `- ${limitation}`),
  `- ${memo.retainedSourceLimitationIds.length} source limitations remain retained in canonical JSON.`,
  ""
].join("\n");