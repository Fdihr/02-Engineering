# Approved Memo Standard Pack

Status: Active. `memo-standard-v3` was approved by the governance owner on
2026-11-06.

## Versioning and approval

`src/modules/memo/standards/memo-standard-v3.json` is the default for new memo
work. It is an approved, domain-neutral standard with a style-only archive
curation, a three-key-judgement cap, and no total word-count limit. Its required
workflow sections, claim-linked citation rule, confidence lexicon, prohibited
patterns, and per-section statement limits remain deterministic.

The pack records 23 hash-verified archived memos as style references. Nine
additional archive items were excluded: three valid Open XML files could not be
opened from the current OneDrive workspace, and six files with `.docx` names
are legacy binary `.doc` documents. The excluded items are recorded in the
standard's `archiveCoverage`.

Historical memo facts, entities, claims, judgments, or distinctive wording have
no authority in current synthesis and are not copied into the pack. The archive
informs presentation only. The pack's regression examples use synthetic
scenarios.

## Model boundary

The checksum-bound standard artifact contains its approval, source hashes,
archive coverage, and regression examples. The writer request receives only a
strict projection containing operational writing guidance and policy. Source
paths, hashes, approval metadata, archive coverage, and regression examples are
not sent to the model.

## Historical compatibility

`memo-standard-v0`, `memo-standard-v1`, and provisional `memo-standard-v2`
remain immutable. Existing authorizations, requests, drafts, and editorial
revisions continue to use their bound version. Changing the default applies
only to new authorizations; it does not migrate or unblock an existing draft.
