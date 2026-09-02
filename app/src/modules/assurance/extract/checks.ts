import type { SourceDocument } from "../../../core/types.js";
import { err, ok, type Result } from "../../../core/result.js";
import { anchorQuote } from "../anchoring.js";
import { observationId } from "../ids.js";
import type {
  CheckFailure,
  Disposition,
  ExtractDisposition,
  ExtractObservation,
  ExtractOutput,
  IRDisposition,
  Observation,
  ProfilePolicy,
  RequirementDefinition
} from "../types.js";
import { hasAllowedKeys, readExtractObservation } from "../observation.js";
import { boundedString, isRecord, nonEmptyString } from "../validators.js";

export const EXTRACT_CHECK_RULES: Record<string, string> = {
  E1: "the response must be one JSON object matching the required shape, with permitted enumerations and text within the character limit",
  E2: "every observation must name a segment id that exists in the source document",
  E3: "every quote must be copied byte-for-byte and occur exactly once inside its named segment, within the policy length limits",
  E4: "every irIds entry must be an approved information requirement id and must not repeat within one observation",
  E5: "dispositions must contain exactly one entry for every approved information requirement and no unknown id",
  E6: "each disposition index set must equal exactly the indexes of observations tagged with that requirement, so silent has none and every other disposition has at least one",
  E7: "a statement must use attributed or relayed attribution with attributedTo, and a relayed observation must name its upstream source",
  E8: "the observation count must not exceed the policy maximum",
  E9: "every derived anchor must be accepted by the canonical source document validator"
};

export type ExtractCheckContext = {
  document: SourceDocument;
  documentArtifactRef: string;
  documentArtifactSha256: string;
  requirements: RequirementDefinition[];
  policy: ProfilePolicy;
};

export type ExtractCheckOutcome =
  | { status: "passed"; observations: Observation[]; dispositions: IRDisposition[] }
  | { status: "failed"; failures: CheckFailure[] };

const DISPOSITION_KEYS = ["irId", "disposition", "observationIndexes", "note"];

const failure = (check: string, count: number): CheckFailure => ({
  check,
  count,
  rule: EXTRACT_CHECK_RULES[check] ?? "unspecified rule"
});

const readDisposition = (
  value: unknown,
  policy: ProfilePolicy
): ExtractDisposition | undefined => {
  if (!isRecord(value) || !hasAllowedKeys(value, DISPOSITION_KEYS)) {
    return undefined;
  }
  const irId = nonEmptyString(value.irId);
  const disposition = policy.dispositions.includes(value.disposition as Disposition)
    ? (value.disposition as Disposition)
    : undefined;
  if (!irId || !disposition || !Array.isArray(value.observationIndexes)) {
    return undefined;
  }
  if (
    !value.observationIndexes.every(
      (entry) => typeof entry === "number" && Number.isInteger(entry)
    )
  ) {
    return undefined;
  }
  const note = value.note === undefined ? undefined : boundedString(value.note, 400);
  if (value.note !== undefined && !note) {
    return undefined;
  }

  const entry: ExtractDisposition = {
    irId,
    disposition,
    observationIndexes: value.observationIndexes as number[]
  };
  if (note) {
    entry.note = note;
  }
  return entry;
};

/** E1: the response proposal must be structurally valid before any other check can run. */
export const validateExtractProposal = (
  value: unknown,
  policy: ProfilePolicy
): Result<ExtractOutput, CheckFailure> => {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== "dispositions,observations" ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.dispositions)
  ) {
    return err(failure("E1", 1));
  }

  const observations: ExtractObservation[] = [];
  let invalid = 0;
  for (const entry of value.observations) {
    const observation = readExtractObservation(entry, policy);
    if (!observation) {
      invalid += 1;
    } else {
      observations.push(observation);
    }
  }

  const dispositions: ExtractDisposition[] = [];
  for (const entry of value.dispositions) {
    const disposition = readDisposition(entry, policy);
    if (!disposition) {
      invalid += 1;
    } else {
      dispositions.push(disposition);
    }
  }

  return invalid > 0 ? err(failure("E1", invalid)) : ok({ observations, dispositions });
};

export const runExtractChecks = (
  output: ExtractOutput,
  context: ExtractCheckContext
): ExtractCheckOutcome => {
  const counts = new Map<string, number>();
  const record = (check: string): void => {
    counts.set(check, (counts.get(check) ?? 0) + 1);
  };

  const approvedIrIds = new Set(context.requirements.map((entry) => entry.irId));
  const anchored: Observation[] = [];

  output.observations.forEach((observation) => {
    const anchor = anchorQuote(
      context.document,
      context.documentArtifactRef,
      context.documentArtifactSha256,
      observation.segmentId,
      observation.quote,
      context.policy
    );
    if (!anchor.ok) {
      record(
        anchor.error === "SEGMENT_NOT_FOUND"
          ? "E2"
          : anchor.error === "ANCHOR_REJECTED_BY_SOURCE_MODULE"
            ? "E9"
            : "E3"
      );
    } else {
      anchored.push({
        ...observation,
        observationId: observationId(anchor.value, observation.claimKind, observation.text),
        anchor: anchor.value,
        origin: "model"
      });
    }

    const unique = new Set(observation.irIds);
    if (
      unique.size !== observation.irIds.length ||
      observation.irIds.some((irId) => !approvedIrIds.has(irId))
    ) {
      record("E4");
    }

    if (
      observation.claimKind === "statement" &&
      (observation.attribution.kind === "direct" || !observation.attribution.attributedTo)
    ) {
      record("E7");
    } else if (
      observation.attribution.kind === "relayed" &&
      !observation.attribution.attributedTo
    ) {
      record("E7");
    }
  });

  const seenIrIds = new Set<string>();
  output.dispositions.forEach((disposition) => {
    if (!approvedIrIds.has(disposition.irId) || seenIrIds.has(disposition.irId)) {
      record("E5");
    }
    seenIrIds.add(disposition.irId);
  });
  if (context.requirements.some((entry) => !seenIrIds.has(entry.irId))) {
    record("E5");
  }

  output.dispositions.forEach((disposition) => {
    const expected = output.observations
      .map((observation, index) => ({ observation, index }))
      .filter((entry) => entry.observation.irIds.includes(disposition.irId))
      .map((entry) => entry.index);
    const actual = disposition.observationIndexes;
    const uniqueActual = new Set(actual);
    const inRange = actual.every(
      (index) => index >= 0 && index < output.observations.length
    );
    const sameSet =
      uniqueActual.size === actual.length &&
      expected.length === actual.length &&
      expected.every((index) => uniqueActual.has(index));
    if (!inRange || !sameSet) {
      record("E6");
    }
  });

  if (output.observations.length > context.policy.limits.maxObservations) {
    record("E8");
  }

  if (counts.size > 0) {
    const failures = [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([check, count]) => failure(check, count));
    return { status: "failed", failures };
  }

  const dispositions: IRDisposition[] = output.dispositions.map((disposition) => {
    const observationIds = [
      ...new Set(
        disposition.observationIndexes.map(
          (index) => anchored[index]?.observationId ?? ""
        )
      )
    ].filter((entry) => entry !== "");
    const entry: IRDisposition = {
      irId: disposition.irId,
      disposition: disposition.disposition,
      observationIds
    };
    if (disposition.note) {
      entry.note = disposition.note;
    }
    return entry;
  });

  return { status: "passed", observations: anchored, dispositions };
};
