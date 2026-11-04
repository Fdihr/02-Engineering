const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

function harness(journey, pane, execution = null, drafts = {}, memoExecution = null, memoReview = null, memoRevision = null) {
  const dom = new JSDOM('<main><div id="pane-synthesis"></div><div id="pane-sources"></div><div id="pane-memo"></div></main>', { runScripts: 'outside-only' });
  const { document, Event } = dom.window;
  const actions = [];
  let sequence = 0;
  const C = {
    state: {
      runId: 'fixture', view: { boundedSynthesis: execution, boundedMemo: memoExecution, memoReview, memoRevision }, drafts, expanded: {}, openRounds: {},
      evidenceView: 'explorer', sourceFilter: 'all', sourceQuery: ''
    },
    panes: {}, journey: () => journey,
    humanise: value => String(value || '').replace(/[-_]/g, ' '),
    capital: value => value.charAt(0).toUpperCase() + value.slice(1),
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
    externalLink: ref => C.el('a', null, ref),
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
    postAction: payload => { actions.push(payload); return Promise.resolve({ ok: false }); },
    dropDrafts() {}, go() {}, navigate: route => actions.push({ route }),
    replace: (host, child) => host.replaceChildren(child),
    render: () => C.panes[pane]()
  };
  dom.window.CTI = C;
  dom.window.fetch = () => new Promise(() => {});
  dom.window.eval(fs.readFileSync(path.join(__dirname, 'run_panes.js'), 'utf8'));
  C.render();
  return {
    C, actions, document,
    button: text => [...document.querySelectorAll('button')].find(b => b.textContent === text),
    change: (input, value) => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); }
  };
}

function memoJourney() {
  return { brief: {}, rounds: [], memo: {
    id: 'memo-1', createdAt: '2026-11-04T13:00:00Z', markdownPath: 'memo/memo-1/memo.md',
    roundIndex: 1, currentRound: 1, isCurrent: true, claims: {}, blockers: [{ code: 'PROVISIONAL_MEMO_STANDARD', label: 'Provisional standard' }],
    gate: { status: 'blocked', humanApprovalAvailable: false },
    verification: { contentVerdict: 'pass', publicationVerdict: 'block', checks: [] },
    bluf: [], keyJudgments: [], analysis: [], uncertainties: [], indicators: [], competing: []
  } };
}
function memoReview() {
  const binding = { artifactRef: 'memo.json', artifactSha256: 'a'.repeat(64) };
  return { target: { runId: 'fixture', memoId: 'memo-1', memoVersion: 1,
    memo: binding, markdown: binding, writer: binding, verification: binding, gate: binding, calibrationPolicy: binding },
  decisionStatus: 'pending', approvalAvailable: false,
  samples: [{ observationId: 'obs-1', text: 'The review was announced.', quote: 'We announced a review.' }] };
}

test('memo review requires sample verdict, feedback and explicit exact-draft confirmation', () => {
  const review = memoReview();
  const h = harness(memoJourney(), 'memo', null, {}, null, review);
  assert.equal(h.button('Approve for publication').disabled, true);
  assert.equal(h.button('Record decision').disabled, true);
  const selects = h.document.querySelectorAll('select');
  h.change(selects[1], 'evidence-gap');
  h.change(selects[2], 'supported');
  h.change(h.document.querySelector('textarea'), 'Resolve remaining gaps.');
  const confirm = h.document.querySelector('input[type="checkbox"]');
  confirm.checked = true;
  confirm.dispatchEvent(new h.document.defaultView.Event('change', { bubbles: true }));
  assert.equal(h.button('Record decision').disabled, false);
  h.document.querySelector('form').dispatchEvent(new h.document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].action, 'record-memo-review');
  assert.equal(h.actions[0].decision, 'revision-requested');
  assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0].target)), review.target);
  assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0].sampledVerdicts)), [{ observationId: 'obs-1', verdict: 'supported' }]);
});

test('memo decisions and stale or unavailable review never expose a writable approval', () => {
  for (const data of [
    { ...memoReview(), decisionStatus: 'recorded', decision: { decision: 'revision-requested', reviewerId: 'REVIEWER',
      decidedAt: '2026-11-04T13:01:00Z', feedback: 'Close the gap.' } },
    { ...memoReview(), decisionStatus: 'stale' },
    { error: 'Memo Markdown changed; restore or produce a new draft before review.' }
  ]) {
    const h = harness(memoJourney(), 'memo', null, {}, null, data);
    assert.equal(h.button('Approve for publication').disabled, true);
    assert.equal(h.button('Record decision'), undefined);
  }
});

