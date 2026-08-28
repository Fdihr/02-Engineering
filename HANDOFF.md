# CTI Engineering Handoff

Date: 2026-08-28
Status: Ready for a new agent in the CTI workspace
Workspace root: `CTI/`
Source domain: Agentic App Engineering
Authority class: Current implementation direction and next-action handoff

## Start here

Open this folder as the VS Code workspace:

`C:\Users\FDIHR\OneDrive - Vestas Wind Systems A S\Cyberstrategy, Risk and OT - General\Strategic Risk Management\CTI`

The new agent must read, in order:

1. `00-Second Brain/agent.md`
2. `00-Second Brain/04-context-map/workspace-source-catalog.md`
3. `.github/copilot-instructions.md`
4. This handoff
5. `02-Engineering/03-Workflow/kiss-reset-plan.md`
6. `02-Engineering/03-Workflow/first-slice.md`

Read `02-Engineering/03-Workflow/memo-workflow.md` and the canonical SVG only as the current target architecture, not as a fixed implementation specification.

## Product direction

Build a modular TypeScript application that turns Seerist evidence into a trustworthy threat-intelligence memo.

The intended shape is:

1. Collect evidence from Seerist.
2. Review and approve evidence.
3. Analyze each source.
4. Synthesize claims across sources.
5. Write and verify a memo.
6. Require human approval before publication.
7. Maintain an event log throughout the run.

This shape is provisional. Real provider behavior and working scripts should determine the final contracts.

## KISS decision

Do not implement the complete workflow next.

Build small scripts and grow the architecture only when working behavior requires it:

1. Seerist reality-check probe.
2. One-source analysis script.
3. Sequential multi-source runner.
4. Cross-source claim synthesis.
5. Memo writer and verifier.

Avoid UI work, orchestration frameworks, databases, plugin systems, Firecrawl integration, and Vestas-context integration until the earlier scripts work.

## Immediate next slice: Seerist reality-check probe

Extend the existing TypeScript scaffold under `02-Engineering/app/` with the smallest executable script that can:

1. Accept one manually defined Seerist query or request payload.
2. Read credentials from environment configuration.
3. Call one confirmed Seerist endpoint.
4. Save the raw response unchanged to a local, non-committed run folder.
5. Normalize only fields observed in the real response.
6. Append a minimal event log containing run ID, timestamp, event type, status, and artifact reference.
7. Print a compact candidate-source summary for human inspection.

Start with manual query input. Do not add AI query generation yet.

## Probe definition of done

1. The script runs locally through the existing TypeScript toolchain.
2. No API key, token, or restricted payload is committed or printed.
3. Raw provider data is preserved unchanged.
4. Normalized output contains no speculative fields presented as provider facts.
5. At least three representative test queries have been exercised.
6. Findings document actual payload shape, source types, content depth, pagination, errors, and rate-limit behavior.
7. `npm run typecheck` and `npm run build` pass.

Use a question such as "What happened in Poland yesterday?" as one representative test, but do not encode that example as product logic.

## Event-log boundary

An event log is required from the first probe, but keep V1 implementation small.

Initially record only:

- `runId`
- `occurredAt`
- `eventType`
- `status`
- `artifactRef`
- `error` when applicable

The architecture document proposes checksums, hash chaining, and sealed manifests. Treat those as later hardening, not prerequisites for the first successful provider call.

## Existing implementation

`02-Engineering/app/` is a strict TypeScript/NodeNext scaffold.

Available commands:

```powershell
npm run dev
npm run typecheck
npm run build
npm run start
```

The current modules are starter examples, not proof that the approved memo workflow is implemented. Inspect source and tests before changing them, and preserve only patterns that help the probe.

## Current design artifacts

- Canonical visual: `02-Engineering/01-Architecture/memo-workflow-board.svg`
- KISS rules: `02-Engineering/03-Workflow/kiss-reset-plan.md`
- Immediate slice: `02-Engineering/03-Workflow/first-slice.md`
- Legacy PoC boundary: `02-Engineering/00-PoC-Reference/`

The workflow and SVG currently describe:

- Provider-neutral query intent with deterministic adapters.
- Seerist-first collection and optional Firecrawl fallback.
- Human evidence approval.
- Per-source Find, blind Sweep, Judge, and Write stages.
- Builder, challenger, and adjudicator synthesis.
- Claim-level memo citations and AI verification.
- Append-only event logging and artifact integrity.
- A deferred V2 Vestas-context tool.

These are design hypotheses. Keep what testing supports; simplify or revise what it does not.

## Known open questions

The Seerist probe should answer these before contracts are hardened:

1. Which endpoints and authentication flow are actually available?
2. What source types does Seerist return?
3. Does it return full content, partial content, summaries, snippets, or links?
4. How are publisher, author, upstream source, date, geography, and language represented?
5. How do pagination, quotas, rate limits, and errors behave?
6. What can be normalized reliably without inference?
7. Which raw payload restrictions affect local storage and testing?

## Explicit non-goals for the next agent

- Do not build the final application architecture in one pass.
- Do not implement the chat UI.
- Do not implement Firecrawl until Seerist behavior is understood.
- Do not implement the full Find/Sweep/Judge/Write chain yet.
- Do not build the Vestas context database yet.
- Do not treat TypeScript types in the workflow document as settled API contracts.
- Do not import code from the legacy PoC without an accepted mapping note.

## Validation status at handoff

Before this handoff:

- The workflow Markdown passed required-marker and balanced-fence checks.
- The canonical SVG passed XML, canvas-boundary, Vestas-palette, and marker checks.
- VS Code reported no errors in those two artifacts.
- The new Seerist probe has not been implemented or tested.

## Suggested opening prompt

> Read `00-Second Brain/agent.md`, the engineering source route, and `HANDOFF.md`. Work only in the Agentic App Engineering domain. Implement the Seerist reality-check probe defined in `02-Engineering/03-Workflow/first-slice.md` using the existing TypeScript scaffold. Keep it script-first and minimal. Before editing, inspect the current source and confirm the real Seerist endpoint and authentication requirements. Do not implement the broader memo architecture yet. Validate with typecheck and build, and report what the real API payload proves or disproves about the provisional contracts.

## Human input required

The new agent will need the Seerist API documentation or confirmed endpoint details. Credentials must be supplied through local environment configuration and must never be pasted into chat or committed.