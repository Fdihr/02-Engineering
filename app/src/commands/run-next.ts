import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validatePerformedAdjudication } from "../modules/synthesis/key-judgement-stage.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import { validateExceptionItem } from "../modules/exceptions/exception-item.js";
import { loadExceptionState } from "./exception-io.js";
import {
  deterministicRecorderForRequest,
  driveRunNext,
  type DeterministicRunStep,
  type RunNextFacts
} from "../workflow/run-next.js";
import type { WorkflowStage } from "../workflow/workflow-projection.js";
import { assuranceRunRoot, commandError, longPath } from "./assurance-io.js";
import { inspectBoundedSynthesis, runBoundedSynthesis } from "./bounded-synthesis.js";
import { inspectBoundedMemo, listBoundedMemoDirectories, runBoundedMemo } from "./bounded-memo.js";
import { hasBoundedMemoAuthority } from "./memo-execution-io.js";
import { inspectMemoRevision, runMemoRevision } from "./revise-memo.js";

const usage = "Usage: npm run run:next -- <run-id>";

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(longPath(directory), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    })
  );
  return nested.flat();
};

const readJson = async (path: string): Promise<unknown | undefined> => {
  try {
    return JSON.parse(await readFile(longPath(path), "utf8")) as unknown;
  } catch {
    return undefined;
  }
};

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

const requestCommand = (path: string): DeterministicRunStep["command"] | undefined => {
  return deterministicRecorderForRequest(basename(path));
};

const commandFile: Record<DeterministicRunStep["command"], string> = {
  "record:research-question-draft": "src/commands/record-research-question-draft.ts",
  "record:question-relevance": "src/commands/record-question-relevance.ts",
  "record:assurance-extract": "src/commands/record-assurance-extract.ts",
  "record:synthesis-build": "src/commands/record-synthesis-build.ts",
  "record:synthesis-challenge": "src/commands/record-synthesis-challenge.ts",
  "record:key-judgements": "src/commands/record-key-judgements.ts",
  "record:memo-writer": "src/commands/record-memo-writer.ts"
};

const collectConsumedResponseRefs = async (files: string[]): Promise<Set<string>> => {
  const refs = new Set<string>();
  const collectRefs = (value: unknown, parentKey?: string): void => {
    if (typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(item => collectRefs(item, parentKey));
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.responseArtifactRef === "string") refs.add(record.responseArtifactRef);
    if (parentKey === "response" && typeof record.artifactRef === "string") refs.add(record.artifactRef);
    Object.entries(record).forEach(([key, child]) => collectRefs(child, key));
  };
  for (const path of files) {
    if (path.endsWith("events.jsonl")) {
      const lines = (await readFile(longPath(path), "utf8")).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as { responseArtifactRef?: unknown };
          if (typeof event.responseArtifactRef === "string") refs.add(event.responseArtifactRef);
        } catch {
          // A malformed event log is not a runnable next step.
        }
      }
      continue;
    }
    if (!path.endsWith(".json")) continue;
    const value = await readJson(path);
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    collectRefs(value);
  }
  return refs;
};

