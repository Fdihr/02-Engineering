/**
 * Command: run:view
 *
 *   npm run run:view -- runs/research-cia-russia-20260828 [--run-id <id>] [--port 4317] [--host 127.0.0.1]
 *
 * Starts the read-only run view on localhost and prints the URL. Ctrl+C stops it.
 * The run id defaults to the run directory's name.
 */
import path from "node:path";
import { startRunView } from "../ui/run-view/server.js";

const parseArgs = (argv: string[]): { runDir: string; runId: string; port: number; host: string } | null => {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined) {
        return null;
      }
      flags.set(arg.slice(2), value);
      index += 1;
    } else {
      positional.push(arg);
    }
  }
  const runDir = positional[0];
  if (runDir === undefined) {
    return null;
  }
  const port = Number(flags.get("port") ?? "4317");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return null;
  }
  return {
    runDir,
    runId: flags.get("run-id") ?? path.basename(path.resolve(runDir)),
    port,
    host: flags.get("host") ?? "127.0.0.1"
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write("usage: run:view <runDir> [--run-id <id>] [--port <port>] [--host <host>]\n");
    process.exitCode = 2;
    return;
  }
  const started = await startRunView({ runDir: args.runDir, runId: args.runId, port: args.port, host: args.host });
  process.stdout.write(`run view (read-only): http://${started.address.host}:${started.address.port}/  run=${args.runId}  dir=${path.resolve(args.runDir)}\n`);
  const stop = (): void => {
    void started.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
};

void main();
