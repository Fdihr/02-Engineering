# Execution Plan: Europe 2-Month Cyber & Geopolitical Analysis with Vestas Relevance

Date: 2026-10-26
Status: Planned; collection leads are blocked pending the RSS-connected source list, and new native-content candidate conversion remains incremental work.
Reference Board: `01-Architecture/memo-workflow-board.svg`
Target Workflow: `03-Workflow/memo-workflow.md`
Implemented Baseline: `03-Workflow/first-slice.md`

## Objective

Produce an end-to-end, evidence-grounded intelligence memo analyzing the last two months of cyber and geopolitical activity in Europe and what it means for Vestas, using:

1. Live Seerist API discovery and collection (`/v1/wod`); collection leads wait for the planned RSS-connected source list without fetching publisher pages.
2. Deterministic canonicalization, question-relevance validation, and evidence admission (Panel 1).
3. Stage-owned source assurance producing reviewed `source-note.json` artifacts with anchored observations and IR dispositions (Panel 2).
4. Cross-source synthesis (`Build -> Challenge -> Adjudicate`) sealing external facts first (Panel 3).
5. Governed Vestas organizational context (`OrganizationalContextPack`) and dual-lineage `OrganizationalRelevanceAssessment` (Panel 3).
6. Bounded key-judgement selection (`KJ1-KJ8`), `Memo Writer v2`, deterministic quality verification, human publication gate, and live inspection in the Python ECS run dashboard (`app/dashboard/`).

---

## Current Baseline vs. `memo-workflow-board.svg`

- **Panel 1 (Intent, collection, and admission):** Intent, collection, native-content canonicalization and relevance are implemented. Publisher-page retrieval and retrieved-source candidate conversion are retired. Existing candidates retain compatibility admission; new native-content candidate conversion is not yet implemented.
- **Panel 2 (Stage-owned source assurance):** Complete through `Extract`, exact-span quote locator, rows-only review, source note assembly, and metrics (`prepare:assurance-extract`, `record:assurance-extract`, `prepare:assurance-review`, `record:assurance-review`, `assemble:assurance`, `measure:assurance`).
- **Panel 3 (Synthesis, relevance, quality, and publication):**
  - Implemented: `Build`, `Challenge`, `Adjudicate`, bounded `Key Judgements` (`KJ1-KJ8`), `Memo Writer v2`, deterministic verification, and publication calibration.
  - To implement in Stage 5–6: Governed `OrganizationalContextPack` and `OrganizationalRelevanceAssessment` commands (`prepare:org-relevance`, `record:org-relevance`) plus wiring organizational relevance sections into `Memo Writer v2`.
- **Panel 4 (Foundation & Observability):** `npm run run:next -- <run-id>` and the standalone Python ECS run viewer (`app/dashboard/`) are operational.

---

## Step-by-Step Execution Plan

### Stage 1 — Intent Gate: Europe 2-Month Cyber & Geopolitical Scope (`Panel 1`)

- **Goal:** Create and approve the memo scope, research question, and Information Requirements (IRs) for the new run (e.g., `europe-cyber-geopol-2026`).
- **Scope parameters:**
  - **Geographies:** Europe (or priority European countries where Vestas operates, e.g., Denmark, Germany, Poland, UK, Baltic states).
  - **Time window:** Last 2 months rolling from run start.
  - **Topic:** Cyber and geopolitical activity in Europe and implications for Vestas operations, supply chain, and energy infrastructure.
  - **Organizational relevance:** Explicitly enabled in scope.
- **Commands:**
  ```powershell
  npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
  npm run prepare:research-question -- <approved-memo-scope.json>
  npm run record:research-question-draft -- <research-question-draft-request.json> <copilot-response.json>
  npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
  npm run approve:requirements -- <requirements-proposal.json> <approved-research-question.json> <reviewer-id>
  ```
- **Done when:** Approved scope, research question, and IR artifacts exist in `app/runs/<run-id>/` and are visible in the ECS dashboard.

---

### Stage 2 — Seerist API Collection, Discovery & Source Canonicalization (`Panel 1`)

- **Goal:** Collect bounded European cyber and geopolitical material from Seerist, classify provider items, canonicalize sources, and admit relevant evidence.
- **Steps:**
  1. Execute bounded Seerist `/v1/wod` discovery and collection across the 2-month European window.
  2. Classify returned Seerist items (`intake:seerist`):
     - Native Seerist analyst reports with full bodies route directly to `canonicalize:source`.
     - Collection leads with publisher URLs route to `pending_rss_source`; publisher pages are not fetched.
  3. Run AI question-relevance (`prepare:question-relevance` -> `record:question-relevance`) for captured content. This cannot itself create a new evidence candidate; native-content candidate conversion remains incremental work. Existing validated candidates retain explicit admission.
- **Commands:**
  ```powershell
  npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
  npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
  npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
  npm run canonicalize:source -- <source-retrieval-result.json|seerist-intake-result.json>
  npm run prepare:question-relevance -- <source-document.json>
  npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
  npm run review:evidence -- <intake-result.json> approve <reviewer-id> <reason> [decision-id]
  ```
- **Done when:** Multiple independent European sources are canonicalized and admitted as `approved-evidence-snapshot.json` artifacts.

---

