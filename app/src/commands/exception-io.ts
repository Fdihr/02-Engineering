import { resolve } from "node:path";
import type { ExceptionItem } from "../modules/exceptions/exception-item.js";
import {
  ensureDirectory,
  loadJsonArtifact,
  writeJsonOnce,
  type LoadedArtifact
} from "./assurance-io.js";

export const persistExceptionItem = async (
  runRoot: string,
  item: ExceptionItem
): Promise<LoadedArtifact> => {
  const directory = resolve(runRoot, item.runId, "exceptions", item.id);
  await ensureDirectory(directory);
  const artifactRef = await writeJsonOnce(
    resolve(directory, "exception-item.json"),
    item
  );
  return loadJsonArtifact(resolve(artifactRef));
};