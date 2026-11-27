# its Product Backlog

Status: Working plan. Last updated: 2026-11-26.
Target architecture: [memo-workflow.md](memo-workflow.md). Implemented baseline: [first-slice.md](first-slice.md).
Constraints: [kiss-reset-plan.md](kiss-reset-plan.md), [non-goals-from-poc.md](non-goals-from-poc.md).

This backlog turns the target architecture into epics, features, user stories and tasks.
It does not change any contract. A feature moves to **Done** only when its behavior is
implemented, tested and reflected in `first-slice.md`.

Status key: **Done** · **Partial** · **Next** · **Later**

## Personas

- **Analyst**: approves research plan (Gate 1), reviews inline verbatim source quotes, and publishes memos (Gate 2).
- **Reader**: consumes a published memo and needs to trust each statement.
- **Governance owner**: approves versioned policies, memo standards and context packs.
- **Operator**: runs the tool locally, configures models and providers, recovers failed runs.

## Milestones

| Milestone | Outcome | Epics |
| --- | --- | --- |
| M1 First published live memo | One real memo runs end-to-end through the 2-gate workflow and is published as a local package | E1, E3, E4, E5, E6, E7, E9 |
| M2 Memo house outline & polish | Upgrade rendered memo outline from workflow buckets to executive house structure | E6 |
| M3 Broad collection | Approved Seerist endpoints and bounded OSINT search feed the same evidence contracts | E2 |
| M4 Model & org expansion | Optional Foundry runtime adapter and governed Vestas relevance profile | E8, E10 |
| M5 Production hardening | Retention, access control, recovery and bounded concurrency | E11 |

CTI Bench now operates on a **2-gate human workflow**:
- **Gate 1 (`#/new`)**: Analyst enters a thesis, edits the AI-drafted research plan and external source budget (default `6`), and clicks **Approve plan & generate memo**.
- **Automated middle (`npm run pipeline:run`)**: Seerist discovery, full-text Seerist analysis intake, bounded HTTPS article capture, relevance screening, byte-anchored quote extraction and deterministic assurance (`auto-assure-source.ts`), bounded synthesis + adversarial challenge, automated challenge adjudication (preserving contested claims as visible caveats), and bounded memo writing + 1-shot length repair run automatically without mid-run human stops.
- **Gate 2 (`#/review`)**: Analyst reads the clean executive memo with clickable `[1 publisher]` inline pills, inspects exact verbatim source quotes and caveats, and publishes in **1 click** (`support-calibration-policy-v2.json`).

---

## E1 Research intent and planning — Done

Feature status: unified Gate 1 research plan approval (**Done**), AI draft-plan generation (**Done**).

- *As an analyst, I want to turn a thesis into reviewable research questions and searches, so that collection starts from approved intent.*
- *As an analyst, I want no provider call to run before I approve scope and question, so that relevance originates in intent.*
- [x] Combine scope, question, IR approval, and optional automated pipeline launch into Gate 1 (`approve-intent` with `runPipeline: true`).

## E2 Collection and discovery — Partial

### F2.1 Seerist endpoint coverage — Done (M3)
All 28 read-only Seerist Hyperion `GET` endpoints are live-probed, inventoried, and governed by explicit role boundaries.
- *As an analyst, I want every Seerist endpoint my organization may use to be available, so that memos are not limited to one feed.*
- [x] Inventory all 28 permitted read-only `GET` endpoints, AOI casing conventions (`pl` / `PL` / `POL`), `/v1/wod` `sources` validation rules, and `metadata.next` `x-api-key` redaction requirements in `seerist-probe-findings.md`.
- [x] Map each observed endpoint to `evidence_candidate`, `collection_lead`, `context`, or `config/helper` in `02-Contracts/provider-item-role-and-provenance.md` and `02-Contracts/seerist-intake-manifest.md`.
- [x] Add narrow adapters, deterministic geography-to-AOI expansion (`seerist-aois.ts`), multi-endpoint discovery (`breaking-events`, `verified-events`, `hotspots` + `clusterId` expansion, and Scribe structured event leads), HTML breaking-event canonicalization, and unit/pipeline tests.
- [x] Ingest full-text Seerist `analysis` and `breaking-events` items directly from captured discovery pages (`run-pipeline.ts`).

### F2.2 RSS acquisition — Done (two feeds)
- [ ] Observe and enable further catalogue feeds one at a time.

### F2.3 Exact-URL article retrieval — Done
### F2.4 Bounded OSINT search and discovery — Later
- *As an analyst, I want bounded web search for an approved question, so that I can find sources Seerist does not carry.*
- [ ] Choose and approve a search provider, budget and retention policy.
- [ ] Return leads only; retrieval and admission stay on the existing path.

## E3 Evidence readiness and admission — Partial

