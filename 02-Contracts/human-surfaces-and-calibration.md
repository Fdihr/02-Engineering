# Human Surfaces, Policy Admission, Exceptions, and Calibration

Status: Active target contract with compatibility defaults for existing runs.

## Human surfaces

Human effort is per memo. The only human surfaces are:

1. Intent approval before collection.
2. Publication approval with lineage drill-down and sampled audit.
3. A pushed exception queue that may be empty.
4. Governance approvals outside the per-memo loop.

Per-source support review, omission review, source assessment, adjudication, command choreography, and manual model transport are interim stand-ins with named machine replacements in `../03-Workflow/memo-workflow.md`.

## Policy admission

Profile policy includes a versioned admission policy. Absent admission data defaults to compatibility `human` mode so existing commands and artifacts remain valid. A new policy version may select `controller` mode.

Controller admission requires exact `relevant` relevance, code-validated anchors, `ready` or `qualified` readiness, non-synthetic input, remaining budget, and complete validated lineage. Code creates the existing approved snapshot shape with `admittedBy: "controller:<policyId>"`. AI never admits. Partial relevance creates an `uncertain-relevance` exception.

## Exceptions

`ExceptionItem` has one of four kinds: `uncertain-relevance`, `unresolved-reconciliation`, `key-judgement-contest`, or `bounded-failure`. It binds a run, artifact references and checksums, raised time, and open/decided state. Decided items require a decision and `decidedBy`. Items are write-once under `runs/<runId>/exceptions/<exceptionId>/`.

Current emitters exist for uncertain relevance and exhausted Extract attempts. Reconciliation and key-judgment contest remain reserved typed kinds until their stages own an emitter.

## Publication calibration

Publication decisions require sampled observation verdicts and lineage drill-down records. The default policy samples five observations per memo. The initial threshold is 30 sampled verdicts across six memos at no more than 5% disagreement; it is `provisional-untested` and cannot become approved through runtime measurement.

Until an approved threshold is reached, memo limitations state exactly `support check: model-only, unvalidated`.

The calibration record checksum-binds the publication decision and calibration policy, the selected observation IDs, sampled verdicts, drill-down clicks and optional verdicts, and threshold status.

## Driver

`npm run run:next -- <run-id>` reads persisted run state. It executes an allowlisted deterministic recorder when a prepared response is ready, reports Foundry-adapter machine work for a pending model request, or reports one of the four human surfaces and its artifact path. It never labels manual model transport or command execution as a human approval surface.