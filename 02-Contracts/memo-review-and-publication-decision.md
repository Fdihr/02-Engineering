# Version-bound memo review and publication decisions

Status: Implemented review decisions for reconstructable writer v2 drafts.
Publication approval remains blocked by the current writer's provisional
standard and authoritative verification. This slice does not approve a
standard, rerender a draft, start model work, or publish a memo.

## Review target

`review:memo inspect <run-id> <memo-id>` reconstructs the selection and writer
records from saved requests/responses, approved question/scope, performed
adjudication and validated source authority. The memo JSON, Markdown,
verification and publication gate must match the reconstructed writer output.
Historical writer v1 drafts remain readable but cannot receive these decisions.

The review target freezes the run, memo ID/version and exact byte checksums
of memo JSON, Markdown, writer record, verification, publication gate and
calibration policy. Changing any target binding invalidates the decision;
source-lineage changes fail reconstruction and make review unavailable.
Restoring byte-identical artifacts does not create a new version.

## Human decision

The dashboard offers **Request revision** and **Reject memo**, with an explicit
reviewer, issue category, feedback and exact-draft confirmation. The server
uses the authenticated reviewer when authentication is enabled. Local CLI
reviewer attribution is an explicit operator assertion, not an identity proof.

`memo-publication-decision-v3` retains the v2 decision fields and adds the
complete target, selected observation IDs and `calibrationStatus: not-reached`.
Older v2 decisions remain historical and are not treated as version-bound approval.
No chat or model output submits a decision by itself.

Sampling is deterministic: rank the original envelope's in-scope observations
by the SHA-256 of memo checksum plus observation ID, then take up to the
policy sample size (currently five). Every selected observation requires a
supported/unsupported/uncertain verdict; no verdict is preselected. Fewer
available observations are shown honestly and add an insufficient-sample
publication blocker. Empty drafts may receive non-approval decisions, never
publication authority. Opening a sampled quote records an observation
drill-down timestamp; unknown targets and future timestamps are rejected.

## Persistence and stale review

`review:memo record <run-id> <memo-id> <review-input.json>` validates the exact
target again, writes and flushes a temporary receipt, and exclusively hard-links
it to `memo/<memo-id>/review/decision.json`. Only one concurrent decision wins.
The receipt is the authoritative human-attributed audit artifact; no separate
event log or duplicate mutable gate is needed for completion.

Decisions are immutable, including revision requests and rejections. Repeated
submissions do not overwrite them. A revision requires a separately authorized
new draft and a fresh review; the decision itself grants no additional model
calls. [Bounded editorial revision](bounded-memo-revision.md) provides a separate
explicit authorization for eligible feedback. An incompatible saved decision is displayed
as stale, grants no authority, and requires operator inspection/new draft.
This assumes the existing local, hard-link-capable filesystem and immutable
artifact protocol, not transactional protection from arbitrary external writes.

## Publication boundary

The backend refuses `approved` while any authoritative blocker remains, even
if a caller forges a ready gate or bypasses disabled UI controls. All current
writer v2 gates are blocked; modifying the gate alone fails reconstruction.
Revision and rejection do not resolve source, contest, policy or governance
blockers. The draft stays not-for-publication, its original gate is unchanged,
and no external delivery occurs.

Samples and drill-down records are preserved for later calibration, but this
slice does not accumulate threshold measurements or promote the provisional
calibration policy. Reaching a numerical threshold never approves policy.
