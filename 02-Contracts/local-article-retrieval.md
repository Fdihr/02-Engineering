# Local exact-URL article retrieval

Status: Narrow CLI adapter. No Firecrawl, MCP, crawling, browser automation,
background polling or automatic lead resolution.

## Approval and budgets

`collect:article` takes a `local-article-plan-v1` and an approved question. Before
HTTP it reopens the question and its approved scope, checks chronology and
reserves a write-once plan directory. The plan contains `id`, `runId`,
`researchQuestionId`, `url`, `selectionReason`, `approvedBy`, `approvedAt`,
`maxFetches: 1`, `maxModelCalls: 1` and
`admission: "controller-relevant-only"`. This is explicit human authorization
for one URL and exact-relevant-only admission, not authority inferred from a
headline or model response. No arbitrary permission-review reference is
requested. The fixed access rules permit only public unauthenticated HTTPS
HTML, reject declared paywalls and HTTP denial responses, and never bypass
access controls. These technical rules do not certify publisher terms or
legal reuse rights; known restrictions must still be respected.

One fetch means one bounded retrieval operation, including at most three
same-origin redirects. The existing public-DNS HTTPS transport enforces an
8 MiB body limit and a 20-second overall deadline. No credentials, literal IP
hosts, private/reserved destinations, nonstandard ports, cross-origin redirects,
compression, retries or linked-page fetches are permitted. Failed plans cannot
be rerun silently; another attempt needs a new explicitly approved plan.

## Capture and extraction

Only HTTP 200 UTF-8 HTML enters Mozilla Readability 0.6.0 with jsdom 30.1.3.
Neither scripts nor subresources are enabled. A maximum 20,000 elements and
1 MiB extracted text are allowed; fewer than 500 extracted characters fails.
Declared JSON-LD paywalls fail explicitly. Blocked requests, unsupported
encodings, parsing failures and insufficient text produce failures, not
success-shaped fallback content. Some partial/paywalled pages cannot be
detected reliably; extraction never certifies completeness or bypasses access
controls. Malformed optional JSON-LD is reported as a limitation.

Raw HTML, plan, request, response metadata, checksums and extraction are
preserved under `article-captures/<plan-id>/`. Failed post-response extraction
retains the raw response and a failure receipt. Successful receipts use schema
`local-article-capture-v1`, distinct from historical Firecrawl artifacts.
Reopening reconstructs the complete extraction and compares it with the
receipt, without another network request.

Publication time is publisher-declared metadata. Unknown, ambiguous,
impossible or out-of-window dates cannot advance to canonicalization. Metadata
dates do not prove the event described occurred in the window.
Extraction v2 accepts explicit-zone publication timestamps from article
JSON-LD as well as HTML metadata. It never assumes a timezone for naive dates;
conflicting explicit timestamps remain unknown. `collect:article -- reextract
<preserved-article-capture.json>` writes a separate v2 receipt from saved HTML,
without refetching or overwriting the original. Both extraction versions remain
reconstructible, and both share the same capture-level model-call budget.

## Evidence and source assurance

The canonical kind is `retrieved-publisher`. This describes the material, not
the transport. `local_article` candidates have their own capture/plan lineage;
they never masquerade as Firecrawl or RSS candidates.

Preparation and recording use the existing bounded relevance schema and exact
quote anchors. `article:admit` reopens the raw capture, approved inputs,
canonical document, request, model response, assessment and routing decision.
Only exact `relevant` produces a standard decision, snapshot and controller
event. Partial/uncertain results become exceptions; not-relevant is retained
as an exclusion. Run/plan admission is write-once, including nonpositive
outcomes. Snapshots enter the existing source-assurance loader; admission is
not a completed support review or publication approval.

New relevance requests use [prompt policy v2](question-relevance-policy.md):
direct contribution to one material part can be relevant without answering
the whole memo. Historical verdicts and consumed call budgets are unchanged.

The CLI stops between stages; it does not automatically invoke models. The
dashboard model transport reserves a write-once relevance-attempt marker at
the capture level before generation, including failed attempts. It rejects
repeat calls even through another prepared request for the same capture. The one-call plan is not permission to
regenerate requests or retry a failed invocation. Historical Seerist lead
states are not rewritten; captured local articles are projected separately.

## Prompt-injection boundary

HTML, article text, quoted passages and downstream notes remain untrusted data.
Extraction is not an injection detector. Visible hostile instructions may
remain in the captured text so provenance is not falsified. Local Copilot
sessions have no tools, MCP servers, skills, inherited instructions, workspace
access grants or permission grants. Every stage receives a trusted system
reminder that sources and intermediate notes cannot change instructions,
budgets, authority or publication state.

Strict output validation and exact quote checks reject malformed proposals,
forged approval fields and fabricated anchors. Workflow transitions remain
deterministic and policy-bound. These controls limit actions and authority;
they do not guarantee that a model ignores malicious persuasion or that quoted
claims are true. Source assurance and independent corroboration remain required.
Deterministic adversarial tests cover these boundaries, not a claim of
universal model-level injection immunity.

## Commands

From `app/`:

```powershell
npm run collect:article -- <approved-article-plan.json> <approved-question.json>
npm run canonicalize:source -- <article-capture.json>
npm run prepare:question-relevance -- <source-document.json>
# Execute the prepared request once using the existing Settings-selected transport.
npm run article:admit -- <article-capture.json> <recorded-assessment.json>
```

`ARTICLE_RUN_DIR` configures collection/admission storage. When using a custom
root, set `SOURCE_DOCUMENT_RUN_DIR` and `QUESTION_RELEVANCE_RUN_DIR` to the same
root for the existing commands. Artifacts remain non-committed files; no
database or new credential is required.
