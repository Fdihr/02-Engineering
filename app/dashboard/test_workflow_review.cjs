const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

function harness(journey, pane = 'memo', { pipeline = null, memoReview = null, memoRevision = null, drafts = {}, published = [], markdown = '' } = {}) {
  const dom = new JSDOM('<main><div id="pane-memo"></div><div id="pane-audit"></div></main>', { runScripts: 'outside-only' });
  const { document, Event } = dom.window;
  const actions = [];
  let sequence = 0;
  const C = {
    state: {
      runId: 'fixture',
      view: { pipeline, memoReview, memoRevision, published },
      drafts,
      expanded: {},
      openRounds: {},
      selectedClaim: ''
    },
    panes: {},
    journey: () => journey,
    humanise: value => String(value || '').replace(/[-_]/g, ' '),
    capital: value => value ? value.charAt(0).toUpperCase() + value.slice(1) : '',
    when: value => value || '',
    plural: (n, word) => n + ' ' + word + (n === 1 ? '' : 's'),
    el: (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    },
    add: (parent, ...children) => {
      children.filter(child => child !== null && child !== undefined && child !== false).forEach(child => {
        parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
      return parent;
    },
    analyst: () => 'TESTER',
    sectionHead: (title, tag = 'h2', extra) => C.add(C.el('div', 'section-head'), C.el(tag, null, title), extra),
    actButton: (title, cls, callback, needsAnalyst, disabled) => {
      const button = C.el('button', cls, title);
      button.disabled = Boolean(disabled);
      button.addEventListener('click', callback);
      return button;
    },
    linkButton: (title, callback) => C.actButton(title, 'btn-link', callback),
    artifactLink: (ref, title) => C.el('button', 'artifact-link', title),
    externalLink: (ref, label) => {
      const a = C.el('a', 'ext-link', label || ref);
      a.href = ref;
      return a;
    },
    statusMark: (status, label) => C.el('span', 'status', label),
    lifecycle: steps => C.add(C.el('ol', 'lifecycle'), ...steps.map(s => C.el('li', s.state, s.label))),
    kv: () => C.el('dl'),
    field: (label, input) => {
      input.id = input.id || 'f-' + (++sequence);
      const lab = C.el('label', null, label);
      lab.htmlFor = input.id;
      return C.add(C.el('div', 'field'), lab, input);
    },
    bindDraft: (input, key, fallback) => {
      if (input.type === 'checkbox') input.checked = key in drafts ? drafts[key] === '1' : Boolean(fallback);
      else input.value = key in drafts ? drafts[key] : fallback || '';
      const save = () => { drafts[key] = input.type === 'checkbox' ? (input.checked ? '1' : '') : input.value; };
      input.addEventListener('input', save);
      input.addEventListener('change', save);
      return input;
    },
    selectInput: (options, key, fallback) => {
      const select = C.el('select');
      options.forEach(([value, label]) => {
        const option = C.el('option', null, label);
        option.value = value;
        select.appendChild(option);
      });
      return C.bindDraft(select, key, fallback);
    },
    textInput: (key, fallback, placeholder, multiline) => C.bindDraft(C.el(multiline ? 'textarea' : 'input'), key, fallback),
    postAction: payload => { actions.push(payload); return Promise.resolve({ ok: true }); },
    dropDrafts() {},
    go() {},
    navigate: route => actions.push({ route }),
    replace: (host, child) => host.replaceChildren(child),
    render: () => C.panes[pane]()
  };
  dom.window.CTI = C;
  dom.window.fetch = () => Promise.resolve({ ok: Boolean(markdown), text: async () => markdown });
  dom.window.eval(fs.readFileSync(path.join(__dirname, 'run_panes.js'), 'utf8'));
  C.render();
  return {
    C,
    actions,
    document,
    flush: async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); },
    button: text => [...document.querySelectorAll('button')].find(b => b.textContent === text),
    change: (input, value) => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); }
  };
}

