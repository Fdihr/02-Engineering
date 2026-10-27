# Vestas CTI memorandum: house template

Status: proposed, not approved. Derived from the Memo-Archive (2023–2026). The machine-readable form is [house-standard-v1.proposed.json](../app/src/modules/memo/standards/proposals/house-standard-v1.proposed.json); this page is the analyst-facing view. Historical memos define form and voice only; none of their facts may be reused as evidence (see [memo-workflow.md, Part 8](memo-workflow.md)).

## 1. What the archive shows

26 of the 32 archived files were read. The other six are legacy binary `.doc` files (one a backup copy); they are listed in the proposal JSON as unread. Almost every memo is one to two pages, 450–1,000 words, with a bold title line, a short purpose, a factual situation, a reasoning section and a boxed assessment. Long-form outlooks run to eight pages and carry dated updates.

Three things make the house style recognisable:

1. **The boxed assessment is the product.** Every memo since 2023 ends its reasoning in a text box titled *Assessment*, *Threat Assessment* or *Cyber Threat Assessment*. It holds three to six short judgements and, in alerts, a risk level and suggested actions. Readers who read nothing else read the box.
2. **Everything is brought back to Vestas.** The recurring phrases are "Vestas and Vestas's customers", "Vestas serviced windfarms", "Vestas IT and OT (operational technology controlling wind farms)". A memo without an explicit Vestas implication does not exist in the archive.
3. **Change is stated, even when there is none.** "There is no change in the cyber risk for Vestas and for Vestas's customers", "has risen from 'low' to 'medium'", "The likelihood of … has increased". Negative findings are written out: "No direct threat identified against Vestas", "We have no indications that…".

## 2. Fixed frame (every version)

| Element | Rule | Archive pattern |
| --- | --- | --- |
| Title | `Memorandum – <subject>` with an en dash, bold, one line. Subject names the event or question, not the memo type. | "Memorandum – Threat Warning to Nordic Critical Energy Infrastructure" |
| Date line | `Date: <D Month YYYY>` in the header, plus "This memorandum reflects the assessment as of <D Month YYYY>." when the memo updates an earlier view. | Header "Date: 21/08-2023"; "This memorandum is a reflection on the updated threat assessment as of…" |
| Classification | Footer on every page: Restricted, Confidential or Internal. Use the lowest level that protects the content; open-source reporting is rarely above Confidential. | Confidential (most), Restricted (country or capability specifics) |
| Purpose of this memorandum | One to three sentences. Says what is assessed and for whom. Never a summary of findings, except in Outlook where the bottom line may be stated. | Always the first section |
| Body sections | Version-specific (section 3). Bold run-in headings, no numbering. | Situation / Analysis / Considerations / Conclusions |
| Assessment box | Three to six judgements. Each is one sentence, starts with the estimative phrase or with "Vestas…", and names the time frame where it matters. Placed on page one, beside or directly after the situation. | "Cyber Threat Assessment", "Threat Assessment" |
| Reference(s) | Every external source used, as `Publisher. (Year). Title. URL` or the source title alone for briefings. Never omitted. | China law memo (APA-style list); flash alerts ("Reference: …") |
| Wording used in assessments | Footnote box with the likelihood and confidence lexicon (section 5) whenever estimative language is used. | 2023 memos |

## 3. Versions

Each version is the fixed frame plus a section order. Pick the version from the reader's question, not from the topic.

### 3.1 Flash: threat warning or alert

*Reader question: is this hitting us, and what do we do now?* Audience CISO and ExM. One page, 350–550 words. Exemplars: Nordic threat warning, Polish energy attack, Fortinet vulnerability.

1. **Purpose of this memorandum.** "To alert <audience> regarding <confirmed event> detailed in <authoritative source>, and to <assess / inform about> <secondary finding>."
2. **Situation.** Dated bullets with labelled lead-ins: *Threat actor:*, *Exploitation:*, *Impact:*, *Official status:*, *Current status:*.
3. **Considerations.** Three to five bullets, each tying one fact to Vestas exposure (technology in use, geography, grid coupling, detection gaps). End with the decision the reader owns: "CISO/leadership should determine if Vestas should…".
4. **Cyber Threat Assessment** box: `Risk level: <LOW | MEDIUM | HIGH>`, source credibility in one line, two to four judgements, *Suggested actions:*, and the standard close "We are aware, we are monitoring, we have taken added precautions and will inform if we detect suspicious activity." Use the close only when all four are true.
5. **Reference.**

### 3.2 Update: threat level or posture change

*Reader question: has anything changed for us?* One page. Exemplars: national threat-level change, regional situation updates, India-Pakistan.

1. Date line: "This memorandum reflects the assessment as of <date>."
2. **Purpose of this memorandum.** "This memorandum offers an updated assessment of <threat> relevant to Vestas's risk exposure."
3. **Situation.** What the authority or event changed, with the before and after ("from 'low' to 'medium'") and its definition.
4. **Analysis.** Was the change expected, what trend it reflects, and whether Vestas IT and OT remain potential targets.
5. **Specific points to highlight.** Two to four labelled bullets.
6. **Assessment** box. The first line states the change: "There is no change in the cyber risk for Vestas and Vestas's customers." or "The likelihood of <X> has increased."
7. Optional **Suggested communication to Vestas employees** box (plain language, no threat detail, ends with the reporting channel).

