"""Local-only HTTP server for the read-only run dashboard."""
from __future__ import annotations

import argparse
import html
import json
import re
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from string import Template
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .model import build_run_view
from .scan import read_artifact_text, resolve_inside_run, scan_run_directory

DASHBOARD_DIR = Path(__file__).resolve().parent
MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
FONT_FILES = {
    "/assets/vestas/VestasSans_Light.otf": ("VestasSans_Light.otf", "font/otf"),
    "/assets/vestas/VestasSans_Standard.otf": ("VestasSans_Standard.otf", "font/otf"),
    "/assets/vestas/VestasSans_Medium.otf": ("VestasSans_Medium.otf", "font/otf"),
}
STATIC_FILES = {
    "/design_system.css": (DASHBOARD_DIR / "design_system.css", "text/css; charset=utf-8"),
    "/run_view.css": (DASHBOARD_DIR / "run_view.css", "text/css; charset=utf-8"),
    "/assets/vestas/Vestas_White.svg": (DASHBOARD_DIR / "assets" / "vestas" / "Vestas_White.svg", "image/svg+xml"),
}


def render_page(run_id: str, poll_ms: int = 2000) -> str:
    safe_id = re.sub(r"[^a-zA-Z0-9._-]", "", run_id)
    template = Template((DASHBOARD_DIR / "page.html").read_text(encoding="utf-8"))
    return template.substitute(run_id=html.escape(safe_id, quote=True), poll_ms=max(500, int(poll_ms)))


def _make_handler(run_dir: Path, run_id: str, cache_ms: int) -> type[BaseHTTPRequestHandler]:
    cache: dict[str, Any] = {"at": 0.0, "view": None}
    cache_lock = threading.Lock()

    class DashboardHandler(BaseHTTPRequestHandler):
        server_version = "ReadOnlyRunView/1.0"
        sys_version = ""

        def _send(self, status: int, content_type: str, body: bytes | str, extra_headers: dict[str, str] | None = None) -> None:
            payload = body.encode("utf-8") if isinstance(body, str) else body
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; object-src 'none'; base-uri 'none'")
            if extra_headers:
                for key, value in extra_headers.items():
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(payload)

        def _current_view(self) -> dict[str, Any]:
            now = time.monotonic()
            with cache_lock:
                if cache["view"] is not None and now - cache["at"] < cache_ms / 1000:
                    return cache["view"]
                scan = scan_run_directory(run_dir)
                scanned_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                view = build_run_view(run_id, scan["files"], scan["jsons"], scan["events"], scanned_at)
                view["truncated"] = scan["truncated"]
                cache.update(at=time.monotonic(), view=view)
                return view

        def do_GET(self) -> None:
            parsed = urlsplit(self.path)
            if parsed.path == "/":
                self._send(200, "text/html; charset=utf-8", render_page(run_id))
                return
            if parsed.path == "/api/run":
                self._send(200, "application/json; charset=utf-8", json.dumps(self._current_view(), ensure_ascii=False))
                return
            if parsed.path == "/api/artifact":
                rel_path = parse_qs(parsed.query).get("path", [""])[0]
                absolute = resolve_inside_run(run_dir, rel_path)
                if absolute is None:
                    self._send(403, "text/plain; charset=utf-8", "Outside the run root")
                    return
                content = read_artifact_text(absolute, MAX_ARTIFACT_BYTES)
                if content is None:
                    self._send(404, "text/plain; charset=utf-8", "Artefact not available")
                    return
                content_type = "application/json; charset=utf-8" if rel_path.endswith(".json") else "text/plain; charset=utf-8"
                self._send(200, content_type, content)
                return
            if parsed.path in STATIC_FILES:
                file_path, content_type = STATIC_FILES[parsed.path]
            elif parsed.path in FONT_FILES:
                filename, content_type = FONT_FILES[parsed.path]
                file_path = DASHBOARD_DIR / "assets" / "vestas" / filename
            else:
                self._send(404, "text/plain; charset=utf-8", "Not found")
                return
            try:
                self._send(200, content_type, file_path.read_bytes())
            except OSError:
                self._send(404, "text/plain; charset=utf-8", "Asset not available")

        def _method_not_allowed(self) -> None:
            self._send(405, "text/plain; charset=utf-8", "Read-only", {"Allow": "GET"})

        def do_POST(self) -> None:
            self._method_not_allowed()

        def do_PUT(self) -> None:
            self._method_not_allowed()

        def do_PATCH(self) -> None:
            self._method_not_allowed()

        def do_DELETE(self) -> None:
            self._method_not_allowed()

        def do_OPTIONS(self) -> None:
            self._method_not_allowed()

        def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
            if code == 501:
                self._method_not_allowed()
                return
            super().send_error(code, message, explain)

    return DashboardHandler


def create_server(
    run_dir: str | Path,
    run_id: str | None = None,
    host: str = "127.0.0.1",
    port: int = 4317,
    cache_ms: int = 1500,
) -> ThreadingHTTPServer:
    resolved_run_dir = Path(run_dir).resolve()
    selected_id = run_id or resolved_run_dir.name
    handler = _make_handler(resolved_run_dir, selected_id, max(0, cache_ms))
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve a read-only dashboard for one run directory.")
    parser.add_argument("run_dir", help="Path to an existing run directory")
    parser.add_argument("--run-id", help="Display name (defaults to the directory name)")
    parser.add_argument("--port", type=int, default=4317)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    server = create_server(args.run_dir, args.run_id, args.host, args.port)
    address, port = server.server_address[:2]
    print(f"Read-only run view: http://{address}:{port}/  run={args.run_id or Path(args.run_dir).resolve().name}  dir={Path(args.run_dir).resolve()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
