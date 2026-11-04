# Python run dashboard

A local analyst workspace. The workflow remains in the TypeScript app; Python displays run artifacts and delegates explicit analyst actions to existing commands. Entra authentication is an optional dependency, enabled only when valid tenant and client IDs are configured.

From `app/`, start it with:

```powershell
..\.venv\Scripts\python.exe -m dashboard.server runs/qti-2026-q3
```

The server binds to `127.0.0.1:4317` by default. Options: `--run-id`, `--port`, and `--host`. Keep the default localhost binding when viewing provider content.

Run the tests from `app/`:

```powershell
python -m unittest discover -s dashboard -p "test_*.py" -v
```

`design_system.css` is the token and base-style source for this dashboard and future server-rendered pages. `run_view.css` contains only dashboard-specific layout and component rules. `run_view.js` holds the shell, Settings and AI execution controls; `run_panes.js` holds the Brief, Sources, Synthesis, Memo and Audit tabs. Vestas Sans fonts and the white Vestas logo are local assets. Rendering needs no external requests or Python packages; explicit Copilot and collection actions require network access.

The workbench is organised around the analyst's job, not the artefact tree. `journey.py` derives, from persisted artefacts only, six phases (frame, collect, admit evidence, assure sources, synthesise, memo), one ordered work queue (each item says whether you decide, run Copilot or execute deterministic work), a lifecycle per source (lead → pending RSS source list → relevance → admitted → extracted → reviewed → in synthesis; historical retrieval artifacts remain readable), synthesis rounds (build → challenge → adjudicate → key judgements → memo, with superseded rounds marked), and the latest memo with claim → source → quote traces and plain-language publication blockers. The Audit tab keeps the file-inferred artefact board, exceptions and events. Nothing in the projection advances the workflow.

`POST /api/action` supports explicit scope approval and question drafting, final question/requirements approval, bounded Seerist discovery, provider item classification, analyst decisions, local Copilot execution or manual paste-back for each AI stage, opt-in RSS batches, re-preparing a key-judgement or memo-writer request when the automatic chain did not, and `run:next`. Publisher retrieval is CLI-first and requires a separately approved exact-URL plan. Existing Seerist leads remain pending; native captured provider content can still be canonicalized and assessed for relevance. Recording relevance alone never admits evidence. These actions delegate validation and approval recording to TypeScript commands; they do not automate the full analysis loop. A scope-approved run can resume question drafting or complete question approval only against the same approved scope. Existing approvals cannot be overwritten. Partial command failures retain completed artifacts and must be inspected before retrying.

