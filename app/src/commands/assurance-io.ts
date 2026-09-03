import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  toNamespacedPath
} from "node:path";
import type { SourceDocument } from "../core/types.js";
import { validateSourceDocument } from "../modules/source/source-document.js";
import { validateExtractCommit } from "../modules/assurance/extract/commit.js";
import { validateProfilePolicy } from "../modules/assurance/policy.js";
import { validateApprovedRequirements } from "../modules/assurance/requirements.js";
import { validateAdmittedSource } from "../modules/assurance/snapshot-source.js";
import type {
  AdmittedSource,
  ApprovedRequirements,
  ArtifactBinding,
  ExtractCommit,
  ProfilePolicy
} from "../modules/assurance/types.js";
import type { AssuranceEvent } from "../modules/assurance/events.js";

export type LoadedArtifact = {
  path: string;
  binding: ArtifactBinding;
  value: unknown;
};

export const assuranceRunRoot = (): string =>
  resolve(process.env.SOURCE_ASSURANCE_RUN_DIR ?? "runs");

/** Windows path-length escape hatch; refs and confinement checks keep the plain form. */
export const longPath = (path: string): string => toNamespacedPath(path);

const TRANSIENT_SYNC_ERRORS = new Set(["EPERM", "EBUSY"]);

/**
 * Retries only the transient locks a sync client causes. EEXIST is never retried:
 * that is the write-once guard reporting a real collision.
 */
export const withSyncRetry = async <T>(
  operation: () => Promise<T>,
  attempts = 3
): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT_SYNC_ERRORS.has(code) || attempt >= attempts) {
        throw error;
      }
      await new Promise((done) => setTimeout(done, 50 * attempt));
    }
  }
};

export const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

export const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

export const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown source-assurance failure";

export const resolveRunArtifact = (
  runRoot: string,
  value: string,
  label: string
): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

export const loadJsonArtifact = async (
  path: string
): Promise<LoadedArtifact> => {
  const bytes = await withSyncRetry(() => readFile(longPath(path)));
  return {
    path,
    binding: { artifactRef: artifactRef(path), artifactSha256: sha256(bytes) },
    value: JSON.parse(bytes.toString("utf8")) as unknown
  };
};

export const loadRunArtifact = async (
  runRoot: string,
  value: string,
  label: string
): Promise<LoadedArtifact> =>
  loadJsonArtifact(resolveRunArtifact(runRoot, value, label));

export const requireChecksum = (
  artifact: LoadedArtifact,
  expected: string,
  label: string
): LoadedArtifact => {
  if (artifact.binding.artifactSha256 !== expected) {
    throw new Error(`${label} checksum does not match its recorded lineage.`);
  }
  return artifact;
};

/** Canonical assurance outputs are write-once; an existing file is an error, never an overwrite. */
export const writeOnce = async (path: string, contents: string): Promise<string> => {
  await withSyncRetry(() =>
    writeFile(longPath(path), contents, { encoding: "utf8", flag: "wx" })
  );
  return artifactRef(path);
};

export const writeJsonOnce = async (
  path: string,
  value: unknown
): Promise<string> => writeOnce(path, `${JSON.stringify(value, null, 2)}\n`);

export const appendAssuranceEvent = async (
  logPath: string,
  event: AssuranceEvent
): Promise<void> => {
  await withSyncRetry(() =>
    appendFile(longPath(logPath), `${JSON.stringify(event)}\n`, "utf8")
  );
};

export const stageDirectory = (
  runRoot: string,
  runId: string,
  snapshotId: string
): string => resolve(runRoot, runId, "assurance", snapshotId);

