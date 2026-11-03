---
name: startcti
description: Start or reuse the redesigned CTI Bench dashboard and open it in the integrated browser. Use for /startcti or requests to open or launch this repository's app.
---

# Start CTI Bench

Open the redesigned, live Python dashboard, not the legacy workbench, the
TypeScript command help, or the static interface concepts.

1. Check for an existing dashboard before launching another process. Inspect
   active session/server information when available. Probe loopback ports 4317
   and 4318; prefer the current workspace's server when more than one exists.
   Do not assume that HTTP 200 means the right UI is running.
2. Verify the served HTML has the redesigned navigation markers
   `id="nav-home"` and `href="#/home"`, and loads `/run_view.js`.
   Check that `/run_view.js` is JavaScript using `location.hash`.
   A static `/concepts/` page is not the live application. If authentication
   redirects to sign-in, verify the server's checkout has these markers and
   open its sign-in flow without bypassing authentication.
3. If a verified dashboard is already running, reuse it. Do not start a
   duplicate or stop a server owned by another session.
4. If no redesigned dashboard is running, inspect
   `app\dashboard\README.md` and `app\dashboard\page.html` in the current
   workspace. Require the same redesigned navigation markers before starting.
   If this checkout only contains the legacy UI, report that clearly and
   locate the session containing the redesign; do not silently launch the old
   UI, switch branches, merge changes, or delete dashboard files.
5. To start the redesigned dashboard on Windows, run from `app\`:

   ```powershell
   py -3 -u -m dashboard.server runs\live --host 127.0.0.1 --port 4317
   ```

   Prefer an existing configured run directory over `runs\live` if one is
   documented for this workspace. Check the Python launcher first; use an
   available workspace virtual environment if appropriate. Do not assume
   `python` resolves to an installed interpreter. If port 4317 is occupied,
   use an available loopback port and preserve that exact URL.

   Keep the server running for the user's browser using a detached process
   when supported, or a persistent visible terminal. Verify it responds and
   passes the redesigned UI checks before claiming it is ready.
6. Discover the Browser canvas schema and open the verified server's
   `/#/home` URL in the integrated browser. Use `read_page` to confirm that the
   redesigned application or its sign-in screen rendered. Report the exact
   URL; if blocked, state the blocker rather than opening a legacy fallback.

Opening the app must not submit research intent, run collection, create demo
evidence, or advance analyst approval gates.