### 3.3 Event: assessment of a single incident or development

*Reader question: what happened, why, and what does it mean for us?* One to two pages. Exemplars: pager supply-chain attack, Baltic cable cuts, rogue hardware in inverters, GNSS jamming, hybrid operations in Norway and Poland.

1. **Purpose of this memorandum.**
2. **Situation** (or **Events** with dated paragraphs when there are several).
3. Optional object section named after the thing examined (**The devices**, **Context**).
4. **Conclusions.** What most likely happened, stated with likelihood.
5. **Considerations.** Alternative explanations ("There are two possible conclusions regarding…"), source credibility, Vestas exposure.
6. Optional **Relevance to cyber security in critical infrastructure.** Parallels to known attack patterns, as features ("A blend of…", "Execution via…", "The capability to…").
7. **Assessment** box, ending with what customers, authorities or peers will expect of Vestas.

### 3.4 Outlook: strategic assessment (living document)

*Reader question: what is likely to happen over the next months or years?* Two to eight pages. Exemplars: "What will Russia do next?", Russian historical background, Russia threat development with scenarios and dated updates.

1. **Purpose of this memorandum.** May carry the bottom line: "Expect <behaviour> over the next <horizon>, with <case> as the base case."
2. **Situation**, as titled sub-themes (bold run-in bullet + paragraph): drivers, current dynamics.
3. **Counterbalance** or **Balancing the picture.** Enduring strengths and constraints that argue against the main line. Mandatory in this version.
4. **What happens next.** Likely path, then the named case with **key indicators** numbered (1), (2), (3).
5. Optional **Scenarios** (two to three), each with the same sub-headings: *Description*, *Relation to the West* (or to the subject), *Change in cyber threat*.
6. **Considerations.** Labelled bullets: *Timing:*, *Method:*, *Focal point:*, *Escalation ladder:*.
7. **Cyber Threat Assessment** box with horizon ("through 2025–2026").
8. **Assessment as of <date>** blocks for later updates, newest first, each opening with "Description of new developments since <previous date>".
9. **Future development.** Three factors to watch, and how each would move the scenarios.
10. Caveat: "This assessment is based on the information available at the time of writing. The situation may change quickly, and the relevance of this assessment may deteriorate."

### 3.5 Policy: regulation and policy implications

*Reader question: what does this policy or law change for Vestas's business?* One to three pages. Exemplars: EU emerging security strategy, China's counter-espionage law.

1. **Purpose of this memorandum.** "This memorandum analyses <policy> and its implications for Vestas."
2. **Events.** Key developments as labelled bullets: *<Instrument> (<date>):* what it does, with figures.
3. **Context.** "Three critical aspects … are relevant to the wind energy sector and Vestas:" each a labelled bullet.
4. **Conclusions and impacts to Vestas and Vestas customers.**
5. **Assessment** box: strategic importance and what Vestas must do to benefit or comply.
6. Optional **Detailed analysis** by theme (definitions and ambiguities, scrutiny, data and compliance, enforcement).
7. **Bias and analytic challenges.** Mandatory when sources are mostly from one side of a dispute.
8. **References.**

### 3.6 Actor: threat actor profile with optional technical appendix

*Reader question: who is this actor, what can they do, and are we a target?* Two pages plus an appendix. Exemplars: Chinese state cyber capability (yearly), Bitter APT with appendix.

Memo: **Government structures and rationale** (or **Overview**), **Capabilities**, **Focus of operations** (each focus as a bold run-in bullet), **Assessment** box with lexicon footnote.

Appendix, a separate document titled `<Actor> Threat Report`: **Overview**, **Notable TTPs** in ATT&CK tactic order (initial access, execution and persistence, privilege escalation, defence evasion, command and control, exfiltration), **Campaign highlights** by period, **Adversary infrastructure insights**, **Incident case studies**, **Indicators of compromise** (defanged), **Detection and response** (monitoring, preventive controls, incident response), **References**.

### 3.7 Business: project or partnership risk

*Reader question: does this decision change our exposure?* One page, sometimes with staff communication. Exemplars: Ukrainian wind project partnership, India operations.

1. Three labelled context lines: *Partnership:*, *Project:*, *Significance:*.
2. **Purpose of this memorandum.**
3. **Specific points of concern.** Labelled bullets with sources.
4. **Assessment** box as labelled judgements: *Current prioritisation:*, *Resource allocation:*, *Operational control:*, each closing with whether there are indications, and how long an operation would take to prepare when relevant.
5. Optional **Suggested communication to Vestas employees.**

## 4. Language

### Voice

