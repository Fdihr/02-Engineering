import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { selectSeeristFeature } from "../modules/intake/intake.js";
import { createFailedLedgerEntry } from "../modules/ledger/ledger.js";
import { renderIntakeSummary } from "../modules/reporting/intake-summary.js";
import { processSource } from "../workflow/process-source.js";

type CommandOptions = {
  artifactPath: string;
  itemId: string;
  retrievedAt: string;
  researchQuestionPath: string;
  runId?: string;
};

const usage =
  "Usage: npm run intake:seerist -- <raw-response.json> <item-id> <retrieved-at-ISO-8601> <approved-research-question.json> [run-id]";

const parseOptions = (args: string[]): CommandOptions => {
  const [artifactPath, itemId, retrievedAt, researchQuestionPath, runId, ...extra] = args;
  if (!artifactPath || !itemId || !retrievedAt || !researchQuestionPath || extra.length > 0) {
    throw new Error(usage);
  }

  return {
    artifactPath,
    itemId,
    retrievedAt,
    researchQuestionPath,
    runId
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown intake failure";

const main = async (): Promise<void> => {
  const occurredAt = new Date().toISOString();
  let runId = `intake-${occurredAt.replaceAll(":", "-")}-${randomUUID()}`;
  let rawArtifactRef: string | undefined;
  const runRoot = resolve(process.env.SEERIST_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "intake-events.jsonl");

  try {
    const options = parseOptions(process.argv.slice(2));
    runId = options.runId ?? runId;
    const artifactPath = resolve(options.artifactPath);
    rawArtifactRef = artifactRef(artifactPath);
    const payload: unknown = JSON.parse(await readFile(artifactPath, "utf8"));
    const researchQuestionPath = resolve(options.researchQuestionPath);
    const researchQuestionBytes = await readFile(researchQuestionPath);
    const researchQuestionValue: unknown = JSON.parse(researchQuestionBytes.toString("utf8"));
    const researchQuestion = isRecord(researchQuestionValue)
      ? {
          ...researchQuestionValue,
          artifactRef: artifactRef(researchQuestionPath),
          artifactSha256: createHash("sha256").update(researchQuestionBytes).digest("hex")
        }
      : researchQuestionValue;
    const selected = selectSeeristFeature(payload, options.itemId);
    if (!selected.ok) {
      throw new Error(`Item selection failed: ${selected.error}`);
    }

    const result = processSource(runId, occurredAt, {
      provider: "seerist",
      endpoint: "/v1/wod",
      retrievedAt: options.retrievedAt,
      rawArtifactRef,
      researchQuestion,
      item: selected.value
    });
    if (!result.ok) {
      throw new Error(`Intake failed: ${result.error.code}/${result.error.cause}`);
    }

    const runDirectory = resolve(runRoot, runId);
    const outputPath = resolve(runDirectory, "intake-result.json");
    const summaryPath = resolve(runDirectory, "intake-summary.md");
    await mkdir(runDirectory, { recursive: true });
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