# Python run dashboard

A dependency-free, read-only run viewer. The workflow remains in the TypeScript app; this standalone Python package only scans and displays an existing run directory.

From `app/`, start it with:

```powershell
python -m dashboard.server ../runs/your-run-directory
```

The server binds to `127.0.0.1:4317` by default. Options: `--run-id`, `--port`, and `--host`. Keep the default localhost binding when viewing provider content.

Run the tests from `app/`:

```powershell
python -m unittest discover -s dashboard -p "test_*.py" -v
```

`design_system.css` is the token and base-style source for this dashboard and future server-rendered pages. `run_view.css` contains only dashboard-specific layout and component rules. Vestas Sans fonts and the white Vestas logo are local assets; no external requests or Python packages are required.

The viewer supports GET routes only, confines artefact reads to the selected run directory, and bounds directory scans and file reads. It has no workflow authority and never writes to a run.
