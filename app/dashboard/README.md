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

`design_system.css` is the token and base-style source for this dashboard and future server-rendered pages. `run_view.css` contains only dashboard-specific layout and component rules. `run_view.js` holds the shell (navigation, actions, the copy-prompt/paste-answer AI step) and `run_panes.js` the Brief, Sources, Synthesis, Memo and Audit tabs. Vestas Sans fonts and the white Vestas logo are local assets; no external requests or Python packages are required.

The workbench is organised around the analyst's job, not the artefact tree. `journey.py` derives, from committed artefacts only, six phases (frame, collect, admit evidence, assure sources, synthesise, memo), one ordered work queue (each item says whether you decide or paste an AI answer), a lifecycle per source (lead → retrieved → relevance → admitted → extracted → reviewed → in synthesis, with duplicate retrievals of one lead collapsed), synthesis rounds (build → challenge → adjudicate → key judgements → memo, with superseded rounds marked), and the latest memo with claim → source → quote traces and plain-language publication blockers. The Audit tab keeps the file-inferred artefact board, exceptions and events. Nothing in the projection advances the workflow.

`POST /api/action` supports explicit intent approval for a new run, bounded Seerist discovery, candidate intake/retrieval, the analyst decisions and pasted AI answers for each stage, re-preparing a key-judgement or memo-writer request when the automatic chain did not, and `run:next`. These actions can write artifacts or make provider calls. They delegate validation and approval recording to the TypeScript commands; they do not automate the full analysis loop. Existing runs cannot be overwritten by intent submission. Partial command failures retain completed artifacts and must be inspected before retrying.

Action requests require JSON and a local same-origin host. Keep the localhost binding. Artifact reads remain confined to the selected run, and scans are bounded. Source assurance still uses the documented interim review process; Vestas context ingestion and full model execution remain future work.
