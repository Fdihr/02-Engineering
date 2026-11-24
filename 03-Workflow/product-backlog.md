# its Product Backlog

Status: Working plan. Last updated: 2026-11-11.
Target architecture: [memo-workflow.md](memo-workflow.md). Implemented baseline: [first-slice.md](first-slice.md).
Constraints: [kiss-reset-plan.md](kiss-reset-plan.md), [non-goals-from-poc.md](non-goals-from-poc.md).

This backlog turns the target architecture into epics, features, user stories and tasks.
It does not change any contract. A feature moves to **Done** only when its behavior is
implemented, tested and reflected in `first-slice.md`.

Status key: **Done** · **Partial** · **Next** · **Later**

## Personas

- **Analyst**: approves research intent, handles pushed exceptions, reviews and publishes memos.
- **Reader**: consumes a published memo and needs to trust each statement.
- **Governance owner**: approves versioned policies, memo standards and context packs.
- **Operator**: runs the tool locally, configures models and providers, recovers failed runs.

## Milestones

| Milestone | Outcome | Epics |
| --- | --- | --- |
| M1 First published live memo | One real memo passes every blocking gate and is published by a human | E3, E5, E6, E7 |
| M2 Hands-off run | One command drives a run to the next human gate; the four human surfaces are the only manual steps | E8, E9 |
| M3 Broad collection | Approved Seerist endpoints and bounded OSINT search feed the same evidence contracts | E2 |
| M4 Organizational relevance | Optional Vestas profile adds governed relevance without contaminating evidence | E10 |
| M5 Production hardening | Retention, access control, recovery and bounded concurrency | E11 |

M1 is the nearest finished-product checkpoint. In `analysis-2026-11`, Round 2's
bounded memo (`memo-e3610113686290a28b94af7e984a5c33`) now runs under approved
`memo-standard-v3`, passes all 11 content checks, and clears
`PROVISIONAL_MEMO_STANDARD`; only `OPEN_KEY_JUDGEMENT_CONTEST` blocks approval
(with three requirements still silent). Historical Round 1 remains unchanged on
provisional v2. Eligible drafts can be human-approved and published as local
immutable Markdown+JSON packages.

---

## E1 Research intent and planning — Done

Feature status: scope and question approval (**Done**), draft-only research planning
preview (**Done**).

- *As an analyst, I want to turn a thesis into reviewable research questions and searches, so that collection starts from approved intent.*
- *As an analyst, I want no provider call to run before I approve scope and question, so that relevance originates in intent.*

Remaining tasks:
- [ ] Combine scope, question and IR approval into the single memo-level intent gate described in `memo-workflow.md` (Human operating model, item 1).

## E2 Collection and discovery — Partial

### F2.1 Seerist endpoint coverage — Partial
Only `GET /v1/wod` collection and discovery are implemented.
- *As an analyst, I want every Seerist endpoint my organization may use to be available, so that memos are not limited to one feed.*
- [ ] Inventory permitted endpoints and record live observations in `seerist-probe-findings.md`.
- [ ] Map each observed endpoint to evidence candidate, collection lead or context.
- [ ] Add one narrow adapter plus tests per endpoint, in priority order.
- [ ] Ingest Control Risks analyst reports from the Seerist payload (they have no web link today).

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

## E4 Source assurance — Partial

### F4.1 Extract under a deterministic controller — Done
### F4.2 Blind Sweep stage — Later
Replaces the human omission pass.
- [ ] Approve a Sweep policy and model budget.
- [ ] Implement Sweep over complete canonical content and compare against Extract.
### F4.3 Assess stage with outlet reliability table — Later
Replaces human source assessment.
- [ ] Approve versioned outlet identities and reliability table.
### F4.4 Automated support check — Later
Replaces human source-support verdicts once publication calibration meets policy.

## E5 Synthesis — Partial

### F5.1 Build — Done
### F5.2 Challenge — Done
### F5.3 Adjudicate — Done
- *As an analyst, I want only contests that could change a key judgement escalated to me, so that I adjudicate what matters.*
- [x] Deterministic post-selection check marks challenges that directly target a selected claim; before a matching selection exists, all remain reviewable.
- [x] Record adjudication outcomes and rebuild affected claims through the existing checksum-bound selection chain.
- [x] Adjudicate the two contested judgements in `analysis-2026-11` using admitted, in-window evidence only. Both remain low-confidence and contested because the relevant challenges were upheld; the later exception decisions did not admit evidence.

