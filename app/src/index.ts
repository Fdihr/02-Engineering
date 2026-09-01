console.log(
  [
    "Workflow commands:",
    "npm run approve:question -- <research-question-proposal.json> <reviewer-id>",
    "npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>",
    "npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>",
    "npm run intake:seerist -- <raw-response.json> <item-id> <retrieved-at-ISO-8601> <approved-research-question.json> [run-id]",
    "npm run retrieve:source -- <intake-result.json> <exact-source-url>",
    "npm run canonicalize:source -- <source-retrieval-result.json>",
    "npm run prepare:question-relevance -- <source-document.json>",
    "npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>",
    "npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]"
  ].join("\n")
);
