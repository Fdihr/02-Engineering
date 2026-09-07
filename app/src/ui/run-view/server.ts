/**
 * Run view server. GET only, binds to 127.0.0.1 by default, never writes.
 *
 * Routes:
 *   GET /               the page
 *   GET /api/run        the run view (scan cached for `cacheMs`)
 *   GET /api/artifact   ?path=<run-relative path>, JSON or text, confined to the run root
 *
 * Any other method answers 405. Any path outside the run root answers 403.
 */
import http from "node:http";
import { URL } from "node:url";
import { buildRunView, type RunView } from "./model.js";
import { renderPage } from "./page.js";
import { DEFAULT_SCAN_LIMITS, readArtifactText, resolveInsideRun, scanRunDirectory, type ScanLimits } from "./scan.js";

export type RunViewOptions = {
  runDir: string;
  runId: string;
  host?: string;
  port?: number;
  pollMs?: number;
  cacheMs?: number;
  limits?: ScanLimits;
  maxArtifactBytes?: number;
};

export type RunViewServer = {
  server: http.Server;
  address: { host: string; port: number };
  close: () => Promise<void>;
};

type ViewWithTruncation = RunView & { truncated: boolean };

export const startRunView = async (options: RunViewOptions): Promise<RunViewServer> => {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4317;
  const pollMs = options.pollMs ?? 2000;
  const cacheMs = options.cacheMs ?? 1500;
  const limits = options.limits ?? DEFAULT_SCAN_LIMITS;
  const maxArtifactBytes = options.maxArtifactBytes ?? 4 * 1024 * 1024;

  let cached: { at: number; view: ViewWithTruncation } | null = null;
  let inflight: Promise<ViewWithTruncation> | null = null;

  const currentView = async (): Promise<ViewWithTruncation> => {
    const now = Date.now();
    if (cached !== null && now - cached.at < cacheMs) {
      return cached.view;
    }
    if (inflight !== null) {
      return inflight;
    }
    inflight = (async () => {
      const scan = await scanRunDirectory(options.runDir, limits);
      const view: ViewWithTruncation = {
        ...buildRunView(options.runId, scan.files, scan.jsons, scan.events, new Date().toISOString()),
        truncated: scan.truncated
      };
      cached = { at: Date.now(), view };
      inflight = null;
      return view;
    })();
    return inflight;
  };

  const page = renderPage(options.runId, pollMs);

  const send = (res: http.ServerResponse, status: number, type: string, body: string): void => {
    res.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.method !== "GET") {
        send(res, 405, "text/plain; charset=utf-8", "read-only");
        return;
      }
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.pathname === "/") {
        send(res, 200, "text/html; charset=utf-8", page);
        return;
      }
      if (url.pathname === "/api/run") {
        const view = await currentView();
        send(res, 200, "application/json; charset=utf-8", JSON.stringify(view));
        return;
      }
      if (url.pathname === "/api/artifact") {
        const relPath = url.searchParams.get("path") ?? "";
        const absolute = resolveInsideRun(options.runDir, relPath);
        if (absolute === null) {
          send(res, 403, "text/plain; charset=utf-8", "outside the run root");
          return;
        }
        const text = await readArtifactText(absolute, maxArtifactBytes);
        if (text === null) {
          send(res, 404, "text/plain; charset=utf-8", "not available");
          return;
        }
        const type = relPath.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8";
        send(res, 200, type, text);
        return;
      }
      send(res, 404, "text/plain; charset=utf-8", "not found");
    })().catch((error: unknown) => {
      send(res, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : "error");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const bound = server.address();
  const boundPort = typeof bound === "object" && bound !== null ? bound.port : port;

  return {
    server,
    address: { host, port: boundPort },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
};