### Stage 3 — Source Assurance Loop (`Panel 2`)

- **Goal:** Extract anchored atomic observations and IR coverage dispositions (`covered`, `partial`, `silent`, `contradicted`) for each admitted source and assemble reviewed `source-note.json` artifacts.
- **Commands:**
  ```powershell
  npm run prepare:assurance-extract -- <approved-evidence-snapshot.json> <approved-requirements.json> <profile-policy.json>
  npm run record:assurance-extract -- <extract-request.json> <copilot-response.json>
  npm run prepare:assurance-review -- <extract-commit.json>
  npm run record:assurance-review -- <review-package.json> <review-response.json>
  npm run assemble:assurance -- <approved-evidence-snapshot.json> <extract-commit.json> <review-record.json>
  npm run measure:assurance -- <source-note.json> <extract-stage-directory> <review-record.json>
  ```
- **Done when:** Every admitted source has a reviewed `source-note.json` and measured assurance metrics with zero unresolved anchor errors.

---

### Stage 4 — External Claim Synthesis: Build, Challenge & Adjudicate (`Panel 3`)

- **Goal:** Synthesize external cyber and geopolitical claims across the reviewed source notes, challenge them for single-source dependence, overstatement, or alternatives, and record performed adjudication.
- **Commands:**
  ```powershell
  npm run prepare:synthesis-build -- <build-envelope.json>
  npm run record:synthesis-build -- <build-request.json> <copilot-response.json>
  npm run prepare:synthesis-challenge -- <build-record.json>
  npm run record:synthesis-challenge -- <challenge-request.json> <copilot-response.json>
  ```
- **Done when:** `build-record.json`, `challenge-record.json`, and `performed-adjudication.json` are committed with external claims sealed before organizational context enters.

---

### Stage 5 — Implement Vestas Organizational Context Pack & Dual-Lineage Relevance (`Panel 3`)

- **Goal:** Implement the governed Vestas context and organizational relevance stage from Part 7 of `03-Workflow/memo-workflow.md`.
- **Implementation deliverables:**
  1. **Contract & module (`app/src/modules/relevance/` or `app/src/modules/context/`):**
     - `OrganizationalContextRecord` and `OrganizationalContextPack` validators (typed `country`, `entity`, and `technology` keys, validity window, classification, SHA-256 lineage).
     - Deterministic key-overlap pre-selector matching adjudicated external claims against governed Vestas context records (manufacturing/service sites, wind/OT/SCADA assets, European grid and logistics dependencies).
     - `OrganizationalRelevanceAssessment` validator enforcing dual lineage on every `exposure` and `consequence` pathway (`externalClaimId` + `contextRecordId` + `mechanism` + `touchpoint` + `horizon`).
  2. **Commands:**
     - `npm run prepare:org-relevance -- <build-record.json> <performed-adjudication.json> <org-context-pack.json> <approved-scope.json>`
     - `npm run record:org-relevance -- <org-relevance-request.json> <copilot-response.json>`
  3. **Tests:** Focused unit and command tests verifying deterministic key matching, dual-lineage enforcement, and rejection of unanchored Vestas claims.
- **Done when:** `npm test`, `npm run typecheck`, and `npm run build` pass, and the Europe run produces a committed `org-relevance-record.json`.

---

### Stage 6 — Key Judgements & Memo Writer with "What It Means for Vestas" (`Panel 3`)

- **Goal:** Select bounded key judgements (`KJ1-KJ8`, max 3 under `memo-standard-v1`) and produce the canonical memo combining external European intelligence with dual-lineage Vestas implications.
- **Steps:**
  1. Run `prepare:key-judgements` -> `record:key-judgements` on the adjudicated external claim graph.
  2. Extend `prepare:memo-writer` and `record:memo-writer` to accept the committed `org-relevance-record.json` when organizational relevance is required by scope, rendering `organizationalRelevance` sections with strict dual-lineage verification (`externalClaimIds` + `relevanceAssessmentIds`).
- **Commands:**
  ```powershell
  npm run prepare:key-judgements -- <build-record.json> <challenge-record.json> <performed-adjudication.json> <memo-standard-v1.json>
  npm run record:key-judgements -- <key-judgement-request.json> <copilot-response.json>
  npm run prepare:memo-writer -- <build-record.json> <challenge-record.json> <performed-adjudication.json> <key-judgement-record.json> <approved-question.json> <memo-standard-v1.json> [org-relevance-record.json]
  npm run record:memo-writer -- <writer-request.json> <copilot-response.json>
  ```
- **Done when:** Canonical JSON and Markdown memo draft are committed with verified external citations and dual-lineage Vestas relevance pathways.

---

### Stage 7 — Quality Verification, Publication Gate & Live ECS Dashboard (`Panel 3 & 4`)

- **Goal:** Verify all deterministic quality rules, complete the human publication gate and random observation calibration sample (`N=5`), and inspect the complete run in the Python ECS dashboard.
- **Commands:**
  ```powershell
  npm run run:next -- <run-id>
  ..\.venv\Scripts\python.exe -m dashboard.server --run-dir runs/<run-id>
  ```
- **Done when:** Deterministic quality verification passes with 0 blocking failures, publication decision is recorded, and the complete memo and lineage are browsable in the ECS dashboard.
