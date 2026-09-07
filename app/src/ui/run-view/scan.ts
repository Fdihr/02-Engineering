/**
 * Read-only scan of a run directory. Nothing here writes.
 *
 * Bounded: depth, entry count and JSON size are capped so a large run store cannot make
 * the dashboard unresponsive. On Windows, paths are namespaced (\\?\) before every fs
 * call, which lifts the 260-character limit for the dashboard regardless of OS settings.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { RULES, type EventLines, type FileEntry, type JsonFile } from "./model.js";

export type ScanLimits = {
  maxDepth: number;
  maxEntries: number;
  maxJsonBytes: number;
};

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxDepth: 14,
  maxEntries: 8000,
  maxJsonBytes: 2 * 1024 * 1024
};

export type RunScan = {
  files: FileEntry[];
  jsons: JsonFile[];
  events: EventLines[];
  truncated: boolean;
};

const fsPath = (absolute: string): string =>
  process.platform === "win32" ? path.toNamespacedPath(absolute) : absolute;

const toRel = (runDir: string, absolute: string): string =>
  path.relative(runDir, absolute).split(path.sep).join("/");

export const scanRunDirectory = async (
  runDir: string,
  limits: ScanLimits = DEFAULT_SCAN_LIMITS
): Promise<RunScan> => {
  const root = path.resolve(runDir);
  const files: FileEntry[] = [];
  let truncated = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > limits.maxDepth || files.length >= limits.maxEntries) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(fsPath(dir), { withFileTypes: true });
    } catch {
      return; // unreadable directory: skip, never fail the whole scan
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (files.length >= limits.maxEntries) {
        truncated = true;
        return;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fsPath(absolute));
          files.push({ relPath: toRel(root, absolute), size: stat.size, mtimeMs: stat.mtimeMs });
        } catch {
          // skip files that vanish or cannot be stat'ed mid-scan
        }
      }
    }
  };

  await walk(root, 0);

  const jsons: JsonFile[] = [];
  const events: EventLines[] = [];
  for (const file of files) {
    const absolute = path.join(root, ...file.relPath.split("/"));
    if (file.relPath.endsWith("/" + RULES.eventsFile) || file.relPath === RULES.eventsFile) {
      try {
        const text = await fs.readFile(fsPath(absolute), "utf8");
        events.push({ relPath: file.relPath, lines: text.split(/\r?\n/) });
      } catch {
        // skip
      }
      continue;
    }
    if (file.relPath.endsWith(".json") && file.size <= limits.maxJsonBytes) {
      try {
        const text = await fs.readFile(fsPath(absolute), "utf8");
        jsons.push({ relPath: file.relPath, value: JSON.parse(text) as unknown });
      } catch {
        // unparsable or unreadable JSON is still listed as a file; it just carries no flags
      }
    }
  }

  return { files, jsons, events, truncated };
};

/**
 * Resolves a run-relative path for the artifact endpoint and refuses anything that
 * escapes the run directory. Returns null on refusal; the caller answers 403.
 */
export const resolveInsideRun = (runDir: string, relPath: string): string | null => {
  const root = path.resolve(runDir);
  if (relPath.includes("\0") || path.isAbsolute(relPath)) {
    return null;
  }
  const absolute = path.resolve(root, ...relPath.split("/"));
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return null;
  }
  return absolute;
};

export const readArtifactText = async (absolute: string, maxBytes: number): Promise<string | null> => {
  try {
    const stat = await fs.stat(fsPath(absolute));
    if (!stat.isFile() || stat.size > maxBytes) {
      return null;
    }
    return await fs.readFile(fsPath(absolute), "utf8");
  } catch {
    return null;
  }
};
