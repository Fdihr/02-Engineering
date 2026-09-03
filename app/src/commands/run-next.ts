import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { validateExceptionItem } from "../modules/exceptions/exception-item.js";
import {
  chooseRunNextAction,
  type DeterministicRunStep,
  type RunNextFacts
} from "../workflow/run-next.js";
import { assuranceRunRoot, commandError, longPath } from "./assurance-io.js";

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
  switch (basename(path)) {
    case "build-request.json":
      return "record:synthesis-build";
    case "challenge-request.json":
      return "record:synthesis-challenge";
    case "writer-request.json":
      return "record:memo-writer";
    default:
      return undefined;
  }
};

const commandFile: Record<DeterministicRunStep["command"], string> = {
  "record:synthesis-build": "src/commands/record-synthesis-build.ts",
  "record:synthesis-challenge": "src/commands/record-synthesis-challenge.ts",
  "record:memo-writer": "src/commands/record-memo-writer.ts"
};

const collectConsumedResponseRefs = async (files: string[]): Promise<Set<string>> => {
  const refs = new Set<string>();
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
    const record = value as {
      response?: { artifactRef?: unknown };
      responseArtifactRef?: unknown;
    };
    if (typeof record.response?.artifactRef === "string") refs.add(record.response.artifactRef);
    if (typeof record.responseArtifactRef === "string") refs.add(record.responseArtifactRef);
  }
  return refs;
};

const inspectRun = async (runRoot: string, runId: string): Promise<RunNextFacts> => {
  const directory = resolve(runRoot, runId);
  if (!(await stat(longPath(directory))).isDirectory()) throw new Error("Run directory does not exist.");
  const files = await listFiles(directory);
  const openExceptionPaths: string[] = [];
  for (const path of files.filter((file) => basename(file) === "exception-item.json")) {
    const item = validateExceptionItem(await readJson(path));
    if (item.ok && item.value.status === "open") openExceptionPaths.push(artifactRef(path));
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
  const pendingModelRequestPaths: string[] = [];
  for (const requestPath of files.filter((path) => requestCommand(path))) {
    const directoryPath = resolve(requestPath, "..");
    if (!responseFiles.some((path) => resolve(path, "..") === directoryPath)) {
      pendingModelRequestPaths.push(artifactRef(requestPath));
    }
  }
  const gates = files.filter((path) => basename(path) === "publication-gate.json");
  const latestGate = gates.sort().at(-1);
  const gate = latestGate ? await readJson(latestGate) : undefined;
  const gateRecord = typeof gate === "object" && gate !== null && !Array.isArray(gate)
    ? (gate as { humanApprovalAvailable?: unknown; reasons?: unknown })
    : undefined;
  const governanceBlockerPaths =
    gateRecord &&
    Array.isArray(gateRecord.reasons) &&
    gateRecord.reasons.some(
      (reason) => reason === "PROVISIONAL_MEMO_STANDARD" || reason === "LEGACY_SCOPE_LINEAGE_UNAVAILABLE"
    ) &&
    latestGate
      ? [artifactRef(latestGate)]
      : [];
  return {
    hasIntentApproval,
    openExceptionPaths,
    deterministicSteps,
    pendingModelRequestPaths,
    ...(latestGate ? { publicationGatePath: artifactRef(latestGate) } : {}),
    publicationApprovalAvailable: gateRecord?.humanApprovalAvailable === true,
    governanceBlockerPaths
  };
};

const main = async (): Promise<void> => {
  try {
    const [runId, ...extra] = process.argv.slice(2);
    if (!runId || extra.length > 0 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
      throw new Error(usage);
    }
    const action = chooseRunNextAction(await inspectRun(assuranceRunRoot(), runId));
    if (action.kind === "human-wait") {
      console.log(`Human surface waiting: ${action.surface}`);
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
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(commandFile[action.step.command]), action.step.requestPath, action.step.responsePath],
      { cwd: process.cwd(), encoding: "utf8", env: process.env }
    );
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(`Run-next failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

await main();