const inspectRun = async (runRoot: string, runId: string): Promise<RunNextFacts> => {
  const directory = resolve(runRoot, runId);
  if (!(await stat(longPath(directory))).isDirectory()) throw new Error("Run directory does not exist.");
  const files = await listFiles(directory);
  const openExceptionPaths: string[] = [];
  const openExceptions: Array<{ path: string; refs: string[] }> = [];
  for (const path of files.filter((file) => basename(file) === "exception-item.json")) {
    const state = await loadExceptionState(path).catch(() => undefined);
    const item = state ? { ok: true as const, value: state.item } : validateExceptionItem(await readJson(path));
    // An unreadable decision keeps the item open: integrity doubt must still block.
    if (item.ok && (state ? state.open : item.value.status === "open")) {
      const exceptionPath = artifactRef(path);
      openExceptionPaths.push(exceptionPath);
      openExceptions.push({
        path: exceptionPath,
        refs: item.value.refs.map((ref) => ref.artifactRef)
      });
    }
  }
  const hasIntentApproval = files.some(
    (path) => basename(path) === "approved-research-question.json"
  );
  const consumed = await collectConsumedResponseRefs(files);
  const responseFiles = files.filter((path) => /^copilot-response.*\.json$/.test(basename(path)));
  const deterministicSteps: DeterministicRunStep[] = [];
  for (const responsePath of responseFiles) {
    if (consumed.has(artifactRef(responsePath))) continue;
    const siblings = files.filter((path) => resolve(path, "..") === resolve(responsePath, ".."));
    const requestPath = siblings.find((path) => requestCommand(path));
    const command = requestPath ? requestCommand(requestPath) : undefined;
    if (requestPath && command) {
      deterministicSteps.push({
        command,
        requestPath: artifactRef(requestPath),
        responsePath: artifactRef(responsePath)
      });
    }
  }
  const pendingModelRequests: Array<{ path: string; preparedAt: number }> = [];
  for (const requestPath of files.filter((path) => requestCommand(path))) {
    const directoryPath = resolve(requestPath, "..");
    if (!responseFiles.some((path) => resolve(path, "..") === directoryPath)) {
      const value = await readJson(requestPath);
      const preparedAt =
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof (value as { preparedAt?: unknown }).preparedAt === "string"
          ? Date.parse((value as { preparedAt: string }).preparedAt)
          : 0;
      pendingModelRequests.push({
        path: artifactRef(requestPath),
        preparedAt: Number.isNaN(preparedAt) ? 0 : preparedAt
      });
    }
  }
  const newestPendingModelRequest = pendingModelRequests.sort(
    (left, right) => right.preparedAt - left.preparedAt
  )[0];
  const gates = files.filter((path) => basename(path) === "publication-gate.json");
  const latestGate = gates.sort().at(-1);
  const gate = latestGate ? await readJson(latestGate) : undefined;
  const gateRecord = typeof gate === "object" && gate !== null && !Array.isArray(gate)
    ? (gate as { humanApprovalAvailable?: unknown; reasons?: unknown })
    : undefined;
  const governanceBlockerPaths =
    gateRecord && Array.isArray(gateRecord.reasons) && gateRecord.reasons.length > 0 && latestGate
      ? [artifactRef(latestGate)]
      : [];
  const committedOutcomes = files.flatMap((path) => {
    const name = basename(path);
    const stage: WorkflowStage | undefined =
      name === "approved-research-question.json" ? "intent" :
      name === "discovery-results.json" ? "collect" :
      /^source-note-(reviewed|provisional)\.json$/.test(name) ? "assure" :
      name === "synthesis-build-record.json" ? "synthesise" :
      name === "memo.json" ? "memo" : undefined;
    return stage ? [{ stage, paths: [artifactRef(path)] }] : [];
  });
  return {
    hasIntentApproval,
    runId,
    committedOutcomes,
    openExceptionPaths,
    openExceptions,
    deterministicSteps,
    pendingModelRequestPaths: newestPendingModelRequest
      ? [newestPendingModelRequest.path]
      : [],
    ...(latestGate ? { publicationGatePath: artifactRef(latestGate) } : {}),
    publicationApprovalAvailable: gateRecord?.humanApprovalAvailable === true,
    governanceBlockerPaths,
    evidenceAvailable: files.some((path) =>
      /^(source-note-(reviewed|provisional)\.json|synthesis-build-record\.json)$/.test(basename(path))
    )
  };
};

