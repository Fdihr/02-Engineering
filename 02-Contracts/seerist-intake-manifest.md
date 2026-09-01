# Seerist Intake Manifest Contract

Status: Active `/v1/wod` baseline
Validated: 2026-08-31
Implementation: `../app/src/commands/intake-seerist.ts`, `../app/src/workflow/process-source.ts`

## Purpose

Bind one selected Seerist item to the exact approved question, provider operation, request manifest, response manifest, and raw response that produced it. Independent CLI values cannot assign run identity, endpoint, or retrieval time during intake.

## Command

Run from `app/`:

```powershell
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
```

The response manifest and approved question must remain inside the configured `SEERIST_RUN_DIR`. Run, operation, question, and item IDs must be path-safe.

## Bundle reconstruction

Before item selection, the command requires:

1. The response manifest at `runs/<runId>/provider-operations/<operationId>/raw-provider-artifact.json`.
2. A successful Seerist `/v1/wod` response with valid ordered request and receipt timestamps.
3. The raw response at the exact manifest reference and canonical operation path.
4. Exact equality between the raw bytes' SHA-256 and the response manifest.
5. The sibling `collection-request.json` with matching run, operation, question, provider, method, endpoint, and request time.
6. The approved question at `runs/<runId>/research-questions/<questionId>/approved-research-question.json`.
7. Exact equality between the externally hashed approved question and the question lineage embedded at collection time.
8. Exact run-ID equality between the approved question, provider operation, response manifest, intake ledger, and output path.

The implemented adapter is deliberately limited to the observed `/v1/wod` GeoJSON `features[]` shape. Additional Seerist endpoints require observed response evidence, a narrow selector and role mapping, and focused tests before entering this contract.

## Persisted lineage

Every accepted Seerist item records:

- Raw artifact reference and SHA-256.
- Collection operation ID.
- Request-manifest reference and SHA-256.
- Response-manifest reference and SHA-256.
- Approved-question reference and SHA-256.

Output is non-overwritable and scoped by collection operation and item:

```text
runs/<runId>/provider-intakes/<operationId>/<providerItemId>/
  intake-result.json
  intake-summary.md
```

The Markdown summary is derived and read-only. It displays the stored lineage but has no transition controls.

## Proven boundary

The command integration test covers valid bundle reconstruction, persisted checksums, output immutability, altered raw bytes, and response manifests outside the configured run root. Workflow tests cover question-run mismatch and missing or malformed collection lineage.