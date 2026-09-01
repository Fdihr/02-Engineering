import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { selectSeeristFeature } from "../modules/intake/intake.js";
import { createFailedLedgerEntry } from "../modules/ledger/ledger.js";
import { renderIntakeSummary } from "../modules/reporting/intake-summary.js";
import { processSource } from "../workflow/process-source.js";

type CommandOptions = {
  responseManifestPath: string;
  itemId: string;
  researchQuestionPath: string;
};

const usage =
  "Usage: npm run intake:seerist -- <raw-provider-artifact.json> <item-id> <approved-research-question.json>";

const parseOptions = (args: string[]): CommandOptions => {
  const [responseManifestPath, itemId, researchQuestionPath, ...extra] = args;
  if (!responseManifestPath || !itemId || !researchQuestionPath || extra.length > 0) {
    throw new Error(usage);
  }

  return {
    responseManifestPath,
    itemId,
    researchQuestionPath
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const isPathSafeId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const resolveRunArtifact = (runRoot: string, value: string, label: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

const requireExpectedPath = (actual: string, expected: string, label: string): void => {
  if (relative(actual, expected) !== "") {
    throw new Error(`${label} is not in its canonical collection location.`);
  }
};

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown intake failure";

const main = async (): Promise<void> => {
  const occurredAt = new Date().toISOString();
  let runId = `unbound-intake-${randomUUID()}`;
  let rawArtifactRef: string | undefined;
  const runRoot = resolve(process.env.SEERIST_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "intake-events.jsonl");

  try {
    const options = parseOptions(process.argv.slice(2));
    if (!isPathSafeId(options.itemId)) {
      throw new Error("Item ID must be a path-safe identifier.");
    }
    const responseManifestPath = resolveRunArtifact(
      runRoot,
      options.responseManifestPath,
      "Response manifest"
    );
    const responseManifestBytes = await readFile(responseManifestPath);
    const responseManifest: unknown = JSON.parse(responseManifestBytes.toString("utf8"));
    if (!isRecord(responseManifest)) {
      throw new Error("Response manifest is invalid.");
    }
    const manifestRunId = nonEmptyString(responseManifest.runId);
    const operationId = nonEmptyString(responseManifest.operationId);
    const researchQuestionId = nonEmptyString(responseManifest.researchQuestionId);
    const endpoint = nonEmptyString(responseManifest.endpoint);
    const requestedAt = nonEmptyString(responseManifest.requestedAt);
    const receivedAt = nonEmptyString(responseManifest.receivedAt);
    const recordedRawArtifactRef = nonEmptyString(responseManifest.artifactRef);
    const recordedRawSha256 = nonEmptyString(responseManifest.sha256)?.toLowerCase();
    if (
      !manifestRunId ||
      !operationId ||
      !researchQuestionId ||
      !requestedAt ||
      Number.isNaN(Date.parse(requestedAt)) ||
      !receivedAt ||
      Number.isNaN(Date.parse(receivedAt)) ||
      Date.parse(requestedAt) > Date.parse(receivedAt) ||
      !recordedRawArtifactRef ||
      !recordedRawSha256 ||
      !/^[a-f0-9]{64}$/.test(recordedRawSha256) ||
      responseManifest.provider !== "seerist" ||
      endpoint !== "/v1/wod" ||
      typeof responseManifest.httpStatus !== "number" ||
      responseManifest.httpStatus < 200 ||
      responseManifest.httpStatus >= 300 ||
      !isPathSafeId(manifestRunId) ||
      !isPathSafeId(operationId)
    ) {
      throw new Error("Response manifest is invalid or unsupported.");
    }
    runId = manifestRunId;

    const operationDirectory = resolve(
      runRoot,
      runId,
      "provider-operations",
      operationId
    );
    requireExpectedPath(
      responseManifestPath,
      resolve(operationDirectory, "raw-provider-artifact.json"),
      "Response manifest"
    );
    const artifactPath = resolveRunArtifact(
      runRoot,
      recordedRawArtifactRef,
      "Raw provider artifact"
    );
    requireExpectedPath(
      artifactPath,
      resolve(operationDirectory, "raw-response.json"),
      "Raw provider artifact"
    );
    rawArtifactRef = artifactRef(artifactPath);
    if (recordedRawArtifactRef !== rawArtifactRef) {
      throw new Error("Raw provider artifact reference does not match its canonical path.");
    }
    const rawArtifactBytes = await readFile(artifactPath);
    const rawArtifactSha256 = sha256(rawArtifactBytes);
    if (rawArtifactSha256 !== recordedRawSha256) {
      throw new Error("Raw provider artifact SHA-256 does not match the response manifest.");
    }
    const payload: unknown = JSON.parse(rawArtifactBytes.toString("utf8"));

    const requestManifestPath = resolve(operationDirectory, "collection-request.json");
    const requestManifestBytes = await readFile(requestManifestPath);
    const requestManifest: unknown = JSON.parse(requestManifestBytes.toString("utf8"));
    if (!isRecord(requestManifest) || !isRecord(requestManifest.operation)) {
      throw new Error("Collection request manifest is invalid.");
    }
    const operation = requestManifest.operation;
    if (
      operation.id !== operationId ||
      operation.runId !== runId ||
      operation.researchQuestionId !== researchQuestionId ||
      operation.provider !== "seerist" ||
      operation.method !== "GET" ||
      operation.endpoint !== endpoint ||
      requestManifest.requestedAt !== requestedAt
    ) {
      throw new Error("Collection request and response manifests do not match.");
    }

    const researchQuestionPath = resolveRunArtifact(
      runRoot,
      options.researchQuestionPath,
      "Approved research question"
    );
    const researchQuestionBytes = await readFile(researchQuestionPath);
    const researchQuestionValue: unknown = JSON.parse(researchQuestionBytes.toString("utf8"));
    const researchQuestion = isRecord(researchQuestionValue)
      ? {
          ...researchQuestionValue,
          artifactRef: artifactRef(researchQuestionPath),
          artifactSha256: sha256(researchQuestionBytes)
        }
      : researchQuestionValue;
    if (
      !isRecord(researchQuestion) ||
      researchQuestion.id !== researchQuestionId ||
      researchQuestion.runId !== runId ||
      !isPathSafeId(researchQuestionId) ||
      !isDeepStrictEqual(requestManifest.researchQuestion, researchQuestion)
    ) {
      throw new Error("Approved research question does not match collection lineage.");
    }
    requireExpectedPath(
      researchQuestionPath,
      resolve(
        runRoot,
        runId,
        "research-questions",
        researchQuestionId,
        "approved-research-question.json"
      ),
      "Approved research question"
    );

    const selected = selectSeeristFeature(payload, options.itemId);
    if (!selected.ok) {
      throw new Error(`Item selection failed: ${selected.error}`);
    }

    const result = processSource(runId, occurredAt, {
      provider: "seerist",
      endpoint,
      retrievedAt: receivedAt,
      rawArtifactRef,
      rawArtifactSha256,
      collectionLineage: {
        operationId,
        requestManifestRef: artifactRef(requestManifestPath),
        requestManifestSha256: sha256(requestManifestBytes),
        responseManifestRef: artifactRef(responseManifestPath),
        responseManifestSha256: sha256(responseManifestBytes),
        rawArtifactRef,
        rawArtifactSha256
      },
      researchQuestion,
      item: selected.value
    });
    if (!result.ok) {
      throw new Error(`Intake failed: ${result.error.code}/${result.error.cause}`);
    }

    const runParent = resolve(runRoot, runId, "provider-intakes", operationId);
    const runDirectory = resolve(runParent, options.itemId);
    const outputPath = resolve(runDirectory, "intake-result.json");
    const summaryPath = resolve(runDirectory, "intake-summary.md");
    await mkdir(runParent, { recursive: true });
    await mkdir(runDirectory);
    await writeFile(outputPath, JSON.stringify(result.value, null, 2), "utf8");
    await writeFile(summaryPath, renderIntakeSummary(result.value), "utf8");
    await appendFile(eventLogPath, `${JSON.stringify(result.value.ledgerEntry)}\n`, "utf8");

    console.log(`Run: ${runId}`);
    console.log(`Item: ${result.value.item.providerItemId ?? "not provided"}`);
    console.log(`Role: ${result.value.item.role}`);
    console.log(`Route: ${result.value.decision.destination}`);
    console.log(`Approval: ${result.value.decision.approvalStatus}`);
    console.log(`Output: ${artifactRef(outputPath)}`);
    console.log(`Review: ${artifactRef(summaryPath)}`);
  } catch (error) {
    const message = commandError(error);
    const failureEntry = createFailedLedgerEntry(runId, occurredAt, rawArtifactRef, message);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(eventLogPath, `${JSON.stringify(failureEntry)}\n`, "utf8");
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Intake failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();