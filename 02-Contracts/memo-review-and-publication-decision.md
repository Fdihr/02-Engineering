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

The dashboard offers **Approve for publication**, **Request revision** and
**Reject memo**, with an explicit reviewer, rationale, and exact-draft
confirmation. Non-approval decisions also require an issue category. The server
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
Approval is available only when the deterministic writer blockers are clear
and the full five-observation sample is present. Every sampled verdict must be
supported; unsupported or uncertain samples remain review blockers. The
provisional model-only support calibration threshold does not block a human
decision, but `support check: model-only, unvalidated` remains explicit and
runtime measurements cannot approve that threshold.

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
