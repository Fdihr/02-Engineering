"""Pure run-directory projections used by the dashboard."""
from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from typing import Any

from .journey import build_journey

FileEntry = dict[str, Any]
JsonFile = dict[str, Any]
EventLines = dict[str, Any]

RULES: dict[str, Any] = {
    "assurance_dir": "assurance",
    "synthesis_dir": "synthesis",
    "exceptions_dir": "exceptions",
    "events_file": "events.jsonl",
    "attempt_dir": re.compile(r"^attempt-(\d+)$"),
    "checks_file": re.compile(r"checks\.json$", re.IGNORECASE),
    "committed": re.compile(r"commit", re.IGNORECASE),
    "recorded": re.compile(r"record|envelope|sealed", re.IGNORECASE),
    "failed": re.compile(r"fail", re.IGNORECASE),
    "provisional": re.compile(r"provisional", re.IGNORECASE),
    "reviewed": re.compile(r"reviewed", re.IGNORECASE),
    "synthetic": re.compile(r"synthetic", re.IGNORECASE),
    "review_stage": (
        ("review package", re.compile(r"^review-package", re.IGNORECASE)),
        ("review response", re.compile(r"^review-response", re.IGNORECASE)),
        ("review record", re.compile(r"^review-record", re.IGNORECASE)),
    ),
    "note_file": re.compile(r"^source-note", re.IGNORECASE),
    "metrics_file": re.compile(r"^metrics", re.IGNORECASE),
    "synthesis_stages": (
        ("build", re.compile(r"build", re.IGNORECASE)),
        ("challenge", re.compile(r"challenge", re.IGNORECASE)),
        ("adjudicate", re.compile(r"adjudic", re.IGNORECASE)),
        ("key judgements", re.compile(r"key-judgement", re.IGNORECASE)),
        ("memo", re.compile(r"memo-writer|draft-memo|^memo/|^memo-|/memo-", re.IGNORECASE)),
        ("verification", re.compile(r"verif", re.IGNORECASE)),
        ("publication", re.compile(r"publication", re.IGNORECASE)),
    ),
    "panel1_stages": (
        ("human intent gate", re.compile(r"memo-scope|research-question|requirement|^proposals/", re.IGNORECASE)),
        ("bounded seerist collection", re.compile(r"discover|provider-operation|collection-request|raw-pages|raw-provider|raw-response", re.IGNORECASE)),
        ("classify provider item", re.compile(r"provider-intake|intake-result|intake-summary|normalized-sources|observed-structure", re.IGNORECASE)),
        ("resolve + canonicalize source", re.compile(r"source-retrieval|raw-firecrawl|source-document", re.IGNORECASE)),
        ("ai question-relevance", re.compile(r"question-relevance", re.IGNORECASE)),
        ("policy admission", re.compile(r"source-reintake|evidence-decision|approved-evidence-snapshot", re.IGNORECASE)),
    ),
    "max_events": 200,
}

_STATUS_RANK = {
    "pending": 0,
    "in-progress": 1,
    "failed": 2,
    "provisional": 3,
    "synthetic": 4,
    "committed": 5,
    "reviewed": 6,
}


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _basename(rel_path: str) -> str:
    return rel_path.rsplit("/", 1)[-1]


def _segments(rel_path: str) -> list[str]:
    return rel_path.split("/")


def _string_field(record: dict[str, Any], keys: tuple[str, ...] | list[str]) -> str:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def _number_field(record: dict[str, Any], keys: tuple[str, ...] | list[str]) -> int | float | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            return value
    return None


def artifact_flags(value: Any) -> list[str]:
    """Return supported top-level review and provenance flags."""
    if not _is_record(value):
        return []
    flags: list[str] = []
    review_status = value.get("reviewStatus")
    if isinstance(review_status, str):
        flags.append(f"reviewStatus:{review_status}")
    for key in ("limitedEvidence", "provisional", "synthetic"):
        if value.get(key) is True:
            flags.append(key)
    schema = value.get("schemaVersion")
    if isinstance(schema, str):
        flags.append(schema)
    return flags


def failure_counts(value: Any) -> dict[str, int | float]:
    """Aggregate check counts from arrays at any top-level property."""
    counts: dict[str, int | float] = defaultdict(int)
    if isinstance(value, list):
        items = [value]
    elif _is_record(value):
        items = list(value.values())
    else:
        items = []
    for group in items:
        if not isinstance(group, list):
            continue
        for item in group:
            if not _is_record(item) or not isinstance(item.get("check"), str):
                continue
            count = item.get("count", 1)
            if not isinstance(count, (int, float)) or isinstance(count, bool):
                count = 1
            counts[item["check"]] += count
    return dict(counts)


