import { createHash } from "node:crypto";
import type { ArtifactBinding, AssuranceLineage } from "./types.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

export const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const boundedString = (
  value: unknown,
  maxLength: number
): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized && normalized.length <= maxLength ? normalized : undefined;
};

export const validSha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

export const validTime = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized && !Number.isNaN(Date.parse(normalized))
    ? normalized
    : undefined;
};

export const pathSafeId = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value);
  return normalized &&
    normalized !== "." &&
    normalized !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
    ? normalized
    : undefined;
};

export const boundedStringArray = (
  value: unknown,
  maxEntries: number,
  maxLength: number
): string[] | undefined => {
  if (!Array.isArray(value) || value.length > maxEntries) {
    return undefined;
  }
  const entries = value.map((entry) => boundedString(entry, maxLength));
  return entries.every((entry): entry is string => entry !== undefined)
    ? entries
    : undefined;
};

export const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;

export const sha256Text = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, null, 2);

export const readArtifactBinding = (
  value: unknown
): ArtifactBinding | undefined => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["artifactRef", "artifactSha256"])) {
    return undefined;
  }
  const artifactRef = nonEmptyString(value.artifactRef);
  const artifactSha256 = validSha256(value.artifactSha256);
  return artifactRef && artifactSha256 ? { artifactRef, artifactSha256 } : undefined;
};

export const readAssuranceLineage = (
  value: unknown
): AssuranceLineage | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "snapshot",
      "evidenceDecision",
      "researchQuestion",
      "sourceDocument",
      "requirements",
      "policy"
    ])
  ) {
    return undefined;
  }
  const snapshot = readArtifactBinding(value.snapshot);
  const evidenceDecision = readArtifactBinding(value.evidenceDecision);
  const researchQuestion = readArtifactBinding(value.researchQuestion);
  const sourceDocument = readArtifactBinding(value.sourceDocument);
  const requirements = readArtifactBinding(value.requirements);
  const policy = readArtifactBinding(value.policy);
  return snapshot &&
    evidenceDecision &&
    researchQuestion &&
    sourceDocument &&
    requirements &&
    policy
    ? {
        snapshot,
        evidenceDecision,
        researchQuestion,
        sourceDocument,
        requirements,
        policy
      }
    : undefined;
};
