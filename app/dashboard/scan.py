"""Bounded, read-only scans of one run directory."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

from .model import RULES

DEFAULT_SCAN_LIMITS = {"maxDepth": 14, "maxEntries": 8000, "maxJsonBytes": 2 * 1024 * 1024, "maxEventsBytes": 4 * 1024 * 1024}
ROOT_EVENT_FILES = (
    "events.jsonl",
    "research-events.jsonl",
    "collection-events.jsonl",
    "discovery-events.jsonl",
    "intake-events.jsonl",
    "source-retrieval-events.jsonl",
    "source-document-events.jsonl",
    "question-relevance-events.jsonl",
    "source-reintake-events.jsonl",
    "evidence-events.jsonl",
    "source-assurance-events.jsonl",
)


def _fs_path(path: Path) -> str:
    resolved = str(path.resolve())
    if os.name == "nt" and not resolved.startswith("\\\\?\\"):
        if resolved.startswith("\\\\"):
            return "\\\\?\\UNC\\" + resolved.lstrip("\\")
        return "\\\\?\\" + resolved
    return resolved


def _unwrap_value(raw: Any) -> Any:
    if isinstance(raw, dict) and "value" in raw:
        return raw["value"]
    return raw


def _glob_sorted(directory: Path, pattern: str) -> list[Path]:
    """Glob without \\\\?\\ prefix (Windows pathlib.glob fails on extended-length prefixes)."""
    plain = Path(str(directory).removeprefix("\\\\?\\"))
    try:
        return sorted(plain.glob(pattern))
    except OSError:
        return []


def _summarize_run_dir(run_dir: Path, *, active_runs: set[Path] | None = None) -> dict[str, Any]:
    """Read lightweight run summary metadata without scanning every file."""
    question = ""
    scope_summary = ""
    status = "draft"
    source_count = 0
    memo_id = ""
    try:
        rq_files = _glob_sorted(run_dir / "research-questions", "*/approved-research-question.json")
        if rq_files:
            rq = json.loads(Path(_fs_path(rq_files[-1])).read_text(encoding="utf-8"))
            q_val = _unwrap_value(rq.get("question")) or _unwrap_value(rq.get("researchThesis")) or ""
            question = str(q_val).strip()
            status = "approved"
        scope_files = _glob_sorted(run_dir / "memo-scopes", "*/*/approved-memo-scope.json")
        if scope_files:
            scope = json.loads(Path(_fs_path(scope_files[-1])).read_text(encoding="utf-8"))
            raw_geos = _unwrap_value(scope.get("geographies"))
            geos = ", ".join(str(g) for g in raw_geos) if isinstance(raw_geos, list) else str(raw_geos or "")
            win = _unwrap_value(scope.get("timeWindow")) or {}
            if not isinstance(win, dict):
                win = {}
            t_from = str(win.get("from") or win.get("start") or "")[:10]
            t_to = str(win.get("to") or win.get("end") or "")[:10]
            parts = [p for p in (geos, f"{t_from} → {t_to}" if t_from and t_to else "") if p]
            scope_summary = " · ".join(parts)
            if not question:
                question = str(_unwrap_value(scope.get("researchThesis")) or "").strip()
        source_count = len(_glob_sorted(run_dir / "assurance", "*/source-note-reviewed.json"))
        pipe_file = run_dir / "pipeline" / "status.json"
        if os.path.isfile(_fs_path(pipe_file)):
            pipe = json.loads(Path(_fs_path(pipe_file)).read_text(encoding="utf-8"))
            raw_state = str(pipe.get("state") or pipe.get("status") or "")
            if raw_state == "memo-review":
                p_status = "ready-for-review"
            elif raw_state == "running" and active_runs is not None and run_dir.resolve() not in active_runs:
                p_status = "interrupted"
            else:
                p_status = raw_state
            if p_status in ("running", "failed", "interrupted", "ready-for-review"):
                status = p_status
            p_counts = pipe.get("counts") or {}
            assured = p_counts.get("sourcesAssured") or p_counts.get("assuredSources") or p_counts.get("assured")
            if isinstance(assured, int) and assured > source_count:
                source_count = assured
        memo_files = _glob_sorted(run_dir / "memo", "*/memo.json")
        if memo_files:
            memo = json.loads(Path(_fs_path(memo_files[-1])).read_text(encoding="utf-8"))
            memo_id = str(memo.get("id") or "")
            status = "ready-for-review"
        pub_files = [
            p for p in _glob_sorted(run_dir / "published", "*/*.json")
            if p.name in ("publication.json", "publication-record.json", "published-memo.json")
        ] or _glob_sorted(run_dir / "memo", "*/publication-record.json")
        if pub_files:
            status = "published"
    except (OSError, ValueError, TypeError):
        pass
    return {
        "question": question,
        "scopeSummary": scope_summary,
        "status": status,
        "sourceCount": source_count,
        "memoId": memo_id,
    }


def list_available_runs(runs_root: str | Path, *, active_runs: set[Path] | None = None) -> list[dict[str, Any]]:
    """List run directories under the parent runs root."""
    root = Path(runs_root).resolve()
    items: list[dict[str, Any]] = []
    try:
        entries = sorted(os.scandir(_fs_path(root)), key=lambda entry: entry.name)
    except OSError:
        return items
    for entry in entries:
        try:
            if entry.name.startswith((".", "_")) or entry.is_symlink() or not entry.is_dir(follow_symlinks=False):
                continue
            # Evidence admission writes snapshot folders beside analyses; they are not runs.
            if os.path.isfile(os.path.join(entry.path, "approved-evidence-snapshot.json")):
                continue
            stat = entry.stat(follow_symlinks=False)
            summary = _summarize_run_dir(root / entry.name, active_runs=active_runs)
            mtime_ms = int(stat.st_mtime * 1000)
            updated_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
            items.append({
                "runId": entry.name,
                "mtimeMs": mtime_ms,
                "updatedAt": updated_at,
                **summary,
            })
        except OSError:
            continue
    items.sort(key=lambda item: (not item["runId"].startswith("seerist-"), item["mtimeMs"]), reverse=True)
    return items


def scan_run_directory(run_dir: str | Path, limits: dict[str, int] | None = None, run_id: str | None = None) -> dict[str, Any]:
    bounds = {**DEFAULT_SCAN_LIMITS, **(limits or {})}
    root = Path(run_dir).resolve()
    selected_run_id = run_id or root.name
    files: list[dict[str, Any]] = []
    truncated = False

    def walk(directory: Path, depth: int) -> None:
        nonlocal truncated
        if depth > bounds["maxDepth"] or len(files) >= bounds["maxEntries"]:
            truncated = True
            return
        try:
            entries = sorted(os.scandir(_fs_path(directory)), key=lambda entry: entry.name)
        except OSError:
            return
        for entry in entries:
            if len(files) >= bounds["maxEntries"]:
                truncated = True
                return
            try:
                if entry.is_symlink():
                    continue
                entry_path = directory / entry.name
                if entry.is_dir(follow_symlinks=False):
                    walk(entry_path, depth + 1)
                elif entry.is_file(follow_symlinks=False):
                    stat = entry.stat(follow_symlinks=False)
                    relative = entry_path.relative_to(root).as_posix()
                    files.append({"relPath": relative, "size": stat.st_size, "mtimeMs": int(stat.st_mtime * 1000)})
            except OSError:
                continue

    walk(root, 0)
    jsons: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for file in files:
        artifact_path = root.joinpath(*file["relPath"].split("/"))
        if file["relPath"] == RULES["events_file"] or file["relPath"].endswith("/" + RULES["events_file"]) or file["relPath"].endswith("-events.jsonl"):
            if file["size"] <= bounds["maxEventsBytes"]:
                try:
                    lines = Path(_fs_path(artifact_path)).read_text(encoding="utf-8").splitlines()
                    events.append({"relPath": file["relPath"], "lines": lines})
                except (OSError, UnicodeError):
                    pass
            continue
        if file["relPath"].endswith(".json") and file["size"] <= bounds["maxJsonBytes"]:
            try:
                value = json.loads(Path(_fs_path(artifact_path)).read_text(encoding="utf-8"))
                jsons.append({"relPath": file["relPath"], "value": value})
            except (OSError, UnicodeError, json.JSONDecodeError):
                pass

    parent = root.parent
    for event_name in ROOT_EVENT_FILES:
        parent_event = parent / event_name
        try:
            fs_event = Path(_fs_path(parent_event))
            if not fs_event.is_file() or fs_event.stat().st_size > bounds["maxEventsBytes"]:
                continue
            matched_lines: list[str] = []
            for raw_line in fs_event.read_text(encoding="utf-8").splitlines():
                try:
                    event = json.loads(raw_line)
                except (ValueError, TypeError):
                    continue
                if isinstance(event, dict) and (event.get("runId") == selected_run_id or event.get("sourceRunId") == selected_run_id):
                    matched_lines.append(raw_line)
            if matched_lines:
                events.append({"relPath": f"../{event_name}", "lines": matched_lines})
        except (OSError, UnicodeError):
            continue

    return {"files": files, "jsons": jsons, "events": events, "truncated": truncated}


def resolve_inside_run(run_dir: str | Path, rel_path: str) -> Path | None:
    """Resolve a run-relative path and refuse traversal and symlink escapes."""
    root = Path(run_dir).resolve()
    if "\0" in rel_path:
        return None
    candidate = Path(rel_path)
    if candidate.is_absolute():
        return None
    try:
        absolute = (root / candidate).resolve()
        absolute.relative_to(root)
    except (OSError, RuntimeError, ValueError):
        return None
    return absolute


def read_artifact_text(absolute: Path, max_bytes: int) -> str | None:
    try:
        target = Path(_fs_path(absolute))
        if not target.is_file() or target.stat().st_size > max_bytes:
            return None
        return target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
