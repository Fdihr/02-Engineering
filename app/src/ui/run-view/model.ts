/**
 * Run view model: turns a listing of a run directory into a view the dashboard renders.
 *
 * Pure functions only; no I/O here (see scan.ts). The dashboard is read-only and has no
 * authority: it renders what the run directory says, and derives the human surface the
 * run is waiting on from artifact presence alone. Every derivation is labelled as such.
 *
 * Layout tolerance: artifact names differ between stages and have changed over the POC
 * (status-specific filenames, superseded stage directories). The rules that map file
 * names to stages are the RULES table below; adjust it there, not in the logic.
 */

export type FileEntry = {
  /** Path relative to the run directory, forward slashes. */
  relPath: string;
  size: number;
  mtimeMs: number;
};

export type JsonFile = {
  relPath: string;
  value: unknown;
};

export type EventLines = {
  relPath: string;
  lines: string[];
};

export type StageStatus =
  | "pending"
  | "in-progress"
  | "committed"
  | "failed"
  | "provisional"
  | "reviewed"
  | "synthetic";

export type ArtifactView = {
  relPath: string;
  size: number;
  flags: string[];
};

export type StageView = {
  name: string;
  status: StageStatus;
  attempts: number;
  failures: Record<string, number>;
  artifacts: ArtifactView[];
};

export type SourceView = {
  snapshotId: string;
  stages: StageView[];
  waitingOn: string | null;
};

export type ExceptionView = {
  relPath: string;
  id: string;
  kind: string;
  status: string;
  raisedAt: string;
};

export type EventRecord = {
  at: string;
  type: string;
  stage: string;
  attempt: number | null;
  status: string;
  actor: string;
  source: string;
};

export type RunView = {
  runId: string;
  scannedAt: string;
  sources: SourceView[];
  synthesis: StageView[];
  exceptions: ExceptionView[];
  events: EventRecord[];
  waitingOn: string[];
  counts: {
    files: number;
    sources: number;
    openExceptions: number;
    events: number;
  };
};

