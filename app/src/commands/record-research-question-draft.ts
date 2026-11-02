import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  createResearchQuestionDraftRequest,
  recordResearchQuestionDraft,
  validateResearchQuestionDraftRequest
} from "../modules/research/question-drafting.js";
import { validateApprovedMemoScope } from "../modules/research/memo-scope.js";

const usage =
  "Usage: npm run record:research-question-draft -- <draft-request.json> <copilot-response.json>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown research-question draft recording failure";

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
  const recordedAt = new Date().toISOString();
  const runRoot = resolve(process.env.RESEARCH_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "research-events.jsonl");
  let runId: string | undefined;
  let questionId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [requestPathValue, responsePathValue, ...extra] = process.argv.slice(2);
    if (!requestPathValue || !responsePathValue || extra.length > 0) {
      throw new Error(usage);
    }
    const requestPath = resolveRunArtifact(runRoot, requestPathValue, "Draft request");
    const responsePath = resolveRunArtifact(runRoot, responsePathValue, "AI response");
    const [requestBytes, responseBytes] = await Promise.all([
      readFile(requestPath),
      readFile(responsePath)
    ]);
    const requestResult = validateResearchQuestionDraftRequest(
      JSON.parse(requestBytes.toString("utf8"))
    );
    if (!requestResult.ok) {
      throw new Error(`Draft request rejected: ${requestResult.error}`);
    }
    const request = requestResult.value;
    const scopePath = resolveRunArtifact(
      runRoot,
      request.scope.artifactRef,
      "Approved memo scope"
    );
    const scopeBytes = await readFile(scopePath);
    if (sha256(scopeBytes) !== request.scope.artifactSha256) {
      throw new Error("Approved memo scope checksum does not match the draft request.");
    }
    const scopeValue: unknown = JSON.parse(scopeBytes.toString("utf8"));
    const validatedScope = validateApprovedMemoScope(
      {
        ...(typeof scopeValue === "object" &&
        scopeValue !== null &&
        !Array.isArray(scopeValue)
          ? scopeValue
          : {}),
        artifactRef: artifactRef(scopePath),
        artifactSha256: sha256(scopeBytes)
      },
      recordedAt
    );
    if (!validatedScope.ok) {
      throw new Error(`Approved memo scope rejected: ${validatedScope.error}`);
    }
    const expectedRequest = createResearchQuestionDraftRequest(
      validatedScope.value,
      request.preparedAt
    );
    if (
      !expectedRequest.ok ||
      !isDeepStrictEqual(expectedRequest.value, request)
    ) {
      throw new Error("Draft request does not match the approved memo scope.");
    }

    questionId = `rq-${sha256(responseBytes).slice(0, 20)}`;
    if (!pathSafeId(questionId)) throw new Error("Question ID must be path-safe.");
    const recorded = recordResearchQuestionDraft({
      request,
      responseValue: JSON.parse(responseBytes.toString("utf8")),
      scope: validatedScope.value,
      questionId,
      recordedAt
    });
    if (!recorded.ok) {
      throw new Error(`AI draft rejected: ${recorded.error}`);
    }
    runId = recorded.value.proposal.runId;
    const outputParent = resolve(runRoot, runId, "research-question-drafts");
    const outputDirectory = resolve(outputParent, questionId);
    await mkdir(outputParent, { recursive: true });
    await mkdir(outputDirectory);
    const outputPath = resolve(
      outputDirectory,
      "proposed-research-question.json"
    );
    outputArtifactRef = artifactRef(outputPath);
    await writeFile(
      outputPath,
      JSON.stringify(recorded.value.proposal, null, 2),
      "utf8"
    );
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        scopeId: validatedScope.value.id,
        questionId,
        requestId: request.id,
        occurredAt: recorded.value.invocation.completedAt,
        actorType: "model",
        actorId: recorded.value.invocation.id,
        stage: "research_question_drafting",
        eventType: "research.question.draft.proposed",
        status: "completed",
        requestArtifactRef: artifactRef(requestPath),
        requestArtifactSha256: sha256(requestBytes),
        responseArtifactRef: artifactRef(responsePath),
        responseArtifactSha256: sha256(responseBytes),
        proposalArtifactRef: outputArtifactRef
      })}\n${JSON.stringify({
        runId,
        scopeId: validatedScope.value.id,
        questionId,
        requestId: request.id,
        occurredAt: recordedAt,
        actorType: "controller",
        stage: "research_question_drafting",
        eventType: "research.question.draft.validated",
        status: "completed",
        proposalArtifactRef: outputArtifactRef
      })}\n`,
      "utf8"
    );
    console.log(`Run: ${runId}`);
    console.log(`Question: ${questionId}`);
    console.log("Status: proposed");
    console.log(`Output: ${outputArtifactRef}`);
    console.log("Next: review and edit the proposal, then use approve:question.");
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          runId,
          questionId,
          occurredAt: new Date().toISOString(),
          actorType: "controller",
          stage: "research_question_drafting",
          eventType: "research.question.draft.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Research-question draft recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
