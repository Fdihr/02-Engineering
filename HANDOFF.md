# CTI Engineering Handoff

Date: 2026-09-03
Status: Human NV support review complete; reviewed note supersedes provisional note, reviewed metrics recorded, and reviewed-only Build awaits a bounded claim-selection rule
Workspace root: `CTI/`
Source domain: Agentic App Engineering
Authority class: Current implementation direction and next-action handoff

## Start here

Open this folder as the VS Code workspace:

`C:\Users\FDIHR\OneDrive - Vestas Wind Systems A S\Cyberstrategy, Risk and OT - General\Strategic Risk Management\CTI`

At the start of every terminal session, recreate the short path before deep run access:

```powershell
subst R: /D 2>$null; subst R: "C:\Users\FDIHR\OneDrive - Vestas Wind Systems A S\Cyberstrategy, Risk and OT - General\Strategic Risk Management\CTI\02-Engineering"; Set-Location R:\
```

The new agent must read, in order:

1. `00-Second Brain/agent.md`
2. `00-Second Brain/04-context-map/workspace-source-catalog.md`
3. `.github/copilot-instructions.md`
4. This handoff
5. `02-Engineering/03-Workflow/kiss-reset-plan.md`
6. `02-Engineering/03-Workflow/first-slice.md`

Read `02-Engineering/03-Workflow/memo-workflow.md` and the canonical SVG only as the current target architecture, not as a fixed implementation specification.

## Product direction

Build a modular TypeScript application that turns material from the approved Seerist API surface and OSINT search, discovery, and retrieval into trustworthy evidence-grounded memos. Cyber threat intelligence is the first validated profile, not the product boundary. The domain-neutral workflow must also support geopolitical, country-risk, physical-security, supply-chain, operational-risk, and similar research questions.

The long-term target includes every Seerist endpoint the organization is permitted to use. The executable baseline covers only endpoints and OSINT mechanisms whose live behavior has been observed and mapped into explicit evidence-candidate, collection-lead, or context roles. Current proof covers bounded `/v1/wod` collection and discovery plus exact-URL OSINT retrieval; endpoint breadth must grow through narrow tested adapters rather than unverified generic handling.

Cyber terminology, CTI-specific quality policy, Vestas context, and organizational relevance are selectable memo-profile concerns. They must not become prerequisites for unrelated memo types. When organizational relevance is requested, it remains downstream of supported external claims and requires governed context lineage.

The intended shape is:

1. Approve memo request, scope, organizational-relevance choice, research questions, and IRs at one memo-level intent gate.
2. Collect question-bound material from Seerist.
3. Losslessly canonicalize each captured source into stable, content-addressed segments.
4. Use bounded AI reasoning to assess each canonical source against the approved question.
5. Deterministically validate exact anchors and persist only proposed or pending candidates.
6. Admit relevant, ready, anchor-valid, non-synthetic evidence under an approved controller policy; push partial, uncertain, or failed work to the exception queue.
7. Analyze each admitted source through independent Find, blind Sweep, Judge, and Write.
8. Synthesize claims across sources.
9. Write and verify a memo.
10. Require human publication approval with lineage drill-down and a policy-sized sampled observation audit.
11. Maintain an event log throughout the run.

This shape is provisional. Real provider behavior and working scripts should determine the final contracts.

## Human operating model decision

Human effort is per memo, not per source. Exactly four surfaces exist:

1. **Intent gate:** memo request, scope purpose/audience/geography/time, organizational-relevance choice, questions, and IR decomposition. Nothing is collected before it.
2. **Publication gate:** memo review, lineage drill-down, approve/reject/targeted revision, and a random observation sample (`N` from policy, default `5`) whose verdicts and drill-down clicks calibrate the automated support check.
3. **Exception queue:** pushed, never polled; empty is normal. The four kinds are `uncertain-relevance`, `unresolved-reconciliation`, `key-judgement-contest`, and `bounded-failure`.
4. **Governance:** organizational context, memo standards, profile policies, outlet identities, and reliability tables approved outside the per-memo loop; every run records versions and checksums.