/** Directory and file-name conventions. Edit here if the repo layout differs. */
export const RULES = {
  assuranceDir: "assurance",
  synthesisDir: "synthesis",
  exceptionsDir: "exceptions",
  eventsFile: "events.jsonl",
  attemptDir: /^attempt-(\d+)$/,
  checksFile: /checks\.json$/i,
  committed: /commit/i,
  recorded: /record|envelope|sealed/i,
  failed: /fail/i,
  provisional: /provisional/i,
  reviewed: /reviewed/i,
  synthetic: /synthetic/i,
  reviewStage: [
    { name: "review package", test: /^review-package/i },
    { name: "review response", test: /^review-response/i },
    { name: "review record", test: /^review-record/i }
  ],
  noteFile: /^source-note/i,
  metricsFile: /^metrics/i,
  synthesisStages: [
    { name: "build", test: /build/i },
    { name: "challenge", test: /challenge/i },
    { name: "adjudicate", test: /adjudic/i },
    { name: "relevance", test: /relevance/i },
    { name: "memo", test: /memo/i },
    { name: "verification", test: /verif/i },
    { name: "publication", test: /publication/i }
  ],
  maxEvents: 200
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const basename = (relPath: string): string => relPath.slice(relPath.lastIndexOf("/") + 1);

const segments = (relPath: string): string[] => relPath.split("/");

const stringField = (record: Record<string, unknown>, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
};

const numberField = (record: Record<string, unknown>, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

/** Flags read from an artifact's top level, if present. Absence is not a flag. */
export const artifactFlags = (value: unknown): string[] => {
  if (!isRecord(value)) {
    return [];
  }
  const flags: string[] = [];
  const reviewStatus = value.reviewStatus;
  if (typeof reviewStatus === "string") {
    flags.push(`reviewStatus:${reviewStatus}`);
  }
  if (value.limitedEvidence === true) {
    flags.push("limitedEvidence");
  }
  if (value.provisional === true) {
    flags.push("provisional");
  }
  if (value.synthetic === true) {
    flags.push("synthetic");
  }
  const schema = value.schemaVersion;
  if (typeof schema === "string") {
    flags.push(schema);
  }
  return flags;
};

/**
 * Reads check failures from a checks.json of unknown exact shape: any array of objects
 * carrying `check` and `count` is accepted, wherever it sits at the top level.
 */
export const failureCounts = (value: unknown): Record<string, number> => {
  const counts: Record<string, number> = {};
  const absorb = (items: unknown): void => {
    if (!Array.isArray(items)) {
      return;
    }
    for (const item of items) {
      if (isRecord(item) && typeof item.check === "string") {
        const count = typeof item.count === "number" ? item.count : 1;
        counts[item.check] = (counts[item.check] ?? 0) + count;
      }
    }
  };
  if (Array.isArray(value)) {
    absorb(value);
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      absorb(entry);
    }
  }
  return counts;
};

const statusFromName = (name: string, value: unknown): StageStatus | null => {
  const flags = artifactFlags(value);
  if (RULES.synthetic.test(name) || flags.includes("synthetic") || flags.includes("reviewStatus:synthetic")) {
    return "synthetic";
  }
  if (RULES.failed.test(name)) {
    return "failed";
  }
  if (RULES.provisional.test(name) || flags.includes("reviewStatus:provisional") || flags.includes("provisional")) {
    return "provisional";
  }
  if (RULES.reviewed.test(name) || flags.includes("reviewStatus:reviewed")) {
    return "reviewed";
  }
  if (RULES.committed.test(name) || RULES.recorded.test(name)) {
    return "committed";
  }
  return null;
};

const rank: Record<StageStatus, number> = {
  pending: 0,
  "in-progress": 1,
  failed: 2,
  provisional: 3,
  synthetic: 4,
  committed: 5,
  reviewed: 6
};

const strongest = (statuses: StageStatus[]): StageStatus =>
  statuses.reduce<StageStatus>((best, next) => (rank[next] > rank[best] ? next : best), "pending");

const toArtifact = (file: FileEntry, json: Map<string, unknown>): ArtifactView => ({
  relPath: file.relPath,
  size: file.size,
  flags: artifactFlags(json.get(file.relPath))
});

/** Builds the stages of one admitted source from the files under its assurance directory. */
export const buildSourceView = (
  snapshotId: string,
  files: FileEntry[],
  json: Map<string, unknown>
): SourceView => {
  const stages: StageView[] = [];

  // Extract stage directories: extract, extract-2, ... each with attempt-N subdirectories.
  const extractDirs = new Map<string, FileEntry[]>();
  const rest: FileEntry[] = [];
  for (const file of files) {
    const parts = segments(file.relPath);
    const first = parts[0];
    if (first !== undefined && /^extract/i.test(first) && parts.length > 1) {
      const list = extractDirs.get(first) ?? [];
      list.push(file);
      extractDirs.set(first, list);
    } else {
      rest.push(file);
    }
  }

  for (const [dirName, dirFiles] of [...extractDirs.entries()].sort()) {
    const attempts = new Set<number>();
    const failures: Record<string, number> = {};
    const artifacts: ArtifactView[] = [];
    const statuses: StageStatus[] = [];
    for (const file of dirFiles) {
      const parts = segments(file.relPath);
      const attemptSegment = parts[1];
      const match = attemptSegment === undefined ? null : RULES.attemptDir.exec(attemptSegment);
      if (match !== null) {
        attempts.add(Number(match[1]));
        if (RULES.checksFile.test(file.relPath)) {
          for (const [check, count] of Object.entries(failureCounts(json.get(file.relPath)))) {
            failures[check] = (failures[check] ?? 0) + count;
          }
        }
        continue;
      }
      const status = statusFromName(basename(file.relPath), json.get(file.relPath));
      if (status !== null) {
        statuses.push(status);
        artifacts.push(toArtifact(file, json));
      }
    }
    const status = statuses.length > 0 ? strongest(statuses) : attempts.size > 0 ? "in-progress" : "pending";
    stages.push({ name: dirName, status, attempts: attempts.size, failures, artifacts });
  }

  // Review stage: package, response(s), record.
  const reviewArtifacts: ArtifactView[] = [];
  const reviewStatuses: StageStatus[] = [];
  let hasPackage = false;
  let hasRecord = false;
  for (const file of rest) {
    const name = basename(file.relPath);
    for (const rule of RULES.reviewStage) {
      if (rule.test.test(name)) {
        reviewArtifacts.push(toArtifact(file, json));
        if (rule.name === "review package") {
          hasPackage = true;
        }
        if (rule.name === "review record") {
          hasRecord = true;
          const value = json.get(file.relPath);
          const status = statusFromName(name, value);
          reviewStatuses.push(status ?? (isRecord(value) && value.supportPass === "performed" ? "reviewed" : "committed"));
        }
      }
    }
  }
  if (reviewArtifacts.length > 0) {
    stages.push({
      name: "review",
      status: hasRecord ? strongest(reviewStatuses) : hasPackage ? "in-progress" : "pending",
      attempts: 0,
      failures: {},
      artifacts: reviewArtifacts
    });
  }

  // Note and metrics.
  const single = (label: string, test: RegExp): void => {
    const matches = rest.filter((file) => test.test(basename(file.relPath)));
    if (matches.length === 0) {
      return;
    }
    const statuses = matches.map((file) => statusFromName(basename(file.relPath), json.get(file.relPath)) ?? "committed");
    stages.push({
      name: label,
      status: strongest(statuses),
      attempts: 0,
      failures: {},
      artifacts: matches.map((file) => toArtifact(file, json))
    });
  };
  single("source note", RULES.noteFile);
  single("metrics", RULES.metricsFile);

  return { snapshotId, stages, waitingOn: deriveSourceWaiting(stages) };
};

/** Derived, not authoritative: the human surface this source is waiting on, if any. */
export const deriveSourceWaiting = (stages: StageView[]): string | null => {
  const extracts = stages.filter((stage) => /^extract/i.test(stage.name));
  const latestExtract = extracts[extracts.length - 1];
  const review = stages.find((stage) => stage.name === "review");
  const note = stages.find((stage) => stage.name === "source note");
  const metrics = stages.find((stage) => stage.name === "metrics");

  if (latestExtract === undefined) {
    return null;
  }
  if (latestExtract.status === "failed") {
    return "bounded failure: authorise a re-run or accept as a gap";
  }
  if (latestExtract.status === "in-progress") {
    return "model step: run the pending request and record the response";
  }
  if (review === undefined || review.status === "in-progress") {
    return "support pass: verdicts, dispositions, assessment";
  }
  if (review.status === "provisional" && (note === undefined || note.status === "provisional")) {
    return note === undefined ? "assemble (provisional)" : metrics === undefined ? "measure (provisional)" : "provisional: a real review would supersede this note";
  }
  if (note === undefined) {
    return "assemble";
  }
  if (metrics === undefined) {
    return "measure";
  }
  return null;
};

const buildSynthesisView = (files: FileEntry[], json: Map<string, unknown>): StageView[] => {
  const stages: StageView[] = [];
  for (const rule of RULES.synthesisStages) {
    const matches = files.filter((file) => rule.test.test(file.relPath));
    if (matches.length === 0) {
      continue;
    }
    const attempts = new Set<number>();
    const failures: Record<string, number> = {};
    const statuses: StageStatus[] = [];
    const artifacts: ArtifactView[] = [];
    for (const file of matches) {
      const parts = segments(file.relPath);
      const attemptSegment = parts.find((part) => RULES.attemptDir.test(part));
      if (attemptSegment !== undefined) {
        const match = RULES.attemptDir.exec(attemptSegment);
        if (match !== null) {
          attempts.add(Number(match[1]));
        }
        if (RULES.checksFile.test(file.relPath)) {
          for (const [check, count] of Object.entries(failureCounts(json.get(file.relPath)))) {
            failures[check] = (failures[check] ?? 0) + count;
          }
        }
        continue;
      }
      const status = statusFromName(basename(file.relPath), json.get(file.relPath));
      if (status !== null) {
        statuses.push(status);
      }
      artifacts.push(toArtifact(file, json));
    }
    const status = statuses.length > 0 ? strongest(statuses) : attempts.size > 0 ? "in-progress" : "pending";
    stages.push({ name: rule.name, status, attempts: attempts.size, failures, artifacts });
  }
  return stages;
};

const buildExceptions = (files: FileEntry[], json: Map<string, unknown>): ExceptionView[] =>
  files
    .filter((file) => segments(file.relPath).includes(RULES.exceptionsDir) && file.relPath.endsWith(".json"))
    .map((file) => {
      const value = json.get(file.relPath);
      const record = isRecord(value) ? value : {};
      return {
        relPath: file.relPath,
        id: stringField(record, ["id", "exceptionId"]) || basename(file.relPath),
        kind: stringField(record, ["kind", "type"]) || "unknown",
        status: stringField(record, ["status"]) || "unknown",
        raisedAt: stringField(record, ["raisedAt", "occurredAt", "createdAt"])
      };
    })
    .sort((left, right) => (left.raisedAt < right.raisedAt ? 1 : left.raisedAt > right.raisedAt ? -1 : 0));

/** Tolerant event parsing: field names vary by surface, so several are accepted. */
export const parseEvents = (eventFiles: EventLines[]): EventRecord[] => {
  const events: EventRecord[] = [];
  for (const file of eventFiles) {
    for (const line of file.lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) {
        continue;
      }
      events.push({
        at: stringField(parsed, ["occurredAt", "at", "timestamp", "recordedAt"]),
        type: stringField(parsed, ["eventType", "event", "type"]) || "event",
        stage: stringField(parsed, ["stage", "command"]),
        attempt: numberField(parsed, ["attempt"]),
        status: stringField(parsed, ["status"]),
        actor: stringField(parsed, ["actorType", "actor"]),
        source: file.relPath
      });
    }
  }
  events.sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));
  return events.slice(0, RULES.maxEvents);
};

