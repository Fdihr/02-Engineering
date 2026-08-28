# First Workflow Slice

Build one minimal script before broad application work.

The architecture in `memo-workflow.md` is a working hypothesis, not a fixed implementation contract.

## Slice: Seerist reality-check probe

Manual query input -> one Seerist API call -> unchanged raw artifact -> observed-field normalization -> minimal event log -> console summary.

## KISS boundary

This slice stays single-query, script-first, and function-first.

Do not add:

1. Chat or other UI.
2. AI query generation.
3. Firecrawl.
4. Find, Sweep, Judge, or Write agents.
5. Batch orchestration.
6. A database or plugin framework.
7. Hash chaining or sealed manifests.

## Definition of done

1. One manually defined query or request payload reaches one confirmed Seerist endpoint.
2. Credentials are read from environment configuration and never printed or committed.
3. The raw response is saved unchanged in a configurable, non-committed run folder.
4. Normalized output contains only fields demonstrated by the real payload.
5. A minimal JSONL event log records run ID, timestamp, event type, status, artifact reference, and errors.
6. The script prints a compact candidate-source summary for human inspection.
7. At least three representative queries are exercised manually.
8. Probe notes record payload shape, source types, content depth, pagination, errors, and rate limits.
9. `npm run typecheck` and `npm run build` pass.

## Inputs required before implementation

1. Seerist API documentation or a confirmed endpoint and request example.
2. Authentication method and environment-variable names.
3. Provider restrictions governing storage of raw responses.

Never paste credentials into chat or source files.

## Initial event contract

```ts
type ProbeEvent = {
	runId: string;
	occurredAt: string;
	eventType: string;
	status: "started" | "completed" | "failed";
	artifactRef?: string;
	error?: string;
};
```

Checksums, hash chaining, and sealed manifests remain later hardening steps.

## What this slice should teach us

1. Which endpoints and authentication flow are available.
2. Which source types and content depths Seerist returns.
3. Which provenance, date, geography, and language fields are reliable.
4. How pagination, quotas, rate limits, and errors behave.
5. Which provisional fields in `memo-workflow.md` should survive.

For reset constraints and non-goals, use:

- `03-Workflow/kiss-reset-plan.md`
- `03-Workflow/non-goals-from-poc.md`

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `03-Workflow/poc-to-workflow-intake.md`

Current cross-session context: `../../HANDOFF.md`