test('editorial revision requires separate confirmation and routes other feedback upstream', () => {
  const data = { ...memoReview(), decisionStatus: 'recorded',
    decision: { decision: 'revision-requested', reviewerId: 'REVIEWER', feedback: 'Improve clarity.' },
    revisionRoute: { eligible: true, route: 'review', reason: 'One editorial writer call.' } };
  const h = harness(memoJourney(), 'memo', null, {}, null, data);
  const button = h.button('Start editorial revision');
  assert.equal(button.disabled, true);
  const confirm = h.document.querySelector('input[type="checkbox"]');
  confirm.checked = true;
  confirm.dispatchEvent(new h.document.defaultView.Event('change', { bubbles: true }));
  assert.equal(button.disabled, false);
  button.click();
  assert.equal(h.actions[0].action, 'start-memo-revision');
  assert.equal(h.actions[0].memoId, 'memo-1');
  assert.equal(h.actions[0].reviewerId, 'TESTER');
  assert.equal(h.button('Approve for publication').disabled, true);
  for (const route of ['evidence', 'analysis/findings', 'audit']) {
    const routed = harness(memoJourney(), 'memo', null, {}, null, { ...data,
      revisionRoute: { eligible: false, route, reason: 'Resolve upstream.' } });
    assert.equal(routed.button('Start editorial revision'), undefined);
    [...routed.document.querySelectorAll('button')].find(b => b.textContent.startsWith('Return to ')).click();
    assert.equal(routed.actions[0].route, route);
  }
});

test('editorial recovery cannot offer new calls for terminal receipts and a revised draft has fresh review', () => {
  const data = { ...memoReview(), decision: { decision: 'revision-requested', reviewerId: 'REVIEWER', feedback: 'Edit.' },
    revisionRoute: { eligible: true, reason: 'One call.' } };
  for (const status of ['blocked', 'indeterminate', 'running', 'response-saved']) {
    const h = harness(memoJourney(), 'memo', null, {}, null, data,
      { authorized: true, parentMemoId: 'memo-1', status, remainingCalls: 0, authority: { model: 'writer-test' } });
    assert.equal(h.button('Start editorial revision'), undefined);
    const resume = h.button('Resume editorial revision');
    assert.equal(Boolean(resume), status === 'response-saved');
    if (resume) { resume.click(); assert.equal(h.actions[0].action, 'resume-memo-revision'); }
    assert.equal(h.button('Approve for publication').disabled, true);
  }
  const j = memoJourney();
  j.memo.id = 'memo-2';
  j.memo.version = 2;
  j.memo.supersedesMemoId = 'memo-1';
  const h = harness(j, 'memo', null, {}, null, { ...memoReview(), target: { ...memoReview().target, memoId: 'memo-2', memoVersion: 2 } });
  assert.ok(h.document.body.textContent.includes('Version 2 supersedes memo-1'));
  assert.equal(h.button('Record decision').disabled, true);
  assert.equal(h.document.querySelector('input[type="checkbox"]').checked, false);
});

function reviewJourney() {
  return {
    brief: { requirements: [{ irId: 'ir-01', text: 'Was a review announced?' }] },
    leads: [], rounds: [],
    sources: [{
      id: 'source-1', title: 'Ministry review', publisher: 'Example', artifacts: [], url: '',
      state: 'action', action: { kind: 'review' }, current: { label: 'Review support', state: 'you' },
      review: {
        snapshotId: 'snap-1', status: 'pending',
        observations: [1, 2, 3].map(n => ({
          observationId: 'obs-' + n, text: 'Statement ' + n, quote: 'Quoted text ' + n,
          claimKind: 'event', attribution: 'direct', irIds: ['ir-01']
        })),
        requirements: [{ irId: 'ir-01', text: 'Was a review announced?', disposition: 'covered' }]
      }
    }]
  };
}

