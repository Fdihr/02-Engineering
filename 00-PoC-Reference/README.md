# PoC Reference Zone

Purpose: Keep legacy PoC material available as inspiration while protecting the new app workflow from accidental carry-over.

## How to use this area

1. Put untouched old PoC files in `00-Drop/`.
2. Copy curated snapshots into `01-Source-Snapshots/` with stable names.
3. Write extracted lessons in `02-Insights/`.
4. Map old behavior to new modular design in `03-Mapping/`.

## Guardrails

1. This folder is reference-only, not runtime source.
2. Do not import code directly from this folder into the new app.
3. Every reused idea must be captured as a mapping note before implementation.
4. When old and new behavior conflict, the new contracts and workflow docs win.

## Suggested file naming

- Snapshot: `poc-snapshot-YYYYMMDD-vN.*`
- Insight note: `insight-YYYYMMDD-topic.md`
- Mapping note: `map-<feature>-to-new-workflow.md`
