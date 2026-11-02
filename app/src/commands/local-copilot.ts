import { CopilotClient, type SessionConfig } from "@github/copilot-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const GENERATION_TIMEOUT_MS = 180_000;

export const localSessionConfig = (model: string, system: string): SessionConfig => ({
  model,
  availableTools: [],
  excludedTools: ["builtin:*", "mcp:*", "custom:*"],
  tools: [],
  mcpServers: {},
  enableConfigDiscovery: false,
  skipCustomInstructions: true,
  enableFileHooks: false,
  enableHostGitOperations: false,
  enableSessionStore: false,
  enableSkills: false,
  enableOnDemandInstructionDiscovery: false,
  manageScheduleEnabled: false,
  infiniteSessions: { enabled: false },
  systemMessage: { mode: "replace", content: system },
  onPermissionRequest: () => ({ kind: "reject" })
});

const readInput = async (): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_INPUT_BYTES) throw new Error("Copilot request exceeds 4 MiB.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const main = async (): Promise<void> => {
  const input = await readInput();
  if (typeof input !== "object" || input === null || !("action" in input)) {
    throw new Error("Expected a Copilot operation.");
  }
  if (input.action !== "models" && input.action !== "generate") {
    throw new Error("Unsupported Copilot operation.");
  }
  const baseDirectory = await mkdtemp(join(tmpdir(), "memo-copilot-"));
  const client = new CopilotClient({
    mode: "empty",
    baseDirectory,
    useLoggedInUser: true,
    logLevel: "error"
  });
  const deadline = setTimeout(() => { void client.forceStop(); }, 195_000);
  try {
    await client.start();
    const auth = await client.getAuthStatus();
    if (!auth.isAuthenticated) {
      throw new Error("Local Copilot is not signed in. Sign in to GitHub Copilot CLI on this PC, then refresh models in Settings.");
    }
    const models = (await client.listModels()).filter(
      (model) => model.id !== "auto" && model.policy?.state !== "disabled"
    );
    if (input.action === "models") {
      process.stdout.write(JSON.stringify({
        models: models.map((model) => ({ id: model.id, name: model.name }))
      }));
      return;
    }
    if (
      !("model" in input) ||
      typeof input.model !== "string" ||
      !models.some((model) => model.id === input.model) ||
      !("prompt" in input) ||
      typeof input.prompt !== "object" ||
      input.prompt === null ||
      !("system" in input.prompt) ||
      typeof input.prompt.system !== "string" ||
      !input.prompt.system.trim() ||
      !("user" in input.prompt) ||
      typeof input.prompt.user !== "string" ||
      !input.prompt.user.trim()
    ) {
      throw new Error("Select an available model in Settings and provide a non-empty bounded prompt.");
    }
    const startedAt = new Date().toISOString();
    const session = await client.createSession(localSessionConfig(input.model, input.prompt.system));
    try {
      const currentModel = await session.rpc.model.getCurrent();
      if (currentModel.modelId !== input.model) {
        throw new Error("Copilot did not select the requested model. No generation was started.");
      }
      const answer = await session.sendAndWait(
        { prompt: input.prompt.user },
        GENERATION_TIMEOUT_MS
      );
      if (!answer?.data.content.trim()) throw new Error("Copilot returned no answer.");
      if (Buffer.byteLength(answer.data.content, "utf8") > MAX_OUTPUT_BYTES) {
        throw new Error("Copilot answer exceeds 4 MiB.");
      }
      process.stdout.write(JSON.stringify({
        invocationId: session.sessionId,
        provider: "github-copilot-sdk",
        model: currentModel.modelId,
        startedAt,
        completedAt: new Date().toISOString(),
        freshSession: true,
        content: answer.data.content
      }));
    } catch (error) {
      await session.abort();
      throw error;
    } finally {
      await session.disconnect();
    }
  } finally {
    clearTimeout(deadline);
    const stopDeadline = setTimeout(() => { void client.forceStop(); }, 5_000);
    try {
      await client.stop();
    } finally {
      clearTimeout(stopDeadline);
      await rm(baseDirectory, { recursive: true, force: true });
    }
  }
};

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local Copilot operation failed.");
    process.exitCode = 1;
  }
}
