console.log([
    "Workflow commands:",
    "npm run approve:question -- <research-question-proposal.json> <reviewer-id>",
    "npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>",
    "npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>",
    "npm run intake:seerist -- <raw-response.json> <item-id> <retrieved-at-ISO-8601> <approved-research-question.json> [run-id]"
].join("\n"));
export {};
