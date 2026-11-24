import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { stat } from "node:fs/promises";
import {
  createExceptionDecision,
  validateExceptionDecision,
  type ExceptionDecisionRecord
} from "../modules/exceptions/exception-decision.js";
import { validateExceptionItem, type ExceptionItem } from "../modules/exceptions/exception-item.js";
import {
  ensureDirectory,
  loadJsonArtifact,
  longPath,
  writeJsonOnce,
  type LoadedArtifact
} from "./assurance-io.js";

export const EXCEPTION_ITEM_FILE = "exception-item.json";
export const EXCEPTION_DECISION_FILE = "exception-decision.json";

export const persistExceptionItem = async (
  runRoot: string,
  item: ExceptionItem
): Promise<LoadedArtifact> => {
  const directory = resolve(runRoot, item.runId, "exceptions", item.id);
  await ensureDirectory(directory);
  const artifactRef = await writeJsonOnce(
    resolve(directory, EXCEPTION_ITEM_FILE),
    item
  );
  return loadJsonArtifact(resolve(artifactRef));
};

export type ExceptionState = {
  artifact: LoadedArtifact;
  item: ExceptionItem;
  decision?: ExceptionDecisionRecord;
  open: boolean;
};

const exists = async (path: string): Promise<boolean> =>
  stat(longPath(path)).then(() => true, () => false);

/**
 * Items are write-once, so a decision lives beside the item it decides.
 * An item is open until a sibling decision validates against its exact bytes;
 * an invalid decision is an integrity failure, never a silent close.
 */
export const loadExceptionState = async (itemPath: string): Promise<ExceptionState> => {
  const artifact = await loadJsonArtifact(itemPath);
  const item = validateExceptionItem(artifact.value);
  if (!item.ok) throw new Error(`Exception item is invalid: ${item.error}.`);
  const decisionPath = resolve(dirname(itemPath), EXCEPTION_DECISION_FILE);
  if (!(await exists(decisionPath))) {
    return { artifact, item: item.value, open: item.value.status === "open" };
  }
  const decision = validateExceptionDecision(
    (await loadJsonArtifact(decisionPath)).value, item.value, artifact.binding
  );
  if (!decision.ok) throw new Error(`Exception decision for ${item.value.id} is invalid: ${decision.error}.`);
  return { artifact, item: item.value, decision: decision.value, open: false };
};

export const recordExceptionDecision = async (input: {
  runRoot: string;
  itemPath: string;
  decision: string;
  decidedBy: string;
  reason: string;
  decidedAt: string;
}): Promise<{ state: ExceptionState; decisionPath: string }> => {
  const itemPath = resolve(input.itemPath);
  const within = relative(resolve(input.runRoot), itemPath).replaceAll("\\", "/");
  if (within.startsWith("..") || isAbsolute(within) || !/^[^/]+\/exceptions\/[^/]+\/exception-item\.json$/.test(within) ||
      basename(itemPath) !== EXCEPTION_ITEM_FILE) {
    throw new Error("Exception item must be runs/<runId>/exceptions/<id>/exception-item.json inside the run root.");
  }
  const state = await loadExceptionState(itemPath);
  if (!state.open) throw new Error(`Exception ${state.item.id} is already decided.`);
  if (within.split("/")[0] !== state.item.runId || within.split("/")[2] !== state.item.id) {
    throw new Error("Exception item location does not match its run or identity.");
  }
  const created = createExceptionDecision({
    exception: state.item,
    exceptionBinding: state.artifact.binding,
    decision: input.decision,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    reason: input.reason
  });
  if (!created.ok) throw new Error(`Exception decision rejected: ${created.error}.`);
  const decisionPath = resolve(dirname(itemPath), EXCEPTION_DECISION_FILE);
  await writeJsonOnce(decisionPath, created.value);
  return { state: await loadExceptionState(itemPath), decisionPath };
};
