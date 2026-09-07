import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildRunView,
  buildSourceView,
  deriveSourceWaiting,
  failureCounts,
  parseEvents,
  type EventLines,
  type FileEntry,
  type JsonFile
} from "../ui/run-view/model.js";
import { resolveInsideRun, scanRunDirectory } from "../ui/run-view/scan.js";
import { startRunView } from "../ui/run-view/server.js";

const file = (relPath: string, size = 100): FileEntry => ({ relPath, size, mtimeMs: 0 });

const syntheticRun = (): { files: FileEntry[]; jsons: JsonFile[]; events: EventLines[] } => {
  const snap = "assurance/snapshot-synth-001";
  const files: FileEntry[] = [
    file(`${snap}/extract/attempt-1/request.json`),
    file(`${snap}/extract/attempt-1/checks.json`),
    file(`${snap}/extract/attempt-2/checks.json`),
    file(`${snap}/extract/extract-failed.json`),
    file(`${snap}/extract-2/attempt-1/checks.json`),
    file(`${snap}/extract-2/extract-commit.json`),
    file(`${snap}/review/review-package.json`),
    file(`${snap}/review/review-response-1.json`),
    file(`${snap}/review/review-record-provisional.json`),
    file(`${snap}/source-note-provisional.json`),
    file(`${snap}/metrics-provisional.json`),
    file(`${snap}/events.jsonl`),
    file("synthesis/build-record.json"),
    file("synthesis/challenge-record.json"),
    file("synthesis/memo-provisional.json"),
    file("exceptions/exc-001.json"),
    file("exceptions/exc-002.json")
  ];
  const jsons: JsonFile[] = [
    { relPath: `${snap}/extract/attempt-1/checks.json`, value: { failures: [{ check: "E2", count: 2, rule: "r" }, { check: "E3", count: 14, rule: "r" }] } },
    { relPath: `${snap}/extract/attempt-2/checks.json`, value: [{ check: "E3", count: 15, rule: "r" }] },
    { relPath: `${snap}/extract-2/attempt-1/checks.json`, value: { failures: [] } },
    { relPath: `${snap}/extract-2/extract-commit.json`, value: { schemaVersion: "source-assurance-extract-commit-v1" } },
    { relPath: `${snap}/review/review-record-provisional.json`, value: { supportPass: "not-performed" } },
    { relPath: `${snap}/source-note-provisional.json`, value: { reviewStatus: "provisional", schemaVersion: "source-intelligence-note-v1" } },
    { relPath: `${snap}/metrics-provisional.json`, value: { omissionCount: null } },
    { relPath: "synthesis/build-record.json", value: { limitedEvidence: true, provisional: true } },
    { relPath: "synthesis/memo-provisional.json", value: { reviewStatus: "provisional" } },
    { relPath: "exceptions/exc-001.json", value: { id: "exc-001", kind: "bounded-failure", status: "open", raisedAt: "2026-09-04T10:00:00Z" } },
    { relPath: "exceptions/exc-002.json", value: { id: "exc-002", kind: "uncertain-relevance", status: "decided", raisedAt: "2026-09-03T10:00:00Z" } }
  ];
  const events: EventLines[] = [
    {
      relPath: `${snap}/events.jsonl`,
      lines: [
        JSON.stringify({ occurredAt: "2026-09-04T09:00:00Z", eventType: "extract-request-prepared", stage: "extract", attempt: 1, actorType: "controller" }),
        "",
        "not json",
        JSON.stringify({ occurredAt: "2026-09-04T09:30:00Z", eventType: "extract-stage-failed", stage: "extract", attempt: 2, status: "failed", actorType: "controller" })
      ]
    }
  ];
  return { files, jsons, events };
};

describe("failureCounts", () => {
  it("reads failures from an object with arrays or from a bare array", () => {
    assert.deepEqual(failureCounts({ failures: [{ check: "E2", count: 2 }, { check: "E3", count: 14 }] }), { E2: 2, E3: 14 });
    assert.deepEqual(failureCounts([{ check: "E3", count: 15 }]), { E3: 15 });
    assert.deepEqual(failureCounts("nope"), {});
  });
});

describe("buildSourceView", () => {
  it("derives superseded and current extract stages, review, note and metrics", () => {
    const { files, jsons } = syntheticRun();
    const snap = "assurance/snapshot-synth-001/";
    const local = files.filter((f) => f.relPath.startsWith(snap)).map((f) => ({ ...f, relPath: f.relPath.slice(snap.length) }));
    const json = new Map(jsons.filter((j) => j.relPath.startsWith(snap)).map((j) => [j.relPath.slice(snap.length), j.value] as const));
    const view = buildSourceView("snapshot-synth-001", local, json);
    const names = view.stages.map((stage) => stage.name);
    assert.deepEqual(names, ["extract", "extract-2", "review", "source note", "metrics"]);
    const first = view.stages[0];
    assert.equal(first?.status, "failed");
    assert.equal(first?.attempts, 2);
    assert.deepEqual(first?.failures, { E2: 2, E3: 29 });
    const second = view.stages[1];
    assert.equal(second?.status, "committed");
    assert.equal(second?.attempts, 1);
    assert.equal(view.stages[2]?.status, "provisional");
    assert.equal(view.stages[3]?.status, "provisional");
    assert.ok(view.stages[3]?.artifacts[0]?.flags.includes("reviewStatus:provisional"));
    assert.equal(view.waitingOn, "provisional: a real review would supersede this note");
  });
});

