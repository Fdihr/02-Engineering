# Question relevance policy

Status: Prompt policy v2; source-level contribution is distinct from memo coverage.

## Reason for the change

Prompt v1 described a source that answers a bounded part of a question as
`partially-relevant`. RSS and local-article controller policies admit only
exact `relevant`. Combined, these rules could penalize direct but narrow
evidence merely because one article did not complete a broad memo question.
The live Polish sabotage article's rationale cited missing supply-chain,
operational and severity coverage as reasons for partial relevance.

V2 corrects the prompt definitions, not the admission allowlist. It does not
reclassify historical evidence or assert a preferred verdict for any live
source. Exact anchors, explicit approvals, budgets and source assurance remain
required.

## Intended distinctions

| Case under a broad Polish manufacturing threat question | Intended verdict | Policy consequence |
| --- | --- | --- |
| In-window reporting explicitly describing an alleged arson plot against a Polish factory | Relevant to one material part; unanswered categories are limitations | Eligible for existing exact-relevant-only admission after validation |
| European supermarket OT incidents with no explicit Polish manufacturing connection | Partially relevant indirect context; applying it locally requires inference | Exception, not automatic admission |
| Generic global OT vendor announcement without a material question-specific connection | Not relevant; shared keywords are insufficient | Audited exclusion |
| Missing content prevents a reliable source-question relationship assessment | Uncertain | Exception |

Neither direct relevance nor exact quoting establishes factual truth,
independent corroboration, event severity or completed support review.
Publication date alone does not establish that the reported event is in scope.
Sources reporting allegations must retain attribution and uncertainty.
Coverage and gaps are assessed across admitted, assured sources; a narrow
source need not supply all threat categories or a complete likelihood estimate.

## Versioning and validation

New requests use `question-relevance-prompt-v2`. The complete fixed policy and
version participate in request reconstruction and identity. V1 requests and
model provenance remain readable and reconstruct using the unchanged v1
definitions. Relabelling an old request or substituting its policy fails
validation. Assessment and request schemas otherwise remain unchanged.

Both positive verdicts still route to an evidence-candidate proposal, not
approval. RSS/article controller admission still accepts only exact
`relevant`; partial results remain exceptions. Compatibility human review is
unchanged. A prompt change is not authorization for another invocation:
consumed source-call budgets and existing exceptions stay in force.

Tests cover fixed policy text, version separation, reconstruction, grounded
fixture proposals and existing end-to-end admission/exclusion behavior. These
are deterministic contract tests, not evidence that a model will classify
every case correctly. Live v2 calibration needs a separately approved bounded
call and must retain the actual verdict rather than force a positive outcome.

## Bounded live calibration

On 2026-11-03 the user authorized one additional diagnostic relevance call
using the saved Kyiv Post article, with zero fetches and no authority to admit
evidence or supersede the original assessment. The Settings-selected Copilot
model returned `relevant` with three validated exact anchors. Its rationale
recognized the alleged factory plot as a direct narrow contribution while
retaining missing coverage, attribution and corroboration caveats.

Write-once authorization, request, rendered prompt, reserved attempt,
invocation, response and deterministic validation are retained in the
non-committed run folder
`app/runs/_relevance-calibrations/poland-article-v2-20261103-01/`.
Checksums confirmed that the original request, response, assessment, captures,
raw HTML, consumed attempt and admission result were unchanged. No recorder
or admission command was invoked; the diagnostic routing output was not applied
to the workflow. The original exception remains open. This proves one live
classification and anchor-validation case, not general model accuracy,
positive production admission, source assurance or publication readiness.