function findingJourney() {
  const claim = {
    claimId: 'claim-1', statement: 'A review was announced.', kind: 'reported-fact', confidence: 'low',
    confidenceRationale: 'One source; credibility not assessed.', noteIds: ['note-1'],
    observationIds: ['obs-1'], challenges: [], status: 'proposed'
  };
  return {
    brief: { requirements: [{ irId: 'ir-01', text: 'Was a review announced?' }, { irId: 'ir-02', text: 'What follows?' }] },
    sources: [], notes: { 'note-1': { title: 'Ministry', relPath: 'assurance/note.json', observations: { 'obs-1': { text: claim.statement, quote: 'Formal review announced.' } } } },
    rounds: [{
      index: 1, current: true, claims: [claim], noteIds: ['note-1'], limitedEvidence: true,
      buildPath: 'build.json', challengeRecordPath: 'challenge.json', challengeStatus: 'checked',
      adjudicationStatus: 'awaiting-adjudication', memoPaths: [],
      coverage: [{ irId: 'ir-01', disposition: 'covered', observationIds: ['obs-1'] }, { irId: 'ir-02', disposition: 'silent', observationIds: [] }],
      steps: [{ key: 'build', label: 'Build', state: 'done' }, { key: 'challenge', label: 'Challenge', state: 'done' }, { key: 'adjudicate', label: 'Adjudicate', state: 'you' }]
    }],
    readiness: { noteCount: 1, newNotes: [], inFlight: [], provisionalNotes: 0, canBuild: false, currentRoundComplete: false }
  };
}

test('adjudicated Findings explicitly starts bounded memo work with the selected round', () => {
  const journey = findingJourney();
  journey.rounds[0].adjudicationStatus = 'adjudicated';
  journey.rounds[0].adjudicationPath = 'synthesis/adjudication/c1/performed-adjudication.json';
  journey.rounds[0].steps = [{ key: 'key-judgements', state: 'ready', label: 'Key judgements', action: {} }];
  const h = harness(journey, 'synthesis');
  assert.match(h.document.body.textContent, /Publication is not authorized/);
  h.button('Start selection and writing').click();
  assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0])), {
    action: 'start-bounded-memo', runId: 'fixture', reviewerId: 'TESTER',
    adjudicationPath: journey.rounds[0].adjudicationPath
  });
});

test('bounded memo exposes resume and recovery without competing model controls', () => {
  const journey = findingJourney();
  journey.rounds[0].adjudicationStatus = 'adjudicated';
  journey.rounds[0].steps = [{ key: 'memo', state: 'ai', label: 'Memo', action: {} }];
  const h = harness(journey, 'synthesis', null, {}, { authorized: true, status: 'response-saved', remainingCalls: 1 });
  h.button('Resume bounded memo work').click();
  assert.equal(h.actions[0].action, 'resume-bounded-memo');
  assert.doesNotMatch(h.document.body.textContent, /Run the AI memo writer|Manual compatibility controls/);
  const stopped = harness(journey, 'synthesis', null, {}, { authorized: true, status: 'indeterminate', remainingCalls: 0 });
  assert.equal(stopped.button('Start selection and writing'), undefined);
  assert.equal(stopped.button('Resume bounded memo work'), undefined);
  assert.match(stopped.document.body.textContent, /cannot grant more calls/);
  const complete = harness(journey, 'synthesis', null, {}, { authorized: true, status: 'memo-review', remainingCalls: 0 });
  assert.ok(complete.button('Review memo draft'));
  complete.button('Review memo draft').click();
  assert.equal(complete.actions[0].route, 'review');
  assert.equal(complete.button('Resume bounded memo work'), undefined);
});

test('review compares labelled statements and quotes, and never pre-approves verdicts', () => {
  const h = harness(reviewJourney(), 'sources');
  assert.equal(h.document.querySelectorAll('.review-comparison').length, 3);
  assert.equal(h.document.querySelectorAll('.comparison-label').length, 6);
  assert.match(h.document.querySelector('[role=status]').textContent, /0 of 3 statements checked/);
  h.button('Confirm support review').click();
  assert.equal(h.actions.length, 0);
  assert.match(h.document.querySelector('[role=alert]').textContent, /3 statement/);
  assert.equal(h.document.activeElement.tagName, 'SELECT');
});