def _status_from_name(name: str, value: Any) -> str | None:
    flags = artifact_flags(value)
    if RULES["synthetic"].search(name) or "synthetic" in flags or "reviewStatus:synthetic" in flags:
        return "synthetic"
    if RULES["failed"].search(name):
        return "failed"
    if RULES["provisional"].search(name) or "reviewStatus:provisional" in flags or "provisional" in flags:
        return "provisional"
    if RULES["reviewed"].search(name) or "reviewStatus:reviewed" in flags:
        return "reviewed"
    if _is_record(value):
        record_status = value.get("status")
        if record_status == "approved":
            return "reviewed"
        if record_status == "proposed":
            return "in-progress"
        if record_status == "blocked":
            return "provisional"
        if isinstance(value.get("contentVerdict"), str):
            return "committed"
        if isinstance(value.get("candidates"), list) or isinstance(value.get("requirements"), list) or isinstance(value.get("segments"), list):
            return "committed"
        if isinstance(value.get("snapshotId"), str) and isinstance(value.get("admittedBy"), str):
            return "reviewed"
    if name.startswith("approved-") or name == "evidence-decision.json":
        return "reviewed"
    if name in ("discovery-results.json", "intake-result.json", "source-retrieval-result.json", "source-document.json", "question-relevance-decision.json"):
        return "committed"
    if RULES["committed"].search(name) or RULES["recorded"].search(name):
        return "committed"
    return None


def _strongest(statuses: list[str]) -> str:
    return max(statuses, key=lambda item: _STATUS_RANK[item], default="pending")


def _artifact(file: FileEntry, json_by_path: dict[str, Any]) -> dict[str, Any]:
    return {
        "relPath": file["relPath"],
        "size": file["size"],
        "flags": artifact_flags(json_by_path.get(file["relPath"])),
    }


def build_source_view(snapshot_id: str, files: list[FileEntry], json_by_path: dict[str, Any]) -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    extract_dirs: dict[str, list[FileEntry]] = defaultdict(list)
    rest: list[FileEntry] = []
    for file in files:
        parts = _segments(file["relPath"])
        if parts[0].lower().startswith("extract") and len(parts) > 1:
            extract_dirs[parts[0]].append(file)
        else:
            rest.append(file)

    for dir_name, dir_files in sorted(extract_dirs.items()):
        attempts: set[int] = set()
        failures: dict[str, int | float] = defaultdict(int)
        artifacts: list[dict[str, Any]] = []
        statuses: list[str] = []
        for file in dir_files:
            parts = _segments(file["relPath"])
            match = RULES["attempt_dir"].fullmatch(parts[1]) if len(parts) > 1 else None
            if match:
                attempts.add(int(match.group(1)))
                if RULES["checks_file"].search(file["relPath"]):
                    for check, count in failure_counts(json_by_path.get(file["relPath"])).items():
                        failures[check] += count
                continue
            status = _status_from_name(_basename(file["relPath"]), json_by_path.get(file["relPath"]))
            if status:
                statuses.append(status)
                artifacts.append(_artifact(file, json_by_path))
        status = _strongest(statuses) if statuses else ("in-progress" if attempts else "pending")
        stages.append({"name": dir_name, "status": status, "attempts": len(attempts), "failures": dict(failures), "artifacts": artifacts})

    review_artifacts: list[dict[str, Any]] = []
    review_statuses: list[str] = []
    has_package = False
    has_record = False
    for file in rest:
        name = _basename(file["relPath"])
        for label, pattern in RULES["review_stage"]:
            if not pattern.search(name):
                continue
            review_artifacts.append(_artifact(file, json_by_path))
            if label == "review package":
                has_package = True
            elif label == "review record":
                has_record = True
                value = json_by_path.get(file["relPath"])
                status = _status_from_name(name, value)
                review_statuses.append(status or ("reviewed" if _is_record(value) and value.get("supportPass") == "performed" else "committed"))
    if review_artifacts:
        status = _strongest(review_statuses) if has_record else ("in-progress" if has_package else "pending")
        stages.append({"name": "review", "status": status, "attempts": 0, "failures": {}, "artifacts": review_artifacts})

    for label, pattern in (("source note", RULES["note_file"]), ("metrics", RULES["metrics_file"])):
        matches = [file for file in rest if pattern.search(_basename(file["relPath"]))]
        if matches:
            statuses = [_status_from_name(_basename(file["relPath"]), json_by_path.get(file["relPath"])) or "committed" for file in matches]
            stages.append({
                "name": label,
                "status": _strongest(statuses),
                "attempts": 0,
                "failures": {},
                "artifacts": [_artifact(file, json_by_path) for file in matches],
            })

    return {"snapshotId": snapshot_id, "stages": stages, "waitingOn": derive_source_waiting(stages)}


def derive_source_waiting(stages: list[dict[str, Any]]) -> str | None:
    extracts = [stage for stage in stages if stage["name"].lower().startswith("extract")]
    latest_extract = extracts[-1] if extracts else None
    review = next((stage for stage in stages if stage["name"] == "review"), None)
    note = next((stage for stage in stages if stage["name"] == "source note"), None)
    metrics = next((stage for stage in stages if stage["name"] == "metrics"), None)
    if latest_extract is None:
        return None
    if latest_extract["status"] == "failed":
        return "bounded failure: authorise a re-run or accept as a gap"
    if latest_extract["status"] == "in-progress":
        return "model step: run the pending request and record the response"
    if review is None or review["status"] == "in-progress":
        return "support pass: verdicts, dispositions, assessment"
    if review["status"] == "provisional" and (note is None or note["status"] == "provisional"):
        if note is None:
            return "assemble (provisional)"
        return "measure (provisional)" if metrics is None else "provisional: a real review would supersede this note"
    if note is None:
        return "assemble"
    if metrics is None:
        return "measure"
    return None


