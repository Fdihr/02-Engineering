"""Background launcher and live status reader for the automated research pipeline."""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .scan import _fs_path, resolve_inside_run

ACTIVE: set[Path] = set()
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
DEFAULT_MAX_EXTERNAL_ARTICLES = 6


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _status_file(runs_root: Path, run_id: str) -> Path:
    return runs_root / run_id / "pipeline" / "status.json"


def _write_status(path: Path, payload: dict[str, Any]) -> None:
    fs_dir = Path(_fs_path(path.parent))
    fs_dir.mkdir(parents=True, exist_ok=True)
    tmp = Path(_fs_path(path.with_suffix(".json.tmp")))
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(Path(_fs_path(path)))


STAGE_TO_UI: dict[str, str] = {
    "starting": "collection",
    "discovery": "collection",
    "collection": "collection",
    "collect": "collection",
    "relevance": "evidence",
    "extract": "evidence",
    "evidence": "evidence",
    "assurance": "assurance",
    "assure": "assurance",
    "synthesis": "synthesis",
    "synthesize": "synthesis",
    "adjudication": "synthesis",
    "adjudicate": "synthesis",
    "memo": "memo",
    "draft": "memo",
    "complete": "completed",
    "completed": "completed",
}

EMPTY_COUNTS: dict[str, int] = {
    "discoveredCandidates": 0,
    "seeristAnalysisFound": 0,
    "externalUrlsAttempted": 0,
    "externalArticlesCaptured": 0,
    "sourcesScreened": 0,
    "sourcesAdmitted": 0,
    "sourcesAssured": 0,
    "observationsExtracted": 0,
    "claimsBuilt": 0,
    "contestedClaims": 0,
}


def normalize_status(data: dict[str, Any], *, worker_active: bool = False) -> dict[str, Any]:
    out = dict(data)
    raw_state = str(out.get("state") or out.get("status") or "").strip()
    if raw_state == "memo-review":
        ui_status = "ready-for-review"
    elif raw_state == "running":
        ui_status = "running" if worker_active else "interrupted"
    elif raw_state in ("published", "failed", "interrupted", "ready-for-review"):
        ui_status = raw_state
    else:
        ui_status = "running" if worker_active else "idle"

    if ui_status == "interrupted" and not out.get("error"):
        out["error"] = "The pipeline worker stopped before finishing. Resume the pipeline to continue from saved artifacts."

    raw_stage = str(out.get("currentStage") or out.get("stage") or out.get("phase") or "").strip()
    ui_stage = STAGE_TO_UI.get(
        raw_stage,
        "completed" if ui_status in ("ready-for-review", "published") else "collection",
    )
    msg = str(out.get("stageDetail") or out.get("message") or out.get("detail") or "").strip()

    raw_counts = out.get("counts") if isinstance(out.get("counts"), dict) else {}
    norm_counts = {**EMPTY_COUNTS, **raw_counts}
    if "leads" not in raw_counts:
        norm_counts["leads"] = int(raw_counts.get("discoveredCandidates", raw_counts.get("discovered", 0)) or 0)
    if "capturedSources" not in raw_counts:
        ts_captured = int(raw_counts.get("seeristAnalysisFound", 0) or 0) + int(raw_counts.get("externalArticlesCaptured", 0) or 0)
        norm_counts["capturedSources"] = ts_captured if ts_captured else int(raw_counts.get("captured", 0) or 0)
    if "assuredSources" not in raw_counts:
        norm_counts["assuredSources"] = int(raw_counts.get("sourcesAssured", raw_counts.get("assured", 0)) or 0)
    if "claims" not in raw_counts:
        norm_counts["claims"] = int(raw_counts.get("claimsBuilt", 0) or 0)

    out["workerActive"] = worker_active
    out["status"] = ui_status
    out["stage"] = ui_stage
    out["message"] = msg
    out["counts"] = norm_counts
    return out


