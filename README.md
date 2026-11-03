# 02-Engineering
Evidence-Grounded Memo Tool Engineering Workspace

This workspace builds a general memo tool that combines the approved Seerist API surface with OSINT search, discovery, and source retrieval. Cyber threat intelligence is the first validated memo profile, not the limit of the product. The domain-neutral core is designed to support other Seerist-backed research and risk memos without weakening evidence, review, or citation controls.

The target product may use all Seerist endpoints approved for organizational use. The current executable baseline is deliberately narrower: bounded `/v1/wod` collection and discovery plus canonicalization of captured provider content. Collection leads remain pending until the planned RSS-connected source list is available; publisher pages are not fetched. Each additional endpoint or OSINT mechanism must be observed, assigned an evidence/context/lead role, and added through a tested adapter.

Start with:

1. `HANDOFF.md` for current status and the next accepted action.
2. `03-Workflow/first-slice.md` for the completed implementation baseline.
3. `02-Contracts/contract-index.md` for active cross-module contracts.
4. `01-Architecture/script-architecture.md` for script and dependency boundaries.
5. `03-Workflow/seerist-probe-findings.md` for observed provider behavior.
6. `03-Workflow/memo-workflow.md` for the canonical target architecture.

Retired V1 workflow artifacts use the explicit `retired-v1` suffix and are historical reference only.

## Open the dashboard

Use `/startcti` in Copilot to open the redesigned CTI Bench dashboard in the
integrated browser. The repository skill reuses a verified running dashboard
or starts one from a checkout containing the redesigned UI. It rejects the
legacy workbench and static concept pages instead of treating any localhost
response as the current app.

The skill is repository-local. Reload repository skills or start a new session
after adding or renaming it; an already-running session may not discover it
until its skill catalog refreshes.

## Live-provider configuration

Use Node.js 22.9 or newer and run npm commands from `app/`. Collection,
discovery, and probing require `SEERIST_API_KEY`.

The live-provider scripts optionally load `.env` from the repository root
(`..\.env` when running from `app/`). Existing process environment variables
take precedence. A missing file does not prevent startup, but the commands
still reject missing credentials before making provider requests.

Git worktrees do not include an ignored `.env` from another checkout. Configure
credentials in the process environment or create a private `.env` in this
worktree's root using `.env.example` as the template. Do not commit credentials.
After configuring credentials, rerun the failed discovery command; the successful
scope, question, and requirements approvals do not need to be repeated.
