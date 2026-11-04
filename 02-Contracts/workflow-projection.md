# Shared Workflow Projection

Status: Active contract for the run-next and dashboard next-action slice.

## Purpose

Expose one deterministic, read-only view of the current run's committed
outcomes, ready work, pending human decisions, interim checkpoints, blockers,
and recommended next action. The projection is derived from validated
persisted artifacts and the dashboard's existing artifact-derived model. It
is computed on demand and is not a second status database.

## Authority and selection

`app/src/workflow/workflow-projection.ts` owns the shared selection policy.
The run-next workflow supplies facts read from run artifacts; the dashboard
passes its artifact-derived work candidates to the same selector through
`app/src/commands/project-workflow.ts`.

The approved intent gate is always first. An unresolved run-integrity blocker
or an exception whose affected work cannot be established pauses the run and
is shown with its uncertainty. A source exception whose checksum-bound
artifact references identify affected work blocks only that work; unrelated
ready work remains eligible. Publication blockers affect the publication gate
only, so they do not stop ongoing collection, assurance, or draft analysis.
When choices are otherwise tied, machine work is recommended before interim
human checkpoints. Human admission, support review, adjudication, exception,
intent, and publication decisions remain human-owned.

The projection reports `no-evidence` when intent is approved but there is no
usable evidence and no more specific ready action. A persisted check record
with zero findings is a completed check; a prepared request with no recorded
result remains pending.

## Execution boundary

The recommendation is advisory workflow state, not permission to expand scope
or execute a model call. `run:next` may run only its existing deterministic
recorders when a validated response artifact is already present. Prepared
model requests remain manual interim checkpoints. The projection does not
perform collection, admission, source review, adjudication, exception
resolution, publication approval, or artifact mutation.

Legacy artifacts remain readable. Where an exception's old or incomplete
metadata cannot safely identify affected work, the projection retains
conservative run-wide handling and exposes the uncertainty rather than
silently closing or waiving it.
