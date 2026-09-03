import { err, ok, type Result } from "../../core/result.js";
import type { Disposition, NoteObservation, SourceNote } from "../assurance/types.js";
import {
  canonicalJson,
  isRecord,
  nonEmptyString,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../assurance/validators.js";
import { resolveOutletId } from "./policy.js";
import type {
  BoundSourceNote,
  BuildClaimProposal,
  BuildObservationAlias,
  BuiltClaim,
  ExternalSynthesis,
  ObservationRelationship,
  OutletIdentityTable,
  ReliabilityBand,
  ReportingRelationship,
  SourceAppendixEntry,
  SynthesisBuildEnvelope,
  SynthesisLimitation,
  SynthesisProfilePolicy,
  SynthesisQuestionCoverage
} from "./types.js";
import {
  BUILD_ENVELOPE_SCHEMA_VERSION,
  EXTERNAL_SYNTHESIS_SCHEMA_VERSION
} from "./types.js";

export type BuildError =
  | "INVALID_BUILD_ENVELOPE"
  | "INVALID_BUILD_TIME"
  | "SOURCE_NOTE_RUN_MISMATCH"
  | "POLICY_OUTLET_MISMATCH"
  | "INVALID_CLAIM_PROPOSAL"
  | "CLAIM_KIND_EXCEEDS_SUPPORT"
  | "CONFIDENCE_EXCEEDS_CEILING"
  | "MISSING_CONFIDENCE_CEILING";

const confidenceRank = {
  unknown: 0,
  low: 1,
  moderate: 2,
  high: 3
} as const;

const observations = (note: SourceNote): NoteObservation[] => [
  ...note.inScopeObservations,
  ...note.outOfIrObservations
];

export const validateSynthesisBuildEnvelope = (
  value: unknown
): Result<SynthesisBuildEnvelope, BuildError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== BUILD_ENVELOPE_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.createdAt) ||
    !nonEmptyString(value.runId) ||
    (value.reviewStatus !== "reviewed" &&
      value.reviewStatus !== "provisional" &&
      value.reviewStatus !== "synthetic") ||
    !Array.isArray(value.sourceNotes) ||
    !value.sourceNotes.every((entry) => readArtifactBinding(entry) !== undefined) ||
    !Array.isArray(value.sourceNoteIds) ||
    !Array.isArray(value.supersedesNoteIds) ||
    !readArtifactBinding(value.policy) ||
    !readArtifactBinding(value.outletIdentityTable) ||
    !Array.isArray(value.aliases) ||
    !Array.isArray(value.observationRelationships) ||
    !Array.isArray(value.questionCoverage) ||
    !Array.isArray(value.intelligenceGaps) ||
    !Array.isArray(value.limitations) ||
    typeof value.limitedEvidence !== "boolean" ||
    !isRecord(value.delta)
  ) {
    return err("INVALID_BUILD_ENVELOPE");
  }
  return ok(value as SynthesisBuildEnvelope);
};

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

const effectiveIrIds = (observation: NoteObservation): string[] =>
  observation.correctedIrIds ?? observation.irIds;

const notePublisherOutlet = (
  note: SourceNote,
  table: OutletIdentityTable
): string | undefined =>
  note.sourceIdentity.kind === "publisher"
    ? resolveOutletId(note.sourceIdentity.publisherHost, table)
    : undefined;

const upstreamOutlets = (
  observation: NoteObservation,
  table: OutletIdentityTable
): string[] =>
  observation.attribution.kind === "relayed"
    ? uniqueSorted([
        resolveOutletId(observation.attribution.attributedTo, table) ?? ""
      ].filter(Boolean))
    : [];

