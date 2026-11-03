"""One-shot RSS batches. No scheduler; immutable policy, bounded calls, inspectable outcomes."""
from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .scan import resolve_inside_run
from .copilot import CopilotError

CATALOGUE = Path(__file__).resolve().parents[2] / "03-Workflow" / "rss-feed-catalogue.json"
OBSERVED = {
    "https://industrialcyber.co/feed/",
    "https://www.cisa.gov/cybersecurity-advisories/all.xml",
}
ACTIVE: set[str] = set()
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as file:
        json.dump(value, file, indent=2)


def feeds() -> list[dict[str, str]]:
    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    return [{"id": feed["id"], "name": feed["name"], "url": feed["url"]}
            for feed in catalogue["feeds"] if feed.get("url") in OBSERVED and feed.get("format") == "rss"]


def project(jsons: dict[str, Any]) -> dict[str, Any]:
    batches = []
    for path, value in sorted(jsons.items()):
        if not re.fullmatch(r"rss-batches/[^/]+/policy.json", path) or not isinstance(value, dict):
            continue
        prefix = path.rsplit("/", 1)[0]
        result = jsons.get(prefix + "/result.json", {})
        selection = jsons.get(prefix + "/selection.json", {})
        batches.append({
            "id": value.get("id"), "feedId": value.get("feedId"), "approvedAt": value.get("approvedAt"),
            "maxItems": value.get("maxItems"), "relPath": prefix + "/policy.json",
            "status": result.get("status", "running"), "error": result.get("error", ""),
            "outcomes": result.get("outcomes", []), "resultPath": prefix + "/result.json" if result else "",
            "eligible": selection.get("eligible"), "deferred": selection.get("deferred"),
            "alreadyProcessed": selection.get("alreadyProcessed"),
        })
    captures = [{"relPath": value.get("capture", {}).get("artifactRef", path), "feed": value.get("feed", {}), "count": len(value.get("items", [])),
                 "capturedText": sum(item.get("contentStatus") == "captured-feed-text" for item in value.get("items", []))}
                for path, value in jsons.items() if isinstance(value, dict) and value.get("schemaVersion") == "rss-capture-index-v1"]
    return {"batches": sorted(batches, key=lambda b: b.get("approvedAt", ""), reverse=True), "captures": captures}


