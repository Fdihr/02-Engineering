import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { approveRequirements } from "../modules/assurance/requirements.js";
import { createAssuranceEvent } from "../modules/assurance/events.js";
import {
  appendAssuranceEvent,
  artifactRef,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadRunArtifact,
  resolveRunArtifact,
  sha256,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run approve:requirements -- <requirements-proposal.json> <approved-research-question.json> <reviewer-id>";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const main = async (): Promise<void> => {
  const approvedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  const eventLogPath = resolve(runRoot, "source-assurance-events.jsonl");
  let reviewerId: string | undefined;
  let runId: string | undefined;
  let outputArtifactRef: string | undefined;

  try {
    const [proposalPathValue, questionPathValue, reviewerIdValue, ...extra] =
      process.argv.slice(2);
    if (!proposalPathValue || !questionPathValue || !reviewerIdValue || extra.length > 0) {
      throw new Error(usage);
    }
    reviewerId = reviewerIdValue;

    const proposal = await loadRunArtifact(
      runRoot,
      proposalPathValue,
      "Requirements proposal"
    );
    const questionPath = resolveRunArtifact(
      runRoot,
      questionPathValue,
      "Approved research question"
    );
    const questionBytes = await readFile(questionPath);
    const parsedQuestion: unknown = JSON.parse(questionBytes.toString("utf8"));
    const questionValue = isRecord(parsedQuestion)
      ? {
          ...parsedQuestion,
          artifactRef: artifactRef(questionPath),
          artifactSha256: sha256(questionBytes)
        }
      : parsedQuestion;

    const approved = approveRequirements({
      proposalValue: proposal.value,
      proposalArtifactRef: proposal.binding.artifactRef,
      proposalArtifactSha256: proposal.binding.artifactSha256,
      researchQuestionValue: questionValue,
      reviewerId,
      approvedAt
    });
    if (!approved.ok) {
      throw new Error(`Requirements approval rejected: ${approved.error}`);
    }
    runId = approved.value.runId;

    const parent = resolve(runRoot, runId, "requirements");
    const directory = resolve(parent, approved.value.proposalId);
    await ensureDirectory(parent);
    await mkdir(directory);
    outputArtifactRef = await writeJsonOnce(
      resolve(directory, "approved-requirements.json"),
      approved.value
    );

    await appendAssuranceEvent(
      eventLogPath,
      createAssuranceEvent({
        runId,
        occurredAt: approvedAt,
        actorType: "human",
        actorId: reviewerId,
        step: "requirements_approval",
        eventType: "assurance.requirements.approved",
        status: "completed",
        artifactRef: outputArtifactRef
      })
    );

    console.log(`Run: ${runId}`);
    console.log(`Approval: ${approved.value.approvalId}`);
    console.log(`Question: ${approved.value.questionId}`);
    console.log(`Requirements: ${approved.value.requirements.length}`);
    console.log(`Output: ${outputArtifactRef}`);
  } catch (error) {
    const message = commandError(error);
    try {
      await ensureDirectory(runRoot);
      await appendAssuranceEvent(
        eventLogPath,
        createAssuranceEvent({
          runId,
          occurredAt: new Date().toISOString(),
          actorType: "human",
          actorId: reviewerId,
          step: "requirements_approval",
          eventType: "assurance.requirements.failed",
          status: "failed",
          artifactRef: outputArtifactRef,
          error: message
        })
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Requirements approval failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
