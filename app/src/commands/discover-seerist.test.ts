import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const { scripts }: { scripts: Record<string, string> } = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8")
);

for (const name of ["collect:seerist", "discover:seerist", "probe:seerist"]) {
  test(`${name} reaches argument validation without a worktree .env`, async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "provider-startup-"));
    try {
      const cwd = resolve(tempRoot, "app");
      await mkdir(cwd);
      const script = scripts[name];
      assert.ok(script);
      const args = script.split(" ").slice(1).map((arg) =>
        arg === "tsx" ? import.meta.resolve("tsx") :
          arg.startsWith("src/") ? resolve(packageRoot, arg) : arg
      );
      const result = spawnSync(process.execPath, args, {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          SEERIST_API_KEY: "",
          SEERIST_RUN_DIR: resolve(tempRoot, "seerist-runs"),
        }
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, name === "probe:seerist"
        ? /Provide a query JSON file path as the first argument/
        : /Usage:/);
      assert.doesNotMatch(result.stderr, /SEERIST_API_KEY is not configured/);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
}

test("optional environment file loads values without overriding the process environment", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "provider-env-"));
  try {
    const cwd = resolve(tempRoot, "app");
    await mkdir(cwd);
    await writeFile(resolve(tempRoot, ".env"), "STARTUP_TEST_VALUE=from-file\n", "utf8");
    const script = scripts["discover:seerist"];
    assert.ok(script);
    const envArgument = script.split(" ")[1];
    assert.ok(envArgument);
    for (const inherited of ["", "from-process"]) {
      const env = { ...process.env };
      delete env.STARTUP_TEST_VALUE;
      if (inherited) env.STARTUP_TEST_VALUE = inherited;
      const result = spawnSync(process.execPath, [
        envArgument, "-e", "process.stdout.write(process.env.STARTUP_TEST_VALUE)"
      ], { cwd, encoding: "utf8", env });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, inherited || "from-file");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rejects an unapproved discovery plan before provider credentials", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "seerist-discovery-"));
  try {
    const planPath = resolve(tempRoot, "plan.json");
    const questionPath = resolve(tempRoot, "question.json");
    await writeFile(
      planPath,
      JSON.stringify({
        id: "discovery-command-test",
        runId: "run-test",
        researchQuestionId: "rq-test",
        provider: "seerist",
        endpoint: "/v1/wod",
        queries: [{ id: "person", search: "John Ratcliffe", sources: "news" }],
        rankingTerms: ["John Ratcliffe", "CIA Director"],
        pageSize: 20,
        maxPagesPerQuery: 1,
        maxApiCalls: 1,
        maxResults: 20,
        minimumScore: 3
      }),
      "utf8"
    );
    await writeFile(
      questionPath,
      JSON.stringify({
        id: "rq-test",
        runId: "run-test",
        scopeVersion: 1,
        question: "What confirms the reported visit?",
        rationale: "Synthetic command test.",
        geographies: ["Russia"],
        timeWindow: {
          from: "2026-08-25T00:00:00.000Z",
          to: "2026-08-28T23:59:59.999Z"
        },
        status: "proposed"
      }),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve("src/commands/discover-seerist.ts"), planPath, questionPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SEERIST_API_KEY: "",
          SEERIST_RUN_DIR: resolve(tempRoot, "outputs")
        }
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /RESEARCH_QUESTION_NOT_APPROVED/);
    assert.doesNotMatch(result.stderr, /SEERIST_API_KEY is not configured/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});