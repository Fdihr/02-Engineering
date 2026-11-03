"""API key management and connection checks for the dashboard settings view.

Keys are write-only: nothing here returns a full key, and no message or
exception text ever contains one.
"""
from __future__ import annotations

import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, MutableMapping
from urllib.parse import urlsplit

KEY_NAMES = {"SEERIST_API_KEY": "Seerist"}
CONFIG_NAMES = {
    "ENTRA_TENANT_ID": "Microsoft Entra tenant ID",
    "ENTRA_CLIENT_ID": "Microsoft Entra application (client) ID",
    "AZURE_AI_FOUNDRY_ENDPOINT": "Azure AI Foundry endpoint",
}
_KEY_PATTERN = re.compile(r"[\x21-\x7e]{8,512}")
_GUID_PATTERN = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
CHECK_TIMEOUT_SECONDS = 15
SEERIST_CHECK_URL = "https://app.seerist.com/hyperionapi/v1/wod?pageSize=1"


def _persist_user_env(name: str, value: str | None) -> bool:
    """Write or delete a Windows user environment variable. Returns whether it persisted."""
    if sys.platform != "win32":
        return False
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_SET_VALUE) as key:
        if value is None:
            try:
                winreg.DeleteValue(key, name)
            except FileNotFoundError:
                pass
        else:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
    try:
        import ctypes

        result = ctypes.c_ulong()
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF, 0x1A, 0, "Environment", 0x2, 5000, ctypes.byref(result))
    except Exception:  # noqa: BLE001 - broadcast is best effort
        pass
    return True


def key_status(env: Mapping[str, str]) -> list[dict[str, Any]]:
    rows = []
    for name, label in KEY_NAMES.items():
        value = (env.get(name) or "").strip()
        rows.append({"name": name, "label": label, "set": bool(value), "last4": value[-4:] if value else ""})
    return rows


def validate_key(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned if _KEY_PATTERN.fullmatch(cleaned) else None


def save_key(name: str, value: str, *, persist: Callable[[str, str | None], bool] | None = None,
             env: MutableMapping[str, str] | None = None) -> bool:
    if name not in KEY_NAMES:
        raise ValueError("Unknown key name.")
    cleaned = validate_key(value)
    if cleaned is None:
        raise ValueError("Invalid key.")
    target = os.environ if env is None else env
    persisted = bool((persist or _persist_user_env)(name, cleaned))
    target[name] = cleaned
    return persisted


def remove_key(name: str, *, persist: Callable[[str, str | None], bool] | None = None,
               env: MutableMapping[str, str] | None = None) -> bool:
    if name not in KEY_NAMES:
        raise ValueError("Unknown key name.")
    target = os.environ if env is None else env
    persisted = bool((persist or _persist_user_env)(name, None))
    target.pop(name, None)
    return persisted


def config_status(env: Mapping[str, str]) -> list[dict[str, Any]]:
    return [
        {
            "name": name,
            "label": label,
            "value": (env.get(name) or "").strip(),
            "configured": validate_config(name, env.get(name, "")) not in (None, ""),
        }
        for name, label in CONFIG_NAMES.items()
    ]


def entra_sso_enabled(env: Mapping[str, str]) -> bool:
    return all(
        validate_config(name, env.get(name, ""))
        for name in ("ENTRA_TENANT_ID", "ENTRA_CLIENT_ID")
    )


def validate_config(name: str, value: Any) -> str | None:
    if name not in CONFIG_NAMES or not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return ""
    if name == "AZURE_AI_FOUNDRY_ENDPOINT":
        try:
            parsed = urlsplit(cleaned)
            return cleaned.rstrip("/") if (
                parsed.scheme == "https"
                and parsed.hostname
                and not parsed.username
                and not parsed.password
                and parsed.port in (None, 443)
                and not parsed.query
                and not parsed.fragment
            ) else None
        except ValueError:
            return None
    return cleaned if _GUID_PATTERN.fullmatch(cleaned) else None


def save_config(name: str, value: str, *, persist: Callable[[str, str | None], bool] | None = None,
                env: MutableMapping[str, str] | None = None) -> bool:
    if name not in CONFIG_NAMES:
        raise ValueError("Unknown configuration name.")
    cleaned = validate_config(name, value)
    if cleaned is None:
        raise ValueError("Invalid configuration value.")
    target = os.environ if env is None else env
    if cleaned:
        persisted = bool((persist or _persist_user_env)(name, cleaned))
        target[name] = cleaned
    else:
        persisted = bool((persist or _persist_user_env)(name, None))
        target.pop(name, None)
    return persisted


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def check_connection(name: str, env: Mapping[str, str], *, opener: Callable[..., Any] = urllib.request.urlopen) -> dict[str, Any]:
    if name not in KEY_NAMES:
        raise ValueError("Unknown key name.")
    label = KEY_NAMES[name]
    key = (env.get(name) or "").strip()
    if not key:
        return {"ok": False, "status": None, "message": "No key set", "checkedAt": _now()}
    request = urllib.request.Request(SEERIST_CHECK_URL, method="GET",
                                     headers={"accept": "application/json", "x-api-key": key})
    status: int | None
    try:
        with opener(request, timeout=CHECK_TIMEOUT_SECONDS) as response:
            status = int(getattr(response, "status", None) or response.getcode())
    except urllib.error.HTTPError as error:
        status = int(error.code)
    except (urllib.error.URLError, OSError, ValueError):
        return {"ok": False, "status": None, "message": f"Could not reach {label}", "checkedAt": _now()}
    if status == 200:
        message = "Connected"
    elif status in (401, 403):
        message = f"{label} rejected the key"
    else:
        message = f"{label} answered with HTTP {status}"
    return {"ok": status == 200, "status": status, "message": message, "checkedAt": _now()}


def runs_folder_info(runs_root: Path) -> dict[str, Any]:
    root = Path(runs_root)
    try:
        analyses = sum(1 for child in root.iterdir() if not child.name.startswith(".") and child.is_dir())
    except OSError:
        analyses = 0
    return {"path": str(root.resolve()), "analyses": analyses, "writable": os.access(root, os.W_OK)}
