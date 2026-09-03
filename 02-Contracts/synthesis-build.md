# Provisional Source Review and Synthesis Build

Status: Active contract for the Panel 2 provisional state and deterministic Panel 3 Build envelope.

## Purpose

Permit an end-to-end prototype run when the human support pass is deferred without manufacturing human verdicts, requirement dispositions, or source assessment. Provisional artifacts remain immutable, visibly unreviewed, and ineligible for publication.

## Panel 2 provisional response

`supportPass` is required and is either `performed` or `not-performed`. When it is `not-performed`:

1. `omissionPass` is `not-performed`.
2. `verdicts`, `humanObservations`, and `irReview` are empty.
3. `assessment` is absent or exactly `{ "status": "not-assessed" }`.
4. Any non-empty judgment field is contradictory and rejected.
5. Code creates one `unreviewed` record verdict for every review-package observation. `unreviewed` never means supported.

The profile policy's `reviewVerdicts` set governs only human judgments: `supported`, `unsupported`, `duplicate`, and `chrome`. `unreviewed` is a separately enumerated controller state and is never added to or inferred from a legacy human-verdict policy. This prevents a reader from mistaking a controller state for a policy omission.

Assembly emits `reviewStatus: "provisional"`, retains all committed observations with visible `reviewVerdict: "unreviewed"`, retains model IR dispositions, and sets human and final dispositions to `null`. It adds exactly one support-review caveat:

> Observations not reviewed by a human; evidence in this note is provisional.

A performed support pass emits `reviewStatus: "reviewed"` and preserves the existing review rules.

The first live performed pass marked all 20 NV observations supported with no tag corrections. The reviewed note supersedes the provisional note. Support failure, chrome, tag precision, and disposition comparison are measured; omission and rows-only underclaims remain null.

## Measurement

For a provisional note, support failure rate, chrome rate, omission count, tag precision, and disposition comparison are all `null`. Counts inside those measurements are also `null`; an unmeasured value is never represented as zero. Recommendations state separately that each measurement was not performed. Quote-transcription diagnostics remain measurable because they come from the extraction controller rather than human review.

## Build

`prepare:synthesis-build` accepts checksum-bound reviewed, provisional, or synthetic source notes. It rejects extract commits, review packages, and incomplete note lineage. Code derives qualified observation aliases, outlet identity, observation-pair relationships, question coverage, gaps, limitations, and the preliminary `limitedEvidence` value before any model call, then writes a checksum-bound model-ready request.

Synthetic is a third source-note status, not a flavor of provisional. A synthetic note can never be superseded into a reviewed note. Any envelope consuming one is `reviewStatus: "synthetic"`; every claim it supports has both `provisional: true` and `synthetic: true`. A chain is reviewed only when every consumed note is reviewed.

Every claim supported by an unreviewed observation is `provisional: true`. The final `limitedEvidence` predicate is true when there are no usable claims, all usable claims are single-source dependent after collapse, any consumed note is provisional or synthetic, any consumed note has a policy-recognized coverage caveat, or an information requirement is silent everywhere.

The Build response contains judgment fields only: statement, bounded kind, support aliases, `attributedTo` for statements, `analyticRationale` for analytic assessments or forecasts, and confidence with rationale. Assumptions, alternatives, caveats, and contradictions belong to Challenge or Adjudicate. `record:synthesis-build` rejects model-authored IDs, dependencies, counts, coverage, gaps, limitations, status flags, source appendix, and `limitedEvidence`. It recomputes and checksum-verifies the envelope and request before recording any claim.

Request v2 renders `permittedClaimKinds` and the single-support confidence ceiling with rule ID beside every alias. It also includes the exact response shape as text, a content-free structural example, and an empty valid response. A retry request may checksum-bind a human authorization artifact. Legacy request v1 remains readable and recomputable; its immutable bytes are not rewritten.

The first live diagnosis confirmed the kind table is not over-strict. Direct `event` aliases permitted `reported-fact`. The first attempt-2 failure was a permitted `statement` claim that omitted required `attributedTo`; a later claim separately proposed `analytic-assessment` from two `statement` aliases. These are prompt/model failures, so the stored proposal was not revalidated. Authorized request v2 fixed allowance visibility, but attempt 3 still failed exact response shape; no claim was committed.

Request v3 aligns the repeated clerical pattern through a closed alias map: `text` or `statement`, `support` or `supportAliases`, and `claimKind` or `kind`. Supplying both aliases, an unknown field, or an unknown wrapper is invalid. Code may unwrap only a bare array or the enumerated single keys `claims`, `output`, and `result`. The request's content-free structural example is generated by the parser module and a test requires that the parser accept it.

Authorized attempt 4 returned a bare array and committed four claims. All are provisional with low confidence; no claim uses synthetic support. The complete chain remains synthetic and `limitedEvidence: true` because the synthetic note is a consumed Build input. Build remains a proposal stage pending Challenge and human Adjudicate.

