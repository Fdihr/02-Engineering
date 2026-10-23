import json
import tempfile
import unittest
from pathlib import Path

from dashboard.scan import read_artifact_text, resolve_inside_run, scan_run_directory


class ScanTests(unittest.TestCase):
    def test_scan_reads_bounded_json_and_events(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "nested").mkdir()
            (root / "nested" / "item.json").write_text('{"ok":true}', encoding="utf-8")
            (root / "events.jsonl").write_text('{"eventType":"complete"}\n', encoding="utf-8")
            scan = scan_run_directory(root)
            self.assertFalse(scan["truncated"])
            self.assertEqual(len(scan["jsons"]), 1)
            self.assertEqual(scan["jsons"][0]["value"], {"ok": True})
            self.assertEqual(scan["events"][0]["lines"], ['{"eventType":"complete"}'])

    def test_scan_marks_entry_limit_and_resolves_artifact_paths_safely(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "inside.txt").write_text("inside", encoding="utf-8")
            (root / "other.txt").write_text("other", encoding="utf-8")
            scan = scan_run_directory(root, {"maxEntries": 1})
            self.assertTrue(scan["truncated"])
            self.assertIsNone(resolve_inside_run(root, "../outside"))
            self.assertIsNone(resolve_inside_run(root, str(root / "inside.txt")))
            safe = resolve_inside_run(root, "inside.txt")
            self.assertIsNotNone(safe)
            self.assertEqual(read_artifact_text(safe, 100), "inside")
            self.assertIsNone(read_artifact_text(safe, 2))


if __name__ == "__main__":
    unittest.main()
