import { isDeepStrictEqual } from "node:util";
import type { CapturedSourceContent } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  readSeeristCapturedBody,
  selectSeeristFeature,
  validateSource
} from "../intake/intake.js";
import { createLedgerEntry } from "../ledger/ledger.js";
import { decideRoute } from "../routing/routing.js";

export type SeeristSourceAdapterError =
  | "INVALID_SOURCE_ARTIFACT"
  | "INVALID_RAW_ARTIFACT"
  | "INVALID_NATIVE_INTAKE"
  | "NATIVE_INTAKE_MISMATCH"
  | "NATIVE_CONTENT_MISSING";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const validSha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const pathSafeId = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized &&
    normalized !== "." &&
    normalized !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
    ? normalized
    : undefined;
};

export const adaptSeeristSourceContent = (
  intakeValue: unknown,
  rawProviderValue: unknown,
  sourceArtifactRefValue: unknown,
  sourceArtifactSha256Value: unknown,
  rawArtifactRefValue: unknown,
  rawArtifactSha256Value: unknown
): Result<CapturedSourceContent, SeeristSourceAdapterError> => {
  const sourceArtifactRef = nonEmptyString(sourceArtifactRefValue);
  const sourceArtifactSha256 = validSha256(sourceArtifactSha256Value);
  if (!sourceArtifactRef || !sourceArtifactSha256) {
    return err("INVALID_SOURCE_ARTIFACT");
  }
  const rawArtifactRef = nonEmptyString(rawArtifactRefValue);
  const rawArtifactSha256 = validSha256(rawArtifactSha256Value);
  if (!rawArtifactRef || !rawArtifactSha256) {
    return err("INVALID_RAW_ARTIFACT");
  }
  if (
    !isRecord(intakeValue) ||
    !isRecord(intakeValue.item) ||
    !isRecord(intakeValue.decision) ||
    !isRecord(intakeValue.ledgerEntry)
  ) {
    return err("INVALID_NATIVE_INTAKE");
  }

  const item = intakeValue.item;
  const providerItemId = pathSafeId(item.providerItemId);
  const runId = pathSafeId(intakeValue.ledgerEntry.runId);
  const occurredAt = nonEmptyString(intakeValue.ledgerEntry.occurredAt);
  if (
    !providerItemId ||
    !runId ||
    !occurredAt ||
    Number.isNaN(Date.parse(occurredAt)) ||
    item.provider !== "seerist" ||
    item.role !== "evidence_candidate" ||
    item.contentCompleteness !== "captured_content" ||
    item.rawArtifactRef !== rawArtifactRef ||
    item.rawArtifactSha256 !== rawArtifactSha256 ||
    intakeValue.decision.destination !== "source_canonicalization" ||
    intakeValue.decision.approvalStatus !== "not_applicable"
  ) {
    return err("INVALID_NATIVE_INTAKE");
  }

  const selected = selectSeeristFeature(rawProviderValue, providerItemId);
  if (!selected.ok) {
    return err("INVALID_RAW_ARTIFACT");
  }
  const reconstructedItem = validateSource({
    provider: "seerist",
    endpoint: item.endpoint,
    retrievedAt: item.retrievedAt,
    rawArtifactRef,
    rawArtifactSha256,
    collectionLineage: item.collectionLineage,
    researchQuestion: item.researchQuestion,
    item: selected.value
  });
  if (!reconstructedItem.ok) {
    return err("INVALID_NATIVE_INTAKE");
  }
  const reconstructed = {
    item: reconstructedItem.value,
    decision: decideRoute(reconstructedItem.value),
    ledgerEntry: createLedgerEntry(runId, occurredAt, reconstructedItem.value)
  };
  const persistedReconstruction: unknown = JSON.parse(JSON.stringify(reconstructed));
  if (!isDeepStrictEqual(persistedReconstruction, intakeValue)) {
    return err("NATIVE_INTAKE_MISMATCH");
  }

  const body = readSeeristCapturedBody(selected.value);
  if (!body) {
    return err("NATIVE_CONTENT_MISSING");
  }
  const lineage = reconstructedItem.value.collectionLineage;
  return ok({
    runId,
    sourceItemId: providerItemId,
    sourceKind: "provider-captured",
    contentFormat: "plain-text",
    body,
    sourceArtifactRef,
    sourceArtifactSha256,
    lineageArtifactRefs: [
      {
        artifactRef: reconstructedItem.value.researchQuestion.artifactRef,
        artifactSha256: reconstructedItem.value.researchQuestion.artifactSha256
      },
      {
        artifactRef: lineage.requestManifestRef,
        artifactSha256: lineage.requestManifestSha256
      },
      {
        artifactRef: lineage.responseManifestRef,
        artifactSha256: lineage.responseManifestSha256
      },
      { artifactRef: rawArtifactRef, artifactSha256: rawArtifactSha256 }
    ]
  });
};