def _build_synthesis_view(files: list[FileEntry], json_by_path: dict[str, Any]) -> list[dict[str, Any]]:
    stages: list[dict[str, Any]] = []
    for label, pattern in RULES["synthesis_stages"]:
        matches = [file for file in files if pattern.search(file["relPath"])]
        if not matches:
            stages.append({"name": label, "status": "pending", "attempts": 0, "failures": {}, "artifacts": []})
            continue
        attempts: set[int] = set()
        failures: dict[str, int | float] = defaultdict(int)
        statuses: list[str] = []
        artifacts: list[dict[str, Any]] = []
        for file in matches:
            attempt_segment = next((part for part in _segments(file["relPath"]) if RULES["attempt_dir"].fullmatch(part)), None)
            if attempt_segment:
                attempts.add(int(RULES["attempt_dir"].fullmatch(attempt_segment).group(1)))
                if RULES["checks_file"].search(file["relPath"]):
                    for check, count in failure_counts(json_by_path.get(file["relPath"])).items():
                        failures[check] += count
                continue
            status = _status_from_name(_basename(file["relPath"]), json_by_path.get(file["relPath"]))
            if status:
                statuses.append(status)
            artifacts.append(_artifact(file, json_by_path))
        status = _strongest(statuses) if statuses else ("in-progress" if attempts else "pending")
        stages.append({"name": label, "status": status, "attempts": len(attempts), "failures": dict(failures), "artifacts": artifacts})
    return stages


def _build_exceptions(files: list[FileEntry], json_by_path: dict[str, Any]) -> list[dict[str, str]]:
    exceptions = []
    for file in files:
        if RULES["exceptions_dir"] not in _segments(file["relPath"]) or not file["relPath"].endswith(".json"):
            continue
        value = json_by_path.get(file["relPath"])
        record = value if _is_record(value) else {}
        exceptions.append({
            "relPath": file["relPath"],
            "id": _string_field(record, ["id", "exceptionId"]) or _basename(file["relPath"]),
            "kind": _string_field(record, ["kind", "type"]) or "unknown",
            "status": _string_field(record, ["status"]) or "unknown",
            "raisedAt": _string_field(record, ["raisedAt", "occurredAt", "createdAt"]),
        })
    return sorted(exceptions, key=lambda item: item["raisedAt"], reverse=True)


def _evidence_decisions(event_files: list[EventLines]) -> dict[str, dict[str, str]]:
    decisions: dict[str, dict[str, str]] = {}
    for file in event_files:
        for line in file["lines"]:
            try:
                event = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not _is_record(event) or event.get("stage") != "evidence_admission" or event.get("status") != "completed":
                continue
            ref = _string_field(event, ["intakeArtifactRef"])
            if not ref:
                continue
            outcome = _string_field(event, ["eventType"]).rsplit(".", 1)[-1]
            previous = decisions.get(ref)
            at = _string_field(event, ["occurredAt"])
            if previous is None or at >= previous["decidedAt"]:
                decisions[ref] = {
                    "outcome": outcome,
                    "decisionId": _string_field(event, ["decisionId"]),
                    "reviewerId": _string_field(event, ["actorId"]),
                    "snapshotId": _string_field(event, ["snapshotId"]),
                    "decidedAt": at,
                }
    return decisions


def _build_evidence_review(run_id: str, json_by_path: dict[str, Any], event_files: list[EventLines]) -> list[dict[str, Any]]:
    decisions = _evidence_decisions(event_files)
    candidates: list[dict[str, Any]] = []
    for rel_path, value in sorted(json_by_path.items()):
        parts = _segments(rel_path)
        if len(parts) != 3 or parts[0] != "source-reintakes" or parts[2] != "intake-result.json" or not _is_record(value):
            continue
        item = value.get("item") if _is_record(value.get("item")) else {}
        route = value.get("decision") if _is_record(value.get("decision")) else {}
        source = item.get("source") if _is_record(item.get("source")) else {}
        relevance = item.get("questionRelevance") if _is_record(item.get("questionRelevance")) else {}
        assessment = relevance.get("assessment") if _is_record(relevance.get("assessment")) else {}
        support = []
        for entry in assessment.get("support", []) if isinstance(assessment.get("support"), list) else []:
            if _is_record(entry) and _is_record(entry.get("anchor")):
                support.append({
                    "quote": _string_field(entry["anchor"], ["quote"]),
                    "relation": _string_field(entry, ["relationToQuestion"]),
                })
        decision = decisions.get(f"runs/{run_id}/{rel_path}")
        candidates.append({
            "candidateId": parts[1],
            "relPath": rel_path,
            "title": _string_field(source, ["title"]) or parts[1],
            "url": _string_field(source, ["finalUrl", "requestedUrl"]),
            "publisher": _string_field(source, ["publisherHost"]),
            "verdict": _string_field(assessment, ["verdict"]) or "unknown",
            "rationale": _string_field(assessment, ["rationale"]),
            "support": support,
            "limitations": [str(x) for x in assessment.get("limitations", [])] if isinstance(assessment.get("limitations"), list) else [],
            "approvalStatus": _string_field(route, ["approvalStatus"]),
            "assessmentRef": _string_field(relevance, ["assessmentArtifactRef"]),
            "decision": decision,
        })
    return candidates