Saved local articles with a completed nonpositive v1 decision can use the
operator-only `py -3 -m dashboard.article_reassessment <approved-authorization.json>`
path from `app/`. This requires a separate checksum-bound production approval
for one v2 call and zero fetches, preserves all original history, and admits
only exact `relevant`. It does not promote diagnostic calibrations or approve
source support. See [the authorization contract](../../02-Contracts/local-article-retrieval.md#explicit-production-reassessment).

The source support form uses `reviewPolicyVersion: "support-review-v2"`:
statements sit beside their quotes, every statement needs an explicit verdict,
and question coverage starts from the model proposal. Explanations are required
only for unsupported/page-chrome verdicts, changed links, or contradictions.
A live checked/exception count keeps progress visible. The explicit bulk action
marks only unchecked statements supported; it never replaces existing concerns
or duplicate choices. Source details, optional concerns and the provisional
skip path are progressively disclosed. Review has a wider reading column and
stacks statement/quote comparisons on small screens. Review recording, source-note
assembly and metrics use the active server's run root, including isolated runs.
A duplicate needs an earlier statement as its target. The optional source
concern follows the note as a caveat. The mandatory reliability questionnaire
is gone; skipped source assessment is explicitly `not-assessed`, not a positive
credibility or independence judgment. Confirmation records rows-only coverage,
not an omission pass or publication approval. The endpoint rejects missing
verdicts and explanations before writing a response. Unversioned submissions
retain the historical full-assessment rules. Existing failed responses are
preserved, not repaired or approved automatically.

Findings puts the current round, fixed evidence inputs, Build/Challenge status,
limitations and the next decision above claim browsing. Current adjudication is
expanded, including a checked Challenge with zero findings; previous rounds and
manual stage controls remain available separately. Before key-judgement selection,
question grouping uses only persisted observation links shared by a claim and
the recorded coverage, never a shared source identity or inferred relevance.
Unlinked claims and evidence gaps remain explicit. Supporting observations and
round records are inspectable without advancing approvals. UI interactions do
not create new execution authority.

**Evidence → Collect a bounded batch** selects one of the two observed feeds,
records a real permission-review reference, and explicitly approves a one-shot
RSS batch policy under the operator's analyst ID. Choose 1-5 sources/relevance
calls (default one). The worker captures once, retains all feed items, processes
eligible in-window feed text in publisher order, uses the Relevance model from
Settings, verifies exact anchors, and admits only `relevant` items under code
control. Partial/uncertain results go to exceptions. The batch stops at admission,
not source assurance. It never schedules polling or fetches linked pages.

Policy, selection, progress, raw feed, model provenance and outcomes remain
inspectable files; failures and interrupted batches are explicit and never
automatically resumed. A lightweight metadata index keeps large feed captures
visible without raising the dashboard's bounded JSON-scan limit. The supplied
catalogue is copied unchanged to `03-Workflow/rss-feed-catalogue.json`; catalogue
membership grants no authority and other feeds are not enabled. Existing
`pending_rss` Seerist routes remain unchanged. See [the executable RSS slice](../../03-Workflow/first-slice.md#current-slice-bounded-rss-capture-no-database).

Local publisher retrieval is a separate CLI-first capability: approve a
one-URL plan, run `collect:article`, then use canonicalization and the existing
relevance transport before `article:admit`. Captured local articles appear in
the source explorer; historical pending lead states remain unchanged. No
Firecrawl or MCP is involved, and no arbitrary permission-reference field is
required. See [the local retrieval contract](../../02-Contracts/local-article-retrieval.md)
for fixed access rules, budget and prompt-injection boundaries.

Settings can store Seerist credentials, Microsoft Entra tenant/application IDs, and an Azure AI Foundry HTTPS endpoint in Windows user environment variables. Once both Entra IDs are configured, the loopback-only dashboard requires tenant-restricted sign-in; first sign-in provisions workbench access for an existing tenant account. Entra accounts remain managed in Microsoft Entra, session data stays in memory, and signing out or restarting the server clears the local session. Configure the Entra app as a public client with `http://localhost` as a redirect URI and delegated `User.Read` permission. The dashboard refuses non-loopback bindings while Entra sign-in is enabled. Foundry model calls are not implemented.

## Local Copilot and model settings

Install the app dependencies with `npm install`. The pinned `@github/copilot-sdk` includes a platform runtime; a separate CLI executable on PATH is not needed to run it. The article parser requires Node.js 22.22.2+ in the 22 line, 24.15.0+ in the 24 line, or 26+. The runtime uses the PC's existing Copilot sign-in and subscription; if it reports an authentication error, sign in through GitHub Copilot CLI locally, then use **Settings → Refresh models**. No API key is stored in this app.

Choose **Settings → Workflow models → Default Copilot model**. The workflow map shows the seven implemented AI stages in order, interleaved with read-only human decisions and deterministic steps. Each AI stage can **Use default model** or have an explicit Copilot model override: research-question drafting, relevance, extraction, Build, Challenge, key judgements and memo writing. The model shown on an AI execution task is its saved, effective model, not an unsaved Settings selection.

Use **Save model settings** to apply the entire configuration, or **Discard changes** to restore the saved selections. Refreshing models retains unsaved selections. Both listing and saving use the live account catalog; an unavailable saved selection is shown explicitly and must be replaced or reset to the default before saving. Generation checks account availability again and never silently falls back to another model or Auto.

Settings are shared by all analyses under the same run root and persist in `<runs-root>/.copilot-settings.json` (ignored with `app/runs` by default):

```json
{
  "model": "account-model-id",
  "stages": {
    "challenge": {
      "provider": "github-copilot-sdk",
      "model": "another-account-model-id"
    }
  }
}
```

Existing files containing only `model` remain valid and supply the default to all stages. Missing stage entries inherit the default; an empty `stages` object resets all overrides. The legacy default-only save action preserves existing overrides. Unknown stages, malformed bindings and unimplemented providers are rejected without replacing the saved configuration. Changes affect future invocations only; invocation receipts retain the stage and actual provider/model alongside the existing request checksum and raw answer. Historical responses and human approval gates are unchanged.

**Azure AI Foundry** is visible as **Not connected**. The existing endpoint configuration is retained, but is not a working model transport or catalog, and no Foundry assignment can be saved or invoked yet.

On **New analysis**, write a thesis and choose **Generate research plan**. Scope defaults are under **Refine scope**. The saved research-planning model generates a central question, 3-6 thesis-linked research questions, their rationales, and 1-2 short Seerist searches per question (at most 10 searches total). Questions and searches are editable together; the old fixed lens templates are no longer used. Changing the thesis or scope invalidates the plan until regenerated.

Generation is draft-only and does not require an analyst ID or grant approval. Requests, raw invocations and validated proposals are retained under `<runs-root>/.research-plan-drafts/plan-<id>/`, excluded from the analysis list. The TypeScript `research-plan.ts` module validates bounded output shape, not semantic thesis alignment or factual accuracy. Invalid output is retained and reported, never replaced with template content.

Choose **Review and approve plan**, then explicitly confirm under your analyst ID to persist scope, question and information-requirement approvals. Collection runs only with **Approve and collect leads**; **Approve without collecting** makes no provider request. **Continue question drafting** restores a scope-approved analysis; changing its approved scope still requires a new analysis ID. The legacy scope-first drafting API and CLI remain supported.

At subsequent AI tasks, **Run with Copilot** starts a fresh, tool-disabled SDK session and feeds the answer through the same deterministic recorder as the manual fallback. The SDK runs in empty mode without plugins, inherited instructions, skills, hooks, MCP servers, file access or permission grants. Runtime setup and generation are time-bounded. Model output never performs an evidence review, source review, adjudication or publication approval.

In **Findings**, **Start bounded Build and Challenge** records an explicit analyst
authorization and runs both ready stages without successive model-execution
clicks. Inputs, target round and effective Settings models are frozen; each
needed stage has at most one generation call. Existing Build/Challenge records
are reused. Status is polled read-only; **Resume bounded synthesis** can use
only remaining authority. Every successful Challenge stops for human
adjudication, including a zero-finding pass. No collection, source review,
key-judgement selection, writing or publication is authorized by this action.

Bounded receipts live under `synthesis/execution/`; the request also has an
exclusive generation-attempt reservation. A saved response or complete Build
can be reused after interruption, but a reserved call without a saved response
is indeterminate and will not be replayed. Failed work retains its exact phase,
error, raw output where received, and earlier valid artifacts. Recovery is an
inspection boundary, not permission to delete receipts or start another round.
Manual Build/Challenge controls cannot bypass this authority. Other source
work remains eligible according to the shared scoped workflow projection.
See the [bounded execution contract](../../02-Contracts/bounded-synthesis-execution.md).

The request directory retains `copilot-invocation-*.json` with raw output, session/model/timestamps and the exact request checksum, including when JSON validation fails. Successful answers also produce the stage's normal response and record artifacts. Only one automatic generation runs per dashboard process at a time; recorded requests cannot be automatically rerun. Keep one dashboard process per run root. Manual copy/paste remains a secondary fallback, honestly recording unknown legacy model identity.

Install the optional sign-in dependency from `app/` before running the dashboard with Entra configured:

```powershell
python -m pip install -r dashboard/requirements.txt
```

Action requests require JSON and a local same-origin host. Keep the localhost binding. Artifact reads remain confined to the selected run, and scans are bounded. Source assurance still uses the documented interim review process; Vestas context ingestion remains future work.


## Navigation and demo run

The page is a hash-routed shell: `#/home` (default), `#/new`, `#/intent`, `#/analysis/evidence`, `#/analysis/findings`, `#/review`, `#/output` and `#/audit`. Home lists the decisions waiting for you and the AI steps ready to run; run windows show the question and an activity strip. The static concepts in `concepts/` use their own frozen `concepts/legacy-run_view.css`.

`make_demo_run.py` builds a synthetic run for viewing and testing the dashboard without Seerist or model calls (plus a sibling `-framed` run so the analysis list has two entries). It refuses to overwrite a directory that lacks its `.demo-run` marker.

```powershell
py -m dashboard.make_demo_run
py -m dashboard.server "$env:TEMP\cti-demo-runs\demo-run" --port 4317
```