AI never admits evidence. Deterministic code may admit under an approved policy. The target auto-admit rule is: relevance exactly `relevant`, anchors code-validated, readiness passed, not synthetic, and within budget. The snapshot records `admittedBy: "controller:<policyId>"`. `partially-relevant` and `uncertain` route to the exception queue.

The POC justifies this decision because downstream guards have fired on real NV material: immutable lineage rejected a changed policy, dependency collapse exposed shared origins, kind bounds rejected inflation, confidence ceilings held, Challenge kept alternatives visible, deterministic verification invalidated an overlong memo, and publication blocking prevented synthetic/provisional output. Code admission changes routine state authority; it does not give admission authority to AI.

### Interim stand-ins

| Current interim stand-in | Named replacement | Trigger or prerequisite |
| --- | --- | --- |
| Human source-support verdicts | Automated bounded support check | Publication calibration reaches approved sample/memo/disagreement thresholds |
| Human omission pass | Blind `Sweep` | Complete canonical content, approved policy, and bounded model budget |
| Human source assessment | `Assess` plus outlet reliability table | Approved outlet identity and reliability governance artifacts |
| Human adjudication | `Adjudicate` plus key-judgment escalation | Deterministic change checks; only key-judgment-changing contests escalate |
| Manual command choreography | `run:next` | Deterministic readiness and next-action status for each implemented stage |
| Manual Copilot bridge | Foundry adapter | Approved endpoint, deployment, authentication, API version, region, and retention |

Until calibration reaches the provisional, untested threshold of 30 sampled verdicts across 6 memos at no more than 5% disagreement, memo limitations state `support check: model-only, unvalidated`. The threshold and default sample size are governance policy, not runtime judgment.

## KISS decision

Do not implement the complete workflow next.

Build small scripts and grow the architecture only when working behavior requires it:

1. Seerist reality-check probe (complete).
2. Explicit memo-scope and research-question approval plus bounded Seerist collection (complete).
3. One-item evidence intake and provider-role classification (complete).
4. Explicit human evidence admission compatibility baseline (complete; default remains human until a new policy version selects controller mode).
5. One exact-URL source retrieval from an approved collection lead (implemented and checked live).
6. One lossless canonical source document with exact anchor validation (implemented and checked on the retrieved NV source).
7. One bounded AI source-to-question relevance assessment plus deterministic proposal validation (implemented as an interactive Copilot PoC).
8. Convert one validated positive assessment into a pending candidate and exercise the compatibility human admission path (complete; real NV snapshot approved).
9. One-source `Find -> Sweep -> Judge -> Write` from the approved NV snapshot.
10. Sequential multi-source runner.
11. Cross-source claim synthesis.
12. Memo writer and verifier.

Avoid UI work, orchestration frameworks, databases, plugin systems, broader Firecrawl discovery, and Vestas-context integration until the earlier scripts work.

## Completed slice: Seerist reality-check probe

The generic read-only probe accepts manually defined endpoint requests, preserves unchanged raw responses in the ignored run folder, appends minimal events, and prints structural summaries. Twenty-two successful calls across twelve endpoint paths established the live capability boundary.

Key findings:

1. World of Data response shape varies materially by source type.
2. News, social, and tested cluster articles exposed summaries and links but no article body.
3. Analyst reports exposed full multilingual bodies.
4. Hotspots and Scribe retain cluster or source links but are discovery surfaces.
5. Country background, risk ratings, and Pulse are provider context rather than independent corroboration.
6. Targeted risk ratings exposed no freshness timestamp.
7. Bounded historical windows reduced observed pagination snapshot drift.

Use `02-Engineering/03-Workflow/seerist-probe-findings.md` as the observed-fact record.

