import unittest

from dashboard.model import (
    artifact_flags,
    build_run_view,
    build_source_view,
    derive_source_waiting,
    failure_counts,
    parse_events,
)


def file_entry(rel_path, size=100):
    return {"relPath": rel_path, "size": size, "mtimeMs": 0}


class ModelTests(unittest.TestCase):
    def test_failure_counts_accepts_nested_arrays_and_rejects_invalid_values(self):
        self.assertEqual(
            failure_counts({"failures": [{"check": "E2", "count": 2}, {"check": "E3", "count": 14}]}),
            {"E2": 2, "E3": 14},
        )
        self.assertEqual(failure_counts([{"check": "E3", "count": 15}]), {"E3": 15})
        self.assertEqual(failure_counts("not a check list"), {})
        self.assertEqual(artifact_flags({"provisional": True, "schemaVersion": "schema-v1"}), ["provisional", "schema-v1"])

    def test_source_view_groups_extract_attempts_and_review_artifacts(self):
        root = "assurance/snapshot-synth-001/"
        paths = [
            "extract/attempt-1/request.json",
            "extract/attempt-1/checks.json",
            "extract/attempt-2/checks.json",
            "extract/extract-failed.json",
            "extract-2/attempt-1/checks.json",
            "extract-2/extract-commit.json",
            "review/review-package.json",
            "review/review-record-provisional.json",
            "source-note-provisional.json",
            "metrics-provisional.json",
        ]
        files = [file_entry(root + item) for item in paths]
        json_by_path = {
            root + "extract/attempt-1/checks.json": {"failures": [{"check": "E2", "count": 2}, {"check": "E3", "count": 14}]},
            root + "extract/attempt-2/checks.json": [{"check": "E3", "count": 15}],
            root + "extract-2/extract-commit.json": {"schemaVersion": "extract-v1"},
            root + "review/review-record-provisional.json": {"supportPass": "not-performed"},
            root + "source-note-provisional.json": {"reviewStatus": "provisional", "schemaVersion": "note-v1"},
        }
        local_files = [{**item, "relPath": item["relPath"][len(root):]} for item in files]
        local_json = {key[len(root):]: value for key, value in json_by_path.items()}

        view = build_source_view("snapshot-synth-001", local_files, local_json)
        self.assertEqual([stage["name"] for stage in view["stages"]], ["extract", "extract-2", "review", "source note", "metrics"])
        self.assertEqual(view["stages"][0]["status"], "failed")
        self.assertEqual(view["stages"][0]["failures"], {"E2": 2, "E3": 29})
        self.assertEqual(view["stages"][1]["status"], "committed")
        self.assertEqual(view["stages"][2]["status"], "provisional")
        self.assertEqual(view["waitingOn"], "provisional: a real review would supersede this note")

    def test_waiting_surface_follows_the_source_stage_order(self):
        def stage(name, status):
            return {"name": name, "status": status, "attempts": 0, "failures": {}, "artifacts": []}

        self.assertEqual(derive_source_waiting([stage("extract", "failed")]), "bounded failure: authorise a re-run or accept as a gap")
        self.assertEqual(derive_source_waiting([stage("extract", "in-progress")]), "model step: run the pending request and record the response")
        self.assertEqual(derive_source_waiting([stage("extract", "committed")]), "support pass: verdicts, dispositions, assessment")
        self.assertEqual(derive_source_waiting([stage("extract", "committed"), stage("review", "reviewed")]), "assemble")
        self.assertIsNone(derive_source_waiting([stage("extract", "committed"), stage("review", "reviewed"), stage("source note", "reviewed"), stage("metrics", "committed")]))

    def test_events_skip_malformed_lines_and_sort_newest_first(self):
        events = parse_events([{"relPath": "events.jsonl", "lines": [
            '{"occurredAt":"2026-09-04T09:00:00Z","eventType":"first","actorType":"controller"}',
            "not json",
            '{"occurredAt":"2026-09-04T09:30:00Z","eventType":"second","attempt":2}',
        ]}])
        self.assertEqual([event["type"] for event in events], ["second", "first"])
        self.assertEqual(events[0]["attempt"], 2)

    def test_run_view_groups_synthesis_exceptions_and_waiting(self):
        files = [
            file_entry("synthesis/build-record.json"),
            file_entry("synthesis/memo-provisional.json"),
            file_entry("exceptions/exc-001.json"),
        ]
        jsons = [
            {"relPath": "synthesis/build-record.json", "value": {"limitedEvidence": True, "provisional": True}},
            {"relPath": "synthesis/memo-provisional.json", "value": {"reviewStatus": "provisional"}},
            {"relPath": "exceptions/exc-001.json", "value": {"id": "exc-001", "kind": "bounded-failure", "status": "open", "raisedAt": "2026-09-04T10:00:00Z"}},
        ]
        view = build_run_view("run-synth", files, jsons, [], "2026-09-07T00:00:00Z")
        self.assertEqual(view["synthesis"][0]["status"], "provisional")
        self.assertEqual(view["counts"]["openExceptions"], 1)
        self.assertIn("exception queue: 1 open", view["waitingOn"])
        self.assertIn("publication gate: blocked (provisional or synthetic lineage)", view["waitingOn"])


if __name__ == "__main__":
    unittest.main()
