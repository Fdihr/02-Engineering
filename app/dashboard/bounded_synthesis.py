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
    line = next((line.split(": ", 1)[1] for line in step.get("stdout", "").splitlines()
                 if line.startswith(("Execution: ", "Revision: "))), None)
    if line is None:
        raise RuntimeError(step.get("stderr") or "Bounded synthesis returned no execution receipt; inspect its artifacts.")
    value = json.loads(line)
    if not isinstance(value, dict) or not isinstance(value.get("status"), str):
        raise RuntimeError("Bounded synthesis returned an invalid execution projection.")
    return value


def status(runs_root: Path, run_id: str, command: Callable[..., dict[str, Any]], *, pipeline: str = "synthesis") -> dict[str, Any] | None:
    parent = None
    if pipeline == "revision":
        folders = [path for path in (runs_root / run_id / "memo" / "revisions").glob("*")
                   if path.is_dir() and not path.is_symlink() and SAFE_ID.fullmatch(path.name)]
        if not folders:
            return None
        directory = max(folders, key=lambda path: (path.resolve() in ACTIVE,
                        max((f.stat().st_mtime for f in path.glob("*.json")), default=0)))
        parent = directory.name
    else:
        directory = runs_root / run_id / pipeline / "execution"
    active_key = directory.resolve() if pipeline in ("memo", "revision") else (runs_root / run_id).resolve()
    if not (directory / "authorization.json").is_file():
        if active_key in ACTIVE:
            return {"status": "starting", "workerActive": True, "error": "", "runId": run_id,
                    **({"parentMemoId": parent} if parent else {})}
        failures = sorted([*directory.glob("start-blocked-*.json"), *directory.glob("launcher-failure-*.json")],
                          key=lambda path: path.stat().st_mtime)
        if not failures:
            return None
        value = json.loads(failures[-1].read_text(encoding="utf-8"))
        return {"status": "blocked", "error": value["error"], "runId": run_id, "authorized": False,
                **({"parentMemoId": parent} if parent else {})}
    try:
        value = _execution_result(command("revise:memo" if parent else "run:memo" if pipeline == "memo" else "run:synthesis",
                                          ["status", run_id, parent] if parent else ["status", run_id], runs_root=runs_root))
    except (OSError, ValueError, RuntimeError) as error:
        value = {"status": "blocked", "runId": run_id, "error": f"Execution status unavailable: {error}"}
    failures = sorted(directory.glob("launcher-failure-*.json"), key=lambda path: path.stat().st_mtime)
    if failures:
        value["launcherError"] = json.loads(failures[-1].read_text(encoding="utf-8"))["error"]
    value["workerActive"] = value.get("workerActive", False) or active_key in ACTIVE
    value["authorized"] = True
    if parent:
        value["parentMemoId"] = parent
    return value