A later reviewed-only envelope removes synthetic and provisional note status but remains `limitedEvidence: true` because it contains one source and silent `ir-06`. Its first exploratory response proposed 20 claims, one per observation. It is intentionally unrecorded: the active synthesis policy has no maximum/key-claim selection rule, and accepting the response would make the short memo standard structurally unattainable. Claim-count and selection bounds require a new versioned contract and focused tests before a fresh invocation.

## Challenge and provisional adjudication

`prepare:synthesis-challenge` writes one request for all committed claims. Each claim receives six independent checks: independence overstatement, hidden single-source dependence, inference beyond cited observations, plausible alternative, contradicting observation, and whether confidence should be lower. The request includes cited observations, fixed derived facts, and contradiction candidates selected by exact IR overlap; it excludes Build confidence rationale.

The response supplies exactly one `challenge` or `none` for every claim-check pair. Challenges require a short rationale and existing aliases. Plausible alternatives are canonically flagged as hypotheses. Strict enumerated aliases and safe wrappers may normalize clerical form; unknown fields, incomplete coverage, new claims, and new evidence are rejected. Low or zero challenge yield is valid and never triggers retry by itself.

When adjudication is not performed, all raised challenges remain open and every affected claim becomes contested. Unchallenged claims remain proposed, not accepted. Challenge metrics record raised per claim and per check plus total challenge rate; upheld-over-raised is `null`.

The first live Challenge invocation answered all 24 matrix cells. Its initial null-or-object shape failed the original parser, then the exact stored response was revalidated under a checksum-bound human authorization after adding only enumerated clerical normalization. The committed result raised 7 of 24 checks: hidden single-source dependence on all four claims and plausible alternatives on three. All four claims are contested, adjudication is not performed, chain status is synthetic, and `limitedEvidence` remains true.

The four uniform single-source findings are calibration data for the checklist, not four established defects. Source dependence is already controller-derived and belongs once in the memo sourcing statement rather than inside every claim sentence. Real adjudication is expected to test whether those four challenges add anything beyond that sourcing disclosure. The three hypothesis alternatives are the substantive analytic yield and must survive into competing explanations.

## Constrained writer and publication gate

`memo-standard-v0` is a handwritten provisional standard with eight required sections, a low/moderate/high confidence lexicon, inline claim citations, prohibited confidence patterns, and a 350-word rendered-Markdown limit. It has no historical memo inputs and is itself a publication blocker until curated standards supersede it.

The writer model supplies only statement text, allowed section placement, and existing claim aliases. Code derives citations, contested status, open challenges, confidence and ceiling, the three hypothesis alternatives, all partial and silent gaps, sourcing summary, limitations, information cutoff, and publication state. The BLUF is controller-generated from evidence counts so it always states source count, contested low-confidence claim count, competing-explanation count, and silent-question count.

Deterministic Markdown starts with `NOT FOR PUBLICATION`. Verification checks the final rendered Markdown, not only model prose. The first rendering was invalidated after measuring 391 words against the 350-word standard. Two authorized presentation-only corrections removed duplicate BLUF authority, empty-section filler, and raw challenge IDs from Markdown while retaining exact IDs in JSON. The superseding memo is 342 words.

The final publication gate is blocked by `SYNTHETIC_SOURCE_LINEAGE`, `PROVISIONAL_SOURCE_LINEAGE`, `PROVISIONAL_MEMO_STANDARD`, and `LEGACY_SCOPE_LINEAGE_UNAVAILABLE`. The last blocker is explicit because the approved legacy question has no checksum-bound approved scope artifact; no scope approval was reconstructed or fabricated.

## Publication and supersession

Deterministic memo verification returns `PROVISIONAL_SOURCE_LINEAGE` while any source note in lineage is provisional and `SYNTHETIC_SOURCE_LINEAGE` while any is synthetic. Either chain may run through the publication gate for testing, but approval is unavailable.

When review is later performed for the same snapshot, assembly writes a new reviewed note with `supersedesNoteId` pointing to the provisional note. Downstream rebuilt artifacts carry that superseded note ID. Existing provisional notes, metrics, envelopes, and synthesis artifacts are never edited or deleted.

## Observed lineage enforcement

The first live provisional recording initially failed because `geopolitical-source-assurance-v2.json` had been edited to add `unreviewed` after the NV extract committed its checksum. The command rejected it with `Profile policy checksum does not match its recorded lineage`. Restoring the exact v2 bytes restored checksum `925afa87d72942034760d4bba780a87aaff7de84798058972b1648d8e7f9638c`; future changes moved to v3 and the legacy extract remained valid. This is the first live proof that lineage bindings prevent a builder from changing a governing contract mid-run.

Derivative detection also exposed a missing projection: source notes lacked their own publisher identity. The implementation carries the already validated admission field `source.publisherHost` into `AdmittedSource` and the note; it does not create a new free-form authority.