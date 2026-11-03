# Python run dashboard

A dependency-free analyst workspace. The workflow remains in the TypeScript app; Python displays run artifacts and delegates explicit analyst actions to existing commands.

From `app/`, start it with:

```powershell
..\.venv\Scripts\python.exe -m dashboard.server runs/qti-2026-q3
```

The server binds to `127.0.0.1:4317` by default. Options: `--run-id`, `--port`, and `--host`. Keep the default localhost binding when viewing provider content.

Run the tests from `app/`:

```powershell
python -m unittest discover -s dashboard -p "test_*.py" -v
```

`design_system.css` is the token and base-style source for this dashboard and future server-rendered pages. `run_view.css` contains only dashboard-specific layout and component rules. `run_view.js` holds the shell, Settings and AI execution controls; `run_panes.js` holds the Brief, Sources, Synthesis, Memo and Audit tabs. Vestas Sans fonts and the white Vestas logo are local assets. Rendering needs no external requests or Python packages; explicit Copilot and collection actions require network access.

The workbench is organised around the analyst's job, not the artefact tree. `journey.py` derives, from persisted artefacts only, six phases (frame, collect, admit evidence, assure sources, synthesise, memo), one ordered work queue (each item says whether you decide, run Copilot or execute deterministic work), a lifecycle per source (lead → retrieved → relevance → admitted → extracted → reviewed → in synthesis, with duplicate retrievals of one lead collapsed), synthesis rounds (build → challenge → adjudicate → key judgements → memo, with superseded rounds marked), and the latest memo with claim → source → quote traces and plain-language publication blockers. The Audit tab keeps the file-inferred artefact board, exceptions and events. Nothing in the projection advances the workflow.

`POST /api/action` supports explicit scope approval and question drafting, final question/requirements approval, bounded Seerist discovery, provider item classification, analyst decisions, local Copilot execution or manual paste-back for each AI stage, re-preparing a key-judgement or memo-writer request when the automatic chain did not, and `run:next`. Publisher pages are not fetched. Collection leads stay pending until the planned RSS-connected source list is implemented; native captured provider content can still be canonicalized and assessed for relevance. Recording relevance no longer creates a retrieved-source candidate automatically. These actions delegate validation and approval recording to TypeScript commands; they do not automate the full analysis loop. A scope-approved run can resume question drafting or complete question approval only against the same approved scope. Existing approvals cannot be overwritten. Partial command failures retain completed artifacts and must be inspected before retrying.

## Local Copilot and model settings

Install the app dependencies with `npm install`. The pinned `@github/copilot-sdk` includes a platform runtime; a separate CLI executable on PATH is not needed to run it. Use a supported Node.js version (20.19+ or 22.12+). The runtime uses the PC's existing Copilot sign-in and subscription; if it reports an authentication error, sign in through GitHub Copilot CLI locally, then use **Settings -> Refresh models**. No API key is stored in this app.

Choose **Settings -> Model for all AI stages -> Save model**. The chooser reads the live account catalog, and saving checks availability again. The selected ID is persisted in `<runs-root>/.copilot-settings.json` (ignored with `app/runs` by default). This one setting controls research-question drafting, relevance, extraction, Build, Challenge, key judgements and memo writing. An unavailable model fails explicitly; no fallback or Auto model is silently substituted.

On a new analysis, enter the thesis and scope, confirm scope approval, and choose **Approve scope and draft with Copilot**. The returned question and rationale remain editable proposals. Approve the question and requirements separately before collection. **Continue question drafting** resumes a scope-approved analysis after a reload; changing its approved scope requires a new analysis ID. Requirements and search suggestions remain explicitly labelled lens-based templates, not model-generated output.

At subsequent AI tasks, **Run with Copilot** starts a fresh, tool-disabled SDK session and feeds the answer through the same deterministic recorder as the manual fallback. The SDK runs in empty mode without plugins, inherited instructions, skills, hooks, MCP servers, file access or permission grants. Runtime setup and generation are time-bounded. Model output never performs an evidence review, source review, adjudication or publication approval.

The request directory retains `copilot-invocation-*.json` with raw output, session/model/timestamps and the exact request checksum, including when JSON validation fails. Successful answers also produce the stage's normal response and record artifacts. Only one automatic generation runs per dashboard process at a time; recorded requests cannot be automatically rerun. Keep one dashboard process per run root. Manual copy/paste remains a secondary fallback, honestly recording unknown legacy model identity.

Action requests require JSON and a local same-origin host. Keep the localhost binding. Artifact reads remain confined to the selected run, and scans are bounded. Source assurance still uses the documented interim review process; Vestas context ingestion remains future work.
