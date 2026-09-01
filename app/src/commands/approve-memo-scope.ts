import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { renderMemoScopeSummary } from "../modules/reporting/memo-scope-summary.js";
import { approveMemoScope } from "../modules/research/memo-scope.js";

const usage =
  "Usage: npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>";

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const pathSafeId = (value: string): boolean =>
  value !== "." &&
  value !== ".." &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

const commandError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown memo-scope approval failure";

const main = async (): Promise<void> => {
  const approvedAt = new Date().toISOString();
  const runRoot = resolve(process.env.RESEARCH_RUN_DIR ?? "runs");
  const eventLogPath = resolve(runRoot, "research-events.jsonl");
  let reviewerId: string | undefined;
  let proposalArtifactRef: string | undefined;

  try {
    const [proposalPathValue, reviewerIdValue, ...extra] = process.argv.slice(2);
    if (!proposalPathValue || !reviewerIdValue || extra.length > 0) {
      throw new Error(usage);
    }
    reviewerId = reviewerIdValue;
    const proposalPath = resolve(proposalPathValue);
    proposalArtifactRef = artifactRef(proposalPath);
    const proposal: unknown = JSON.parse(await readFile(proposalPath, "utf8"));
    const result = approveMemoScope(proposal, reviewerId, approvedAt);
    if (!result.ok) {
      throw new Error(`Memo-scope approval failed: ${result.error}`);
    }
    if (!pathSafeId(result.value.runId) || !pathSafeId(result.value.id)) {
      throw new Error("Run and scope IDs must be path-safe identifiers.");
    }

    const scopeParent = resolve(
      runRoot,
      result.value.runId,
      "memo-scopes",
      result.value.id
    );
    const scopeDirectory = resolve(scopeParent, `v${result.value.version}`);
    await mkdir(scopeParent, { recursive: true });
    await mkdir(scopeDirectory);
    const approvedPath = resolve(scopeDirectory, "approved-memo-scope.json");
    const summaryPath = resolve(scopeDirectory, "approved-memo-scope-summary.md");
    await writeFile(approvedPath, JSON.stringify(result.value, null, 2), "utf8");
    await writeFile(summaryPath, renderMemoScopeSummary(result.value), "utf8");
    await appendFile(
      eventLogPath,
      `${JSON.stringify({
        scopeId: result.value.id,
        scopeVersion: result.value.version,
        runId: result.value.runId,
        occurredAt: approvedAt,
        actorType: "human",
        actorId: result.value.approvedBy,
        stage: "memo_scope_approval",
        eventType: "memo.scope.approved",
        status: "completed",
        proposalArtifactRef,
        approvedArtifactRef: artifactRef(approvedPath)
      })}\n`,
      "utf8"
    );

    console.log(`Scope: ${result.value.id}`);
    console.log(`Version: ${result.value.version}`);
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
          stage: "memo_scope_approval",
          eventType: "memo.scope.failed",
          status: "failed",
          proposalArtifactRef,
          error: message
        })}\n`,
        "utf8"
      );
    } catch (eventError) {
      console.error(`Event logging failed: ${commandError(eventError)}`);
    }
    console.error(`Memo-scope approval failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();