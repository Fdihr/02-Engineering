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

`design_system.css` is the token and base-style source for this dashboard and future server-rendered pages. `run_view.css` contains only dashboard-specific layout and component rules. Vestas Sans fonts and the white Vestas logo are local assets; no external requests or Python packages are required.

The run selector switches between sibling run directories. Three panels mirror the workflow board: intent/collection/admission, source assurance, and synthesis/publication. Artifact presence is an inspection hint, not an authoritative workflow transition. Shared event logs are filtered by exact run identity.

`POST /api/action` supports explicit intent approval for a new run, bounded Seerist discovery, candidate intake/retrieval, and `run:next`. These actions can write artifacts or make provider calls. They delegate validation and approval recording to the TypeScript commands; they do not automate the full analysis loop. Existing runs cannot be overwritten by intent submission. Partial command failures retain completed artifacts and must be inspected before retrying.

Action requests require JSON and a local same-origin host. Keep the localhost binding. Artifact reads remain confined to the selected run, and scans are bounded. Source assurance still uses the documented interim review process; Vestas context ingestion and full model execution remain future work.