const relationshipFor = (
  leftNote: SourceNote,
  left: NoteObservation,
  rightNote: SourceNote,
  right: NoteObservation,
  table: OutletIdentityTable
): { relationship: ReportingRelationship; upstreamOutletIds: string[]; rationale: string } => {
  const leftUpstream = upstreamOutlets(left, table);
  const rightUpstream = upstreamOutlets(right, table);
  const shared = leftUpstream.filter((outletId) => rightUpstream.includes(outletId));
  if (shared.length > 0) {
    return {
      relationship: "shared-origin",
      upstreamOutletIds: shared,
      rationale: "Both observations resolve to the same upstream outlet."
    };
  }
  const leftPublisher = notePublisherOutlet(leftNote, table);
  const rightPublisher = notePublisherOutlet(rightNote, table);
  const derivative =
    (leftPublisher && rightUpstream.includes(leftPublisher)) ||
    (rightPublisher && leftUpstream.includes(rightPublisher));
  if (derivative) {
    return {
      relationship: "derivative",
      upstreamOutletIds: uniqueSorted([...leftUpstream, ...rightUpstream]),
      rationale: "One observation relays the publisher of the other source note."
    };
  }
  if (
    leftPublisher &&
    rightPublisher &&
    leftPublisher !== rightPublisher &&
    leftUpstream.length === 0 &&
    rightUpstream.length === 0
  ) {
    return {
      relationship: "independent",
      upstreamOutletIds: [],
      rationale: "Distinct known publishers report without a relayed upstream outlet."
    };
  }
  return {
    relationship: "unknown",
    upstreamOutletIds: uniqueSorted([...leftUpstream, ...rightUpstream]),
    rationale: "Available outlet identity and attribution do not establish independence."
  };
};

const deriveRelationships = (
  notes: SourceNote[],
  table: OutletIdentityTable
): ObservationRelationship[] => {
  const relationships: ObservationRelationship[] = [];
  for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
    const leftNote = notes[leftIndex];
    if (!leftNote) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < notes.length; rightIndex += 1) {
      const rightNote = notes[rightIndex];
      if (!rightNote) continue;
      for (const left of observations(leftNote)) {
        for (const right of observations(rightNote)) {
          const result = relationshipFor(leftNote, left, rightNote, right, table);
          relationships.push({
            id: `relationship-${sha256Text(
              `${left.observationId}\u001f${right.observationId}`
            ).slice(0, 24)}`,
            leftSourceNoteId: leftNote.id,
            rightSourceNoteId: rightNote.id,
            leftObservationId: left.observationId,
            rightObservationId: right.observationId,
            ...result
          });
        }
      }
    }
  }
  return relationships;
};

const dispositionRank: Record<Disposition, number> = {
  silent: 0,
  contradicted: 1,
  partial: 2,
  covered: 3
};

const deriveCoverage = (notes: SourceNote[]): SynthesisQuestionCoverage[] => {
  const irIds = uniqueSorted(notes.flatMap((note) => note.irDispositions.map((entry) => entry.irId)));
  return irIds.map((irId) => {
    const entries = notes.flatMap((note) => {
      const disposition = note.irDispositions.find((entry) => entry.irId === irId);
      return disposition ? [{ note, disposition }] : [];
    });
    const selected = entries
      .map(({ disposition }) => disposition.finalDisposition ?? disposition.modelDisposition)
      .sort((left, right) => dispositionRank[right] - dispositionRank[left])[0] ?? "silent";
    const observationIds = entries.flatMap(({ note }) =>
      observations(note)
        .filter((entry) => effectiveIrIds(entry).includes(irId))
        .map((entry) => entry.observationId)
    );
    return {
      irId,
      disposition: selected,
      sourceNoteIds: uniqueSorted(entries.map(({ note }) => note.id)),
      observationIds: uniqueSorted(observationIds),
      provisional: entries.some(({ note }) => note.reviewStatus !== "reviewed")
    };
  });
};

const deriveLimitations = (notes: SourceNote[]): SynthesisLimitation[] =>
  notes.flatMap((note) =>
    note.caveats.map((text) => ({
      id: `limitation-${sha256Text(`${note.id}\u001f${text}`).slice(0, 24)}`,
      kind: "source-caveat" as const,
      sourceNoteIds: [note.id],
      text
    }))
  );

const hasCoverageCaveat = (
  note: SourceNote,
  policy: SynthesisProfilePolicy
): boolean =>
  note.caveats.some((caveat) =>
    policy.coverageCaveatPrefixes.some((prefix) => caveat.startsWith(prefix))
  );

