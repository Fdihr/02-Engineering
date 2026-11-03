import json
import subprocess
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dashboard import settings
from dashboard.copilot import WORKFLOW_STEPS
from dashboard.server import create_server, parse_stage_answer, read_lead, _handle_analyst_action


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
        self.assertIn("/run_view.js", page)
        self.assertIn('id="integration-settings"', page)
        self.assertIn('id="model-workflow"', page)
        self.assertIn('Default Copilot model', page)
        self.assertIn('Azure AI Foundry', page)
        self.assertIn('Not connected', page)
        for script in ("/run_view.js", "/run_panes.js"):
            with urlopen(self.base + script) as response:
                self.assertIn("text/javascript", response.headers.get("Content-Type"))
                self.assertIn("window.CTI", response.read().decode("utf-8"))

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

    def test_frontend_initialization_keeps_approval_gates_and_copilot_settings(self):
        script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', checked: false, disabled: true, hidden: false,
      listeners: {}, classList: { add() {}, toggle() {} },
      setAttribute() {}, focus() {},
      addEventListener(name, callback) { this.listeners[name] = callback; }
    });
    return elements.get(id);
  },
  querySelectorAll() { return []; }
};
let analyst = 'test-analyst';
const C = {
  state: { drafts: {}, busy: false, route: 'settings' }, panes: {},
  analyst: () => analyst,
  el: () => ({ setAttribute() {} }),
  replace: (host) => assert.equal(host.id, 'integration-settings')
};
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), {
  window: { CTI: C }, document,
  fetch: () => new Promise(() => {})
});
C.initBrief();
const confirm = document.getElementById('approve-confirm');
const approve = document.getElementById('btn-approve-only');
const collect = document.getElementById('btn-approve-collect');
confirm.checked = true;
confirm.listeners.change();
assert.equal(approve.disabled, false);
assert.equal(collect.disabled, false);
C.state.busy = true;
confirm.listeners.change();
assert.equal(approve.disabled, true);
C.state.busy = false;
analyst = '';
confirm.listeners.change();
assert.equal(collect.disabled, true);
analyst = 'test-analyst';
document.getElementById('btn-edit-intent').listeners.click();
assert.equal(confirm.checked, false);
assert.equal(approve.disabled, true);
document.createDocumentFragment = () => ({ appendChild() {} });
C.panes.settings();
"""
        result = subprocess.run(
            ["node", "-e", script, str(Path(__file__).parent / "run_panes.js")],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_workflow_model_controls_preserve_saved_settings_until_successful_save(self):
        result = subprocess.run(
            ["node", str(Path(__file__).parent / "test_model_settings.cjs"), json.dumps(WORKFLOW_STEPS)],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_thesis_plan_frontend_generates_paired_results_without_approval(self):
        result = subprocess.run(
            ["node", str(Path(__file__).parent / "test_research_plan.cjs")],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

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

    def test_actions_reject_foreign_origin_and_unknown_action(self):
        request = Request(self.base + "/api/action", data=b'{"action":"unknown"}',
                          headers={"Content-Type": "application/json", "Origin": "https://external.example"})
        with self.assertRaises(HTTPError) as denied:
            urlopen(request)
        self.assertEqual(denied.exception.code, 403)
        request = Request(self.base + "/api/action", data=b'{"action":"unknown"}',
                          headers={"Content-Type": "application/json"})
        with self.assertRaises(HTTPError) as unknown:
            urlopen(request)
        self.assertEqual(unknown.exception.code, 400)

    def test_settings_never_return_full_key_and_guard_posts(self):
        key = "TESTKEY-abcdefgh1234"
        previous = os.environ.get("SEERIST_API_KEY")
        os.environ["SEERIST_API_KEY"] = key
        try:
            with urlopen(self.base + "/api/settings") as response:
                body = response.read().decode("utf-8")
            self.assertNotIn(key, body)
            self.assertIn("1234", body)
            data = json.loads(body)
            self.assertIn("runsFolder", data)
            with patch.object(settings, "_persist_user_env", lambda *a, **k: True):
                request = Request(self.base + "/api/settings/key", data=json.dumps({"name": "SEERIST_API_KEY", "value": key}).encode(),
                                  headers={"Content-Type": "application/json", "Origin": "https://external.example"})
                with self.assertRaises(HTTPError) as denied:
                    urlopen(request)
                self.assertEqual(denied.exception.code, 403)
                request = Request(self.base + "/api/settings/key", data=json.dumps({"name": "PATH", "value": key}).encode(),
                                  headers={"Content-Type": "application/json"})
                with self.assertRaises(HTTPError) as unknown:
                    urlopen(request)
                self.assertEqual(unknown.exception.code, 400)
                request = Request(self.base + "/api/settings/key", data=json.dumps({"name": "SEERIST_API_KEY", "value": "has space"}).encode(),
                                  headers={"Content-Type": "application/json"})
                with self.assertRaises(HTTPError) as invalid:
                    urlopen(request)
                self.assertEqual(invalid.exception.code, 400)
                request = Request(self.base + "/api/settings/key", data=json.dumps({"name": "SEERIST_API_KEY", "value": "NEWKEY-abcdefgh5678"}).encode(),
                                  headers={"Content-Type": "application/json"})
                with urlopen(request) as response:
                    saved = response.read().decode("utf-8")
                self.assertNotIn("NEWKEY-abcdefgh5678", saved)
                self.assertIn("5678", saved)
                request = Request(self.base + "/api/settings/key/remove", data=b'{"name":"SEERIST_API_KEY"}',
                                  headers={"Content-Type": "application/json"})
                with urlopen(request) as response:
                    self.assertFalse(json.loads(response.read())["keys"][0]["set"])
        finally:
            if previous is None:
                os.environ.pop("SEERIST_API_KEY", None)
            else:
                os.environ["SEERIST_API_KEY"] = previous

    def test_settings_save_validated_integrations_and_reject_cross_origin(self):
        previous = os.environ.get("AZURE_AI_FOUNDRY_ENDPOINT")
        try:
            with patch.object(settings, "_persist_user_env", lambda *a, **k: True):
                request = Request(self.base + "/api/settings/config",
                                  data=json.dumps({"name": "AZURE_AI_FOUNDRY_ENDPOINT",
                                                   "value": "https://resource.services.ai.azure.com"}).encode(),
                                  headers={"Content-Type": "application/json", "Origin": "https://external.example"})
                with self.assertRaises(HTTPError) as denied:
                    urlopen(request)
                self.assertEqual(denied.exception.code, 403)

                request = Request(self.base + "/api/settings/config",
                                  data=json.dumps({"name": "AZURE_AI_FOUNDRY_ENDPOINT",
                                                   "value": "http://resource.services.ai.azure.com"}).encode(),
                                  headers={"Content-Type": "application/json"})
                with self.assertRaises(HTTPError) as invalid:
                    urlopen(request)
                self.assertEqual(invalid.exception.code, 400)

                request = Request(self.base + "/api/settings/config",
                                  data=json.dumps({"name": "AZURE_AI_FOUNDRY_ENDPOINT",
                                                   "value": "https://resource.services.ai.azure.com"}).encode(),
                                  headers={"Content-Type": "application/json"})
                with urlopen(request) as response:
                    result = json.loads(response.read())
                configured = next(item for item in result["config"] if item["name"] == "AZURE_AI_FOUNDRY_ENDPOINT")
                self.assertTrue(configured["configured"])
                self.assertEqual(configured["value"], "https://resource.services.ai.azure.com")
                self.assertTrue(result["persisted"])
        finally:
            if previous is None:
                os.environ.pop("AZURE_AI_FOUNDRY_ENDPOINT", None)
            else:
                os.environ["AZURE_AI_FOUNDRY_ENDPOINT"] = previous

    def test_entra_sign_in_provisions_tenant_session_and_protects_dashboard(self):
        tenant_name = "ENTRA_TENANT_ID"
        client_name = "ENTRA_CLIENT_ID"
        previous_tenant = os.environ.get(tenant_name)
        previous_client = os.environ.get(client_name)
        tenant_id = "12345678-1234-1234-1234-123456789012"
        client_id = "abcdef12-3456-7890-abcd-ef1234567890"
        os.environ[tenant_name] = tenant_id
        os.environ[client_name] = client_id
        user = {
            "tenantId": tenant_id,
            "objectId": "fedcba98-7654-3210-fedc-ba9876543210",
            "username": "analyst@example.com",
            "displayName": "Example Analyst",
        }
        try:
            with urlopen(self.base + "/") as response:
                self.assertIn("Sign in with Microsoft", response.read().decode("utf-8"))
            with self.assertRaises(HTTPError) as denied:
                urlopen(self.base + "/api/run")
            self.assertEqual(denied.exception.code, 401)

            with patch("dashboard.server.auth.authenticate", return_value=user):
                request = Request(self.base + "/api/auth/start", data=b"{}",
                                  headers={"Content-Type": "application/json"})
                with urlopen(request) as response:
                    flow_id = json.loads(response.read())["flowId"]

                for _ in range(20):
                    with urlopen(self.base + "/api/auth/poll?" + urlencode({"flowId": flow_id})) as response:
                        result = json.loads(response.read())
                        session_cookie = response.headers.get("Set-Cookie")
                    if result["status"] == "complete":
                        break
                self.assertEqual(result["status"], "complete")
                self.assertIn("HttpOnly", session_cookie)
                cookie = session_cookie.split(";", 1)[0]
                request = Request(self.base + "/api/auth/session", headers={"Cookie": cookie})
                with urlopen(request) as response:
                    session = json.loads(response.read())
                self.assertTrue(session["authenticated"])
                self.assertEqual(session["user"]["objectId"], user["objectId"])

                request = Request(self.base + "/api/action", data=b'{"action":"run-next","reviewerId":"spoofed"}',
                                  headers={"Content-Type": "application/json", "Cookie": cookie})
                with patch("dashboard.server._handle_analyst_action",
                           side_effect=lambda _root, _run, payload: (200, {"reviewerId": payload["reviewerId"]})):
                    with urlopen(request) as response:
                        action_result = json.loads(response.read())
                self.assertEqual(action_result["reviewerId"], user["objectId"])

                request = Request(self.base + "/api/auth/logout", data=b"{}",
                                  headers={"Content-Type": "application/json", "Cookie": cookie})
                with urlopen(request) as response:
                    self.assertIn("Max-Age=0", response.headers.get("Set-Cookie"))
        finally:
            if previous_tenant is None:
                os.environ.pop(tenant_name, None)
            else:
                os.environ[tenant_name] = previous_tenant
            if previous_client is None:
                os.environ.pop(client_name, None)
            else:
                os.environ[client_name] = previous_client

    def test_entra_sign_in_requires_loopback_server_binding(self):
        names = ("ENTRA_TENANT_ID", "ENTRA_CLIENT_ID")
        previous = {name: os.environ.get(name) for name in names}
        os.environ[names[0]] = "12345678-1234-1234-1234-123456789012"
        os.environ[names[1]] = "abcdef12-3456-7890-abcd-ef1234567890"
        try:
            with self.assertRaisesRegex(ValueError, "loopback-only"):
                create_server(self.run_dir, "test-run", host="0.0.0.0", port=0)
        finally:
            for name in names:
                if previous[name] is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = previous[name]

    def test_local_copilot_settings_endpoints_and_visible_auth_errors(self):
        with patch("dashboard.server.load_settings", return_value={"model": "saved-model"}):
            with urlopen(self.base + "/api/copilot-settings") as response:
                data = json.loads(response.read())
                self.assertEqual(data["settings"]["model"], "saved-model")
                self.assertEqual({step["id"] for step in data["workflow"] if step["kind"] == "ai"},
                                 {"research-question", "relevance", "extract", "build", "challenge", "key-judgements", "memo-writer"})
                self.assertTrue(any(step["kind"] == "human" for step in data["workflow"]))
                self.assertTrue(any(step["kind"] == "system" for step in data["workflow"]))
        with patch("dashboard.server.available_models", return_value=[{"id": "test-model", "name": "Test"}]):
            with urlopen(self.base + "/api/copilot-models") as response:
                self.assertEqual(json.loads(response.read())["models"][0]["id"], "test-model")
        from dashboard.copilot import CopilotError
        with patch("dashboard.server.available_models", side_effect=CopilotError("Sign in required")):
            with self.assertRaises(HTTPError) as failed:
                urlopen(self.base + "/api/copilot-models")
            self.assertEqual(failed.exception.code, 503)
            self.assertEqual(json.loads(failed.exception.read())["error"], "Sign in required")
        with patch("dashboard.server.save_model", return_value={"model": "test-model"}) as saver:
            request = Request(self.base + "/api/action", data=b'{"action":"save-copilot-settings","model":"test-model"}',
                              headers={"Content-Type": "application/json"})
            with urlopen(request) as response:
                self.assertEqual(json.loads(response.read())["settings"]["model"], "test-model")
            saver.assert_called_once_with(self.run_dir.parent, "test-model")
        stages = {"challenge": {"provider": "github-copilot-sdk", "model": "reasoning"}}
        with patch("dashboard.server.save_model", return_value={"model": "test-model", "stages": stages}) as saver:
            request = Request(self.base + "/api/action", data=json.dumps({
                "action": "save-copilot-settings", "model": "test-model", "stages": stages,
            }).encode(), headers={"Content-Type": "application/json"})
            with urlopen(request) as response:
                self.assertEqual(json.loads(response.read())["settings"]["stages"], stages)
            saver.assert_called_once_with(self.run_dir.parent, "test-model", stages)
        for invalid in (None, [], "bad"):
            request = Request(self.base + "/api/action", data=json.dumps({
                "action": "save-copilot-settings", "model": "test-model", "stages": invalid,
            }).encode(), headers={"Content-Type": "application/json"})
            with self.assertRaises(HTTPError) as failed:
                urlopen(request)
            self.assertEqual(failed.exception.code, 400)

    def test_intent_requires_identity_and_preserves_existing_run(self):
        with patch("dashboard.server._run_npm_script") as runner:
            status, result = _handle_analyst_action(self.run_dir.parent, self.run_dir,
                                                   {"action": "approve-intent"})
            self.assertEqual(status, 400)
            self.assertFalse(result["ok"])
            status, result = _handle_analyst_action(self.run_dir.parent, self.run_dir, {
                "action": "approve-intent", "runId": self.run_dir.name,
                "reviewerId": "analyst", "requirements": "What happened?"})
            self.assertEqual(status, 409)
            runner.assert_not_called()
    def test_evidence_review_requires_identity_reason_and_single_decision(self):
        runs_root = self.run_dir / "runs-root"
        run_id = "run-e"
        run_dir = runs_root / run_id
        cand = run_dir / "source-reintakes" / "cand-1"
        cand.mkdir(parents=True)
        (cand / "intake-result.json").write_text("{}", encoding="utf-8")
        base = {"action": "review-evidence", "runId": run_id, "candidateId": "cand-1", "reviewerId": "FDIHR", "decision": "approve", "reason": "Relevant exposure data"}
        with patch("dashboard.server._run_node_command") as runner:
            runner.return_value = {"ok": True, "command": "review:evidence", "exitCode": 0, "stdout": "", "stderr": ""}
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "reviewerId": ""})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "decision": "admit"})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "reason": " "})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "candidateId": "missing"})[0], 404)
            runner.assert_not_called()
            status, _ = _handle_analyst_action(runs_root, run_dir, {**base, "reason": "ok & echo pwned\r\nnext"})
            self.assertEqual(status, 200)
            args = runner.call_args.args[2]
            self.assertEqual(args[:3], [f"runs/{run_id}/source-reintakes/cand-1/intake-result.json", "approve", "FDIHR"])
            self.assertEqual(args[3], "ok & echo pwned next")

            intake_ref = f"runs/{run_id}/source-reintakes/cand-1/intake-result.json"
            (runs_root / "evidence-events.jsonl").write_text(json.dumps({
                "decisionId": "d1", "stage": "evidence_admission", "status": "completed", "intakeArtifactRef": intake_ref,
            }) + "\n", encoding="utf-8")
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, base)[0], 409)

    def test_record_relevance_anchors_answer_without_creating_a_candidate(self):
        runs_root = self.run_dir / "runs-root"
        run_id = "run-r"
        rel = "sources/source-retrieval-1/doc-1/question-relevance/req-1/question-relevance-request.json"
        request_file = runs_root / run_id / rel
        request_file.parent.mkdir(parents=True)
        request_file.write_text(json.dumps({
            "id": "req-1", "sourceItemId": "source-retrieval-1",
            "sourceDocument": {"id": "doc-1", "segments": [{"id": "seg-1", "ordinal": 1, "text": "Wind parks exposed.", "textSha256": "a" * 64}]},
            "sourceDocumentArtifactRef": "doc-ref", "sourceDocumentArtifactSha256": "b" * 64,
        }), encoding="utf-8")
        answer = json.dumps({"verdict": "partially-relevant", "rationale": "r", "limitations": ["l"],
                             "support": [{"segment": "S1", "quote": "Wind parks", "relationToQuestion": "exposure"}]})
        base = {"action": "record-relevance", "runId": run_id, "requestPath": rel, "answer": answer}
        outputs = [
            {"ok": True, "command": "npm run record:question-relevance", "exitCode": 0, "stderr": "",
             "stdout": "Verdict: partially-relevant\nOutput: runs/run-r/assessment.json"},
        ]
        run_dir = runs_root / run_id
        with patch("dashboard.server._run_npm_script", side_effect=outputs) as runner:
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "answer": "not json"})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "requestPath": "../escape.json"})[0], 404)
            runner.assert_not_called()
            status, result = _handle_analyst_action(runs_root, run_dir, base)
        self.assertEqual(status, 200, result)
        self.assertEqual([call.args[0] for call in runner.call_args_list], ["record:question-relevance"])
        self.assertFalse((runs_root / run_id / "source-reintakes").exists())
        written = list(request_file.parent.glob("copilot-response-*.json"))
        self.assertEqual(len(written), 1)
        anchor = json.loads(written[0].read_text(encoding="utf-8"))["proposal"]["support"][0]["anchor"]
        self.assertEqual((anchor["quoteStartUtf8Byte"], anchor["quoteEndUtf8Byte"]), (0, 10))
        (request_file.parent / "assessments" / "a1").mkdir(parents=True)
        self.assertEqual(_handle_analyst_action(runs_root, run_dir, base)[0], 409)

    def test_collection_lead_stays_pending_without_fetching_publisher_or_canonicalizing(self):
        run_id = "run-pending"
        runs_root = self.run_dir / "runs"
        run_dir = runs_root / run_id
        intake_ref = f"runs/{run_id}/provider-intakes/op-1/lead-1/intake-result.json"
        intake_path = self.run_dir / intake_ref
        intake_path.parent.mkdir(parents=True)
        intake_path.write_text(json.dumps({
            "item": {"role": "collection_lead", "contentCompleteness": "summary_only"},
        }), encoding="utf-8")
        payload = {
            "action": "intake-candidate", "runId": run_id, "rawArtifactRef": "raw.json",
            "providerItemId": "lead-1", "questionId": "rq-1",
            "sourceUrl": "https://publisher.example/article",
        }
        with patch("dashboard.server._ensure_provider_operation_manifest", return_value=("manifest.json", "op-1")), \
                patch("dashboard.server._run_npm_script") as runner:
            status, result = _handle_analyst_action(runs_root, run_dir, payload)
        self.assertEqual(status, 200, result)
        self.assertEqual(result["status"], "pending_rss")
        self.assertIn("Publisher pages are not fetched", result["message"])
        runner.assert_not_called()

    def test_captured_native_content_still_canonicalizes_without_publisher_retrieval(self):
        run_id = "run-native"
        runs_root = self.run_dir / "runs"
        run_dir = runs_root / run_id
        intake_ref = f"runs/{run_id}/provider-intakes/op-1/native-1/intake-result.json"
        intake_path = self.run_dir / intake_ref
        intake_path.parent.mkdir(parents=True)
        intake_path.write_text(json.dumps({
            "item": {"role": "evidence_candidate", "contentCompleteness": "captured_content"},
        }), encoding="utf-8")
        payload = {
            "action": "intake-candidate", "runId": run_id, "rawArtifactRef": "raw.json",
            "providerItemId": "native-1", "questionId": "rq-1",
            "sourceUrl": "https://publisher.example/article",
        }
        outputs = [
            {"ok": True, "stdout": f"Output: runs/{run_id}/sources/doc/source-document.json", "stderr": ""},
            {"ok": True, "stdout": "Request prepared", "stderr": ""},
        ]
        with patch("dashboard.server._ensure_provider_operation_manifest", return_value=("manifest.json", "op-1")), \
                patch("dashboard.server._run_npm_script", side_effect=outputs) as runner:
            status, result = _handle_analyst_action(runs_root, run_dir, payload)
        self.assertEqual(status, 200, result)
        self.assertEqual([call.args[0] for call in runner.call_args_list], [
            "canonicalize:source", "prepare:question-relevance",
        ])

    def test_collection_lead_stays_pending_without_publisher_fetch(self):
        runs_root = self.run_dir / "runs-root"
        run_id = "run-rss"
        intake_path = runs_root / run_id / "provider-intakes" / "operation-1" / "lead-1" / "intake-result.json"
        intake_path.parent.mkdir(parents=True)
        intake_path.write_text(json.dumps({"decision": {"destination": "pending_rss"}}), encoding="utf-8")
        payload = {
            "action": "intake-candidate",
            "runId": run_id,
            "rawArtifactRef": f"runs/{run_id}/raw-response.json",
            "providerItemId": "lead-1",
            "questionId": "question-1",
        }
        with patch("dashboard.server._ensure_provider_operation_manifest", return_value=("manifest.json", "operation-1")), \
                patch("dashboard.server._run_npm_script") as runner:
            status, result = _handle_analyst_action(runs_root, runs_root / run_id, payload)

        self.assertEqual(status, 200)
        self.assertTrue(result["pendingRss"])
        self.assertIn("RSS-connected source list", result["message"])
        runner.assert_not_called()

    def test_assurance_review_shapes_response_and_chains_assemble_and_measure(self):
        runs_root = self.run_dir / "runs-root"
        run_id, snap = "run-a", "snapshot-x"
        stage = runs_root / run_id / "assurance" / snap
        (stage / "review").mkdir(parents=True)
        (stage / "review" / "review-package.json").write_text('{"id":"pkg"}', encoding="utf-8")
        (stage / "extract" / "attempt-1").mkdir(parents=True)
        (stage / "extract" / "attempt-1" / "extract-request.json").write_text(
            json.dumps({"lineage": {"snapshot": {"artifactRef": "runs/d1/approved-evidence-snapshot.json"}}}), encoding="utf-8")
        base = {"action": "record-assurance-review", "runId": run_id, "snapshotId": snap, "reviewerId": "FDIHR", "mode": "performed",
                "verdicts": [{"observationId": "obs-1", "verdict": "supported", "note": "", "duplicateOf": ""}],
                "irReview": [{"irId": "ir-01", "disposition": "partial", "note": "Some\ncoverage"}],
                "assessment": {"access": "indirect", "accessRationale": "a", "trackRecord": "established", "trackRecordRationale": "b",
                               "alignment": "c", "dependencyKind": "relayed", "upstreamSources": "NCSC-NL, Modat",
                               "dependencyRationale": "d", "limitations": "one\ntwo"}}
        outputs = [
            {"ok": True, "command": "r", "exitCode": 0, "stderr": "", "stdout": f"Output: runs/{run_id}/assurance/{snap}/review/review-record.json"},
            {"ok": True, "command": "a", "exitCode": 0, "stderr": "", "stdout": "Output: runs/run-a/note.json"},
            {"ok": True, "command": "m", "exitCode": 0, "stderr": "", "stdout": "Output: runs/run-a/metrics.json"},
        ]
        with patch("dashboard.server._run_npm_script", side_effect=outputs) as runner:
            self.assertEqual(_handle_analyst_action(runs_root, stage, {**base, "mode": "guess"})[0], 400)
            status, result = _handle_analyst_action(runs_root, stage, base)
        self.assertEqual(status, 200, result)
        self.assertEqual([c.args[0] for c in runner.call_args_list], ["record:assurance-review", "assemble:assurance", "measure:assurance"])
        self.assertEqual(runner.call_args_list[1].args[1][0], "runs/d1/approved-evidence-snapshot.json")
        response = json.loads(next((stage / "review").glob("review-response-*.json")).read_text(encoding="utf-8"))
        self.assertEqual(response["supportPass"], "performed")
        self.assertNotIn("duplicateOf", response["verdicts"][0])
        self.assertEqual(response["irReview"][0]["note"], "Some coverage")
        self.assertEqual(response["assessment"]["dependency"]["upstreamSources"], ["NCSC-NL", "Modat"])
        self.assertEqual(response["assessment"]["limitations"], ["one", "two"])

        (stage / "review" / "review-record-provisional.json").write_text("{}", encoding="utf-8")
        (stage / "source-note-provisional.json").write_text("{}", encoding="utf-8")
        self.assertEqual(_handle_analyst_action(runs_root, stage, {**base, "mode": "provisional"})[0], 409)
        with patch("dashboard.server._run_npm_script", side_effect=outputs) as runner:
            self.assertEqual(_handle_analyst_action(runs_root, stage, base)[0], 200)
        self.assertEqual(runner.call_args_list[1].args[1][-1], f"runs/{run_id}/assurance/{snap}/source-note-provisional.json")
        (stage / "review" / "review-record-reviewed.json").write_text("{}", encoding="utf-8")
        self.assertEqual(_handle_analyst_action(runs_root, stage, base)[0], 409)

    def test_adjudication_derives_claim_status_and_records_reviewer(self):
        runs_root = self.run_dir / "runs-root"
        run_id = "run-j"
        run_dir = runs_root / run_id
        build_rel = "synthesis/records/b1/synthesis-build-record.json"
        rec_rel = "synthesis/challenge/records/synthesis-challenge-record-abc/challenge-record.json"
        (run_dir / build_rel).parent.mkdir(parents=True)
        (run_dir / build_rel).write_text(json.dumps({"synthesis": {"claims": [{"id": "c-1"}, {"id": "c-2"}, {"id": "c-3"}]}}), encoding="utf-8")
        (run_dir / rec_rel).parent.mkdir(parents=True)
        (run_dir / rec_rel).write_text(json.dumps({
            "reviewStatus": "reviewed", "limitedEvidence": True,
            "buildRecord": {"artifactRef": f"runs/{run_id}/{build_rel}", "artifactSha256": "a" * 64},
            "results": [
                {"id": "ch-1", "claimId": "c-1", "verdict": "challenge"},
                {"id": "ch-2", "claimId": "c-2", "verdict": "challenge"},
                {"id": "ch-0", "claimId": "c-3", "verdict": "none"},
            ],
        }), encoding="utf-8")
        base = {"action": "record-adjudication", "runId": run_id, "reviewerId": "FDIHR", "challengeRecordPath": rec_rel,
                "challenges": [{"challengeId": "ch-1", "decision": "uphold"}, {"challengeId": "ch-2", "decision": "dismiss"}],
                "claims": [{"claimId": "c-3", "reject": True}]}
        prepared = {"ok": True, "command": "npm run prepare:key-judgements", "exitCode": 0, "stdout": "", "stderr": ""}
        with patch("dashboard.server._run_npm_script", return_value=prepared) as runner:
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "challenges": base["challenges"][:1]})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "challengeRecordPath": "../x/challenge-record.json"})[0], 400)
            status, result = _handle_analyst_action(runs_root, run_dir, base)
            self.assertEqual(status, 200, result)
            self.assertEqual(runner.call_args.args[0], "prepare:key-judgements")
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, base)[0], 409)
        out = run_dir / "synthesis" / "adjudication" / "synthesis-challenge-record-abc"
        adjudication = json.loads((out / "performed-adjudication.json").read_text(encoding="utf-8"))
        self.assertEqual([(c["claimId"], c["status"], c["openChallengeIds"]) for c in adjudication["claims"]],
                         [("c-1", "contested", ["ch-1"]), ("c-2", "accepted", []), ("c-3", "rejected", [])])
        self.assertEqual(adjudication["adjudicationStatus"], "performed")
        decision = json.loads((out / "adjudication-decision.json").read_text(encoding="utf-8"))
        self.assertEqual(decision["reviewerId"], "FDIHR")

    def test_prepare_actions_require_records_inside_the_run(self):
        runs_root = self.run_dir / "runs-root"
        run_dir = runs_root / "run-p"
        run_dir.mkdir(parents=True)
        with patch("dashboard.server._run_npm_script") as runner:
            for payload in (
                {"action": "prepare-key-judgements", "runId": "run-p", "challengeRecordPath": "../x/challenge-record.json"},
                {"action": "prepare-key-judgements", "runId": "run-p", "challengeRecordPath": "synthesis/challenge/records/c1/challenge-record.json"},
                {"action": "prepare-memo-writer", "runId": "run-p", "keyJudgementRecordPath": "synthesis/key-judgements/records/k1/key-judgement-record.json"},
            ):
                self.assertEqual(_handle_analyst_action(runs_root, run_dir, payload)[0], 400)
            runner.assert_not_called()

    def test_stage_answer_parsing_strips_fences_and_reports_bad_json(self):
        self.assertEqual(parse_stage_answer('```json\n{"a": [1]}\n```')[0], {"a": [1]})
        self.assertEqual(parse_stage_answer('Here it is: [{"x": 1}] thanks')[0], [{"x": 1}])
        self.assertIn("does not contain JSON", parse_stage_answer("no answer")[1])
        self.assertIn("not valid JSON", parse_stage_answer('{"a": }')[1])

    def test_ai_stage_wraps_answer_in_envelope_records_and_chains(self):
        runs_root = self.run_dir / "runs-root"
        run_id = "run-s"
        run_dir = runs_root / run_id
        rel = "synthesis/requests/b1/build-request.json"
        (run_dir / rel).parent.mkdir(parents=True)
        (run_dir / rel).write_text(json.dumps({"id": "build-req-1", "preparedAt": "2026-10-26T10:00:00.000Z",
                                               "prompt": {"system": "S", "user": "U"}}), encoding="utf-8")
        base = {"action": "record-ai-stage", "runId": run_id, "requestPath": rel, "reviewerId": "FDIHR",
                "freshSession": True, "answer": '```json\n{"claims": []}\n```', "promptCopiedAt": "2020-01-01T00:00:00Z"}
        outputs = [
            {"ok": True, "command": "r", "exitCode": 0, "stderr": "", "stdout": f"Claims: 0\nOutput: runs/{run_id}/synthesis/records/b1/record.json"},
            {"ok": True, "command": "c", "exitCode": 0, "stderr": "", "stdout": "Output: runs/run-s/challenge.json"},
        ]
        with patch("dashboard.server._run_npm_script", side_effect=outputs) as runner:
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "freshSession": False})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "reviewerId": ""})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "requestPath": "note.json"})[0], 400)
            self.assertEqual(_handle_analyst_action(runs_root, run_dir, {**base, "answer": "none"})[0], 400)
            runner.assert_not_called()
            status, result = _handle_analyst_action(runs_root, run_dir, base)
        self.assertEqual(status, 200, result)
        self.assertEqual([c.args[0] for c in runner.call_args_list], ["record:synthesis-build", "prepare:synthesis-challenge"])
        self.assertEqual(runner.call_args_list[1].args[1], [f"runs/{run_id}/synthesis/records/b1/record.json"])
        response = json.loads(next((run_dir / rel).parent.glob("copilot-response-*.json")).read_text(encoding="utf-8"))
        self.assertEqual(response["schemaVersion"], "synthesis-build-copilot-response-v1")
        self.assertEqual((response["requestId"], response["capturedBy"], response["freshSession"]), ("build-req-1", "FDIHR", True))
        self.assertGreaterEqual(response["startedAt"], "2026-10-26T10:00:00.000Z")
        self.assertGreaterEqual(response["completedAt"], response["startedAt"])
        self.assertEqual(response["proposal"], {"claims": []})

        with self.assertRaises(HTTPError) as refused:
            urlopen(self.base + "/api/stage-prompt?" + urlencode({"path": "note.json"}))
        self.assertEqual(refused.exception.code, 404)
        served = self.run_dir / "memo" / "requests" / "w1" / "writer-request.json"
        served.parent.mkdir(parents=True)
        served.write_text(json.dumps({"prompt": {"system": "SYS", "user": "USR"}}), encoding="utf-8")
        with urlopen(self.base + "/api/stage-prompt?" + urlencode({"path": "memo/requests/w1/writer-request.json"})) as response:
            self.assertEqual(json.loads(response.read())["prompt"], "SYS\n\nUSR")
    def test_lead_reader_returns_plain_text_and_stays_inside_raw_pages(self):
        raw = self.run_dir / "discoveries" / "dp-1" / "raw-pages" / "q-01-offset-0.json"
        raw.parent.mkdir(parents=True)
        raw.write_text(json.dumps({"features": [
            {"properties": {"id": "cr-1", "source": "analysis", "publishedDate": "2026-10-23T00:00:00Z",
                            "title": {"en": "Cyber Weekly"}, "summary": {"en": "<p><strong>Key:</strong> risk &amp; more</p>"},
                            "body": {"en": "<h4>Key points</h4><ul><li><p>First</p></li><li>Second<script>x</script></li></ul>"},
                            "countries": [{"name": {"en": "Germany"}}]}},
            {"properties": {"id": 42, "source": "news", "title": "Wire", "summary": "Plain summary.", "link": "https://example.org/a"}},
        ]}), encoding="utf-8")
        ref = "runs/test-run/discoveries/dp-1/raw-pages/q-01-offset-0.json"
        lead = read_lead(self.run_dir, "test-run", ref, "cr-1")
        self.assertEqual(lead["title"], "Cyber Weekly")
        self.assertEqual(lead["summary"], "Key: risk & more")
        self.assertEqual(lead["body"], "Key points\n\n• First\n\n• Second")
        self.assertEqual(lead["countries"], ["Germany"])
        self.assertEqual(read_lead(self.run_dir, "test-run", ref, "42")["link"], "https://example.org/a")
        self.assertIsNone(read_lead(self.run_dir, "test-run", ref, "missing"))
        self.assertIsNone(read_lead(self.run_dir, "test-run", "note.json", "cr-1"))
        self.assertIsNone(read_lead(self.run_dir, "test-run", "discoveries/../raw-pages/x.json", "cr-1"))
        with urlopen(self.base + "/api/lead?" + urlencode({"path": ref, "id": "42"})) as response:
            self.assertEqual(json.loads(response.read())["summary"], "Plain summary.")


if __name__ == "__main__":
    unittest.main()