const SAMPLE_MARKDOWN = [
  '# Poland Sabotage Readiness Memo',
  '',
  '## Bottom Line Up Front',
  'Poland heightened police readiness amid sabotage warnings.',
  '',
  '## Key Judgements',
  '- Sabotage alerts prompted heightened readiness. (moderate confidence)',
  '- No confirmed incursion has been disclosed. (low confidence)',
  '',
  '## Analysis',
  'Polish police entered full readiness over sabotage warnings. Authorities have not reported a confirmed incursion.'
].join('\n');

function readyMemoJourney() {
  return {
    brief: {
      scope: { status: 'approved', audience: 'Executive leadership' },
      question: { id: 'rq-1', text: 'Did Poland face sabotage warnings in November 2026?' },
      requirements: [{ irId: 'ir-1', text: 'Official warnings' }],
      framed: true
    },
    sources: [
      { id: 's-1', title: 'Polish police on full readiness', publisher: 'Kyiv Post', origin: 'OSINT', url: 'https://www.kyivpost.com/post/1', state: 'admitted', notePath: 'assurance/note-1.json', current: { label: 'Admitted' } },
      { id: 's-2', title: 'Hybrid Threats Assessment', publisher: 'Seerist', origin: 'Seerist', url: '', state: 'admitted', notePath: 'assurance/note-2.json', current: { label: 'Admitted' } }
    ],
    leads: [],
    rounds: [{ index: 1, current: true, claims: [] }],
    memo: {
      id: 'memo-1',
      relPath: 'memo/memo-1/memo.json',
      version: 1,
      createdAt: '2026-11-04T13:00:00Z',
      markdownPath: 'memo/memo-1/memo.md',
      roundIndex: 1,
      currentRound: 1,
      isCurrent: true,
      blockers: [],
      gate: { status: 'review-ready', humanApprovalAvailable: true },
      verification: { contentVerdict: 'pass', publicationVerdict: 'pass', checks: [{ check: 'required-sections-present', status: 'pass' }] },
      claims: {
        'claim-1': {
          statement: 'Polish police entered full readiness over sabotage warnings.',
          kind: 'reported-fact',
          confidence: 'moderate',
          singleSource: false,
          status: 'accepted',
          challenges: [],
          sources: [{
            noteId: 'note-1',
            title: 'Polish police on full readiness',
            publisher: 'Kyiv Post',
            url: 'https://www.kyivpost.com/post/1',
            reviewStatus: 'recorded',
            quotes: [{ text: 'Polish police entered full readiness from Nov. 2 to 8.', quote: 'Officers entered full readiness from Nov. 2 to 8 over sabotage threats.' }]
          }]
        },
        'claim-2': {
          statement: 'Authorities have not reported a confirmed incursion.',
          kind: 'reported-fact',
          confidence: 'low',
          singleSource: true,
          status: 'contested',
          challenges: [{ id: 'ch-1', check: 'single-source', rationale: 'Absence of reports is weak single-source evidence.', hypothesis: 'Limited disclosure.', decision: 'contested' }],
          sources: [{
            noteId: 'note-2',
            title: 'Hybrid Threats Assessment',
            publisher: 'Seerist',
            url: '',
            reviewStatus: 'recorded',
            quotes: [{ text: 'No confirmed cross-border incursion was reported.', quote: 'Authorities have not reported a confirmed incursion connected to the current warning.' }]
          }]
        }
      },
      bluf: [{ text: 'Poland heightened police readiness amid sabotage warnings.', claimIds: ['claim-1'] }],
      keyJudgments: [
        { text: 'Sabotage alerts prompted heightened readiness.', confidence: 'moderate', claimIds: ['claim-1'] },
        { text: 'No confirmed incursion has been disclosed.', confidence: 'low', claimIds: ['claim-2'] }
      ],
      analysis: [{ text: 'Polish police entered full readiness over sabotage warnings.', claimIds: ['claim-1'] }],
      uncertainties: [],
      indicators: [],
      competing: []
    }
  };
}