const main = async (): Promise<void> => {
  try {
    const [runId, ...extra] = process.argv.slice(2);
    if (!runId || extra.length > 0 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
      throw new Error(usage);
    }
    const revisions = [];
    try {
      for (const entry of await readdir(longPath(resolve(assuranceRunRoot(), runId, "memo", "revisions")), { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const path = resolve(assuranceRunRoot(), runId, "memo", "revisions", entry.name, "authorization.json");
        try { revisions.push({ parent: entry.name, time: (await stat(longPath(path))).mtimeMs }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    revisions.sort((a, b) => b.time - a.time);
    if (revisions[0]) {
      let execution = await inspectMemoRevision(assuranceRunRoot(), runId, revisions[0].parent);
      if (execution.status === "prepared" || execution.status === "response-saved") {
        console.log("Resuming editorial revision within its existing authorization.");
        await runMemoRevision(
          assuranceRunRoot(),
          runId,
          revisions[0].parent,
          "resume"
        );
        execution = await inspectMemoRevision(assuranceRunRoot(), runId, revisions[0].parent);
      }
      console.log(`Editorial revision: ${execution.status}\nUnused authorized calls: ${execution.remainingCalls}`);
      if (execution.error) console.log(`Stopped: ${execution.error}`);
      else if (execution.memoId) console.log(`Recommended human action: review revised memo ${execution.memoId}; publication is not approved.`);
      else if (execution.status === "prepared" || execution.status === "response-saved") {
        console.log(`Resume: npm run revise:memo -- resume ${runId} ${revisions[0].parent}`);
      } else console.log("No automatic resume is available.");
      if (["blocked", "indeterminate"].includes(execution.status)) process.exitCode = 1;
      return;
    }
    const boundedMemo = await hasBoundedMemoAuthority(assuranceRunRoot(), runId);
    if (boundedMemo) {
      const memoEntries = await listBoundedMemoDirectories(assuranceRunRoot(), runId);
      let execution = await inspectBoundedMemo(assuranceRunRoot(), runId);
      if (execution.action !== "stop") {
        console.log("Resuming bounded memo within its existing authorization.");
        await runBoundedMemo(assuranceRunRoot(), runId, "resume");
        execution = await inspectBoundedMemo(assuranceRunRoot(), runId);
      }
      let newerSynthesis = false;
      if (execution.status === "memo-review") {
        const runFiles = await listFiles(resolve(assuranceRunRoot(), runId));
        const builds = [];
        for (const path of runFiles.filter(item => basename(item) === "synthesis-build-record.json")) {
          const parsed = validateSynthesisBuildRecord(await readJson(path));
          if (parsed.ok) builds.push({ path, recordedAt: parsed.value.recordedAt });
        }
        builds.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.path.localeCompare(b.path));
        const latestBuild = builds.at(-1);
        if (latestBuild && resolve(latestBuild.path) !== resolve(execution.authority.build.artifactRef)) {
          newerSynthesis = true;
          const authorizedAdjudications = new Set(memoEntries.map(entry => resolve(entry.authority.adjudication.artifactRef)));
          const pendingAdjudications = [];
          for (const path of runFiles.filter(item => basename(item) === "performed-adjudication.json")) {
            const parsed = validatePerformedAdjudication(await readJson(path));
            if (parsed.ok && resolve(parsed.value.buildRecord.artifactRef) === resolve(latestBuild.path) &&
                !authorizedAdjudications.has(resolve(path))) pendingAdjudications.push(path);
          }
          if (pendingAdjudications.length) {
            console.log("Recommended human action: explicitly authorize bounded selection and writing.");
            pendingAdjudications.forEach(path => console.log(`Start: npm run run:memo -- start ${runId} <analyst-id> ${artifactRef(path)}`));
            return;
          }
        }
      }
      if (!newerSynthesis) {
        console.log(`Bounded memo: ${execution.status}\nUnused authorized calls: ${execution.remainingCalls}`);
        if (execution.error) console.log(`Stopped: ${execution.error}`);
        else if (execution.memoReview?.decision) {
          console.log(`Memo decision: ${execution.memoReview.decision.decision}. ${execution.memoReview.revisionRoute.reason} Publication remains blocked.`);
          if (execution.memoReview.revisionRoute.eligible) console.log(`Start: npm run revise:memo -- start ${runId} ${execution.memoReview.target.memoId} <analyst-id>`);
        }
        else if (execution.memoReview?.decisionStatus === "stale") console.log("Stopped: the saved memo decision is stale and grants no approval.");
        else if (execution.status === "memo-review") console.log("Recommended human action: review the memo; publication is not approved.");
        else if (execution.action !== "stop") console.log(`Resume: npm run run:memo -- resume ${runId}`);
        else console.log("No automatic resume is available.");
        if (["blocked", "indeterminate"].includes(execution.status)) process.exitCode = 1;
        return;
      }
    }
    let bounded = false;
    try { bounded = (await stat(longPath(resolve(assuranceRunRoot(), runId, "synthesis", "execution", "authorization.json")))).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (bounded) {
      let execution = await inspectBoundedSynthesis(assuranceRunRoot(), runId);
      if (execution.action.kind !== "stop") {
        console.log("Resuming bounded synthesis within its existing authorization.");
        await runBoundedSynthesis(assuranceRunRoot(), runId, "resume");
        execution = await inspectBoundedSynthesis(assuranceRunRoot(), runId);
      }
      console.log(`Bounded synthesis: ${execution.status}\nUnused authorized calls: ${execution.remainingCalls}`);
      if (execution.error) console.log(`Stopped: ${execution.error}`);
      else if (execution.status === "human-waiting") {
        const performed = [];
        for (const path of (await listFiles(resolve(assuranceRunRoot(), runId))).filter(path => basename(path) === "performed-adjudication.json")) {
          const parsed = validatePerformedAdjudication(await readJson(path));
          if (parsed.ok && isDeepStrictEqual(parsed.value.challengeRecord, execution.stages.challenge.record)) performed.push(path);
        }
        if (performed.length) {
          console.log("Recommended human action: explicitly authorize bounded selection and writing.");
          performed.forEach(path => console.log(`Start: npm run run:memo -- start ${runId} <analyst-id> ${artifactRef(path)}`));
        } else console.log("Recommended human action: adjudicate");
      }
      else if (execution.action.kind !== "stop") console.log(`Resume: npm run run:synthesis -- resume ${runId}`);
      else console.log("No automatic resume is available.");
      if (["failed", "blocked", "indeterminate"].includes(execution.status)) process.exitCode = 1;
      return;
    }
    const execution = await driveRunNext(
      () => inspectRun(assuranceRunRoot(), runId),
      async (step) => {
        console.log(`Recording saved response: ${step.command}`);
        const result = spawnSync(
          process.execPath,
          ["--import", "tsx", resolve(commandFile[step.command]), step.requestPath, step.responsePath],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
              ...process.env,
              QUESTION_RELEVANCE_RUN_DIR: assuranceRunRoot(),
              RESEARCH_RUN_DIR: assuranceRunRoot()
            }
          }
        );
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        if (result.error) throw result.error;
        if (result.status !== 0) {
          process.exitCode = result.status ?? 1;
          throw new Error(`${step.command} failed with status ${result.status ?? "unknown"}.`);
        }
      }
    );
    if (execution.executed.length > 0) {
      console.log(`Recorded ${execution.executed.length} saved response(s).`);
    }
    const action = execution.action;
    if (action.kind === "human-wait") {
      console.log(`Recommended human action: ${action.surface}`);
      action.paths.forEach((path) => console.log(`Path: ${path}`));
      return;
    }
    if (action.kind === "machine-wait") {
      console.log(`Machine work waiting: ${action.replacement}`);
      action.paths.forEach((path) => console.log(`Path: ${path}`));
      return;
    }
    if (action.kind === "complete") {
      console.log("Run has no recognized next action.");
      return;
    }
  } catch (error) {
    console.error(`Run-next failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

await main();