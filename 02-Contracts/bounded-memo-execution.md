# Bounded post-adjudication selection and writing

Status: Implemented, synthetic verification only. This extends execution, not
evidence authority or publication eligibility.

## Explicit authority

One analyst start in Findings (or `npm run run:memo -- start <run-id>
<analyst-id> [performed-adjudication.json]`, from `app/`) authorizes one immutable
`memo/execution/authorization.json` per run. With no explicit path the CLI
requires exactly one performed adjudication. Proposed adjudications and a
checked-zero Challenge alone are insufficient.

The authorization freezes the exact Build/Challenge round, performed
adjudication, approved question/scope lineage, source-note set, synthesis policy,
outlet table, memo standard v1 and its key-judgement policy, existing matching
requests/records, analyst identity, and explicit Settings models for
`key-judgements` and `memo-writer` (internal execution stage `writer`). Auto, unsupported providers and silent model
substitution are refused. Later sources, Settings changes, and later rounds
cannot expand this authority.

Existing matching records reconstruct from their requests and responses.
Existing unused matching requests are reused after deterministic reconstruction.
Ambiguous requests/records or previously attempted but unrecorded requests
require operator inspection. Each missing stage receives one generation
allowance; committed stages receive zero. Maximum total generation allowance
is two. Model catalog lookups are preflight metadata operations, not generation.

## Reopening and execution

Before spending authority, the controller reopens checksum-bound inputs,
reconstructs Build and Challenge, verifies admitted source/support lineage and
approved intent, and recomputes selection eligibility or the writer request.
The model receives the existing bounded prompt, in the tool-free fresh session
transport. Related or uncertain-scope open exceptions pause memo work.
Unrelated source documents with established identity do not block it.
Publication blockers do not authorize or prohibit unrelated drafting.

An exclusive run worker coordinates starts, resumes and manual CLI preparation/
recording. Each generation also exclusively reserves both the request and its
stage *before* invoking the model. Raw transport output is saved even when it
later fails validation. Provider/model identity and invocation chronology are
checked; proposals pass the existing key-judgement KJ1–KJ8 and writer v2
recorders. Models cannot change eligibility, confidence, claim status, BLUF,
key-judgement rows, gaps, caveats, or publication decisions.

New artifacts use the existing key-judgement request/record and memo request/
memo-output paths. Memo JSON, rendered Markdown, deterministic verification
and blocked publication gate are all required before the execution reports
`memo-review`. The authorization and receipts live under `memo/execution/`.
Immutable publication uses flushed temporary files and exclusive hard links;
the configured filesystem must support local hard links.

## Recovery and limits

`npm run run:memo -- status <run-id>` is read-only.
`npm run run:memo -- resume <run-id>` uses the same authority.
Dashboard refresh, repeated starts, simultaneous starts, server restarts and
resume never replenish allowances.

An interrupted reservation without saved output is indeterminate and is never
reissued. A saved response can complete deterministic recording. A crash during
recording can complete the identical artifacts with the journalled timestamp;
already written content must match exactly. Dead worker ownership is preserved
before recovery, and interrupted recovery ownership requires inspection.
Transport, invalid-output and integrity failures remain terminal receipts,
not automatic retry authorizations. A crash between authority and its human
receipt also requires inspection.

Legacy manual preparation, model execution and paste-back cannot bypass an
existing bounded memo authorization. Historical artifacts are not rewritten.
Historical records lacking reconstructable approved lineage remain readable,
but do not qualify for new bounded execution.

The process always stops at **human memo review**. It does not publish, approve
publication, adjudicate claims, admit evidence, authorize another round,
replace the provisional memo standard, or claim provider-level exactly-once
execution. Current deterministic publication blockers remain authoritative;
in particular, a valid draft may still be unpublishable.