describe("deriveSourceWaiting", () => {
  const stage = (name: string, status: "pending" | "in-progress" | "committed" | "failed" | "provisional" | "reviewed" | "synthetic") => ({
    name,
    status,
    attempts: 0,
    failures: {},
    artifacts: []
  });
  it("names the human surface in order of the chain", () => {
    assert.equal(deriveSourceWaiting([stage("extract", "failed")]), "bounded failure: authorise a re-run or accept as a gap");
    assert.equal(deriveSourceWaiting([stage("extract", "in-progress")]), "model step: run the pending request and record the response");
    assert.equal(deriveSourceWaiting([stage("extract", "committed")]), "support pass: verdicts, dispositions, assessment");
    assert.equal(deriveSourceWaiting([stage("extract", "committed"), stage("review", "in-progress")]), "support pass: verdicts, dispositions, assessment");
    assert.equal(deriveSourceWaiting([stage("extract", "committed"), stage("review", "reviewed")]), "assemble");
    assert.equal(deriveSourceWaiting([stage("extract", "committed"), stage("review", "reviewed"), stage("source note", "reviewed")]), "measure");
    assert.equal(
      deriveSourceWaiting([stage("extract", "committed"), stage("review", "reviewed"), stage("source note", "reviewed"), stage("metrics", "committed")]),
      null
    );
  });
});

describe("parseEvents", () => {
  it("skips blank and invalid lines, maps tolerant field names, newest first", () => {
    const { events } = syntheticRun();
    const parsed = parseEvents(events);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]?.type, "extract-stage-failed");
    assert.equal(parsed[0]?.attempt, 2);
    assert.equal(parsed[1]?.actor, "controller");
  });
});

describe("buildRunView", () => {
  it("groups sources, synthesis, exceptions and derives run-level waiting", () => {
    const { files, jsons, events } = syntheticRun();
    const view = buildRunView("run-synth", files, jsons, events, "2026-09-07T00:00:00Z");
    assert.equal(view.sources.length, 1);
    assert.deepEqual(view.synthesis.map((stage) => [stage.name, stage.status]), [
      ["build", "provisional"],
      ["challenge", "committed"],
      ["memo", "provisional"]
    ]);
    assert.ok(view.synthesis[0]?.artifacts[0]?.flags.includes("limitedEvidence"));
    assert.equal(view.counts.openExceptions, 1);
    assert.equal(view.exceptions[0]?.id, "exc-001");
    assert.ok(view.waitingOn.includes("exception queue: 1 open"));
    assert.ok(view.waitingOn.includes("publication gate: blocked (provisional or synthetic lineage)"));
  });
});

describe("scan and server", () => {
  const makeRun = async (): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-view-"));
    const snap = path.join(dir, "assurance", "snapshot-t-001");
    await fs.mkdir(path.join(snap, "extract", "attempt-1"), { recursive: true });
    await fs.writeFile(path.join(snap, "extract", "attempt-1", "checks.json"), JSON.stringify({ failures: [{ check: "E3", count: 1, rule: "r" }] }));
    await fs.writeFile(path.join(snap, "extract", "extract-commit.json"), JSON.stringify({ schemaVersion: "x" }));
    await fs.writeFile(path.join(snap, "events.jsonl"), JSON.stringify({ occurredAt: "2026-09-07T00:00:00Z", eventType: "e" }) + "\n");
    await fs.writeFile(path.join(dir, "secret-outside-marker.txt"), "inside");
    return dir;
  };

  it("scans a directory into files, jsons and events", async () => {
    const dir = await makeRun();
    const scan = await scanRunDirectory(dir);
    assert.equal(scan.truncated, false);
    assert.ok(scan.files.some((f) => f.relPath === "assurance/snapshot-t-001/extract/extract-commit.json"));
    assert.equal(scan.jsons.length, 2);
    assert.equal(scan.events.length, 1);
  });

  it("confines artifact paths to the run root", async () => {
    const dir = await makeRun();
    assert.equal(resolveInsideRun(dir, "../etc/passwd"), null);
    assert.equal(resolveInsideRun(dir, "/etc/passwd"), null);
    assert.equal(resolveInsideRun(dir, "assurance/../../x"), null);
    assert.ok(resolveInsideRun(dir, "assurance/snapshot-t-001/extract/extract-commit.json") !== null);
  });

  it("serves the page and the run, refuses writes and escapes", async () => {
    const dir = await makeRun();
    const started = await startRunView({ runDir: dir, runId: "run-t", port: 0, cacheMs: 0 });
    try {
      const base = `http://${started.address.host}:${started.address.port}`;
      const page = await fetch(`${base}/`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /read-only; renders the run directory/);

      const run = await fetch(`${base}/api/run`);
      assert.equal(run.status, 200);
      const view = (await run.json()) as { sources: Array<{ snapshotId: string; waitingOn: string | null }>; counts: { events: number } };
      assert.equal(view.sources[0]?.snapshotId, "snapshot-t-001");
      assert.equal(view.sources[0]?.waitingOn, "support pass: verdicts, dispositions, assessment");
      assert.equal(view.counts.events, 1);

      const artifact = await fetch(`${base}/api/artifact?path=${encodeURIComponent("assurance/snapshot-t-001/extract/extract-commit.json")}`);
      assert.equal(artifact.status, 200);

      const escape = await fetch(`${base}/api/artifact?path=${encodeURIComponent("../secret")}`);
      assert.equal(escape.status, 403);

      const post = await fetch(`${base}/api/run`, { method: "POST" });
      assert.equal(post.status, 405);
    } finally {
      await started.close();
    }
  });
});
