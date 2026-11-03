import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from dashboard.copilot import COPILOT_PROVIDER, STAGE_IDS, CopilotError, call_copilot, generate, load_settings, resolve_model, save_model
from dashboard.server import COPILOT_LOCK, STAGE_RESPONSES, _handle_analyst_action


def invocation(content='{"statements": []}'):
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        "provider": "github-copilot-sdk", "model": "test-model", "invocationId": "session-1",
        "startedAt": now, "completedAt": now, "freshSession": True, "content": content,
    }


class CopilotTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_settings_are_explicit_persistent_and_checked_against_catalog(self):
        self.assertEqual(load_settings(self.root), {"model": None, "stages": {}})
        with patch("dashboard.copilot.available_models", return_value=[{"id": "test-model", "name": "Test"}]):
            with self.assertRaises(CopilotError):
                save_model(self.root, "missing")
            save_model(self.root, "test-model")
        self.assertEqual(load_settings(self.root), {"model": "test-model", "stages": {}})
        self.assertEqual(list(self.root.glob("*.tmp")), [])
        (self.root / ".copilot-settings.json").write_text("invalid", encoding="utf-8")
        with self.assertRaisesRegex(CopilotError, "saved model"):
            load_settings(self.root)

    def test_legacy_default_is_inherited_by_every_stage(self):
        (self.root / ".copilot-settings.json").write_text('{"model":"test-model"}', encoding="utf-8")
        for stage in STAGE_IDS:
            self.assertEqual(resolve_model(self.root, stage), "test-model")
        with self.assertRaisesRegex(CopilotError, "Unknown AI stage"):
            resolve_model(self.root, "publication-approval")

    def test_overrides_persist_without_changing_other_stages_and_can_be_reset(self):
        catalog = [{"id": name, "name": name} for name in ("default", "reasoning", "new-default")]
        stages = {"challenge": {"provider": COPILOT_PROVIDER, "model": "reasoning"}}
        with patch("dashboard.copilot.available_models", return_value=catalog):
            self.assertEqual(save_model(self.root, "default", stages), {"model": "default", "stages": stages})
            save_model(self.root, "new-default")  # Legacy callers retain overrides.
            self.assertEqual(load_settings(self.root)["stages"], stages)
            for stage in STAGE_IDS:
                self.assertEqual(resolve_model(self.root, stage), "reasoning" if stage == "challenge" else "new-default")
            save_model(self.root, "new-default", {})
        self.assertEqual(resolve_model(self.root, "challenge"), "new-default")
        self.assertEqual(list(self.root.glob("*.tmp")), [])

    def test_invalid_assignments_never_replace_saved_settings(self):
        catalog = [{"id": "test-model", "name": "Test"}]
        with patch("dashboard.copilot.available_models", return_value=catalog):
            save_model(self.root, "test-model", {})
            original = (self.root / ".copilot-settings.json").read_bytes()
            invalid = [
                [],
                {"approval": {"provider": COPILOT_PROVIDER, "model": "test-model"}},
                {"challenge": {"provider": "azure-ai-foundry", "model": "deployment"}},
                {"challenge": {"provider": COPILOT_PROVIDER, "model": "unavailable"}},
                {"challenge": {"provider": COPILOT_PROVIDER, "model": ""}},
                {"challenge": {"model": "test-model"}},
                {"challenge": None},
            ]
            for stages in invalid:
                with self.subTest(stages=stages), self.assertRaises(CopilotError):
                    save_model(self.root, "test-model", stages)
                self.assertEqual((self.root / ".copilot-settings.json").read_bytes(), original)
            with patch("dashboard.copilot.available_models", side_effect=CopilotError("Sign in required")):
                with self.assertRaisesRegex(CopilotError, "Sign in"):
                    save_model(self.root, "test-model", {})
            self.assertEqual((self.root / ".copilot-settings.json").read_bytes(), original)

    def test_corrupt_or_future_provider_assignments_cannot_silently_use_default(self):
        for stages in (None, [], {"challenge": {"provider": "azure-ai-foundry", "model": "deployment"}}):
            (self.root / ".copilot-settings.json").write_text(json.dumps({"model": "test-model", "stages": stages}), encoding="utf-8")
            with patch("dashboard.copilot.call_copilot") as transport:
                with self.assertRaises(CopilotError):
                    generate(self.root, {"system": "s", "user": "u"}, "challenge")
                transport.assert_not_called()

    def test_generation_routes_every_stage_to_its_override_and_retains_provenance(self):
        stages = {stage: {"provider": COPILOT_PROVIDER, "model": stage + "-model"} for stage in STAGE_IDS}
        (self.root / ".copilot-settings.json").write_text(json.dumps({"model": "default", "stages": stages}), encoding="utf-8")
        for stage in STAGE_IDS:
            with self.subTest(stage=stage), patch("dashboard.copilot.call_copilot", return_value={**invocation(), "model": stage + "-model"}) as transport:
                result = generate(self.root, {"system": "s", "user": "u"}, stage)
                self.assertEqual(transport.call_args.args[0]["model"], stage + "-model")
                self.assertEqual(result["stage"], stage)
                self.assertEqual(result["provider"], COPILOT_PROVIDER)
        with patch("dashboard.copilot.call_copilot", side_effect=CopilotError("Model unavailable")) as transport:
            with self.assertRaisesRegex(CopilotError, "unavailable"):
                generate(self.root, {"system": "s", "user": "u"}, "challenge")
            transport.assert_called_once()  # No retry with the default.

    def test_transport_uses_stdin_and_reports_runtime_and_timeout_failures(self):
        with patch("dashboard.copilot.subprocess.run") as runner:
            runner.return_value = subprocess.CompletedProcess([], 0, '{"models":[]}', "")
            self.assertEqual(call_copilot({"action": "models"}), {"models": []})
            self.assertEqual(json.loads(runner.call_args.kwargs["input"]), {"action": "models"})
            self.assertNotIn("models", runner.call_args.args[0])
            runner.return_value = subprocess.CompletedProcess([], 1, "", "Sign in required")
            with self.assertRaisesRegex(CopilotError, "Sign in required"):
                call_copilot({"action": "models"})
            runner.side_effect = subprocess.TimeoutExpired("node", 210)
            with self.assertRaisesRegex(CopilotError, "timed out"):
                call_copilot({"action": "models"})

    def test_generation_never_selects_an_implicit_or_different_model(self):
        with patch("dashboard.copilot.call_copilot") as transport:
            with self.assertRaisesRegex(CopilotError, "Settings"):
                generate(self.root, {"system": "s", "user": "u"}, "build")
            transport.assert_not_called()
            (self.root / ".copilot-settings.json").write_text('{"model":"test-model"}', encoding="utf-8")
            transport.return_value = invocation()
            self.assertEqual(generate(self.root, {"system": "s", "user": "u"}, "build")["model"], "test-model")
            self.assertEqual(transport.call_args.args[0]["model"], "test-model")
            transport.return_value = {**invocation(), "model": "another-model"}
            with self.assertRaisesRegex(CopilotError, "provenance"):
                generate(self.root, {"system": "s", "user": "u"}, "build")

    def test_all_automatic_stages_preserve_sdk_provenance_and_record_once(self):
        paths = {
            "extract": "assurance/s1/extract/attempt-1/extract-request.json",
            "build": "synthesis/requests/b1/build-request.json",
            "challenge": "synthesis/challenge/requests/c1/challenge-request.json",
            "key-judgements": "synthesis/key-judgements/requests/k1/key-judgement-request.json",
            "memo-writer": "memo/requests/w1/writer-request.json",
        }
        for stage, rel in paths.items():
            with self.subTest(stage=stage):
                run = self.root / stage
                request = run / rel
                request.parent.mkdir(parents=True)
                request.write_text(json.dumps({"id": "request-1", "snapshotId": "s1", "preparedAt": "2026-01-01T00:00:00.000Z", "prompt": {"system": "s", "user": "u"}}), encoding="utf-8")
                payload = {"action": "run-ai-stage", "runId": stage, "reviewerId": "analyst", "requestPath": rel}
                step = {"ok": True, "command": "record", "stdout": "", "stderr": ""}
                with patch("dashboard.server.generate", return_value=invocation()) as transport, \
                        patch("dashboard.server._run_npm_script", return_value=step) as record, \
                        patch("dashboard.server._chain_after_stage", return_value=[]):
                    status, result = _handle_analyst_action(self.root, run, payload)
                    self.assertEqual(status, 200, result)
                    self.assertEqual(record.call_args.args[0], STAGE_RESPONSES[stage][1])
                    self.assertEqual(_handle_analyst_action(self.root, run, payload)[0], 409)
                    transport.assert_called_once()
                    self.assertEqual(transport.call_args.args[2], stage)
                response = json.loads(next(request.parent.glob("copilot-response-*.json")).read_text(encoding="utf-8"))
                self.assertEqual(response["provider"], "github-copilot-sdk")
                self.assertEqual(response["model"], "test-model")
                self.assertEqual(response["capturedBy"], "analyst")
                self.assertTrue(response["freshSession"])
                receipt = json.loads(next(request.parent.glob("copilot-invocation-*.json")).read_text(encoding="utf-8"))
                self.assertEqual(receipt["content"], invocation()["content"])
                self.assertEqual(receipt["stage"], stage)
                self.assertEqual(len(receipt["requestArtifactSha256"]), 64)

    def test_relevance_uses_sdk_model_without_approving_evidence(self):
        run = self.root / "run-rel"
        rel = "sources/source-1/v1/question-relevance/r1/question-relevance-request.json"
        request = run / rel
        request.parent.mkdir(parents=True)
        request.write_text('{"id":"r1","preparedAt":"2026-01-01T00:00:00.000Z"}', encoding="utf-8")
        answer = {"verdict": "not-relevant", "rationale": "Outside the question", "support": [], "limitations": ["One source only"]}
        with patch("dashboard.server.generate", return_value=invocation(json.dumps(answer))) as transport, \
                patch("dashboard.server._run_npm_script", return_value={"ok": True, "stderr": "", "stdout": ""}) as runner:
            status, result = _handle_analyst_action(self.root, run, {
                "action": "run-ai-stage", "runId": run.name, "reviewerId": "analyst", "requestPath": rel,
            })
        self.assertEqual(status, 200, result)
        self.assertEqual(transport.call_args.args[2], "relevance")
        self.assertEqual([call.args[0] for call in runner.call_args_list], ["record:question-relevance"])
        response = json.loads(next(request.parent.glob("copilot-response-*.json")).read_text(encoding="utf-8"))
        self.assertEqual(response["schemaVersion"], "question-relevance-copilot-sdk-response-v1")
        self.assertEqual(response["model"], "test-model")
        self.assertFalse((run / "evidence-admission").exists())

    def test_invalid_answers_remain_auditable_and_do_not_advance(self):
        run = self.root / "bad-output"
        rel = "memo/requests/w1/writer-request.json"
        request = run / rel
        request.parent.mkdir(parents=True)
        request.write_text('{"id":"w1","preparedAt":"2026-01-01T00:00:00.000Z","prompt":{"system":"s","user":"u"}}', encoding="utf-8")
        with patch("dashboard.server.generate", return_value=invocation("not JSON")), \
                patch("dashboard.server._run_npm_script") as runner:
            status, _ = _handle_analyst_action(self.root, run, {
                "action": "run-ai-stage", "runId": run.name, "reviewerId": "analyst", "requestPath": rel,
            })
        self.assertEqual(status, 400)
        runner.assert_not_called()
        self.assertEqual(len(list(request.parent.glob("copilot-invocation-*.json"))), 1)
        self.assertFalse((request.parent / "copilot-recorded.json").exists())

    def test_downstream_preparation_failure_does_not_repeat_a_recorded_generation(self):
        run = self.root / "chain-failed"
        rel = "synthesis/requests/b1/build-request.json"
        request = run / rel
        request.parent.mkdir(parents=True)
        request.write_text('{"id":"b1","preparedAt":"2026-01-01T00:00:00.000Z","prompt":{"system":"s","user":"u"}}', encoding="utf-8")
        payload = {"action": "run-ai-stage", "runId": run.name, "reviewerId": "analyst", "requestPath": rel}
        with patch("dashboard.server.generate", return_value=invocation()) as transport, \
                patch("dashboard.server._run_npm_script", return_value={"ok": True, "stderr": "", "stdout": ""}), \
                patch("dashboard.server._chain_after_stage", return_value=[{"ok": False, "stderr": "Preparation failed", "stdout": ""}]):
            self.assertEqual(_handle_analyst_action(self.root, run, payload)[0], 400)
            self.assertEqual(_handle_analyst_action(self.root, run, payload)[0], 409)
            transport.assert_called_once()

    def test_generation_is_confined_and_cannot_run_concurrently(self):
        with patch("dashboard.server.generate") as transport:
            self.assertEqual(_handle_analyst_action(self.root, self.root, {
                "action": "run-ai-stage", "runId": "run", "reviewerId": "analyst", "requestPath": "../outside.json",
            })[0], 404)
            COPILOT_LOCK.acquire()
            try:
                self.assertEqual(_handle_analyst_action(self.root, self.root, {"action": "run-ai-stage"})[0], 409)
            finally:
                COPILOT_LOCK.release()
            transport.assert_not_called()

    def test_request_changes_during_generation_cannot_be_recorded(self):
        run = self.root / "request-drift"
        rel = "memo/requests/w1/writer-request.json"
        request = run / rel
        request.parent.mkdir(parents=True)
        original = '{"id":"w1","preparedAt":"2026-01-01T00:00:00.000Z","prompt":{"system":"s","user":"u"}}'
        request.write_text(original, encoding="utf-8")

        def mutate(*args):
            request.write_text(original.replace('"user":"u"', '"user":"changed"'), encoding="utf-8")
            return invocation()

        with patch("dashboard.server.generate", side_effect=mutate), patch("dashboard.server._run_npm_script") as runner:
            with self.assertRaisesRegex(CopilotError, "changed during"):
                _handle_analyst_action(self.root, run, {
                    "action": "run-ai-stage", "runId": run.name, "reviewerId": "analyst", "requestPath": rel,
                })
            runner.assert_not_called()
        self.assertEqual(len(list(request.parent.glob("copilot-invocation-*.json"))), 1)

    def test_manual_records_prevent_duplicate_automatic_spend(self):
        run = self.root / "already-recorded"
        rel = "memo/requests/w1/writer-request.json"
        request = run / rel
        request.parent.mkdir(parents=True)
        request.write_text('{"id":"w1"}', encoding="utf-8")
        record = run / "memo" / "records" / "m1" / "writer-record.json"
        record.parent.mkdir(parents=True)
        record.write_text(json.dumps({"request": {"artifactRef": str(request)}}), encoding="utf-8")
        with patch("dashboard.server.generate") as transport:
            status, _ = _handle_analyst_action(self.root, run, {
                "action": "run-ai-stage", "runId": run.name, "reviewerId": "analyst", "requestPath": rel,
            })
            self.assertEqual(status, 409)
            transport.assert_not_called()

    def test_scope_drafting_and_separate_human_question_approval_end_to_end(self):
        payload = {
            "action": "draft-research-question", "runId": "scope-draft", "reviewerId": "analyst",
            "scopeConfirmed": True, "researchThesis": "Supplier incidents disrupt production more often than direct attacks.",
            "purpose": "Compare disruption pathways.", "threatTopic": "Production continuity",
            "audience": "Risk leadership", "geographies": "Europe", "from": "2026-01-01", "to": "2026-08-31",
            "requestedOutput": "memo", "requirements": "What supports or contradicts the thesis?",
        }
        draft = {"question": "Do supplier incidents disrupt European production more often than direct attacks?",
                 "rationale": "Compare supporting and contradictory evidence for both disruption pathways."}
        run = self.root / payload["runId"]
        with patch("dashboard.server.resolve_model", return_value="test-model") as resolver, \
                patch("dashboard.server.generate", side_effect=lambda *args: invocation(json.dumps(draft))) as transport:
            self.assertEqual(_handle_analyst_action(self.root, run, {**payload, "scopeConfirmed": False})[0], 400)
            status, result = _handle_analyst_action(self.root, run, payload)
            self.assertEqual(status, 200, result)
            resolver.assert_called_with(self.root, "research-question")
            self.assertEqual(transport.call_args.args[2], "research-question")
            self.assertEqual(result["draft"]["status"], "proposed")
            self.assertEqual(result["draft"]["researchThesis"], payload["researchThesis"])
            self.assertFalse((run / "research-questions").exists())
            self.assertFalse((run / "discoveries").exists())
            status, _ = _handle_analyst_action(self.root, run, {**payload, "researchThesis": "A changed thesis"})
            self.assertEqual(status, 409)
            transport.assert_called_once()
        status, result = _handle_analyst_action(self.root, run, {
            **payload, **draft, "action": "approve-intent", "runDiscovery": False,
        })
        self.assertEqual(status, 200, result)
        approved = json.loads(next((run / "research-questions").glob("*/approved-research-question.json")).read_text(encoding="utf-8"))
        self.assertEqual(approved["approvedBy"], "analyst")
        self.assertEqual(approved["researchThesis"], payload["researchThesis"])
        self.assertEqual(len(list((run / "requirements").glob("*/approved-requirements.json"))), 1)


if __name__ == "__main__":
    unittest.main()
