"""Analyst-facing projection of one run: phases, next actions, source lifecycle, synthesis rounds and memo trace.

Every state here is derived from committed artefacts; nothing in this module advances the workflow.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any
from urllib.parse import urlsplit

from .evidence_workspace import build_evidence_workspace
from .workflow_projection import project_workflow
PHASES = (
    ("frame", "Frame"),
    ("collect", "Collect"),
    ("evidence", "Admit evidence"),
    ("assure", "Assure sources"),
    ("synthesise", "Synthesise"),
    ("memo", "Memo"),
)
SOURCE_STEPS = (
    ("lead", "Lead", "collect"),
    ("retrieve", "Retrieved", "evidence"),
    ("relevance", "Relevance", "evidence"),
    ("admit", "Admitted", "evidence"),
    ("extract", "Extracted", "assure"),
    ("review", "Reviewed", "assure"),
    ("synthesis", "In synthesis", "synthesise"),
)
ROUND_STEPS = (
    ("build", "Build", "synthesise"),
    ("challenge", "Challenge", "synthesise"),
    ("adjudicate", "Adjudicate", "synthesise"),
    ("key-judgements", "Key judgements", "memo"),
    ("memo", "Memo", "memo"),
)
BLOCKERS = {
    "PROVISIONAL_MEMO_STANDARD": (
        "Memo standard still provisional",
        "memo-standard-v1 has not been approved, so no memo can be published yet. The memo can still be read internally.",
    ),
    "OPEN_KEY_JUDGEMENT_CONTEST": (
        "A key judgement is contested",
        "At least one key judgement rests on a claim with an upheld challenge. Resolve it in a new synthesis round or keep it visibly contested.",
    ),
    "PROVISIONAL_SOURCE_LINEAGE": (
        "Provisional sources in the lineage",
        "At least one source skipped the support pass. Complete its source review, then build a new synthesis round.",
    ),
    "SYNTHETIC_SOURCE_LINEAGE": (
        "Synthetic test data",
        "The memo rests on synthetic inputs and can never be published.",
    ),
    "LEGACY_SCOPE_LINEAGE_UNAVAILABLE": (
        "Scope approval missing",
        "The approved question carries no checksum-bound scope approval.",
    ),
}
# Higher rank = closer to a finished memo; the work queue finishes in-flight work first.
PHASE_RANK = {key: index for index, (key, _) in enumerate(PHASES)}

DISCOVERY = re.compile(r"^discoveries/([^/]+)/discovery-results\.json$")
UNTIERED = 9
PROVIDER_INTAKE = re.compile(r"^provider-intakes/[^/]+/([^/]+)/intake-result\.json$")
RETRIEVAL = re.compile(r"^source-retrievals/([^/]+)/source-retrieval-result\.json$")
EXTRACT_REQUEST = re.compile(r"^assurance/([^/]+)/extract/attempt-\d+/extract-request\.json$")
SOURCE_NOTE = re.compile(r"^assurance/([^/]+)/source-note-(reviewed|provisional)\.json$")
BUILD_RECORD = re.compile(r"^synthesis/records/[^/]+/synthesis-build-record\.json$")
CHALLENGE_RECORD = re.compile(r"^synthesis/challenge/records/[^/]+/challenge-record\.json$")
KJ_RECORD = re.compile(r"^synthesis/key-judgements/records/[^/]+/key-judgement-record\.json$")
MEMO_FILE = re.compile(r"^memo/([^/]+)/memo\.json$")


def _rec(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _arr(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _txt(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _num(value: Any) -> int | float:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def _ref(record: dict[str, Any], key: str) -> str:
    return _txt(_rec(record.get(key)).get("artifactRef"))


def _humanise(value: str) -> str:
    return re.sub(r"[_-]+", " ", value or "").strip()


def _step(key: str, label: str, state: str, detail: str = "", action: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"key": key, "label": label, "state": state, "detail": detail, "action": action}


def _settle(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Steps after an unfinished step cannot have started; after a closed or failed step they never will."""
    halted = ""
    for step in steps:
        if halted:
            step.update(state="skipped" if halted in ("closed", "failed") else "todo", detail="", action=None)
        elif step["state"] not in ("done", "provisional"):
            halted = step["state"]
    return steps


