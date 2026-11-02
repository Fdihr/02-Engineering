import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError

from dashboard import settings

KEY = "TESTKEY-abcdefgh1234"


class FakeResponse:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def opener_returning(status):
    calls = []

    def opener(request, timeout=None):
        calls.append(request)
        if status == 200:
            return FakeResponse(200)
        raise HTTPError(request.full_url, status, "body with " + KEY, {}, None)

    opener.calls = calls
    return opener


class SettingsTests(unittest.TestCase):
    def test_key_status_exposes_only_last_four(self):
        rows = settings.key_status({"SEERIST_API_KEY": KEY})
        seerist = next(r for r in rows if r["name"] == "SEERIST_API_KEY")
        self.assertEqual(seerist, {"name": "SEERIST_API_KEY", "label": "Seerist", "set": True, "last4": "1234"})
        self.assertEqual(len(rows), 1)
        self.assertNotIn(KEY, repr(rows))

    def test_validate_key(self):
        self.assertEqual(settings.validate_key("  " + KEY + " "), KEY)
        for bad in ("short", "has space inside", "x" * 513, "tab\tkey12345", "ключ-ключ-ключ", "", None, 12345678):
            self.assertIsNone(settings.validate_key(bad), bad)

    def test_save_and_remove_use_injected_persistence(self):
        env = {}
        calls = []

        def persist(name, value):
            calls.append((name, value))
            return True

        self.assertTrue(settings.save_key("SEERIST_API_KEY", " " + KEY + " ", persist=persist, env=env))
        self.assertEqual(env, {"SEERIST_API_KEY": KEY})
        self.assertTrue(settings.remove_key("SEERIST_API_KEY", persist=persist, env=env))
        self.assertEqual(env, {})
        self.assertEqual(calls, [("SEERIST_API_KEY", KEY), ("SEERIST_API_KEY", None)])

    def test_save_rejects_unknown_name_and_bad_value(self):
        calls = []
        persist = lambda *a: calls.append(a)
        with self.assertRaises(ValueError):
            settings.save_key("PATH", KEY, persist=persist, env={})
        with self.assertRaises(ValueError):
            settings.save_key("SEERIST_API_KEY", "bad key", persist=persist, env={})
        with self.assertRaises(ValueError):
            settings.remove_key("PATH", persist=persist, env={})
        self.assertEqual(calls, [])

    def test_check_connection_outcomes_never_leak_key(self):
        env = {"SEERIST_API_KEY": KEY}
        cases = [(200, True, "Connected"), (401, False, "Seerist rejected the key"), (500, False, "Seerist answered with HTTP 500")]
        for status, ok, message in cases:
            result = settings.check_connection("SEERIST_API_KEY", env, opener=opener_returning(status))
            self.assertEqual((result["ok"], result["message"], result["status"]), (ok, message, status))
            self.assertNotIn(KEY, repr(result))
        def failing(request, timeout=None):
            raise URLError("down " + KEY)

        result = settings.check_connection("SEERIST_API_KEY", env, opener=failing)
        self.assertEqual((result["ok"], result["status"], result["message"]), (False, None, "Could not reach Seerist"))
        self.assertNotIn(KEY, repr(result))

    def test_check_connection_sends_expected_request(self):
        opener = opener_returning(200)
        settings.check_connection("SEERIST_API_KEY", {"SEERIST_API_KEY": KEY}, opener=opener)
        seerist, = opener.calls
        self.assertEqual(seerist.full_url, settings.SEERIST_CHECK_URL)
        self.assertEqual(seerist.get_header("X-api-key"), KEY)

    def test_check_without_key_makes_no_request(self):
        opener = opener_returning(200)
        result = settings.check_connection("SEERIST_API_KEY", {}, opener=opener)
        self.assertEqual((result["ok"], result["status"], result["message"]), (False, None, "No key set"))
        self.assertEqual(opener.calls, [])

    def test_runs_folder_info(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "run-a").mkdir()
            (Path(tmp) / "run-b").mkdir()
            (Path(tmp) / "file.txt").write_text("x", encoding="utf-8")
            info = settings.runs_folder_info(Path(tmp))
        self.assertEqual(info["analyses"], 2)
        self.assertTrue(info["writable"])
        self.assertTrue(info["path"])

    def test_config_values_are_validated_and_write_only_is_not_assumed(self):
        self.assertEqual(settings.validate_config("ENTRA_TENANT_ID", "12345678-1234-1234-1234-123456789012"), "12345678-1234-1234-1234-123456789012")
        self.assertEqual(settings.validate_config("ENTRA_CLIENT_ID", "abcdef12-3456-7890-abcd-ef1234567890"), "abcdef12-3456-7890-abcd-ef1234567890")
        self.assertEqual(
            settings.validate_config("AZURE_AI_FOUNDRY_ENDPOINT", " https://resource.services.ai.azure.com/ "),
            "https://resource.services.ai.azure.com",
        )
        self.assertEqual(settings.validate_config("AZURE_AI_FOUNDRY_ENDPOINT", ""), "")
        for name, value in (
            ("ENTRA_TENANT_ID", "tenant.onmicrosoft.com"),
            ("ENTRA_CLIENT_ID", "client id"),
            ("AZURE_AI_FOUNDRY_ENDPOINT", "http://resource.services.ai.azure.com"),
            ("AZURE_AI_FOUNDRY_ENDPOINT", "https://user@resource.services.ai.azure.com"),
            ("AZURE_AI_FOUNDRY_ENDPOINT", "https://resource.services.ai.azure.com?key=value"),
            ("UNKNOWN", "value"),
        ):
            self.assertIsNone(settings.validate_config(name, value), (name, value))
        invalid_env = {"ENTRA_TENANT_ID": "not-a-tenant-id"}
        self.assertFalse(settings.entra_sso_enabled(invalid_env))
        self.assertFalse(settings.config_status(invalid_env)[0]["configured"])

    def test_save_and_clear_config_use_injected_persistence(self):
        env = {}
        calls = []

        def persist(name, value):
            calls.append((name, value))
            return True

        tenant = "12345678-1234-1234-1234-123456789012"
        self.assertTrue(settings.save_config("ENTRA_TENANT_ID", tenant, persist=persist, env=env))
        self.assertEqual(settings.config_status(env)[0]["value"], tenant)
        self.assertTrue(settings.save_config("ENTRA_TENANT_ID", "", persist=persist, env=env))
        self.assertNotIn("ENTRA_TENANT_ID", env)
        self.assertEqual(calls, [("ENTRA_TENANT_ID", tenant), ("ENTRA_TENANT_ID", None)])


if __name__ == "__main__":
    unittest.main()
