# Memo Scope and Research Question Approval

Status: Active baseline
Validated: 2026-09-01
Implementation: `../app/src/modules/research/memo-scope.ts`, `../app/src/modules/research/research-question.ts`, `../app/src/modules/research/question-drafting.ts`, `../app/src/commands/approve-memo-scope.ts`, `../app/src/commands/prepare-research-question.ts`, `../app/src/commands/record-research-question-draft.ts`, `../app/src/commands/approve-research-question.ts`

## Controlling rule

No new provider collection or discovery may run until a human has approved both the memo scope and the research question. Model output cannot create either approval.

The mandatory order is:

`proposed scope -> human scope approval -> proposed question -> human question approval -> provider operation`

## Memo scope

A scope records a stable scope and run ID, version, purpose, an explicit research thesis, threat topic, audience, non-empty geographies, ordered time window, and optional requested output. Every value records whether it was human-provided or inferred. An inferred value requires an explicit assumption reason. Legacy approved scopes may omit the thesis; new scope proposals may not.

Approval creates non-overwritable canonical JSON and a read-only Markdown receipt under:

`runs/<runId>/memo-scopes/<scopeId>/v<version>/`

## Scope-bound question

Question drafting prepares a bounded AI request from the approved thesis and all existing scope fields. The captured response is validated into a proposed question whose thesis is copied from the approved scope and whose rationale is presented for human review as an explanation of the connection. Deterministic validation checks response shape, request identity, scope lineage, and chronology; it does not claim to verify semantic alignment. Question approval consumes the persisted approved-scope artifact and verifies its SHA-256. The question must use the same run and scope version, remain within the approved time window, and use only approved geographies. The approved question records the scope ID, version, artifact reference, and checksum. AI output remains a proposal and cannot approve itself.

Draft requests are stored under `runs/<runId>/research-question-drafts/<requestId>/`; captured responses produce a proposed JSON artifact under `runs/<runId>/research-question-drafts/<questionId>/`. Reviewers can edit that proposal before approval.

Run from `app/`:

```powershell
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run prepare:research-question -- <approved-memo-scope.json>
npm run record:research-question-draft -- <research-question-draft-request.json> <copilot-response.json>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
```

## Provider gate

Collection and discovery validate the approved question before credential lookup or network access. A structurally valid legacy question without scope lineage remains readable by downstream audit and evidence-review code, but it cannot initiate a new provider operation.

This preserves immutable historical runs while enforcing both human approvals for all future provider access.