export const createSynthesisBuildEnvelope = (input: {
  sources: BoundSourceNote[];
  policy: SynthesisProfilePolicy;
  policyArtifact: BoundSourceNote["artifact"];
  outletIdentityTable: OutletIdentityTable;
  outletIdentityArtifact: BoundSourceNote["artifact"];
  createdAt: string;
  priorSynthesisId?: string;
}): Result<SynthesisBuildEnvelope, BuildError> => {
  const createdAt = validTime(input.createdAt);
  if (!createdAt) return err("INVALID_BUILD_TIME");
  if (input.policy.outletIdentityTableId !== input.outletIdentityTable.id) {
    return err("POLICY_OUTLET_MISMATCH");
  }
  const ordered = [...input.sources].sort((left, right) => left.note.id.localeCompare(right.note.id));
  const runId = ordered[0]?.note.runId;
  if (!runId || ordered.some(({ note }) => note.runId !== runId)) {
    return err("SOURCE_NOTE_RUN_MISMATCH");
  }
  const notes = ordered.map(({ note }) => note);
  const aliases: BuildObservationAlias[] = ordered.flatMap(({ note }, noteIndex) =>
    observations(note).map((observation, observationIndex) => ({
      alias: `n${noteIndex + 1}-o${String(observationIndex + 1).padStart(2, "0")}`,
      sourceNoteId: note.id,
      observationId: observation.observationId
    }))
  );
  const questionCoverage = deriveCoverage(notes);
  const limitations = deriveLimitations(notes);
  const limitedEvidence =
    notes.some((note) => note.reviewStatus !== "reviewed") ||
    notes.some((note) => hasCoverageCaveat(note, input.policy)) ||
    questionCoverage.some((entry) => entry.disposition === "silent");
  const body = {
    createdAt,
    runId,
    reviewStatus: notes.some((note) => note.reviewStatus === "synthetic")
      ? ("synthetic" as const)
      : notes.some((note) => note.reviewStatus === "provisional")
        ? ("provisional" as const)
        : ("reviewed" as const),
    sourceNotes: ordered.map(({ artifact }) => artifact),
    sourceNoteIds: notes.map((note) => note.id),
    supersedesNoteIds: uniqueSorted(notes.flatMap((note) => note.supersedesNoteId ? [note.supersedesNoteId] : [])),
    policy: input.policyArtifact,
    outletIdentityTable: input.outletIdentityArtifact,
    aliases,
    observationRelationships: deriveRelationships(notes, input.outletIdentityTable),
    questionCoverage,
    intelligenceGaps: questionCoverage
      .filter((entry) => entry.disposition === "partial" || entry.disposition === "silent")
      .map((entry) => entry.irId),
    limitations,
    limitedEvidence,
    ...(input.priorSynthesisId ? { priorSynthesisId: input.priorSynthesisId } : {}),
    delta: {
      status: "not-computed" as const,
      reason: input.priorSynthesisId
        ? ("deferred-in-poc" as const)
        : ("no-prior-synthesis" as const),
      claims: [] as []
    }
  };
  return ok({
    schemaVersion: BUILD_ENVELOPE_SCHEMA_VERSION,
    id: `build-envelope-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body
  });
};

const reliabilityBand = (note: SourceNote): ReliabilityBand =>
  "reliability" in note.assessment &&
  note.assessment.reliability.trackRecord === "established" &&
  note.assessment.reliability.access !== "unknown"
    ? "established"
    : "unknown-or-limited";

const minimumReliability = (notes: SourceNote[]): ReliabilityBand =>
  notes.every((note) => reliabilityBand(note) === "established")
    ? "established"
    : "unknown-or-limited";

const independentSourceCount = (
  sourceNoteIds: string[],
  relationships: ObservationRelationship[]
): number | null => {
  if (sourceNoteIds.length <= 1) return sourceNoteIds.length;
  if (relationships.some((entry) => entry.relationship === "unknown")) return null;
  const parent = new Map(sourceNoteIds.map((id) => [id, id]));
  const root = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const resolved = root(current);
    parent.set(id, resolved);
    return resolved;
  };
  for (const relationship of relationships) {
    if (relationship.relationship === "derivative" || relationship.relationship === "shared-origin") {
      parent.set(root(relationship.rightSourceNoteId), root(relationship.leftSourceNoteId));
    }
  }
  return new Set(sourceNoteIds.map(root)).size;
};

const sourceAppendix = (
  claims: BuiltClaim[],
  notes: SourceNote[],
  envelope: SynthesisBuildEnvelope,
  table: OutletIdentityTable
): SourceAppendixEntry[] => notes.map((note) => {
  const noteClaims = claims.filter((claim) => claim.supportingSourceNoteIds.includes(note.id));
  const observationIds = new Set(noteClaims.flatMap((claim) => claim.supportingObservationIds));
  const relayedOutletIds = observations(note)
    .filter((entry) => observationIds.has(entry.observationId))
    .flatMap((entry) => upstreamOutlets(entry, table));
  return {
    sourceNoteId: note.id,
    publisherOutletIds: uniqueSorted([notePublisherOutlet(note, table) ?? ""].filter(Boolean)),
    relayedOutletIds: uniqueSorted(relayedOutletIds),
    originForClaimIds: noteClaims
      .filter((claim) => !claim.singleSourceDependent)
      .map((claim) => claim.id),
    claimRelationships: noteClaims.flatMap((claim) => {
      const ids = new Set(claim.supportingObservationIds);
      return envelope.observationRelationships
        .filter((relationship) =>
          ids.has(relationship.leftObservationId) &&
          ids.has(relationship.rightObservationId) &&
          (relationship.leftSourceNoteId === note.id || relationship.rightSourceNoteId === note.id)
        )
        .map((relationship) => ({
          claimId: claim.id,
          otherSourceNoteId:
            relationship.leftSourceNoteId === note.id
              ? relationship.rightSourceNoteId
              : relationship.leftSourceNoteId,
          relationship: relationship.relationship,
          observationRelationshipIds: [relationship.id]
        }));
    })
  };
});

export const buildExternalSynthesis = (input: {
  envelope: SynthesisBuildEnvelope;
  sources: BoundSourceNote[];
  policy: SynthesisProfilePolicy;
  outletIdentityTable: OutletIdentityTable;
  proposals: BuildClaimProposal[];
  createdAt: string;
}): Result<ExternalSynthesis, BuildError> => {
  const createdAt = validTime(input.createdAt);
  if (!createdAt) return err("INVALID_BUILD_TIME");
  const noteById = new Map(input.sources.map(({ note }) => [note.id, note]));
  const observationByAlias = new Map(input.envelope.aliases.map((entry) => {
    const note = noteById.get(entry.sourceNoteId);
    const observation = note ? observations(note).find((item) => item.observationId === entry.observationId) : undefined;
    return [entry.alias, note && observation ? { note, observation } : undefined] as const;
  }));
  const claims: BuiltClaim[] = [];
  for (const proposal of input.proposals) {
    const statement = nonEmptyString(proposal.statement);
    const confidenceRationale = nonEmptyString(proposal.confidence?.rationale);
    const confidenceLevel = proposal.confidence?.level;
    const support = uniqueSorted(proposal.supportAliases).map((alias) => observationByAlias.get(alias));
    if (
      !statement ||
      !confidenceRationale ||
      !(confidenceLevel in confidenceRank) ||
      support.length === 0 ||
      support.some((entry) => !entry)
    ) {
      return err("INVALID_CLAIM_PROPOSAL");
    }
    const resolved = support.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const permitted = resolved.every(({ observation }) => {
      const rule = input.policy.claimKindRules.find(
        (entry) => entry.supportingObservationKind === observation.claimKind
      );
      return rule?.permittedClaimKinds.includes(proposal.kind);
    });
    const analytic = proposal.kind === "analytic-assessment" || proposal.kind === "analytic-forecast";
    if (
      !permitted ||
      (proposal.kind === "statement" && !nonEmptyString(proposal.attributedTo)) ||
      (analytic && !nonEmptyString(proposal.analyticRationale)) ||
      (!analytic && proposal.analyticRationale !== undefined)
    ) {
      return err("CLAIM_KIND_EXCEEDS_SUPPORT");
    }
    const sourceNoteIds = uniqueSorted(resolved.map(({ note }) => note.id));
    const observationIds = uniqueSorted(resolved.map(({ observation }) => observation.observationId));
    const relationshipRows = input.envelope.observationRelationships.filter(
      (entry) => observationIds.includes(entry.leftObservationId) && observationIds.includes(entry.rightObservationId)
    );
    const independentCount = independentSourceCount(sourceNoteIds, relationshipRows);
    const countBand = independentCount === null || independentCount === 0
      ? "zero-or-unknown"
      : independentCount === 1
        ? "one"
        : "two-plus";
    const supportingNotes = sourceNoteIds.map((id) => noteById.get(id)).filter((note): note is SourceNote => Boolean(note));
    const reliability = minimumReliability(supportingNotes);
    const ceilingRule = input.policy.confidenceCeilingRules.find((rule) =>
      rule.independentSourceCount === countBand &&
      (rule.minimumSourceReliability === reliability || rule.minimumSourceReliability === "any") &&
      (rule.claimKind === proposal.kind || rule.claimKind === "any")
    );
    if (!ceilingRule) return err("MISSING_CONFIDENCE_CEILING");
    if (confidenceRank[confidenceLevel] > confidenceRank[ceilingRule.ceiling]) {
      return err("CONFIDENCE_EXCEEDS_CEILING");
    }
    const body = { statement, kind: proposal.kind, observationIds };
    claims.push({
      id: `claim-${sha256Text(canonicalJson(body)).slice(0, 24)}`,
      statement,
      kind: proposal.kind,
      authority: analytic ? "analytic-judgment" : "source-reporting",
      ...(proposal.attributedTo ? { attributedTo: proposal.attributedTo } : {}),
      ...(proposal.analyticRationale
        ? { analyticRationale: proposal.analyticRationale }
        : {}),
      supportingSourceNoteIds: sourceNoteIds,
      supportingObservationIds: observationIds,
      confidence: { level: confidenceLevel, rationale: confidenceRationale },
      provisional: resolved.some(({ observation }) => observation.reviewVerdict === "unreviewed"),
      synthetic: resolved.some(({ note }) => note.reviewStatus === "synthetic"),
      independentSourceCount: independentCount,
      singleSourceDependent: independentCount === null || independentCount <= 1,
      confidenceCeiling: ceilingRule.ceiling,
      confidenceCeilingRuleId: ceilingRule.id
    });
  }
  const notes = input.sources.map(({ note }) => note);
  const limitedEvidence =
    claims.length === 0 ||
    claims.every((claim) => claim.singleSourceDependent) ||
    notes.some((note) => note.reviewStatus !== "reviewed") ||
    notes.some((note) => hasCoverageCaveat(note, input.policy)) ||
    input.envelope.questionCoverage.some((entry) => entry.disposition === "silent");
  const body = {
    createdAt,
    runId: input.envelope.runId,
    reviewStatus: input.envelope.reviewStatus,
    sourceNoteIds: input.envelope.sourceNoteIds,
    supersedesNoteIds: input.envelope.supersedesNoteIds,
    claims,
    questionCoverage: input.envelope.questionCoverage,
    intelligenceGaps: input.envelope.intelligenceGaps,
    limitations: input.envelope.limitations,
    sourceAppendix: sourceAppendix(claims, notes, input.envelope, input.outletIdentityTable),
    limitedEvidence,
    ...(input.envelope.priorSynthesisId ? { priorSynthesisId: input.envelope.priorSynthesisId } : {}),
    delta: input.envelope.delta
  };
  return ok({
    schemaVersion: EXTERNAL_SYNTHESIS_SCHEMA_VERSION,
    id: `external-synthesis-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body
  });
};