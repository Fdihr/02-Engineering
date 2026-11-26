"""Thin bridge to the deterministic, artifact-bound memo reviewer."""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path
from typing import Any, Callable

SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def _result(step: dict[str, Any], prefix: str = "Review: ") -> dict[str, Any]:
    if not step.get("ok"):
        raise ValueError(step.get("stderr") or "Memo review command failed; inspect the saved draft.")
    line = next((line[len(prefix):] for line in step.get("stdout", "").splitlines() if line.startswith(prefix)), None)
    if line is None:
        raise ValueError("Memo review returned no receipt. Refresh before retrying.")
    value = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("Memo review returned an invalid receipt.")
    return value


def status(root: Path, run_id: str, memo_id: str, command: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    try:
        return _result(command("review:memo", ["inspect", run_id, memo_id], runs_root=root))
    except (OSError, ValueError) as error:
        return {"error": str(error), "approvalAvailable": False, "decisionStatus": "unavailable"}


def record(root: Path, payload: dict[str, Any], command: Callable[..., dict[str, Any]]) -> tuple[int, dict[str, Any]]:
    run_id, memo_id, reviewer = (payload.get(key) for key in ("runId", "memoId", "reviewerId"))
    if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in (run_id, memo_id, reviewer)):
        return 400, {"ok": False, "error": "A valid run, memo and explicit reviewer ID are required."}
    submitted = {key: payload.get(key) for key in (
        "target", "reviewerId", "decision", "issueType", "feedback", "sampledVerdicts", "drillDownVerdicts")}
    try:
        with tempfile.TemporaryDirectory(prefix="cti-memo-review-") as directory:
            path = Path(directory) / "review-input.json"
            path.write_text(json.dumps(submitted), encoding="utf-8")
            value = _result(command("review:memo", ["record", run_id, memo_id, str(path)], runs_root=root))
        return 200, {"ok": True, **value, "message": "Memo decision recorded. Publication remains blocked; no new model work was authorized."}
    except (OSError, ValueError) as error:
        return 409, {"ok": False, "error": str(error)}


def publish(root: Path, payload: dict[str, Any], command: Callable[..., dict[str, Any]]) -> tuple[int, dict[str, Any]]:
    run_id, memo_id, publisher = (payload.get(key) for key in ("runId", "memoId", "publisherId"))
    if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in (run_id, memo_id, publisher)):
        return 400, {"ok": False, "error": "A valid run, memo and explicit publisher ID are required."}
    try:
        step = command("publish:memo", [run_id, memo_id, publisher], runs_root=root)
        value = _result(step, "Published: ")
        artifact = value.get("path")
        if not isinstance(artifact, str) or not artifact:
            raise ValueError("Publication returned no artifact path. Inspect the run before retrying.")
        return 200, {"ok": True, **value, "message": "Immutable local publication package created."}
    except (OSError, ValueError) as error:
        return 409, {"ok": False, "error": str(error)}


def approve_and_publish(root: Path, payload: dict[str, Any], command: Callable[..., dict[str, Any]]) -> tuple[int, dict[str, Any]]:
    run_id, memo_id, reviewer = (payload.get(key) for key in ("runId", "memoId", "reviewerId"))
    if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in (run_id, memo_id, reviewer)):
        return 400, {"ok": False, "error": "A valid run, memo and explicit analyst ID are required."}
    feedback = str(payload.get("feedback") or "Reviewed and approved for publication.").strip()
    if len(feedback) < 3:
        feedback = "Reviewed and approved for publication."
    try:
        step = command("review:memo", ["approve-and-publish", run_id, memo_id, reviewer, feedback[:2000]], runs_root=root)
        value = _result(step, "Published: ")
        artifact = value.get("path")
        if not isinstance(artifact, str) or not artifact:
            raise ValueError("Publication returned no artifact path. Inspect the run before retrying.")
        return 200, {"ok": True, "runId": run_id, **value, "message": "Memo approved and published."}
    except (OSError, ValueError) as error:
        return 409, {"ok": False, "error": str(error)}