function reviewReady() {
  const binding = { artifactRef: 'memo.json', artifactSha256: 'a'.repeat(64) };
  return {
    target: {
      runId: 'fixture',
      memoId: 'memo-1',
      memoVersion: 1,
      memo: binding,
      markdown: binding,
      writer: binding,
      verification: binding,
      gate: binding,
      calibrationPolicy: binding
    },
    decisionStatus: 'pending',
    approvalAvailable: true,
    samples: []
  };
}

test('automated pipeline workspace shows 5-stage progress and triggers run-pipeline before memo exists', () => {
  const journey = {
    brief: {
      scope: { status: 'approved', audience: 'Executive leadership' },
      question: { id: 'rq-1', text: 'Did Poland face sabotage warnings?' },
      requirements: [{ irId: 'ir-1', text: 'Warnings' }],
      framed: true
    },
    sources: [{ id: 's-1', title: 'Kyiv Post article', publisher: 'Kyiv Post', origin: 'OSINT', url: 'https://www.kyivpost.com/post/1', state: 'admitted', current: { label: 'Admitted' } }],
    leads: [{ leadId: 'l-1' }],
    rounds: [],
    memo: null
  };
  const h = harness(journey, 'memo', { pipeline: { status: 'idle', maxExternalArticles: 6 } });
  assert.match(h.document.body.textContent, /Ready to run the automated memo pipeline/);
  assert.equal(h.document.querySelectorAll('.pipeline-stages li').length, 5);
  const runBtn = h.button('Generate memo automatically');
  assert.ok(runBtn);
  runBtn.click();
  assert.equal(h.actions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0])), {
    action: 'run-pipeline',
    runId: 'fixture',
    reviewerId: 'TESTER',
    maxExternalArticles: 6
  });
});

test('Gate 2 memo reader renders clean prose without inline pill clutter, hover source preview card, verbatim quote inspector, and 1-click publish', async () => {
  const review = reviewReady();
  const h = harness(readyMemoJourney(), 'memo', { memoReview: review, markdown: SAMPLE_MARKDOWN });
  await h.flush();

  assert.equal(h.document.querySelectorAll('input[type="checkbox"]').length, 0);
  assert.equal(h.document.querySelectorAll('.cite-pill').length, 0);
  assert.equal(h.document.querySelectorAll('.cite-caveat').length, 0);

  const docText = h.document.querySelector('#doc .page-inner').textContent;
  assert.doesNotMatch(docText, /\[1\s+Kyiv Post\]/);
  assert.doesNotMatch(docText, /low confidence|moderate confidence/i);

  const endnotes = [...h.document.querySelectorAll('.endnotes li')];
  assert.equal(endnotes.length, 2);
  assert.ok(h.document.querySelector('a.ext-link[href="https://www.kyivpost.com/post/1"]'));

  const inspector = h.document.querySelector('#quote-inspector');
  assert.match(inspector.textContent, /Officers entered full readiness from Nov\. 2 to 8/);

  const hoverCard = h.document.querySelector('#claim-hover-card');
  assert.equal(hoverCard.hidden, true);
  const claims = [...h.document.querySelectorAll('.page .claim')];
  const contestedSpan = claims.find(el => el.textContent.includes('confirmed incursion'));
  assert.ok(contestedSpan);

  contestedSpan.dispatchEvent(new h.document.defaultView.Event('mouseenter'));
  assert.equal(hoverCard.hidden, false);
  assert.match(hoverCard.textContent, /\[2\] Seerist/);
  assert.match(hoverCard.textContent, /Low confidence/);
  assert.match(hoverCard.textContent, /Caveat/);
  assert.match(hoverCard.textContent, /Authorities have not reported a confirmed incursion/);

  contestedSpan.click();
  const pinnedSpan = h.document.querySelector('.page .claim[data-pinned="true"]');
  assert.ok(pinnedSpan);
  assert.match(pinnedSpan.textContent, /confirmed incursion/);
  assert.match(h.document.querySelector('#quote-inspector').textContent, /Absence of reports is weak single-source evidence/);
  assert.match(h.document.querySelector('#quote-inspector').textContent, /Authorities have not reported a confirmed incursion/);

  const publishBtn = h.button('Publish memo');
  assert.ok(publishBtn);
  assert.equal(publishBtn.disabled, false);
  publishBtn.click();
  assert.equal(h.actions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0])), {
    action: 'approve-and-publish',
    runId: 'fixture',
    memoId: 'memo-1',
    reviewerId: 'TESTER',
    notes: ''
  });
});

