import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dashboard import memo_review
from dashboard.server import _handle_analyst_action


class MemoReviewTests(unittest.TestCase):
    def test_action_forwards_exact_payload_and_active_root_without_retaining_temporary_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = {"action": "record-memo-review", "runId": "run-1", "memoId": "memo-1",
                       "reviewerId": "REVIEWER", "target": {"memo": {"artifactSha256": "a" * 64}},
                       "decision": "revision-requested", "issueType": "evidence-gap", "feedback": "Close the gap.",
                       "sampledVerdicts": [], "drillDownVerdicts": []}
            paths = []

            def command(name, args, **kwargs):
                self.assertEqual(name, "review:memo")
                self.assertEqual(args[:3], ["record", "run-1", "memo-1"])
                self.assertEqual(kwargs["runs_root"], root)
                path = Path(args[3])
                paths.append(path)
                value = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(value["target"], payload["target"])
                self.assertEqual(value["reviewerId"], "REVIEWER")
                return {"ok": True, "stdout": 'Review: {"path":"decision.json"}'}

            with patch("dashboard.server._run_npm_script", side_effect=command):
                status, result = _handle_analyst_action(root, root / "run-1", payload)
            self.assertEqual(status, 200)
            self.assertTrue(result["ok"])
            self.assertFalse(paths[0].exists())

    def test_missing_reviewer_and_command_failure_cannot_report_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("dashboard.server._run_npm_script") as command:
                status, _ = _handle_analyst_action(root, root, {"action": "record-memo-review", "runId": "run-1", "memoId": "memo-1"})
                self.assertEqual(status, 400)
                command.assert_not_called()
            failed = lambda *args, **kwargs: {"ok": False, "stderr": "STALE_MEMO_REVIEW"}
            self.assertEqual(memo_review.record(root, {"runId": "run-1", "memoId": "memo-1", "reviewerId": "REVIEWER"}, failed)[0], 409)
            status = memo_review.status(root, "run-1", "memo-1", failed)
            self.assertFalse(status["approvalAvailable"])
            self.assertEqual(status["decisionStatus"], "unavailable")

    def test_missing_receipt_is_not_success(self):
        with tempfile.TemporaryDirectory() as directory:
            value = memo_review.status(Path(directory), "run-1", "memo-1", lambda *args, **kwargs: {"ok": True, "stdout": ""})
            self.assertIn("no receipt", value["error"])
