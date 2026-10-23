"""Bounded, read-only scans of one run directory."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .model import RULES

DEFAULT_SCAN_LIMITS = {"maxDepth": 14, "maxEntries": 8000, "maxJsonBytes": 2 * 1024 * 1024, "maxEventsBytes": 4 * 1024 * 1024}


def scan_run_directory(run_dir: str | Path, limits: dict[str, int] | None = None) -> dict[str, Any]:
    bounds = {**DEFAULT_SCAN_LIMITS, **(limits or {})}
    root = Path(run_dir).resolve()
    files: list[dict[str, Any]] = []
    truncated = False

    def walk(directory: Path, depth: int) -> None:
        nonlocal truncated
        if depth > bounds["maxDepth"] or len(files) >= bounds["maxEntries"]:
            truncated = True
            return
        try:
            entries = sorted(os.scandir(directory), key=lambda entry: entry.name)
        except OSError:
            return
        for entry in entries:
            if len(files) >= bounds["maxEntries"]:
                truncated = True
                return
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    walk(Path(entry.path), depth + 1)
                elif entry.is_file(follow_symlinks=False):
                    stat = entry.stat(follow_symlinks=False)
                    relative = Path(entry.path).relative_to(root).as_posix()
                    files.append({"relPath": relative, "size": stat.st_size, "mtimeMs": int(stat.st_mtime * 1000)})
            except OSError:
                continue

    walk(root, 0)
    jsons: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for file in files:
        artifact_path = root.joinpath(*file["relPath"].split("/"))
        if file["relPath"] == RULES["events_file"] or file["relPath"].endswith("/" + RULES["events_file"]):
            if file["size"] <= bounds["maxEventsBytes"]:
                try:
                    lines = artifact_path.read_text(encoding="utf-8").splitlines()
                    events.append({"relPath": file["relPath"], "lines": lines})
                except (OSError, UnicodeError):
                    pass
            continue
        if file["relPath"].endswith(".json") and file["size"] <= bounds["maxJsonBytes"]:
            try:
                value = json.loads(artifact_path.read_text(encoding="utf-8"))
                jsons.append({"relPath": file["relPath"], "value": value})
            except (OSError, UnicodeError, json.JSONDecodeError):
                pass
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
        if not absolute.is_file() or absolute.stat().st_size > max_bytes:
            return None
        return absolute.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