## Completed slice: one-item evidence intake

The deterministic `validate -> classify -> route -> ledger` script now:

1. Accept one manually selected item from a verified Seerist collection bundle.
2. Validate the bound question, operation, request and response manifests, raw SHA-256, and fields observed for the endpoint and source type.
3. Classify the item as an evidence candidate, collection lead, or context.
4. Preserve provider ID, retrieval time, raw and manifest checksums, available provenance, and content completeness.
5. Route native captured content to canonicalization, leads to retrieval, and context to context-only handling; no narrative text may trigger approval.
6. Append the deterministic decision to the ledger.

The command is:

```powershell
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
```

Focused workflow and command tests cover all roles, invalid input, numeric IDs, country context, run binding, path confinement, bundle checksums, immutable output, and the no-automatic-approval invariant. Native analyst content now completes initial intake as `evidence_candidate -> source_canonicalization -> not_applicable`.

The active intake boundary is `02-Engineering/02-Contracts/provider-item-role-and-provenance.md`.

## Completed slice: approved research intent and bounded collection

Current commands persist scope and question approvals separately, but they are an interim command-level representation of one memo intent surface. Each canonical artifact is immutable and human-attributed. Question approval verifies approved-scope lineage and bounded geography/time; collection and discovery reject unscoped questions before credential access. One Seerist operation must match the approved question ID and run ID and may target only the proven `GET /v1/wod` endpoint.

```powershell
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
```

Validation occurs before credential lookup or `fetch`. The active boundary is `02-Engineering/02-Contracts/research-question-and-provider-operation.md`. Earlier smoke item `1030013` has no approved pre-collection question lineage and remains non-admissible.

## Completed compatibility slice: explicit evidence admission

