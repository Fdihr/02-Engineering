# 02-Engineering
Evidence-Grounded Memo Tool Engineering Workspace

This workspace builds a general memo tool that combines the approved Seerist API surface with OSINT search, discovery, and source retrieval. Cyber threat intelligence is the first validated memo profile, not the limit of the product. The domain-neutral core is designed to support other Seerist-backed research and risk memos without weakening evidence, review, or citation controls.

The target product may use all Seerist endpoints approved for organizational use. The current executable baseline is deliberately narrower: it has validated bounded `/v1/wod` collection and discovery plus one-hop exact-URL OSINT retrieval. Each additional endpoint or OSINT mechanism must be observed, assigned an evidence/context/lead role, and added through a tested adapter.

Start with:

1. `HANDOFF.md` for current status and the next accepted action.
2. `03-Workflow/first-slice.md` for the completed implementation baseline.
3. `02-Contracts/contract-index.md` for active cross-module contracts.
4. `01-Architecture/script-architecture.md` for script and dependency boundaries.
5. `03-Workflow/seerist-probe-findings.md` for observed provider behavior.
6. `03-Workflow/memo-workflow.md` for the canonical target architecture.

Retired V1 workflow artifacts use the explicit `retired-v1` suffix and are historical reference only.