export const ensureDirectory = async (path: string): Promise<void> => {
  await withSyncRetry(() => mkdir(longPath(path), { recursive: true }));
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const referenceFrom = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing from the admitted snapshot.`);
  }
  return value;
};

/** Reopens the exact human-admitted input: snapshot, sibling decision, question, canonical source. */
export const loadAdmittedSource = async (
  runRoot: string,
  snapshotPathValue: string,
  validatedAt: string
): Promise<AdmittedSource> => {
  const snapshotPath = resolveRunArtifact(
    runRoot,
    snapshotPathValue,
    "Approved evidence snapshot"
  );
  const snapshot = await loadJsonArtifact(snapshotPath);
  const decision = await loadRunArtifact(
    runRoot,
    resolve(dirname(snapshotPath), "evidence-decision.json"),
    "Evidence decision"
  );

  const snapshotRecord = asRecord(snapshot.value);
  const item = asRecord(snapshotRecord?.item);
  const question = asRecord(item?.researchQuestion);
  const relevance = asRecord(asRecord(item?.questionRelevance)?.assessment);
  const questionPath = resolveRunArtifact(
    runRoot,
    referenceFrom(question?.artifactRef, "Research-question artifact reference"),
    "Research question"
  );
  const documentPath = resolveRunArtifact(
    runRoot,
    referenceFrom(
      relevance?.sourceDocumentArtifactRef,
      "Source-document artifact reference"
    ),
    "Source document"
  );

  const questionBytes = await withSyncRetry(() => readFile(longPath(questionPath)));
  const parsedQuestion = asRecord(
    JSON.parse(questionBytes.toString("utf8")) as unknown
  );
  const document = await loadJsonArtifact(documentPath);

  const admitted = validateAdmittedSource({
    snapshotValue: snapshot.value,
    snapshotArtifactRef: snapshot.binding.artifactRef,
    snapshotArtifactSha256: snapshot.binding.artifactSha256,
    decisionValue: decision.value,
    decisionArtifactRef: decision.binding.artifactRef,
    decisionArtifactSha256: decision.binding.artifactSha256,
    researchQuestionValue: parsedQuestion
      ? {
          ...parsedQuestion,
          artifactRef: artifactRef(questionPath),
          artifactSha256: sha256(questionBytes)
        }
      : undefined,
    sourceDocumentValue: document.value,
    sourceDocumentArtifactRef: document.binding.artifactRef,
    sourceDocumentArtifactSha256: document.binding.artifactSha256,
    validatedAt
  });
  if (!admitted.ok) {
    throw new Error(`Admitted source rejected: ${admitted.error}`);
  }
  return admitted.value;
};

export type CommitContext = {
  commit: ExtractCommit;
  commitArtifact: LoadedArtifact;
  policy: ProfilePolicy;
  policyArtifact: LoadedArtifact;
  document: SourceDocument;
  documentArtifact: LoadedArtifact;
  requirements: ApprovedRequirements;
  requirementsArtifact: LoadedArtifact;
};

/** Reopens a committed extraction with every artifact it was bound to. */
export const loadCommitContext = async (
  runRoot: string,
  commitPathValue: string
): Promise<CommitContext> => {
  const commitArtifact = await loadRunArtifact(
    runRoot,
    commitPathValue,
    "Extract commit"
  );
  const lineage = asRecord(asRecord(commitArtifact.value)?.lineage);
  const policyRef = asRecord(lineage?.policy);
  const documentRef = asRecord(lineage?.sourceDocument);
  const requirementsRef = asRecord(lineage?.requirements);
  if (!policyRef || !documentRef || !requirementsRef) {
    throw new Error("The extract commit has incomplete lineage.");
  }

  const policyArtifact = requireChecksum(
    await loadJsonArtifact(
      resolve(referenceFrom(policyRef.artifactRef, "Policy artifact reference"))
    ),
    String(policyRef.artifactSha256),
    "Profile policy"
  );
  const policy = validateProfilePolicy(policyArtifact.value);
  if (!policy.ok) {
    throw new Error(`Profile policy rejected: ${policy.error}`);
  }

  const commit = validateExtractCommit(commitArtifact.value, policy.value);
  if (!commit.ok) {
    throw new Error(`Extract commit rejected: ${commit.error}`);
  }

  const documentArtifact = requireChecksum(
    await loadRunArtifact(
      runRoot,
      commit.value.lineage.sourceDocument.artifactRef,
      "Source document"
    ),
    commit.value.lineage.sourceDocument.artifactSha256,
    "Source document"
  );
  const document = validateSourceDocument(documentArtifact.value);
  if (!document.ok) {
    throw new Error(`Source document rejected: ${document.error}`);
  }

  const requirementsArtifact = requireChecksum(
    await loadRunArtifact(
      runRoot,
      commit.value.lineage.requirements.artifactRef,
      "Approved requirements"
    ),
    commit.value.lineage.requirements.artifactSha256,
    "Approved requirements"
  );
  const requirements = validateApprovedRequirements(requirementsArtifact.value);
  if (!requirements.ok) {
    throw new Error(`Approved requirements rejected: ${requirements.error}`);
  }

  return {
    commit: commit.value,
    commitArtifact,
    policy: policy.value,
    policyArtifact,
    document: document.value,
    documentArtifact,
    requirements: requirements.value,
    requirementsArtifact
  };
};