The existing human-review command remains the default `human` admission-policy mode so current behavior and NV artifacts are unchanged. It accepts one eligible relevance-assessed intake result, `approve`, `reject`, or `revise`, reviewer ID, reason, and an optional decision ID. This per-source action is a compatibility baseline and interim stand-in, not a fifth target human surface. Controller mode is introduced only through a new policy version and uses the same snapshot shape.

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject|revise> <reviewer-id> <reason> [decision-id]
```

The active boundary is `02-Engineering/02-Contracts/evidence-admission.md`. Initial command validation used synthetic temporary artifacts; reviewer `FDIHR` later approved the real retrieved-source candidate as `nv-evidence-review-001`.

## Implemented slice: one-source retrieval

The source-retrieval command accepts one persisted collection-lead intake and the exact source URL already present on that lead. It validates approved research lineage and route eligibility before credential access, then makes one fixed Firecrawl v2 Markdown scrape with cache reuse and storage disabled, TLS verification required, no target headers or actions, and bounded time and response size.

```powershell
npm run retrieve:source -- <intake-result.json> <exact-source-url>
```

The raw provider envelope, canonical result, checksums, read-only receipt, and events remain under ignored `app/runs/`. The result distinguishes Firecrawl as access provider from the original publisher, treats fetched text as untrusted, rejects cross-origin redirects, and always records `approvalStatus: "not_requested"`.

The active boundary is `02-Engineering/02-Contracts/source-content-retrieval.md`. Automated tests and strict TypeScript pass. On 2026-08-31, the selected NV source completed one bounded live retrieval: Firecrawl returned HTTP 200, the final URL matched the requested publisher URL, and the canonical result recorded `resolved` / `content_retrieved` with `approvalStatus: "not_requested"`.

## Implemented slice: canonical source and Copilot relevance PoC

Retrieved and native Seerist content now terminate in the same canonical source contract. The retrieved NV source was losslessly canonicalized into 76 deterministic segments with exact UTF-8 anchors. The provider-neutral relevance module creates one fixed-policy request containing the approved question and complete source, validates all four verdict routes, rejects model-authored authority, and verifies exact source quotes.

Because no approved Azure AI Foundry endpoint is currently available, GitHub Copilot in VS Code is used only as an interactive PoC model executor between two local commands:

```powershell
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
```

The adapter honestly records `model: "not-exposed-by-host"`. This is not a production Copilot API integration. A future Foundry adapter replaces the manual transport while preserving the request, assessment, exact-anchor, and authority contracts.

The real NV assessment completed as `partially-relevant` with three exact anchors and controller-derived destination `evidence_candidate_proposal / pending_human_review`. On 2026-09-01 it was converted into candidate `nv-candidate-question-relevance-001`; human reviewer `FDIHR` then approved it in decision `nv-evidence-review-001`, creating snapshot `snapshot-nv-evidence-review-001` for source assurance.

## Provider content storage decision

The repository sits inside a OneDrive-synced, access-controlled team library, so ignored `runs/` content is stored in Vestas tenant cloud storage. This is recorded as a decision rather than treated as a leak: provider content lives there because organizational policy places work data there, and the library is the team's controlled channel.

The contract owner has confirmed that Seerist's terms and the captured publisher pages permit internal storage of retrieved content, which closes the previously open retention question. Two rules continue to apply, because permission to store internally is not permission to publish. Raw provider content never leaves the tenant, and committing provider content to git remains a separate deliberate decision rather than an automatic consequence: committed test fixtures stay synthetic unless a specific fixture is explicitly approved. Content-free run values such as counts, rates, and checksums may be recorded in committed documentation.

Operational consequences of that placement are handled in code and configuration. `git config core.longpaths true` is set, the deep working directory is reachable through a `subst` drive letter for shorter tool-visible paths, run directory identifiers are short, and the shared file layer wraps absolute paths with `toNamespacedPath`. Filesystem writes retry only `EPERM` and `EBUSY`, which are the transient locks a sync client causes; `EEXIST` is never retried because that is the write-once guard reporting a real collision. Windows PowerShell 5.1 still fails to enumerate the deepest paths, so prefer PowerShell 7 for directory listings.

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
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
npm run retrieve:source -- <intake-result.json> <exact-source-url>
npm run canonicalize:source -- <source-retrieval-result.json|seerist-intake-result.json>
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
npm run reintake:source -- <source-retrieval-result.json> <question-relevance-assessment.json> [candidate-id]
npm run review:evidence -- <intake-result.json> <approve|reject|revise> <reviewer-id> <reason> [decision-id]
npm test
npm run typecheck
npm run build
npm run start
```

The modules implement explicit memo-scope and research-question approval, bounded question-linked collection and discovery, one-item intake, one-hop source retrieval, lossless source canonicalization, Copilot PoC question relevance, positive-assessment candidate conversion, and the compatibility human admission mode, not the full target workflow. Discovery may run multiple explicit query pages under a hard budget but cannot advance candidates into intake. Retrieval handles one exact URL and cannot create an evidence candidate. Canonicalization creates stable provider-neutral source documents and anchors but makes no semantic judgment. The relevance boundary produces only a proposed assessment and controller-derived route. Re-intake reconstructs only validated positive assessments, verifies complete retrieval and model artifact lineage, and creates a pending candidate. Current policy defaults to `human`; a new policy version may select controller admission without altering existing NV artifacts.

The accepted path now creates a lossless provider-neutral source document, a bounded AI question-relevance artifact grounded in exact `SourceAnchor` references, and a checksum-bound pending candidate only for positive validated assessments. The evidence gate preserves assessment, model, and retrieval lineage in an approved snapshot. The verified real NV snapshot is ready for one-source `Find -> Sweep -> Judge -> Write`.

This change must not lower output quality. Every admitted source still receives independent `Find`, blind `Sweep`, `Judge`, and `Write`; cross-source challenge, Vestas dual-lineage relevance, independent verification, and human publication approval remain required. Similar cases scale through source adapters, immutable per-source state, checksum deduplication, sequential reuse, and later bounded concurrency, not reduced analysis depth.

