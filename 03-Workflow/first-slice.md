# Implemented Workflow Baseline

Status: Historical Firecrawl retrieval is retired. Bounded RSS batches and a
separate local exact-URL article adapter now reach canonicalization, relevance
and explicitly governed relevant-only admission. Historical leads remain
pending; neither adapter automatically resolves them. Panel 2 exercised
provisional review and then completed a human rows-only support pass. Panel 3
has a bounded key-judgement selection contract and writer v2 path; the reviewed
Build request still needs a fresh response, Challenge, and performed adjudication.

The local adapter uses Node HTTPS, Readability and a non-executing jsdom
document. It needs no scraping service, MCP or key. Its one-source approval,
network limits, immutable artifacts, trust boundary and separate source
identity are defined in [the active contract](../02-Contracts/local-article-retrieval.md).
Admission does not claim completed source assurance. RSS remains the first
live-validated acquisition path; see persisted run receipts for actual outcomes.

Human references below are either one of the four target surfaces (intent, publication, pushed exceptions, governance), compatibility history, or an interim stand-in named in `memo-workflow.md`. Per-source review and manual model transport are not additional permanent human surfaces.

## Implemented shared next-action projection (2026-11-04)

The run-next runner and dashboard now use the same deterministic selector over
their artifact-derived ready-work facts. The projection exposes committed
outcomes, pending decisions and interim checkpoints, scoped blockers, current
stage/status, and one recommended next action without persisting duplicate
workflow state. Exact artifact references can scope a source exception to its
dependent work; unknown scope remains an explicit conservative run blocker.
Publication blockers do not stop unrelated draft work.

This slice does not automate model calls or collection, remove compatibility
admission/support/adjudication checks, or grant publication authority.
Prepared model requests remain inspectable manual checkpoints, and
`run:next` executes only existing deterministic recorders with saved
responses. See [the active contract](../02-Contracts/workflow-projection.md).

## Product boundary

**Current implementation update (2026-11-02):** Firecrawl source retrieval and its Settings key
management have been removed. Seerist collection leads now remain pending for the planned RSS-connected
source list. A subsequent narrow local article adapter now permits explicitly
approved exact-URL publisher fetches without restoring Firecrawl. Existing run artifacts and historical retrieval records are
preserved. The sections below that describe Firecrawl retrieval or retrieved-source re-intake document
the superseded implementation, not the current executable path.

This implementation is the first narrow slice of a general Seerist-plus-OSINT memo tool. Cyber threat intelligence and the CIA Director test question validate the workflow; they do not constrain future memo subjects. The target includes every Seerist endpoint approved for organizational use plus bounded OSINT search, discovery, and retrieval.

The current baseline does not claim that breadth yet. It implements bounded
`/v1/wod` collection and discovery, one-shot capture of two observed RSS feeds,
local exact-URL HTML retrieval, and canonicalization of captured content.
Explicitly approved RSS batches and one-source article plans can admit exact
`relevant` content after deterministic reconstruction. Native Seerist candidate
conversion remains incremental work; historical leads still route to
`pending_rss`. New endpoints and search mechanisms must be added from observed
responses through explicit role mapping, provenance-preserving adapters, and
focused tests. Downstream contracts remain domain-neutral unless a selected
memo profile adds stricter requirements.

The first live local article test captured the selected Kyiv Post page in one
retrieval operation. Its naive HTML date was retained as unknown, then resolved
from an explicit-zone JSON-LD publication date in a separate extraction receipt
without refetching. One Copilot relevance call produced three validated quote
anchors and `partially-relevant`, so the relevant-only policy produced an
exception, not an admitted snapshot or completed assurance. This proved live
retrieval/relevance and the negative gate.

A subsequent explicitly approved production v2 reassessment reused the saved
article with zero fetches and one additional relevance call. It returned
`relevant` and created a distinct approved snapshot. One source-assurance
extraction under the existing v4 profile committed six observations and a
human review package. SDK commit reopening initially rejected the real model
identity; the validator was corrected to use the shared model-identity reader,
and the package was prepared from the preserved commit without another call.
The original capture, v1 verdict, admission result and open exception remain
unchanged. This proves positive live admission and extraction, not completed
source support review, synthesis or publication readiness. The current handoff
is six observations awaiting the human support pass in the Evidence workspace.

