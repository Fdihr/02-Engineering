# Function-Based Script Architecture

Status: Active implementation constraints for the current script-first slices.

## Purpose

Keep each script small enough to understand locally while preserving boundaries that can support later providers, batching, persistence, and user interfaces when those needs are demonstrated.

Scalability comes from explicit data and replaceable functions, not from framework abstractions added in advance.

## Dependency direction

```mermaid
flowchart LR
    Command[Thin command] --> Workflow[Workflow function]
    Question[Human question approval] --> Operation[Validate provider operation]
    Operation --> Reader[API or artifact reader]
    Reader[API or artifact reader] --> Intake[Provider intake]
    Intake --> Workflow
    Workflow --> Validate[Validate]
    Workflow --> Classify[Classify role]
    Workflow --> Route[Route]
    Workflow --> Ledger[Create ledger event]
    Review[Human review command] --> Approval[Validate evidence admission]
    Approval --> Snapshot[Decision or approved snapshot]
    Command --> Persist[Persist artifacts and events]
    Review --> Persist
    Question --> Persist
```

Dependencies point inward:

1. Commands may depend on workflows and side-effect functions.
2. Workflows may depend on domain modules and shared primitives.
3. Domain modules may depend on shared primitives, but never on commands or workflows.
4. Provider-specific intake may produce provider-neutral facts; provider-neutral decisions must not import provider clients or raw response schemas.
5. Probes are developer discovery tools and must not become production dependencies.

## Folder ownership

| Location | Owns | Must not own |
| --- | --- | --- |
| `app/src/commands/` | Arguments, process exit, concise console output, concrete side-effect wiring | Classification or routing policy |
| `app/src/probes/` | Provider contract discovery and raw-response inspection | Production workflow behavior |
| `app/src/workflow/` | One use case composed from plain functions | Provider HTTP details or console formatting |
| `app/src/modules/` | Validation, provider intake, classification, routing, and ledger-data creation | Process exit, environment lookup, or direct console output |
| `app/src/core/` | `Result<T, E>` and types proven to be shared across modules | Provider payload mirrors or speculative abstractions |

Create a folder only when its first implementation file is needed.

## Function rules

1. Prefer plain functions with explicit input and output types.
2. Use `Result<T, E>` and literal error types for expected validation, classification, and routing failures.
3. Keep raw provider values at the intake boundary. Pass only validated observed facts into provider-neutral decisions.
4. Model alternatives with discriminated unions rather than optional-field bags when behavior differs by role.
5. Do not use narrative text, model output, or provider scores to advance approval state.
6. Keep source values and provider taxonomies open unless repeated live responses prove a closed set.
7. Add a shared abstraction only after the same need appears in at least three places.

## Side-effect boundary

The command layer owns:

- Environment and argument reads.
- API and filesystem access.
- Current time and generated identifiers.
- Console output and process exit.
- Persistence of raw artifacts and append-only events.

Domain functions receive these values as inputs and return data describing what should be recorded. They do not hide writes or wall-clock reads.

The one-item intake workflow supplies ledger timestamps explicitly. The ledger helper does not read the wall clock.

## Current one-item flow

```text
approved research question + bound provider operation
  -> validate approval, chronology, question ID, run ID, and endpoint allowlist
  -> perform one read-only Seerist request or one bounded multi-query discovery plan
  -> preserve response and question lineage
  -> for discovery, deduplicate and deterministically rank candidates
  -> saved raw artifact + selected item
  -> validate observed envelope
  -> extract provider-neutral facts
  -> classify as evidence candidate | collection lead | context
  -> route to human review | source retrieval | context only | controlled handling
  -> create ledger event data
  -> command persists output
```

Provider credentials and HTTP remain inaccessible until the research-intent gate succeeds. No intake route may produce evidence status `approved`; evidence approval requires a later explicit human action and auditable transition.

Bounded discovery is sequential, capped by explicit query, page, call, and result limits, and preserves each raw page. It is not a general batch runner and does not automatically advance any candidate into intake.

## Current evidence-admission flow

```text
persisted intake result + explicit reviewer decision
  -> reconstruct and validate eligible evidence candidate
  -> validate reviewer, timestamp, reason, and item identity
  -> hash referenced raw provider artifact
  -> record approved or rejected decision
  -> create non-overwritable approved snapshot only for approval
  -> append human-attributed event
```

The Markdown decision receipt is a derived read-only view. It has no controls and no state authority.

## Testing layers

1. Domain tests call pure functions with synthetic structural fixtures.
2. Workflow tests compose real domain functions with controlled timestamps and in-memory side-effect substitutes.
3. Command smoke tests cover argument handling and exit behavior only when command complexity warrants them.
4. Live provider probes validate external behavior separately and do not replace deterministic tests.

Do not commit provider narrative content as a fixture unless retention and test-data use are explicitly permitted.

## Scale only on evidence

| Demonstrated need | Smallest next abstraction |
| --- | --- |
| A second provider repeats the same operation | A narrow provider operation type or function contract |
| Three commands repeat side-effect wiring | A shared command helper |
| Batch execution is required | A sequential runner over the existing one-item workflow |
| Durable resume is required | A persistence boundary around existing events and artifacts |
| Concurrent workers are required | A queue contract preserving stable item IDs and ordering |

Do not add provider base classes, plugin registries, dependency-injection containers, event buses, generic repositories, or orchestration frameworks before one of these triggers exists.

## Review checklist

Before expanding a script, verify:

1. Can its command entry point be understood without reading domain policy?
2. Can each domain decision be tested without API, filesystem, clock, environment, or console access?
3. Does provider-specific code stop at validated observed facts?
4. Is every state transition explicit and auditable?
5. Is the proposed abstraction justified by repeated working code?