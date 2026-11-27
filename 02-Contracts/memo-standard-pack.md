# Approved Memo Standard Pack

Status: Active. `memo-standard-v4` was approved on 2026-11-27 (superseding `memo-standard-v3` for new memo work while keeping `v0`–`v3` immutable).

## Versioning and approval

`src/modules/memo/standards/memo-standard-v4.json` is the default for new memo
work. It is an approved, domain-neutral Executive Management (ExM) memo standard
(~1 to 1.5 pages / 350–550 words) with a style-only archive curation, up to three
key judgements (`judgementTextMaxChars: 200`), concise section statement limits
(`maxBlufStatements: 3`, `maxSituationStatements: 6`, `maxAnalysisStatements: 5`,
`maxUncertaintyStatements: 3`, `maxIndicatorStatements: 4`), full non-rejected
adjudicated claim pool access for the writer, and no arbitrary total word-count
hard failure. Its required workflow sections, claim-linked citation rule,
confidence lexicon, prohibited patterns, and per-section statement limits remain
deterministic.

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

`memo-standard-v0`, `memo-standard-v1`, provisional `memo-standard-v2`, and
`memo-standard-v3` remain immutable. Existing authorizations, requests, drafts,
and editorial revisions continue to use their bound version. Changing the default
applies only to new authorizations; it does not migrate or unblock an existing draft.
