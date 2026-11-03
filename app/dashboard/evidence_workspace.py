"""Read-only Evidence workspace overview derived from the journey projection.

Pure derivation: it reads the already-built journey rows and persisted parts and never
calls a provider, changes admission policy, or infers support/contradiction from text.
Anything the persisted artifacts do not establish is reported as "unassessed".
"""

from __future__ import annotations

from typing import Any

SCHEMA_VERSION = 1
UNASSESSED = "unassessed"
RSS_EXPLANATION = "These Seerist leads have no resolved captured source. RSS feeds may not contain historical articles. Local article retrieval requires an explicitly approved exact-URL plan; it does not automatically resolve these historical leads."


def _step_state(row: dict[str, Any], key: str) -> str:
    for step in row.get("steps", []):
        if step.get("key") == key:
            return step.get("state", "")
    return ""


def _disposition(row: dict[str, Any]) -> str:
    if _step_state(row, "admit") == "done":
        return "admitted"
    if row.get("state") == "pending" and row.get("lead"):
        return "metadata-only"
    if _step_state(row, "admit") == "closed" or _step_state(row, "relevance") == "closed":
        return "closed"
    if _step_state(row, "admit") == "you":
        return "pending-admission"
    return "in-progress"


def _identity(row: dict[str, Any]) -> str:
    """Distinct source identity: the persisted snapshot when present, otherwise the row itself."""
    return row.get("snapshotId") or f"row:{row.get('id', '')}"


def _distinct_count(rows: list[dict[str, Any]]) -> int:
    return len({_identity(row) for row in rows})


def _pipeline(journey: dict[str, Any]) -> dict[str, Any]:
    rows = journey.get("sources", [])
    captured = [r for r in rows if r.get("snapshotId")]
    relevant = [r for r in rows if _step_state(r, "relevance") == "done"]
    admitted = [r for r in rows if _step_state(r, "admit") == "done"]
    reviewed = [r for r in rows if _step_state(r, "review") == "done"]
    provisional = [r for r in rows if _step_state(r, "review") == "provisional"]
    pending = int(journey.get("pendingRssLeadCount", 0))
    blocker = {"kind": "pending_rss", "leadCount": pending, "explanation": RSS_EXPLANATION} if pending else None
    return {
        "leads": {"count": len(journey.get("leads", [])), "basis": "distinct Seerist lead items"},
        "capturedSources": {
            "count": len({r["snapshotId"] for r in captured}),
            "basis": "distinct persisted snapshots; retrieved rows without a snapshot are not counted",
        },
        "acquisitionBlocker": blocker,
        "stagesExclusive": False,
        "stages": [
            {"key": "relevant", "label": "Relevant", "count": _distinct_count(relevant),
             "basis": "distinct sources whose relevance step is done (positive verdict)"},
            {"key": "admitted", "label": "Admitted", "count": _distinct_count(admitted),
             "basis": "distinct sources whose admit step is done"},
            {"key": "reviewed", "label": "Reviewed", "count": _distinct_count(reviewed),
             "basis": "distinct sources with a completed review (done)"},
            {"key": "provisionallyReviewed", "label": "Provisionally reviewed", "count": _distinct_count(provisional),
             "basis": "distinct sources with a provisional review; support pass skipped, not a completed review"},
        ],
    }



def _questions(journey: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": r["irId"],
            "text": r["text"],
            "coverage": r.get("coverage") or UNASSESSED,
            "sourceNoteIds": r.get("sourceNoteIds"),
            "observationIds": r.get("observationIds"),
        }
        for r in journey.get("brief", {}).get("requirements", [])
    ]


def _exceptions(exceptions: list[dict[str, Any]]) -> dict[str, Any]:
    items = [
        {"id": str(e.get("id", "")), "kind": str(e.get("kind", "")), "status": str(e.get("status", "")),
         "relPath": str(e.get("relPath", ""))}
        for e in exceptions
    ]
    return {"open": sum(1 for item in items if item["status"] == "open"), "items": items}


def _source_explorer(journey: dict[str, Any]) -> list[dict[str, Any]]:
    explorer = []
    for row in journey.get("sources", []):
        disposition = _disposition(row)
        explorer.append({
            "rowId": row.get("id", ""),
            "title": row.get("title", ""),
            "disposition": disposition,
            "snapshotId": row.get("snapshotId") or None,
            "countsAsEvidence": disposition == "admitted",
        })
    return explorer


def build_evidence_workspace(journey: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Return the additive `evidenceWorkspace` projection for a built journey."""
    return {
        "schemaVersion": SCHEMA_VERSION,
        "pipeline": _pipeline(journey),
        "questions": _questions(journey),
        "exceptions": _exceptions(parts.get("exceptions", [])),
        "sourceExplorer": _source_explorer(journey),
    }
