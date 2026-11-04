import assert from "node:assert/strict";
import test from "node:test";
import { localSessionConfig, runLocalCopilot, SOURCE_TRUST_RULES } from "./local-copilot.js";
import { readModelIdentity } from "../core/model-identity.js";

test("local Copilot sessions have no tools, permissions, plugins or inherited instructions", async () => {
  const config = localSessionConfig("model-1", "Bounded task");
  assert.equal(config.model, "model-1");
  assert.deepEqual(config.availableTools, []);
  assert.deepEqual(config.tools, []);
  assert.deepEqual(config.mcpServers, {});
  assert.deepEqual(config.excludedTools, ["builtin:*", "mcp:*", "custom:*"]);
  for (const key of ["enableConfigDiscovery", "enableFileHooks", "enableHostGitOperations",
    "enableSessionStore", "enableSkills", "enableOnDemandInstructionDiscovery", "manageScheduleEnabled"] as const) {
    assert.equal(config[key], false);
  }
  assert.equal(config.skipCustomInstructions, true);
  assert.deepEqual(config.infiniteSessions, { enabled: false });
  assert.deepEqual(config.systemMessage, { mode: "replace", content: `Bounded task\n\n${SOURCE_TRUST_RULES}` });
  assert.deepEqual(await config.onPermissionRequest?.(
    { kind: "read", path: "untrusted-file", intention: "Untrusted read" }, { sessionId: "session-1" }
  ), { kind: "reject" });
});

test("model identity preserves legacy provenance and requires an explicit SDK model", () => {
  assert.deepEqual(readModelIdentity({ provider: "github-copilot-vscode", model: "not-exposed-by-host" }),
    { provider: "github-copilot-vscode", model: "not-exposed-by-host" });
  assert.deepEqual(readModelIdentity({ provider: "github-copilot-sdk", model: "test-model-1" }),
    { provider: "github-copilot-sdk", model: "test-model-1" });
  for (const value of [
    { provider: "unknown", model: "test-model-1" },
    { provider: "github-copilot-vscode", model: "test-model-1" },
    { provider: "github-copilot-sdk", model: "not-exposed-by-host" },
    { provider: "github-copilot-sdk", model: "" },
    { provider: "github-copilot-sdk", model: "auto" },
    { provider: "github-copilot-sdk", model: "x".repeat(201) }
  ]) {
    assert.equal(readModelIdentity(value), undefined);
  }
});

test("the programmatic transport rejects oversized prompts before creating a client", async () => {
  await assert.rejects(runLocalCopilot({
    action: "generate", model: "synthetic-only",
    prompt: { system: "Bounded task", user: "x".repeat(4 * 1024 * 1024) }
  }), /request exceeds 4 MiB/);
});
