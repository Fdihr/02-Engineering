import {
  projectWorkflow,
  type WorkflowProjectionInput
} from "../workflow/workflow-projection.js";

let inputText = "";
for await (const chunk of process.stdin) inputText += chunk;
const value = JSON.parse(inputText) as WorkflowProjectionInput;
if (
  typeof value.runId !== "string" ||
  !Array.isArray(value.readyWork) ||
  !Array.isArray(value.blockers) ||
  typeof value.intentApproved !== "boolean" ||
  typeof value.evidenceAvailable !== "boolean"
) {
  throw new Error("Invalid workflow projection input.");
}
process.stdout.write(JSON.stringify(projectWorkflow(value)));
