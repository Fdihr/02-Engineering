import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { assessCopilotPocResponse } from "../modules/relevance/copilot-poc.js";
import { validateQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";

const usage =
  "Usage: npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown relevance-recording failure";

const pathSafeId = (value: string): boolean =>
  value !== "." &&
  value !== ".." &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

const resolveRunArtifact = (runRoot: string, value: string, label: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = resolve(process.env.QUESTION_RELEVANCE_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "question-relevance-events.jsonl");
  let runId: string | undefined;
  let sourceItemId: string | undefined;
  let assessmentId: string | undefined;
  let invocationId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [requestPathValue, responsePathValue, ...extra] = process.argv.slice(2);
    if (!requestPathValue || !responsePathValue || extra.length > 0) {
      throw new Error(usage);
    }
    const requestPath = resolveRunArtifact(runRoot, requestPathValue, "Request");
    const responsePath = resolveRunArtifact(runRoot, responsePathValue, "Response");
    const [requestBytes, responseBytes] = await Promise.all([
      readFile(requestPath),
      readFile(responsePath)
    ]);
    const request: unknown = JSON.parse(requestBytes.toString("utf8"));
    const response: unknown = JSON.parse(responseBytes.toString("utf8"));
    const validatedRequest = validateQuestionRelevanceRequest(request);
    if (!validatedRequest.ok) {
      throw new Error(`Relevance request rejected: ${validatedRequest.error}`);
    }
    const sourceDocumentPath = resolveRunArtifact(
      runRoot,
      validatedRequest.value.sourceDocumentArtifactRef,
      "Source document"
    );
    const researchQuestionPath = resolveRunArtifact(
      runRoot,
      validatedRequest.value.researchQuestion.artifactRef,
      "Research question"
    );
    const [sourceDocumentBytes, researchQuestionBytes] = await Promise.all([
      readFile(sourceDocumentPath),
      readFile(researchQuestionPath)
    ]);
    if (
      sha256(sourceDocumentBytes) !==
      validatedRequest.value.sourceDocumentArtifactSha256
    ) {
      throw new Error("Source document artifact checksum does not match the request.");
    }
    if (
      sha256(researchQuestionBytes) !==
      validatedRequest.value.researchQuestion.artifactSha256
    ) {
      throw new Error("Research-question artifact checksum does not match the request.");
    }
    const result = assessCopilotPocResponse(
      request,
      artifactRef(requestPath),
      sha256(requestBytes),
      response,
      artifactRef(responsePath),
      sha256(responseBytes)
    );
    if (!result.ok) {
      throw new Error(`Copilot PoC response rejected: ${result.error}`);
    }

    runId = result.value.assessment.runId;
    sourceItemId = result.value.assessment.sourceItemId;
    assessmentId = result.value.assessment.id;
    invocationId = result.value.assessment.modelInvocation.id;
    const sourceDocumentId = result.value.assessment.sourceDocumentId;
    const requestId = validatedRequest.value.id;
    if (
      ![
        runId,
        sourceItemId,
        sourceDocumentId,
        requestId,
        assessmentId,
        invocationId
      ].every(pathSafeId)
    ) {
      throw new Error("Relevance artifact IDs must be path-safe identifiers.");
    }

    const outputParent = resolve(
      runRoot,
      runId,
      "sources",
      sourceItemId,
      sourceDocumentId,
      "question-relevance",
      requestId,
      "assessments"
    );
    const outputDirectory = resolve(outputParent, assessmentId);
    await mkdir(outputParent, { recursive: true });
    await mkdir(outputDirectory);
    const assessmentPath = resolve(
      outputDirectory,
      "question-relevance-assessment.json"
    );
    const decisionPath = resolve(outputDirectory, "question-relevance-decision.json");
    outputArtifactRef = artifactRef(assessmentPath);
    await writeFile(
      assessmentPath,
      JSON.stringify(result.value.assessment, null, 2),
      "utf8"
    );
    await writeFile(
      decisionPath,
      JSON.stringify(result.value.decision, null, 2),
      "utf8"
    );
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        runId,
        sourceItemId,
        assessmentId,
        occurredAt: result.value.assessment.modelInvocation.completedAt,
        actorType: "model",
        actorId: invocationId,
        stage: "question_relevance",
        eventType: "question.relevance.proposed",
        status: "completed",
        responseArtifactRef: result.value.assessment.modelInvocation.responseArtifactRef
      })}\n${JSON.stringify({
        runId,
        sourceItemId,
        assessmentId,
        occurredAt: recordedAt,
        actorType: "controller",
        stage: "question_relevance",
        eventType: "question.relevance.validated",
        status: "completed",
        artifactRef: outputArtifactRef,
        decisionArtifactRef: artifactRef(decisionPath)
      })}\n`,
      "utf8"
    );

    console.log(`Run: ${runId}`);
    console.log(`Source: ${sourceItemId}`);
    console.log(`Assessment: ${assessmentId}`);
    console.log(`Verdict: ${result.value.assessment.verdict}`);
    console.log(`Destination: ${result.value.decision.destination}`);
    console.log(`Approval: ${result.value.decision.approvalStatus}`);
    console.log(`Output: ${outputArtifactRef}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          runId,
          sourceItemId,
          assessmentId,
          occurredAt: new Date().toISOString(),
          actorType: "controller",
          stage: "question_relevance",
          eventType: "question.relevance.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Relevance recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();