def status(runs_root: Path, run_id: str) -> dict[str, Any] | None:
    run_dir = resolve_inside_run(runs_root, run_id)
    if run_dir is None:
        return None
    active = run_dir.resolve() in ACTIVE
    status_path = _status_file(runs_root, run_id)
    fs_status = Path(_fs_path(status_path))
    if not fs_status.is_file():
        if active:
            return normalize_status({
                "schemaVersion": "pipeline-status-v1",
                "runId": run_id,
                "state": "running",
                "currentStage": "discovery",
                "stageDetail": "Starting automated research pipeline…",
                "sources": [],
                "counts": dict(EMPTY_COUNTS),
            }, worker_active=True)
        return None
    try:
        data = json.loads(fs_status.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    return normalize_status(data, worker_active=active)


def start(
    runs_root: Path,
    payload: dict[str, Any],
    command: Callable[..., dict[str, Any]],
    model_lock: threading.Lock,
) -> tuple[int, dict[str, Any]]:
    run_id = payload.get("runId")
    analyst = payload.get("reviewerId")
    if not all(isinstance(v, str) and SAFE_ID.fullmatch(v.strip()) for v in (run_id, analyst)):
        return 400, {"ok": False, "error": "A valid run ID and explicit analyst ID are required."}
    run_id = run_id.strip()
    analyst = analyst.strip()
    run_dir = resolve_inside_run(runs_root, run_id)
    if run_dir is None or not Path(_fs_path(run_dir)).is_dir():
        return 404, {"ok": False, "error": "Analysis run not found."}

    raw_budget = payload.get("maxExternalArticles", DEFAULT_MAX_EXTERNAL_ARTICLES)
    try:
        budget = int(raw_budget)
    except (TypeError, ValueError):
        return 400, {"ok": False, "error": "External source budget must be an integer between 1 and 20."}
    if not 1 <= budget <= 20:
        return 400, {"ok": False, "error": "External source budget must be between 1 and 20."}

    active_key = run_dir.resolve()
    if active_key in ACTIVE:
        return 409, {"ok": False, "error": "This analysis pipeline is already running."}
    if not model_lock.acquire(blocking=False):
        return 409, {"ok": False, "error": "Another Copilot run is currently active. Wait for it to finish before starting."}

    ACTIVE.add(active_key)
    now = _now_iso()
    status_path = _status_file(runs_root, run_id)
    existing = status(runs_root, run_id)
    prev_counts = {
        k: int(v) for k, v in ((existing or {}).get("counts") or {}).items()
        if k in EMPTY_COUNTS and isinstance(v, int)
    }
    _write_status(status_path, {
        "schemaVersion": "pipeline-status-v1",
        "runId": run_id,
        "analystId": analyst,
        "startedAt": (existing or {}).get("startedAt") or now,
        "updatedAt": now,
        "state": "running",
        "currentStage": "discovery",
        "stageDetail": "Collecting leads and capturing sources…",
        "maxExternalArticles": budget,
        "counts": {**EMPTY_COUNTS, **prev_counts},
        "sources": (existing or {}).get("sources") or [],
    })

    def work() -> None:
        try:
            step = command(
                "pipeline:run",
                [run_id, analyst, str(budget)],
                timeout_sec=1800,
                runs_root=runs_root,
            )
            if not step.get("ok"):
                fs_status = Path(_fs_path(status_path))
                current: dict[str, Any] = {}
                if fs_status.is_file():
                    try:
                        current = json.loads(fs_status.read_text(encoding="utf-8"))
                    except (OSError, ValueError):
                        current = {}
                if current.get("state") != "failed" and current.get("status") != "failed":
                    err_text = (step.get("stderr") or step.get("stdout") or "Pipeline failed.").strip()
                    last_line = [ln.strip() for ln in err_text.splitlines() if ln.strip()][-1] if err_text else "Pipeline failed."
                    _write_status(status_path, {
                        **current,
                        "schemaVersion": "pipeline-status-v1",
                        "runId": run_id,
                        "analystId": analyst,
                        "updatedAt": _now_iso(),
                        "state": "failed",
                        "currentStage": current.get("currentStage") or current.get("phase") or "discovery",
                        "stageDetail": last_line,
                        "error": last_line,
                        "maxExternalArticles": budget,
                        "counts": {**EMPTY_COUNTS, **(current.get("counts") if isinstance(current.get("counts"), dict) else {})},
                        "sources": current.get("sources") or [],
                    })
        finally:
            ACTIVE.discard(active_key)
            model_lock.release()

    threading.Thread(target=work, name=f"pipeline-{run_id}", daemon=True).start()
    return 202, {
        "ok": True,
        "runId": run_id,
        "status": "running",
        "maxExternalArticles": budget,
        "message": "Automated research pipeline started.",
    }
