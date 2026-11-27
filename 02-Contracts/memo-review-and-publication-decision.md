# Version-bound memo review and publication decisions

Status: Human approval and immutable local publication packages are implemented
for eligible, reconstructable bounded writer drafts. Historical v1 drafts
remain read-only; existing standard bindings and artifacts are never migrated.

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

In the 2-gate workflow, the default calibration policy is
`support-calibration-policy-v2.json` (`sampleSize: 0`). Because verbatim quote
verification already executes deterministically during automated source assurance,
Gate 2 requires **zero manual quote-quiz dropdowns**:
- `review:memo approve-and-publish <run-id> <memo-id> <reviewer-id> [notes]` (and dashboard action `approve-and-publish`) atomically inspects the version-bound target, records the immutable `approved` `memo-publication-decision-v3` receipt, and writes the immutable local publication package `runs/<run-id>/published/<memo-id>/publication.json` in one click.
- Analysts can also inspect verbatim quotes and open original external articles directly from inline `[N Publisher]` pills and the `Source & quote inspector` before publishing, or open the optional editorial revision drawer (`record-memo-review` with `decision: "revision-requested", issueType: "editorial"` followed by `start-memo-revision`).

For historical compatibility, `support-calibration-policy-v1.json` (`sampleSize: 5`) remains supported by the deterministic validator and CLI (`review:memo inspect` / `review:memo record`) when explicitly passed. No chat or model output submits a publication decision by itself.

## Persistence and stale review

`review:memo record <run-id> <memo-id> <review-input.json>` validates the exact
target again, writes and flushes a temporary receipt, and exclusively hard-links
it to `memo/<memo-id>/review/decision.json`. Only one concurrent decision wins.
The receipt is the authoritative human-attributed audit artifact; no separate
event log or duplicate mutable gate is needed for completion.

Decisions are immutable, including approval, revision requests and rejections. Repeated
submissions do not overwrite them. A revision requires a separately authorized
new draft and a fresh review; the decision itself grants no additional model
calls. [Bounded editorial revision](bounded-memo-revision.md) provides a separate
explicit authorization for eligible feedback. An incompatible saved decision is displayed
as stale, grants no authority, and requires operator inspection/new draft.
This assumes the existing local, hard-link-capable filesystem and immutable
artifact protocol, not transactional protection from arbitrary external writes.

## Publication boundary and delivery

The deterministic gate is `ready` only when writer verification has no
blockers. A ready gate enables review; it does not publish. The backend refuses
`approved` while any blocker remains, even if a caller forges a gate or bypasses
the UI. Historical drafts bound to provisional v1/v2 retain their original
blocked state. Revision and rejection do not resolve source, contest, policy or
governance blockers.

After an immutable approval receipt, a separate explicit **Create local
publication package** action writes `runs/<run-id>/published/<memo-id>/publication.json`.
The write-once package contains the exact approved audience, unchanged memo
JSON and Markdown, approval binding, review target and memo lineage. It is
available as a download from the dashboard. Repeated delivery requests return
the verified existing package; they never overwrite it. No email, shared-drive
upload or other external distribution is performed.

Samples and drill-down records are preserved for later calibration; threshold
measurement and policy promotion remain governance work. A numerical threshold
never approves policy automatically.
