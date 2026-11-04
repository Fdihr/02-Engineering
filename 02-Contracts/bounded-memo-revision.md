# Bounded editorial memo revision

Status: Implemented for reconstructable writer v2 drafts with a recorded,
version-bound human editorial revision request.

## Authority and routing

Recording feedback does not authorize another model call. A separate explicit
human start freezes the exact parent review target, decision checksum, original
Markdown, unchanged approved inputs and selected key judgements, and the explicit
Copilot writer model saved in Settings. Auto, provider substitution and missing
models are refused. Foundry execution is not implemented by this adapter.

Only `revision-requested` with `issueType: editorial` and supported sampled
observations can authorize this path. Unsupported/uncertain samples, evidence
gaps and source concerns return to Evidence; judgement/scope concerns return to
Findings; standard/policy concerns return to Audit/governance. These routes do
not resolve issues or advance earlier approvals.

## One-call execution

`npm run revise:memo -- start <run-id> <parent-memo-id> <analyst-id>` grants at
most one writer call. `status` and `resume` take only the run and parent memo IDs.
Authorization lives in `memo/revisions/<parent-memo-id>/authorization.json`,
with a matching human authorization receipt. One immutable authorization is
allowed per parent. Settings changes, repeated starts, refresh and resume never
replace its frozen model or refill its allowance.

The worker shares the run's memo execution lock. Manual preparation, generation
and recording cannot compete with revision authority. Request and stage
reservations are persisted before the model call. A reserved invocation without
saved output is indeterminate and cannot replay; saved raw output can finish
deterministic recording after restart. A frozen recording timestamp makes
recovery after writing the new handoff byte-identical. Terminal failure receipts
are preserved, not replaced by later attempts.

This uses the existing local hard-link-capable filesystem and immutable artifact
protocol. It does not claim transactional protection from arbitrary external
writes or provider-side exactly-once execution. Ambiguous interrupted writes
require operator inspection rather than automatic repair.

## New draft and fresh review

The writer receives previous Markdown and feedback as untrusted editorial input.
Existing output validation preserves selected judgement wording, confidence,
claim references, gaps, caveats and publication blockers. A new memo increments
the parent's version and records `supersedesMemoId`; no parent artifact or review
decision is overwritten. Changed parent bytes, feedback, source authority or
policy bindings stop reconstruction.

The new version has no inherited decision, sample verdicts or exact-draft
confirmation. Review must be performed again against its new checksums.
A newly reviewed revision can separately authorize another revision, up to the
bounded lineage depth of 16 versions. Revising an older draft while a newer one
exists is refused.

All current drafts remain not-for-publication under the provisional standard.
No writer or review action overrides the gate, approves a standard or delivers
a memo externally. Dashboard status and `run:next` prefer the latest revision
authority over the original memo execution handoff.
