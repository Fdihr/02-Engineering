# Memo Scope and Research Question Approval

Status: Active baseline
Validated: 2026-09-01
Implementation: `../app/src/modules/research/memo-scope.ts`, `../app/src/modules/research/research-question.ts`, `../app/src/commands/approve-memo-scope.ts`, `../app/src/commands/approve-research-question.ts`

## Controlling rule

No new provider collection or discovery may run until a human has approved both the memo scope and the research question. Model output cannot create either approval.

The mandatory order is:

`proposed scope -> human scope approval -> proposed question -> human question approval -> provider operation`

## Memo scope

A scope records a stable scope and run ID, version, purpose, threat topic, audience, non-empty geographies, ordered time window, and optional requested output. Every value records whether it was human-provided or inferred. An inferred value requires an explicit assumption reason.

Approval creates non-overwritable canonical JSON and a read-only Markdown receipt under:

`runs/<runId>/memo-scopes/<scopeId>/v<version>/`

## Scope-bound question

Question approval consumes the persisted approved-scope artifact and verifies its SHA-256. The question must use the same run and scope version, remain within the approved time window, and use only approved geographies. The approved question records the scope ID, version, artifact reference, and checksum.

Run from `app/`:

```powershell
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
```

## Provider gate

Collection and discovery validate the approved question before credential lookup or network access. A structurally valid legacy question without scope lineage remains readable by downstream audit and evidence-review code, but it cannot initiate a new provider operation.

This preserves immutable historical runs while enforcing both human approvals for all future provider access.