### F3.1 Canonical source documents and anchors — Done
### F3.2 AI question relevance — Done
### F3.3 Policy admission (exact-relevant-only) — Done
### F3.4 Pushed exception queue — Partial
- *As an analyst, I want exceptions pushed to me with a recommended action, so that I never poll per source.*
- [ ] One queue view for the four kinds: `uncertain-relevance`, `unresolved-reconciliation`, `key-judgement-contest`, `bounded-failure`.
- [x] Record `exclude` / `accept-gap` decisions as write-once artifacts (CLI `decide:exception` and dashboard Exceptions panel); gates honor them.
- [ ] Route `resume` / `reject` decisions to their owning stage.
- [x] Clear the open relevance exceptions in `analysis-2026-11` (M1): RMF excluded as context; two older items accepted as gaps.

## E4 Source assurance — Done (automated baseline)

### F4.1 Extract under a deterministic controller — Done
### F4.2 Deterministic verbatim-quote assurance (`auto-assure-source.ts`) — Done
Verifies exact UTF-8 byte-offset quotes against canonical source documents, classifies outlet reliability from `geopolitical-outlets-v1.json`, and emits reviewed synthesis source notes automatically without manual per-source forms.
### F4.3 Blind Sweep stage — Later
Optional second-pass omission check over complete canonical content.
- [ ] Approve a Sweep policy and model budget.
- [ ] Implement Sweep over complete canonical content and compare against Extract.

## E5 Synthesis — Done

### F5.1 Build — Done
### F5.2 Challenge — Done
### F5.3 Automated challenge adjudication — Done
- [x] Uphold raised adversarial challenges deterministically and preserve contested claims as visible, non-blocking caveats in the rendered memo (`writer.ts`, `publication.ts`).

## E6 Memo composition and standards — Done

### F6.1 Key-judgement selection — Done
### F6.2 Memo writer and renderer — Done
### F6.3 Bounded editorial revision — Done
### F6.4 Memo standard pack — Done (`memo-standard-v4`)
### F6.5 Executive house outline upgrade — Done (M2)
- [x] Reshape rendered memo sections from mechanical workflow buckets into an executive intelligence memorandum (`Bottom Line`, `Key Judgements`, `Situation`, `Assessment & Implications`, `Uncertainties & Intelligence Gaps`, `Outlook & Indicators to Watch`), supply the full non-rejected adjudicated claim pool to the writer, and move provenance/competing-hypothesis mechanics into the `#/review` inspector while preserving `v0`–`v3` backward compatibility.

## E7 Quality assurance and publication — Done

### F7.1 Deterministic verification — Done
### F7.2 Version-bound memo review — Done
### F7.3 Zero-quiz 1-click publication gate — Done
- [x] `support-calibration-policy-v2.json` (`sampleSize: 0`) + `approve-and-publish` enable 1-click publication at Gate 2 after inline source inspection.
- [x] Reader drills from inline `[N publisher]` and `Caveat` pills directly to verbatim source quotes and challenge notes.
### F7.4 Publication delivery — Done (local package)
- [x] Produce a write-once Markdown+JSON publication package with approval binding, review target and memo lineage.
### F7.5 Independent semantic verification — Later

## E8 Model platform — Partial

### F8.1 Copilot model selector per workflow stage — Done
### F8.2 Foundry adapter — Later (M4)
The current product path uses GitHub Copilot (`github-copilot-sdk`); Foundry is not required for M1/M2.
- [ ] Approve endpoint type, deployment, authentication, API version, region and retention.
- [ ] Implement the runtime adapter behind the per-stage model setting in `run-pipeline.ts` and `copilot.py`.
- [ ] Record Foundry invocation provenance identically to SDK provenance.

## E9 Orchestration and dashboard — Done

### F9.1 Automated end-to-end pipeline (`pipeline:run` + `pipeline_runner.py`) — Done
- [x] Single automated pipeline drives Seerist discovery, article capture, relevance screening, extraction, byte-anchor assurance, synthesis, adjudication, and memo drafting from Gate 1 to Gate 2.
- [x] Failed or interrupted runs log non-blocking coverage gaps and resume cleanly from saved checkpoints on disk.
### F9.2 Rebuilt 2-gate desktop UI — Done
- [x] Stripped interim manual Sources and Synthesis gates; surfaces are `Analyses` (`#/home`), `New analysis` (`#/new`), `Memo` (`#/review`), `Audit` (`#/audit`), and `Settings` (`#/settings`).

## E10 Organizational relevance — Later (M4)

- *As a reader at Vestas, I want to know why supported external facts matter to us, without the context altering the facts.*
- [ ] Approve a small governed Vestas context pack.
- [ ] Dual-lineage relevance assessment after external synthesis.

## E11 Operations and hardening — Later (M5)

- [ ] Retention, access control, signing and recovery.
- [ ] Numeric collection, model-call, retry and token budgets.
- [ ] Bounded concurrency after sequential behavior is proven.

---

## Milestone status

- **M1 First published live memo — Done**: Live run `poland-sabotage-2026-11` executed end-to-end through `pipeline:run` (63 Seerist leads, 3 assured sources, 49 byte-anchored quotes, 40 synthesis claims) and published as a local package.
- **M2 Memo house outline & polish — Done**: `memo-standard-v4` executive memo writer, full adjudicated claim pool, proportional multi-paragraph composition, and `#/review` inspector provenance live and tested.
- **Next up (M3)**: Broaden Seerist endpoint coverage beyond `/v1/wod` and evaluate bounded OSINT search.