The support form now uses a versioned exception-focused contract: compare
statements with quotes, explicitly confirm support, and explain only changed
question links or flagged problems. The mandatory source questionnaire is
replaced by an optional concern. A skipped source assessment remains
`not-assessed` with a downstream caveat; rows-only confirmation is not an
omission pass, credibility endorsement or publication approval. Historical
reviews retain their original contract. The live review is still pending.

The canonical target architecture in `memo-workflow.md` is not a fixed implementation contract. This completed slice remains the implementation baseline until a subsequent slice is accepted.

Implementation structure follows `../01-Architecture/script-architecture.md`.

## Completed slice: Seerist reality-check probe

Manual request input -> one read-only Seerist API call -> unchanged raw artifact -> structural summary -> minimal event log.

The generic probe and representative live requests are working. Observed contracts, response limitations, and workflow implications are recorded in:

- `seerist-probe-findings.md`
- `../01-Architecture/seerist-api-capability-board.svg`

The probe established three provider roles:

1. Evidence candidates: source-linked records with sufficient captured content for human review.
2. Collection leads: news/social summaries, cluster records, hotspots, and Scribe events that remain pending until an approved source workflow is available.
3. Context: country background, risk ratings, Pulse, and future-looking provider assessments that may inform analysis but do not independently corroborate claims.

## Completed slice: approved research intent and bounded collection

A memo scope and its bounded research question must each be explicitly approved by a named human before a production provider operation can run. Relevance therefore originates in approved intent rather than being assigned to returned material after collection.

Run from `app/`:

```powershell
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run prepare:research-question -- <approved-memo-scope.json>
npm run record:research-question-draft -- <research-question-draft-request.json> <copilot-response.json>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
```

The scope records the research thesis alongside purpose and the other scope fields. The question-drafting commands prepare a bounded Copilot request from the complete approved scope and record only a validated proposal; review and explicit human approval remain required. The approval commands write canonical, non-overwritable JSON plus read-only Markdown views. Question approval verifies the exact approved-scope artifact and rejects thesis mismatch, run, version, geography, or time-window expansion. Collection and discovery require scope lineage, validate question approval and chronology, allow only `GET /v1/wod`, and perform no credential lookup or network operation before both human gates succeed.

The dashboard also supports an earlier draft-only planning preview: thesis -> **Generate research plan** -> editable thesis-linked questions paired with Seerist searches -> human review. Scope defaults are progressively disclosed. This uses the research-planning model assignment and pure TypeScript prompt/output validation rather than fixed exposure-lens templates. Draft requests, invocation provenance and validated proposals live outside analysis directories under `.research-plan-drafts/`; no approval or provider operation occurs during generation. Explicit human confirmation still invokes scope, question and requirement approvals before optional collection. Structural validation is not semantic assurance.

The active boundary is `../02-Contracts/research-question-and-provider-operation.md`. The developer probe remains discovery-only and cannot satisfy this contract.

The bounded discovery command supports explicit query variants and limited pagination when one provider operation has insufficient recall. It preserves every raw page, detects changing totals, timestamp inversions, duplicate IDs, contradictory pagination links, malformed pages, and budget exhaustion, then carries those reasons into affected candidate limitations. It deduplicates provider items, scores explicit title and summary term matches, and creates a read-only candidate report. It cannot intake or approve candidates.

Every deduplicated provider item is kept. The versioned source-tier policy `app/src/modules/discovery/policies/source-tiers-v1.json` labels each lead (1 Control Risks analyst report, 2 official, 3 established or specialist media, 4 other or unrated, 5 social) and the report orders leads by tier, then score. `minimumScore` and `maxResults` now set only a `shortlisted` flag; they no longer remove leads. Results record the tier policy ID, version, and checksum. A tier is an ordering aid, not a source-assurance judgement. Multilingual analyst titles and summaries (`{ "en": ... }`) are read in English. Control Risks analyst reports carry their text in the Seerist payload and have no web link, so they cannot yet be pulled through exact-URL retrieval.

## Completed slice: one-item evidence intake

One verified Seerist collection bundle plus selected item -> validate question, operation, manifests, raw checksum, and observed fields -> classify provider role -> deterministic route -> ledger entry.

The implementation proves the boundary between collection leads, context, and potential evidence before source analysis begins.

Run the executable path from `app/`:

```powershell
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
```