def _summary(steps: list[dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    for state in ("you", "ai"):
        found = next((s for s in steps if s["state"] == state), None)
        if found:
            return "action", found
    for state, summary in (("failed", "failed"), ("closed", "closed"), ("system", "progress"), ("ready", "ready")):
        found = next((s for s in steps if s["state"] == state), None)
        if found:
            return summary, found
    pending = next((s for s in steps if s["state"] == "pending"), None)
    if pending:
        return "pending", pending
    provisional = next((s for s in steps if s["state"] == "provisional"), None)
    if provisional and steps[-1]["state"] == "done":
        return "provisional", provisional
    if steps[-1]["state"] == "done":
        return "done", steps[-1]
    return "progress", next((s for s in steps if s["state"] != "done"), steps[-1])


def _leads_and_discoveries(full: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    leads: dict[str, dict[str, Any]] = {}
    discoveries: list[dict[str, Any]] = []
    for rel in sorted(full):
        match = DISCOVERY.match(rel)
        if not match:
            continue
        value = _rec(full[rel])
        plan = _rec(_rec(full.get(f"discoveries/{match.group(1)}/discovery-request.json")).get("plan"))
        candidates = _arr(value.get("candidates"))
        discoveries.append({
            "planId": match.group(1),
            "relPath": rel,
            "researchQuestionId": _txt(value.get("researchQuestionId")),
            "apiCalls": _num(value.get("apiCalls")),
            "candidateCount": len(candidates),
            "queries": [_txt(_rec(q).get("search")) for q in _arr(plan.get("queries")) if _txt(_rec(q).get("search"))],
            "rankingTerms": [str(term) for term in _arr(plan.get("rankingTerms"))],
            "minimumScore": _num(plan.get("minimumScore")),
        })
        for candidate in candidates:
            item = _rec(candidate)
            item_id = _txt(item.get("providerItemId"))
            if not item_id:
                continue
            raw_refs = _arr(item.get("rawArtifactRefs"))
            lead = {
                "providerItemId": item_id,
                "title": _txt(item.get("title")) or "(untitled)",
                "sourceType": _txt(item.get("sourceType")) or "unknown",
                "score": _num(item.get("score")),
                # Searches run before tiering have no tier; they were already the cut shortlist.
                "tier": _num(item.get("tier")) or UNTIERED,
                "tierLabel": _txt(item.get("tierLabel")) or "Not tiered (earlier search)",
                "shortlisted": item.get("shortlisted") is not False,
                "matchedTerms": [str(term) for term in _arr(item.get("matchedTerms"))],
                "sourceUrl": _txt(item.get("sourceUrl")),
                "providerTimestamp": _txt(item.get("providerTimestamp")),
                "researchQuestionId": _txt(value.get("researchQuestionId")),
                "rawArtifactRef": raw_refs[0] if raw_refs and isinstance(raw_refs[0], str) else "",
                "discoveryRelPath": rel,
            }
            previous = leads.get(item_id)
            rank = (lead["tier"] != UNTIERED, lead["score"])
            if previous is None or rank > (previous["tier"] != UNTIERED, previous["score"]):
                leads[item_id] = lead
    return leads, discoveries


def _note_index(full: dict[str, Any], candidates: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    notes: dict[str, dict[str, Any]] = {}
    for rel in sorted(full):
        match = SOURCE_NOTE.match(rel)
        if not match:
            continue
        value = _rec(full[rel])
        note_id = _txt(value.get("id"))
        if not note_id:
            continue
        candidate = candidates.get(_txt(value.get("candidateId")), {})
        observations = {}
        for group in ("inScopeObservations", "outOfIrObservations"):
            for obs in _arr(value.get(group)):
                obs = _rec(obs)
                if _txt(obs.get("observationId")):
                    observations[obs["observationId"]] = {"text": _txt(obs.get("text")), "quote": _txt(obs.get("quote"))}
        notes[note_id] = {
            "noteId": note_id,
            "relPath": rel,
            "snapshotId": match.group(1),
            "reviewStatus": match.group(2),
            "candidateId": _txt(value.get("candidateId")),
            "title": _txt(candidate.get("title")) or _txt(_rec(value.get("sourceIdentity")).get("publisherHost")) or match.group(1),
            "url": _txt(candidate.get("url")),
            "publisher": _txt(candidate.get("publisher")) or _txt(_rec(value.get("sourceIdentity")).get("publisherHost")),
            "observations": observations,
        }
    return notes


def _rounds(run_id: str, full: dict[str, Any], adjudications: list[dict[str, Any]], ai_queue: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    prefix = f"runs/{run_id}/"
    builds = []
    for rel in full:
        if BUILD_RECORD.match(rel):
            record = _rec(full[rel])
            builds.append((_txt(record.get("recordedAt")), rel, record))
    builds.sort()

    def latest_by_build(pattern: re.Pattern[str]) -> dict[str, tuple[str, dict[str, Any]]]:
        found: dict[str, tuple[str, str, dict[str, Any]]] = {}
        for rel in full:
            if pattern.match(rel):
                record = _rec(full[rel])
                key = _ref(record, "buildRecord")
                stamp = _txt(record.get("recordedAt"))
                if key and (key not in found or stamp >= found[key][0]):
                    found[key] = (stamp, rel, record)
        return {key: (rel, record) for key, (_, rel, record) in found.items()}

    challenges = latest_by_build(CHALLENGE_RECORD)
    key_judgements = latest_by_build(KJ_RECORD)
    adjudication_by_record = {item["challengeRecordPath"]: item for item in adjudications}
    memos: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for rel in full:
        match = MEMO_FILE.match(rel)
        if match:
            memo = _rec(full[rel])
            memos[_ref(_rec(memo.get("lineage")), "buildRecord")].append((_txt(memo.get("createdAt")), rel))
    pending: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pending_builds = []
    for item in ai_queue:
        if item["status"] != "awaiting-ai":
            continue
        if item["stage"] == "build":
            pending_builds.append(item)
        elif item["stage"] in ("challenge", "key-judgements", "memo-writer"):
            pending[_ref(_rec(full.get(item["requestPath"])), "buildRecord")].append(item)

    rounds = []
    for index, (recorded_at, rel, record) in enumerate(builds, start=1):
        ref = prefix + rel
        synthesis = _rec(record.get("synthesis"))
        build_claims = {_txt(_rec(c).get("id")): _rec(c) for c in _arr(synthesis.get("claims")) if _txt(_rec(c).get("id"))}
        waiting = {item["stage"]: item for item in pending.get(ref, [])}
        steps = [_step("build", "Build", "done", f"{len(build_claims)} claims from {len(_arr(synthesis.get('sourceNoteIds')))} source notes")]

        challenge_rel, challenge = challenges.get(ref, ("", {}))
        adjudication = adjudication_by_record.get(challenge_rel)
        challenge_status = "failed"
        if challenge_rel:
            raised_value = _rec(challenge.get("metrics")).get("challengesRaised")
            if isinstance(raised_value, (int, float)) and not isinstance(raised_value, bool):
                challenge_status = "checked"
                steps.append(_step("challenge", "Challenge", "done", f"{raised_value} challenges raised"))
            else:
                challenge_status = "unavailable"
                steps.append(_step("challenge", "Challenge", "failed", "Challenge record metrics are unavailable"))
        elif "challenge" in waiting:
            challenge_status = "pending"
            steps.append(_step("challenge", "Challenge", "ai", "Waiting for the AI Challenge", {"kind": "ai-stage", "item": waiting["challenge"]}))
        else:
            steps.append(_step("challenge", "Challenge", "failed", "Challenge request was not prepared"))

        if adjudication and adjudication["status"] == "adjudicated":
            statuses = [c["status"] for c in adjudication["claims"]]
            detail = f"{statuses.count('accepted')} accepted · {statuses.count('contested')} contested · {statuses.count('rejected')} rejected"
            steps.append(_step("adjudicate", "Adjudicate", "done", detail))
        elif adjudication:
            raised = sum(len(c["challenges"]) for c in adjudication["claims"])
            steps.append(_step("adjudicate", "Adjudicate", "you", f"{raised} challenges need your decision", {"kind": "adjudicate", "challengeRecordPath": challenge_rel}))
        else:
            steps.append(_step("adjudicate", "Adjudicate", "todo"))

        kj_rel, kj = key_judgements.get(ref, ("", {}))
        selection = _rec(kj.get("selection"))
        if kj_rel:
            steps.append(_step("key-judgements", "Key judgements", "done", f"{len(_arr(selection.get('selections')))} selected · {len(_arr(selection.get('omissions')))} omitted"))
        elif "key-judgements" in waiting:
            steps.append(_step("key-judgements", "Key judgements", "ai", "Waiting for the AI selection", {"kind": "ai-stage", "item": waiting["key-judgements"]}))
        elif adjudication and adjudication["status"] == "adjudicated":
            steps.append(_step("key-judgements", "Key judgements", "ready", "Not prepared yet", {"kind": "prepare-key-judgements", "challengeRecordPath": challenge_rel}))
        else:
            steps.append(_step("key-judgements", "Key judgements", "todo"))

        round_memos = sorted(memos.get(ref, []))
        if round_memos:
            steps.append(_step("memo", "Memo", "done", f"{len(round_memos)} memo version(s)"))
        elif "memo-writer" in waiting:
            steps.append(_step("memo", "Memo", "ai", "Waiting for the AI memo writer", {"kind": "ai-stage", "item": waiting["memo-writer"]}))
        elif kj_rel:
            steps.append(_step("memo", "Memo", "ready", "Not prepared yet", {"kind": "prepare-memo-writer", "keyJudgementRecordPath": kj_rel}))
        else:
            steps.append(_step("memo", "Memo", "todo"))

        claims = []
        adjudicated = {c["claimId"]: c for c in (adjudication or {}).get("claims", [])}
        for claim_id, claim in build_claims.items():
            judged = adjudicated.get(claim_id, {})
            claims.append({
                "claimId": claim_id,
                "alias": judged.get("alias", ""),
                "statement": _txt(claim.get("statement")),
                "kind": _txt(claim.get("kind")),
                "confidence": _txt(_rec(claim.get("confidence")).get("level")),
                "confidenceRationale": _txt(_rec(claim.get("confidence")).get("rationale")),
                "ceiling": _txt(claim.get("confidenceCeiling")),
                "singleSource": claim.get("singleSourceDependent") is True,
                "noteIds": [str(n) for n in _arr(claim.get("supportingSourceNoteIds"))],
                "observationIds": [str(o) for o in _arr(claim.get("supportingObservationIds"))],
                "challenges": judged.get("challenges", []),
                "status": judged.get("status", ""),
            })
        rounds.append({
            "index": index,
            "id": _txt(record.get("id")),
            "buildPath": rel,
            "recordedAt": recorded_at,
            "reviewStatus": _txt(record.get("reviewStatus")),
            "limitedEvidence": record.get("limitedEvidence") is True,
            "noteIds": [str(n) for n in _arr(synthesis.get("sourceNoteIds"))],
            "coverage": [_coverage_entry(c) for c in _arr(synthesis.get("questionCoverage"))],
            "gaps": [str(g) for g in _arr(synthesis.get("intelligenceGaps"))],
            "claims": claims,
            "challengeRecordPath": challenge_rel,
            "challengeStatus": challenge_status,
            "adjudicationStatus": (adjudication or {}).get("status", ""),
            "adjudicationPath": (adjudication or {}).get("adjudicationPath", ""),
            "keyJudgements": {
                "path": kj_rel,
                "selections": [
                    {
                        "requirementId": _txt(_rec(s).get("requirementId")),
                        "claimId": _txt(_rec(s).get("claimId")),
                        "text": _txt(_rec(s).get("judgementText")),
                        "confidence": _txt(_rec(s).get("confidence")),
                        "status": _txt(_rec(s).get("status")),
                    }
                    for s in _arr(selection.get("selections"))
                ],
                "omissions": [{"requirementId": _txt(_rec(o).get("requirementId")), "reason": _txt(_rec(o).get("reason"))} for o in _arr(selection.get("omissions"))],
                "withoutClaim": [str(r) for r in _arr(selection.get("requirementsWithoutEligibleClaim"))],
            } if kj_rel else None,
            "memoPaths": [rel_path for _, rel_path in round_memos],
            "steps": _settle(steps),
            "current": False,
        })
    if rounds:
        rounds[-1]["current"] = True
    next_build = None
    if pending_builds:
        latest = max(pending_builds, key=lambda item: item["preparedAt"])
        if not builds or latest["preparedAt"] > builds[-1][0]:
            next_build = {"index": len(rounds) + 1, "item": latest}
    return rounds, next_build


def _memo_view(run_id: str, full: dict[str, Any], rounds: list[dict[str, Any]], notes: dict[str, dict[str, Any]], requirements: dict[str, str]) -> dict[str, Any] | None:
    found = sorted((_txt(_rec(full[rel]).get("createdAt")), rel) for rel in full if MEMO_FILE.match(rel))
    if not found:
        return None
    _, rel = found[-1]
    memo = _rec(full[rel])
    folder = rel.rsplit("/", 1)[0]
    build_ref = _ref(_rec(memo.get("lineage")), "buildRecord")
    round_index = next((r["index"] for r in rounds if f"runs/{run_id}/{r['buildPath']}" == build_ref), 0)
    memo_round = next((r for r in rounds if r["index"] == round_index), None)

    def statement(entry: Any) -> dict[str, Any]:
        entry = _rec(entry)
        body = _rec(entry.get("statement")) or entry
        confidence = _rec(entry.get("confidence"))
        return {
            "text": _txt(body.get("text")),
            "claimIds": [str(c) for c in _arr(body.get("claimIds"))],
            "status": _txt(body.get("status")),
            "openChallengeIds": [str(c) for c in _arr(body.get("openChallengeIds"))],
            "confidence": _txt(confidence.get("level")),
            "ceiling": _txt(confidence.get("ceiling")),
            "confidenceRationale": _txt(confidence.get("rationale")),
        }

    claims: dict[str, Any] = {}
    for claim in (memo_round or {}).get("claims", []):
        sources = []
        for note_id in claim["noteIds"]:
            note = notes.get(note_id)
            if not note:
                sources.append({"noteId": note_id, "title": note_id, "url": "", "publisher": "", "quotes": []})
                continue
            quotes = [note["observations"][o] for o in claim["observationIds"] if o in note["observations"]]
            sources.append({"noteId": note_id, "title": note["title"], "url": note["url"], "publisher": note["publisher"],
                            "reviewStatus": note["reviewStatus"], "quotes": quotes})
        claims[claim["claimId"]] = {**{k: claim[k] for k in ("statement", "kind", "confidence", "status", "singleSource", "alias")}, "sources": sources}

    verification = _rec(full.get(f"{folder}/verification.json"))
    gate = _rec(full.get(f"{folder}/publication-gate.json"))
    sourcing = _rec(memo.get("sourcingSummary"))
    current = rounds[-1]["index"] if rounds else 0
    return {
        "id": _txt(memo.get("id")),
        "relPath": rel,
        "markdownPath": f"{folder}/memo.md",
        "createdAt": _txt(memo.get("createdAt")),
        "status": _txt(memo.get("status")),
        "reviewStatus": _txt(memo.get("reviewStatus")),
        "limitedEvidence": memo.get("limitedEvidence") is True,
        "notForPublication": memo.get("notForPublication") is not False,
        "roundIndex": round_index,
        "currentRound": current,
        "isCurrent": bool(round_index) and round_index == current,
        "versions": len(found),
        "bluf": [statement(e) for e in _arr(memo.get("bluf"))],
        "keyJudgments": [statement(e) for e in _arr(memo.get("keyJudgments"))],
        "analysis": [statement(e) for e in _arr(memo.get("analysis"))],
        "uncertainties": [statement(e) for e in _arr(memo.get("uncertainties"))],
        "indicators": [statement(e) for e in _arr(memo.get("indicators"))],
        "competing": [{"text": _txt(_rec(e).get("text")), "claimId": _txt(_rec(e).get("claimId")), "status": _txt(_rec(e).get("status"))} for e in _arr(memo.get("competingExplanations"))],
        "gaps": [{"irId": _txt(_rec(g).get("irId")), "disposition": _txt(_rec(g).get("disposition")), "text": requirements.get(_txt(_rec(g).get("irId")), "")} for g in _arr(memo.get("gaps"))],
        "sourcing": {
            "text": _txt(sourcing.get("text")),
            "sourceCount": _num(sourcing.get("claimBearingSourceCount")),
            "singleSourceDependent": sourcing.get("singleSourceDependent") is True,
            "dependencies": [str(d) for d in _arr(sourcing.get("reportingDependencies"))],
        },
        "limitations": [str(l) for l in _arr(memo.get("limitations"))],
        "blockers": [
            {"code": str(code), "label": BLOCKERS.get(str(code), (_humanise(str(code)).capitalize(), ""))[0], "explanation": BLOCKERS.get(str(code), ("", ""))[1]}
            for code in _arr(memo.get("publicationBlockers"))
        ],
        "verification": {
            "contentVerdict": _txt(verification.get("contentVerdict")),
            "publicationVerdict": _txt(verification.get("publicationVerdict")),
            "checks": [{"check": _txt(_rec(c).get("check")), "status": _txt(_rec(c).get("status"))} for c in _arr(verification.get("checks"))],
        },
        "gate": {"status": _txt(gate.get("status")), "humanApprovalAvailable": gate.get("humanApprovalAvailable") is True},
        "claims": claims,
    }


def _source_rows(
    full: dict[str, Any],
    leads: dict[str, dict[str, Any]],
    evidence_review: list[dict[str, Any]],
    relevance_queue: list[dict[str, Any]],
    assurance_reviews: list[dict[str, Any]],
    ai_queue: list[dict[str, Any]],
    notes: dict[str, dict[str, Any]],
    current_round: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    intakes = {m.group(1): rel for rel in full if (m := PROVIDER_INTAKE.match(rel))}
    retrievals: dict[str, dict[str, Any]] = {}
    for rel in full:
        match = RETRIEVAL.match(rel)
        if not match:
            continue
        value = _rec(full[rel])
        source = _rec(value.get("source"))
        retrievals[match.group(1)] = {
            "id": match.group(1),
            "relPath": rel,
            "leadId": _txt(value.get("providerItemId")),
            "outcome": _txt(value.get("outcome")),
            "reason": _txt(value.get("reason")),
            "title": _txt(source.get("title")),
            "url": _txt(source.get("finalUrl")) or _txt(source.get("requestedUrl")),
            "publisher": _txt(source.get("publisherHost")),
            "at": _txt(value.get("attemptedAt")),
        }
    relevance_by_retrieval: dict[str, dict[str, Any]] = {}
    for rel, value in full.items():
        if _rec(value).get("schemaVersion") != "local-article-capture-v1":
            continue
        response = _rec(value.get("response"))
        article_id = _txt(value.get("id"))
        version = _txt(value.get("extractionVersion"))
        if article_id in retrievals and retrievals[article_id].get("extractionVersion", "") > version:
            continue
        url = _txt(response.get("finalUrl"))
        retrievals[article_id] = {
            "id": article_id, "relPath": rel, "leadId": "",
            "outcome": "resolved" if value.get("timeStatus") == "in-window" else "unresolved",
            "reason": "" if value.get("timeStatus") == "in-window" else "publication_date_unknown_or_outside_window",
            "title": _txt(value.get("title")), "url": url,
            "publisher": urlsplit(url).hostname or "", "at": _txt(response.get("receivedAt")),
            "extractionVersion": version,
            "admissionOutcome": _rec(full.get(f"article-admissions/{article_id}/article-admission-result.json")).get("outcome"),
        }
    for item in relevance_queue:
        previous = relevance_by_retrieval.get(item["sourceItemId"])
        def relevance_rank(value: dict[str, Any]) -> tuple[bool, bool, str]:
            return bool(value.get("candidateId")), value["status"] == "assessed", value.get("preparedAt", "")
        if previous is None or relevance_rank(item) > relevance_rank(previous):
            relevance_by_retrieval[item["sourceItemId"]] = item
    candidate_by_retrieval: dict[str, dict[str, Any]] = {}
    orphan_candidates: list[dict[str, Any]] = []
    lead_of_candidate: dict[str, str] = {}
    for candidate in evidence_review:
        lineage = _rec(_rec(_rec(full.get(candidate["relPath"])).get("item")).get("retrievalLineage"))
        item = _rec(_rec(full.get(candidate["relPath"])).get("item"))
        retrieval_id = _txt(item.get("providerItemId")) if item.get("provider") == "local_article" else _txt(lineage.get("retrievalId"))
        lead_of_candidate[candidate["candidateId"]] = _txt(lineage.get("sourceLeadProviderItemId"))
        if retrieval_id and retrieval_id in retrievals:
            candidate_by_retrieval[retrieval_id] = candidate
        else:
            orphan_candidates.append(candidate)
    snapshot_by_candidate: dict[str, str] = {}
    for rel in full:
        match = EXTRACT_REQUEST.match(rel) or SOURCE_NOTE.match(rel)
        if match:
            candidate_id = _txt(_rec(full[rel]).get("candidateId"))
            if candidate_id:
                snapshot_by_candidate[candidate_id] = match.group(1)
    review_by_snapshot = {r["snapshotId"]: r for r in assurance_reviews}
    note_by_snapshot: dict[str, dict[str, Any]] = {}
    for note in notes.values():
        if note["snapshotId"] not in note_by_snapshot or note["reviewStatus"] == "reviewed":
            note_by_snapshot[note["snapshotId"]] = note
    in_build = set((current_round or {}).get("noteIds", []))
    claims_per_note: dict[str, int] = defaultdict(int)
    for claim in (current_round or {}).get("claims", []):
        for note_id in claim["noteIds"]:
            claims_per_note[note_id] += 1

    def rank(retrieval_id: str) -> tuple[int, str]:
        relevance = relevance_by_retrieval.get(retrieval_id)
        score = 3 if retrieval_id in candidate_by_retrieval else 2 if relevance and relevance["status"] == "assessed" else 1 if relevance else 0
        return score, retrievals[retrieval_id]["at"]

    groups: dict[str, list[str]] = defaultdict(list)
    for retrieval_id, retrieval in retrievals.items():
        groups[retrieval["leadId"] or retrieval_id].append(retrieval_id)
    keys = list(groups)
    keys += [lead_id for lead_id in intakes if lead_id not in groups]
    orphan_lead_ids = {lead_of_candidate[candidate["candidateId"]] for candidate in orphan_candidates}
    keys += [lead_id for lead_id in leads if lead_id not in keys and lead_id not in orphan_lead_ids]
    rows = []
    for key in keys:
        retrieval_ids = sorted(groups.get(key, []), key=rank, reverse=True)
        retrieval = retrievals[retrieval_ids[0]] if retrieval_ids else None
        candidate = candidate_by_retrieval.get(retrieval["id"]) if retrieval else None
        rows.append(_row(key, leads.get(key), retrieval, max(0, len(retrieval_ids) - 1), intakes.get(key, ""),
                         relevance_by_retrieval.get(retrieval["id"]) if retrieval else None, candidate,
                         snapshot_by_candidate, review_by_snapshot, note_by_snapshot, ai_queue, full, in_build, claims_per_note))
    for candidate in orphan_candidates:
        lead_id = lead_of_candidate.get(candidate["candidateId"], "")
        rows.append(_row(candidate["candidateId"], leads.get(lead_id), None, 0, "", None, candidate,
                         snapshot_by_candidate, review_by_snapshot, note_by_snapshot, ai_queue, full, in_build, claims_per_note))
    rss_candidates = {candidate.get("rssItemId") for candidate in evidence_review if candidate.get("rssItemId")}
    rss_items = {}
    for path, capture in full.items():
        if _rec(capture).get("schemaVersion") in ("rss-capture-v1", "rss-capture-index-v1"):
            for item in capture.get("items", []):
                if _rec(item).get("id") and item["id"] not in rss_candidates:
                    rss_items[item["id"]] = (item, path, capture)
    for item_id, (item, path, capture) in rss_items.items():
        relevance = relevance_by_retrieval.get(item_id)
        row = _row(item_id, None, None, 0, "", relevance, None,
                   snapshot_by_candidate, review_by_snapshot, note_by_snapshot, ai_queue, full, in_build, claims_per_note)
        eligible = item.get("contentStatus") == "captured-feed-text" and item.get("timeStatus") == "in-window" and item.get("articleUrl")
        detail = "Captured feed text; deferred within the processing budget" if eligible else (
            "Feed text outside the approved time window" if item.get("timeStatus") == "out-of-window" else
            "Metadata only, missing URL or unknown publication date; not eligible for admission")
        row.update({"title": item.get("title") or item_id, "publisher": _rec(capture.get("feed")).get("name", ""),
                    "url": item.get("articleUrl") or "", "retrieved": bool(eligible),
                    "artifacts": [{"label": "RSS capture", "relPath": path}] + row["artifacts"]})
        row["steps"][0] = _step("lead", "RSS item", "done", "Captured directly from the selected feed")
        row["steps"][1] = _step("retrieve", "Feed text", "done" if eligible else "closed", detail)
        if relevance is None:
            row["steps"][2] = _step("relevance", "Relevance", "todo" if eligible else "closed", detail)
        elif relevance.get("verdict") in ("partially-relevant", "uncertain"):
            row["steps"][3] = _step("admit", "Admitted", "closed", "Not admitted; relevance exception requires a decision")
        row["steps"] = _settle(row["steps"])
        row["state"], current = _summary(row["steps"])
        row["current"] = {key: current[key] for key in ("key", "label", "state", "detail")}
        row["action"] = current["action"] if row["state"] in ("action", "failed", "ready", "provisional") else None
        rows.append(row)
    order = {"action": 0, "failed": 1, "ready": 2, "progress": 3, "pending": 4, "provisional": 5, "done": 6, "closed": 7}
    rows.sort(key=lambda r: (order.get(r["state"], 9), -(r["lead"] or {}).get("score", 0), r["title"]))
    return rows


def _row(
    key: str,
    lead: dict[str, Any] | None,
    retrieval: dict[str, Any] | None,
    duplicates: int,
    intake_rel: str,
    relevance: dict[str, Any] | None,
    candidate: dict[str, Any] | None,
    snapshot_by_candidate: dict[str, str],
    review_by_snapshot: dict[str, dict[str, Any]],
    note_by_snapshot: dict[str, dict[str, Any]],
    ai_queue: list[dict[str, Any]],
    full: dict[str, Any],
    in_build: set[str],
    claims_per_note: dict[str, int],
) -> dict[str, Any]:
    steps = []
    artifacts = []
    if lead:
        steps.append(_step("lead", "Lead", "done", f"Seerist score {lead['score']}" + (f" · {lead['providerTimestamp'][:10]}" if lead["providerTimestamp"] else "")))
        artifacts.append({"label": "Discovery results", "relPath": lead["discoveryRelPath"]})
    else:
        steps.append(_step("lead", "Lead", "done", "Added directly"))
    if intake_rel:
        artifacts.append({"label": "Lead classification", "relPath": intake_rel})

    if retrieval:
        artifacts.append({"label": "Retrieval result", "relPath": retrieval["relPath"]})
        if retrieval["outcome"] == "resolved":
            steps.append(_step("retrieve", "Retrieved", "done", retrieval["publisher"] or "Article retrieved"))
        else:
            steps.append(_step("retrieve", "Retrieved", "failed", _humanise(retrieval["reason"] or retrieval["outcome"]) or "Not retrieved"))
    elif candidate:
        steps.append(_step("retrieve", "Retrieved", "done", candidate["publisher"] or "Retrieved"))
    else:
        steps.append(_step("retrieve", "RSS source", "pending", "Waiting for the RSS-connected source list"))

    if relevance and relevance["status"] == "assessed":
        positive = relevance["verdict"] in ("relevant", "partially-relevant")
        steps.append(_step("relevance", "Relevance", "done" if positive else "closed", _humanise(relevance["verdict"]).capitalize()))
        if relevance["assessmentPath"]:
            artifacts.append({"label": "AI relevance assessment", "relPath": relevance["assessmentPath"]})
    elif relevance:
        steps.append(_step("relevance", "Relevance", "ai", "Waiting for the AI relevance check", {"kind": "relevance", "item": relevance}))
    elif candidate:
        candidate_positive = candidate["verdict"] in ("relevant", "partially-relevant")
        steps.append(_step("relevance", "Relevance", "done" if candidate_positive else "closed", _humanise(candidate["verdict"]).capitalize()))
    else:
        steps.append(_step("relevance", "Relevance", "failed", "Relevance check was not prepared"))

    snapshot_id = ""
    if candidate:
        artifacts.append({"label": "Evidence candidate", "relPath": candidate["relPath"]})
        decision = candidate["decision"]
        if decision is None:
            steps.append(_step("admit", "Admitted", "you", "Waiting for your admission decision", {"kind": "admit", "candidateId": candidate["candidateId"]}))
        elif decision["outcome"] == "approved":
            steps.append(_step("admit", "Admitted", "done", f"Admitted by {decision['reviewerId'] or 'analyst'}"))
            snapshot_id = snapshot_by_candidate.get(candidate["candidateId"], "") or decision.get("snapshotId", "")
        else:
            steps.append(_step("admit", "Admitted", "closed", f"{_humanise(decision['outcome']).capitalize()} by {decision['reviewerId'] or 'analyst'}"))
    elif retrieval and retrieval.get("admissionOutcome") in ("exception", "not-relevant"):
        detail = "Not admitted; relevance exception requires a decision" if retrieval["admissionOutcome"] == "exception" else "Excluded by relevance policy"
        steps.append(_step("admit", "Admitted", "closed", detail))
    elif relevance and relevance["status"] == "assessed" and relevance["verdict"] in ("relevant", "partially-relevant"):
        steps.append(_step("admit", "Admitted", "failed", "Evidence candidate was not created"))
    else:
        steps.append(_step("admit", "Admitted", "todo"))

    review = review_by_snapshot.get(snapshot_id) if snapshot_id else None
    note = note_by_snapshot.get(snapshot_id) if snapshot_id else None
    extract_items = [i for i in ai_queue if i["stage"] == "extract" and i["requestPath"].startswith(f"assurance/{snapshot_id}/")] if snapshot_id else []
    if not snapshot_id:
        steps.append(_step("extract", "Extracted", "todo" if not (candidate and candidate["decision"]) else "failed", "" if not (candidate and candidate["decision"]) else "Extraction was not prepared"))
    elif f"assurance/{snapshot_id}/extract/extract-commit.json" in full:
        steps.append(_step("extract", "Extracted", "done", f"{len(review['observations'])} observations" if review else "Observations extracted"))
    else:
        waiting = [i for i in extract_items if i["status"] == "awaiting-ai"]
        if waiting:
            steps.append(_step("extract", "Extracted", "ai", "Waiting for the AI extraction", {"kind": "ai-stage", "item": waiting[-1]}))
        else:
            steps.append(_step("extract", "Extracted", "failed", "Extraction failed its checks" if extract_items else "Extraction was not prepared"))

    if review:
        artifacts.append({"label": "Review package", "relPath": review["packagePath"]})
        if review["status"] == "recorded":
            steps.append(_step("review", "Reviewed", "done", f"Reviewed by {review['reviewerId'] or 'analyst'}"))
        elif review["status"] == "provisional":
            steps.append(_step("review", "Reviewed", "provisional", "Support pass skipped (provisional)", {"kind": "review", "snapshotId": snapshot_id}))
        else:
            steps.append(_step("review", "Reviewed", "you", f"{len(review['observations'])} observations need your review", {"kind": "review", "snapshotId": snapshot_id}))
    else:
        steps.append(_step("review", "Reviewed", "todo"))

    if note:
        artifacts.append({"label": "Source intelligence note", "relPath": note["relPath"]})
        if note["noteId"] in in_build:
            count = claims_per_note.get(note["noteId"], 0)
            steps.append(_step("synthesis", "In synthesis", "done", f"Supports {count} claim(s) in the current round"))
        else:
            steps.append(_step("synthesis", "In synthesis", "ready", "Ready for the next synthesis round"))
    elif review and review["status"] in ("recorded", "provisional"):
        steps.append(_step("synthesis", "In synthesis", "failed", "Source note was not assembled"))
    else:
        steps.append(_step("synthesis", "In synthesis", "todo"))

    steps = _settle(steps)
    state, current = _summary(steps)
    title = (retrieval or {}).get("title") or (candidate or {}).get("title") or (lead or {}).get("title") or key
    return {
        "id": key,
        "title": title,
        "publisher": (retrieval or {}).get("publisher") or (candidate or {}).get("publisher", ""),
        "url": (retrieval or {}).get("url") or (candidate or {}).get("url") or (lead or {}).get("sourceUrl", ""),
        "lead": lead,
        "duplicates": duplicates,
        "retrieved": bool(retrieval and retrieval["outcome"] == "resolved" or candidate),
        "candidate": candidate,
        "relevance": relevance,
        "review": review,
        "snapshotId": snapshot_id,
        "noteId": (note or {}).get("noteId", ""),
        "claimCount": claims_per_note.get((note or {}).get("noteId", ""), 0),
        "steps": steps,
        "state": state,
        "current": {k: current[k] for k in ("key", "label", "state", "detail")},
        "action": current["action"] if state in ("action", "failed", "ready", "provisional") else None,
        "artifacts": artifacts,
    }


def _coverage_entry(raw: Any) -> dict[str, Any]:
    entry = _rec(raw)
    return {
        "irId": _txt(entry.get("irId")),
        "disposition": _txt(entry.get("disposition")),
        "sourceNoteIds": [str(n) for n in _arr(entry.get("sourceNoteIds"))] if "sourceNoteIds" in entry else None,
        "observationIds": [str(o) for o in _arr(entry.get("observationIds"))] if "observationIds" in entry else None,
    }


def _requirement_coverage(coverage: list[dict[str, Any]], irid: str) -> dict[str, Any]:
    """Typed coverage disposition for one requirement, with persisted note/observation links only."""
    entry = next((c for c in coverage if c.get("irId") == irid), None)
    if entry is None:
        return {"coverage": "", "sourceNoteIds": None, "observationIds": None}
    return {"coverage": entry.get("disposition", ""), "sourceNoteIds": entry.get("sourceNoteIds"),
            "observationIds": entry.get("observationIds")}


def _queue_item(phase: str, actor: str, title: str, detail: str, target: dict[str, Any], weight: int = 0) -> dict[str, Any]:
    return {"phase": phase, "actor": actor, "title": title, "detail": detail, "target": target, "weight": weight}


def build_journey(run_id: str, full: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    panel1 = parts["panel1"]
    leads, discoveries = _leads_and_discoveries(full)
    candidates_by_id = {c["candidateId"]: c for c in parts["evidenceReview"]}
    notes = _note_index(full, candidates_by_id)
    rounds, next_build = _rounds(run_id, full, parts["adjudications"], parts["aiQueue"])
    current_round = rounds[-1] if rounds else None
    rows = _source_rows(full, leads, parts["evidenceReview"], parts["relevanceQueue"], parts["assuranceReviews"],
                        parts["aiQueue"], notes, current_round)
    requirement_text = {r["id"]: r["text"] for r in panel1.get("requirements", []) if r.get("status") == "approved"}
    memo = _memo_view(run_id, full, rounds, notes, requirement_text)

    lead_list = sorted(leads.values(), key=lambda l: l["providerTimestamp"], reverse=True)
    lead_list.sort(key=lambda l: (l["tier"], -l["score"]))
    row_by_lead = {row["lead"]["providerItemId"]: row["id"] for row in rows if row["lead"]}
    pending_by_lead = {row["lead"]["providerItemId"]: row["state"] == "pending" for row in rows if row["lead"]}
    for lead in lead_list:
        lead["rowId"] = row_by_lead.get(lead["providerItemId"], "")
        lead["pendingRss"] = pending_by_lead.get(lead["providerItemId"], False)

    scope = panel1.get("scope")
    approved_question = next((q for q in panel1.get("questions", []) if q.get("status") == "approved"), None)
    framed = bool(scope and scope.get("status") == "approved" and approved_question)
    in_build = set((current_round or {}).get("noteIds", []))
    ready_notes = [n for n in notes.values() if n["noteId"] not in in_build and (n["reviewStatus"] == "reviewed" or not any(
        m["snapshotId"] == n["snapshotId"] and m["reviewStatus"] == "reviewed" for m in notes.values()))]
    current_round_complete = not current_round or all(
        step["state"] == "done" for step in current_round["steps"]
    )
    latest_notes = {}
    for note in notes.values():
        if note["snapshotId"] not in latest_notes or note["reviewStatus"] == "reviewed":
            latest_notes[note["snapshotId"]] = note
    in_flight = [row for row in rows if row["state"] in ("action", "progress") and row["current"]["key"] in ("relevance", "admit", "extract", "review")]
    readiness = {
        "noteCount": len(latest_notes),
        "newNotes": [{"title": n["title"], "reviewStatus": n["reviewStatus"]} for n in ready_notes],
        "provisionalNotes": sum(1 for n in latest_notes.values() if n["reviewStatus"] == "provisional"),
        "inFlight": [{"id": r["id"], "title": r["title"], "step": r["current"]["label"]} for r in in_flight],
        "pendingBuild": bool(next_build),
        "currentRoundComplete": current_round_complete,
        "canBuild": bool(latest_notes) and not next_build and current_round_complete,
    }

    queue: list[dict[str, Any]] = []
    if not framed:
        queue.append(_queue_item("frame", "you", "Frame and approve the analysis", "Approve the scope, research question and information requirements.", {"tab": "brief"}))
    elif not requirement_text:
        queue.append(_queue_item("frame", "you", "Information requirements are missing", "Extraction needs approved requirements. Record them with npm run approve:requirements, or start a new analysis.", {"tab": "brief"}, weight=1))
    if framed and not discoveries:
        queue.append(_queue_item("collect", "you", "Collect Seerist leads", "Run the first bounded Seerist search for the approved question.", {"tab": "brief", "focus": "collect"}))
    elif discoveries and not leads:
        queue.append(_queue_item("collect", "you", "Searches returned no leads", "Broaden the Seerist queries or lower the minimum score.", {"tab": "brief", "focus": "collect"}))
    titles = {
        "relevance": ("ai", "Run the AI relevance check"),
        "admit": ("you", "Decide whether to admit as evidence"),
        "extract": ("ai", "Run the AI extraction"),
        "review": ("you", "Review the extracted observations"),
    }
    for row in rows:
        if row["state"] != "action" or row["current"]["key"] not in titles:
            continue
        actor, title = titles[row["current"]["key"]]
        phase = next(p for k, _, p in SOURCE_STEPS if k == row["current"]["key"])
        queue.append(_queue_item(phase, actor, title, row["title"], {"tab": "sources", "row": row["id"]}))
    for row in rows:
        if row["state"] == "provisional":
            queue.append(_queue_item("assure", "you", "Complete the skipped support pass", row["title"], {"tab": "sources", "row": row["id"]}, weight=-5))
    if current_round:
        step_titles = {"challenge": "Run the AI Challenge", "adjudicate": "Adjudicate the challenged claims",
                       "key-judgements": "Run the AI key-judgement selection", "memo": "Run the AI memo writer"}
        for step in current_round["steps"]:
            if step["state"] in ("you", "ai"):
                phase = next(p for k, _, p in ROUND_STEPS if k == step["key"])
                queue.append(_queue_item(phase, step["state"], step_titles[step["key"]], f"Synthesis round {current_round['index']} · {step['detail']}", {"tab": "synthesis", "round": current_round["index"]}))
            elif step["state"] == "ready":
                phase = next(p for k, _, p in ROUND_STEPS if k == step["key"])
                label = "Prepare the key-judgement selection" if step["key"] == "key-judgements" else "Prepare the memo writer"
                queue.append(_queue_item(phase, "you", label, f"Synthesis round {current_round['index']}", {"tab": "synthesis", "round": current_round["index"]}))
    if next_build:
        queue.append(_queue_item("synthesise", "ai", "Run the AI synthesis Build", f"Round {next_build['index']} · {readiness['noteCount']} source notes", {"tab": "synthesis", "round": next_build["index"]}))
    elif ready_notes and current_round_complete and not any(item["phase"] in ("synthesise", "memo") for item in queue):
        label = "Build a new synthesis round" if rounds else "Build the first synthesis"
        queue.append(_queue_item("synthesise", "you", label, f"{len(ready_notes)} source note(s) are not in the current synthesis yet.", {"tab": "synthesis", "focus": "gate"}, weight=-2))
    open_exceptions = [e for e in parts["exceptions"] if e["status"] == "open"]
    if open_exceptions:
        queue.append(_queue_item("evidence", "you", f"Resolve {len(open_exceptions)} open exception(s)", "A bounded step failed and needs a decision.", {"tab": "audit"}, weight=-5))
    if memo and not memo["isCurrent"] and current_round and not any(i["phase"] == "memo" for i in queue):
        queue.append(_queue_item("memo", "you", "Memo is behind the latest synthesis", f"The memo was written from round {memo['roundIndex'] or '?'}; round {current_round['index']} is newer.", {"tab": "synthesis", "round": current_round["index"]}, weight=-3))
    queue.sort(key=lambda item: (-item["weight"], -PHASE_RANK[item["phase"]], 0 if item["actor"] == "you" else 1))

    suggestions = []
    if memo:
        suggestions.append({"title": "Read the memo", "detail": f"Round {memo['roundIndex']} draft with {len(memo['keyJudgments'])} key judgement(s).", "target": {"tab": "memo"}})
        silent = [g["irId"] for g in memo["gaps"] if g["disposition"] == "silent"]
        if silent:
            suggestions.append({"title": f"{len(silent)} requirement(s) have no evidence", "detail": "Collect for " + ", ".join(silent) + " with narrower Seerist queries.", "target": {"tab": "brief", "focus": "collect"}})
    funnel = [
        {"key": "leads", "label": "Leads", "value": len(leads)},
        {"key": "pending_rss", "label": "Waiting for RSS", "value": sum(1 for lead in lead_list if lead["pendingRss"])},
        {"key": "relevant", "label": "Relevant", "value": sum(1 for r in rows if next(s for s in r["steps"] if s["key"] == "relevance")["state"] == "done")},
        {"key": "admitted", "label": "Admitted", "value": sum(1 for r in rows if next(s for s in r["steps"] if s["key"] == "admit")["state"] == "done")},
        {"key": "reviewed", "label": "Reviewed", "value": sum(1 for r in rows if next(s for s in r["steps"] if s["key"] == "review")["state"] in ("done", "provisional"))},
        {"key": "claims", "label": "Claims", "value": len((current_round or {}).get("claims", []))},
        {"key": "judgements", "label": "Key judgements", "value": len(memo["keyJudgments"]) if memo else 0},
    ]

    def waiting(phase: str) -> dict[str, int]:
        return {actor: sum(1 for item in queue if item["phase"] == phase and item["actor"] == actor) for actor in ("you", "ai")}

    admitted = funnel[3]["value"]
    reviewed = funnel[4]["value"]
    phases = []
    for key, label in PHASES:
        counts = waiting(key)
        busy = counts["you"] + counts["ai"] > 0
        if key == "frame":
            if not framed:
                state, summary = "active", "Scope, question and requirements need approval"
            elif not requirement_text:
                state, summary = "attention", "No approved information requirements"
            else:
                state, summary = "done", f"Approved by {scope.get('approvedBy') or approved_question.get('approvedBy') or 'analyst'}"
        elif key == "collect":
            state, summary = ("todo", "") if not framed else ("done", f"{len(leads)} leads from {len(discoveries)} search plan(s)") if leads else ("attention", "Searches returned no leads") if discoveries else ("active", "No search run yet")
        elif key == "evidence":
            state = "active" if busy else "done" if admitted else "todo"
            captured = sum(1 for row in rows if row["retrieved"])
            summary = f"{admitted} admitted of {captured} captured sources" if captured else ("Waiting for RSS-connected source list" if leads else "")
        elif key == "assure":
            state = "active" if busy else "done" if reviewed else "todo"
            summary = f"{reviewed} reviewed" + (f" · {readiness['provisionalNotes']} provisional" if readiness["provisionalNotes"] else "") if reviewed or busy else ""
        elif key == "synthesise":
            state = "active" if busy else "done" if current_round and current_round["adjudicationStatus"] == "adjudicated" else "ready" if readiness["canBuild"] else "todo"
            summary = f"Round {current_round['index']} · {len(current_round['claims'])} claims" if current_round else ("Ready to build" if readiness["canBuild"] else "")
            if ready_notes and rounds:
                summary += f" · {len(ready_notes)} new note(s) waiting"
        else:
            if busy:
                state = "active"
            elif memo and memo["isCurrent"]:
                state = "done"
            elif memo:
                state = "stale"
            else:
                state = "todo"
            summary = (f"Draft from round {memo['roundIndex']} · " + ("blocked from publication" if memo["blockers"] else "publishable")) if memo else ""
        phases.append({"key": key, "label": label, "state": state, "summary": summary, "waiting": counts})

    work_by_id: dict[str, dict[str, Any]] = {}
    source_paths: dict[str, set[str]] = {}

    def with_run_prefix(path: str) -> set[str]:
        normalized = path.replace("\\", "/").lstrip("/")
        return {normalized, f"runs/{run_id}/{normalized}"}

    for row in rows:
        source_paths[f"source:{row['id']}"] = {
            path
            for artifact in row.get("artifacts", [])
            for path in with_run_prefix(_txt(artifact.get("relPath")))
            if _txt(artifact.get("relPath"))
        }
    for index, item in enumerate(queue):
        target = item["target"]
        paths: set[str] = set()
        if target.get("row") is not None:
            row = next((candidate for candidate in rows if candidate["id"] == target["row"]), None)
            if row:
                paths.update(source_paths.get(f"source:{row['id']}", set()))
        if target.get("round") is not None:
            round_data = next((candidate for candidate in rounds if candidate["index"] == target["round"]), None)
            if round_data:
                for path in [round_data["buildPath"], round_data["challengeRecordPath"],
                             round_data["adjudicationPath"], *round_data["memoPaths"]]:
                    if path:
                        paths.update(with_run_prefix(path))
                for step_data in round_data["steps"]:
                    action_data = step_data.get("action") or {}
                    request_path = _txt(_rec(action_data.get("item")).get("requestPath"))
                    if request_path:
                        paths.update(with_run_prefix(request_path))
        work_id = f"queue:{index}"
        phase = "intent" if item["phase"] == "frame" else item["phase"]
        work_by_id[work_id] = {
            "id": work_id,
            "stage": phase,
            "actor": "machine" if item["actor"] == "ai" else "human",
            "kind": "work" if item["actor"] == "ai" else "decision",
            "surface": "workflow",
            "title": item["title"],
            "detail": item["detail"],
            "paths": sorted(paths),
            "priority": item["weight"] * 100 + PHASE_RANK[item["phase"]],
            "target": item["target"],
            "queueIndex": index,
        }
    blockers = []
    for exception in open_exceptions:
        refs = set(exception.get("refs", []))
        affected = [
            work_id for work_id, work in work_by_id.items()
            if refs.intersection(work["paths"])
        ]
        affected.extend(
            source_id for source_id, paths in source_paths.items()
            if refs.intersection(paths)
        )
        affected = sorted(set(affected))
        exception_path = _txt(exception.get("relPath"))
        blockers.append({
            "id": exception["id"],
            "kind": "exception",
            "scope": "work" if affected else "unknown",
            "paths": [exception_path, *sorted(refs)],
            "affectedWorkIds": affected,
            "uncertain": not bool(affected),
            "title": "Scoped source exception" if affected else "Exception scope is not established",
            "detail": "Only work bound to the referenced artifact is blocked." if affected else
                      "Artifact references do not identify affected work; the run is conservatively paused.",
        })
        work_id = f"exception:{exception_path}"
        work_by_id[work_id] = {
            "id": work_id,
            "stage": "evidence",
            "actor": "human",
            "kind": "decision",
            "surface": "exceptions",
            "title": "Resolve an open exception",
            "detail": exception["kind"],
            "paths": [exception_path, *sorted(refs)],
            "priority": -400,
            "target": {"tab": "audit"},
        }

    if memo:
        publication_path = f"memo/{memo['id']}/publication-gate.json"
        for blocker in memo["blockers"]:
            blockers.append({
                "id": blocker["code"],
                "kind": "publication",
                "scope": "publication",
                "paths": [publication_path],
                "affectedWorkIds": [],
                "uncertain": False,
                "title": blocker["label"],
                "detail": blocker["explanation"],
            })

    projection_input = {
        "runId": run_id,
        "intentApproved": framed,
        "evidenceAvailable": bool(readiness["noteCount"] or rounds),
        "committedOutcomes": [
            {"stage": "intent" if phase["key"] == "frame" else phase["key"], "paths": []}
            for phase in phases if phase["state"] == "done"
        ],
        "readyWork": list(work_by_id.values()),
        "humanDecisions": [
            {"id": work["id"], "stage": work["stage"], "paths": work["paths"]}
            for work in work_by_id.values() if work["actor"] == "human"
        ],
        "interimCheckpoints": [
            {"id": work["id"], "stage": work["stage"], "paths": work["paths"]}
            for work in work_by_id.values() if work["actor"] == "machine"
        ],
        "blockers": blockers,
    }
    if memo:
        gate_path = f"memo/{memo['id']}/publication-gate.json"
        gate_exists = any(path == gate_path for path in full)
        if gate_exists:
            projection_input["publication"] = {
                "path": gate_path,
                "approvalAvailable": memo["gate"]["humanApprovalAvailable"],
            }
    workflow = project_workflow(projection_input)
    queue_index_by_id = {
        work_id: work["queueIndex"]
        for work_id, work in work_by_id.items() if "queueIndex" in work
    }
    projected_queue_order = [
        queue_index_by_id[work["id"]]
        for work in workflow["readyWork"]
        if work["id"] in queue_index_by_id
    ]
    unresolved_scope = any(blocker["scope"] == "unknown" for blocker in blockers)
    if open_exceptions:
        for item in queue:
            if item["title"].startswith("Resolve ") and "exception" in item["title"]:
                item["detail"] = (
                    "Exception scope is uncertain; the run is conservatively paused until affected work is established."
                    if unresolved_scope else
                    "Exceptions are scoped to referenced work; unrelated sources and draft analysis can continue."
                )
    ordered_indexes = projected_queue_order + [
        index for index in range(len(queue)) if index not in projected_queue_order
    ]
    queue = [queue[index] for index in ordered_indexes]

    result = {
        "phases": phases,
        "queue": queue,
        "workflow": workflow,
        "suggestions": suggestions,
        "funnel": funnel,
        "brief": {
            "scope": scope,
            "question": approved_question,
            "draftQuestion": next((q for q in reversed(panel1.get("questions", [])) if q.get("status") == "proposed"), None),
            "requirements": [
                {"irId": irid, "text": text, **_requirement_coverage((current_round or {}).get("coverage", []), irid)}
                for irid, text in requirement_text.items()
            ],
            "discoveries": discoveries,
            "framed": framed,
        },
        "leads": lead_list,
        "pendingRssLeadCount": sum(1 for lead in lead_list if lead["pendingRss"]),
        "sources": rows,
        "readiness": readiness,
        "rounds": rounds,
        "nextBuild": next_build,
        "memo": memo,
        "notes": {k: {f: n[f] for f in ("title", "publisher", "url", "reviewStatus", "snapshotId")} for k, n in notes.items()},
    }
    result["evidenceWorkspace"] = build_evidence_workspace(result, parts)
    return result
