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
    def test_empty_run_shows_pending_stages_without_publication_claim(self):
        view = build_run_view("empty", [], [], [], "2026-10-26T00:00:00Z")
        self.assertEqual(len(view["panel1"]["stages"]), 6)
        self.assertEqual(len(view["synthesis"]), 8)
        self.assertTrue(all(stage["status"] == "pending" for stage in view["synthesis"]))
        self.assertFalse(any("publication" in item for item in view["waitingOn"]))

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

    def test_evidence_candidates_show_pending_until_a_human_decision_event(self):
        rel = "source-reintakes/cand-1/intake-result.json"
        intake = {
            "item": {
                "source": {"title": "Exposed wind OT", "publisherHost": "example.org", "finalUrl": "https://example.org/a"},
                "questionRelevance": {"assessment": {
                    "verdict": "partially-relevant", "rationale": "Why",
                    "support": [{"anchor": {"quote": "8,547 systems"}, "relationToQuestion": "Exposure"}],
                    "limitations": ["Not compromise"],
                }},
            },
            "decision": {"approvalStatus": "pending_human_review"},
        }
        pending = build_run_view("run-e", [file_entry(rel)], [{"relPath": rel, "value": intake}], [], "t")
        self.assertEqual(pending["counts"]["pendingEvidence"], 1)
        self.assertEqual(pending["evidenceReview"][0]["support"][0]["quote"], "8,547 systems")
        self.assertTrue(pending["waitingOn"][0].startswith("evidence review: 1"))

        event = ('{"decisionId":"d1","sourceRunId":"run-e","occurredAt":"2026-10-26T10:00:00Z","actorType":"human",'
                 '"actorId":"FDIHR","stage":"evidence_admission","status":"completed",'
                 '"intakeArtifactRef":"runs/run-e/' + rel + '","eventType":"evidence.admission.approved","snapshotId":"snapshot-d1"}')
        decided = build_run_view("run-e", [file_entry(rel)], [{"relPath": rel, "value": intake}],
                                 [{"relPath": "evidence-events.jsonl", "lines": [event]}], "t")
        self.assertEqual(decided["counts"]["pendingEvidence"], 0)
        self.assertEqual(decided["evidenceReview"][0]["decision"]["outcome"], "approved")
        self.assertEqual(decided["evidenceReview"][0]["decision"]["reviewerId"], "FDIHR")

    def test_assurance_review_is_pending_until_a_review_record_exists(self):
        package = "assurance/snap-1/review/review-package.json"
        value = {
            "observations": [{"observationId": "obs-1", "text": "Claim", "quote": "Quote text here", "claimKind": "event",
                              "attribution": {"kind": "direct"}, "irIds": ["ir-01"]}],
            "requirements": [{"irId": "ir-01", "text": "What?"}],
            "modelDispositions": [{"irId": "ir-01", "disposition": "partial", "note": "Some"}],
        }
        pending = build_run_view("r", [file_entry(package)], [{"relPath": package, "value": value}], [], "t")
        review = pending["assuranceReviews"][0]
        self.assertEqual((review["status"], pending["counts"]["awaitingReview"]), ("awaiting-review", 1))
        self.assertEqual(review["requirements"][0]["disposition"], "partial")
        record = "assurance/snap-1/review/review-record-reviewed.json"
        done = build_run_view("r", [file_entry(package), file_entry(record)],
                              [{"relPath": package, "value": value}, {"relPath": record, "value": {"reviewerId": "FDIHR", "supportPass": "performed"}}], [], "t")
        self.assertEqual(done["assuranceReviews"][0]["status"], "recorded")
        self.assertEqual(done["counts"]["awaitingReview"], 0)

    def test_ai_queue_waits_until_a_record_references_the_request(self):
        build = "synthesis/requests/b1/build-request.json"
        extract = "assurance/snap-1/extract/attempt-1/extract-request.json"
        docs = [{"relPath": build, "value": {"preparedAt": "2026-10-26T10:00:00Z"}},
                {"relPath": extract, "value": {"preparedAt": "2026-10-26T09:00:00Z"}}]
        pending = build_run_view("r", [file_entry(d["relPath"]) for d in docs], docs, [], "t")
        self.assertEqual([(i["label"], i["status"]) for i in pending["aiQueue"]],
                         [("Source extraction", "awaiting-ai"), ("Synthesis Build", "awaiting-ai")])
        self.assertEqual(pending["counts"]["awaitingAiStage"], 2)
        done_docs = docs + [
            {"relPath": "synthesis/records/b1/synthesis-build-record.json", "value": {"request": {"artifactRef": "runs/r/" + build}}},
            {"relPath": "assurance/snap-1/extract/attempt-1/checks.json", "value": {"failures": []}},
        ]
        done = build_run_view("r", [file_entry(d["relPath"]) for d in done_docs], done_docs, [], "t")
        self.assertEqual({i["status"] for i in done["aiQueue"]}, {"recorded"})
        self.assertEqual(done["counts"]["awaitingAiStage"], 0)

    def test_run_view_groups_synthesis_exceptions_and_waiting(self):
        files = [
            file_entry("memo-scopes/scope-01/v1/approved-memo-scope.json"),
            file_entry("research-questions/rq-01/approved-research-question.json"),
            file_entry("discoveries/dp-01/discovery-results.json"),
            file_entry("synthesis/build-record.json"),
            file_entry("synthesis/memo-provisional.json"),
            file_entry("exceptions/exc-001.json"),
        ]
        jsons = [
            {"relPath": "memo-scopes/scope-01/v1/approved-memo-scope.json", "value": {"id": "scope-01", "version": 1, "status": "approved", "purpose": {"value": "Purpose"}, "threatTopic": {"value": "Topic"}, "geographies": {"value": ["Europe"]}}},
            {"relPath": "research-questions/rq-01/approved-research-question.json", "value": {"id": "rq-01", "question": "What happened?", "rationale": "Why", "status": "approved"}},
            {"relPath": "discoveries/dp-01/discovery-results.json", "value": {"planId": "dp-01", "researchQuestionId": "rq-01", "apiCalls": 4, "candidates": [{"providerItemId": "item-1", "title": "Lead 1", "sourceType": "news", "score": 6}]}},
            {"relPath": "synthesis/build-record.json", "value": {"limitedEvidence": True, "provisional": True}},
            {"relPath": "synthesis/memo-provisional.json", "value": {"reviewStatus": "provisional"}},
            {"relPath": "exceptions/exc-001.json", "value": {"id": "exc-001", "kind": "bounded-failure", "status": "open", "raisedAt": "2026-09-04T10:00:00Z"}},
        ]
        view = build_run_view("run-synth", files, jsons, [], "2026-09-07T00:00:00Z")
        self.assertEqual(view["panel1"]["scope"]["id"], "scope-01")
        self.assertEqual(len(view["panel1"]["candidates"]), 1)
        self.assertEqual(view["synthesis"][0]["status"], "provisional")
        self.assertEqual(view["report"]["profiles"][0]["id"], "rsm")
        self.assertEqual(len(view["report"]["rsmPillars"]), 3)
        self.assertEqual(view["counts"]["openExceptions"], 1)
        self.assertIn("exception queue: 1 open", view["waitingOn"])
        self.assertIn("publication gate: blocked (provisional or synthetic lineage)", view["waitingOn"])


if __name__ == "__main__":
    unittest.main()
