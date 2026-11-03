import unittest

from dashboard.evidence_workspace import build_evidence_workspace
from dashboard.model import build_run_view


def steps(**states):
    keys = ("lead", "retrieve", "relevance", "admit", "extract", "review", "synthesis")
    return [{"key": key, "state": states.get(key, "todo")} for key in keys]


def pending_lead_row(index):
    return {
        "id": f"lead-{index}",
        "title": f"Lead {index}",
        "lead": {"id": f"lead-{index}"},
        "retrieved": False,
        "snapshotId": None,
        "state": "pending",
        "steps": steps(lead="done", retrieve="you"),
    }


def journey(**overrides):
    base = {
        "leads": [],
        "pendingRssLeadCount": 0,
        "sources": [],
        "brief": {"requirements": []},
    }
    base.update(overrides)
    return base


def parts(exceptions=None):
    return {"exceptions": exceptions or []}


class EvidenceWorkspaceTests(unittest.TestCase):
    def test_all_pending_184_leads_report_one_consolidated_blocker_and_no_captured_sources(self):
        rows = [pending_lead_row(i) for i in range(184)]
        view = build_evidence_workspace(
            journey(leads=[{"id": r["id"]} for r in rows], pendingRssLeadCount=184, sources=rows),
            parts(),
        )
        pipeline = view["pipeline"]
        self.assertEqual(pipeline["leads"]["count"], 184)
        self.assertEqual(pipeline["capturedSources"]["count"], 0)
        self.assertEqual(pipeline["acquisitionBlocker"]["kind"], "pending_rss")
        self.assertEqual(pipeline["acquisitionBlocker"]["leadCount"], 184)
        self.assertFalse(pipeline["stagesExclusive"])
        self.assertTrue(all(stage["count"] == 0 for stage in pipeline["stages"]))
        self.assertTrue(all(row["disposition"] == "metadata-only" for row in view["sourceExplorer"]))
        self.assertFalse(any(row["countsAsEvidence"] for row in view["sourceExplorer"]))

    def test_empty_requirements_and_no_exceptions_produce_empty_lists(self):
        view = build_evidence_workspace(journey(), parts())
        self.assertEqual(view["questions"], [])
        self.assertEqual(view["exceptions"], {"open": 0, "items": []})
        self.assertEqual(view["sourceExplorer"], [])
        self.assertIsNone(view["pipeline"]["acquisitionBlocker"])
        self.assertEqual(view["pipeline"]["leads"]["count"], 0)

    def test_mixed_stages_count_distinct_snapshots_and_do_not_form_an_exclusive_funnel(self):
        admitted = {
            "id": "row-a",
            "title": "Source A",
            "lead": None,
            "retrieved": True,
            "snapshotId": "snap-1",
            "state": "done",
            "steps": steps(retrieve="done", relevance="done", admit="done", review="done"),
        }
        repost = {**admitted, "id": "row-b", "title": "Repost of A"}
        provisional = {
            "id": "row-c",
            "title": "Source C",
            "lead": None,
            "retrieved": True,
            "snapshotId": "snap-2",
            "state": "provisional",
            "steps": steps(retrieve="done", relevance="done", review="provisional"),
        }
        view = build_evidence_workspace(
            journey(leads=[{"id": "l1"}, {"id": "l2"}], sources=[admitted, repost, provisional]),
            parts(),
        )
        pipeline = view["pipeline"]
        self.assertEqual(pipeline["capturedSources"]["count"], 2)
        stages = {stage["key"]: stage["count"] for stage in pipeline["stages"]}
        self.assertEqual(stages, {"relevant": 2, "admitted": 1, "reviewed": 1, "provisionallyReviewed": 1})
        self.assertFalse(pipeline["stagesExclusive"])
        self.assertTrue(all(stage["basis"] for stage in pipeline["stages"]))
        dispositions = {row["rowId"]: row["disposition"] for row in view["sourceExplorer"]}
        self.assertEqual(dispositions, {"row-a": "admitted", "row-b": "admitted", "row-c": "in-progress"})
        self.assertEqual([row["countsAsEvidence"] for row in view["sourceExplorer"]], [True, True, False])
        self.assertEqual(view["sourceExplorer"][0]["rowId"], admitted["id"])

    def test_captured_sources_count_only_persisted_snapshots(self):
        retrieved_no_snapshot = {
            "id": "row-r",
            "title": "Retrieved only",
            "lead": None,
            "retrieved": True,
            "snapshotId": None,
            "state": "in-progress",
            "steps": steps(retrieve="done", relevance="done"),
        }
        same_snapshot = {**retrieved_no_snapshot, "id": "row-s", "snapshotId": "snap-9", "retrieved": True}
        repost = {**same_snapshot, "id": "row-t"}
        view = build_evidence_workspace(journey(sources=[retrieved_no_snapshot, same_snapshot, repost]), parts())
        captured = view["pipeline"]["capturedSources"]
        self.assertEqual(captured["count"], 1)
        self.assertIn("persisted snapshots", captured["basis"])

    def test_relevance_done_excludes_not_relevant_verdicts(self):
        negative = {
            "id": "row-n",
            "title": "Off topic",
            "lead": None,
            "retrieved": True,
            "snapshotId": None,
            "state": "closed",
            "steps": steps(retrieve="done", relevance="closed"),
        }
        view = build_evidence_workspace(journey(sources=[negative]), parts())
        stages = {stage["key"]: stage["count"] for stage in view["pipeline"]["stages"]}
        self.assertEqual(stages["relevant"], 0)
        self.assertEqual(view["sourceExplorer"][0]["disposition"], "closed")

    def test_provisional_review_is_not_counted_as_completed_review(self):
        provisional = {
            "id": "row-p",
            "title": "Provisional",
            "lead": None,
            "retrieved": True,
            "snapshotId": "snap-p",
            "state": "provisional",
            "steps": steps(retrieve="done", relevance="done", admit="done", review="provisional"),
        }
        view = build_evidence_workspace(journey(sources=[provisional]), parts())
        stages = {stage["key"]: stage for stage in view["pipeline"]["stages"]}
        self.assertEqual(stages["reviewed"]["count"], 0)
        self.assertEqual(stages["provisionallyReviewed"]["count"], 1)
        self.assertIn("not a completed review", stages["provisionallyReviewed"]["basis"])

    def test_questions_preserve_typed_coverage_and_unknown_relation_stays_unassessed(self):
        requirements = [
            {"irId": "IR-1", "text": "Q1", "coverage": "partial", "sourceNoteIds": ["n1"], "observationIds": None},
            {"irId": "IR-2", "text": "Q2", "coverage": "contradicted", "sourceNoteIds": None, "observationIds": ["o1"]},
            {"irId": "IR-3", "text": "Q3", "coverage": "", "sourceNoteIds": None, "observationIds": None},
            {"irId": "IR-4", "text": "Q4", "coverage": "silent", "sourceNoteIds": None, "observationIds": None},
        ]
        view = build_evidence_workspace(journey(brief={"requirements": requirements}), parts())
        questions = {q["id"]: q for q in view["questions"]}
        self.assertEqual(questions["IR-1"]["coverage"], "partial")
        self.assertEqual(questions["IR-1"]["sourceNoteIds"], ["n1"])
        self.assertEqual(questions["IR-2"]["coverage"], "contradicted")
        self.assertEqual(questions["IR-2"]["observationIds"], ["o1"])
        self.assertEqual(questions["IR-3"]["coverage"], "unassessed")
        self.assertIsNone(questions["IR-3"]["sourceNoteIds"])
        self.assertEqual(questions["IR-4"]["coverage"], "silent")
        self.assertEqual(questions["IR-1"]["text"], "Q1")

    def test_exceptions_report_open_count_and_refs_and_state(self):
        exceptions = [
            {"id": "exc-1", "kind": "source", "status": "open", "relPath": "exceptions/exc-1.json"},
            {"id": "exc-2", "kind": "extract", "status": "closed", "relPath": "exceptions/exc-2.json"},
        ]
        view = build_evidence_workspace(journey(), parts(exceptions))
        self.assertEqual(view["exceptions"]["open"], 1)
        self.assertEqual(view["exceptions"]["items"][0], {
            "id": "exc-1", "kind": "source", "status": "open", "relPath": "exceptions/exc-1.json",
        })
        self.assertEqual(len(view["exceptions"]["items"]), 2)

    def test_run_view_journey_carries_projection_alongside_existing_keys(self):
        view = build_run_view("empty", [], [], [], "2026-10-26T00:00:00Z")
        journey_view = view["journey"]
        self.assertIn("evidenceWorkspace", journey_view)
        self.assertEqual(journey_view["evidenceWorkspace"]["schemaVersion"], 1)
        self.assertEqual(journey_view["evidenceWorkspace"]["questions"], journey_view["brief"]["requirements"])
        for key in ("phases", "queue", "brief", "leads", "sources", "memo"):
            self.assertIn(key, journey_view)

    def test_schema_version_is_present(self):
        view = build_evidence_workspace(journey(), parts())
        self.assertEqual(view["schemaVersion"], 1)
        self.assertEqual(set(view), {"schemaVersion", "pipeline", "questions", "exceptions", "sourceExplorer"})


if __name__ == "__main__":
    unittest.main()
