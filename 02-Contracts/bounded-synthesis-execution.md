# Bounded Build and Challenge Execution

Status: Active contract for explicit analyst authorization of source notes ->
Build -> Challenge -> required human adjudication. This does not authorize
collection, source review, adjudication, key-judgement selection, writing or
publication.

## Entry and frozen authority

From `app/`, with `SOURCE_ASSURANCE_RUN_DIR` selecting the existing run root:

```powershell
npm run run:synthesis -- start <run-id> <analyst-id>
npm run run:synthesis -- status <run-id>
npm run run:synthesis -- resume <run-id>
```

The Findings control **Start bounded Build and Challenge** records the same
explicit human action. It runs asynchronously; refreshing only reads status.
**Resume bounded synthesis** spends remaining authority, not a new allowance.
An analyst ID follows existing approval conventions; there is no additional
permission-reference field.

One immutable `bounded-synthesis-authorization-v1` per run is stored at
`synthesis/execution/authorization.json`. It freezes the actor/time, source-note
references and SHA-256 checksums, synthesis policy and outlet table, target
`buildEnvelopeId`, existing request/record bindings, the two effective
Settings-selected SDK models, and per-stage/total call allowances.
`authorized.json` checksum-binds that authority to the analyst action.
Stage allowances are zero for an already committed stage and one otherwise;
total generation calls cannot exceed two. Model-catalog checks are metadata
operations, not generation calls.

Selection finishes the latest recorded Build round, including its existing
pending Challenge, before considering another Build. A recorded Challenge is
reused. Without a recorded Build, the sole unconsumed prepared Build is reused;
otherwise a new envelope ID is derived before authorization from the exact
selected notes, policies and authorization time. Multiple ready requests for
the selected stage, consumed attempts, and ambiguous historical state block
execution rather than authorize another attempt or round. Once authorized,
later notes and Settings edits cannot change the frozen work.

Before any generation, the runner reopens approved scope/question and
requirements, admission and extraction lineage, support review, note
assembly, request reconstruction and policy checksums. Reviewed source-note
v2 with `not-assessed` credibility retains its caveat and limited-evidence
semantics; provisional notes do not become reviewed. New bounded authority
requires reconstructable assembled notes. Historical synthetic notes remain
readable through the manual commands but do not bypass this authority check.

Checksum-bound exceptions block dependent frozen work. Positively recognized,
unrelated source exceptions do not block these inputs; every reference must
have an established scope, otherwise handling is conservatively run-wide.
No exception is closed, waived or silently repaired. Publication blockers
remain publication-scoped.

## Exclusive calls and receipts

`app/src/workflow/bounded-synthesis.ts` owns deterministic stage selection and
feeds the shared workflow selector. The command boundary performs filesystem
and SDK effects, reusing existing preparation, validators and recorders.
The dashboard combines these execution facts with unrelated source work
before invoking that same selector; it does not persist another queue/status
database. For isolated run roots, absolute bindings to known scanned artifacts
are canonicalized only in the dashboard presentation so recorded stages and
the human handoff stay connected; persisted lineage is never rewritten.
`run:next` displays bounded status and the explicit resume handoff
when this authority exists; it does not invoke models or advance later stages.

Only the existing tool-disabled, empty-session Copilot SDK transport is used.
The effective Build and Challenge model IDs are frozen from saved Settings.
An unavailable model blocks execution; Auto, substitution and new providers
are not supported. Each generation uses a fresh session with source-content
trust rules and the existing input/output/time limits.

Each stage directory contains write-once receipts as reached:

| Receipt | Meaning |
| --- | --- |
| `prepared.json` | Exact request binding, under the frozen authorization. |
| `reserved.json` | One stage invocation allowance durably consumed before calling. |
| `invocation.json` | Preserved raw result, request and authorization bindings. |
| `copilot-response.json` | Parsed response with invocation provenance; not yet a committed result. |
| `validated.json` | Deterministic validation succeeded at the frozen recording time. |
| `committed.json` | Canonical record binding; Challenge additionally requires its normal metrics and provisional handoff. |

The existing request directory also receives an exclusive
`generation-attempt.json` before invocation. This protects the request itself,
not just the bounded worker. Existing reservations, consumed responses and
attempt budgets are never reset. Manual dashboard Build/Challenge calls also
reserve their request exclusively; manual model execution/paste-back and
another Build preparation cannot bypass an active bounded authorization.
Historical manual actions remain available outside it.

Authority and stage receipts are flushed to disk before atomic, exclusive
publication using a same-directory hard link. The local run filesystem must
support hard links; unsupported operations fail closed before generation.
Worker ownership includes a PID and unique worker ID. Stale ownership is
preserved when reclaimed; a separate recovery lock serializes reclamation.
A dead recovery owner requires explicit inspection rather than claiming that
a worker is still running. These controls prevent application-level replay;
they do **not** promise provider-level exactly-once execution.

## Status, failure and restart

Read-only status reconstructs prepared, running, response-saved, validated,
committed, blocked, failed, indeterminate and human-waiting states from the
authority, receipts and canonical records. A reservation consumes allowance
even when transport or validation fails. Remaining calls are derived from
receipts, not a mutable counter.

Restart with a saved response validates/records it without another call.
Restart after a complete canonical Build, even before its commit receipt,
reuses that record and can spend only the unused Challenge allowance.
An exclusive reservation without a saved result is **indeterminate** after
interruption: it is never automatically reissued. A request-level reservation
without a stage receipt is equally conservative. Incomplete canonical
Challenge handoff artifacts require explicit recovery.

Transport, output-validation, recording, and next-request-preparation failures
preserve earlier valid artifacts and a precise terminal `failure.json`.
Repeated starts/resumes cannot clear that failure, refill a budget or retry a
failed model invocation. Preauthorization failures and dashboard-launcher
failures retain separate diagnostic receipts; status/launcher failures are
shown explicitly. Recovery after terminal or indeterminate state is an
operator inspection boundary, not a new automatic retry API. Do not delete
authorization/reservation files to obtain another allowance.

Successful Challenge, including a pass with zero raised findings, always
ends at **human-waiting**. Its ordinary provisional adjudication remains
`not-performed`; the runner never manufactures human adjudication or changes
existing human review, adjudication or publication records. An empty Build
can be recorded but the existing Challenge contract rejects a no-claim
request; that handoff fails explicitly rather than inventing a performed
Challenge.

## Verification boundary

The integration suite uses approved synthetic fixture lineage and an injected
fake model runner, including actual worker termination/restart, concurrency,
frozen inputs/models, existing work, exhausted attempts, scoped exceptions and
failure preservation. Dashboard tests exercise start/status/resume, controls,
authority bypass prevention and projection composition. These are not live
provider or model qualifications.