## Current design artifacts

- Canonical workflow: `02-Engineering/03-Workflow/memo-workflow.md`
- Canonical visual: `02-Engineering/01-Architecture/memo-workflow-board.svg`
- Source assurance detail: `02-Engineering/01-Architecture/source-assurance-goal-loops.svg`
- Script structure: `02-Engineering/01-Architecture/script-architecture.md`
- KISS rules: `02-Engineering/03-Workflow/kiss-reset-plan.md`
- Immediate slice: `02-Engineering/03-Workflow/first-slice.md`
- Legacy PoC boundary: `02-Engineering/00-PoC-Reference/`

Retired V1 references are preserved only for historical comparison:

- `02-Engineering/03-Workflow/memo-workflow-retired-v1.md`
- `02-Engineering/01-Architecture/memo-workflow-board-retired-v1.svg`

The workflow and SVG currently describe:

- Provider-neutral query intent with deterministic adapters.
- Seerist-first collection and optional Firecrawl fallback.
- AI question-relevance proposals before policy admission or exception routing.
- Controller admission under approved policy, with the current human command retained as compatibility mode.
- Per-source Find, blind Sweep, Judge, and Write stages.
- Builder, challenger, and adjudicator synthesis.
- Claim-level memo citations and AI verification.
- Append-only event logging and artifact integrity.
- A deferred V2 Vestas-context tool.

These are design hypotheses. Keep what testing supports; simplify or revise what it does not.

## Remaining open questions

1. Which additional source types can become evidence candidates without external source-page retrieval?
2. How should missing authorship, ambiguous timestamps, and provider references affect eligibility?
3. What compact source support and explanation should the evidence gate show so humans can efficiently verify AI relevance proposals?
4. Do bounded pages remain stable across source types and repeated runs?
5. Which Azure AI Foundry endpoint, model deployment, authentication mode, region, and retention policy will be approved for the live adapter?

## Explicit non-goals for the next agent

- Do not build the final application architecture in one pass.
- Do not implement the chat UI.
- Do not broaden retrieval beyond one exact source URL or add Firecrawl search, crawl, actions, profiles, or LLM formats.
- Do not alter or recreate real decision `nv-evidence-review-001`; it records reviewer `FDIHR` and reason `it fits`.
- Do not add a live model provider until an approved Foundry endpoint and authentication policy are known.
- Preserve the complete source and mandatory `Find -> Sweep -> Judge -> Write`; do not trade intelligence depth for throughput.
- Do not implement the full Find/Sweep/Judge/Write chain yet.
- Do not build the Vestas context database yet.
- Do not treat TypeScript types in the workflow document as settled API contracts.
- Do not import code from the legacy PoC without an accepted mapping note.

## Validation status at handoff

At this handoff:

