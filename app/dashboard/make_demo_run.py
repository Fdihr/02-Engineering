"""Write a synthetic demo run folder for viewing the dashboard locally.

Everything here is invented test data (example.org sources, fictional findings). It exists only so the
dashboard has realistic artefacts in every phase. Do not commit the output.

    py -m dashboard.make_demo_run [RUN_DIR]

RUN_DIR defaults to %TEMP%\\cti-demo-runs\\demo-run. A small sibling run is written beside it so the run list has
more than one entry. Serve with: py -m dashboard.server RUN_DIR --port 4317
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

MARKER = ".demo-run"
NOW = "2026-10-26T"


def _put(root: Path, rel: str, value) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, str):
        path.write_text(value, encoding="utf-8")
    else:
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _events(root: Path, rel: str, events: list[dict]) -> None:
    _put(root, rel, "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in events))


def _frame(root: Path, run_id: str, question: str) -> None:
    _put(root, "memo-scopes/scope-01/v1/approved-memo-scope.json", {
        "id": "scope-01", "version": 1, "status": "approved", "approvedBy": "demo.analyst", "approvedAt": NOW + "08:00:00Z",
        "purpose": {"value": "Inform the leadership briefing on exposure of wind-farm operations"},
        "threatTopic": {"value": "Industrial intrusion and sabotage affecting European wind operations"},
        "audience": {"value": "Vestas leadership"},
        "geographies": {"value": ["Europe"]},
        "timeWindow": {"value": {"from": "2026-08-26T00:00:00Z", "to": "2026-10-26T00:00:00Z"}},
        "requestedOutput": {"value": "memo"},
    })
    _put(root, "research-questions/rq-01/approved-research-question.json", {
        "id": "rq-01", "status": "approved", "approvedBy": "demo.analyst", "question": question,
        "rationale": "Leadership needs to know whether operational technology at wind sites is being targeted.",
        "geographies": ["Europe"], "timeWindow": {"from": "2026-08-26T00:00:00Z", "to": "2026-10-26T00:00:00Z"},
    })
    _put(root, "requirements/ir-approval-01/approved-requirements.json", {
        "approvalId": "ira-01", "researchQuestionId": "rq-01",
        "requirements": [
            {"id": "ir-01", "text": "Which threat actors are targeting European energy operational technology?"},
            {"id": "ir-02", "text": "Which wind-farm control-system exposures were reported in the window?"},
            {"id": "ir-03", "text": "Which supply-chain access routes into OT vendors were reported?"},
        ],
    })


def _source(root: Path, run_id: str, key: str, title: str, publisher: str, claims_text: str, observations: list[dict]) -> None:
    """One source taken all the way to a reviewed source note."""
    ret, req, cand, snap = f"ret-{key}", f"req-{key}", f"cand-{key}", f"snap-{key}"
    base = f"runs/{run_id}/"
    assess_ref = f"{base}sources/{ret}/doc/question-relevance/{req}/assessments/a1/question-relevance-assessment.json"
    _put(root, f"source-retrievals/{ret}/source-retrieval-result.json", {
        "providerItemId": f"lead-{key}", "outcome": "resolved", "attemptedAt": NOW + "09:00:00Z",
        "source": {"title": title, "publisherHost": publisher, "finalUrl": f"https://{publisher}/{key}"},
    })
    _put(root, f"sources/{ret}/doc/question-relevance/{req}/question-relevance-request.json", {
        "sourceItemId": ret, "preparedAt": NOW + "09:05:00Z", "sourceDocument": {"segments": [{"id": "s1"}, {"id": "s2"}]},
        "prompt": {"system": "Demo system prompt", "user": "Demo user prompt"},
    })
    _put(root, f"sources/{ret}/doc/question-relevance/{req}/assessments/a1/question-relevance-assessment.json", {"verdict": "relevant"})
    _put(root, f"source-reintakes/{cand}/intake-result.json", {
        "item": {
            "source": {"title": title, "publisherHost": publisher, "finalUrl": f"https://{publisher}/{key}"},
            "retrievalLineage": {"retrievalId": ret, "sourceLeadProviderItemId": f"lead-{key}"},
            "questionRelevance": {"assessmentArtifactRef": assess_ref, "assessment": {
                "verdict": "relevant", "rationale": "Directly addresses the approved question.",
                "support": [{"anchor": {"quote": observations[0]["quote"]}, "relationToQuestion": "Reports the activity"}],
                "limitations": ["Single reporting organisation"],
            }},
        },
        "decision": {"approvalStatus": "pending_human_review"},
    })
    _put(root, f"assurance/{snap}/extract/attempt-1/extract-request.json", {"candidateId": cand, "preparedAt": NOW + "09:30:00Z"})
    _put(root, f"assurance/{snap}/extract/attempt-1/checks.json", {"failures": []})
    _put(root, f"assurance/{snap}/extract/extract-commit.json", {"schemaVersion": "extract-v1"})
    _put(root, f"assurance/{snap}/review/review-package.json", {
        "observations": [{"observationId": o["observationId"], "text": o["text"], "quote": o["quote"], "claimKind": "event",
                          "attribution": {"kind": "direct"}, "irIds": ["ir-01"]} for o in observations],
        "requirements": [{"irId": "ir-01", "text": "Which threat actors are targeting European energy operational technology?"}],
        "modelDispositions": [{"irId": "ir-01", "disposition": "partial", "note": claims_text}],
    })
    _put(root, f"assurance/{snap}/review/review-record-reviewed.json", {"reviewerId": "demo.analyst", "supportPass": "performed"})
    _put(root, f"assurance/{snap}/source-note-reviewed.json", {
        "id": f"note-{key}", "candidateId": cand, "sourceIdentity": {"publisherHost": publisher}, "inScopeObservations": observations,
    })


def build_demo_run(run_dir: Path) -> None:
    run_id = run_dir.name
    base = f"runs/{run_id}/"
    question = "Are state-linked actors positioning to disrupt European wind-farm operations in the next quarter?"
    _frame(run_dir, run_id, question)

    _put(run_dir, "discoveries/dp-01/discovery-request.json", {"plan": {
        "queries": [{"search": "wind farm OT intrusion"}, {"search": "energy sector pre-positioning"}, {"search": "SCADA exposure Europe"}],
        "rankingTerms": ["wind", "SCADA", "pre-positioning", "OT"], "minimumScore": 4,
    }})
    leads = [
        ("a", "Utility OT intrusion linked to a state-aligned group", 12, 2),
        ("d", "Exposed turbine controllers found on public networks", 10, 2),
        ("b", "Remote-access compromise at an OT software vendor", 8, 3),
        ("c", "Ransomware group claims a Nordic manufacturer", 7, 3),
        ("e", "Opinion: wind security spending is rising", 5, 4),
    ]
    _put(run_dir, "discoveries/dp-01/discovery-results.json", {
        "planId": "dp-01", "researchQuestionId": "rq-01", "apiCalls": 6,
        "candidates": [{
            "providerItemId": f"lead-{key}", "title": title, "sourceType": "news" if tier > 2 else "analysis", "score": score,
            "tier": tier, "tierLabel": "Analyst report" if tier <= 2 else "News or unrated source", "shortlisted": True,
            "matchedTerms": ["wind", "OT"], "sourceUrl": f"https://example.org/{key}", "providerTimestamp": f"2026-10-{10 + i:02d}T08:00:00Z",
        } for i, (key, title, score, tier) in enumerate(leads)],
    })

    obs_a = [{"observationId": "obs-a1", "text": "A state-aligned group maintained access to a utility's control network for weeks.",
              "quote": "maintained access to the control network for several weeks"}]
    obs_d = [{"observationId": "obs-d1", "text": "Researchers counted 8,547 internet-exposed wind-turbine controllers in Europe.",
              "quote": "8,547 internet-exposed controllers across Europe"}]
    _source(run_dir, run_id, "a", "Utility OT intrusion linked to a state-aligned group", "example.org", "Corroborates actor interest", obs_a)
    _source(run_dir, run_id, "d", "Exposed turbine controllers found on public networks", "example.net", "Exposure, not compromise", obs_d)

    _events(run_dir, "evidence-events.jsonl", [
        {"decisionId": f"d-{key}", "sourceRunId": run_id, "occurredAt": NOW + "09:20:00Z", "actorType": "human", "actorId": "demo.analyst",
         "stage": "evidence_admission", "status": "completed", "eventType": "evidence.admission.approved", "snapshotId": f"snap-{key}",
         "intakeArtifactRef": f"{base}source-reintakes/cand-{key}/intake-result.json"}
        for key in ("a", "d")
    ])

    # Source b: retrieved, waiting for the AI relevance check.
    _put(run_dir, "source-retrievals/ret-b/source-retrieval-result.json", {
        "providerItemId": "lead-b", "outcome": "resolved", "attemptedAt": NOW + "10:00:00Z",
        "source": {"title": "Remote-access compromise at an OT software vendor", "publisherHost": "example.com", "finalUrl": "https://example.com/b"},
    })
    _put(run_dir, "sources/ret-b/doc/question-relevance/req-b/question-relevance-request.json", {
        "sourceItemId": "ret-b", "preparedAt": NOW + "10:05:00Z", "sourceDocument": {"segments": [{"id": "s1"}]},
        "prompt": {"system": "Demo system prompt", "user": "Demo user prompt"},
    })
    # Source c: relevant, evidence candidate waits for your admission decision.
    _put(run_dir, "source-retrievals/ret-c/source-retrieval-result.json", {
        "providerItemId": "lead-c", "outcome": "resolved", "attemptedAt": NOW + "10:10:00Z",
        "source": {"title": "Ransomware group claims a Nordic manufacturer", "publisherHost": "example.org", "finalUrl": "https://example.org/c"},
    })
    _put(run_dir, "sources/ret-c/doc/question-relevance/req-c/question-relevance-request.json", {
        "sourceItemId": "ret-c", "preparedAt": NOW + "10:12:00Z", "sourceDocument": {"segments": [{"id": "s1"}]},
        "prompt": {"system": "Demo system prompt", "user": "Demo user prompt"},
    })
    _put(run_dir, "sources/ret-c/doc/question-relevance/req-c/assessments/a1/question-relevance-assessment.json", {"verdict": "partially-relevant"})
    _put(run_dir, "source-reintakes/cand-c/intake-result.json", {
        "item": {
            "source": {"title": "Ransomware group claims a Nordic manufacturer", "publisherHost": "example.org", "finalUrl": "https://example.org/c"},
            "retrievalLineage": {"retrievalId": "ret-c", "sourceLeadProviderItemId": "lead-c"},
            "questionRelevance": {
                "assessmentArtifactRef": f"{base}sources/ret-c/doc/question-relevance/req-c/assessments/a1/question-relevance-assessment.json",
                "assessment": {"verdict": "partially-relevant", "rationale": "Industrial target, but no OT impact is reported.",
                               "support": [{"anchor": {"quote": "production was halted for two days"}, "relationToQuestion": "Industrial disruption"}],
                               "limitations": ["No wind-sector link"]},
            },
        },
        "decision": {"approvalStatus": "pending_human_review"},
    })

    # Synthesis round 1: built, challenged, adjudicated, key judgements chosen, memo written.
    build_ref = f"{base}synthesis/records/b1/synthesis-build-record.json"
    _put(run_dir, "synthesis/requests/b1/build-request.json", {"preparedAt": NOW + "11:00:00Z", "prompt": {"system": "Demo", "user": "Demo"}})
    _put(run_dir, "synthesis/records/b1/synthesis-build-record.json", {
        "id": "b1", "recordedAt": NOW + "11:10:00Z", "reviewStatus": "reviewed",
        "request": {"artifactRef": f"{base}synthesis/requests/b1/build-request.json"},
        "synthesis": {
            "sourceNoteIds": ["note-a", "note-d"],
            "claims": [
                {"id": "c1", "statement": "A state-aligned group held access to a European utility's control network for several weeks.",
                 "kind": "event", "confidence": {"level": "moderate", "rationale": "One direct report, partly corroborated."},
                 "supportingSourceNoteIds": ["note-a"], "supportingObservationIds": ["obs-a1"], "singleSourceDependent": True,
                 "confidenceCeiling": "moderate"},
                {"id": "c2", "statement": "Thousands of wind-turbine controllers in Europe are reachable from the internet.",
                 "kind": "event", "confidence": {"level": "high", "rationale": "Independent measurement."},
                 "supportingSourceNoteIds": ["note-d"], "supportingObservationIds": ["obs-d1"], "singleSourceDependent": True,
                 "confidenceCeiling": "high"},
            ],
            "questionCoverage": [{"irId": "ir-01", "disposition": "partial"}, {"irId": "ir-02", "disposition": "covered"}, {"irId": "ir-03", "disposition": "gap"}],
            "intelligenceGaps": ["No evidence yet on supply-chain access routes."],
        },
    })
    _put(run_dir, "synthesis/challenge/requests/c1/challenge-request.json", {"preparedAt": NOW + "11:20:00Z", "buildRecord": {"artifactRef": build_ref}})
    _put(run_dir, "synthesis/challenge/records/c1/challenge-record.json", {
        "recordedAt": NOW + "11:30:00Z", "buildRecord": {"artifactRef": build_ref},
        "request": {"artifactRef": f"{base}synthesis/challenge/requests/c1/challenge-request.json"},
        "metrics": {"challengesRaised": 1},
        "results": [{"id": "ch1", "claimId": "c1", "claimAlias": "C1", "check": "independence", "verdict": "challenge",
                     "rationale": "Only one reporting organisation supports the claim.",
                     "alternativeHypothesis": {"text": "The access was criminal rather than state-aligned."}}],
    })
    _put(run_dir, "synthesis/adjudication/c1/performed-adjudication.json", {
        "claims": [{"claimId": "c1", "status": "contested"}, {"claimId": "c2", "status": "accepted"}],
    })
    _put(run_dir, "synthesis/key-judgements/requests/k1/key-judgement-request.json", {"preparedAt": NOW + "11:40:00Z", "buildRecord": {"artifactRef": build_ref}})
    _put(run_dir, "synthesis/key-judgements/records/k1/key-judgement-record.json", {
        "recordedAt": NOW + "11:50:00Z", "buildRecord": {"artifactRef": build_ref},
        "request": {"artifactRef": f"{base}synthesis/key-judgements/requests/k1/key-judgement-request.json"},
        "selection": {
            "selections": [
                {"requirementId": "ir-01", "claimId": "c1", "judgementText": "State-aligned access to European utility OT is plausible but rests on one source.",
                 "confidence": "moderate", "status": "contested"},
                {"requirementId": "ir-02", "claimId": "c2", "judgementText": "Exposed turbine controllers are widespread across Europe.",
                 "confidence": "high", "status": "accepted"},
            ],
            "omissions": [{"requirementId": "ir-03", "reason": "No eligible claim."}],
            "requirementsWithoutEligibleClaim": ["ir-03"],
        },
    })
    _put(run_dir, "memo/requests/w1/writer-request.json", {"preparedAt": NOW + "12:00:00Z", "buildRecord": {"artifactRef": build_ref}})
    _put(run_dir, "memo/m1/memo.json", {
        "id": "m1", "createdAt": NOW + "12:10:00Z", "status": "draft", "reviewStatus": "reviewed", "limitedEvidence": True,
        "lineage": {"buildRecord": {"artifactRef": build_ref}},
        "bluf": [{"text": "Exposure of wind-farm controllers is widespread; targeting by state-aligned actors is plausible but rests on one source.", "claimIds": ["c1", "c2"]}],
        "keyJudgments": [
            {"statement": {"text": "State-aligned access to European utility OT is plausible but rests on one source.", "claimIds": ["c1"], "status": "contested", "openChallengeIds": ["ch1"]},
             "confidence": {"level": "moderate", "ceiling": "moderate", "rationale": "One direct report."}},
            {"statement": {"text": "Exposed turbine controllers are widespread across Europe.", "claimIds": ["c2"], "status": "accepted"},
             "confidence": {"level": "high", "ceiling": "high", "rationale": "Independent measurement."}},
        ],
        "analysis": [{"text": "Researchers counted 8,547 internet-exposed controllers across Europe.", "claimIds": ["c2"]}],
        "uncertainties": [{"text": "The actor attribution could instead be criminal.", "claimIds": ["c1"]}],
        "indicators": [{"text": "New scanning of turbine controller ports.", "claimIds": []}],
        "competingExplanations": [{"text": "The access was criminal rather than state-aligned.", "claimId": "c1", "status": "open"}],
        "gaps": [{"irId": "ir-03", "disposition": "gap"}],
        "sourcingSummary": {"text": "Two sources support the memo.", "claimBearingSourceCount": 2, "singleSourceDependent": True, "reportingDependencies": []},
        "limitations": ["Demo data only."],
        "publicationBlockers": ["PROVISIONAL_MEMO_STANDARD", "OPEN_KEY_JUDGEMENT_CONTEST"],
    })
    _put(run_dir, "memo/m1/memo.md", (
        "# Wind-farm OT exposure: demo memo\n\n"
        "## Bottom line\n\n"
        "Exposure of wind-farm controllers is widespread; targeting by state-aligned actors is plausible but rests on one source.\n\n"
        "## Key judgements\n\n"
        "1. State-aligned access to European utility OT is plausible but rests on one source. (moderate confidence)\n"
        "2. Exposed turbine controllers are widespread across Europe. (high confidence)\n\n"
        "## Analysis\n\n"
        "Researchers counted 8,547 internet-exposed controllers across Europe.\n\n"
        "## Gaps\n\n"
        "- No evidence yet on supply-chain access routes.\n"
    ))
    _put(run_dir, "memo/m1/verification.json", {
        "contentVerdict": "pass", "publicationVerdict": "blocked",
        "checks": [{"check": "citations-resolve", "status": "pass"}, {"check": "confidence-within-ceiling", "status": "pass"},
                   {"check": "memo-standard-approved", "status": "fail"}],
    })
    _put(run_dir, "memo/m1/publication-gate.json", {"status": "blocked", "humanApprovalAvailable": False})
    _events(run_dir, "events.jsonl", [
        {"occurredAt": NOW + "08:00:00Z", "eventType": "scope.approved", "actorType": "human", "actorId": "demo.analyst"},
        {"occurredAt": NOW + "08:30:00Z", "eventType": "discovery.completed", "actorType": "controller"},
        {"occurredAt": NOW + "09:20:00Z", "eventType": "evidence.admission.approved", "actorType": "human", "actorId": "demo.analyst"},
        {"occurredAt": NOW + "11:10:00Z", "eventType": "synthesis.build.recorded", "actorType": "controller"},
        {"occurredAt": NOW + "12:10:00Z", "eventType": "memo.recorded", "actorType": "controller"},
    ])


def build_sibling_run(run_dir: Path) -> None:
    _frame(run_dir, run_dir.name, "Which ransomware groups are active against European industrial manufacturers?")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a synthetic demo run for the dashboard.")
    parser.add_argument("run_dir", nargs="?", default=str(Path(tempfile.gettempdir()) / "cti-demo-runs" / "demo-run"))
    args = parser.parse_args(argv)
    run_dir = Path(args.run_dir).resolve()
    sibling = run_dir.parent / (run_dir.name + "-framed")
    for target in (run_dir, sibling):
        if target.exists():
            if not (target / MARKER).exists():
                print(f"Refusing to overwrite {target}: it was not created by this script.", file=sys.stderr)
                return 1
            shutil.rmtree(target)
        target.mkdir(parents=True)
        (target / MARKER).write_text("synthetic demo data\n", encoding="utf-8")
    build_demo_run(run_dir)
    build_sibling_run(sibling)
    print(f"Demo run written to {run_dir}")
    print(f"Serve it with: py -m dashboard.server \"{run_dir}\" --port 4317")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