test('editorial revision drawer records revision feedback and chains start-memo-revision', async () => {
  const review = reviewReady();
  const h = harness(readyMemoJourney(), 'memo', { memoReview: review, markdown: SAMPLE_MARKDOWN });
  await h.flush();
  const textarea = h.document.querySelector('textarea');
  h.change(textarea, 'Tighten the opening BLUF sentence.');
  h.button('Revise memo wording').click();
  await h.flush();
  assert.equal(h.actions.length, 2);
  assert.equal(h.actions[0].action, 'record-memo-review');
  assert.equal(h.actions[0].decision, 'revision-requested');
  assert.equal(h.actions[0].issueType, 'editorial');
  assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0].sampledVerdicts)), []);
  assert.equal(h.actions[1].action, 'start-memo-revision');
  assert.equal(h.actions[1].memoId, 'memo-1');
});

test('v4 executive memo renders clean Situation and Assessment prose with hover provenance and inspector trace', async () => {
  const review = reviewReady();
  const journey = readyMemoJourney();
  journey.memo.memoStandardVersion = 4;
  journey.memo.memoContext = {
    title: 'Poland Sabotage Readiness',
    audience: 'Executive leadership',
    windowFrom: '2026-11-01',
    windowTo: '2026-11-09',
    geographies: ['Poland']
  };
  journey.memo.situation = [
    { text: 'Polish police entered full readiness over sabotage warnings.', claimIds: ['claim-1'] },
    { text: 'Authorities have not reported a confirmed incursion.', claimIds: ['claim-2'] }
  ];
  journey.memo.sourcing = { text: '2 sources (1 OSINT, 1 Seerist); 1 contested caveat retained.' };
  journey.memo.limitations = ['Unclassified reporting only.'];
  journey.memo.competing = [{ claimId: 'claim-2', check: 'plausible-alternative', text: 'Limited disclosure may explain the absence of public reports.' }];
  const v4Markdown = [
    '# Memorandum: Poland Sabotage Readiness',
    '',
    '**To:** Executive leadership · **Window:** 2026-11-01 to 2026-11-09 · **Scope:** Poland',
    '',
    '## Bottom Line',
    'Poland heightened police readiness amid sabotage warnings. [claim:claim-1]',
    '',
    '## Key Judgements',
    '- Sabotage alerts prompted heightened readiness. [claim:claim-1] *(Moderate confidence)*',
    '- No confirmed incursion has been disclosed. [claim:claim-2] *(Low confidence)*',
    '',
    '## Situation',
    'Polish police entered full readiness over sabotage warnings. [claim:claim-1] Authorities have not reported a confirmed incursion. [claim:claim-2]',
    '',
    '## Assessment & Implications',
    'Polish police entered full readiness over sabotage warnings. [claim:claim-1]',
    '',
    '## Uncertainties & Intelligence Gaps',
    '- None identified in the current evidence.',
    '',
    '## Outlook & Indicators to Watch',
    '- None specified in the current evidence.',
    '',
    '*Information cutoff: 2026-11-04T13:00:00Z*'
  ].join('\n');

  const h = harness(journey, 'memo', { memoReview: review, markdown: v4Markdown });
  await h.flush();

  const bodyText = h.document.querySelector('#doc .page-inner').textContent;
  assert.match(bodyText, /Memorandum: Poland Sabotage Readiness/);
  assert.doesNotMatch(bodyText, /\[claim:/);
  assert.doesNotMatch(bodyText, /Moderate confidence|Low confidence/i);
  assert.doesNotMatch(bodyText, /\[1 Kyiv Post\]|Caveat/);
  assert.match(bodyText, /Situation/);
  assert.match(bodyText, /Assessment & Implications/);

  const firstClaim = h.document.querySelector('.page .claim');
  firstClaim.dispatchEvent(new h.document.defaultView.Event('mouseenter'));
  const hoverText = h.document.querySelector('#claim-hover-card').textContent;
  assert.match(hoverText, /\[1\] Kyiv Post/);
  assert.match(hoverText, /Moderate confidence/);
  assert.match(hoverText, /Open source/);

  const drawerText = h.document.body.textContent;
  assert.match(drawerText, /2 sources \(1 OSINT, 1 Seerist\)/);
  assert.match(drawerText, /Limited disclosure may explain the absence of public reports/);
  assert.match(drawerText, /Unclassified reporting only/);
});

test('legacy blocked memo offers automatic pipeline regeneration', async () => {
  const j = readyMemoJourney();
  j.memo.blockers = [{ code: 'PROVISIONAL_MEMO_STANDARD', label: 'Provisional standard' }];
  j.memo.gate = { status: 'blocked', humanApprovalAvailable: false };
  const review = { ...reviewReady(), approvalAvailable: false, approvalBlockers: ['PROVISIONAL_MEMO_STANDARD'] };
  const h = harness(j, 'memo', { memoReview: review, markdown: SAMPLE_MARKDOWN });
  await h.flush();
  assert.equal(h.button('Publish memo'), undefined);
  const regen = h.button('Regenerate memo automatically');
  assert.ok(regen);
  regen.click();
  assert.equal(h.actions[0].action, 'run-pipeline');
});

test('pipelineWindow renders live TypeScript pipeline-status-v1 stage, counts, and source rows', () => {
  const journey = {
    brief: {
      scope: { status: 'approved', audience: 'Executive leadership' },
      question: { id: 'rq-1', text: 'Did Poland face sabotage warnings?' },
      requirements: [{ irId: 'ir-1', text: 'Warnings' }],
      framed: true
    },
    sources: [],
    leads: [],
    rounds: [],
    memo: null
  };
  const h = harness(journey, 'memo', {
    pipeline: {
      schemaVersion: 'pipeline-status-v1',
      state: 'running',
      workerActive: true,
      currentStage: 'adjudication',
      stageDetail: 'Adjudicating adversarial challenges and preserving contested caveats...',
      counts: {
        discoveredCandidates: 18,
        seeristAnalysisFound: 2,
        externalArticlesCaptured: 4,
        sourcesAssured: 5,
        claimsBuilt: 7
      },
      sources: [
        { id: 'article-1', kind: 'external-article', title: 'Kyiv Post sabotage report', publisherHost: 'www.kyivpost.com', status: 'assured', observationCount: 3, url: 'https://www.kyivpost.com/post/1' }
      ]
    }
  });
  const stages = [...h.document.querySelectorAll('.pipeline-stages li')];
  assert.equal(stages[0].className, 'is-done');
  assert.equal(stages[1].className, 'is-done');
  assert.equal(stages[2].className, 'is-done');
  assert.equal(stages[3].className, 'is-active');
  assert.equal(stages[4].className, '');
  assert.match(h.document.body.textContent, /Adjudicating adversarial challenges/);
  const metricNums = [...h.document.querySelectorAll('.pipeline-metric strong')].map(n => n.textContent);
  assert.deepEqual(metricNums, ['18', '6', '5', '7']);
  assert.match(h.document.body.textContent, /Kyiv Post sabotage report/);
  assert.match(h.document.body.textContent, /Assured \(3\)/);
});
