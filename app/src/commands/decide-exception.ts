import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { artifactRef, commandError } from "./assurance-io.js";
import { recordExceptionDecision } from "./exception-io.js";

export const exceptionRunRoot = (): string =>
  resolve(process.env.EXCEPTION_RUN_DIR ?? "runs");

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [itemPath, decision, decidedBy, ...reasonParts] = process.argv.slice(2);
    const reason = reasonParts.join(" ");
    if (!itemPath || !decision || !decidedBy || !reason) {
      throw new Error("Usage: decide:exception -- <exception-item.json> <exclude|accept-gap> <analyst-id> <reason>");
    }
    const { state, decisionPath } = await recordExceptionDecision({
      runRoot: exceptionRunRoot(), itemPath, decision, decidedBy, reason,
      decidedAt: new Date().toISOString()
    });
    console.log(`Exception: ${state.item.id}`);
    console.log(`Decision: ${state.decision?.decision}`);
    console.log(`Decided by: ${state.decision?.decidedBy}`);
    console.log(`Output: ${artifactRef(decisionPath)}`);
  } catch (error) {
    console.error(`Exception decision failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
}