/** Derived, not authoritative: run-level surfaces waiting on a human. */
const deriveRunWaiting = (sources: SourceView[], synthesis: StageView[], exceptions: ExceptionView[]): string[] => {
  const waiting: string[] = [];
  const open = exceptions.filter((exception) => exception.status === "open");
  if (open.length > 0) {
    waiting.push(`exception queue: ${open.length} open`);
  }
  for (const source of sources) {
    if (source.waitingOn !== null) {
      waiting.push(`${source.snapshotId}: ${source.waitingOn}`);
    }
  }
  const memo = synthesis.find((stage) => stage.name === "memo");
  const publication = synthesis.find((stage) => stage.name === "publication");
  if (memo !== undefined && publication === undefined) {
    waiting.push(
      memo.status === "provisional" || memo.status === "synthetic"
        ? "publication gate: blocked (provisional or synthetic lineage)"
        : "publication gate: decision pending"
    );
  }
  return waiting;
};

export const buildRunView = (
  runId: string,
  files: FileEntry[],
  jsons: JsonFile[],
  eventFiles: EventLines[],
  scannedAt: string
): RunView => {
  const json = new Map(jsons.map((entry) => [entry.relPath, entry.value] as const));

  const bySnapshot = new Map<string, FileEntry[]>();
  const synthesisFiles: FileEntry[] = [];
  for (const file of files) {
    const parts = segments(file.relPath);
    const assuranceIndex = parts.indexOf(RULES.assuranceDir);
    const snapshotId = assuranceIndex >= 0 ? parts[assuranceIndex + 1] : undefined;
    if (snapshotId !== undefined && parts.length > assuranceIndex + 2) {
      const relative = parts.slice(assuranceIndex + 2).join("/");
      const list = bySnapshot.get(snapshotId) ?? [];
      list.push({ ...file, relPath: relative });
      bySnapshot.set(snapshotId, list);
      const value = json.get(file.relPath);
      if (value !== undefined) {
        json.set(relative, value);
      }
      continue;
    }
    if (parts.includes(RULES.synthesisDir) || RULES.synthesisStages.some((rule) => rule.test.test(basename(file.relPath)))) {
      synthesisFiles.push(file);
    }
  }

  const sources = [...bySnapshot.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([snapshotId, snapshotFiles]) => buildSourceView(snapshotId, snapshotFiles, json));
  const synthesis = buildSynthesisView(synthesisFiles, json);
  const exceptions = buildExceptions(files, json);
  const events = parseEvents(eventFiles);

  return {
    runId,
    scannedAt,
    sources,
    synthesis,
    exceptions,
    events,
    waitingOn: deriveRunWaiting(sources, synthesis, exceptions),
    counts: {
      files: files.length,
      sources: sources.length,
      openExceptions: exceptions.filter((exception) => exception.status === "open").length,
      events: events.length
    }
  };
};