RELEVANCE_REQUEST_PATH = re.compile(r"^sources/[^/]+/[^/]+/question-relevance/[^/]+/question-relevance-request\.json$")
REVIEW_PACKAGE_PATH = re.compile(r"^assurance/([^/]+)/review/review-package\.json$")
CHALLENGE_RECORD_PATH = re.compile(r"^synthesis/challenge/records/([^/]+)/challenge-record\.json$")
AI_STAGE_PATHS = {
    "extract": re.compile(r"^assurance/([^/]+)/extract/attempt-\d+/extract-request\.json$"),
    "build": re.compile(r"^synthesis/requests/([^/]+)/build-request\.json$"),
    "challenge": re.compile(r"^synthesis/challenge/requests/([^/]+)/challenge-request\.json$"),
    "key-judgements": re.compile(r"^synthesis/key-judgements/requests/([^/]+)/key-judgement-request\.json$"),
    "memo-writer": re.compile(r"^memo/requests/([^/]+)/writer-request\.json$"),
}
AI_STAGE_LABELS = {
    "extract": "Source extraction",
    "build": "Synthesis Build",
    "challenge": "Synthesis Challenge",
    "key-judgements": "Key-judgement selection",
    "memo-writer": "Memo writer",
}
SOURCE_NOTE_PATH = re.compile(r"^assurance/([^/]+)/source-note-(reviewed|provisional)\.json$")


def ai_stage_for(rel_path: str) -> str | None:
    return next((stage for stage, pattern in AI_STAGE_PATHS.items() if pattern.match(rel_path)), None)


def _build_ai_queue(run_id: str, json_by_path: dict[str, Any]) -> list[dict[str, Any]]:
    recorded = {
        value["request"]["artifactRef"]
        for value in json_by_path.values()
        if _is_record(value) and _is_record(value.get("request")) and isinstance(value["request"].get("artifactRef"), str)
    }
    queue: list[dict[str, Any]] = []
    for rel_path in sorted(json_by_path):
        stage = ai_stage_for(rel_path)
        if stage is None:
            continue
        directory = rel_path.rsplit("/", 1)[0]
        if stage == "extract":
            # Every recorded extract attempt writes checks.json beside its request.
            done = f"{directory}/checks.json" in json_by_path
        else:
            done = f"runs/{run_id}/{rel_path}" in recorded
        request = json_by_path[rel_path]
        queue.append({
            "stage": stage,
            "label": AI_STAGE_LABELS[stage],
            "requestPath": rel_path,
            "preparedAt": _string_field(request, ["preparedAt"]) if _is_record(request) else "",
            "status": "recorded" if done else "awaiting-ai",
        })
    return sorted(queue, key=lambda item: item["preparedAt"])


def _build_synthesis_inputs(json_by_path: dict[str, Any]) -> list[dict[str, str]]:
    notes: dict[str, dict[str, str]] = {}
    for rel_path in sorted(json_by_path):
        match = SOURCE_NOTE_PATH.match(rel_path)
        if not match:
            continue
        snapshot_id, status = match.groups()
        if snapshot_id not in notes or status == "reviewed":
            notes[snapshot_id] = {"snapshotId": snapshot_id, "notePath": rel_path, "reviewStatus": status}
    return list(notes.values())