- Analytic first-person plural for the team's judgements: "We deem the source to be highly credible", "We have no indications that…". Third person for the company: "Vestas should expect…".
- Short declarative sentences in the situation; reasoning sentences in considerations ("This indicates…", "This aligns with…", "The current situation underlines…").
- Lead with the fact, then the meaning: "<What happened>. <Why it matters to Vestas>."
- Bold run-in labels end with a colon and start each bullet: "Impact: …".
- Spell out abbreviations once: "operational technology (OT)", "Danish Defence Intelligence Service (DDIS)".

### Phrase bank by section

| Section | Phrases from the archive |
| --- | --- |
| Purpose | "This memorandum offers an assessment of…" · "This memo provides an updated assessment of…" · "To alert CISO/ExM regarding…" · "To inform of … and to assess the immediate risk to…" · "To explain what … is likely to do next, and what that means for…" |
| Situation | "On <date>, <actor> <action>." · "<Authority> has officially…" · "There has been no <attack/impact> on…" · "<Actor> demonstrates the capability to…" |
| Analysis and considerations | "The increase was expected, as it reflects…" · "This aligns with…" · "It is not possible to conclude that…" · "There are two possible conclusions regarding…" · "From a <military/operational> perspective…" · "Due to the highly integrated nature of…" |
| Source credibility | "The articles are assessed to be trustworthy even though…" · "We deem the source to be highly credible, based on…" · "Intelligence sources are scarce; however, they suggest…" |
| Assessment | "It is highly likely that…" · "It is likely that…" · "It is unlikely that…" · "It is unknown whether…" · "With limited confidence, it is assessed that…" · "Vestas should expect…" · "No direct threat identified against Vestas." · "There is no change in the cyber risk for Vestas and Vestas's customers." |
| Close | "Vestas monitors the situation closely and will provide guidance if the situation changes." · "We are aware, we are monitoring, we have taken added precautions and will inform if we detect suspicious activity." |

### Vocabulary that carries the house view

Hybrid warfare, below the threshold of war (or of Article 5), grey area, deniable, pre-positioning, escalation control, shaping operation, normalisation, capability and intent, state-sponsored and state-linked actors, proxy groups, critical infrastructure, energy assets, serviced assets, supply chain, Vestas IT and OT.

### Avoid

- Repeating a judgement from an earlier memo unless this memo's evidence supports it again. Several archive boxes reuse the same two sentences ("As a strategic energy technology provider…", "Hybrid operations are expected to increase…").
- Probability words without a time frame, and likelihood without confidence.
- "Confirmed", "proven", "certain" for anything not officially attributed.
- Draft notes, placeholder dates ("DATE", "Current Date") and copied titles left from another memo.
- Mixed date formats. Use "26 October 2026" in text and "D Month YYYY" in the header.

## 5. Assessment lexicon

Likelihood, from the 2023 "Wording used in assessments" box:

| Term | Meaning | Default horizon |
| --- | --- | --- |
| Highly unlikely | There is a minor chance of the effect. | Will not occur within five years |
| Unlikely | There is a little chance of the effect. | May occur within five years |
| Likely | There is a chance of the effect. | May occur within one year |
| Highly likely | There is a high chance of the effect. | Will occur within one year |
| Unknown | Evidence does not allow a judgement. | — |

Confidence, stated separately from likelihood:

| Term | Required support |
| --- | --- |
| High | Sources of multiple epistemologies (different kinds of collection agree) |
| Medium | Independent sources |
| Low | A single source, or sources that depend on each other |

Risk level (Flash only): LOW, MEDIUM, HIGH, describing consequence for Vestas if the threat materialises, not likelihood.

## 6. Building versions from one evidence base

The workbench produces one governed memo (`intelligence-memo-v1`) per synthesis round. A house version is a rendering of that memo, never a rewrite of its claims:

| House element | Governed memo source |
| --- | --- |
| Purpose of this memorandum | Approved scope purpose and audience |
| Situation / Events | Analysis statements built on reported-fact claims, each with its claim citation |
| Context, Considerations, Conclusions | Analysis statements on assessment claims, plus organisational relevance when available |
| Assessment box | BLUF and key judgements, with likelihood term, confidence and horizon |
| "There are two possible conclusions…", Counterbalance | Competing explanations |
| Key indicators, Future development | Indicators |
| "We do not have specific details…" | Gaps and uncertainties |
| Source credibility, References, Bias section | Sourcing summary, source notes and their reliability assessments |
| Suggested actions, staff communication | Not produced by the workflow; written and approved by the analyst |

Rules for every version: one claim, one wording across versions; no version may add a fact absent from the governed memo; confidence and limitations travel with each judgement; the version and memo IDs are printed in the footer.

## 7. Open decisions before approval

1. **Lexicon horizons.** The 2023 lexicon ties likelihood to fixed horizons (one and five years). Keep, or separate likelihood from time frame and state the horizon in each judgement?
2. **Classification levels.** Confirm the set (Internal, Confidential, Restricted) and who may mark Restricted.
3. **Assessment box placement.** The archive floats it beside the situation on page one; the governed memo puts the BLUF first. Pick one reading order for all versions.
4. **Approver.** Who approves this template as the curated memo standard (it replaces the provisional `memo-standard-v1` blocker only after approval and regression review).
