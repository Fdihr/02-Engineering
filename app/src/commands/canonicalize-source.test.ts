import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import test from "node:test";
import { processSource } from "../workflow/process-source.js";

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const retrieval = (body: string) => ({
  id: "retrieval-1",
  runId: "run-1",
  resolutionDepth: 1,
  outcome: "resolved",
  reason: "content_retrieved",
  approvalStatus: "not_requested",
  accessProvider: {
    name: "firecrawl",
    endpoint: "https://api.firecrawl.dev/v2/scrape",
    httpStatus: 200
  },
  request: {
    format: "markdown",
    onlyMainContent: true,
    maxAge: 0,
    storeInCache: false,
    skipTlsVerification: false
  },
  lineage: {
    intakeArtifactRef: "runs/run-1/intake.json",
    intakeArtifactSha256: "a".repeat(64),
    requestArtifactRef: "runs/run-1/request.json",
    requestArtifactSha256: "b".repeat(64),
    rawArtifactRef: "runs/run-1/raw.json",
    rawArtifactSha256: "c".repeat(64)
  },
  content: {
    format: "markdown",
    trust: "untrusted",
    characterCount: body.length,
    body
  }
});

test("writes one deterministic source document and refuses to overwrite it", async () => {
  const runRoot = await mkdtemp(resolve(tmpdir(), "source-document-command-"));
  try {
    const retrievalDirectory = resolve(runRoot, "run-1", "retrievals", "retrieval-1");
    await mkdir(retrievalDirectory, { recursive: true });
    const body = "# Report\r\n\r\nКиїв підтвердив подію.";
    const retrievalPath = resolve(retrievalDirectory, "source-retrieval-result.json");
    const retrievalBytes = Buffer.from(JSON.stringify(retrieval(body)));
    await writeFile(retrievalPath, retrievalBytes);
    const args = [
      "--import",
      "tsx",
      resolve("src/commands/canonicalize-source.ts"),
      retrievalPath
    ];
    const env = { ...process.env, SOURCE_DOCUMENT_RUN_DIR: runRoot };

    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env
    });
    assert.equal(first.status, 0, first.stderr);
    assert.doesNotMatch(first.stdout, /Київ/);

    const outputPath = resolve(
      runRoot,
      "run-1",
      "sources",
      "retrieval-1",
      first.stdout.match(/Document: (source-document-[a-f0-9]{64})/)?.[1] ?? "missing",
      "source-document.json"
    );
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(output.schemaVersion, "source-document-v1");
    assert.equal(output.normalizedText, "# Report\n\nКиїв підтвердив подію.");
    assert.equal(output.sourceArtifactSha256, sha256(retrievalBytes));
    assert.equal(output.sourceKind, "retrieved-publisher");
    assert.equal(output.segments.length, 2);

    const eventLog = await readFile(resolve(runRoot, "source-document-events.jsonl"), "utf8");
    assert.match(eventLog, /"actorType":"controller"/);
    assert.doesNotMatch(eventLog, /Київ/);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env
    });
    assert.notEqual(second.status, 0);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("rejects retrieval input outside the configured run directory", async () => {
  const sandbox = await mkdtemp(resolve(tmpdir(), "source-document-path-"));
  try {
    const runRoot = resolve(sandbox, "runs");
    const outsidePath = resolve(sandbox, "outside.json");
    await mkdir(runRoot);
    await writeFile(outsidePath, "{}", "utf8");

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/commands/canonicalize-source.ts"),
        outsidePath
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, SOURCE_DOCUMENT_RUN_DIR: runRoot }
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must remain inside the configured run directory/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("canonicalizes a verified native Seerist intake", async () => {
  const runRoot = await mkdtemp(resolve(tmpdir(), "native-source-document-command-"));
  try {
    const runId = "run-native-command";
    const operationId = "operation-native-command";
    const itemId = "analysis-native-command";
    const rawDirectory = resolve(
      runRoot,
      runId,
      "provider-operations",
      operationId
    );
    const intakeDirectory = resolve(
      runRoot,
      runId,
      "provider-intakes",
      operationId,
      itemId
    );
    await Promise.all([
      mkdir(rawDirectory, { recursive: true }),
      mkdir(intakeDirectory, { recursive: true })
    ]);
    const rawPath = resolve(rawDirectory, "raw-response.json");
    const rawArtifactRef = relative(process.cwd(), rawPath).replaceAll("\\", "/");
    const rawProvider = {
      features: [
        {
          properties: {
            id: itemId,
            source: "analysis",
            sanitizedBody: { en: "Native provider report body." }
          }
        }
      ]
    };
    const rawBytes = Buffer.from(JSON.stringify(rawProvider));
    await writeFile(rawPath, rawBytes);
    const rawArtifactSha256 = sha256(rawBytes);
    const intake = processSource(runId, "2026-08-31T08:01:00.000Z", {
      provider: "seerist",
      endpoint: "/v1/wod",
      retrievedAt: "2026-08-31T08:00:01.000Z",
      rawArtifactRef,
      rawArtifactSha256,
      collectionLineage: {
        operationId,
        requestManifestRef: "runs/collection-request.json",
        requestManifestSha256: "a".repeat(64),
        responseManifestRef: "runs/raw-provider-artifact.json",
        responseManifestSha256: "b".repeat(64),
        rawArtifactRef,
        rawArtifactSha256
      },
      researchQuestion: {
        id: "rq-native-command",
        runId,
        scopeVersion: 1,
        question: "What developments could affect operational continuity?",
        rationale: "Bound native canonicalization command test.",
        geographies: ["Global"],
        timeWindow: {
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-08-31T23:59:59.999Z"
        },
        status: "approved",
        approvedBy: "analyst-test",
        approvedAt: "2026-08-30T08:00:00.000Z",
        artifactRef: "runs/approved-research-question.json",
        artifactSha256: "c".repeat(64)
      },
      item: rawProvider.features[0]
    });
    assert.equal(intake.ok, true);
    if (!intake.ok) {
      return;
    }
    const intakePath = resolve(intakeDirectory, "intake-result.json");
    await writeFile(intakePath, JSON.stringify(intake.value), "utf8");

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve("src/commands/canonicalize-source.ts"), intakePath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, SOURCE_DOCUMENT_RUN_DIR: runRoot }
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const documentId = result.stdout.match(/Document: (source-document-[a-f0-9]{64})/)?.[1];
    assert.ok(documentId);
    const document = JSON.parse(
      await readFile(
        resolve(runRoot, runId, "sources", itemId, documentId, "source-document.json"),
        "utf8"
      )
    ) as Record<string, unknown>;
    assert.equal(document.sourceKind, "provider-captured");
    assert.equal(document.normalizedText, "Native provider report body.");
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});