def _build_adjudications(run_id: str, json_by_path: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    prefix = f"runs/{run_id}/"
    for rel_path, record in sorted(json_by_path.items()):
        match = CHALLENGE_RECORD_PATH.match(rel_path)
        if not match or not _is_record(record):
            continue
        record_id = match.group(1)
        build_ref = _string_field(record.get("buildRecord") if _is_record(record.get("buildRecord")) else {}, ["artifactRef"])
        build = json_by_path.get(build_ref[len(prefix):]) if build_ref.startswith(prefix) else None
        build_claims = build.get("synthesis", {}).get("claims", []) if _is_record(build) and _is_record(build.get("synthesis")) else []
        results = [r for r in record.get("results", []) if _is_record(r)]
        adjudication_path = f"synthesis/adjudication/{record_id}/performed-adjudication.json"
        adjudication = json_by_path.get(adjudication_path)
        decided = {c.get("claimId"): c for c in adjudication.get("claims", [])} if _is_record(adjudication) else {}
        claims = []
        for claim in build_claims:
            if not _is_record(claim):
                continue
            claim_id = _string_field(claim, ["id"])
            alias = next((_string_field(r, ["claimAlias"]) for r in results if r.get("claimId") == claim_id), "")
            confidence = claim.get("confidence") if _is_record(claim.get("confidence")) else {}
            claims.append({
                "claimId": claim_id,
                "alias": alias,
                "statement": _string_field(claim, ["statement"]),
                "kind": _string_field(claim, ["kind"]),
                "confidence": _string_field(confidence, ["level"]),
                "challenges": [
                    {
                        "id": _string_field(r, ["id"]),
                        "check": _string_field(r, ["check"]),
                        "rationale": _string_field(r, ["rationale"]),
                        "hypothesis": _string_field(r.get("alternativeHypothesis") if _is_record(r.get("alternativeHypothesis")) else {}, ["text"]),
                    }
                    for r in results if r.get("claimId") == claim_id and r.get("verdict") == "challenge"
                ],
                "status": _string_field(decided.get(claim_id, {}), ["status"]),
            })
        items.append({
            "challengeRecordId": record_id,
            "challengeRecordPath": rel_path,
            "status": "adjudicated" if _is_record(adjudication) else "awaiting-adjudication",
            "adjudicationPath": adjudication_path if _is_record(adjudication) else "",
            "claims": claims,
        })
    return items


def _build_assurance_reviews(json_by_path: dict[str, Any]) -> list[dict[str, Any]]:
    reviews: list[dict[str, Any]] = []
    for rel_path, value in sorted(json_by_path.items()):
        match = REVIEW_PACKAGE_PATH.match(rel_path)
        if not match or not _is_record(value):
            continue
        snapshot_id = match.group(1)
        review_dir = f"assurance/{snapshot_id}/review/"
        reviewed_path = review_dir + "review-record-reviewed.json"
        provisional_path = review_dir + "review-record-provisional.json"
        record_path = reviewed_path if reviewed_path in json_by_path else (provisional_path if provisional_path in json_by_path else "")
        observations = []
        for obs in value.get("observations", []) if isinstance(value.get("observations"), list) else []:
            if not _is_record(obs):
                continue
            attribution = obs.get("attribution") if _is_record(obs.get("attribution")) else {}
            observations.append({
                "observationId": _string_field(obs, ["observationId"]),
                "text": _string_field(obs, ["text"]),
                "quote": _string_field(obs, ["quote"]),
                "claimKind": _string_field(obs, ["claimKind"]),
                "attribution": _string_field(attribution, ["kind"]),
                "attributedTo": _string_field(attribution, ["attributedTo"]),
                "irIds": [str(i) for i in obs.get("irIds", [])] if isinstance(obs.get("irIds"), list) else [],
            })
        model_dispositions = {
            _string_field(d, ["irId"]): {"disposition": _string_field(d, ["disposition"]), "note": _string_field(d, ["note"])}
            for d in value.get("modelDispositions", []) if _is_record(d)
        }
        record = json_by_path.get(record_path) if record_path else None
        reviews.append({
            "snapshotId": snapshot_id,
            "packagePath": rel_path,
            "status": "recorded" if record_path == reviewed_path else ("provisional" if record_path else "awaiting-review"),
            "recordPath": record_path,
            "reviewerId": _string_field(record, ["reviewerId"]) if _is_record(record) else "",
            "supportPass": _string_field(record, ["supportPass"]) if _is_record(record) else "",
            "observations": observations,
            "requirements": [
                {"irId": _string_field(r, ["irId"]), "text": _string_field(r, ["text"]), **model_dispositions.get(_string_field(r, ["irId"]), {})}
                for r in value.get("requirements", []) if _is_record(r)
            ],
        })
    return reviews


def _build_relevance_queue(run_id: str, json_by_path: dict[str, Any], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidate_by_assessment = {c["assessmentRef"]: c["candidateId"] for c in candidates if c["assessmentRef"]}
    queue: list[dict[str, Any]] = []
    for rel_path, value in sorted(json_by_path.items()):
        if not RELEVANCE_REQUEST_PATH.match(rel_path) or not _is_record(value):
            continue
        request_dir = rel_path.rsplit("/", 1)[0]
        source_item_id = _string_field(value, ["sourceItemId"])
        retrieval = json_by_path.get(f"source-retrievals/{source_item_id}/source-retrieval-result.json")
        source = retrieval.get("source") if _is_record(retrieval) and _is_record(retrieval.get("source")) else {}
        assessment_path = next(
            (p for p in sorted(json_by_path) if p.startswith(request_dir + "/assessments/") and p.endswith("/question-relevance-assessment.json")),
            None,
        )
        assessment = json_by_path.get(assessment_path) if assessment_path else None
        segments = value.get("sourceDocument", {}).get("segments", []) if _is_record(value.get("sourceDocument")) else []
        queue.append({
            "requestPath": rel_path,
            "sourceItemId": source_item_id,
            "title": _string_field(source, ["title"]) or source_item_id,
            "publisher": _string_field(source, ["publisherHost"]),
            "url": _string_field(source, ["finalUrl", "requestedUrl"]),
            "segmentCount": len(segments) if isinstance(segments, list) else 0,
            "status": "assessed" if _is_record(assessment) else "awaiting-ai",
            "verdict": _string_field(assessment, ["verdict"]) if _is_record(assessment) else "",
            "assessmentPath": assessment_path or "",
            "candidateId": candidate_by_assessment.get(f"runs/{run_id}/{assessment_path}", "") if assessment_path else "",
        })
    return queue


def parse_events(event_files: list[EventLines]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for file in event_files:
        for line in file["lines"]:
            try:
                parsed = json.loads(line.strip())
            except (ValueError, TypeError):
                continue
            if not _is_record(parsed):
                continue
            events.append({
                "at": _string_field(parsed, ["occurredAt", "at", "timestamp", "recordedAt"]),
                "type": _string_field(parsed, ["eventType", "event", "type"]) or "event",
                "stage": _string_field(parsed, ["stage", "command"]),
                "attempt": _number_field(parsed, ["attempt"]),
                "status": _string_field(parsed, ["status"]),
                "actor": _string_field(parsed, ["actorType", "actor"]),
                "actorId": _string_field(parsed, ["actorId", "reviewerId", "analystId"]),
                "source": file["relPath"],
            })
    events.sort(key=lambda item: item["at"], reverse=True)
    return events[: RULES["max_events"]]


def _unwrap_originated(value: Any) -> Any:
    if _is_record(value) and "value" in value:
        return value["value"]
    return value


def _build_panel1_view(files: list[FileEntry], json_by_path: dict[str, Any]) -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    for label, pattern in RULES["panel1_stages"]:
        matches = [file for file in files if pattern.search(file["relPath"])]
        if not matches:
            stages.append({"name": label, "status": "pending", "attempts": 0, "failures": {}, "artifacts": []})
            continue
        statuses: list[str] = []
        artifacts: list[dict[str, Any]] = []
        for file in matches:
            status = _status_from_name(_basename(file["relPath"]), json_by_path.get(file["relPath"]))
            if status:
                statuses.append(status)
            artifacts.append(_artifact(file, json_by_path))
        stages.append({
            "name": label,
            "status": _strongest(statuses) if statuses else "in-progress",
            "attempts": 0,
            "failures": {},
            "artifacts": artifacts,
        })

    scope_summary: dict[str, Any] | None = None
    questions: list[dict[str, Any]] = []
    requirements: list[dict[str, Any]] = []
    discoveries: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    intakes: list[dict[str, Any]] = []

    for rel_path, value in sorted(json_by_path.items()):
        if not _is_record(value):
            continue
        name = _basename(rel_path)
        if name in ("approved-memo-scope.json", "scope.json") or ("purpose" in value and "threatTopic" in value):
            time_win = _unwrap_originated(value.get("timeWindow"))
            geographies = _unwrap_originated(value.get("geographies"))
            candidate_scope = {
                "id": _string_field(value, ["id"]),
                "version": _number_field(value, ["version"]) or 1,
                "status": _string_field(value, ["status"]) or "proposed",
                "approvedBy": _string_field(value, ["approvedBy"]),
                "approvedAt": _string_field(value, ["approvedAt"]),
                "purpose": str(_unwrap_originated(value.get("purpose")) or ""),
                "threatTopic": str(_unwrap_originated(value.get("threatTopic")) or ""),
                "audience": str(_unwrap_originated(value.get("audience")) or ""),
                "geographies": [str(g) for g in geographies] if isinstance(geographies, list) else [],
                "from": _string_field(time_win, ["from"]) if _is_record(time_win) else "",
                "to": _string_field(time_win, ["to"]) if _is_record(time_win) else "",
                "requestedOutput": str(_unwrap_originated(value.get("requestedOutput")) or "memo"),
                "relPath": rel_path,
            }
            if scope_summary is None or candidate_scope["status"] == "approved":
                scope_summary = candidate_scope
        elif "question" in value and "rationale" in value and isinstance(value.get("question"), str):
            time_win = value.get("timeWindow") if _is_record(value.get("timeWindow")) else {}
            questions.append({
                "id": _string_field(value, ["id"]),
                "question": _string_field(value, ["question"]),
                "rationale": _string_field(value, ["rationale"]),
                "status": _string_field(value, ["status"]) or "proposed",
                "approvedBy": _string_field(value, ["approvedBy"]),
                "geographies": [str(g) for g in value.get("geographies", [])] if isinstance(value.get("geographies"), list) else [],
                "from": _string_field(time_win, ["from"]),
                "to": _string_field(time_win, ["to"]),
                "relPath": rel_path,
            })
        elif isinstance(value.get("requirements"), list) and ("proposalId" in value or "approvalId" in value):
            for req in value["requirements"]:
                if _is_record(req):
                    requirements.append({
                        "id": _string_field(req, ["id", "irId"]),
                        "questionId": _string_field(value, ["questionId", "researchQuestionId"]),
                        "text": _string_field(req, ["text", "requirement", "question", "description"]),
                        "status": "approved" if "approvalId" in value else "proposed",
                        "relPath": rel_path,
                    })
        elif name == "discovery-results.json" and isinstance(value.get("candidates"), list):
            plan_id = _string_field(value, ["planId", "id"]) or rel_path
            discoveries.append({
                "planId": plan_id,
                "researchQuestionId": _string_field(value, ["researchQuestionId"]),
                "apiCalls": _number_field(value, ["apiCalls"]) or 0,
                "candidateCount": len(value["candidates"]),
                "relPath": rel_path,
            })
            for cand in value["candidates"]:
                if not _is_record(cand):
                    continue
                raw_refs = cand.get("rawArtifactRefs")
                first_raw = raw_refs[0] if isinstance(raw_refs, list) and raw_refs and isinstance(raw_refs[0], str) else ""
                candidates.append({
                    "providerItemId": _string_field(cand, ["providerItemId", "id"]),
                    "title": _string_field(cand, ["title"]) or "(untitled)",
                    "sourceType": _string_field(cand, ["sourceType"]) or "unknown",
                    "score": _number_field(cand, ["score"]) or 0,
                    "tier": _number_field(cand, ["tier"]) or 9,
                    "tierLabel": _string_field(cand, ["tierLabel"]) or "Not tiered (earlier search)",
                    "matchedTerms": [str(t) for t in cand.get("matchedTerms", [])] if isinstance(cand.get("matchedTerms"), list) else [],
                    "sourceUrl": _string_field(cand, ["sourceUrl"]),
                    "providerTimestamp": _string_field(cand, ["providerTimestamp"]),
                    "planId": plan_id,
                    "researchQuestionId": _string_field(value, ["researchQuestionId"]),
                    "rawArtifactRef": first_raw,
                    "discoveryRelPath": rel_path,
                })
        elif name == "intake-result.json" and _is_record(value.get("item")):
            item = value["item"]
            decision = value.get("decision") if _is_record(value.get("decision")) else {}
            intakes.append({
                "providerItemId": _string_field(item, ["providerItemId"]),
                "provider": _string_field(item, ["provider"]),
                "sourceType": _string_field(item, ["sourceType"]),
                "role": _string_field(item, ["role"]),
                "destination": _string_field(decision, ["destination"]),
                "approvalStatus": _string_field(decision, ["approvalStatus"]),
                "relPath": rel_path,
            })

    dedup_questions: dict[str, dict[str, Any]] = {}
    for q in questions:
        qid = q["id"] or q["relPath"]
        if qid not in dedup_questions or q["status"] == "approved":
            dedup_questions[qid] = q

    candidates.sort(key=lambda item: (item["score"], item["providerTimestamp"]), reverse=True)
    candidates.sort(key=lambda item: item["tier"])
    return {
        "stages": stages,
        "scope": scope_summary,
        "questions": list(dedup_questions.values()),
        "requirements": requirements,
        "discoveries": discoveries,
        "candidates": candidates,
        "intakes": intakes,
    }


def _derive_run_waiting(
    panel1: dict[str, Any],
    sources: list[dict[str, Any]],
    synthesis: list[dict[str, Any]],
    exceptions: list[dict[str, str]],
) -> list[str]:
    waiting: list[str] = []
    scope = panel1.get("scope")
    questions = panel1.get("questions") or []
    discoveries = panel1.get("discoveries") or []
    intakes = panel1.get("intakes") or []
    if scope is None:
        waiting.append("intent gate: draft and approve memo scope, research question, and IRs")
    elif scope.get("status") != "approved":
        waiting.append(f"intent gate: approve memo scope ({scope.get('id')})")
    elif not any(q.get("status") == "approved" for q in questions):
        waiting.append("intent gate: approve at least one research question")
    elif not discoveries and not intakes and not sources:
        waiting.append("collection: run Seerist discovery or collection for approved question")
    elif discoveries and not intakes and not sources:
        total_cands = sum(d.get("candidateCount", 0) for d in discoveries)
        waiting.append(f"intake: {total_cands} Seerist discovery candidates ready for intake & retrieval")

    open_exceptions = [item for item in exceptions if item["status"] == "open"]
    if open_exceptions:
        waiting.append(f"exception queue: {len(open_exceptions)} open")
    waiting.extend(f"{source['snapshotId']}: {source['waitingOn']}" for source in sources if source["waitingOn"] is not None)
    memo = next((stage for stage in synthesis if stage["name"] == "memo"), None)
    publication = next((stage for stage in synthesis if stage["name"] == "publication"), None)
    if memo is not None and memo["artifacts"] and (publication is None or not publication["artifacts"]):
        if memo["status"] in ("provisional", "synthetic"):
            waiting.append("publication gate: blocked (provisional or synthetic lineage)")
        else:
            waiting.append("publication gate: decision pending")
    return waiting


def build_run_view(
    run_id: str,
    files: list[FileEntry],
    jsons: list[JsonFile],
    event_files: list[EventLines],
    scanned_at: str,
) -> dict[str, Any]:
    json_by_path = {entry["relPath"]: entry["value"] for entry in jsons}
    full = dict(json_by_path)
    by_snapshot: dict[str, list[FileEntry]] = defaultdict(list)
    synthesis_files: list[FileEntry] = []
    panel1_files: list[FileEntry] = []
    for file in files:
        parts = _segments(file["relPath"])
        try:
            assurance_index = parts.index(RULES["assurance_dir"])
        except ValueError:
            assurance_index = -1
        snapshot_id = parts[assurance_index + 1] if assurance_index >= 0 and assurance_index + 1 < len(parts) else None
        if snapshot_id is not None and len(parts) > assurance_index + 2:
            relative = "/".join(parts[assurance_index + 2 :])
            by_snapshot[snapshot_id].append({**file, "relPath": relative})
            value = json_by_path.get(file["relPath"])
            if value is not None:
                json_by_path[relative] = value
            continue
        if any(pattern.search(file["relPath"]) for _, pattern in RULES["panel1_stages"]):
            panel1_files.append(file)
            if not (RULES["synthesis_dir"] in parts):
                continue
        if RULES["synthesis_dir"] in parts or parts[0] == "memo" or any(pattern.search(_basename(file["relPath"])) for _, pattern in RULES["synthesis_stages"]):
            synthesis_files.append(file)

    panel1 = _build_panel1_view(panel1_files, json_by_path)
    sources = [build_source_view(snapshot_id, snapshot_files, json_by_path) for snapshot_id, snapshot_files in sorted(by_snapshot.items())]
    for source in sources:
        for stage in source["stages"]:
            for artifact in stage["artifacts"]:
                suffix = f"assurance/{source['snapshotId']}/{artifact['relPath']}"
                match = next((file["relPath"] for file in files if file["relPath"].endswith(suffix)), None)
                if match is not None:
                    artifact["relPath"] = match
    synthesis = _build_synthesis_view(synthesis_files, json_by_path)
    exceptions = _build_exceptions(files, json_by_path)
    events = parse_events(event_files)
    evidence_review = _build_evidence_review(run_id, json_by_path, event_files)
    relevance_queue = _build_relevance_queue(run_id, json_by_path, evidence_review)
    pending_evidence = sum(1 for c in evidence_review if c["decision"] is None and c["approvalStatus"] == "pending_human_review")
    awaiting_ai = sum(1 for r in relevance_queue if r["status"] == "awaiting-ai")
    assurance_reviews = _build_assurance_reviews(json_by_path)
    awaiting_review = sum(1 for r in assurance_reviews if r["status"] == "awaiting-review")
    adjudications = _build_adjudications(run_id, json_by_path)
    awaiting_adjudication = sum(1 for a in adjudications if a["status"] == "awaiting-adjudication")
    ai_queue = _build_ai_queue(run_id, json_by_path)
    awaiting_ai_stage = sum(1 for item in ai_queue if item["status"] == "awaiting-ai")
    waiting = _derive_run_waiting(panel1, sources, synthesis, exceptions)
    if awaiting_ai_stage:
        waiting.insert(0, f"AI steps: {awaiting_ai_stage} request(s) waiting for a Copilot answer")
    if awaiting_adjudication:
        waiting.insert(0, f"adjudication: {awaiting_adjudication} challenge pass(es) awaiting your decisions")
    if awaiting_review:
        waiting.insert(0, f"source review: {awaiting_review} extracted source(s) awaiting your support review")
    if awaiting_ai:
        waiting.insert(0, f"relevance: {awaiting_ai} source(s) waiting for an AI relevance answer")
    if pending_evidence:
        waiting.insert(0, f"evidence review: {pending_evidence} candidate(s) awaiting your admission decision")
    journey = build_journey(run_id, full, {
        "panel1": panel1,
        "evidenceReview": evidence_review,
        "relevanceQueue": relevance_queue,
        "assuranceReviews": assurance_reviews,
        "adjudications": adjudications,
        "aiQueue": ai_queue,
        "exceptions": exceptions,
    })
    return {
        "runId": run_id,
        "scannedAt": scanned_at,
        "journey": journey,
        "panel1": panel1,
        "sources": sources,
        "synthesis": synthesis,
        "evidenceReview": evidence_review,
        "relevanceQueue": relevance_queue,
        "assuranceReviews": assurance_reviews,
        "adjudications": adjudications,
        "aiQueue": ai_queue,
        "synthesisInputs": _build_synthesis_inputs(json_by_path),
        "exceptions": exceptions,
        "events": events,
        "waitingOn": waiting,
        "counts": {
            "files": len(files),
            "candidates": len(panel1["candidates"]),
            "pendingEvidence": pending_evidence,
            "awaitingRelevance": awaiting_ai,
            "awaitingReview": awaiting_review,
            "awaitingAdjudication": awaiting_adjudication,
            "awaitingAiStage": awaiting_ai_stage,
            "sources": len(sources),
            "openExceptions": sum(1 for item in exceptions if item["status"] == "open"),
            "events": len(events),
        },
    }
