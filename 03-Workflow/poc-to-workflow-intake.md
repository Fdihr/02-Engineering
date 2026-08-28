# PoC to Workflow Intake

Use this file to register which legacy PoC artifacts are allowed to influence the new workflow.

## Intake steps

1. Register artifact in `00-PoC-Reference/00-Drop/`.
2. Promote only needed files to `00-PoC-Reference/01-Source-Snapshots/`.
3. Create a mapping note from `00-PoC-Reference/03-Mapping/mapping-template.md`.
4. Approve mapping status as `accepted` before coding.

## Rule

Only accepted mappings can be translated into code under `app/src/`.
