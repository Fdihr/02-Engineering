"""Local-only HTTP server for the run dashboard and analyst control surfaces."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from string import Template
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .model import RELEVANCE_REQUEST_PATH, ai_stage_for, build_run_view
from .relevance_bridge import build_relevance_prompt, build_response, candidate_id_for, parse_model_answer
from .scan import _fs_path, list_available_runs, read_artifact_text, resolve_inside_run, scan_run_directory

DASHBOARD_DIR = Path(__file__).resolve().parent
APP_DIR = DASHBOARD_DIR.parent
MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
MAX_POST_BYTES = 256 * 1024
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
REVIEW_DECISIONS = {"approve", "reject", "revise"}
FONT_FILES = {
    "/assets/vestas/VestasSans_Light.otf": ("VestasSans_Light.otf", "font/otf"),
    "/assets/vestas/VestasSans_Standard.otf": ("VestasSans_Standard.otf", "font/otf"),
    "/assets/vestas/VestasSans_Medium.otf": ("VestasSans_Medium.otf", "font/otf"),
}
STATIC_FILES = {
    "/design_system.css": (DASHBOARD_DIR / "design_system.css", "text/css; charset=utf-8"),
    "/run_view.css": (DASHBOARD_DIR / "run_view.css", "text/css; charset=utf-8"),
    "/run_view.js": (DASHBOARD_DIR / "run_view.js", "text/javascript; charset=utf-8"),
    "/run_panes.js": (DASHBOARD_DIR / "run_panes.js", "text/javascript; charset=utf-8"),
    "/assets/vestas/Vestas_White.svg": (DASHBOARD_DIR / "assets" / "vestas" / "Vestas_White.svg", "image/svg+xml"),
}


def render_page(run_id: str, poll_ms: int = 2000) -> str:
    safe_id = re.sub(r"[^a-zA-Z0-9._-]", "", run_id)
    template = Template((DASHBOARD_DIR / "page.html").read_text(encoding="utf-8"))
    return template.substitute(run_id=html.escape(safe_id, quote=True), poll_ms=max(500, int(poll_ms)))


def _valid_id(value: Any) -> str | None:
    if isinstance(value, str) and SAFE_ID.fullmatch(value.strip()):
        return value.strip()
    return None


def _write_json(path: Path, payload: Any) -> None:
    parent = path.parent
    os.makedirs(_fs_path(parent), exist_ok=True)
    with Path(_fs_path(path)).open("x", encoding="utf-8") as target:
        target.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def _ensure_provider_operation_manifest(runs_root: Path, run_id: str, raw_ref: str) -> tuple[str, str]:
    """Ensure a discovery raw page is promoted to a canonical provider-operations manifest for intake:seerist."""
    normalized = raw_ref.replace("\\", "/")
    if normalized.endswith("/raw-provider-artifact.json"):
        op_id = normalized.split("/")[-2]
        return normalized, op_id
    raw_file = (runs_root.parent / normalized).resolve()
    raw_file.relative_to(runs_root.resolve())
    disc_dir = raw_file.parent.parent
    req_file = Path(_fs_path(disc_dir / "discovery-request.json"))
    res_file = Path(_fs_path(disc_dir / "discovery-results.json"))
    if not (req_file.is_file() and res_file.is_file()):
        return normalized, ""
    disc_req = json.loads(req_file.read_text(encoding="utf-8"))
    disc_res = json.loads(res_file.read_text(encoding="utf-8"))
    page = next(
        (p for p in disc_res.get("pages", []) if isinstance(p, dict) and str(p.get("artifactRef", "")).replace("\\", "/") == normalized),
        None,
    )
    if page is None:
        return normalized, ""
    op_id = str(page["operationId"])
    query_id = str(page["queryId"])
    plan = disc_req.get("plan") or {}
    rq = disc_req.get("researchQuestion") or {}
    query_obj = next((q for q in plan.get("queries", []) if isinstance(q, dict) and q.get("id") == query_id), {})
    op_dir = (runs_root / run_id / "provider-operations" / op_id).resolve()
    manifest_path = op_dir / "raw-provider-artifact.json"
    rel_manifest = f"runs/{run_id}/provider-operations/{op_id}/raw-provider-artifact.json"
    if not Path(_fs_path(manifest_path)).is_file():
        os.makedirs(_fs_path(op_dir), exist_ok=True)
        raw_bytes = Path(_fs_path(raw_file)).read_bytes()
        raw_resp_path = op_dir / "raw-response.json"
        if not Path(_fs_path(raw_resp_path)).is_file():
            Path(_fs_path(raw_resp_path)).write_bytes(raw_bytes)
        filters: dict[str, Any] = {
            "search": query_obj.get("search", ""),
            "sources": query_obj.get("sources", "news,analysis"),
        }
        if query_obj.get("aoiId"):
            filters["aoiId"] = query_obj["aoiId"]
        time_win = rq.get("timeWindow") or {}
        filters["start"] = time_win.get("from", "")
        filters["end"] = time_win.get("to", "")
        filters["pageSize"] = plan.get("pageSize", 50)
        filters["pageOffset"] = page.get("pageOffset", 0)
        filters["sortDirection"] = "desc"
        col_req_path = op_dir / "collection-request.json"
        if not Path(_fs_path(col_req_path)).is_file():
            _write_json(col_req_path, {
                "operation": {
                    "id": op_id,
                    "runId": run_id,
                    "researchQuestionId": rq.get("id", ""),
                    "provider": "seerist",
                    "method": "GET",
                    "endpoint": "/v1/wod",
                    "filters": filters,
                },
                "requestedAt": page["requestedAt"],
                "operationArtifactRef": disc_req.get("planArtifactRef", ""),
                "operationArtifactSha256": disc_req.get("planArtifactSha256", ""),
                "researchQuestion": rq,
            })
        _write_json(manifest_path, {
            "id": f"{op_id}-response",
            "runId": run_id,
            "operationId": op_id,
            "researchQuestionId": rq.get("id", ""),
            "provider": "seerist",
            "endpoint": "/v1/wod",
            "requestedAt": page["requestedAt"],
            "receivedAt": page["receivedAt"],
            "httpStatus": page["httpStatus"],
            "mediaType": page.get("mediaType", "application/json"),
            "artifactRef": f"runs/{run_id}/provider-operations/{op_id}/raw-response.json",
            "sha256": page["sha256"],
        })
    return rel_manifest, op_id


def _run_npm_script(script_name: str, args: list[str], timeout_sec: int = 90) -> dict[str, Any]:
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    cmd = [npm_cmd, "run", script_name, "--", *args]
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(APP_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
        )
        return {
            "ok": completed.returncode == 0,
            "command": f"npm run {script_name} -- {' '.join(args)}",
            "exitCode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except Exception as exc:
        return {
            "ok": False,
            "command": f"npm run {script_name} -- {' '.join(args)}",
            "exitCode": 1,
            "stdout": "",
            "stderr": str(exc),
        }


def _run_node_command(label: str, script_rel: str, args: list[str], timeout_sec: int = 90) -> dict[str, Any]:
    # Free-text arguments must bypass npm.cmd, which re-parses them through cmd.exe on Windows.
    cmd = ["node", "--import", "tsx", script_rel, *args]
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(APP_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
        )
        return {
            "ok": completed.returncode == 0,
            "command": f"{label} -- {args[0] if args else ''}",
            "exitCode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except Exception as exc:
        return {"ok": False, "command": label, "exitCode": 1, "stdout": "", "stderr": str(exc)}


def _completed_evidence_decision(runs_root: Path, intake_ref: str) -> str | None:
    events_path = Path(_fs_path(runs_root / "evidence-events.jsonl"))
    if not events_path.is_file():
        return None
    for line in events_path.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if (
            isinstance(event, dict)
            and event.get("intakeArtifactRef") == intake_ref
            and event.get("stage") == "evidence_admission"
            and event.get("status") == "completed"
        ):
            return str(event.get("decisionId") or "recorded")
    return None


def _load_relevance_request(run_dir: Path, rel_path: str) -> tuple[dict[str, Any] | None, Path | None]:
    if not RELEVANCE_REQUEST_PATH.match(rel_path or ""):
        return None, None
    absolute = resolve_inside_run(run_dir, rel_path)
    text = read_artifact_text(absolute, MAX_ARTIFACT_BYTES) if absolute else None
    if text is None:
        return None, None
    value = json.loads(text)
    return (value, absolute) if isinstance(value, dict) else (None, None)


def _iso_or_now(value: Any, now: datetime) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo and (now - parsed).total_seconds() >= 0 and (now - parsed).total_seconds() < 86400:
            return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except ValueError:
        pass
    return now.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _handle_record_relevance(runs_root: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    run_id = _valid_id(payload.get("runId"))
    rel_path = str(payload.get("requestPath") or "")
    answer_text = str(payload.get("answer") or "")
    if not run_id or not answer_text.strip():
        return 400, {"ok": False, "error": "Paste Copilot's JSON answer before recording."}
    run_dir = runs_root / run_id
    request, request_file = _load_relevance_request(run_dir, rel_path)
    if request is None or request_file is None:
        return 404, {"ok": False, "error": "Relevance request not found in this run."}
    assessments_dir = request_file.parent / "assessments"
    if Path(_fs_path(assessments_dir)).is_dir() and any(Path(_fs_path(assessments_dir)).iterdir()):
        return 409, {"ok": False, "error": "This source already has a recorded AI relevance assessment."}

    def failed_check(message: str) -> tuple[int, dict[str, Any]]:
        return 400, {"ok": False, "runId": run_id, "error": message, "steps": [
            {"ok": False, "command": "check:ai-answer", "exitCode": 1, "stdout": "", "stderr": message}]}

    answer, problem = parse_model_answer(answer_text)
    if answer is None:
        return failed_check(problem)
    now = datetime.now(timezone.utc)
    completed_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    stamp = int(now.timestamp() * 1000)
    response, problem = build_response(
        request, answer, f"copilot-paste-{stamp}", _iso_or_now(payload.get("promptCopiedAt"), now), completed_at
    )
    if response is None:
        return failed_check(problem)
    response_name = f"copilot-response-{stamp}.json"
    _write_json(request_file.parent / response_name, response)
    request_dir_ref = f"runs/{run_id}/{rel_path.rsplit('/', 1)[0]}"
    steps: list[dict[str, Any]] = [{
        "ok": True, "command": "check:ai-answer", "exitCode": 0,
        "stdout": f"Quotes: {len(response['proposal']['support'])}", "stderr": "",
    }]
    recorded = _run_npm_script("record:question-relevance", [f"runs/{run_id}/{rel_path}", f"{request_dir_ref}/{response_name}"])
    steps.append(recorded)
    if not recorded["ok"]:
        return 400, {"ok": False, "runId": run_id, "steps": steps, "error": recorded["stderr"]}
    verdict = (re.search(r"Verdict:\s*(\S+)", recorded["stdout"]) or [None, ""])[1]
    assessment_ref = (re.search(r"Output:\s*(\S+)", recorded["stdout"]) or [None, ""])[1]
    source_item_id = str(request.get("sourceItemId", ""))
    retrieval_ref = f"runs/{run_id}/source-retrievals/{source_item_id}/source-retrieval-result.json"
    if verdict in ("relevant", "partially-relevant") and assessment_ref and _valid_id(source_item_id) \
            and Path(_fs_path(run_dir / "source-retrievals" / source_item_id / "source-retrieval-result.json")).is_file():
        candidate_id = candidate_id_for(source_item_id)
        if not Path(_fs_path(run_dir / "source-reintakes" / candidate_id)).exists():
            steps.append(_run_npm_script("reintake:source", [retrieval_ref, assessment_ref, candidate_id]))
    succeeded = all(step["ok"] for step in steps)
    return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": "" if succeeded else steps[-1]["stderr"]}


def _clean_text(value: Any, max_len: int) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", str(value or ""))).strip()[:max_len]


def _stdout_field(step: dict[str, Any], name: str) -> str:
    match = re.search(rf"^{name}:\s*(\S.*)$", step.get("stdout", ""), flags=re.MULTILINE)
    return match.group(1).strip() if match else ""


def _review_response(payload: dict[str, Any], package_sha: str, reviewer_id: str, reviewed_at: str) -> dict[str, Any]:
    base = {
        "packageSha256": package_sha,
        "reviewerId": reviewer_id,
        "reviewedAt": reviewed_at,
        "omissionPass": "not-performed",
        "humanObservations": [],
    }
    if payload.get("mode") == "provisional":
        return {**base, "supportPass": "not-performed", "verdicts": [], "irReview": [], "assessment": {"status": "not-assessed"}}
    verdicts = []
    for entry in payload.get("verdicts") or []:
        if not isinstance(entry, dict):
            continue
        item = {"observationId": _clean_text(entry.get("observationId"), 80), "verdict": _clean_text(entry.get("verdict"), 20)}
        if _clean_text(entry.get("note"), 1000):
            item["note"] = _clean_text(entry.get("note"), 1000)
        if item["verdict"] == "duplicate":
            item["duplicateOf"] = _clean_text(entry.get("duplicateOf"), 80)
        verdicts.append(item)
    ir_review = []
    for entry in payload.get("irReview") or []:
        if not isinstance(entry, dict):
            continue
        item = {"irId": _clean_text(entry.get("irId"), 40), "disposition": _clean_text(entry.get("disposition"), 20)}
        if _clean_text(entry.get("note"), 1000):
            item["note"] = _clean_text(entry.get("note"), 1000)
        ir_review.append(item)
    raw = payload.get("assessment") if isinstance(payload.get("assessment"), dict) else {}
    upstream = [_clean_text(s, 240) for s in str(raw.get("upstreamSources") or "").split(",") if _clean_text(s, 240)]
    limitations = [_clean_text(s, 2000) for s in str(raw.get("limitations") or "").splitlines() if _clean_text(s, 2000)]
    assessment = {
        "reliability": {
            "access": _clean_text(raw.get("access"), 20),
            "accessRationale": _clean_text(raw.get("accessRationale"), 1000),
            "trackRecord": _clean_text(raw.get("trackRecord"), 20),
            "trackRecordRationale": _clean_text(raw.get("trackRecordRationale"), 1000),
            "alignment": _clean_text(raw.get("alignment"), 1000),
        },
        "dependency": {
            "kind": _clean_text(raw.get("dependencyKind"), 20),
            "upstreamSources": upstream,
            "rationale": _clean_text(raw.get("dependencyRationale"), 1000),
        },
        "limitations": limitations,
    }
    return {**base, "supportPass": "performed", "verdicts": verdicts, "irReview": ir_review, "assessment": assessment}


def _handle_assurance_review(runs_root: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    run_id = _valid_id(payload.get("runId"))
    snapshot_id = _valid_id(payload.get("snapshotId"))
    reviewer_id = _valid_id(payload.get("reviewerId"))
    if not (run_id and snapshot_id and reviewer_id) or payload.get("mode") not in ("performed", "provisional"):
        return 400, {"ok": False, "error": "A valid run, snapshot, review mode, and your analyst ID are required."}
    stage_dir = runs_root / run_id / "assurance" / snapshot_id
    review_dir = stage_dir / "review"
    package_file = Path(_fs_path(review_dir / "review-package.json"))
    if not package_file.is_file():
        return 404, {"ok": False, "error": "Review package not found for this snapshot."}
    existing = {p.name for p in Path(_fs_path(review_dir)).iterdir() if p.name.startswith("review-record")}
    if "review-record-reviewed.json" in existing or (existing and payload.get("mode") == "provisional"):
        return 409, {"ok": False, "error": "This source already has a recorded review."}
    package_sha = hashlib.sha256(package_file.read_bytes()).hexdigest()
    now = datetime.now(timezone.utc)
    reviewed_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    response = _review_response(payload, package_sha, reviewer_id, reviewed_at)
    response_name = f"review-response-{int(now.timestamp() * 1000)}.json"
    _write_json(review_dir / response_name, response)

    stage_ref = f"runs/{run_id}/assurance/{snapshot_id}"
    steps = [_run_npm_script("record:assurance-review", [f"{stage_ref}/review/review-package.json", f"{stage_ref}/review/{response_name}"])]
    record_ref = _stdout_field(steps[0], "Output")
    snapshot_ref = ""
    for request_file in sorted(Path(_fs_path(stage_dir / "extract")).glob("attempt-*/extract-request.json")):
        lineage = json.loads(request_file.read_text(encoding="utf-8")).get("lineage", {})
        snapshot_ref = str(lineage.get("snapshot", {}).get("artifactRef", ""))
        break
    if steps[0]["ok"] and record_ref and snapshot_ref:
        assemble_args = [snapshot_ref, f"{stage_ref}/extract/extract-commit.json", record_ref]
        if payload.get("mode") == "performed" and Path(_fs_path(stage_dir / "source-note-provisional.json")).is_file():
            assemble_args.append(f"{stage_ref}/source-note-provisional.json")
        steps.append(_run_npm_script("assemble:assurance", assemble_args))
        note_ref = _stdout_field(steps[-1], "Output")
        if steps[-1]["ok"] and note_ref:
            steps.append(_run_npm_script("measure:assurance", [note_ref, f"{stage_ref}/extract", record_ref]))
    succeeded = all(step["ok"] for step in steps)
    return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": "" if succeeded else steps[-1]["stderr"]}


MEMO_STANDARD_V1 = "src/modules/memo/standards/memo-standard-v1.json"
ASSURANCE_POLICY = "src/modules/assurance/policies/geopolitical-source-assurance-v4.json"
SYNTHESIS_POLICY = "src/modules/synthesis/policies/geopolitical-synthesis-v1.json"
OUTLET_TABLE = "src/modules/synthesis/policies/geopolitical-outlets-v1.json"
STAGE_RESPONSES = {
    "extract": ("source-assurance-copilot-poc-response-v2", "record:assurance-extract"),
    "build": ("synthesis-build-copilot-response-v1", "record:synthesis-build"),
    "challenge": ("synthesis-challenge-copilot-response-v1", "record:synthesis-challenge"),
    "key-judgements": ("key-judgement-copilot-response-v1", "record:key-judgements"),
    "memo-writer": ("memo-writer-copilot-response-v1", "record:memo-writer"),
}


RAW_PAGE_REL = re.compile(r"^discoveries/[A-Za-z0-9._-]+/raw-pages/[A-Za-z0-9._-]+\.json$")
MAX_LEAD_TEXT = 60_000


def _lead_text(value: Any) -> str:
    """Seerist text may be a language map and may hold HTML; return readable plain text."""
    if isinstance(value, dict):
        value = value.get("en") or next((v for v in value.values() if isinstance(v, str) and v.strip()), "")
    if not isinstance(value, str):
        return ""
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", value)
    text = re.sub(r"(?i)<li[^>]*>", "\n• ", text)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|li|ul|ol|h[1-6]|tr|blockquote)>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()[:MAX_LEAD_TEXT]


def read_lead(run_dir: Path, run_id: str, raw_ref: str, item_id: str) -> dict[str, Any] | None:
    rel = raw_ref[len(f"runs/{run_id}/"):] if raw_ref.startswith(f"runs/{run_id}/") else raw_ref
    if not RAW_PAGE_REL.match(rel) or not item_id:
        return None
    absolute = resolve_inside_run(run_dir, rel)
    text = read_artifact_text(absolute, MAX_ARTIFACT_BYTES) if absolute else None
    try:
        features = json.loads(text).get("features", []) if text else []
    except (ValueError, AttributeError):
        return None
    for feature in features if isinstance(features, list) else []:
        props = feature.get("properties") if isinstance(feature, dict) else None
        if not isinstance(props, dict) or str(props.get("id")) != item_id:
            continue
        countries = [c.get("name", {}).get("en") if isinstance(c.get("name"), dict) else c.get("name") or c.get("code")
                     for c in props.get("countries", []) if isinstance(c, dict)] if isinstance(props.get("countries"), list) else []
        return {
            "providerItemId": item_id,
            "title": _lead_text(props.get("title")),
            "sourceType": str(props.get("source") or ""),
            "published": str(props.get("publishedDate") or props.get("@timestamp") or ""),
            "link": props.get("link") if isinstance(props.get("link"), str) else "",
            "countries": [str(c) for c in countries if c],
            "summary": _lead_text(props.get("summary")),
            "body": _lead_text(props.get("body")),
        }
    return None


def parse_stage_answer(text: str) -> tuple[Any, str]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    starts = [i for i in (cleaned.find("{"), cleaned.find("[")) if i >= 0]
    if not starts:
        return None, "The answer does not contain JSON."
    try:
        value, _ = json.JSONDecoder().raw_decode(cleaned[min(starts):])
    except json.JSONDecodeError as exc:
        return None, f"The answer is not valid JSON ({exc.msg} at character {exc.pos})."
    return value, ""


def _chain_after_stage(runs_root: Path, run_id: str, stage: str, recorded: dict[str, Any]) -> list[dict[str, Any]]:
    output = _stdout_field(recorded, "Output")
    if not recorded["ok"] or not output:
        return []
    if stage == "extract":
        return [_run_npm_script("prepare:assurance-review", [output])]
    if stage == "build":
        return [_run_npm_script("prepare:synthesis-challenge", [output])]
    if stage == "key-judgements":
        record = json.loads(Path(_fs_path(runs_root / output[len("runs/"):])).read_text(encoding="utf-8"))
        questions = sorted(Path(_fs_path(runs_root / run_id / "research-questions")).glob("*/approved-research-question.json"))
        if len(questions) != 1:
            return [{"ok": False, "command": "prepare:memo-writer", "exitCode": 1, "stdout": "",
                     "stderr": "Prepare the memo writer from a terminal: this run has more than one approved question."}]
        return [_run_npm_script("prepare:memo-writer", [
            record["buildRecord"]["artifactRef"], record["challengeRecord"]["artifactRef"],
            record["adjudication"]["artifactRef"], output,
            f"runs/{run_id}/research-questions/{questions[0].parent.name}/approved-research-question.json", MEMO_STANDARD_V1,
        ])]
    return []


def _handle_ai_stage(runs_root: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    run_id = _valid_id(payload.get("runId"))
    captured_by = _valid_id(payload.get("reviewerId"))
    rel_path = str(payload.get("requestPath") or "")
    stage = ai_stage_for(rel_path)
    if not (run_id and captured_by and stage):
        return 400, {"ok": False, "error": "A valid run, AI request, and your analyst ID are required."}
    if payload.get("freshSession") is not True:
        return 400, {"ok": False, "error": "Confirm the answer came from a fresh Copilot chat."}
    run_dir = runs_root / run_id
    request_file = resolve_inside_run(run_dir, rel_path)
    text = read_artifact_text(request_file, MAX_ARTIFACT_BYTES) if request_file else None
    if text is None:
        return 404, {"ok": False, "error": "AI request not found in this run."}
    request = json.loads(text)
    proposal, problem = parse_stage_answer(str(payload.get("answer") or ""))
    if problem:
        return 400, {"ok": False, "runId": run_id, "error": problem, "steps": [
            {"ok": False, "command": "check:ai-answer", "exitCode": 1, "stdout": "", "stderr": problem}]}
    now = datetime.now(timezone.utc)
    prepared = datetime.fromisoformat(str(request.get("preparedAt")).replace("Z", "+00:00"))
    started = max(prepared, datetime.fromisoformat(_iso_or_now(payload.get("promptCopiedAt"), now).replace("Z", "+00:00")))
    completed = max(now, started)
    iso = lambda moment: moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    schema_version, record_script = STAGE_RESPONSES[stage]
    stamp = int(now.timestamp() * 1000)
    response = {
        "schemaVersion": schema_version,
        "requestId": request.get("id"),
        "invocationId": f"copilot-paste-{stage}-{stamp}",
        "provider": "github-copilot-vscode",
        "model": "not-exposed-by-host",
        "startedAt": iso(started),
        "completedAt": iso(completed),
        "freshSession": True,
        "capturedBy": captured_by,
        "proposal": proposal,
    }
    response_name = f"copilot-response-{stamp}.json"
    _write_json(Path(request_file).parent / response_name, response)
    directory_ref = f"runs/{run_id}/{rel_path.rsplit('/', 1)[0]}"
    recorded = _run_npm_script(record_script, [f"runs/{run_id}/{rel_path}", f"{directory_ref}/{response_name}"])
    steps = [recorded, *_chain_after_stage(runs_root, run_id, stage, recorded)]
    succeeded = all(step["ok"] for step in steps)
    return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": "" if succeeded else steps[-1]["stderr"] or steps[-1]["stdout"]}


def _handle_prepare_synthesis(runs_root: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    run_id = _valid_id(payload.get("runId"))
    if not run_id:
        return 400, {"ok": False, "error": "A valid run is required."}
    notes = []
    for snapshot_dir in sorted(Path(_fs_path(runs_root / run_id / "assurance")).glob("*")):
        for name in ("source-note-reviewed.json", "source-note-provisional.json"):
            if Path(_fs_path(snapshot_dir / name)).is_file():
                notes.append(f"runs/{run_id}/assurance/{snapshot_dir.name}/{name}")
                break
    if not notes:
        return 400, {"ok": False, "error": "No assembled source notes in this run yet."}
    step = _run_npm_script("prepare:synthesis-build", [SYNTHESIS_POLICY, OUTLET_TABLE, *notes])
    return (200 if step["ok"] else 400), {"ok": step["ok"], "runId": run_id, "steps": [step], "error": "" if step["ok"] else step["stderr"]}


CHALLENGE_RECORD_REL = re.compile(r"^synthesis/challenge/records/([A-Za-z0-9._-]+)/challenge-record\.json$")
KJ_RECORD_REL = re.compile(r"^synthesis/key-judgements/records/[A-Za-z0-9._-]+/key-judgement-record\.json$")


def _handle_prepare_stage(runs_root: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    run_id = _valid_id(payload.get("runId"))
    run_dir = runs_root / run_id if run_id else None
    if payload.get("action") == "prepare-key-judgements":
        rel_path = str(payload.get("challengeRecordPath") or "")
        match = CHALLENGE_RECORD_REL.match(rel_path)
        adjudication_rel = f"synthesis/adjudication/{match.group(1)}/performed-adjudication.json" if match else ""
        if not (run_dir and match and Path(_fs_path(run_dir / rel_path)).is_file() and Path(_fs_path(run_dir / adjudication_rel)).is_file()):
            return 400, {"ok": False, "error": "An adjudicated challenge record in this run is required."}
        record = json.loads(Path(_fs_path(run_dir / rel_path)).read_text(encoding="utf-8"))
        build_ref = str(record.get("buildRecord", {}).get("artifactRef", ""))
        steps = [_run_npm_script("prepare:key-judgements", [build_ref, f"runs/{run_id}/{rel_path}", f"runs/{run_id}/{adjudication_rel}", MEMO_STANDARD_V1])]
    else:
        rel_path = str(payload.get("keyJudgementRecordPath") or "")
        if not (run_dir and KJ_RECORD_REL.match(rel_path) and Path(_fs_path(run_dir / rel_path)).is_file()):
            return 400, {"ok": False, "error": "A key-judgement record in this run is required."}
        steps = _chain_after_stage(runs_root, run_id, "key-judgements", {"ok": True, "stdout": f"Output: runs/{run_id}/{rel_path}"})
    succeeded = all(step["ok"] for step in steps)
    return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": "" if succeeded else steps[-1]["stderr"]}


def _handle_adjudication(runs_root: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    run_id = _valid_id(payload.get("runId"))
    reviewer_id = _valid_id(payload.get("reviewerId"))
    rel_path = str(payload.get("challengeRecordPath") or "")
    match = CHALLENGE_RECORD_REL.match(rel_path)
    if not (run_id and reviewer_id and match):
        return 400, {"ok": False, "error": "A valid run, challenge record, and your analyst ID are required."}
    run_dir = runs_root / run_id
    record_file = Path(_fs_path(run_dir / rel_path))
    if not record_file.is_file():
        return 404, {"ok": False, "error": "Challenge record not found in this run."}
    out_dir = run_dir / "synthesis" / "adjudication" / match.group(1)
    if Path(_fs_path(out_dir / "performed-adjudication.json")).exists():
        return 409, {"ok": False, "error": "This challenge pass has already been adjudicated."}
    record_bytes = record_file.read_bytes()
    record = json.loads(record_bytes.decode("utf-8"))
    build_ref = str(record.get("buildRecord", {}).get("artifactRef", ""))
    build_file = resolve_inside_run(run_dir, build_ref[len(f"runs/{run_id}/"):]) if build_ref.startswith(f"runs/{run_id}/") else None
    if build_file is None or not Path(_fs_path(build_file)).is_file():
        return 400, {"ok": False, "error": "The challenge record does not reference a build record in this run."}
    build = json.loads(Path(_fs_path(build_file)).read_text(encoding="utf-8"))

    raised = {r["id"]: r for r in record.get("results", []) if isinstance(r, dict) and r.get("verdict") == "challenge"}
    decisions = {
        str(d.get("challengeId")): d for d in payload.get("challenges") or []
        if isinstance(d, dict) and d.get("decision") in ("uphold", "dismiss")
    }
    if set(decisions) != set(raised):
        return 400, {"ok": False, "error": f"Decide every raised challenge ({len(raised)} raised, {len(set(decisions) & set(raised))} decided)."}
    rejected = {str(c.get("claimId")) for c in payload.get("claims") or [] if isinstance(c, dict) and c.get("reject") is True}

    claims = []
    for claim in build.get("synthesis", {}).get("claims", []):
        claim_id = claim["id"]
        upheld = sorted(cid for cid, r in raised.items() if r.get("claimId") == claim_id and decisions[cid]["decision"] == "uphold")
        status = "rejected" if claim_id in rejected else ("contested" if upheld else "accepted")
        claims.append({"claimId": claim_id, "status": status, "openChallengeIds": upheld})

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    adjudication = {
        "schemaVersion": "synthesis-adjudication-v1",
        "id": f"adjudication-{match.group(1).removeprefix('synthesis-challenge-record-')}",
        "createdAt": now,
        "runId": run_id,
        "adjudicationStatus": "performed",
        "reviewStatus": record.get("reviewStatus"),
        "limitedEvidence": record.get("limitedEvidence"),
        "buildRecord": record.get("buildRecord"),
        "challengeRecord": {"artifactRef": f"runs/{run_id}/{rel_path}", "artifactSha256": hashlib.sha256(record_bytes).hexdigest()},
        "claims": claims,
    }
    _write_json(out_dir / "performed-adjudication.json", adjudication)
    adjudication_ref = f"runs/{run_id}/synthesis/adjudication/{match.group(1)}/performed-adjudication.json"
    # The adjudication schema carries no reviewer, so human attribution lives in this sibling record.
    _write_json(out_dir / "adjudication-decision.json", {
        "schemaVersion": "dashboard-adjudication-decision-v1",
        "adjudicationRef": adjudication_ref,
        "adjudicationSha256": hashlib.sha256(Path(_fs_path(out_dir / "performed-adjudication.json")).read_bytes()).hexdigest(),
        "reviewerId": reviewer_id,
        "decidedAt": now,
        "challengeDecisions": [
            {"challengeId": cid, "decision": decisions[cid]["decision"], "note": _clean_text(decisions[cid].get("note"), 1000)}
            for cid in sorted(raised)
        ],
        "rejectedClaimIds": sorted(rejected),
    })
    with Path(_fs_path(out_dir / "events.jsonl")).open("a", encoding="utf-8") as events:
        events.write(json.dumps({
            "runId": run_id, "occurredAt": now, "actorType": "human", "actorId": reviewer_id,
            "stage": "adjudicate", "eventType": "synthesis.adjudication.performed", "status": "completed",
            "artifactRef": adjudication_ref,
        }) + "\n")
    counts = {s: sum(1 for c in claims if c["status"] == s) for s in ("accepted", "contested", "rejected")}
    steps = [{
        "ok": True, "command": "adjudication:record", "exitCode": 0, "stderr": "",
        "stdout": f"Accepted: {counts['accepted']}\nContested: {counts['contested']}\nRejected: {counts['rejected']}\nReviewer: {reviewer_id}\nOutput: {adjudication_ref}",
    }]
    steps.append(_run_npm_script("prepare:key-judgements", [build_ref, f"runs/{run_id}/{rel_path}", adjudication_ref, MEMO_STANDARD_V1]))
    succeeded = all(step["ok"] for step in steps)
    return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": "" if succeeded else steps[-1]["stderr"]}


def _handle_analyst_action(runs_root: Path, active_run_dir: Path, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    action = payload.get("action")
    if action == "record-ai-stage":
        return _handle_ai_stage(runs_root, payload)
    if action == "prepare-synthesis":
        return _handle_prepare_synthesis(runs_root, payload)
    if action in ("prepare-key-judgements", "prepare-memo-writer"):
        return _handle_prepare_stage(runs_root, payload)
    if action == "record-adjudication":
        return _handle_adjudication(runs_root, payload)
    if action == "record-assurance-review":
        return _handle_assurance_review(runs_root, payload)
    if action == "record-relevance":
        return _handle_record_relevance(runs_root, payload)
    if action == "review-evidence":
        run_id = _valid_id(payload.get("runId"))
        candidate_id = _valid_id(payload.get("candidateId"))
        reviewer_id = _valid_id(payload.get("reviewerId"))
        decision = payload.get("decision")
        reason = re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", str(payload.get("reason") or ""))).strip()
        if not (run_id and candidate_id and reviewer_id) or decision not in REVIEW_DECISIONS:
            return 400, {"ok": False, "error": "A valid run, candidate, decision, and your analyst ID are required."}
        if not 3 <= len(reason) <= 1000:
            return 400, {"ok": False, "error": "Give a reason for your decision (3 to 1,000 characters)."}
        intake_path = runs_root / run_id / "source-reintakes" / candidate_id / "intake-result.json"
        if not Path(_fs_path(intake_path)).is_file():
            return 404, {"ok": False, "error": "Evidence candidate not found in this run."}
        intake_ref = f"runs/{run_id}/source-reintakes/{candidate_id}/intake-result.json"
        existing = _completed_evidence_decision(runs_root, intake_ref)
        if existing:
            return 409, {"ok": False, "error": f"This candidate already has a recorded decision ({existing})."}
        decision_id = f"{candidate_id[:50]}-review-{int(time.time())}"
        step = _run_node_command(
            "review:evidence",
            "src/commands/review-evidence.ts",
            [intake_ref, decision, reviewer_id, reason, decision_id],
        )
        steps = [step]
        snapshot_ref = f"runs/{decision_id}/approved-evidence-snapshot.json"
        requirements = sorted(Path(_fs_path(runs_root / run_id / "requirements")).glob("*/approved-requirements.json"))
        if step["ok"] and decision == "approve" and len(requirements) == 1 \
                and Path(_fs_path(runs_root / decision_id / "approved-evidence-snapshot.json")).is_file():
            steps.append(_run_npm_script("prepare:assurance-extract", [
                snapshot_ref, f"runs/{run_id}/requirements/{requirements[0].parent.name}/approved-requirements.json", ASSURANCE_POLICY,
            ]))
        succeeded = all(s["ok"] for s in steps)
        return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": "" if succeeded else steps[-1]["stderr"]}
    if action == "approve-intent":
        run_id = _valid_id(payload.get("runId"))
        reviewer_id = _valid_id(payload.get("reviewerId"))
        if not run_id or not reviewer_id:
            return 400, {"ok": False, "error": "A valid run ID and explicit reviewer ID are required."}
        purpose = str(payload.get("purpose") or "").strip()
        threat_topic = str(payload.get("threatTopic") or "").strip()
        audience = str(payload.get("audience") or "Vestas leadership").strip()
        geographies = [g.strip() for g in str(payload.get("geographies") or "Europe").split(",") if g.strip()]
        time_from = str(payload.get("from") or "").strip()
        time_to = str(payload.get("to") or "").strip()
        requested_output = str(payload.get("requestedOutput") or "memo").strip()
        if requested_output not in ("brief", "memo", "assessment"):
            requested_output = "memo"
        question_text = str(payload.get("question") or "").strip()
        rationale = str(payload.get("rationale") or "").strip()
        ir_lines = [line.strip() for line in str(payload.get("requirements") or "").splitlines() if line.strip()]

        target_run_dir = (runs_root / run_id).resolve()
        proposals_dir = target_run_dir / "proposals"
        scope_id = f"{run_id}-scope"
        question_id = f"{run_id}-rq-01"
        rel_scope_prop = f"runs/{run_id}/proposals/scope.json"
        rel_approved_scope = f"runs/{run_id}/memo-scopes/{scope_id}/v1/approved-memo-scope.json"
        rel_rq_prop = f"runs/{run_id}/proposals/rq-01.json"
        rel_approved_rq = f"runs/{run_id}/research-questions/{question_id}/approved-research-question.json"
        approved_rq_file = target_run_dir / "research-questions" / question_id / "approved-research-question.json"

        if not 1 <= len(ir_lines) <= 24 or any(len(line) > 400 for line in ir_lines):
            return 400, {"ok": False, "error": "Provide 1 to 24 information requirements, each at most 400 characters."}
        if Path(_fs_path(target_run_dir)).exists():
            if not (payload.get("runDiscovery") is True and Path(_fs_path(approved_rq_file)).is_file()):
                return 409, {"ok": False, "error": "This run already exists. Use a new run ID; existing approvals cannot be overwritten."}
        if not (purpose and threat_topic and geographies and time_from and time_to and question_text and rationale):
            return 400, {"ok": False, "error": "All scope and research question fields are required."}

        if len(time_from) == 10:
            time_from = f"{time_from}T00:00:00.000Z"
        if len(time_to) == 10:
            time_to = f"{time_to}T23:59:59.999Z"

        steps: list[dict[str, Any]] = []
        if not Path(_fs_path(target_run_dir)).exists():
            scope_proposal_path = proposals_dir / "scope.json"
            rq_proposal_path = proposals_dir / "rq-01.json"

            _write_json(scope_proposal_path, {
                "id": scope_id,
                "runId": run_id,
                "version": 1,
                "purpose": {"value": purpose, "origin": "human"},
                "threatTopic": {"value": threat_topic, "origin": "human"},
                "audience": {"value": audience, "origin": "human"},
                "geographies": {"value": geographies, "origin": "human"},
                "timeWindow": {"value": {"from": time_from, "to": time_to}, "origin": "human"},
                "requestedOutput": {"value": requested_output, "origin": "human"},
                "status": "proposed",
            })
            _write_json(rq_proposal_path, {
                "id": question_id,
                "runId": run_id,
                "scopeVersion": 1,
                "question": question_text,
                "rationale": rationale,
                "geographies": geographies,
                "timeWindow": {"from": time_from, "to": time_to},
                "status": "proposed",
            })

            step1 = _run_npm_script("approve:scope", [rel_scope_prop, reviewer_id])
            steps.append(step1)
            if not step1["ok"]:
                return 400, {"ok": False, "runId": run_id, "steps": steps, "error": step1["stderr"] or step1["stdout"]}

            step2 = _run_npm_script("approve:question", [rel_rq_prop, rel_approved_scope, reviewer_id])
            steps.append(step2)
            if not step2["ok"]:
                return 400, {"ok": False, "runId": run_id, "steps": steps, "error": step2["stderr"] or step2["stdout"]}

            if ir_lines:
                req_items = [{"irId": f"ir-{idx:02d}", "text": line[:400]} for idx, line in enumerate(ir_lines, start=1)]
                req_proposal_id = f"{run_id}-ir-proposal-01"
                req_proposal_path = proposals_dir / "requirements-01.json"
                _write_json(req_proposal_path, {
                    "proposalId": req_proposal_id,
                    "questionId": question_id,
                    "runId": run_id,
                    "requirements": req_items,
                })
                step3 = _run_npm_script("approve:requirements", [f"runs/{run_id}/proposals/requirements-01.json", rel_approved_rq, reviewer_id])
                steps.append(step3)
                if not step3["ok"]:
                    return 400, {"ok": False, "runId": run_id, "steps": steps, "error": step3["stderr"] or step3["stdout"]}

        if payload.get("runDiscovery") is True:
            queries_raw = [line.strip() for line in str(payload.get("queries") or "").splitlines() if line.strip()]
            ranking_raw = list(dict.fromkeys(term.strip().lower() for term in str(payload.get("rankingTerms") or "").split(",") if term.strip()))
            try:
                min_score = int(payload.get("minimumScore") or 4)
            except (ValueError, TypeError):
                min_score = 4
            if queries_raw and ranking_raw:
                plan_id = f"{run_id}-dp-{int(time.time())}"
                queries = [
                    {"id": f"q-{idx:02d}", "search": q_text, "sources": "news,analysis"}
                    for idx, q_text in enumerate(queries_raw[:10], start=1)
                ]
                plan_path = proposals_dir / f"{plan_id}.json"
                _write_json(plan_path, {
                    "id": plan_id,
                    "runId": run_id,
                    "researchQuestionId": question_id,
                    "provider": "seerist",
                    "endpoint": "/v1/wod",
                    "queries": queries,
                    "rankingTerms": ranking_raw,
                    "pageSize": 50,
                    "maxPagesPerQuery": 1,
                    "maxApiCalls": max(2, len(queries) + 2),
                    "maxResults": 50,
                    "minimumScore": max(1, min_score),
                })
                step4 = _run_npm_script("discover:seerist", [f"runs/{run_id}/proposals/{plan_id}.json", rel_approved_rq], timeout_sec=120)
                steps.append(step4)
                if not step4["ok"]:
                    return 400, {"ok": False, "runId": run_id, "steps": steps, "error": step4["stderr"] or step4["stdout"]}

        return 200, {"ok": True, "runId": run_id, "steps": steps}

    if action == "discover-seerist":
        run_id = _valid_id(payload.get("runId")) or active_run_dir.name
        question_id = _valid_id(payload.get("questionId"))
        queries_raw = [line.strip() for line in str(payload.get("queries") or "").splitlines() if line.strip()]
        ranking_raw = list(dict.fromkeys(term.strip().lower() for term in str(payload.get("rankingTerms") or "").split(",") if term.strip()))
        try:
            min_score = int(payload.get("minimumScore") or 3)
        except (ValueError, TypeError):
            return 400, {"ok": False, "error": "Minimum score must be an integer."}
        if not question_id or not queries_raw or not ranking_raw:
            return 400, {"ok": False, "error": "Question ID, search queries, and ranking terms are required."}

        plan_id = f"{run_id}-dp-{int(time.time())}"
        queries = [
            {"id": f"q-{idx:02d}", "search": q_text, "sources": "news,analysis"}
            for idx, q_text in enumerate(queries_raw[:10], start=1)
        ]
        plan_path = (runs_root / run_id / "proposals" / f"{plan_id}.json").resolve()
        _write_json(plan_path, {
            "id": plan_id,
            "runId": run_id,
            "researchQuestionId": question_id,
            "provider": "seerist",
            "endpoint": "/v1/wod",
            "queries": queries,
            "rankingTerms": ranking_raw,
            "pageSize": 50,
            "maxPagesPerQuery": 1,
            "maxApiCalls": max(2, len(queries) + 2),
            "maxResults": 50,
            "minimumScore": max(1, min_score),
        })
        rel_plan = f"runs/{run_id}/proposals/{plan_id}.json"
        rel_rq = f"runs/{run_id}/research-questions/{question_id}/approved-research-question.json"
        step = _run_npm_script("discover:seerist", [rel_plan, rel_rq], timeout_sec=120)
        return (200 if step["ok"] else 400), {"ok": step["ok"], "runId": run_id, "steps": [step], "error": step["stderr"] if not step["ok"] else ""}

    if action == "intake-candidate":
        run_id = _valid_id(payload.get("runId")) or active_run_dir.name
        raw_ref = str(payload.get("rawArtifactRef") or "").strip()
        item_id = _valid_id(payload.get("providerItemId"))
        question_id = _valid_id(payload.get("questionId"))
        source_url = str(payload.get("sourceUrl") or "").strip()
        if not (raw_ref and item_id and question_id):
            return 400, {"ok": False, "error": "Raw artifact reference, provider item ID, and question ID are required."}
        try:
            manifest_ref, op_id = _ensure_provider_operation_manifest(runs_root, run_id, raw_ref)
        except Exception as exc:
            return 400, {"ok": False, "error": f"Failed to prepare provider operation manifest: {exc}"}
        rel_rq = f"runs/{run_id}/research-questions/{question_id}/approved-research-question.json"
        existing_intake = runs_root / run_id / "provider-intakes" / op_id / item_id / "intake-result.json" if op_id else None
        steps: list[dict[str, Any]] = []
        if existing_intake and Path(_fs_path(existing_intake)).is_file():
            intake_ref = f"runs/{run_id}/provider-intakes/{op_id}/{item_id}/intake-result.json"
            steps.append({
                "ok": True,
                "command": f"intake:seerist (reused existing {intake_ref})",
                "exitCode": 0,
                "stdout": f"Output: {intake_ref}",
                "stderr": "",
            })
        else:
            step1 = _run_npm_script("intake:seerist", [manifest_ref, item_id, rel_rq])
            steps.append(step1)
            if not step1["ok"]:
                return 400, {"ok": False, "runId": run_id, "steps": steps, "error": step1["stderr"] or step1["stdout"]}
            match = re.search(r"Output:\s*(\S+)", step1["stdout"])
            intake_ref = match.group(1).strip() if match else ""

        if intake_ref and source_url.startswith("https://"):
            step2 = _run_npm_script("retrieve:source", [intake_ref, source_url], timeout_sec=90)
            steps.append(step2)
            if step2["ok"]:
                match_ret = re.search(r"Output:\s*(\S+)", step2["stdout"])
                if match_ret:
                    step3 = _run_npm_script("canonicalize:source", [match_ret.group(1).strip()])
                    steps.append(step3)
                    if step3["ok"]:
                        match_doc = re.search(r"Output:\s*(\S+)", step3["stdout"])
                        if match_doc:
                            step4 = _run_npm_script("prepare:question-relevance", [match_doc.group(1).strip()])
                            steps.append(step4)
        elif intake_ref:
            step2 = _run_npm_script("canonicalize:source", [intake_ref])
            steps.append(step2)
            if step2["ok"]:
                match_doc = re.search(r"Output:\s*(\S+)", step2["stdout"])
                if match_doc:
                    step3 = _run_npm_script("prepare:question-relevance", [match_doc.group(1).strip()])
                    steps.append(step3)
        succeeded = all(step["ok"] for step in steps)
        return (200 if succeeded else 400), {"ok": succeeded, "runId": run_id, "steps": steps, "error": steps[-1]["stderr"] if not succeeded else ""}

    if action == "run-next":
        run_id = _valid_id(payload.get("runId")) or active_run_dir.name
        step = _run_npm_script("run:next", [run_id])
        return (200 if step["ok"] else 400), {"ok": step["ok"], "runId": run_id, "steps": [step], "error": step["stderr"] if not step["ok"] else ""}

    return 400, {"ok": False, "error": "Unsupported action."}


def _make_handler(run_dir: Path, run_id: str, cache_ms: int) -> type[BaseHTTPRequestHandler]:
    cache: dict[str, dict[str, Any]] = {}
    cache_lock = threading.Lock()
    runs_root = run_dir.parent

    def _resolve_target_run(requested_run: str | None) -> tuple[Path, str]:
        valid = _valid_id(requested_run)
        if valid:
            candidate = (runs_root / valid).resolve()
            try:
                candidate.relative_to(runs_root.resolve())
                if Path(_fs_path(candidate)).is_dir():
                    return candidate, valid
            except ValueError:
                pass
        return run_dir, run_id

    class DashboardHandler(BaseHTTPRequestHandler):
        server_version = "ReadOnlyRunView/1.0"
        sys_version = ""

        def _send(self, status: int, content_type: str, body: bytes | str, extra_headers: dict[str, str] | None = None) -> None:
            payload = body.encode("utf-8") if isinstance(body, str) else body
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; object-src 'none'; base-uri 'none'")
            if extra_headers:
                for key, value in extra_headers.items():
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(payload)

        def _current_view(self, requested_run: str | None = None) -> dict[str, Any]:
            target_dir, target_id = _resolve_target_run(requested_run)
            now = time.monotonic()
            with cache_lock:
                cached = cache.get(target_id)
                if cached is not None and now - cached["at"] < cache_ms / 1000:
                    return cached["view"]
                scan = scan_run_directory(target_dir, run_id=target_id)
                scanned_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                view = build_run_view(target_id, scan["files"], scan["jsons"], scan["events"], scanned_at)
                view["truncated"] = scan["truncated"]
                view["availableRuns"] = list_available_runs(runs_root)
                cache[target_id] = {"at": time.monotonic(), "view": view}
                return view

        def do_GET(self) -> None:
            parsed = urlsplit(self.path)
            query = parse_qs(parsed.query)
            requested_run = query.get("run", [None])[0]
            if parsed.path == "/":
                _, target_id = _resolve_target_run(requested_run)
                self._send(200, "text/html; charset=utf-8", render_page(target_id))
                return
            if parsed.path == "/api/runs":
                self._send(200, "application/json; charset=utf-8", json.dumps({"runs": list_available_runs(runs_root), "defaultRunId": run_id}, ensure_ascii=False))
                return
            if parsed.path == "/api/run":
                self._send(200, "application/json; charset=utf-8", json.dumps(self._current_view(requested_run), ensure_ascii=False))
                return
            if parsed.path == "/api/stage-prompt":
                target_dir, _ = _resolve_target_run(requested_run)
                rel_path = query.get("path", [""])[0]
                absolute = resolve_inside_run(target_dir, rel_path) if ai_stage_for(rel_path) else None
                text = read_artifact_text(absolute, MAX_ARTIFACT_BYTES) if absolute else None
                try:
                    prompt = json.loads(text).get("prompt") if text else None
                except ValueError:
                    prompt = None
                if not isinstance(prompt, dict):
                    self._send(404, "text/plain; charset=utf-8", "AI request not available")
                    return
                combined = f"{prompt.get('system', '')}\n\n{prompt.get('user', '')}"
                self._send(200, "application/json; charset=utf-8", json.dumps({"prompt": combined}, ensure_ascii=False))
                return
            if parsed.path == "/api/relevance-prompt":
                target_dir, _ = _resolve_target_run(requested_run)
                try:
                    request, _ = _load_relevance_request(target_dir, query.get("path", [""])[0])
                except ValueError:
                    request = None
                if request is None:
                    self._send(404, "text/plain; charset=utf-8", "Relevance request not available")
                    return
                self._send(200, "application/json; charset=utf-8", json.dumps({"prompt": build_relevance_prompt(request)}, ensure_ascii=False))
                return
            if parsed.path == "/api/lead":
                target_dir, target_id = _resolve_target_run(requested_run)
                lead = read_lead(target_dir, target_id, query.get("path", [""])[0], query.get("id", [""])[0])
                if lead is None:
                    self._send(404, "text/plain; charset=utf-8", "Lead not available")
                    return
                self._send(200, "application/json; charset=utf-8", json.dumps(lead, ensure_ascii=False))
                return
            if parsed.path == "/api/artifact":
                target_dir, _ = _resolve_target_run(requested_run)
                rel_path = query.get("path", [""])[0]
                absolute = resolve_inside_run(target_dir, rel_path)
                if absolute is None:
                    self._send(403, "text/plain; charset=utf-8", "Outside the run root")
                    return
                content = read_artifact_text(absolute, MAX_ARTIFACT_BYTES)
                if content is None:
                    self._send(404, "text/plain; charset=utf-8", "Artefact not available")
                    return
                content_type = "application/json; charset=utf-8" if rel_path.endswith(".json") else "text/plain; charset=utf-8"
                self._send(200, content_type, content)
                return
            if parsed.path in STATIC_FILES:
                file_path, content_type = STATIC_FILES[parsed.path]
            elif parsed.path in FONT_FILES:
                filename, content_type = FONT_FILES[parsed.path]
                file_path = DASHBOARD_DIR / "assets" / "vestas" / filename
            else:
                self._send(404, "text/plain; charset=utf-8", "Not found")
                return
            try:
                self._send(200, content_type, file_path.read_bytes())
            except OSError:
                self._send(404, "text/plain; charset=utf-8", "Asset not available")

        def _method_not_allowed(self) -> None:
            self._send(405, "text/plain; charset=utf-8", "Read-only", {"Allow": "GET"})

        def do_POST(self) -> None:
            parsed = urlsplit(self.path)
            if parsed.path != "/api/action":
                self._method_not_allowed()
                return
            host = self.headers.get("Host", "")
            allowed_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            origin = self.headers.get("Origin")
            if host not in allowed_hosts or (origin is not None and origin != f"http://{host}"):
                self._send(403, "application/json", json.dumps({"ok": False, "error": "Local same-origin actions only."}))
                return
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                self._send(415, "application/json", json.dumps({"ok": False, "error": "JSON content type required."}))
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > MAX_POST_BYTES:
                self._send(400, "application/json; charset=utf-8", json.dumps({"ok": False, "error": "Invalid request payload size."}))
                return
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError):
                self._send(400, "application/json; charset=utf-8", json.dumps({"ok": False, "error": "Invalid JSON body."}))
                return
            if not isinstance(payload, dict):
                self._send(400, "application/json; charset=utf-8", json.dumps({"ok": False, "error": "Expected JSON object."}))
                return
            try:
                status_code, response_obj = _handle_analyst_action(runs_root, run_dir, payload)
            except FileExistsError:
                status_code, response_obj = 409, {"ok": False, "error": "Artifact already exists; no overwrite permitted."}
            except (OSError, ValueError):
                status_code, response_obj = 400, {"ok": False, "error": "Action failed. Check the run artifacts before retrying."}
            with cache_lock:
                cache.clear()
            self._send(status_code, "application/json; charset=utf-8", json.dumps(response_obj, ensure_ascii=False))

        def do_PUT(self) -> None:
            self._method_not_allowed()

        def do_PATCH(self) -> None:
            self._method_not_allowed()

        def do_DELETE(self) -> None:
            self._method_not_allowed()

        def do_OPTIONS(self) -> None:
            self._method_not_allowed()

        def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
            if code == 501:
                self._method_not_allowed()
                return
            super().send_error(code, message, explain)

    return DashboardHandler


def create_server(
    run_dir: str | Path,
    run_id: str | None = None,
    host: str = "127.0.0.1",
    port: int = 4317,
    cache_ms: int = 1500,
) -> ThreadingHTTPServer:
    resolved_run_dir = Path(run_dir).resolve()
    selected_id = run_id or resolved_run_dir.name
    handler = _make_handler(resolved_run_dir, selected_id, max(0, cache_ms))
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve a read-only dashboard for one run directory.")
    parser.add_argument("run_dir", help="Path to an existing run directory")
    parser.add_argument("--run-id", help="Display name (defaults to the directory name)")
    parser.add_argument("--port", type=int, default=4317)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    server = create_server(args.run_dir, args.run_id, args.host, args.port)
    address, port = server.server_address[:2]
    print(f"Read-only run view: http://{address}:{port}/  run={args.run_id or Path(args.run_dir).resolve().name}  dir={Path(args.run_dir).resolve()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
