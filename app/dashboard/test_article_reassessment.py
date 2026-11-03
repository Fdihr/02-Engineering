import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dashboard import article_reassessment as worker


class ArticleReassessmentTests(unittest.TestCase):
    def test_worker_preserves_one_invocation_and_records_before_admitting(self):
        for invalid_answer in (False, True):
            with self.subTest(invalid_answer=invalid_answer), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                directory = root / "reassessment"
                directory.mkdir()
                request_path = root / "request.json"
                request_path.write_text(json.dumps({
                    "id": "request-2", "sourceItemId": "article-1",
                    "researchQuestion": {}, "policy": {},
                    "sourceDocument": {"segments": []},
                }), encoding="utf-8")
                reserved = False
                calls = []

                def command(name, *args):
                    nonlocal reserved
                    calls.append((name, args))
                    if name == "article-reassessment" and args[0] == "prepare":
                        if reserved:
                            raise ValueError("Source reassessment reservation already exists")
                        reserved = True
                        return json.dumps({"authorizationPath": "auth.json", "requestPath": "request.json"})
                    if name == "article-reassessment":
                        return json.dumps({"directory": "reassessment", "requestPath": "request.json", "capturePath": "capture.json"})
                    if name == "record-question-relevance":
                        return "Output: assessment.json"
                    if name == "admit-article":
                        return "Outcome: approved\nSnapshot: snapshot.json"
                    raise AssertionError(name)

                invocation = {
                    "invocationId": "one-session", "provider": "github-copilot-sdk", "model": "configured-model",
                    "startedAt": "2026-11-03T10:00:00Z", "completedAt": "2026-11-03T10:01:00Z",
                    "freshSession": True,
                    "content": "not JSON" if invalid_answer else json.dumps({
                        "verdict": "not-relevant", "rationale": "Synthetic", "support": [], "limitations": ["Synthetic"]
                    }),
                }
                with patch.object(worker, "APP_DIR", root), patch.object(worker, "_command", side_effect=command), \
                     patch.object(worker, "resolve_model", return_value="configured-model"), \
                     patch.object(worker, "generate", return_value=invocation) as generate:
                    if invalid_answer:
                        with self.assertRaises(ValueError):
                            worker.run("approval.json")
                        self.assertTrue((directory / "failure.json").is_file())
                        self.assertFalse(any(name == "admit-article" for name, _ in calls))
                    else:
                        result = worker.run("approval.json")
                        self.assertFalse(result["sourceSupportApproved"])
                        self.assertEqual(result["fetches"], 0)
                        self.assertEqual([name for name, _ in calls][-2:], ["record-question-relevance", "admit-article"])
                    self.assertTrue((directory / "invocation.json").is_file())
                    self.assertTrue((directory / "generation-attempt.json").is_file())
                    with self.assertRaises(ValueError):
                        worker.run("approval.json")
                    generate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
