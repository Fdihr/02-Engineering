"""Local Copilot transport and server-persisted model preference."""
from __future__ import annotations

import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Any

APP_DIR = Path(__file__).resolve().parent.parent
SETTINGS_NAME = ".copilot-settings.json"
COPILOT_PROVIDER = "github-copilot-sdk"
WORKFLOW_STEPS = [
    {"kind": "ai", "id": "research-question", "label": "Draft research plan", "description": "Turn a thesis into proposed research questions and Seerist searches. No approval or collection."},
    {"kind": "human", "label": "Approve scope, question and requirements", "description": "Review the proposed plan and approve the research intent before collection."},
    {"kind": "system", "label": "Collect and canonicalize", "description": "Bounded Seerist collection and captured-content preparation. Collection leads wait for RSS."},
    {"kind": "ai", "id": "relevance", "label": "Assess question relevance", "description": "Assess each canonical source against the approved question."},
    {"kind": "human", "label": "Admit evidence", "description": "Current compatibility review; an AI proposal cannot approve evidence."},
    {"kind": "ai", "id": "extract", "label": "Extract source observations", "description": "Find requirement-linked observations with exact source anchors."},
    {"kind": "human", "label": "Review source support", "description": "Current interim source-assurance review before synthesis."},
    {"kind": "ai", "id": "build", "label": "Build synthesis", "description": "Propose cross-source claims from source notes."},
    {"kind": "ai", "id": "challenge", "label": "Challenge synthesis", "description": "Test claims for gaps, contradictions and alternative explanations."},
    {"kind": "human", "label": "Adjudicate challenges", "description": "Decide which claims stand before key-judgement selection."},
    {"kind": "ai", "id": "key-judgements", "label": "Select key judgements", "description": "Select bounded judgements from adjudicated claims."},
    {"kind": "ai", "id": "memo-writer", "label": "Write memo", "description": "Write the memo from selected judgements and traceable evidence."},
    {"kind": "system", "label": "Verify output", "description": "Deterministic validation and publication-blocker checks; no model selector."},
    {"kind": "human", "label": "Approve publication", "description": "Publication remains an explicit human decision."},
]
STAGE_IDS = {step["id"] for step in WORKFLOW_STEPS if step["kind"] == "ai"}


class CopilotError(Exception):
    """A local runtime, authentication, or model-selection failure."""


def call_copilot(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            ["node", "--import", "tsx", "src/commands/local-copilot.ts"],
            cwd=str(APP_DIR),
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="strict",
            timeout=210,
        )
    except subprocess.TimeoutExpired as exc:
        raise CopilotError("Local Copilot timed out. Check authentication and connectivity before retrying.") from exc
    except (OSError, UnicodeError) as exc:
        raise CopilotError("Could not start local Copilot. Check Node.js and the installed app dependencies.") from exc
    if completed.returncode != 0:
        raise CopilotError(completed.stderr.strip() or "Local Copilot failed without an error message.")
    try:
        value = json.loads(completed.stdout)
    except ValueError as exc:
        raise CopilotError("Local Copilot returned an invalid transport response.") from exc
    if not isinstance(value, dict):
        raise CopilotError("Local Copilot returned an invalid transport response.")
    return value


def load_settings(runs_root: Path) -> dict[str, Any]:
    path = runs_root / SETTINGS_NAME
    if not path.exists():
        return {"model": None, "stages": {}}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CopilotError("Could not read the saved model setting. Check .copilot-settings.json in the run directory.") from exc
    if not isinstance(value, dict) or not isinstance(value.get("model"), str) or not value["model"].strip():
        raise CopilotError("The saved model setting is invalid. Select and save a model in Settings.")
    return {"model": value["model"], "stages": _validate_stages(value.get("stages", {}))}


def _validate_stages(stages: Any) -> dict[str, dict[str, str]]:
    if not isinstance(stages, dict) or set(stages) - STAGE_IDS:
        raise CopilotError("Invalid AI stage settings. Refresh Settings and select models for the supported stages.")
    for binding in stages.values():
        if (
            not isinstance(binding, dict)
            or set(binding) != {"provider", "model"}
            or binding["provider"] != COPILOT_PROVIDER
            or not isinstance(binding["model"], str)
            or not binding["model"].strip()
        ):
            raise CopilotError("Each stage must use an explicit Copilot model. Foundry is not connected yet.")
    return stages


def resolve_model(runs_root: Path, stage: str) -> str:
    if stage not in STAGE_IDS:
        raise CopilotError("Unknown AI stage. No model was invoked.")
    settings = load_settings(runs_root)
    model = settings["stages"].get(stage, {}).get("model") or settings["model"]
    if not model:
        raise CopilotError("Choose and save a Copilot model in Settings before running an AI stage.")
    return model


def available_models() -> list[dict[str, str]]:
    result = call_copilot({"action": "models"})
    models = result.get("models")
    if not isinstance(models, list) or not all(
        isinstance(model, dict) and isinstance(model.get("id"), str) and isinstance(model.get("name"), str)
        for model in models
    ):
        raise CopilotError("Copilot returned an invalid model catalog.")
    return models


def save_model(runs_root: Path, model: Any, stages: Any = None) -> dict[str, Any]:
    overrides = _validate_stages(load_settings(runs_root)["stages"] if stages is None else stages)
    catalog = {entry["id"] for entry in available_models()}
    if not isinstance(model, str) or model not in catalog:
        raise CopilotError("That model is not available. Refresh models and select an available model.")
    for stage, binding in overrides.items():
        if binding["model"] not in catalog:
            raise CopilotError(f"The model for {stage} is not available. Refresh models and select an available model.")
    saved = {"model": model, "stages": overrides}
    runs_root.mkdir(parents=True, exist_ok=True)
    temporary = runs_root / f".copilot-settings-{uuid.uuid4().hex}.tmp"
    try:
        temporary.write_text(json.dumps(saved, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, runs_root / SETTINGS_NAME)
    finally:
        temporary.unlink(missing_ok=True)
    return saved


def generate(runs_root: Path, prompt: dict[str, str], stage: str) -> dict[str, Any]:
    model = resolve_model(runs_root, stage)
    result = call_copilot({"action": "generate", "model": model, "prompt": prompt})
    if (
        result.get("provider") != "github-copilot-sdk"
        or result.get("model") != model
        or result.get("freshSession") is not True
        or not all(isinstance(result.get(key), str) and result[key].strip()
                   for key in ("invocationId", "startedAt", "completedAt", "content"))
    ):
        raise CopilotError("Copilot returned incomplete or mismatched invocation provenance. No answer was recorded.")
    return {**result, "stage": stage}
