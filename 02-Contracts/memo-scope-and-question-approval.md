# Memo Scope and Research Question Approval

Status: Active baseline
Validated: 2026-09-01
Implementation: `../app/src/modules/research/memo-scope.ts`, `../app/src/modules/research/research-question.ts`, `../app/src/modules/research/question-drafting.ts`, `../app/src/modules/research/research-plan.ts`, `../app/src/commands/research-plan.ts`, `../app/src/commands/approve-memo-scope.ts`, `../app/src/commands/prepare-research-question.ts`, `../app/src/commands/record-research-question-draft.ts`, `../app/src/commands/approve-research-question.ts`

## Controlling rule

No new provider collection or discovery may run until a human has approved both the memo scope and the research question. Model output cannot create either approval.

The mandatory approval order is:

`proposed scope -> human scope approval -> proposed question -> human question approval -> provider operation`

An unapproved planning preview may precede this order. The dashboard's **Generate research plan** action sends the proposed thesis and scope to the configured research-planning model and returns editable questions paired with proposed Seerist searches. It creates no analysis, scope approval, question approval, information requirement or provider operation. The human must still review and explicitly confirm the plan; the controller then executes the existing scope, question and requirement approval commands in order before optional collection.

Planning previews use `research-plan-draft-request-v1` and `research-plan-draft-v1` artifacts under `<runs-root>/.research-plan-drafts/plan-<id>/`. The latter retains the proposed scope, central question/rationale, 3-6 questions each paired with 1-2 searches (at most 10 distinct searches total), ranking terms, and invocation ID. Pure TypeScript validation rejects malformed, extra, duplicate or unbounded output; it does not establish semantic alignment. These drafts are excluded from the analysis list and cannot be passed to provider commands as approvals. The UI invalidates a preview when its thesis or scope changes and ignores stale in-flight responses.

## Memo scope

A scope records a stable scope and run ID, version, purpose, an explicit research thesis, threat topic, audience, non-empty geographies, ordered time window, and optional requested output. Every value records whether it was human-provided or inferred. An inferred value requires an explicit assumption reason. Legacy approved scopes may omit the thesis; new scope proposals may not.

Approval creates non-overwritable canonical JSON and a read-only Markdown receipt under:

`runs/<runId>/memo-scopes/<scopeId>/v<version>/`

## Scope-bound question

Question drafting prepares a bounded AI request from the approved thesis and all existing scope fields. The captured response is validated into a proposed question whose thesis is copied from the approved scope and whose rationale is presented for human review as an explanation of the connection. Deterministic validation checks response shape, request identity, scope lineage, and chronology; it does not claim to verify semantic alignment. Question approval consumes the persisted approved-scope artifact and verifies its SHA-256. The question must use the same run and scope version, remain within the approved time window, and use only approved geographies. The approved question records the scope ID, version, artifact reference, and checksum. AI output remains a proposal and cannot approve itself.

Draft requests are stored under `runs/<runId>/research-question-drafts/<requestId>/`; captured responses produce a proposed JSON artifact under `runs/<runId>/research-question-drafts/<questionId>/`. Reviewers can edit that proposal before approval.

The legacy **Approve scope and draft with Copilot** API persists explicit named-human scope approval before invoking the local SDK. The New page instead uses the draft-only preview above. Both resolve the research-planning stage override or shared Settings default. A fresh, tool-disabled session returns a proposal, never an approval. The dashboard permits completion of a scope-approved run only when the submitted thesis and scope still match the approved artifact. Collection still requires question and information-requirement approval.

SDK drafts use `research-question-draft-copilot-sdk-response-v1` with an explicit `model` and `provider: "github-copilot-sdk"`. Legacy manual drafts retain `research-question-draft-copilot-response-v1` and unknown model identity. Relevance similarly uses `question-relevance-copilot-sdk-response-v1` to add explicit SDK provenance. Other AI-stage response envelopes already have provider/model fields; their validators accept either the exact legacy identity or an explicit SDK model ID. Existing prepared request metadata remains a legacy transport hint, not a claim about the response's execution. Recorded invocations take their identity from the validated response.

Automatic invocation artifacts retain the raw model output, selected session model, session ID, start/completion times, and request checksum even when output validation fails. The application rejects unavailable models rather than substituting another one. Neither structural validation nor using a named model establishes semantic thesis alignment; that remains part of human question review.

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