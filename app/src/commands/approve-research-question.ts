import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { renderResearchQuestionSummary } from "../modules/reporting/research-question-summary.js";
import { approveResearchQuestion } from "../modules/research/research-question.js";

const usage =
  "Usage: npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown research-question approval failure";

const resolveRunArtifact = (runRoot: string, value: string, label: string): string => {
  const path = resolve(value);
  const relativeToRoot = relative(runRoot, path);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must remain inside the configured run directory.`);
  }
  return path;
};

const main = async (): Promise<void> => {
  const approvedAt = new Date().toISOString();
  const runRoot = resolve(process.env.RESEARCH_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "research-events.jsonl");
  let reviewerId: string | undefined;
  let proposalArtifactRef: string | undefined;

  try {
    const [proposalPathValue, scopePathValue, reviewerIdValue, ...extra] =
      process.argv.slice(2);
    if (!proposalPathValue || !scopePathValue || !reviewerIdValue || extra.length > 0) {
      throw new Error(usage);
    }
    reviewerId = reviewerIdValue;
    const proposalPath = resolve(proposalPathValue);
    proposalArtifactRef = artifactRef(proposalPath);
    const scopePath = resolveRunArtifact(runRoot, scopePathValue, "Approved memo scope");
    const [proposalBytes, scopeBytes] = await Promise.all([
      readFile(proposalPath),
      readFile(scopePath)
    ]);
    const proposal: unknown = JSON.parse(proposalBytes.toString("utf8"));
    const parsedScope: unknown = JSON.parse(scopeBytes.toString("utf8"));
    const scope =
      typeof parsedScope === "object" && parsedScope !== null && !Array.isArray(parsedScope)
        ? {
            ...parsedScope,
            artifactRef: artifactRef(scopePath),
            artifactSha256: createHash("sha256").update(scopeBytes).digest("hex")
          }
        : parsedScope;
    const result = approveResearchQuestion(
      proposal,
      scope,
      reviewerId,
      approvedAt
    );
    if (!result.ok) {
      throw new Error(`Research-question approval failed: ${result.error}`);
    }
    const pathSafeId = (value: string): boolean =>
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";
    if (!pathSafeId(result.value.runId) || !pathSafeId(result.value.id)) {
      throw new Error("Run and question IDs must be path-safe identifiers.");
    }

    await mkdir(runRoot, { recursive: true });
    const questionParent = resolve(runRoot, result.value.runId, "research-questions");
    const questionDirectory = resolve(questionParent, result.value.id);
    await mkdir(questionParent, { recursive: true });
    await mkdir(questionDirectory);
    const approvedPath = resolve(questionDirectory, "approved-research-question.json");
    const summaryPath = resolve(questionDirectory, "approved-research-question-summary.md");
    await writeFile(approvedPath, JSON.stringify(result.value, null, 2), "utf8");
    await writeFile(summaryPath, renderResearchQuestionSummary(result.value), "utf8");
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        questionId: result.value.id,
        scopeId: result.value.scopeApproval?.scopeId,
        scopeVersion: result.value.scopeApproval?.scopeVersion,
        runId: result.value.runId,
        occurredAt: approvedAt,
        actorType: "human",
        actorId: result.value.approvedBy,
        stage: "research_question_approval",
        eventType: "research.question.approved",
        status: "completed",
        proposalArtifactRef,
        approvedArtifactRef: artifactRef(approvedPath)
      })}\n`,
      "utf8"
    );

    console.log(`Question: ${result.value.id}`);
    console.log(`Status: ${result.value.status}`);
    console.log(`Approved by: ${result.value.approvedBy}`);
    console.log(`Output: ${artifactRef(approvedPath)}`);
    console.log(`Review: ${artifactRef(summaryPath)}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await mkdir(runRoot, { recursive: true });
      await appendFile(
        eventLogPath,
        `${JSON.stringify({
          occurredAt: approvedAt,
          actorType: "human",
          actorId: reviewerId,
          stage: "research_question_approval",
          eventType: "research.question.failed",
          status: "failed",
          proposalArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Research-question approval failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();