- The Seerist probe completed 22 successful read-only calls across 12 endpoint paths.
- Findings and the capability board record the observed provider behavior.
- Routing no longer auto-approves content based on narrative wording.
- Production Seerist collection rejects absent, unapproved, late-approved, or mismatched research intent before credential or network access.
- Bounded discovery uses supported `/v1/wod` query variants, limited pagination, integrity assessment, deduplication, deterministic local ranking, and candidate limitation propagation; it surfaced 50 unique URLs for the CIA Director Moscow test.
- AskAnna citation UUIDs are not reproducible through tested `/v1/wod` ID or cluster-ID filters and remain manually supplied leads only.
- Intake reconstructs the exact collection bundle, records raw and manifest checksums, refuses overwrite, and confines all artifacts to the run root.
- Native captured content routes through canonicalization and question relevance and cannot enter evidence admission directly.
- Intake, reporting, approval workflow, and isolated command tests pass.
- The earlier saved analyst-report item is retained only as non-admissible historical output because it has no approved pre-collection question lineage.
- Explicit approval, rejection, and revision-request decisions are implemented; the real NV candidate was approved by `FDIHR`.
- One-source Firecrawl retrieval is implemented with fixed-origin, exact-URL, no-cache-storage, TLS, timeout, size, redirect, checksum, and untrusted-content controls; the live NV check completed successfully on 2026-08-31 without requesting evidence approval.
- Provider-neutral canonicalization is implemented for retrieved and native Seerist content with deterministic IDs, exact UTF-8 anchors, path confinement, non-overwrite behavior, and lossless complete-source retention; the NV retrieval produced a validated 76-segment document.
- Bounded relevance request and response validation is implemented with fixed untrusted-source policy, exact question and source lineage, all four verdict routes, model-authority rejection, and content-safe events. The real NV proposal validated as `partially-relevant` with three exact anchors.
- Retrieved-source re-intake accepts only a validated positive assessment, verifies retrieval, canonical-document, model-request, model-response, assessment, and decision checksums, creates only a pending candidate, and preserves assessment and retrieval lineage through the evidence gate.
- The real NV candidate was approved as `nv-evidence-review-001`; `snapshot-nv-evidence-review-001` preserves its raw, retrieval, model, assessment, and question lineage.
- TypeScript typecheck and build pass.
- Raw provider artifacts remain only in the ignored local `app/runs/` folder.

## Suggested opening prompt

> Read `HANDOFF.md`, `03-Workflow/first-slice.md`, and `02-Contracts/synthesis-build.md`. Human reviewer `FDIHR` completed the NV rows-only support pass; the reviewed note supersedes the provisional note and reviewed metrics are recorded. A reviewed-only Build envelope/request exists with no synthetic input and `limitedEvidence: true`, but its exploratory model output proposed 20 claims and was not recorded. Add a versioned key-claim count/selection bound with tests before a fresh reviewed Build invocation. Do not weaken the historical provisional chain's publication blockers.

## Completed Panel 2 human review

On 2026-09-03, reviewer `FDIHR` completed the reduced rows-only support pass after first exercising the provisional path. All 20 observations were marked supported, no requirement tags were removed, `ir-01`, `ir-03`, and `ir-05` were covered, `ir-02` and `ir-04` were partial, and `ir-06` was silent. The reviewer assessed direct access, established track record, mixed dependency on New York Times and WSJ reporting, and recorded that machine translation was used.

The committed extraction and checksum-bound package remain valid immutable artifacts. A later versioned rows-only review may still supply the 20 support verdicts, corrected IR tags, six requirement dispositions, and source assessment without overwriting them. Because the worksheet has been read, that later pass cannot be represented as a blind omission measurement; `omissionPass` remains `not-performed`, omission count remains `null`, and disposition underclaims remain unmeasured.

`review-response-2.json` produced `review-record-reviewed.json` and reviewed source note `source-note-74bb02e2b47fb9306fd3db1c9be271cb`, which records `supersedesNoteId: source-note-4b98483a7e4dca7d2f30bfc081109a04`. Support failure rate, chrome rate, disposition mismatches, and tag precision are now measured as `0`, `0`, `0`, and `1`; omission count and disposition underclaims remain null because no omission pass was performed.

## Completed provisional artifacts

The following ignored run artifacts now exist:

