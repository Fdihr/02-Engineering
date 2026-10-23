"""Pure run-directory projections used by the dashboard."""
from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from typing import Any

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
        ("relevance", re.compile(r"relevance", re.IGNORECASE)),
        ("memo", re.compile(r"memo", re.IGNORECASE)),
        ("verification", re.compile(r"verif", re.IGNORECASE)),
        ("publication", re.compile(r"publication", re.IGNORECASE)),
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
                "source": file["relPath"],
            })
    events.sort(key=lambda item: item["at"], reverse=True)
    return events[: RULES["max_events"]]


def _derive_run_waiting(sources: list[dict[str, Any]], synthesis: list[dict[str, Any]], exceptions: list[dict[str, str]]) -> list[str]:
    waiting: list[str] = []
    open_exceptions = [item for item in exceptions if item["status"] == "open"]
    if open_exceptions:
        waiting.append(f"exception queue: {len(open_exceptions)} open")
    waiting.extend(f"{source['snapshotId']}: {source['waitingOn']}" for source in sources if source["waitingOn"] is not None)
    memo = next((stage for stage in synthesis if stage["name"] == "memo"), None)
    publication = next((stage for stage in synthesis if stage["name"] == "publication"), None)
    if memo is not None and publication is None:
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
    by_snapshot: dict[str, list[FileEntry]] = defaultdict(list)
    synthesis_files: list[FileEntry] = []
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
        if RULES["synthesis_dir"] in parts or any(pattern.search(_basename(file["relPath"])) for _, pattern in RULES["synthesis_stages"]):
            synthesis_files.append(file)

    sources = [build_source_view(snapshot_id, snapshot_files, json_by_path) for snapshot_id, snapshot_files in sorted(by_snapshot.items())]
    synthesis = _build_synthesis_view(synthesis_files, json_by_path)
    exceptions = _build_exceptions(files, json_by_path)
    events = parse_events(event_files)
    return {
        "runId": run_id,
        "scannedAt": scanned_at,
        "sources": sources,
        "synthesis": synthesis,
        "exceptions": exceptions,
        "events": events,
        "waitingOn": _derive_run_waiting(sources, synthesis, exceptions),
        "counts": {
            "files": len(files),
            "sources": len(sources),
            "openExceptions": sum(1 for item in exceptions if item["status"] == "open"),
            "events": len(events),
        },
    }
