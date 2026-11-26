# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Intelligence and risk analysts producing decision-ready threat, geopolitical, physical-security, and supply-chain memos for organizational leadership (first validated profile: cyber threat intelligence for Vestas leadership). They work on desktop browsers under tight operational deadlines and want to spend their attention judging the research framing and the finished intelligence memo—not clicking through intermediate pipeline plumbing.

## Product Purpose

CTI Bench turns an approved intelligence question into a short, traceable, evidence-grounded memo over the approved Seerist API surface plus bounded OSINT/RSS retrieval. Success means an analyst approves a research plan at the start, lets the machine run end-to-end without mid-run human stops, and reviews a finished memo draft where every statement links directly to its claim, verbatim source quote, caveats, and original publisher URL before one-click publication.

## Positioning

AI proposes; deterministic code governs provenance. Every stage—research planning, question-relevance screening, observation extraction, cross-source synthesis, adversarial challenge, key-judgement selection, and memo drafting—is checked by deterministic TypeScript validators for scope/window lineage, exact UTF-8 byte-offset quote anchors, confidence ceilings, open challenge caveats, and word/structure rules.

## Operating Context

- **Two human gates per memo:**
  1. **Approve Plan & Generate Memo (`#/new`):** Enter thesis, optionally adjust deliverable/audience/geography/time window, review/edit AI-drafted intelligence requirements and search queries, and launch the bounded end-to-end run.
  2. **Review Memo & Publish (`#/memo` / `#/analysis`):** Read the finished memo draft in an editorial desktop workspace, click any inline citation or statement to inspect the exact supporting quote, challenge caveats, and external source URL, then **Approve & Publish**, **Request Revision** (bounded editorial rewrite), or **Reject**.
- **Automated middle pipeline:** Bounded Seerist `/v1/wod` collection (ingesting full-text analyst items plus up to 6 external news/OSINT article fetches by default), canonicalization, relevance screening (logging `partially-relevant` and `not-relevant` items as coverage gaps without halting), byte-anchored observation extraction, cross-source synthesis build, adversarial challenge, deterministic caveat adjudication, uncontested-preferring key-judgement selection, memo drafting with automatic 1-shot length repair, and deterministic verification.
- **Settings (`#/settings`):** Visualizes the workflow stages so operators can bind each AI reasoning stage to a GitHub Copilot SDK model today and Azure AI Foundry endpoints next, plus manage Seerist API and Microsoft Entra SSO settings.

## Capabilities and Constraints

- Desktop-first operational and editorial web interface (`app/dashboard/`), backed by strict TypeScript ESM domain/workflow modules (`app/src/`).
- Human approval boundaries remain cryptographic and version-bound at Plan Approval and Publication; model output alone never publishes a memo.
- Open challenge caveats on claims or single-source key judgements are carried visibly into the memo rather than silently dropped or used to hard-deadlock the run; only integrity violations (synthetic lineage, missing scope lineage, provisional memo standard) block publication.
- Credentials (`SEERIST_API_KEY`, Entra IDs, Foundry endpoint) remain write-only/env-governed and never appear in artifacts or UI responses.

## Brand Commitments

- **Vestas "weather window" design system (`app/dashboard/design_system.css`):** Vestas Sans typography, Night Sky (`#1f3144`) top navigation bar, Blue Sky (`#005aff`) primary interactive accent, rules-not-boxes structural discipline, and full light/dark theme parity.
- Direct, analytical, evidence-led copy with zero marketing fluff or operational jargon.

## Evidence on Hand

- Approved memo standard `app/src/modules/memo/standards/memo-standard-v3.json` curated from real internal intelligence reporting.
- Verified live Seerist `/v1/wod` adapter, exact-URL OSINT article collector (`collect:article`), RSS batch adapter (`rss:batch`), and deterministic byte-anchor/lineage validators under `app/src/modules/`.
- Do not fabricate intelligence sources, quotes, customer claims, or Foundry live connectivity before an endpoint is configured.

## Product Principles

1. **Two human moments, zero busywork:** Analysts decide what to ask and whether the finished memo is fit to publish; deterministic validators—not manual quote quizzes or mid-run forms—police the steps between.
2. **Every sentence opens its source:** Any claim in a draft or published memo is one click from the verbatim canonical quote, source metadata, challenge caveats, and original publisher link.
3. **Caveats surface, runs finish:** Single-source dependencies, partial relevance, and adversarial challenges become explicit intelligence gaps and bounded-confidence caveats in the memo rather than pipeline dead-ends.
4. **Explicit stage governance:** Every AI reasoning step has an inspectable model binding and hard numeric call/fetch budgets recorded in run artifacts.
