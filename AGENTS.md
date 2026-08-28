# Project Guidelines

## Sources of Truth

- Treat this as a workflow-first TypeScript prototype. Start with the current target in [03-Workflow/first-slice.md](03-Workflow/first-slice.md); the canonical target architecture in [03-Workflow/memo-workflow.md](03-Workflow/memo-workflow.md) is not the current implementation contract.
- Follow the thin dependency and side-effect boundaries in [01-Architecture/script-architecture.md](01-Architecture/script-architecture.md).
- Keep changes within the KISS constraints and non-goals in [03-Workflow/kiss-reset-plan.md](03-Workflow/kiss-reset-plan.md) and [03-Workflow/non-goals-from-poc.md](03-Workflow/non-goals-from-poc.md).
- Treat `00-PoC-Reference/` as reference material only. Before translating legacy behavior into `app/src/`, follow [03-Workflow/poc-to-workflow-intake.md](03-Workflow/poc-to-workflow-intake.md) and require an accepted note based on the [mapping template](00-PoC-Reference/03-Mapping/mapping-template.md).
- Consult [02-Contracts/contract-index.md](02-Contracts/contract-index.md) before adding or changing a cross-module contract.

## Architecture and Conventions

- The executable project lives in `app/`; keep new implementation code under `app/src/`.
- The current baseline flow is `validate -> route -> ledger`: orchestration belongs in `app/src/workflow/`, domain modules in `app/src/modules/`, and shared primitives and types in `app/src/core/`.
- Prefer deterministic, side-effect-light plain functions. Do not add an abstraction until the same need is demonstrated at least three times.
- Represent expected failures with the discriminated `Result<T, E>` type in `app/src/core/result.ts` and use explicit literal error types. Do not throw for normal validation or routing outcomes.
- This is strict TypeScript ESM using `NodeNext`; relative source imports must include the emitted `.js` suffix.
- Preserve human approval boundaries and auditable state transitions. Model output or chat text must not advance workflow state by itself.
- Read credentials from environment configuration. Never print, commit, or place credentials in chat; keep raw provider responses in configurable, non-committed run folders.

## Commands

Run commands from `app/`:

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm start
```

- Before finishing a code change, run `npm test`, `npm run typecheck`, and `npm run build`.
- Keep tests focused on deterministic module and workflow behavior; live probes remain separate external checks.