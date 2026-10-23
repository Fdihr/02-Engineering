import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dashboard.server import create_server


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.temp_dir.name)
        snapshot = self.run_dir / "assurance" / "snapshot-test-001"
        (snapshot / "extract" / "attempt-1").mkdir(parents=True)
        (snapshot / "extract" / "attempt-1" / "checks.json").write_text('{"failures":[]}', encoding="utf-8")
        (snapshot / "extract" / "extract-commit.json").write_text('{"schemaVersion":"extract-v1"}', encoding="utf-8")
        (snapshot / "events.jsonl").write_text('{"occurredAt":"2026-09-07T00:00:00Z","eventType":"extract-recorded"}\n', encoding="utf-8")
        (self.run_dir / "note.json").write_text('{"safe":true}', encoding="utf-8")
        self.server = create_server(self.run_dir, "test-run", port=0, cache_ms=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def test_page_serves_ecs_assets_and_run_api(self):
        with urlopen(self.base + "/") as response:
            page = response.read().decode("utf-8")
            self.assertEqual(response.status, 200)
        self.assertIn("lang=\"en-GB\"", page)
        self.assertIn("Dark theme", page)
        self.assertIn("/design_system.css", page)

        with urlopen(self.base + "/design_system.css") as response:
            design_css = response.read().decode("utf-8")
        self.assertIn("--canvas: #ffffff", design_css)
        self.assertIn(".dark", design_css)
        with urlopen(self.base + "/assets/vestas/VestasSans_Standard.otf") as response:
            self.assertEqual(response.status, 200)
            self.assertGreater(len(response.read()), 1000)
        with urlopen(self.base + "/assets/vestas/Vestas_White.svg") as response:
            self.assertIn("<svg", response.read().decode("utf-8"))

        with urlopen(self.base + "/api/run") as response:
            view = json.loads(response.read())
        self.assertEqual(view["runId"], "test-run")
        self.assertEqual(view["sources"][0]["snapshotId"], "snapshot-test-001")
        self.assertEqual(view["counts"]["events"], 1)

    def test_artifacts_are_confined_and_server_rejects_writes(self):
        with urlopen(self.base + "/api/artifact?" + urlencode({"path": "note.json"})) as response:
            self.assertEqual(json.loads(response.read()), {"safe": True})
        escape_url = self.base + "/api/artifact?" + urlencode({"path": "../outside.txt"})
        with self.assertRaises(HTTPError) as escape:
            urlopen(escape_url)
        self.assertEqual(escape.exception.code, 403)
        with self.assertRaises(HTTPError) as post:
            urlopen(Request(self.base + "/api/run", method="POST"))
        self.assertEqual(post.exception.code, 405)
        self.assertEqual(post.exception.headers.get("Allow"), "GET")


if __name__ == "__main__":
    unittest.main()
