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
outlet table, the governing memo standard and its key-judgement policy, existing matching
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

For uncertain-relevance exceptions, memo execution also recognises two narrow,
read-only provenance proofs. A non-admitted RSS item is unrelated only when
its complete exception reference set reconstructs the capture, approved batch
policy, selection, canonical source, relevance assessment and decision, and
matching non-admission receipt; its source and references must not participate
in the frozen memo inputs. A historical article exception is superseded only
when the exact previous assessment/admission is bound by an explicitly approved
production reassessment, its reservation and invocation reconstruct, and its
relevant result produced the actual frozen source snapshot and approved admission
receipt. The old assessment and decision must not be used by the memo.
These proofs neither decide nor rewrite exceptions. Missing, changed, additional
or uncertain references remain blocking, as do current participating exceptions.
They grant no model calls or new evidence authority and apply equally to memo
creation and editorial revision.

An exclusive run worker coordinates starts, resumes and manual CLI preparation/
recording. Each generation also exclusively reserves both the request and its
stage *before* invoking the model. Raw transport output is saved even when it
later fails validation. Provider/model identity and invocation chronology are
checked; proposals pass the existing key-judgement KJ1–KJ8 and writer v2
recorders. Models cannot change eligibility, confidence, claim status, BLUF,
key-judgement rows, gaps, caveats, or publication decisions.

New starts use `memo-standard-v2`, which has no total word limit or prose word
budget. The writer is asked to be concise while using the space needed for clear
analysis; a two-page memo is acceptable. Structured statement limits, evidence
checks, prohibited-pattern checks, model-call allowances and publication blockers
remain unchanged. A valid draft is not rejected just for exceeding 350 words.

Historical v0/v1 standards remain immutable. Authorizations and drafts bound to
them still reconstruct under their original policy. Writer v2 requests under
standard v1 may carry a `rendered-memo-word-budget-v1` budget derived by the same
composer/renderer as recording; older requests without a budget retain their
exact prompt and identity. That historical path still enforces its frozen word
limit and supports the previously authorised length-only repair below. Changing
the default neither rewrites a draft nor grants another call, and editorial
revisions retain their parent's standard.

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

### Separately approved length-only repair

This compatibility path applies only to historical word-limited authorizations.

`npm run run:memo -- repair <run-id> <analyst-id>` authorizes at most one additional
writer call after an original, fully saved writer response reconstructs exactly
as `MEMO_TOO_LONG`. This is not `resume` and cannot repair another failure,
an interrupted/unknown invocation, or a previously completed draft. The analyst
must explicitly approve this extra call.

The unique `memo/execution/length-repair/` authorization checksum-binds the
original authority, failed writer request/response and terminal failure. It
freezes the same evidence, question, standard, performed adjudication, selected
key judgements and original model. Selection is reused with zero calls; only a
fresh budgeted optional-prose writer request receives one allowance. All original
receipts remain immutable. Repair authority and its human receipt use the
`bounded-length-repair-authorized` decision.

Status and resume follow this separate authority when it exists. Repeated
repair/start/resume, changed Settings and concurrency cannot refill it. A saved
repair response can finish deterministic recording, but a reserved invocation
without output cannot replay. Repair failures preserve their first terminal
receipt and stop. A successful repair produces the first draft, with fresh human
review and the existing blocked publication gate; it does not approve or publish.

Legacy manual preparation, model execution and paste-back cannot bypass an
existing bounded memo authorization. Historical artifacts are not rewritten.
Historical records lacking reconstructable approved lineage remain readable,
but do not qualify for new bounded execution.

The process always stops at **human memo review**. It does not publish, approve
publication, adjudicate claims, admit evidence, authorize another round,
replace the provisional memo standard, or claim provider-level exactly-once
execution. Current deterministic publication blockers remain authoritative;
in particular, a valid draft may still be unpublishable.