def start_batch(
    runs_root: Path, payload: dict[str, Any], command: Callable[..., dict[str, Any]],
    run_ai: Callable[..., tuple[int, dict[str, Any]]], model_lock: threading.Lock,
) -> tuple[int, dict[str, Any]]:
    run_id, question_id, reviewer, feed_id = [payload.get(key) for key in ("runId", "questionId", "reviewerId", "feedId")]
    if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in (run_id, question_id, reviewer, feed_id)):
        return 400, {"ok": False, "error": "Select an approved question, feed and explicit analyst ID."}
    budget = payload.get("maxItems")
    permission = payload.get("permissionReference")
    if type(budget) is not int or not 1 <= budget <= 5:
        return 400, {"ok": False, "error": "Set a source/model-call budget from 1 to 5."}
    if not isinstance(permission, str) or not 3 <= len(permission.strip()) <= 500 or payload.get("approvePolicy") is not True:
        return 400, {"ok": False, "error": "A permission-review reference and explicit batch policy approval are required."}
    available = feeds()
    if feed_id not in {feed["id"] for feed in available}:
        return 400, {"ok": False, "error": "This feed has not been observed and enabled by the RSS adapter."}
    run_dir = resolve_inside_run(runs_root, run_id)
    question = resolve_inside_run(run_dir, f"research-questions/{question_id}/approved-research-question.json") if run_dir else None
    if not question or not question.is_file():
        return 404, {"ok": False, "error": "Approved question not found in this run."}
    if not model_lock.acquire(blocking=False):
        return 409, {"ok": False, "error": "A Copilot stage or RSS batch is already running."}
    batch_id = "rss-batch-" + uuid.uuid4().hex
    directory = run_dir / "rss-batches" / batch_id
    now = _now()
    policy = {
        "schemaVersion": "rss-batch-policy-v1", "id": batch_id, "runId": run_id,
        "researchQuestionId": question_id, "feedId": feed_id, "maxItems": budget, "maxModelCalls": budget,
        "admission": "controller-relevant-only", "approvedBy": reviewer, "approvedAt": now,
        "permissionReference": permission.strip(),
    }
    plan = {
        "schemaVersion": "rss-collection-plan-v1", "id": batch_id, "runId": run_id,
        "researchQuestionId": question_id, "feedId": feed_id,
        "selectionReason": "Operator-selected on-demand batch against the approved question.",
        "permission": {"reference": permission.strip(), "confirmedBy": reviewer, "confirmedAt": now},
    }
    try:
        _write(directory / "policy.json", policy)
        _write(directory / "plan.json", plan)
    except OSError:
        model_lock.release()
        raise
    ACTIVE.add(batch_id)

    def work() -> None:
        steps: list[dict[str, Any]] = []
        outcomes = []
        def execute(script: str, args: list[str]) -> dict[str, Any]:
            step = command(script, args, timeout_sec=90, runs_root=runs_root)
            steps.append(step)
            with (directory / "progress.jsonl").open("a", encoding="utf-8") as progress:
                progress.write(json.dumps({"at": _now(), "script": script, "ok": step["ok"]}) + "\n")
            if not step["ok"]:
                raise RuntimeError(step.get("stderr") or f"{script} failed; inspect the preserved artifacts.")
            return step

        def output(step: dict[str, Any], field: str = "Output") -> Path:
            match = re.search(rf"^{field}:\s*(.+)$", step.get("stdout", ""), re.MULTILINE)
            if not match:
                raise RuntimeError(f"Command did not return {field}.")
            path = Path(match.group(1).strip())
            if not path.is_absolute():
                path = Path(__file__).resolve().parent.parent / path
            path = path.resolve()
            path.relative_to(run_dir.resolve())
            return path
        try:
            capture = output(execute("collect:rss", [str(directory / "plan.json"), str(CATALOGUE), str(question)]))
            selection_path = output(execute("rss:batch", ["prepare", str(capture), str(directory / "policy.json")]))
            selection = json.loads(selection_path.read_text(encoding="utf-8"))
            item_ids = selection.get("itemIds")
            if not isinstance(item_ids, list) or len(item_ids) > budget or not all(
                isinstance(item_id, str) and re.fullmatch(r"rss-[a-f0-9]{64}", item_id) for item_id in item_ids
            ) or len(set(item_ids)) != len(item_ids):
                raise ValueError("RSS selection exceeds the approved source/model-call budget or contains invalid IDs.")
            for item_id in item_ids:
                document = output(execute("canonicalize:source", [str(capture), item_id]))
                request = output(execute("prepare:question-relevance", [str(document)]))
                status, response = run_ai(runs_root, {
                    "runId": run_id, "reviewerId": reviewer, "requestPath": request.relative_to(run_dir).as_posix(),
                })
                steps.extend(response.get("steps", []))
                if status != 200 or not response.get("ok"):
                    raise RuntimeError(response.get("error") or "Relevance failed; no admission was attempted.")
                assessments = [step for step in response.get("steps", []) if "Output:" in step.get("stdout", "")]
                if len(assessments) != 1:
                    raise RuntimeError("Relevance recorder did not return one assessment.")
                assessment = output(assessments[0])
                admitted = execute("rss:batch", ["admit", str(selection_path), str(assessment)])
                match = re.search(r"^Outcome:\s*(.+)$", admitted["stdout"], re.MULTILINE)
                if not match:
                    raise RuntimeError("RSS admission did not return an outcome.")
                outcomes.append({"itemId": item_id, "outcome": match.group(1).strip()})
            _write(directory / "result.json", {"status": "completed", "completedAt": _now(), "outcomes": outcomes, "steps": steps})
        except (OSError, ValueError, RuntimeError, CopilotError) as error:
            _write(directory / "result.json", {"status": "failed", "completedAt": _now(), "outcomes": outcomes, "steps": steps, "error": str(error)})
        finally:
            ACTIVE.discard(batch_id)
            model_lock.release()
    try:
        threading.Thread(target=work, name=batch_id, daemon=True).start()
    except RuntimeError as error:
        ACTIVE.discard(batch_id)
        model_lock.release()
        _write(directory / "result.json", {"status": "failed", "error": str(error), "outcomes": []})
        raise
    return 202, {"ok": True, "runId": run_id, "batchId": batch_id, "message": "Bounded RSS batch started. Progress and outcomes appear in Evidence."}
