"""Bridge the dashboard's artifact projection to the shared TypeScript selector."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parent.parent


def project_workflow(value: dict[str, Any]) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            ["node", "--import", "tsx", "src/commands/project-workflow.ts"],
            cwd=str(APP_DIR),
            input=json.dumps(value),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="strict",
            timeout=30,
        )
    except (OSError, UnicodeError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("Could not run the shared workflow projection.") from exc
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or "Workflow projection failed without an error message.")
    try:
        result = json.loads(completed.stdout)
    except ValueError as exc:
        raise RuntimeError("The workflow projection returned invalid JSON.") from exc
    if not isinstance(result, dict):
        raise RuntimeError("The workflow projection returned an invalid result.")
    return result
