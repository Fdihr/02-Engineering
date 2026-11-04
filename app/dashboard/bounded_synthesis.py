"""Thin async launcher; TypeScript artifacts and shared projection own execution authority."""
from __future__ import annotations

import json
import re
import threading
import uuid
import os
from pathlib import Path
from typing import Any, Callable

ACTIVE: set[Path] = set()
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def _execution_result(step: dict[str, Any]) -> dict[str, Any]:
    line = next((line[len("Execution: "):] for line in step.get("stdout", "").splitlines()
                 if line.startswith("Execution: ")), None)
    if line is None:
        raise RuntimeError(step.get("stderr") or "Bounded synthesis returned no execution receipt; inspect its artifacts.")
    value = json.loads(line)
    if not isinstance(value, dict) or not isinstance(value.get("status"), str):
        raise RuntimeError("Bounded synthesis returned an invalid execution projection.")
    return value


def status(runs_root: Path, run_id: str, command: Callable[..., dict[str, Any]]) -> dict[str, Any] | None:
    directory = runs_root / run_id / "synthesis" / "execution"
    active_key = (runs_root / run_id).resolve()
    if not (directory / "authorization.json").is_file():
        if active_key in ACTIVE:
            return {"status": "starting", "workerActive": True, "error": "", "runId": run_id}
        failures = sorted([*directory.glob("start-blocked-*.json"), *directory.glob("launcher-failure-*.json")],
                          key=lambda path: path.stat().st_mtime)
        if not failures:
            return None
        value = json.loads(failures[-1].read_text(encoding="utf-8"))
        return {"status": "blocked", "error": value["error"], "runId": run_id, "authorized": False}
    try:
        value = _execution_result(command("run:synthesis", ["status", run_id], runs_root=runs_root))
    except (OSError, ValueError, RuntimeError) as error:
        value = {"status": "blocked", "runId": run_id, "error": f"Execution status unavailable: {error}"}
    failures = sorted(directory.glob("launcher-failure-*.json"), key=lambda path: path.stat().st_mtime)
    if failures:
        value["launcherError"] = json.loads(failures[-1].read_text(encoding="utf-8"))["error"]
    value["workerActive"] = value.get("workerActive", False) or active_key in ACTIVE
    value["authorized"] = True
    return value


def start(
    runs_root: Path, payload: dict[str, Any], command: Callable[..., dict[str, Any]],
    model_lock: threading.Lock,
) -> tuple[int, dict[str, Any]]:
    from .scan import resolve_inside_run

    run_id, analyst = payload.get("runId"), payload.get("reviewerId")
    if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in (run_id, analyst)):
        return 400, {"ok": False, "error": "A valid run and explicit analyst ID are required."}
    run_dir = resolve_inside_run(runs_root, run_id)
    if run_dir is None or not run_dir.is_dir():
        return 404, {"ok": False, "error": "Analysis run not found."}
    mode = "resume" if payload["action"] == "resume-bounded-synthesis" else "start"
    if mode == "resume" and not (run_dir / "synthesis" / "execution" / "authorization.json").is_file():
        return 409, {"ok": False, "error": "Use the explicit bounded start action before resuming."}
    if not model_lock.acquire(blocking=False):
        return 409, {"ok": False, "error": "A Copilot stage is already running; no new allowance or call was created."}
    active_key = run_dir.resolve()
    ACTIVE.add(active_key)

    def work() -> None:
        try:
            args = [mode, run_id, analyst] if mode == "start" else [mode, run_id]
            _execution_result(command("run:synthesis", args, timeout_sec=900, runs_root=runs_root))
        except (OSError, ValueError, RuntimeError) as error:
            directory = run_dir / "synthesis" / "execution"
            directory.mkdir(parents=True, exist_ok=True)
            with (directory / f"launcher-failure-{uuid.uuid4().hex}.json").open("x", encoding="utf-8") as file:
                json.dump({"status": "failed", "error": str(error), "phase": "dashboard-launcher"}, file)
                file.flush()
                os.fsync(file.fileno())
        finally:
            ACTIVE.discard(active_key)
            model_lock.release()

    try:
        threading.Thread(target=work, name=f"bounded-synthesis-{run_id}", daemon=True).start()
    except RuntimeError as error:
        ACTIVE.discard(active_key)
        model_lock.release()
        return 503, {"ok": False, "error": f"Could not start the bounded synthesis worker: {error}"}
    return 202, {
        "ok": True, "runId": run_id, "status": "starting",
        "message": "Bounded synthesis started. It uses at most one Build and one Challenge call, then stops for your adjudication.",
    }


def compose_workflow(base: dict[str, Any], execution: dict[str, Any] | None) -> dict[str, Any]:
    """Combine observed facts, then let the one shared selector choose eligible work."""
    if not execution or not execution.get("authorized"):
        return base
    bounded = execution.get("workflowInput")
    if not isinstance(bounded, dict):
        return {**base, "blockers": [*base["blockers"], {
            "id": "bounded:integrity", "kind": "integrity", "scope": "unknown", "paths": [],
            "affectedWorkIds": [], "uncertain": True, "title": "Bounded synthesis status requires recovery",
            "detail": execution.get("error") or "Execution facts are unavailable; inspect the saved authority.",
        }]}
    replaced = {work["id"] for work in base["readyWork"] if work["stage"] == "synthesise"}
    blockers = {blocker["id"]: blocker for blocker in base["blockers"]}
    for blocker in bounded["blockers"]:
        prior = blockers.get(blocker["id"], {})
        blockers[blocker["id"]] = {
            **blocker,
            "affectedWorkIds": sorted(set(prior.get("affectedWorkIds", []) + blocker["affectedWorkIds"])),
        }
    return {
        **base,
        "committedOutcomes": base["committedOutcomes"] + bounded["committedOutcomes"],
        "readyWork": [work for work in base["readyWork"] if work["id"] not in replaced] + bounded["readyWork"],
        "humanDecisions": [item for item in base["humanDecisions"] if item["id"] not in replaced] + bounded["humanDecisions"],
        "interimCheckpoints": [item for item in base["interimCheckpoints"] if item["id"] not in replaced] + bounded["interimCheckpoints"],
        "blockers": list(blockers.values()),
    }
