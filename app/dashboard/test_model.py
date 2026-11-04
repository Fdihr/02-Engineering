import unittest

from dashboard.model import (
    artifact_flags,
    build_run_view,
    build_source_view,
    derive_source_waiting,
    failure_counts,
    parse_events,
)
from dashboard.workflow_projection import project_workflow


def file_entry(rel_path, size=100):
    return {"relPath": rel_path, "size": size, "mtimeMs": 0}


class ModelTests(unittest.TestCase):
    def test_dashboard_and_runner_share_the_recommended_machine_action(self):
        projection = project_workflow({
            "runId": "run-1",
            "intentApproved": True,
            "evidenceAvailable": True,
            "committedOutcomes": [{"stage": "intent", "paths": ["runs/run-1/approved.json"]}],
            "readyWork": [
                {"id": "support-review", "stage": "assure", "actor": "human", "kind": "decision",
                 "title": "Review source support", "detail": "", "paths": ["runs/run-1/review-package.json"], "priority": 1},
                {"id": "challenge", "stage": "synthesise", "actor": "machine", "kind": "work",
                 "title": "Run Challenge", "detail": "", "paths": ["runs/run-1/challenge-request.json"], "priority": 1},
            ],
            "humanDecisions": [{"id": "support-review", "stage": "assure", "paths": []}],
            "interimCheckpoints": [{"id": "challenge", "stage": "synthesise", "paths": []}],
            "blockers": [],
        })
        self.assertEqual(projection["status"], "ready-machine")
        self.assertEqual(projection["recommendedNextAction"]["work"]["id"], "challenge")
        self.assertEqual(projection["readyWork"][0]["id"], "challenge")

    def test_scoped_exception_does_not_globally_block_dashboard_work(self):
        projection = project_workflow({
            "runId": "run-1",
            "intentApproved": True,
            "evidenceAvailable": True,
            "committedOutcomes": [],
            "readyWork": [
                {"id": "source-a", "stage": "assure", "actor": "machine", "kind": "work",
                 "title": "Process source A", "detail": "", "paths": ["runs/run-1/source-a.json"], "priority": 1},
                {"id": "source-b", "stage": "assure", "actor": "machine", "kind": "work",
                 "title": "Process source B", "detail": "", "paths": ["runs/run-1/source-b.json"], "priority": 1},
            ],
            "humanDecisions": [],
            "interimCheckpoints": [],
            "blockers": [{
                "id": "exception-a", "kind": "exception", "scope": "work",
                "paths": ["runs/run-1/exceptions/a.json", "runs/run-1/source-a.json"],
                "affectedWorkIds": ["source-a"], "uncertain": False,
                "title": "Source A exception", "detail": "Source A only.",
            }],
        })
        self.assertEqual(projection["recommendedNextAction"]["work"]["id"], "source-b")
        self.assertEqual(projection["blockers"][0]["affectedWorkIds"], ["source-a"])

    def test_local_article_capture_projects_once_and_does_not_invent_admission(self):
        from dashboard.journey import _source_rows
        path = "article-captures/article-1/article-capture.json"
        capture = {
            "schemaVersion": "local-article-capture-v1", "id": "article-1",
            "title": "Polish factory source", "timeStatus": "in-window",
            "response": {"finalUrl": "https://publisher.org/article", "receivedAt": "2026-11-03T10:00:00Z"},
        }
        relevance = {"sourceItemId": "article-1", "status": "assessed", "verdict": "relevant", "assessmentPath": "assessment.json"}
        rows = _source_rows({path: capture}, {}, [], [relevance], [], [], {}, None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Polish factory source")
        self.assertTrue(rows[0]["retrieved"])
        self.assertFalse(rows[0]["snapshotId"])
        self.assertNotEqual(next(step for step in rows[0]["steps"] if step["key"] == "admit")["state"], "done")
        previous = {**capture, "timeStatus": "unknown", "extractionVersion": "readability-0.6.0-jsdom-30.1.3-v1"}
        revised = {**capture, "extractionVersion": "readability-0.6.0-jsdom-30.1.3-v2"}
        full = {
            "article-captures/article-1/article-capture-v2.json": revised, path: previous,
            "article-admissions/article-1/article-admission-result.json": {"outcome": "exception"},
        }
        rows = _source_rows(full, {}, [], [{**relevance, "verdict": "partially-relevant"}], [], [], {}, None)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["retrieved"])
        self.assertEqual(next(step for step in rows[0]["steps"] if step["key"] == "admit")["state"], "closed")
        intake = "source-reintakes/article-1/intake-result.json"
        candidate = {
            "candidateId": "article-1", "relPath": intake, "title": capture["title"], "publisher": "publisher.org",
            "url": "https://publisher.org/article", "verdict": "relevant",
            "decision": {"outcome": "approved", "reviewerId": "controller:local-article-plan-v1:article-1", "snapshotId": "snapshot-article-1"},
        }
        full = {path: capture, intake: {"item": {"provider": "local_article", "providerItemId": "article-1"}}}
        rows = _source_rows(full, {}, [candidate], [relevance], [], [], {}, None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["snapshotId"], "snapshot-article-1")

        old = {**relevance, "verdict": "partially-relevant", "preparedAt": "2026-11-03T10:00:00Z"}
        new = {**relevance, "preparedAt": "2026-11-03T11:00:00Z", "candidateId": "reassessment-1"}
        candidate = {**candidate, "candidateId": "reassessment-1",
                     "decision": {**candidate["decision"], "snapshotId": "snapshot-reassessment-1"}}
        for queue in ([old, new], [new, old]):
            rows = _source_rows(full, {}, [candidate], queue, [], [], {}, None)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["snapshotId"], "snapshot-reassessment-1")
            self.assertEqual(next(s for s in rows[0]["steps"] if s["key"] == "relevance")["detail"], "Relevant")

    def test_empty_run_shows_pending_stages_without_publication_claim(self):
        view = build_run_view("empty", [], [], [], "2026-10-26T00:00:00Z")
        self.assertEqual(len(view["panel1"]["stages"]), 6)
        self.assertEqual(len(view["synthesis"]), 7)
        self.assertTrue(all(stage["status"] == "pending" for stage in view["synthesis"]))
        self.assertFalse(any("publication" in item for item in view["waitingOn"]))
        journey = view["journey"]
        self.assertEqual(journey["phases"][0]["state"], "active")
        self.assertEqual(journey["queue"][0]["target"], {"tab": "brief"})
        self.assertIsNone(journey["memo"])

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
        self.assertEqual(derive_source_waiting([stage("extract", "committed")]), "support review: check quotes and confirm question links")
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

    def test_events_expose_actor_id(self):
        events = parse_events([{"relPath": "events.jsonl", "lines": [
            '{"occurredAt":"2026-09-04T09:00:00Z","eventType":"a","actorType":"human","actorId":"demo.analyst"}',
            '{"occurredAt":"2026-09-04T08:00:00Z","eventType":"b","actorType":"controller"}',
        ]}])
        self.assertEqual(events[0]["actorId"], "demo.analyst")
        self.assertEqual(events[1]["actorId"], "")

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

    def test_leads_are_grouped_by_tier_and_never_capped(self):
        rel = "discoveries/dp-1/discovery-results.json"
        cands = [{"providerItemId": f"n{i}", "title": f"News {i}", "sourceType": "news", "score": 20 - i % 7,
                  "tier": 4, "tierLabel": "Other news or unrated source", "shortlisted": i < 50,
                  "sourceUrl": f"https://example.org/{i}"} for i in range(60)]
        cands.append({"providerItemId": "cr-1", "title": "Cyber Weekly", "sourceType": "analysis", "score": 3,
                      "tier": 1, "tierLabel": "Control Risks analyst report", "shortlisted": False})
        docs = [{"relPath": rel, "value": {"researchQuestionId": "rq", "candidates": cands}}]
        view = build_run_view("r", [file_entry(rel)], docs, [], "t")
        leads = view["journey"]["leads"]
        self.assertEqual(len(leads), 61)
        self.assertEqual((leads[0]["providerItemId"], leads[0]["tier"], leads[0]["shortlisted"]), ("cr-1", 1, False))
        self.assertEqual(len(view["panel1"]["candidates"]), 61)
        self.assertEqual(view["panel1"]["candidates"][0]["tier"], 1)
        journey = view["journey"]
        self.assertEqual(journey["pendingRssLeadCount"], 61)
        self.assertEqual(len(journey["sources"]), 61)
        self.assertTrue(all(lead["pendingRss"] for lead in leads))
        self.assertTrue(all(row["state"] == "pending" and row["action"] is None for row in journey["sources"]))
        self.assertEqual(next(f for f in journey["funnel"] if f["key"] == "pending_rss")["value"], 61)
        self.assertFalse(any("pull" in item["title"].lower() for item in journey["queue"]))

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
        self.assertNotIn("report", view)
        self.assertEqual(view["journey"]["leads"][0]["providerItemId"], "item-1")
        self.assertEqual(view["counts"]["openExceptions"], 1)
        self.assertIn("exception queue: 1 open", view["waitingOn"])
        self.assertIn("publication gate: blocked (provisional or synthetic lineage)", view["waitingOn"])
        self.assertEqual(view["journey"]["workflow"]["status"], "blocked")
        self.assertTrue(view["journey"]["workflow"]["blockers"][0]["uncertain"])
        exception_step = next(item for item in view["journey"]["queue"] if item["title"].startswith("Resolve "))
        self.assertIn("scope is uncertain", exception_step["detail"])

    def test_challenge_pending_is_distinct_from_checked_with_zero_findings(self):
        from dashboard.journey import _rounds

        build_path = "synthesis/records/build-1/synthesis-build-record.json"
        request_path = "synthesis/challenge/requests/challenge-1/challenge-request.json"
        build = {
            "recordedAt": "2026-11-03T10:00:00Z",
            "synthesis": {"sourceNoteIds": ["note-1"], "claims": []},
        }
        waiting = [{
            "stage": "challenge", "status": "awaiting-ai", "requestPath": request_path,
            "preparedAt": "2026-11-03T10:01:00Z",
        }]
        request = {"buildRecord": {"artifactRef": f"runs/r/{build_path}"}}
        pending, _ = _rounds("r", {build_path: build, request_path: request}, [], waiting)
        challenge = next(step for step in pending[0]["steps"] if step["key"] == "challenge")
        self.assertEqual(challenge["state"], "ai")
        self.assertEqual(pending[0]["challengeStatus"], "pending")

        challenge_path = "synthesis/challenge/records/challenge-1/challenge-record.json"
        recorded = {
            "recordedAt": "2026-11-03T10:02:00Z",
            "buildRecord": {"artifactRef": f"runs/r/{build_path}"},
            "metrics": {"challengesRaised": 0},
        }
        checked, _ = _rounds("r", {build_path: build, challenge_path: recorded, request_path: request}, [], [])
        challenge = next(step for step in checked[0]["steps"] if step["key"] == "challenge")
        self.assertEqual(challenge["state"], "done")
        self.assertEqual(challenge["detail"], "0 challenges raised")
        self.assertEqual(checked[0]["challengeStatus"], "checked")

        invalid_path = "synthesis/challenge/records/challenge-invalid/challenge-record.json"
        unavailable, _ = _rounds("r", {
            build_path: build,
            request_path: request,
            invalid_path: {"buildRecord": {"artifactRef": f"runs/r/{build_path}"}},
        }, [], [])
        challenge = next(step for step in unavailable[0]["steps"] if step["key"] == "challenge")
        self.assertEqual(challenge["state"], "failed")
        self.assertEqual(unavailable[0]["challengeStatus"], "unavailable")

    def test_dashboard_waits_for_the_current_round_before_offering_another_build(self):
        build_path = "synthesis/records/build-1/synthesis-build-record.json"
        request_path = "synthesis/challenge/requests/challenge-1/challenge-request.json"
        docs = {
            build_path: {
                "recordedAt": "2026-11-03T10:00:00Z",
                "synthesis": {"sourceNoteIds": ["note-old"], "claims": []},
            },
            request_path: {"buildRecord": {"artifactRef": f"runs/r/{build_path}"}},
            "assurance/snap-old/source-note-reviewed.json": {
                "id": "note-old", "candidateId": "candidate-old",
            },
            "assurance/snap-new/source-note-reviewed.json": {
                "id": "note-new", "candidateId": "candidate-new",
            },
        }
        view = build_run_view(
            "r", [file_entry(path) for path in docs],
            [{"relPath": path, "value": value} for path, value in docs.items()], [], "t",
        )
        journey = view["journey"]
        self.assertFalse(journey["readiness"]["currentRoundComplete"])
        self.assertFalse(journey["readiness"]["canBuild"])
        self.assertTrue(journey["readiness"]["newNotes"])
        self.assertFalse(any("Build a new synthesis round" in item["title"] for item in journey["queue"]))

    def test_journey_keeps_unretrieved_leads_pending_and_ignores_duplicate_retrieval(self):
        docs = {
            "discoveries/dp-1/discovery-results.json": {"researchQuestionId": "rq-1", "candidates": [
                {"providerItemId": "lead-1", "title": "Grid attack", "score": 7, "rawArtifactRefs": ["runs/r/raw.json"]},
                {"providerItemId": "lead-2", "title": "Other", "score": 3}]},
            "source-retrievals/ret-a/source-retrieval-result.json": {"providerItemId": "lead-1", "outcome": "resolved", "attemptedAt": "2026-10-26T08:00:00Z",
                                                                    "source": {"title": "Grid attack in full", "publisherHost": "example.org"}},
            "source-retrievals/ret-b/source-retrieval-result.json": {"providerItemId": "lead-1", "outcome": "resolved", "attemptedAt": "2026-10-26T09:00:00Z",
                                                                    "source": {"title": "Grid attack in full", "publisherHost": "example.org"}},
            "sources/ret-a/doc/question-relevance/req-a/question-relevance-request.json": {"sourceItemId": "ret-a", "preparedAt": "t"},
            "sources/ret-a/doc/question-relevance/req-a/assessments/a1/question-relevance-assessment.json": {"verdict": "relevant"},
            "sources/ret-b/doc/question-relevance/req-b/question-relevance-request.json": {"sourceItemId": "ret-b", "preparedAt": "t"},
            "source-reintakes/cand-1/intake-result.json": {
                "item": {"source": {"title": "Grid attack in full"}, "retrievalLineage": {"retrievalId": "ret-a", "sourceLeadProviderItemId": "lead-1"},
                         "questionRelevance": {"assessmentArtifactRef": "runs/r/sources/ret-a/doc/question-relevance/req-a/assessments/a1/question-relevance-assessment.json",
                                               "assessment": {"verdict": "relevant"}}},
                "decision": {"approvalStatus": "pending_human_review"}},
        }
        view = build_run_view("r", [file_entry(p) for p in docs], [{"relPath": p, "value": v} for p, v in docs.items()], [], "t")
        journey = view["journey"]
        self.assertEqual(len(journey["sources"]), 2)
        row = journey["sources"][0]
        self.assertEqual((row["id"], row["duplicates"], row["state"]), ("lead-1", 1, "action"))
        self.assertEqual(row["current"]["key"], "admit")
        self.assertEqual([s["state"] for s in row["steps"]], ["done", "done", "done", "you", "todo", "todo", "todo"])
        self.assertEqual(journey["queue"][0]["title"], "Decide whether to admit as evidence")
        self.assertEqual(sum(1 for q in journey["queue"] if q["phase"] == "evidence"), 1)
        self.assertEqual([lead["pendingRss"] for lead in journey["leads"]], [False, True])
        self.assertEqual((journey["sources"][1]["id"], journey["sources"][1]["state"]), ("lead-2", "pending"))
        self.assertEqual(journey["funnel"][1], {"key": "pending_rss", "label": "Waiting for RSS", "value": 1})
        self.assertEqual(journey["pendingRssLeadCount"], 1)
        self.assertEqual([lead["rowId"] for lead in journey["leads"]], ["lead-1", "lead-2"])

    def test_journey_marks_memo_out_of_date_when_a_newer_round_exists(self):
        def build(index, at):
            return {"recordedAt": at, "synthesis": {"sourceNoteIds": ["n1"], "claims": [{"id": f"c{index}", "statement": "S", "supportingSourceNoteIds": ["n1"]}]}}
        docs = {
            "synthesis/records/b1/synthesis-build-record.json": build(1, "2026-10-26T10:00:00Z"),
            "synthesis/records/b2/synthesis-build-record.json": build(2, "2026-10-26T12:00:00Z"),
            "synthesis/challenge/requests/c2/challenge-request.json": {"preparedAt": "2026-10-26T12:01:00Z",
                                                                      "buildRecord": {"artifactRef": "runs/r/synthesis/records/b2/synthesis-build-record.json"}},
            "memo/m1/memo.json": {"createdAt": "2026-10-26T11:00:00Z", "reviewStatus": "reviewed", "publicationBlockers": ["PROVISIONAL_MEMO_STANDARD"],
                                  "lineage": {"buildRecord": {"artifactRef": "runs/r/synthesis/records/b1/synthesis-build-record.json"}},
                                  "keyJudgments": [{"statement": {"text": "KJ", "claimIds": ["c1"]}, "confidence": {"level": "low"}}]},
        }
        view = build_run_view("r", [file_entry(p) for p in docs], [{"relPath": p, "value": v} for p, v in docs.items()], [], "t")
        journey = view["journey"]
        self.assertEqual([r["current"] for r in journey["rounds"]], [False, True])
        self.assertEqual([s["state"] for s in journey["rounds"][1]["steps"]], ["done", "ai", "todo", "todo", "todo"])
        memo = journey["memo"]
        self.assertEqual((memo["roundIndex"], memo["isCurrent"]), (1, False))
        self.assertEqual(memo["blockers"][0]["label"], "Memo standard still provisional")
        self.assertEqual(memo["keyJudgments"][0]["claimIds"], ["c1"])
        self.assertEqual(journey["queue"][0]["title"], "Run the AI Challenge")
        self.assertEqual(next(p for p in journey["phases"] if p["key"] == "memo")["state"], "active")
        self.assertEqual(view["synthesis"][4]["name"], "memo")
        self.assertNotEqual(view["synthesis"][4]["status"], "pending")


if __name__ == "__main__":
    unittest.main()
