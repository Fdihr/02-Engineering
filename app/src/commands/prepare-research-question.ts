import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createResearchQuestionDraftRequest } from "../modules/research/question-drafting.js";
import { validateApprovedMemoScope } from "../modules/research/memo-scope.js";

const usage =
  "Usage: npm run prepare:research-question -- <approved-memo-scope.json>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown research-question preparation failure";

const resolveRunArtifact = (runRoot: string, value: string, label: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

const pathSafeId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = resolve(process.env.RESEARCH_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "research-events.jsonl");
  let runId: string | undefined;
  let requestId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [scopePathValue, ...extra] = process.argv.slice(2);
    if (!scopePathValue || extra.length > 0) throw new Error(usage);
    const scopePath = resolveRunArtifact(runRoot, scopePathValue, "Approved memo scope");
    const scopeBytes = await readFile(scopePath);
    const scopeValue: unknown = JSON.parse(scopeBytes.toString("utf8"));
    const scope = validateApprovedMemoScope(
      {
        ...(typeof scopeValue === "object" &&
        scopeValue !== null &&
        !Array.isArray(scopeValue)
          ? scopeValue
          : {}),
        artifactRef: artifactRef(scopePath),
        artifactSha256: sha256(scopeBytes)
      },
      preparedAt
    );
    if (!scope.ok) {
      throw new Error(`Approved memo scope rejected: ${scope.error}`);
    }
    runId = scope.value.runId;
    if (!pathSafeId(runId)) throw new Error("Run ID must be path-safe.");
    const request = createResearchQuestionDraftRequest(scope.value, preparedAt);
    if (!request.ok) throw new Error(`Draft request rejected: ${request.error}`);
    requestId = request.value.id;

    const outputParent = resolve(runRoot, runId, "research-question-drafts");
    const outputDirectory = resolve(outputParent, requestId);
    await mkdir(outputParent, { recursive: true });
    await mkdir(outputDirectory);
    const outputPath = resolve(
      outputDirectory,
      "research-question-draft-request.json"
    );
    outputArtifactRef = artifactRef(outputPath);
    const requestBytes = Buffer.from(
      JSON.stringify(request.value, null, 2),
      "utf8"
    );
    await writeFile(outputPath, requestBytes);
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        scopeId: scope.value.id,
        requestId,
        occurredAt: preparedAt,
        actorType: "controller",
        stage: "research_question_drafting",
        eventType: "research.question.draft.request.prepared",
        status: "completed",
        artifactRef: outputArtifactRef,
        artifactSha256: sha256(requestBytes)
      })}\n`,
      "utf8"
    );
    console.log(`Run: ${runId}`);
    console.log(`Scope: ${scope.value.id}`);
    console.log(`Request: ${requestId}`);
    console.log(`Output: ${outputArtifactRef}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          runId,
          requestId,
          occurredAt: new Date().toISOString(),
          actorType: "controller",
          stage: "research_question_drafting",
          eventType: "research.question.draft.request.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Research-question request failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