def start(
    runs_root: Path, payload: dict[str, Any], command: Callable[..., dict[str, Any]],
    model_lock: threading.Lock, *, pipeline: str = "synthesis",
) -> tuple[int, dict[str, Any]]:
    from .scan import resolve_inside_run

    run_id, analyst = payload.get("runId"), payload.get("reviewerId")
    if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in (run_id, analyst)):
        return 400, {"ok": False, "error": "A valid run and explicit analyst ID are required."}
    run_dir = resolve_inside_run(runs_root, run_id)
    if run_dir is None or not run_dir.is_dir():
        return 404, {"ok": False, "error": "Analysis run not found."}
    mode = "resume" if payload["action"].startswith("resume-") else "start"
    parent = payload.get("memoId") if pipeline == "revision" else None
    if pipeline == "revision" and (not isinstance(parent, str) or not SAFE_ID.fullmatch(parent)):
        return 400, {"ok": False, "error": "Choose the reviewed parent memo before authorizing an editorial revision."}
    directory = run_dir / "memo" / "revisions" / parent if parent else run_dir / pipeline / "execution"
    if not directory.resolve().is_relative_to(run_dir.resolve()):
        return 400, {"ok": False, "error": "Execution artifacts must remain inside this run."}
    if parent:
        directory.mkdir(parents=True, exist_ok=True)
    if mode == "resume" and not (directory / "authorization.json").is_file():
        return 409, {"ok": False, "error": "Use the explicit bounded start action before resuming."}
    adjudication = None
    if pipeline == "memo" and mode == "start":
        reference = payload.get("adjudicationPath")
        adjudication = resolve_inside_run(run_dir, reference) if isinstance(reference, str) else None
        if adjudication is None or adjudication.name != "performed-adjudication.json" or not adjudication.is_file():
            return 400, {"ok": False, "error": "Choose a performed adjudication in this run before authorizing memo work."}
    if not model_lock.acquire(blocking=False):
        return 409, {"ok": False, "error": "A Copilot stage is already running; no new allowance or call was created."}
    active_key = directory.resolve() if pipeline in ("memo", "revision") else run_dir.resolve()
    ACTIVE.add(active_key)

    def work() -> None:
        try:
            args = [mode, run_id, analyst] if mode == "start" else [mode, run_id]
            if parent:
                args = [mode, run_id, parent, analyst] if mode == "start" else [mode, run_id, parent]
            if adjudication is not None:
                args.append(str(adjudication))
            _execution_result(command("revise:memo" if parent else "run:memo" if pipeline == "memo" else "run:synthesis", args, timeout_sec=900, runs_root=runs_root))
        except (OSError, ValueError, RuntimeError) as error:
            directory.mkdir(parents=True, exist_ok=True)
            with (directory / f"launcher-failure-{uuid.uuid4().hex}.json").open("x", encoding="utf-8") as file:
                json.dump({"status": "failed", "error": str(error), "phase": "dashboard-launcher"}, file)
                file.flush()
                os.fsync(file.fileno())
        finally:
            ACTIVE.discard(active_key)
            model_lock.release()

    try:
        threading.Thread(target=work, name=f"bounded-{pipeline}-{run_id}", daemon=True).start()
    except RuntimeError as error:
        ACTIVE.discard(active_key)
        model_lock.release()
        return 503, {"ok": False, "error": f"Could not start the bounded {pipeline} worker: {error}"}
    return 202, {
        "ok": True, "runId": run_id, "status": "starting",
        "message": ("Editorial revision started. One frozen writer call, then a new draft requiring fresh review. Publication is not authorized." if parent else
                    "Bounded memo started. It uses at most one selection and one writer call, then stops at memo review. Publication is not authorized."
                    if pipeline == "memo" else "Bounded synthesis started. It uses at most one Build and one Challenge call, then stops for your adjudication."),
    }


def compose_workflow(base: dict[str, Any], execution: dict[str, Any] | None,
                     adjudicated_round: dict[str, Any] | None = None) -> dict[str, Any]:
    """Combine observed facts, then let the one shared selector choose eligible work."""
    if not execution or not execution.get("authorized"):
        return base
    bounded = execution.get("workflowInput")
    if not isinstance(bounded, dict):
        return {**base, "blockers": [*base["blockers"], {
            "id": "bounded:integrity", "kind": "integrity", "scope": "unknown", "paths": [],
            "affectedWorkIds": [], "uncertain": True, "title": "Bounded execution status requires recovery",
            "detail": execution.get("error") or "Execution facts are unavailable; inspect the saved authority.",
        }]}
    if (execution.get("pipeline") != "memo" and execution.get("status") == "human-waiting"
            and adjudicated_round and adjudicated_round.get("adjudicationStatus") == "adjudicated"):
        record = execution.get("stages", {}).get("challenge", {}).get("record") or {}
        reference = str(record.get("artifactRef", "")).replace("\\", "/")
        challenge = adjudicated_round.get("challengeRecordPath")
        if challenge and reference.endswith(f"/{base['runId']}/{challenge}"):
            # The bounded controller stops at Challenge; later human decisions belong to the observed run.
            return {**base, "committedOutcomes": base["committedOutcomes"] + bounded["committedOutcomes"],
                    "blockers": base["blockers"] + bounded["blockers"]}
    stages = ("synthesise", "memo") if execution.get("pipeline") == "memo" else ("synthesise",)
    replaced = {work["id"] for work in base["readyWork"] if work["stage"] in stages}
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
