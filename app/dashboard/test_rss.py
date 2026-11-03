import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from dashboard import rss
from dashboard.copilot import CopilotError
from dashboard.model import build_run_view


class InlineThread:
    def __init__(self, *, target, **kwargs):
        self.target = target

    def start(self):
        self.target()


class RssBatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.run = self.root / "run-1"
        question = self.run / "research-questions" / "q-1" / "approved-research-question.json"
        question.parent.mkdir(parents=True)
        question.write_text("{}", encoding="utf-8")
        self.payload = {
            "runId": "run-1", "questionId": "q-1", "feedId": "feed-1", "reviewerId": "operator",
            "maxItems": 1, "permissionReference": "test-permission-review", "approvePolicy": True,
        }
        self.lock = threading.Lock()
        self.commands = []
        self.calls = []
        self.items = ["rss-" + "a" * 64]

    def command(self, script, args, **kwargs):
        self.commands.append((script, args, kwargs))
        if script == "collect:rss":
            path = self.run / "capture.json"
            path.write_text("{}", encoding="utf-8")
        elif script == "rss:batch" and args[0] == "prepare":
            path = Path(args[2]).parent / "selection.json"
            path.write_text(json.dumps({"itemIds": self.items}), encoding="utf-8")
        elif script == "canonicalize:source":
            path = self.run / "document.json"
            path.write_text("{}", encoding="utf-8")
        elif script == "prepare:question-relevance":
            path = self.run / "request.json"
            path.write_text("{}", encoding="utf-8")
        else:
            return {"ok": True, "stdout": "Outcome: approved", "stderr": ""}
        label = "RSS capture" if script == "collect:rss" else "Output"
        return {"ok": True, "stdout": f"{label}: {path}", "stderr": ""}

    def ai(self, root, payload):
        self.calls.append(payload)
        path = self.run / "assessment.json"
        path.write_text("{}", encoding="utf-8")
        return 200, {"ok": True, "steps": [{"ok": True, "stdout": f"Output: {path}", "stderr": ""}]}

    def start(self, command=None, ai=None):
        with patch.object(rss, "feeds", return_value=[{"id": "feed-1", "name": "Test", "url": "https://test.invalid"}]), \
                patch.object(rss.threading, "Thread", InlineThread):
            return rss.start_batch(self.root, self.payload, command or self.command, ai or self.ai, self.lock)

    def result(self):
        return json.loads(next(self.run.glob("rss-batches/*/result.json")).read_text(encoding="utf-8"))

    def test_explicit_approval_permissions_and_budgets_precede_io(self):
        for key, value in [("approvePolicy", False), ("permissionReference", ""), ("maxItems", 0), ("maxItems", 6), ("maxItems", True)]:
            original = self.payload[key]
            self.payload[key] = value
            status, body = self.start()
            self.assertEqual(status, 400, body)
            self.assertFalse(self.commands)
            self.assertFalse((self.run / "rss-batches").exists())
            self.payload[key] = original

    def test_complete_batch_stops_after_admission_and_releases_lock(self):
        status, response = self.start()
        self.assertEqual(status, 202)
        result = self.result()
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["outcomes"], [{"itemId": self.items[0], "outcome": "approved"}])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual([entry[0] for entry in self.commands],
                         ["collect:rss", "rss:batch", "canonicalize:source", "prepare:question-relevance", "rss:batch"])
        self.assertTrue(all(entry[2]["runs_root"] == self.root for entry in self.commands))
        self.assertFalse(self.lock.locked())
        self.assertNotIn(response["batchId"], rss.ACTIVE)

    def test_invalid_or_over_budget_selection_never_calls_model(self):
        self.items *= 2
        self.start()
        self.assertEqual(self.result()["status"], "failed")
        self.assertIn("budget", self.result()["error"])
        self.assertEqual(self.calls, [])
        self.assertFalse(self.lock.locked())

    def test_provider_failure_preserves_explicit_failed_result(self):
        self.start(command=lambda *args, **kwargs: {"ok": False, "stderr": "HTTP unavailable", "stdout": ""})
        self.assertEqual(self.result()["status"], "failed")
        self.assertIn("HTTP unavailable", self.result()["error"])
        self.assertEqual(self.calls, [])
        self.assertFalse(self.lock.locked())

    def test_model_failure_never_admits_and_releases_lock(self):
        def fail(*args):
            raise CopilotError("Model transport failed")
        self.start(ai=fail)
        self.assertEqual(self.result()["status"], "failed")
        self.assertIn("Model transport failed", self.result()["error"])
        self.assertEqual(len(self.commands), 4)
        self.assertFalse(self.lock.locked())

    def test_concurrent_batch_is_rejected_before_collection(self):
        self.lock.acquire()
        status, body = self.start()
        self.assertEqual(status, 409)
        self.assertFalse(self.commands)
        self.lock.release()

    def test_empty_eligible_selection_makes_no_model_calls(self):
        self.items = []
        self.start()
        self.assertEqual(self.result()["status"], "completed")
        self.assertEqual(self.calls, [])
        self.assertEqual(len(self.commands), 2)

    def test_metadata_index_projects_rss_items_without_large_bodies_or_invented_evidence(self):
        path = "rss-batches/b-1/capture-index.json"
        index = {
            "schemaVersion": "rss-capture-index-v1", "feed": {"name": "Test feed"},
            "items": [
                {"id": "rss-a", "title": "Deferred source", "articleUrl": "https://example.org/a",
                 "contentStatus": "captured-feed-text", "timeStatus": "in-window"},
                {"id": "rss-b", "title": "Metadata lead", "articleUrl": "https://example.org/b",
                 "contentStatus": "lead-only", "timeStatus": "in-window"},
            ],
        }
        view = build_run_view("run-1", [{"relPath": path, "size": 500, "mtimeMs": 0}],
                              [{"relPath": path, "value": index}], [], "t")
        rows = view["journey"]["sources"]
        self.assertEqual({row["title"] for row in rows}, {"Deferred source", "Metadata lead"})
        self.assertTrue(all(not row["snapshotId"] for row in rows))
        self.assertEqual(view["journey"]["evidenceWorkspace"]["pipeline"]["capturedSources"]["count"], 0)
        self.assertFalse(any(row["state"] == "failed" for row in rows))

    def test_inspected_recovery_keeps_original_failure_and_projects_completion_receipt(self):
        prefix = "rss-batches/b-1"
        values = {
            prefix + "/policy.json": {"id": "b-1", "approvedAt": "2026-01-01"},
            prefix + "/result.json": {"status": "failed", "error": "Output label mismatch"},
            prefix + "/recovery-result.json": {"status": "completed", "outcomes": [{"outcome": "exception"}]},
        }
        batch = rss.project(values)["batches"][0]
        self.assertEqual(batch["status"], "completed")
        self.assertTrue(batch["recovered"])
        self.assertEqual(batch["resultPath"], prefix + "/recovery-result.json")
        self.assertEqual(values[prefix + "/result.json"]["status"], "failed")

    def test_controller_event_resolves_rss_candidate_under_a_custom_run_root(self):
        path = "source-reintakes/rss-candidate-a/intake-result.json"
        intake = {
            "item": {"provider": "rss", "rssLineage": {"itemId": "rss-a"},
                     "source": {"title": "Feed text", "publisherHost": "example.org"},
                     "questionRelevance": {"assessment": {"verdict": "relevant", "support": []}}},
            "decision": {"approvalStatus": "pending_human_review"},
        }
        event = {
            "decisionId": "rss-a", "sourceRunId": "run-1", "actorId": "controller:rss-batch-policy-v1:b-1",
            "occurredAt": "2026-01-02T00:00:00Z", "stage": "evidence_admission", "status": "completed",
            "intakeArtifactRef": f"../custom-root/run-1/{path}", "eventType": "evidence.admission.approved",
            "snapshotId": "snapshot-rss-a",
        }
        view = build_run_view("run-1", [{"relPath": path, "size": 500, "mtimeMs": 0}],
                              [{"relPath": path, "value": intake}],
                              [{"relPath": "evidence-events.jsonl", "lines": [json.dumps(event)]}], "t")
        self.assertEqual(view["counts"]["pendingEvidence"], 0)
        self.assertEqual(view["evidenceReview"][0]["decision"]["outcome"], "approved")
        self.assertEqual(view["journey"]["sources"][0]["snapshotId"], "snapshot-rss-a")


if __name__ == "__main__":
    unittest.main()