The command reconstructs the canonical `/v1/wod` request/response bundle, derives run, endpoint, and receipt time from it, verifies raw and manifest lineage, and selects exactly one feature by provider ID. It writes non-overwritable output under `runs/<runId>/provider-intakes/<operationId>/<providerItemId>/`, appends `runs/intake-events.jsonl`, and prints a narrative-free status summary.

Open `intake-summary.md` in VS Code and use `Ctrl+Shift+V` for the rendered review. The Markdown report has no workflow controls and cannot advance state.

## Completed slice: explicit evidence admission

One persisted intake result -> validate gate eligibility -> explicit human approve, reject, or revise -> admission decision -> approved snapshot only when approved -> append event.

Run from `app/`:

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject|revise> <reviewer-id> <reason> [decision-id]
```

The command confines the intake and raw artifact to its configured run root, hashes the referenced raw artifact, refuses to overwrite an existing decision directory, and writes canonical decision JSON plus a read-only Markdown receipt. An approved decision also writes `approved-evidence-snapshot.json`; rejection and revision requests cannot create that artifact. Initial native Seerist intake remains ineligible; only a checksum-bound candidate created from validated positive question relevance may enter this gate.

Initial command integration used synthetic artifacts in an isolated temporary directory. After that validation, human reviewer `FDIHR` approved the real retrieved-source candidate `nv-candidate-question-relevance-001` as decision `nv-evidence-review-001`.

## Current slice: bounded RSS capture, no database

The version-2 proposed feed catalogue can now be supplied to a one-shot command.
Only the observed RSS 2.0 endpoints for Industrial Cyber and CISA are supported;
other catalogue entries are not silently enabled. No feed is polled by default.
Raw XML, exact inputs, response metadata, parsed items and checksum lineage are
write-once artifacts. There is no database, scheduler, linked-page fetch, model
call or evidence-admission side effect.

Create a plan with the actual approved run/question IDs and a real permission
review reference. This operator confirmation is not inferred from feed access:

```json
{
  "schemaVersion": "rss-collection-plan-v1",
  "id": "rss-batch-001",
  "runId": "<approved-run-id>",
  "researchQuestionId": "<approved-question-id>",
  "feedId": "industrial-cyber",
  "selectionReason": "<why this feed fits the approved question>",
  "permission": {
    "reference": "<permission or retention review reference>",
    "confirmedBy": "<operator-id>",
    "confirmedAt": "<ISO-8601 confirmation time>"
  }
}
```

Run from `app/`, passing the actual catalogue path (it may be outside the run
root; an exact snapshot is preserved inside the capture):

```powershell
npm run collect:rss -- <rss-plan.json> <rss-feed-catalogue.json> <approved-research-question.json>
npm run match:rss -- <rss-capture.json> <seerist-intake-result.json>
npm run canonicalize:source -- <rss-capture.json> <rss-item-id>
npm run prepare:question-relevance -- <source-document.json>
```

Inspect `rss-capture.json` to select an item ID. Description-only entries remain
leads even when long. Only explicit content text, a valid article URL and an
unambiguous in-window publication date allow canonicalization. Content is
untrusted feed text, not certified full article content. Matching verifies an
existing Seerist lead and uses exact article URLs only; missing and conflicting
matches remain unresolved. Match receipts never rewrite the lead's route.

The default root is `app/runs/`. Set `RSS_RUN_DIR` for capture and matching;
when using a custom root also set `SOURCE_DOCUMENT_RUN_DIR` and
`QUESTION_RELEVANCE_RUN_DIR` to that same root for downstream commands.
Intent artifacts and referenced scope must reside under the configured root.
The approved question and scope are reopened and checked before any HTTP call.

The transport uses an 8 MiB response cap, a 20-second total timeout, at most
three same-origin HTTPS redirects, public-address validation at connection
time, and safe UTF-8 XML parsing without DTDs or custom/external entities. Live structural checks
observed content-bearing Industrial Cyber entries and description-only CISA
entries; these checks establish neither usage rights nor source assurance.
Details and limits are in `../02-Contracts/rss-capture.md`.

### Remaining acquisition boundary

Collection leads retain their provider metadata and approved-question lineage,
but route to `pending_rss`. The dashboard displays "Waiting for RSS" and
does not offer publisher-page retrieval. The Evidence page now offers an
on-demand RSS batch: one observed feed, an explicit permission reference and
versioned policy approval, and a budget of 1-5 eligible sources/relevance calls.
Code reopens capture, canonical document, question, model request/response,
assessment and exact anchors before writing an RSS candidate and standard
approved snapshot for an exactly `relevant` verdict. Partial/uncertain results
remain exceptions; exclusions and deferred sources remain inspectable.

The batch stops at admission. Existing source assurance remains separate.
There is no polling, database or automatic retry; an interrupted batch is
reported as interrupted. File artifacts remain authoritative and replaying
admission for the same run/item is rejected. For terminal use, the narrow
commands are `npm run rss:batch -- prepare <capture> <policy>` and
`npm run rss:batch -- admit <selection> <recorded-assessment>`.

These controls do not clear historical Seerist blockers or infer article
identity. No replacement retrieval provider is silently substituted, and a
current feed cannot be assumed to recover retrospective leads.

The former retrieval and candidate-conversion commands, HTTP client, and
credential configuration have been removed. Stored historical results remain
readable through the canonicalization and evidence compatibility readers.
`../02-Contracts/source-content-retrieval.md` describes historical artifacts only.

## Implemented slice: canonical source document and anchors

One resolved retrieval result or verified native Seerist intake -> invoke its narrow source adapter -> losslessly normalize line endings -> deterministic content-addressed segments -> exact UTF-8 source anchors.

Run from `app/`:

```powershell
npm run canonicalize:source -- <source-retrieval-result.json|seerist-intake-result.json>
```

The shared pure module is provider-neutral. Historical retrieval artifacts and Seerist-specific structures end in narrow adapters; later relevance and assurance modules depend only on canonical `SourceDocument` and `SourceAnchor` types. The command confines input and native raw references to the run root, verifies checksums, writes one non-overwritable document, and emits controller-attributed events without source text. Reading a historical retrieval artifact does not make a provider request.

The active boundary is `../02-Contracts/source-document-and-anchors.md`. Focused tests cover deterministic reproduction, CRLF normalization, multilingual UTF-8 offsets, long-block splitting, altered-document and anchor rejection, both source adapters, path confinement, and non-overwrite behavior. The real NV retrieval produced a validated 76-segment document with an exact source-artifact checksum match.

## Implemented slice: Copilot PoC question relevance

One verified canonical source plus its exact approved question -> immutable model-ready request -> one local Copilot SDK or manual paste-back JSON proposal -> deterministic schema, lineage, provenance, and exact-anchor validation -> controller-derived routing decision.

Run from `app/`:

```powershell
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
```

The model-ready request contains the complete canonical source, fixed untrusted-content instructions, the approved question, provenance, limitations, verdict definitions, and exact output requirements. Response validation rejects altered quotes, mismatched questions or requests, unknown prompt policy, duplicate anchors, positive verdicts without support, and extra model-authored fields. Only deterministic code derives `evidence_candidate_proposal`, `audited_exclusion`, or `human_exception_triage`; no route can produce approval.

New requests use prompt policy v2: direct material contribution to one part of
the question can be `relevant`; incomplete overall memo coverage is recorded
as a limitation. Indirect read-across remains `partially-relevant`, not
automatic admission. Existing v1 requests and assessments reconstruct unchanged;
old verdicts, exceptions and consumed budgets are not reset. See
`../02-Contracts/question-relevance-policy.md`. One separately authorized v2
calibration reused the saved Kyiv Post source with no refetch and returned
`relevant` with three validated exact anchors. It treated the factory plot as
direct narrow evidence and missing wider coverage as limitations. This was
diagnostic only: the original v1 verdict, exception and consumed budget were
preserved, and no snapshot or source-assurance result was created.

The dashboard's Settings workflow map lists the locally authenticated Copilot account's models and saves a shared default plus optional per-stage overrides for all seven implemented AI stages. Human gates and deterministic steps remain read-only in the map. Legacy single-model settings remain the default for every stage. Foundry is visibly not connected; its endpoint setting does not enable model calls. **Run with Copilot** resolves the stage's saved model, invokes a fresh, tool-disabled SDK session, preserves raw output and explicit stage/session/model provenance, then runs the existing recorder. It does not approve evidence or execute the entire analysis loop. Manual paste-back remains supported with `github-copilot-vscode` / `not-exposed-by-host`; SDK responses record `github-copilot-sdk` with the explicit selected model. See `../app/dashboard/README.md` for local setup, draft-only planning previews, failure handling and retained human gates.

The real NV source completed this path as `partially-relevant` with three exact anchors and destination `evidence_candidate_proposal / pending_human_review`. It reports the visit, possible purposes, Ratcliffe-to-Bortnikov participation, and Baltic hybrid-threat implications, but does not establish that the visit occurred specifically on 27 August or provide explicit cyber implications.

## Historical slice: positive-assessment candidate conversion (retired)

RSS now has its own observed adapter and explicit bounded batch policy; see
`../02-Contracts/rss-capture.md`. The historical conversion below remains retired.

One resolved retrieval result + its verified source-lead lineage + one validated positive question-relevance assessment -> one new evidence candidate routed to pending policy admission or compatibility review.

The former re-intake command and automatic conversion have been removed.
The following describes historical candidates, not an executable current path.

The command confines every referenced artifact to the run root; verifies source-intake, retrieval-request, raw-response, retrieval-result, canonical-document, assessment, decision, model-request, and model-response checksums; reconstructs the assessment and exact anchors; and writes a non-overwritable canonical intake plus a body-free receipt. `not-relevant` and `uncertain` assessments cannot become candidates. It cannot approve itself; in compatibility `human` mode, `npm run review:evidence` remains a separate explicit decision and interim stand-in, not a fifth target human surface.

The evidence gate validates the exact positive-assessment shape, reopens and hashes the persisted assessment and decision, preserves assessment and retrieval lineage in an approved snapshot, and rejects artifact drift or altered relevance routing. Candidate creation events are controller-attributed; evidence decisions remain human-attributed.

The historical boundary is `../02-Contracts/retrieved-source-reintake.md`. Retained compatibility tests cover evidence-gate tampering and assessment preservation through approval. On 2026-09-01, the live NV assessment was converted into candidate `nv-candidate-question-relevance-001` and subsequently approved by `FDIHR` as decision `nv-evidence-review-001`.

## Implemented slice: Panel 2 Extract under a deterministic controller

One approved evidence snapshot + approved information requirements + versioned profile policy -> immutable model-ready request -> one local Copilot SDK or manual paste-back proposal -> deterministic checks, exact-span location, and anchor validation -> committed extraction.

Run from `app/`:

```powershell
npm run approve:requirements -- <requirements-proposal.json> <approved-research-question.json> <reviewer-id>
npm run prepare:assurance-extract -- <approved-evidence-snapshot.json> <approved-requirements.json> <profile-policy.json> [attempt-authorisation.json]
npm run record:assurance-extract -- <extract-request.json> <copilot-response.json>
npm run authorise:assurance-attempt -- <extract-failed.json> <profile-policy.json> <reviewer-id> <reason> [--revalidates=<copilot-response.json>]
npm run prepare:assurance-review -- <extract-commit.json>
npm run record:assurance-review -- <review-package.json> <review-response.json>
npm run assemble:assurance -- <approved-evidence-snapshot.json> <extract-commit.json> <review-record.json>
npm run measure:assurance -- <source-note.json> <extract-stage-directory> <review-record.json>
```

Panel 2 consumes Panel 1 artifacts without altering them. It reopens the canonical source document referenced by the approved snapshot, verifies its checksum, and reuses `validateSourceDocument` and `validateSourceAnchor` as the final authority on every anchor. It introduces no second normalization, no second document hash, and no character-offset anchors.

### Measured failure classes and code-side responses

The first live NV extraction produced three distinct failure classes across four attempts. Each was answered by removing work from the model rather than by relaxing a check.

| Stage | Attempt | Failures | Class |
| --- | --- | --- | --- |
| `extract` | 1 | E2 x2, E3 x14 | Quote transcription |
| `extract` | 2 | E3 x15 | Quote transcription |
| `extract-2` | 1 | E2 x2 | Segment identifier transcription |
| `extract-2` | 2 | E6 x1 | Coverage bookkeeping |
| `extract-3` | 1 | none | Committed |

Diagnosis and response for each class:

1. Quote transcription. Every failing quote matched the canonical segment after markdown escapes, whitespace runs, quotation variants, and NFC were accounted for; the model selected correct spans but substituted lookalike codepoints. The response is an exact-span locator governed by a closed, versioned rule list. Normalization is used only to find the span; the stored anchor is always the segment's own bytes, and Panel 1's validator still runs on the result. Every observation records `proposedQuote` and `matchedVia`, so transcription drift stays measurable instead of invisible.
2. Segment identifier transcription. Hash-like segment ids were fabricated on the first attempt of both stage runs. The prompt now addresses segments by short ordinal alias and code maps the alias back to the canonical id. The alias is a locator hint; the anchor is unchanged.
3. Coverage bookkeeping. The single E6 failure was one missing index in a declared list of eleven, on a requirement whose observations were correctly tagged. `observationIndexes` was a hand-maintained copy of data the model had already supplied through `irIds`, so it was removed from the contract. Code derives the coverage set from the tags, and E6 keeps its exact semantics against the derived set: `silent` requires no tagged observation, and every other disposition requires at least one. A failure there now means the model's tags contradict its own dispositions, which is a judgement error worth failing on.

The generalized rule taken from this: ask the model only for judgement, and derive every bookkeeping field in code.

Three failure classes, three code-side fixes, zero loosening of an invariant. Quote fidelity failures fell from 15 to 0 once the locator landed and stayed at 0 afterwards.

On the committed extraction, 4 of 20 quotes were byte-exact as transcribed and 16 required the locator, with whitespace reflow needed on all 16 and quotation-variant substitution on 7. Transcription drift is therefore the normal case rather than the exception, which makes the locator a permanent component and not a patch for one source. Models normalize whitespace and quotation marks even on clean text, and markdown-converted captures always carry escape artifacts, so the component is required regardless of any later improvement to Panel 1 canonicalization.

### Re-validation boundary

The committed extraction is the stored `extract-2` attempt 2 proposal re-validated under the corrected contract, with no new model invocation. This is permitted only under an explicit rule recorded in the authorisation artifact:

> Re-validation of a stored proposal is permitted only when the contract change removes a bookkeeping requirement or makes a locator more tolerant, never when it alters an invariant on a judgement field.

Both changes qualify. The authorisation names the superseded stage, its failure artifact checksum, and the originating model invocation. Failed stages are retained unchanged; the authorised stage supersedes them in lineage rather than replacing them. This is what separates a principled contract correction from selecting rules until an output passes.

Attempt budget stays at two. Every attempt corrected what was reported and introduced no new failure, so retries were effective; the constraint was the number of failure classes, not the budget.

### Requirement tagging criterion

An observation earns an information-requirement tag only if it answers that requirement as written, not because it is about the same topic. Human review can remove a tag through `correctedIrIds` on a supported verdict; the proposed `irIds` stay in the commit and in the note, and coverage is derived from the corrected set.

This keeps two different errors apart. A quote that does not support its text is a support failure. A supported observation attached to a requirement it does not answer is a tagging failure. Without the distinction, over-tagging would either inflate the coverage graph passed to Panel 3 or be absorbed into the support-failure rate and drive the wrong next slice. `tagPrecision` records tags proposed, tags removed, and the resulting precision. It is an added measurement and changes no pre-registered threshold.

### Boundaries this slice preserves
1. The model never sets an anchor, an observation id, or a coverage set.
2. Retry feedback carries check ids, counts, and fixed rules only, never prior output or source content.
3. `silent` is a first-class success; no check fails because a requirement is unmet by the source.
4. Claim kind and attribution never upgrade anywhere in Panel 2.
5. Every canonical artifact is write-once, and no command advances state from a model response.
6. Events record ids, checksums, and typed errors, never prompts, quotes, or observation text.

The active contract version and the exact check definitions an attempt was judged under are recorded in the request, the commit, and the source note lineage.

### Provisional human review boundary

The reviewer elected to defer the reduced rows-only pass because its interaction cost was disproportionate at this POC stage. `supportPass: "not-performed"` now records that state without verdicts, dispositions, human observations, or assessment. Code derives `unreviewed` entries for all package observations, retains model dispositions with null human and final dispositions, and writes a provisional note with an explicit caveat.

The NV provisional note contains 19 in-scope observations and one out-of-IR observation. Its five human-review measurements are null with unmeasured warnings. The Build envelope accepts provisional notes, propagates their caveats, marks downstream claims provisional, and derives `limitedEvidence`; deterministic publication verification rejects provisional lineage. A later reviewed note supersedes rather than edits the provisional note, and rebuilt downstream artifacts carry `supersedesNoteId`.

### Completed human support pass

Reviewer `FDIHR` later marked all 20 rows supported, removed no tags, approved covered/partial/silent dispositions for all six requirements, and supplied a source assessment with machine translation disclosed. The reviewed note records direct access, established track record, mixed New York Times/WSJ dependency, and supersedes the provisional note. Reviewed metrics are support failure `0`, chrome `0`, tag precision `1`, and disposition mismatches `0`; omission and underclaims remain null in rows-only mode.

The first reviewed-only Build preparation correctly removed synthetic lineage and retained `limitedEvidence: true` for one-source evidence and silent `ir-06`. Its exploratory model invocation proposed all 20 observations as separate claims. That response was not recorded because no active policy bounds key-claim count or selection; committing it would make the short writer contract impossible. Add that deterministic bound before the next reviewed Build invocation.

Synthetic notes now use a distinct non-upgradable `synthetic` status. Any chain consuming one is synthetic, every supported claim is marked synthetic and provisional, and publication fails with `SYNTHETIC_SOURCE_LINEAGE`. The human review policy remains the four human verdicts; `unreviewed` is a separately enumerated controller state.

The first live Build request used 21 note-qualified aliases. Attempt 1 failed exact response-schema validation. Diagnosis of attempt 2 found no table bug: its reported-fact claims used permitted direct-event observations, while claim 4 omitted `attributedTo` for relayed statements and claim 6 upgraded attributed statements to `analytic-assessment` without `analyticRationale`. Stored-proposal revalidation was forbidden.

Human-authorized request v2 rendered each alias's permitted kinds and single-support confidence ceilings, exact response-shape text, and a content-free structural example. Attempt 3 respected kind and confidence allowances but still renamed `statement` and `supportAliases` and omitted required arrays, so it failed `INVALID_BUILD_RESPONSE`. All three responses and two diagnoses remain immutable ignored artifacts; content-free events bind the failures and diagnoses, and no Build record or claim was committed.

Diagnosis showed attempts 1 and 3 shared the clerical `text` and `support` field pattern. Request v3 moved that work into a strict enumerated alias parser, allowed only known single-key wrappers or a bare array, removed assumptions and alternatives from Build, and generated its structural example from the accepted parser shape. Unknown fields, alias collisions, and semantic substitutions still fail.

Human-authorized attempt 4 committed four Build claims. Every claim is provisional and capped at low confidence. None uses the synthetic note as support, but consuming that note keeps the overall chain `reviewStatus: "synthetic"`; `limitedEvidence` is true. Diagnosis 003 records the resolved clerical failure class. Build claims remain proposals for Challenge and human Adjudicate, not sealed facts.

One Challenge invocation then applied six checks independently to all four claims. The response contained all 24 answers but represented verdicts as `challenge: null|object`; the original parser rejected it. Diagnosis and human authorization permitted only that enumerated clerical normalization, after which the unchanged response committed. Seven challenges were raised: four hidden single-source-dependence findings and three plausible alternatives. Every claim is contested, all seven challenges remain open, adjudication status is `not-performed`, upheld-over-raised is null, review status is synthetic, and `limitedEvidence` remains true.

The constrained writer then consumed only the checksum-bound Build, Challenge, provisional adjudication, approved question, and handwritten `memo-standard-v0`. The model supplied one BLUF placement and four claim-linked key-judgment texts. Code produced the final BLUF counts, citations, contested/open status, low confidence, three hypothesis alternatives, three gaps including silent `ir-06`, sourcing summary, limitations, and information cutoff.

Final-Markdown verification exposed and corrected a deterministic length defect without changing the stored writer response. The first 391-word rendering is retained and explicitly invalidated; the superseding memo is 342 words and records `supersedesMemoId`. Content checks pass, but publication is blocked by synthetic lineage, provisional evidence, the v0 standard, and unavailable approved-scope lineage. This blocked gate is the intended end state of the provisional POC.

### First observed lineage-enforcement proof

During the provisional run, an edit to the checksum-bound v2 profile policy caused `record:assurance-review` to reject the run before assembly. Restoring the exact v2 bytes restored its committed checksum, while future policy behavior moved to v3. This demonstrated on a real artifact chain that policy lineage prevents governing rules from changing mid-run.

Panel 3 also required publisher identity for derivative reporting. Rather than introduce a new manual field, the note now projects the already validated `source.publisherHost` from evidence admission.

### Open Panel 1 finding

The admitted NV canonical segments carry markdown escape artifacts and internal newlines from the Firecrawl markdown capture. That is a Panel 1 canonicalization concern and is recorded as backlog only: changing it would produce a different canonical document and require a new admission decision. The locator is required regardless, because models normalize whitespace and quotation marks even on clean text.

## KISS boundary

Keep this slice single-item, local, deterministic, and function-first.

Do not add:

1. Chat or another UI.
2. General AI classification or query generation beyond the accepted one-source question-relevance assessment.
3. Crawling, search, agentic extraction, browser actions, or multi-URL retrieval.
4. Find, Sweep, Judge, or Write agents.
5. Batch orchestration.
6. A database or plugin framework.
7. Automatic, model-triggered, or narrative-triggered evidence approval.
8. Hash chaining or sealed manifests.

## Completion evidence

1. One manually selected item from a saved probe response reaches the existing `validate -> route -> ledger` flow.
2. Classification uses endpoint, source type, provenance fields, and observed content depth rather than narrative wording.
3. A collection lead cannot be marked claim-eligible or approved.
4. A context item cannot count as independent claim corroboration.
5. A potential evidence item records provider ID, retrieval time, raw artifact reference, content completeness, and available source links or references.
6. No intake code path advances an item to `approved`; only the separate command with explicit reviewer input can create an approved snapshot.
7. Expected failures use `Result<T, E>` with literal error types.
8. Focused tests cover one accepted item, one invalid item, and the no-automatic-approval invariant.
9. Unapproved, late-approved, or mismatched research intent cannot produce a Seerist operation.
10. `npm test`, `npm run typecheck`, and `npm run build` pass.

## Inputs and constraints

1. Use only fields demonstrated in `seerist-probe-findings.md`.
2. Keep raw provider responses in the ignored local run folder until retention rules are confirmed.
3. Do not commit copied provider narrative content as a test fixture without explicit permission.
4. Treat provider taxonomies and source discriminators as open values.
5. Record local retrieval time when provider freshness is absent or ambiguous.

## What this slice established

1. The stable selected-item envelope is provider, endpoint, local retrieval time, raw artifact reference, and an unknown item object.
2. Endpoint, open source discriminator, and structural content depth are sufficient for this first bounded role decision.
3. Analyst records with captured content enter canonicalization and question relevance; summary-only news remains a collection lead.
4. Country-background material remains context even when returned through the aggregate `/v1/wod` endpoint.
5. Observed provider IDs may be numeric and are normalized to strings.
6. The active cross-module baseline is `../02-Contracts/provider-item-role-and-provenance.md`.
7. Evidence admission reconstructs persisted JSON, requires reviewer identity and reason, binds approval to the raw artifact SHA-256, and records a human-attributed event.
8. A rejected decision creates no source-assurance input.
9. The active compatibility evidence-gate contract is `../02-Contracts/evidence-admission.md`.
10. Research-question approval is a separate explicit human transition that precedes provider access.
11. Approved artifacts are grouped by research run and bound by external SHA-256 when consumed.
12. The earlier `intake-smoke-analysis-003` artifact is non-admissible because it predates mandatory research-question lineage.
13. One approved four-query, sixteen-page Seerist discovery surfaced 50 unique source URLs across 22 clusters for the CIA Director Moscow question.
14. Supported-API candidates provided close title-level counterparts for all eight human-supplied AskAnna citations, without depending on AskAnna's unsupported retrieval API.
15. Collection leads remain pending for the RSS-connected source list; no publisher-page retrieval or automatic retrieved-source candidate conversion runs.
16. Retrieved-source candidate conversion accepts only a validated positive assessment and verifies complete retrieval, canonical-document, model-request, model-response, assessment, and decision lineage.
17. AI remains responsible only for a typed, source-grounded relevance proposal; deterministic code creates the pending route and admits only under an approved controller policy, while existing policies retain the compatibility human path.
18. Scalability must preserve the complete source and mandatory `Find -> Sweep -> Judge -> Write`; reuse, per-source isolation, checksum deduplication, and bounded scheduling provide throughput without lowering the final intelligence standard.
19. Canonical source documents give retrieved and provider-captured content one downstream shape; a new source mechanism needs only a narrow adapter when the common contract remains satisfied.
20. Human reviewer `FDIHR` approved real NV candidate `nv-candidate-question-relevance-001` in decision `nv-evidence-review-001`; snapshot `snapshot-nv-evidence-review-001` is the first real input ready for source assurance.

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `../00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `poc-to-workflow-intake.md`

Current cross-session context: `../HANDOFF.md`
