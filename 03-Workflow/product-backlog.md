# its Product Backlog

Status: Working plan. Last updated: 2026-11-05.
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

M1 is the nearest finished-product checkpoint. Today, the live memo `analysis-2026-11`
is blocked by `OPEN_KEY_JUDGEMENT_CONTEST`, `PROVISIONAL_MEMO_STANDARD` and
`PUBLICATION_GATE_BLOCKED`, and publication delivery is not implemented.

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
- [ ] Resolve each exception with a recorded decision that routes to its owning stage.
- [ ] Clear the two open relevance exceptions in `analysis-2026-11` (M1).

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
### F5.3 Adjudicate — Next (M1)
- *As an analyst, I want only contests that could change a key judgement escalated to me, so that I adjudicate what matters.*
- [ ] Deterministic change check that decides whether a challenge can alter a key judgement.
- [ ] Record adjudication outcomes and rebuild affected claims.
- [ ] Adjudicate the two contested judgements in `analysis-2026-11` using admitted, in-window evidence only.

## E6 Memo composition and standards — Partial

### F6.1 Key-judgement selection — Done
### F6.2 Memo writer and renderer — Done
### F6.3 Bounded editorial revision — Done
### F6.4 Memo standard pack — Next (M1)
`memo-standard-v2` (uncapped) is provisional, which blocks publication.
- *As a governance owner, I want a memo standard curated from approved historical memos, so that quality is consistent without leaking historical facts.*
- [ ] Select and approve historical memos for curation.
- [ ] Approve a non-provisional standard version with regression examples.
- [ ] Merge the uncapped-standard change (currently uncommitted on this branch).

## E7 Quality assurance and publication — Partial

### F7.1 Deterministic verification — Done
### F7.2 Version-bound memo review — Done
### F7.3 Human publication gate — Next (M1)
- *As an analyst, I want to approve, reject or request a targeted revision, so that only reviewed memos are published.*
- *As a reader, I want to drill from any statement to its claim, observation and source, so that I can trust it.*
- [ ] Enable publication approval once blocking gates clear.
- [ ] Present a policy-sized random sample of observation rows and record calibration verdicts.
### F7.4 Publication delivery — Next (M1)
- [ ] Decide output formats and audience (open decision 8).
- [ ] Produce an immutable published artifact with lineage.
### F7.5 Independent semantic verification — Later

## E8 Model platform — Partial

### F8.1 Copilot model selector per workflow stage — Done
### F8.2 Foundry adapter — Next (M2)
Replaces the manual Copilot bridge.
- *As an operator, I want to route any AI stage to an approved Foundry deployment, so that production runs do not depend on a local Copilot account.*
- [ ] Approve endpoint type, deployment, authentication, API version, region and retention.
- [ ] Implement the adapter behind the existing per-stage model setting.
- [ ] Record Foundry invocation provenance identically to SDK provenance.

## E9 Orchestration and dashboard — Partial

### F9.1 Shared next-action projection — Done
### F9.2 `run:next` driver — Next (M2)
Replaces manual command choreography.
- *As an analyst, I want one action to advance the run to the next human gate, so that I don't run commands step by step.*
- [ ] Drive every implemented step from its deterministic readiness state.
- [ ] Stop at the four human surfaces and on bounded failure.

## E10 Organizational relevance — Later (M4)

- *As a reader at Vestas, I want to know why supported external facts matter to us, without the context altering the facts.*
- [ ] Approve a small governed Vestas context pack (open decision 6).
- [ ] Dual-lineage relevance assessment after external synthesis.

## E11 Operations and hardening — Later (M5)

- [ ] Retention, access control, signing and recovery (open decision 9).
- [ ] Numeric collection, model-call, retry and token budgets (open decision 5).
- [ ] Bounded concurrency after sequential behavior is proven.

---

## Recommended next sprint (toward M1)

1. Finish the RMF relevance assessment and admission decision already prepared in `analysis-2026-11`.
2. Resolve the two open relevance exceptions (F3.4).
3. Adjudicate the two contested key judgements (F5.3).
4. Approve a non-provisional memo standard and merge the uncapped change (F6.4).
5. Implement publication approval and delivery (F7.3, F7.4).
