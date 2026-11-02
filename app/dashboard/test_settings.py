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
        firecrawl = next(r for r in rows if r["name"] == "FIRECRAWL_API_KEY")
        self.assertEqual(seerist, {"name": "SEERIST_API_KEY", "label": "Seerist", "set": True, "last4": "1234"})
        self.assertEqual(firecrawl["last4"], "")
        self.assertFalse(firecrawl["set"])
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
        env = {"SEERIST_API_KEY": KEY, "FIRECRAWL_API_KEY": KEY}
        cases = [(200, True, "Connected"), (401, False, "Seerist rejected the key"), (500, False, "Seerist answered with HTTP 500")]
        for status, ok, message in cases:
            result = settings.check_connection("SEERIST_API_KEY", env, opener=opener_returning(status))
            self.assertEqual((result["ok"], result["message"], result["status"]), (ok, message, status))
            self.assertNotIn(KEY, repr(result))
        self.assertEqual(settings.check_connection("FIRECRAWL_API_KEY", env, opener=opener_returning(403))["message"], "Firecrawl rejected the key")

        def failing(request, timeout=None):
            raise URLError("down " + KEY)

        result = settings.check_connection("SEERIST_API_KEY", env, opener=failing)
        self.assertEqual((result["ok"], result["status"], result["message"]), (False, None, "Could not reach Seerist"))
        self.assertNotIn(KEY, repr(result))

    def test_check_connection_sends_expected_request(self):
        opener = opener_returning(200)
        settings.check_connection("SEERIST_API_KEY", {"SEERIST_API_KEY": KEY}, opener=opener)
        settings.check_connection("FIRECRAWL_API_KEY", {"FIRECRAWL_API_KEY": KEY}, opener=opener)
        seerist, firecrawl = opener.calls
        self.assertEqual(seerist.full_url, settings.SEERIST_CHECK_URL)
        self.assertEqual(seerist.get_header("X-api-key"), KEY)
        self.assertEqual(firecrawl.full_url, settings.FIRECRAWL_CHECK_URL)
        self.assertEqual(firecrawl.get_header("Authorization"), "Bearer " + KEY)

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


if __name__ == "__main__":
    unittest.main()
