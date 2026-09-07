# Bounded Key-Judgement Selection

Status: Active versioned boundary between performed adjudication and writer v2.

## Purpose

Bound the claims that can become memo key judgements without giving the model authority over eligibility, confidence, status, challenge state, or workflow transitions. Build may retain a broad claim graph for Challenge and adjudication; the memo receives at most the policy-sized selected set.

## Deterministic eligibility

`ClaimForSelection` is projected from the committed `SynthesisBuildRecord` plus a performed adjudication:

1. `claimId` comes from the committed claim.
2. IR coverage is derived by intersecting the claim's supporting observation IDs with code-derived synthesis question coverage.
3. Status and open challenge IDs come from performed adjudication.
4. Confidence, ceiling, and provisional status come from the committed claim.
5. Unknown confidence or ceiling cannot enter selection.

Rejected claims are excluded. Contested claims are included only when policy permits. Eligible claims are ordered per IR by confidence descending, accepted before contested, then claim ID. IRs with no eligible claim are recorded as gaps. A `synthesis-provisional-adjudication-v1` artifact cannot enter this boundary because `proposed` is not `accepted`.

## Policy

`memo-standard-v1` owns `keyJudgementPolicy`:

- `policyId: memo-standard-v1-key-judgements-v1`
- `maxKeyJudgements: 3`
- `maxKeyJudgementsStatus: provisional`
- `allowContested: true`
- `judgementTextMaxChars: 240`

The earlier `memo-standard-v0.json` bytes and existing run artifacts remain unchanged.

## Model boundary

The request reuses Challenge aliases such as `c01`; real claim IDs are not rendered in the model prompt. The model returns exactly `selections` and `omissions`. It chooses one eligible alias per IR or gives an explicit omission reason, and words selected judgements. It never supplies confidence, ceiling, status, provisional state, or challenge IDs.

`parseKeyJudgementProposal` enforces exact keys after the existing strict wrapper normalization. `validateKeyJudgementProposal` aggregates content-free failures:

| Check | Rule |
| --- | --- |
| KJ1 | Every claim alias resolves. |
| KJ2 | Every IR is approved. |
| KJ3 | The claim is eligible for that IR. |
| KJ4 | At most one selection exists per IR. |
| KJ5 | The overall policy cap is respected. |
| KJ6 | Every eligible IR is selected or explicitly omitted. |
| KJ7 | Omissions are unique, reasoned, unselected eligible IRs. |
| KJ8 | Judgement text is non-empty and within policy bounds. |

Failures contain only `{ check, count, rule }`. On success, code attaches claim-owned fields and writes an immutable selection record.

## Commands and artifacts

Run from `app/`:

```powershell
npm run prepare:key-judgements -- <build-record.json> <challenge-record.json> <performed-adjudication.json> <memo-standard-v1.json>
npm run record:key-judgements -- <key-judgement-request.json> <copilot-response.json>
npm run prepare:memo-writer -- <build-record.json> <challenge-record.json> <performed-adjudication.json> <key-judgement-record.json> <approved-question.json> <memo-standard-v1.json>
```

Requests and records are write-once beneath `runs/<runId>/synthesis/key-judgements/`. Recording reopens and checksum-verifies Build, Challenge, performed adjudication, memo standard, request, and response. Writer v2 recomputes eligibility and KJ1-KJ8 from those authoritative inputs before accepting the selection record.

Writer v2 accepts only selected claims. It carries key-judgement wording unchanged into canonical memo JSON; the writer model may return only optional analysis, uncertainty, and indicator statements. Model-authored BLUF or key-judgement rows are rejected. Code derives BLUF, citations, confidence, status, open challenges, gaps, omissions, limitations, and publication blockers.