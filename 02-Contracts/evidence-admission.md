# Evidence Admission Contract

Status: Active baseline
Validated: 2026-08-28
Implementation: `../app/src/modules/approval/evidence-approval.ts`, `../app/src/workflow/review-evidence.ts`

## Scope

This contract covers one explicit human decision on one persisted intake result. It does not define source retrieval, batch review, revision requests, source assurance, or publication approval.

## Command

Run from `app/`:

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]
```

The command input is the explicit human action. Narrative wording, provider scores, model output, and chat text cannot invoke the deterministic transition by themselves.

## Eligibility

The persisted intake artifact is reconstructed from unknown JSON and must satisfy all conditions:

1. The item role is `evidence_candidate` with `captured_content`.
2. The route role is `evidence_candidate` and destination is `human_review`.
3. Approval status is `pending_human_review`.
4. Item and route provider IDs are present and identical.
5. The intake ledger entry is a completed `intake.item.routed` event with a source run ID.
6. Reviewer ID, decision ID, decision reason, and a valid decision timestamp are present.

Collection leads and context items cannot pass this gate.

## Decisions

The accepted decisions are `approved` and `rejected`.

Every successful decision records:

- Stable decision ID and source intake run ID.
- Provider item ID.
- Reviewer ID and decision timestamp.
- Explicit reason.
- Canonical intake artifact reference.
- Human-attributed admission event.

A rejection creates no approved evidence snapshot.

## Approved snapshot

Approval creates `approved-evidence-snapshot.json` containing:

- Snapshot and source-decision IDs.
- Source intake run and canonical intake artifact reference.
- Provider item ID and reconstructed provider-neutral evidence candidate.
- Reviewer identity and admission time.
- Raw provider artifact reference and SHA-256 over its exact bytes.

The command creates a new decision directory and refuses to reuse an existing decision ID. This provides the current non-overwrite boundary. Hash chaining, sealed manifests, and storage-level write protection remain later hardening.

## Outputs

Each successful decision directory contains:

```text
runs/<decisionId>/
  evidence-decision.json
  evidence-decision-summary.md
  approved-evidence-snapshot.json  # approved decisions only
```

`evidence-decision.json` and the approved snapshot are canonical. The Markdown receipt is read-only and cannot advance state. Events append to `runs/evidence-events.jsonl`; failed attempts produce typed failure events.

## Proven boundary

Synthetic workflow tests cover approval, rejection, ineligible collection leads, mismatched provider IDs, and required human metadata. An isolated command integration test verifies raw-artifact hashing, output creation, Markdown rendering, event persistence, and refusal to overwrite an existing decision directory.

No real Seerist item was approved or rejected during implementation validation.