import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import test from "node:test";

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const artifactRef = (path: string): string =>
  relative(process.cwd(), path).replaceAll("\\", "/");

test("verifies a collection bundle and writes one immutable Seerist intake", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "seerist-intake-"));
  try {
    const runRoot = resolve(tempRoot, "runs");
    const runId = "run-intake-command";
    const operationId = "operation-command";
    const questionId = "rq-command";
    const questionDirectory = resolve(
      runRoot,
      runId,
      "research-questions",
      questionId
    );
    const operationDirectory = resolve(
      runRoot,
      runId,
      "provider-operations",
      operationId
    );
    await Promise.all([
      mkdir(questionDirectory, { recursive: true }),
      mkdir(operationDirectory, { recursive: true })
    ]);

    const questionPath = resolve(questionDirectory, "approved-research-question.json");
    const questionBytes = Buffer.from(
      JSON.stringify({
        id: questionId,
        runId,
        scopeVersion: 1,
        question: "What developments could affect operational continuity?",
        rationale: "Bound synthetic intake command test.",
        geographies: ["Global"],
        timeWindow: {
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-08-31T23:59:59.999Z"
        },
        status: "approved",
        approvedBy: "analyst-test",
        approvedAt: "2026-08-30T08:00:00.000Z"
      })
    );
    await writeFile(questionPath, questionBytes);
    const boundQuestion = {
      ...JSON.parse(questionBytes.toString("utf8")) as Record<string, unknown>,
      artifactRef: artifactRef(questionPath),
      artifactSha256: sha256(questionBytes)
    };

    const rawPath = resolve(operationDirectory, "raw-response.json");
    const rawBytes = Buffer.from(
      JSON.stringify({
        features: [
          {
            type: "Feature",
            properties: {
              id: "analysis-command",
              source: "analysis",
              title: "Synthetic analysis",
              sanitizedBody: { en: "Synthetic captured report body." }
            }
          }
        ]
      })
    );
    await writeFile(rawPath, rawBytes);

    const requestedAt = "2026-08-31T08:00:00.000Z";
    const receivedAt = "2026-08-31T08:00:01.000Z";
    const requestPath = resolve(operationDirectory, "collection-request.json");
    const requestBytes = Buffer.from(
      JSON.stringify({
        operation: {
          id: operationId,
          runId,
          researchQuestionId: questionId,
          provider: "seerist",
          method: "GET",
          endpoint: "/v1/wod",
          filters: {}
        },
        requestedAt,
        operationArtifactRef: "runs/operation.json",
        operationArtifactSha256: "e".repeat(64),
        researchQuestion: boundQuestion
      })
    );
    await writeFile(requestPath, requestBytes);

    const responsePath = resolve(operationDirectory, "raw-provider-artifact.json");
    const responseBytes = Buffer.from(
      JSON.stringify({
        id: `${operationId}-response`,
        runId,
        operationId,
        researchQuestionId: questionId,
        provider: "seerist",
        endpoint: "/v1/wod",
        requestedAt,
        receivedAt,
        httpStatus: 200,
        mediaType: "application/json",
        artifactRef: artifactRef(rawPath),
        sha256: sha256(rawBytes)
      })
    );
    await writeFile(responsePath, responseBytes);

    const args = [
      "--import",
      "tsx",
      resolve("src/commands/intake-seerist.ts"),
      responsePath,
      "analysis-command",
      questionPath
    ];
    const environment = { ...process.env, SEERIST_RUN_DIR: runRoot };
    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment
    });
    assert.equal(first.status, 0, first.stderr);

    const intakePath = resolve(
      runRoot,
      runId,
      "provider-intakes",
      operationId,
      "analysis-command",
      "intake-result.json"
    );
    const intake = JSON.parse(await readFile(intakePath, "utf8")) as {
      item: {
        rawArtifactSha256: string;
        collectionLineage: Record<string, string>;
      };
      ledgerEntry: { runId: string };
    };
    assert.equal(intake.ledgerEntry.runId, runId);
    assert.equal(intake.item.rawArtifactSha256, sha256(rawBytes));
    assert.equal(intake.item.collectionLineage.requestManifestSha256, sha256(requestBytes));
    assert.equal(intake.item.collectionLineage.responseManifestSha256, sha256(responseBytes));

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Intake failed/);

    await writeFile(rawPath, Buffer.from("{\"features\":[]}"));
    const changedRaw = spawnSync(
      process.execPath,
      [...args.slice(0, 4), "different-item", questionPath],
      { cwd: process.cwd(), encoding: "utf8", env: environment }
    );
    assert.notEqual(changedRaw.status, 0);
    assert.match(changedRaw.stderr, /SHA-256 does not match/);

    const outsideManifest = resolve(tempRoot, "outside-response-manifest.json");
    await copyFile(responsePath, outsideManifest);
    const outside = spawnSync(
      process.execPath,
      [...args.slice(0, 3), outsideManifest, "analysis-command", questionPath],
      { cwd: process.cwd(), encoding: "utf8", env: environment }
    );
    assert.notEqual(outside.status, 0);
    assert.match(outside.stderr, /must remain inside the configured run directory/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});