test('bulk confirmation preserves exceptions and duplicate targets across rerenders', () => {
  const drafts = { 'rv:snap-1:v0': 'unsupported', 'rv:snap-1:n0': 'Quote says the opposite.', 'rv:snap-1:v1': 'duplicate', 'rv:snap-1:d1': 'obs-1' };
  const h = harness(reviewJourney(), 'sources', null, drafts);
  h.button('I checked the remaining quotes — mark supported').click();
  assert.equal(drafts['rv:snap-1:v0'], 'unsupported');
  assert.equal(drafts['rv:snap-1:d1'], 'obs-1');
  assert.equal(drafts['rv:snap-1:v2'], 'supported');
  assert.match(h.document.querySelector('[role=status]').textContent, /3 of 3 statements checked · 2 exceptions/);
  h.button('Confirm support review').click();
  assert.equal(h.actions[0].reviewPolicyVersion, 'support-review-v2');
  assert.equal(h.actions[0].verdicts[0].note, 'Quote says the opposite.');
  assert.equal(h.actions[0].verdicts[1].duplicateOf, 'obs-1');
  assert.equal(h.actions[0].irReview[0].note, '');
  assert.equal('assessment' in h.actions[0], false);
});

test('changed coverage and unsupported statements disclose and require exception notes', () => {
  const drafts = { 'rv:snap-1:v0': 'supported', 'rv:snap-1:v1': 'supported', 'rv:snap-1:v2': 'supported' };
  const h = harness(reviewJourney(), 'sources', null, drafts);
  const coverage = h.document.querySelector('.review-ir select');
  h.change(coverage, 'contradicted');
  h.button('Confirm support review').click();
  assert.equal(h.actions.length, 0);
  assert.equal(h.document.querySelector('.review-coverage').open, true);
  assert.equal(h.document.querySelector('.review-ir input').getAttribute('aria-invalid'), 'true');
  h.change(h.document.querySelector('.review-ir input'), 'The quoted evidence contradicts the question.');
  h.button('Confirm support review').click();
  assert.equal(h.actions.length, 1);
  const other = harness(reviewJourney(), 'sources');
  other.change(other.document.querySelector('.review-obs select'), 'unsupported');
  assert.equal(other.document.querySelector('.review-row input').parentElement.hidden, false);
  other.button('Confirm support review').click();
  assert.match(other.document.querySelector('[role=alert]').textContent, /Explain the flagged/);
});

test('optional source concern and provisional path retain their limited authority', () => {
  const h = harness(reviewJourney(), 'sources', null, { 'rv:snap-1:concern': 'Attribution is unclear.' });
  assert.equal(h.document.querySelectorAll('.review-coverage')[1].open, true);
  assert.match(h.document.querySelector('.review-skip').textContent, /block publication/);
  h.button('Skip the support pass (provisional)').click();
  assert.equal(h.actions[0].mode, 'provisional');
  assert.equal(h.actions[0].reviewerId, 'TESTER');
});

test('Findings prioritizes the current human decision and preserves checked-zero semantics', () => {
  const h = harness(findingJourney(), 'synthesis', { authorized: true, status: 'human-waiting', remainingCalls: 0, stages: { build: { phase: 'committed' }, challenge: { phase: 'committed' } } });
  const text = h.document.body.textContent;
  assert.match(text, /no findings does not mean approval/);
  assert.match(text, /Limited evidence/);
  assert.match(text, /Formal review announced/);
  assert.equal(h.button('Start bounded Build and Challenge'), undefined);
  assert.equal(h.button('Resume bounded synthesis'), undefined);
  assert.ok(text.indexOf('Review claims and record adjudication') < text.indexOf('Claims by evidence link'));
  assert.equal(text.includes('No claim selected for this question'), false);
  assert.equal(h.document.querySelector('.current-round').closest('details'), null);
  assert.match(text, /No evidence recorded for this question/);
  h.button('Record adjudication').click();
  assert.equal(h.actions[0].action, 'record-adjudication');
  assert.equal(h.actions[0].challenges.length, 0);
});

test('question links use persisted observations, never shared source identity or inferred coverage', () => {
  const j = findingJourney();
  j.rounds[0].steps[2].state = 'todo';
  j.rounds[0].claims.push({ ...j.rounds[0].claims[0], claimId: 'claim-2', statement: 'Unlinked claim', observationIds: ['obs-unlinked'] });
  const h = harness(j, 'synthesis');
  const groups = [...h.document.querySelectorAll('.finding-group')];
  assert.equal(groups[0].textContent.includes('Unlinked claim'), false);
  assert.match(groups.at(-1).textContent, /Claims without a recorded question link.*Unlinked claim/);
  j.rounds[0].keyJudgements = { path: 'kj.json', selections: [{ requirementId: 'ir-01', claimId: 'claim-1', text: 'A review was announced.' }], omissions: [], withoutClaim: [] };
  h.C.render();
  assert.match(h.document.body.textContent, /Selected findings by question/);
});