## E6 Memo composition and standards — Partial

### F6.1 Key-judgement selection — Done
### F6.2 Memo writer and renderer — Done
### F6.3 Bounded editorial revision — Done
### F6.4 Memo standard pack — Done
New starts use approved `memo-standard-v3`; the historical `analysis-2026-11`
draft remains bound to provisional v2 and is not rewritten.
- *As a governance owner, I want a memo standard curated from approved historical memos, so that quality is consistent without leaking historical facts.*
- [x] Select 23 readable, hash-verified archive memos for style-only curation; exclude 9 files that are unavailable or legacy binary documents.
- [x] Approve the domain-neutral standard with synthetic regression examples and an approved key-judgement cap of three.
- [x] Keep v2 unchanged for existing memo bindings; route new starts to the approved standard.

## E7 Quality assurance and publication — Partial

### F7.1 Deterministic verification — Done
### F7.2 Version-bound memo review — Done
### F7.3 Human publication gate — Done
- *As an analyst, I want to approve, reject or request a targeted revision, so that only reviewed memos are published.*
- *As a reader, I want to drill from any statement to its claim, observation and source, so that I can trust it.*
- [x] Enable approval only when deterministic blockers clear and the full policy sample is present and supported.
- [x] Record exact-draft human decisions and sampled evidence verdicts; keep calibration policy governance separate.
### F7.4 Publication delivery — Done (local package)
- [x] Use the approved run audience and a Markdown+JSON package; no external distribution.
- [x] Produce a write-once package with approval binding, review target and memo lineage.
### F7.5 Independent semantic verification — Later

## E8 Model platform — Partial

### F8.1 Copilot model selector per workflow stage — Done
### F8.2 Foundry adapter — Later (optional)
The current product path uses GitHub Copilot; Foundry is not required for M2.
- *As an operator, I may want to route AI stages to an approved Foundry deployment, so that deployments can use an organization-managed model endpoint.*
- [ ] Approve endpoint type, deployment, authentication, API version, region and retention.
- [ ] Implement the adapter behind the existing per-stage model setting.
- [ ] Record Foundry invocation provenance identically to SDK provenance.

## E9 Orchestration and dashboard — Partial

### F9.1 Shared next-action projection — Done
### F9.2 `run:next` driver — Partial (M2)
Replaces manual command choreography.
- *As an analyst, I want one action to advance the run to the next human gate, so that I don't run commands step by step.*
- [x] Drive the allowlisted research-question, relevance, Extract, and manual/unbounded Build, Challenge, key-judgement and writer recorders for saved responses in sequence, rereading state after each.
- [x] Resume bounded synthesis, memo and editorial-revision executions through the existing Copilot SDK only when their explicit immutable authorization is already present; consume only its frozen model and call budget.
- [x] Stop at the four human surfaces and on bounded failure.
`run:next` never creates or replenishes authorization. Manual/unbounded model
requests still require explicit transport, and bounded failures remain terminal
for that authorization. M2 uses the existing Copilot account; the optional
Foundry adapter is not a prerequisite.

## E10 Organizational relevance — Later (M4)

- *As a reader at Vestas, I want to know why supported external facts matter to us, without the context altering the facts.*
- [ ] Approve a small governed Vestas context pack (open decision 6).
- [ ] Dual-lineage relevance assessment after external synthesis.

## E11 Operations and hardening — Later (M5)

- [ ] Retention, access control, signing and recovery (open decision 9).
- [ ] Numeric collection, model-call, retry and token budgets (open decision 5).
- [ ] Bounded concurrency after sequential behavior is proven.

---

## Remaining work toward M1

Round 2 of `analysis-2026-11` (`memo-e3610113686290a28b94af7e984a5c33`) is bound
to approved `memo-standard-v3` and blocked solely by `OPEN_KEY_JUDGEMENT_CONTEST`
because `ir-04` selected contested single-source claim `c01` (while `ir-02`,
`ir-03`, and `ir-05` remain explicit evidence gaps). Clearing that contest via
in-window corroboration or an uncontested selection round unlocks the five-row
human support sample, publication approval, and creation of the first local
publication package.
