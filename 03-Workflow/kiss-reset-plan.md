# KISS Reset Plan

Purpose: Rebuild the app from scratch with the smallest useful workflow.

## Hard rules

1. Build only one end-to-end slice first.
2. Prefer plain functions over frameworks.
3. No abstractions until repeated at least 3 times.
4. No feature branches in architecture before a working baseline.
5. Old PoC is inspiration only, never implementation authority.

## MVP scope

1. Input: one source record payload.
2. Process: validate -> route -> ledger entry.
3. Output: decision + ledger record.
4. Runtime: local command run, deterministic output.

## Out of scope for now

1. UI and dashboards.
2. Multi-provider adapters.
3. Batch orchestration.
4. Persistence layer redesign.
5. Complex plugin patterns.

## Exit criteria for phase 1

1. Deterministic output for identical input.
2. One success and one failure test passing.
3. Run log includes run id, rule id, reason, and status.
4. Workflow can be explained in 5 minutes from one diagram.