1. `review/review-response-1.json`: support and omission passes not performed; judgment arrays empty; assessment not assessed.
2. `review/review-record-provisional.json`: 20 `unreviewed` verdicts, zero human observations.
3. `source-note-provisional.json`: `source-note-4b98483a7e4dca7d2f30bfc081109a04`, `reviewStatus: "provisional"`, 19 in-scope and one out-of-IR observation.
4. `metrics-provisional.json`: `reviewStatus: "provisional"`; support failure, chrome, omission, tag precision, and disposition-comparison metrics are all null.
5. `synthesis-inputs/source-note-synthetic-nyt-relay-001.json`: historical synthetic provisional input, retained unchanged because the first envelope checksum-binds it.
6. `synthesis/build-envelope-e766393e34e0489aa1ddadcceb24389b.json`: historical two-note envelope, `reviewStatus: "provisional"`, `limitedEvidence: true`, and no model-authored claims.
7. `synthesis-inputs/source-note-synthetic-nyt-relay-002.json`: successor with non-upgradable `reviewStatus: "synthetic"`.
8. `synthesis/build-envelope-5208b9dc0b37690286a40c0c76f8dabe.json`: attempt 1/2 envelope, `reviewStatus: "synthetic"`, `limitedEvidence: true`.
9. `synthesis/requests/synthesis-build-request-c35ffa85748748b0e6a16502f37ce01b/build-request.json`: model-ready request with 21 qualified aliases.
10. `copilot-response-1.json`: rejected as `INVALID_BUILD_RESPONSE` because the model changed the required schema.
11. `copilot-response-2.json`: rejected as `CLAIM_KIND_EXCEEDS_SUPPORT`.
12. `synthesis/diagnoses/build-diagnosis-001.json`: table-bug discriminator; classifies the failure as prompt-side and forbids stored-proposal revalidation.
13. `synthesis/authorisations/synthesis-build-attempt-authorisation-001.json`: human authorization for a fresh request v2.
14. `synthesis/requests/synthesis-build-request-6db19b40af7face0376c39c4f23b52d5/build-request.json`: v2 request with `authorisation: null`; never executed.
15. `synthesis/build-envelope-d1606fe7ec29ede2f8cad2808bd5be46.json`: authorization-bound attempt 3 envelope, `reviewStatus: "synthetic"`, `limitedEvidence: true`.
16. `synthesis/requests/synthesis-build-request-62da8060c65fc5de8db08fde3b24a56f/build-request.json`: authorization-bound request v2 with per-alias kinds, single-support ceilings, response-shape text, and structural example.
17. `copilot-response-3.json`: respected kind and confidence allowances but renamed required fields and omitted arrays; rejected as `INVALID_BUILD_RESPONSE`.
18. `synthesis/diagnoses/build-diagnosis-002.json`: records the attempt 3 transport/schema failure.
19. `synthesis/authorisations/synthesis-build-attempt-authorisation-002.json`: authorizes fresh request v3; stored response 3 remains non-revalidatable.
20. `synthesis/build-envelope-826885ec9c56edb1dd55e46a6e6ab999.json`: attempt 4 envelope, `reviewStatus: "synthetic"`, `limitedEvidence: true`.
21. `synthesis/requests/synthesis-build-request-9ecd7b7bb1b2611b9ab83e27d8611cb8/build-request.json`: request v3 generated from the strict parser shape.
22. `copilot-response-4.json`: bare-array response using canonical and enumerated alias fields.
23. `synthesis/records/synthesis-build-record-3178655ad59cef55b5d356074c629018/synthesis-build-record.json`: committed Build record with four claims; every claim is provisional, no claim uses synthetic support, all confidence levels and ceilings are low, chain status is synthetic, and `limitedEvidence` is true.
24. `synthesis/diagnoses/build-diagnosis-003.json`: records the clerical failure-class resolution.
25. `synthesis/challenge/requests/synthesis-challenge-request-96c5317148ce49bdf97f230a7e8ceaf6/challenge-request.json`: one request containing four claims and 24 required checklist answers, blind to Build rationale.
26. `copilot-response-1.json`: all 24 answers; initially rejected because it used the clerical `results` plus `challenge: null|object` form.
27. `synthesis/challenge/diagnoses/challenge-diagnosis-001.json`: records complete judgment coverage and the clerical-only mismatch.
28. `synthesis/challenge/authorisations/challenge-revalidation-authorisation-001.json`: authorizes revalidation of that exact stored response under enumerated normalization only.
29. `synthesis/challenge/records/synthesis-challenge-record-18a697c120d7b6a21a772facc12312cd/challenge-record.json`: committed record with 7 challenges from 24 items, `reviewStatus: "synthetic"`, and `limitedEvidence: true`.
30. Sibling `challenge-metrics.json`: challenge rate 7/24; hidden single-source dependence 4, plausible alternatives 3, all other checks 0, upheld-over-raised null.
31. Sibling `provisional-adjudication.json`: `adjudicationStatus: "not-performed"`, seven open challenges, all four claims contested.
32. `src/modules/memo/standards/memo-standard-v0.json`: handwritten provisional eight-section standard with a 350-word final-Markdown limit.
33. `memo/requests/memo-writer-request-cc8e5a4f0fd2f93f5c88aaf35eb74b27/writer-request.json`: writer judgment surface limited to section, text, and claim aliases; approved scope is explicitly null.
34. `copilot-response-1.json`: one BLUF placement and four key-judgment texts; reused unchanged for deterministic rerender corrections.
35. `memo/memo-b79dba75552f68ed7464f8cff937e183/`: retained first rendering, invalidated after final Markdown measured 391 words.
36. `memo/diagnoses/memo-diagnosis-001.json` through `003.json` and matching authorizations: record final-length, duplicate-BLUF, and deterministic-presentation corrections.
37. `memo/memo-3618e06cbddf26e4ed78db6c7b2b95a1/memo.md`: superseding 342-word memo with four contested low-confidence judgments, three hypotheses, and three gaps including silent `ir-06`.
38. Sibling `memo.json`: records `supersedesMemoId`, exact citations/open challenge IDs, synthetic status, limited evidence, source limitations, and cutoff.
39. Sibling `verification.json`: content pass and publication block.
40. Sibling `publication-gate.json`: blocked with human approval unavailable because of synthetic lineage, provisional evidence, provisional v0 standard, and missing approved-scope lineage.
41. `review/review-response-2.json`: completed human support review, no tag corrections, machine translation recorded.
42. `review/review-record-reviewed.json`: 20 supported verdicts, six reviewed requirement dispositions, and human source assessment.
43. `source-note-reviewed.json`: `reviewStatus: "reviewed"`, 19 in-scope and one out-of-IR observation, and supersession of the provisional note.
44. `metrics-reviewed.json`: support failure `0`, chrome `0`, tag precision `1`, disposition mismatches `0`; omission and underclaims null.
45. `synthesis/build-envelope-5807f521b2bbf4c73a23a54e3d9cbdc9.json`: reviewed-only, one-source envelope with `reviewStatus: "reviewed"`, `limitedEvidence: true`, and no synthetic input.
46. `synthesis/requests/synthesis-build-request-0efa5a8aa3ebebc8a8ba5ed74138275e/build-request.json`: reviewed-only model request. An exploratory invocation returned 20 one-observation proposals; it was not recorded because the active contract has no bounded key-claim selection rule.

Interpret the four uniform hidden-single-source challenges as checklist calibration data, not four proven claim defects: dependency is already derived and appears once in sourcing. The three alternative hypotheses are the substantive Challenge yield preserved in the memo.

## Immediate next action

Before recording a reviewed Build response, add a versioned maximum/key-claim selection rule and focused tests. Do not commit an unbounded 20-claim graph that makes the short memo contract impossible. After that bound exists, run a fresh reviewed Build invocation, Challenge, real or explicitly deferred Adjudicate, and writer. Approved scope lineage and an approved memo standard remain separate publication prerequisites.

Organizational relevance, semantic verification, and general orchestration remain deferred.

## Human input still required

Confirm provider rules for retaining raw responses and derived fixtures before committing any provider content. When Foundry access becomes available, provide only non-secret endpoint type, deployment name, authentication policy, API version, region, and retention constraints. Credentials remain local environment configuration and must never be pasted into chat or committed.