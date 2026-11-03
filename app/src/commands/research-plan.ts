import { researchPlanPrompt, validateResearchPlan } from "../modules/research/research-plan.js";

const chunks: Buffer[] = [];
let size = 0;
try {
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 4 * 1024 * 1024) throw new Error("Research plan input exceeds 4 MiB.");
    chunks.push(bytes);
  }
  const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof input !== "object" || input === null || !("action" in input) || !("value" in input)) {
    process.stdout.write(JSON.stringify({ ok: false, error: "INVALID_RESEARCH_PLAN_OPERATION" }));
  } else {
    process.stdout.write(JSON.stringify(input.action === "prepare"
      ? researchPlanPrompt(input.value)
      : input.action === "validate"
        ? validateResearchPlan(input.value)
        : { ok: false, error: "INVALID_RESEARCH_PLAN_OPERATION" }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not process research plan.");
  process.exitCode = 1;
}
