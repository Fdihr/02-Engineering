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
        return {"model": None}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CopilotError("Could not read the saved model setting. Check .copilot-settings.json in the run directory.") from exc
    if not isinstance(value, dict) or not isinstance(value.get("model"), str) or not value["model"].strip():
        raise CopilotError("The saved model setting is invalid. Select and save a model in Settings.")
    return {"model": value["model"]}


def available_models() -> list[dict[str, str]]:
    result = call_copilot({"action": "models"})
    models = result.get("models")
    if not isinstance(models, list) or not all(
        isinstance(model, dict) and isinstance(model.get("id"), str) and isinstance(model.get("name"), str)
        for model in models
    ):
        raise CopilotError("Copilot returned an invalid model catalog.")
    return models


def save_model(runs_root: Path, model: Any) -> dict[str, str]:
    if not isinstance(model, str) or model not in {entry["id"] for entry in available_models()}:
        raise CopilotError("That model is not available. Refresh models and select an available model.")
    runs_root.mkdir(parents=True, exist_ok=True)
    temporary = runs_root / f".copilot-settings-{uuid.uuid4().hex}.tmp"
    try:
        temporary.write_text(json.dumps({"model": model}, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, runs_root / SETTINGS_NAME)
    finally:
        temporary.unlink(missing_ok=True)
    return {"model": model}


def generate(runs_root: Path, prompt: dict[str, str]) -> dict[str, Any]:
    model = load_settings(runs_root)["model"]
    if not model:
        raise CopilotError("Choose and save a Copilot model in Settings before running an AI stage.")
    result = call_copilot({"action": "generate", "model": model, "prompt": prompt})
    if (
        result.get("provider") != "github-copilot-sdk"
        or result.get("model") != model
        or result.get("freshSession") is not True
        or not all(isinstance(result.get(key), str) and result[key].strip()
                   for key in ("invocationId", "startedAt", "completedAt", "content"))
    ):
        raise CopilotError("Copilot returned incomplete or mismatched invocation provenance. No answer was recorded.")
    return result
