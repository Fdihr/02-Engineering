# Python run dashboard

A local analyst workspace. The workflow remains in the TypeScript app; Python displays run artifacts and delegates explicit analyst actions to existing commands. Entra authentication is an optional dependency, enabled only when valid tenant and client IDs are configured.

From `app/`, start it with:

```powershell
..\.venv\Scripts\python.exe -m dashboard.server runs/qti-2026-q3
```

The server binds to `127.0.0.1:4317` by default. Options: `--run-id`, `--port`, and `--host`. Keep the default localhost binding when viewing provider content.

Run the tests from `app/`:

```powershell
python -m unittest discover -s dashboard -p "test_*.py" -v
```

`design_system.css` is the token and base-style source for this dashboard and future server-rendered pages. `run_view.css` contains only dashboard-specific layout and component rules. `run_view.js` holds the shell (navigation, actions, the copy-prompt/paste-answer AI step) and `run_panes.js` the Brief, Sources, Synthesis, Memo and Audit tabs. Vestas Sans fonts and the white Vestas logo are local assets; no external requests or Python packages are required.

The workbench is organised around the analyst's job, not the artefact tree. `journey.py` derives, from committed artefacts only, six phases (frame, collect, admit evidence, assure sources, synthesise, memo), one ordered work queue (each item says whether you decide or paste an AI answer), a lifecycle per source (lead → pending RSS source list → relevance → admitted → extracted → reviewed → in synthesis; historical retrieval artifacts remain readable), synthesis rounds (build → challenge → adjudicate → key judgements → memo, with superseded rounds marked), and the latest memo with claim → source → quote traces and plain-language publication blockers. The Audit tab keeps the file-inferred artefact board, exceptions and events. Nothing in the projection advances the workflow.

`POST /api/action` supports explicit intent approval for a new run, bounded Seerist discovery, candidate classification, the analyst decisions and pasted AI answers for each stage, re-preparing a key-judgement or memo-writer request when the automatic chain did not, and `run:next`. Collection leads stay pending until the planned RSS-connected source list is implemented; the dashboard no longer fetches publisher pages. Settings can store Seerist credentials, Microsoft Entra tenant/application IDs, and an Azure AI Foundry HTTPS endpoint in Windows user environment variables. Once both Entra IDs are configured, the loopback-only dashboard requires tenant-restricted sign-in; first sign-in provisions workbench access for an existing tenant account. Entra accounts remain managed in Microsoft Entra, session data stays in memory, and signing out or restarting the server clears the local session. Configure the Entra app as a public client with `http://localhost` as a redirect URI and delegated `User.Read` permission. The dashboard refuses non-loopback bindings while Entra sign-in is enabled. Foundry model calls are not implemented. Other actions can write artifacts or make provider calls. They delegate validation and approval recording to the TypeScript commands; they do not automate the full analysis loop. Existing runs cannot be overwritten by intent submission. Partial command failures retain completed artifacts and must be inspected before retrying.

Install the optional sign-in dependency from `app/` before running the dashboard with Entra configured:

```powershell
python -m pip install -r dashboard/requirements.txt
```

Action requests require JSON and a local same-origin host. Keep the localhost binding. Artifact reads remain confined to the selected run, and scans are bounded. Source assurance still uses the documented interim review process; Vestas context ingestion and full model execution remain future work.


## Navigation and demo run

The page is a hash-routed shell: `#/home` (default), `#/new`, `#/intent`, `#/analysis/evidence`, `#/analysis/findings`, `#/review`, `#/output` and `#/audit`. Home lists the decisions waiting for you and the AI steps ready to run; run windows show the question and an activity strip. The static concepts in `concepts/` use their own frozen `concepts/legacy-run_view.css`.

`make_demo_run.py` builds a synthetic run for viewing and testing the dashboard without Seerist or model calls (plus a sibling `-framed` run so the analysis list has two entries). It refuses to overwrite a directory that lacks its `.demo-run` marker.

```powershell
py -m dashboard.make_demo_run
py -m dashboard.server "$env:TEMP\cti-demo-runs\demo-run" --port 4317
```