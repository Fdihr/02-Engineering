import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from dashboard import bounded_synthesis
from dashboard.server import COPILOT_LOCK, _handle_ai_stage, _handle_analyst_action, _handle_run_ai
from dashboard.model import _build_adjudications, _build_ai_queue, _canonical_run_bindings
from dashboard.journey import _rounds
from dashboard.workflow_projection import project_workflow


class BoundedSynthesisTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.run = self.root / "run-bounded"
        self.run.mkdir()

    def tearDown(self):
        self.temporary.cleanup()

    def test_explicit_start_and_resume_route_to_only_the_bounded_command(self):
        tasks = []
        with patch("dashboard.bounded_synthesis.threading.Thread") as thread, \
                patch("dashboard.server._run_npm_script", return_value={
                    "ok": True, "stdout": 'Execution: {"status":"human-waiting"}', "stderr": "",
                }) as command:
            thread.side_effect = lambda **kwargs: tasks.append(kwargs["target"]) or type("Worker", (), {"start": lambda _: None})()
            status, body = _handle_analyst_action(self.root, self.run, {
                "action": "start-bounded-synthesis", "runId": self.run.name, "reviewerId": "TESTER",
            })
            self.assertEqual(status, 202)
            self.assertTrue(body["ok"])
            self.assertIn(self.run.resolve(), bounded_synthesis.ACTIVE)
            self.assertIsNone(bounded_synthesis.status(self.root / "other-root", self.run.name, command))
            self.assertEqual(_handle_analyst_action(self.root, self.run, {
                "action": "start-bounded-synthesis", "runId": self.run.name, "reviewerId": "TESTER",
            })[0], 409)
            tasks.pop()()
            self.assertEqual(command.call_args.args, ("run:synthesis", ["start", self.run.name, "TESTER"]))
            self.assertEqual(command.call_args.kwargs["runs_root"], self.root)
            self.assertNotIn(self.run.resolve(), bounded_synthesis.ACTIVE)
            self.assertFalse(COPILOT_LOCK.locked())
            directory = self.run / "synthesis" / "execution"
            directory.mkdir(parents=True)
            (directory / "authorization.json").write_text("{}", encoding="utf-8")
            self.assertEqual(_handle_analyst_action(self.root, self.run, {
                "action": "resume-bounded-synthesis", "runId": self.run.name, "reviewerId": "TESTER",
            })[0], 202)
            tasks.pop()()
            self.assertEqual(command.call_args.args, ("run:synthesis", ["resume", self.run.name]))

    def test_missing_analyst_run_or_authorization_cannot_resume(self):
        for payload in [
            {"action": "start-bounded-synthesis", "runId": self.run.name},
            {"action": "start-bounded-synthesis", "runId": "../escape", "reviewerId": "TESTER"},
            {"action": "resume-bounded-synthesis", "runId": self.run.name, "reviewerId": "TESTER"},
        ]:
            with patch("dashboard.bounded_synthesis.threading.Thread") as thread:
                self.assertIn(_handle_analyst_action(self.root, self.run, payload)[0], (400, 409))
                thread.assert_not_called()

    def test_bounded_memo_requires_performed_round_and_uses_active_root(self):
        relative = "synthesis/adjudication/challenge-1/performed-adjudication.json"
        adjudication = self.run / relative
        adjudication.parent.mkdir(parents=True)
        adjudication.write_text("{}", encoding="utf-8")
        tasks = []
        with patch("dashboard.bounded_synthesis.threading.Thread") as thread, \
                patch("dashboard.server._run_npm_script", return_value={
                    "ok": True, "stdout": 'Execution: {"status":"memo-review","pipeline":"memo"}', "stderr": "",
                }) as command:
            thread.side_effect = lambda **kwargs: tasks.append(kwargs["target"]) or type("Worker", (), {"start": lambda _: None})()
            payload = {"action": "start-bounded-memo", "runId": self.run.name, "reviewerId": "TESTER", "adjudicationPath": relative}
            self.assertEqual(_handle_analyst_action(self.root, self.run, {**payload, "adjudicationPath": "../outside.json"})[0], 400)
            self.assertEqual(_handle_analyst_action(self.root, self.run, payload)[0], 202)
            self.assertEqual(bounded_synthesis.status(self.root, self.run.name, command, pipeline="memo")["status"], "starting")
            tasks.pop()()
            self.assertEqual(command.call_args.args, ("run:memo", ["start", self.run.name, "TESTER", str(adjudication.resolve())]))
            self.assertEqual(command.call_args.kwargs["runs_root"], self.root)
            directory = self.run / "memo" / "execution"
            directory.mkdir(parents=True)
            (directory / "authorization.json").write_text("{}", encoding="utf-8")
            self.assertEqual(_handle_analyst_action(self.root, self.run, {**payload, "action": "resume-bounded-memo"})[0], 202)
            tasks.pop()()
            self.assertEqual(command.call_args.args, ("run:memo", ["resume", self.run.name]))
            result = bounded_synthesis.status(self.root, self.run.name, command, pipeline="memo")
            self.assertEqual(result["status"], "memo-review")
            self.assertTrue(result["authorized"])

    def test_manual_memo_calls_recording_and_preparation_cannot_add_authority(self):
        directory = self.run / "memo" / "revisions" / "memo-1"
        directory.mkdir(parents=True)
        (directory / "authorization.json").write_text("{}", encoding="utf-8")
        for request in ("synthesis/key-judgements/requests/k1/key-judgement-request.json",
                        "memo/requests/w1/writer-request.json"):
            payload = {"runId": self.run.name, "reviewerId": "TESTER", "requestPath": request, "freshSession": True}
            with patch("dashboard.server.generate") as generate, patch("dashboard.server._run_npm_script") as command:
                self.assertEqual(_handle_run_ai(self.root, payload)[0], 409)
                self.assertEqual(_handle_ai_stage(self.root, payload)[0], 409)
                self.assertEqual(_handle_analyst_action(self.root, self.run, {
                    "action": "prepare-key-judgements", "runId": self.run.name,
                })[0], 409)
                generate.assert_not_called()
                command.assert_not_called()

    def test_revision_requires_parent_and_explicit_start_and_preserves_receipt_projection(self):
        tasks = []
        payload = {"action": "start-memo-revision", "runId": self.run.name,
                   "memoId": "memo-1", "reviewerId": "EDITOR"}
        with patch("dashboard.bounded_synthesis.threading.Thread") as thread, \
                patch("dashboard.server._run_npm_script", return_value={
                    "ok": True, "stdout": 'Revision: {"status":"memo-review","pipeline":"memo","memoId":"memo-2"}',
                }) as command:
            thread.side_effect = lambda **kwargs: tasks.append(kwargs["target"]) or type("Worker", (), {"start": lambda _: None})()
            self.assertEqual(_handle_analyst_action(self.root, self.run, {**payload, "memoId": "../escape"})[0], 400)
            self.assertEqual(_handle_analyst_action(self.root, self.run, {**payload, "action": "resume-memo-revision"})[0], 409)
            self.assertEqual(_handle_analyst_action(self.root, self.run, payload)[0], 202)
            starting = bounded_synthesis.status(self.root, self.run.name, command, pipeline="revision")
            self.assertEqual(starting["parentMemoId"], "memo-1")
            self.assertEqual(starting["status"], "starting")
            tasks.pop()()
            self.assertEqual(command.call_args.args, ("revise:memo", ["start", self.run.name, "memo-1", "EDITOR"]))
            self.assertEqual(command.call_args.kwargs["runs_root"], self.root)
            authority = self.run / "memo" / "revisions" / "memo-1" / "authorization.json"
            authority.write_text("{}", encoding="utf-8")
            self.assertEqual(_handle_analyst_action(self.root, self.run, {**payload, "action": "resume-memo-revision"})[0], 202)
            tasks.pop()()
            self.assertEqual(command.call_args.args, ("revise:memo", ["resume", self.run.name, "memo-1"]))
            result = bounded_synthesis.status(self.root, self.run.name, command, pipeline="revision")
            self.assertTrue(result["authorized"])
            self.assertEqual(result["memoId"], "memo-2")
            self.assertEqual(result["parentMemoId"], "memo-1")

    def test_memo_projection_replaces_completed_synthesis_handoff_but_keeps_source_work(self):
        def work(identifier, stage):
            return {"id": identifier, "stage": stage, "actor": "machine", "kind": "work",
                    "title": identifier, "detail": "", "paths": [], "priority": 1}
        base = {"runId": self.run.name, "intentApproved": True, "evidenceAvailable": True,
                "readyWork": [work("source:a", "assure"), work("manual:selection", "synthesise"), work("manual:writer", "memo")],
                "committedOutcomes": [], "humanDecisions": [], "interimCheckpoints": [], "blockers": []}
        execution = {"authorized": True, "pipeline": "memo", "workflowInput": {
            **base, "readyWork": [{**work("bounded:memo", "memo"), "actor": "human", "kind": "checkpoint"}],
        }}
        result = project_workflow(bounded_synthesis.compose_workflow(base, execution))
        self.assertEqual({work["id"] for work in result["readyWork"]}, {"source:a", "bounded:memo"})

    def test_read_only_status_uses_typescript_projection_even_on_blocked_exit(self):
        directory = self.run / "synthesis" / "execution"
        directory.mkdir(parents=True)
        (directory / "authorization.json").write_text("{}", encoding="utf-8")
        projection = {"status": "blocked", "error": "Source note checksum changed", "workflow": {
            "status": "blocked", "recommendedNextAction": {"kind": "blocked"},
        }}
        with patch("dashboard.server._run_npm_script") as command:
            command.return_value = {"ok": False, "stdout": "Execution: " + json.dumps(projection), "stderr": ""}
            from dashboard.server import _run_npm_script
            result = bounded_synthesis.status(self.root, self.run.name, _run_npm_script)
        self.assertEqual(result["workflow"], projection["workflow"])
        self.assertEqual(result["error"], projection["error"])
        self.assertTrue(result["authorized"])
        self.assertEqual(command.call_args.args, ("run:synthesis", ["status", self.run.name]))

    def test_matching_adjudication_replaces_stale_bounded_handoff_without_ignoring_blockers(self):
        writing = {"id": "writing", "stage": "memo", "actor": "human", "kind": "decision",
                   "title": "Authorize selection and writing", "detail": "", "paths": [], "priority": 1}
        base = {"runId": self.run.name, "intentApproved": True, "evidenceAvailable": True,
                "readyWork": [writing], "committedOutcomes": [], "humanDecisions": [],
                "interimCheckpoints": [], "blockers": []}
        stale = {**writing, "id": "bounded:adjudication", "stage": "synthesise", "title": "Adjudicate"}
        path = "synthesis/challenge/records/challenge-1/challenge-record.json"
        execution = {"authorized": True, "status": "human-waiting",
                     "stages": {"challenge": {"record": {"artifactRef": str(self.run / path)}}},
                     "workflowInput": {**base, "readyWork": [stale]}}
        observed = {"adjudicationStatus": "adjudicated", "challengeRecordPath": path}
        result = bounded_synthesis.compose_workflow(base, execution, observed)
        self.assertEqual(result["readyWork"], [writing])
        self.assertEqual(project_workflow(result)["recommendedNextAction"]["work"]["title"], writing["title"])
        for update in ({"adjudicationStatus": "pending"}, {"challengeRecordPath": "different.json"}):
            result = bounded_synthesis.compose_workflow(base, execution, {**observed, **update})
            self.assertIn(stale, result["readyWork"])
        blocker = {"id": "integrity", "scope": "unknown", "kind": "integrity", "paths": [],
                   "affectedWorkIds": [], "uncertain": True, "title": "Inspect", "detail": "Changed source"}
        execution["workflowInput"]["blockers"] = [blocker]
        self.assertIn(blocker, bounded_synthesis.compose_workflow(base, execution, observed)["blockers"])
        execution["status"] = "blocked"
        self.assertIn(stale, bounded_synthesis.compose_workflow(base, execution, observed)["readyWork"])

    def test_launcher_failure_is_preserved_and_displayed_without_a_success_fallback(self):
        with patch("dashboard.bounded_synthesis.threading.Thread") as thread:
            task = []
            thread.side_effect = lambda **kwargs: task.append(kwargs["target"]) or type("Worker", (), {"start": lambda _: None})()
            bounded_synthesis.start(self.root, {
                "action": "start-bounded-synthesis", "runId": self.run.name, "reviewerId": "TESTER",
            }, lambda *args, **kwargs: {"stdout": "", "stderr": "Missing Node runtime"}, threading.Lock())
            task[0]()
        result = bounded_synthesis.status(self.root, self.run.name, lambda *args, **kwargs: self.fail("No authority exists"))
        self.assertEqual(result["status"], "blocked")
        self.assertIn("Missing Node runtime", result["error"])
        self.assertFalse(result["authorized"])

    def test_manual_model_action_cannot_bypass_an_active_bounded_authorization(self):
        directory = self.run / "synthesis" / "execution"
        directory.mkdir(parents=True)
        (directory / "authorization.json").write_text("{}", encoding="utf-8")
        with patch("dashboard.server.generate") as generate:
            result = _handle_run_ai(self.root, {
                "runId": self.run.name, "reviewerId": "TESTER",
                "requestPath": "synthesis/requests/request-1/build-request.json",
            })
        self.assertEqual(result[0], 409)
        self.assertIn("cannot add call authority", result[1]["error"])
        generate.assert_not_called()
        request = self.run / "synthesis" / "requests" / "request-1" / "build-request.json"
        request.parent.mkdir(parents=True)
        request.write_text("{}", encoding="utf-8")
        status, body = _handle_ai_stage(self.root, {
            "runId": self.run.name, "reviewerId": "TESTER",
            "requestPath": "synthesis/requests/request-1/build-request.json", "answer": '{"claims":[]}', "freshSession": True,
        })
        self.assertEqual(status, 409)
        self.assertIn("Manual paste-back cannot replace", body["error"])

    def test_status_bridge_failure_is_explicit_even_after_authorization(self):
        directory = self.run / "synthesis" / "execution"
        directory.mkdir(parents=True)
        (directory / "authorization.json").write_text("{}", encoding="utf-8")
        (directory / "launcher-failure-fixture.json").write_text(
            json.dumps({"error": "Worker timed out; inspect saved authority."}), encoding="utf-8")
        result = bounded_synthesis.status(self.root, self.run.name, lambda *args, **kwargs: {
            "stdout": "", "stderr": "Status process unavailable",
        })
        self.assertEqual(result["status"], "blocked")
        self.assertIn("Status process unavailable", result["error"])
        self.assertIn("Worker timed out", result["launcherError"])
        self.assertTrue(result["authorized"])

    def test_bounded_projection_preserves_unrelated_work_and_scopes_exceptions_with_shared_selector(self):
        def work(identifier, stage):
            return {"id": identifier, "stage": stage, "actor": "machine", "kind": "work",
                    "title": identifier, "detail": "", "paths": [], "priority": 1}
        base = {
            "runId": self.run.name, "intentApproved": True, "evidenceAvailable": True,
            "readyWork": [work("source:a", "assure"), work("source:b", "assure"), work("manual:build", "synthesise")],
            "committedOutcomes": [], "humanDecisions": [], "interimCheckpoints": [],
            "blockers": [{"id": "exception-a", "kind": "exception", "scope": "work", "uncertain": False,
                          "paths": [], "affectedWorkIds": ["source:a"], "title": "Source A", "detail": ""}],
        }
        bounded = {
            **base, "readyWork": [work("bounded:build", "synthesise")],
            "blockers": [{**base["blockers"][0], "affectedWorkIds": []}],
        }
        result = project_workflow(bounded_synthesis.compose_workflow(base, {
            "authorized": True, "workflowInput": bounded,
        }))
        self.assertEqual({work["id"] for work in result["readyWork"]}, {"source:b", "bounded:build"})
        self.assertEqual(result["blockers"][0]["affectedWorkIds"], ["source:a"])
        bounded["blockers"][0]["scope"] = "unknown"
        bounded["blockers"][0]["uncertain"] = True
        self.assertEqual(project_workflow(bounded_synthesis.compose_workflow(base, {
            "authorized": True, "workflowInput": bounded,
        }))["status"], "blocked")

    def test_reservation_or_validation_receipts_are_not_committed_model_work(self):
        request = "synthesis/requests/build-1/build-request.json"
        binding = {"artifactRef": f"runs/{self.run.name}/{request}", "artifactSha256": "a" * 64}
        documents = {
            request: {"preparedAt": "2026-01-01T00:00:00Z"},
            "synthesis/execution/build/reserved.json": {"request": binding},
            "synthesis/execution/build/validated.json": {"request": binding},
        }
        self.assertEqual(_build_ai_queue(self.run.name, documents)[0]["status"], "awaiting-ai")
        documents["synthesis/records/build-1/synthesis-build-record.json"] = {"request": binding}
        self.assertEqual(_build_ai_queue(self.run.name, documents)[0]["status"], "recorded")

    def test_isolated_run_root_keeps_recorded_work_and_human_handoff_connected(self):
        request = "synthesis/requests/build-1/build-request.json"
        build = "synthesis/records/build-1/synthesis-build-record.json"
        challenge = "synthesis/challenge/records/challenge-1/challenge-record.json"
        documents = {
            request: {"preparedAt": "2026-01-01T00:00:00Z"},
            build: {"recordedAt": "2026-01-01T00:00:01Z", "request": {"artifactRef": str(self.run / request)},
                    "synthesis": {"claims": [{"id": "claim-1", "statement": "A review was announced."}]}},
            challenge: {"recordedAt": "2026-01-01T00:00:02Z", "buildRecord": {"artifactRef": str(self.run / build)},
                        "results": [], "metrics": {"challengesRaised": 0}},
        }
        normalized = _canonical_run_bindings(documents, self.run.name, str(self.run), set(documents))
        self.assertEqual(documents[build]["request"]["artifactRef"], str(self.run / request), "Persisted lineage is not mutated")
        self.assertEqual(_build_ai_queue(self.run.name, normalized)[0]["status"], "recorded")
        adjudications = _build_adjudications(self.run.name, normalized)
        self.assertEqual(len(adjudications[0]["claims"]), 1)
        self.assertEqual(adjudications[0]["status"], "awaiting-adjudication")
        rounds, _ = _rounds(self.run.name, normalized, adjudications, _build_ai_queue(self.run.name, normalized))
        self.assertEqual(next(step for step in rounds[0]["steps"] if step["key"] == "challenge")["state"], "done")
        self.assertEqual(next(step for step in rounds[0]["steps"] if step["key"] == "adjudicate")["state"], "you")
        outside = {"artifactRef": str(self.root / "elsewhere" / request)}
        self.assertEqual(_canonical_run_bindings(outside, self.run.name, str(self.run), set(documents)), outside)

    def test_app_relative_bindings_connect_only_known_artifacts_in_the_active_run(self):
        app = Path(__file__).resolve().parent.parent
        build = "synthesis/records/build-1/synthesis-build-record.json"
        request = "synthesis/requests/build-1/build-request.json"
        challenge = "synthesis/challenge/records/challenge-1/challenge-record.json"
        ref = lambda path: os.path.relpath(path, app).replace("\\", "/")
        documents = {
            request: {"preparedAt": "2026-01-01T00:00:00Z"},
            build: {"recordedAt": "2026-01-01T00:00:01Z",
                    "request": {"artifactRef": ref(self.run / request)},
                    "synthesis": {"claims": [{"id": "claim-1", "statement": "A review was announced."}]}},
            challenge: {"recordedAt": "2026-01-01T00:00:02Z",
                        "buildRecord": {"artifactRef": ref(self.run / build)},
                        "results": [], "metrics": {"challengesRaised": 0}},
        }
        original = json.dumps(documents)
        normalized = _canonical_run_bindings(documents, self.run.name, str(self.run), set(documents))
        self.assertEqual(json.dumps(documents), original)
        self.assertEqual(_build_ai_queue(self.run.name, normalized)[0]["status"], "recorded")
        adjudications = _build_adjudications(self.run.name, normalized)
        self.assertEqual(len(adjudications[0]["claims"]), 1)
        rounds, _ = _rounds(self.run.name, normalized, adjudications, _build_ai_queue(self.run.name, normalized))
        self.assertEqual(rounds[0]["challengeStatus"], "checked")
        self.assertEqual(next(step for step in rounds[0]["steps"] if step["key"] == "adjudicate")["state"], "you")
        for path in [self.root / "elsewhere" / build, self.run / "missing.json"]:
            with self.subTest(path=path):
                binding = {"artifactRef": ref(path)}
                self.assertEqual(_canonical_run_bindings(binding, self.run.name, str(self.run), set(documents)), binding)


if __name__ == "__main__":
    unittest.main()
