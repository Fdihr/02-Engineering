"""Bounded, read-only scans of one run directory."""
from __future__ import annotations

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


def list_available_runs(runs_root: str | Path) -> list[dict[str, Any]]:
    """List run directories under the parent runs root."""
    root = Path(runs_root).resolve()
    items: list[dict[str, Any]] = []
    try:
        entries = sorted(os.scandir(_fs_path(root)), key=lambda entry: entry.name)
    except OSError:
        return items
    for entry in entries:
        try:
            if entry.is_symlink() or not entry.is_dir(follow_symlinks=False):
                continue
            # Evidence admission writes snapshot folders beside analyses; they are not runs.
            if os.path.isfile(os.path.join(entry.path, "approved-evidence-snapshot.json")):
                continue
            stat = entry.stat(follow_symlinks=False)
            items.append({
                "runId": entry.name,
                "mtimeMs": int(stat.st_mtime * 1000),
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
