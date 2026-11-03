const { test } = require('node:test');
const strictAssert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Arrays built inside the vm sandbox have a different realm; normalise before comparing.
const assert = {
  ...strictAssert,
  deepEqual: (actual, expected, message) => strictAssert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)
};

class Element {
  constructor(tag = 'div', text = '') {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
  }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute() {}
  addEventListener() {}
}

const humanise = value => String(value).replace(/[-_]/g, ' ');
const capital = value => {
  const text = String(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const C = {
  state: { sourceFilter: 'all', sourceQuery: '', selectedSource: '', evidenceQuestion: '' },
  el: (tag, cls, text) => new Element(tag, text),
  add: (parent, ...children) => { children.forEach(child => child && parent.appendChild(child)); return parent; },
  clear() {},
  humanise,
  capital,
  when: () => '',
  plural,
  panes: {}
};

vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'run_panes.js'), 'utf8'), {
  window: { CTI: C },
  document: { getElementById: () => new Element(), createDocumentFragment: () => new Element() }
});

const ev = C.evidence;

function row(overrides) {
  return {
    id: 'row-a',
    title: 'Supplier outage report',
    publisher: 'Example Wire',
    state: 'progress',
    candidate: null,
    action: null,
    review: null,
    current: null,
    artifacts: [],
    lead: null,
    ...overrides
  };
}

function journey(overrides) {
  return {
    brief: { requirements: [] },
    leads: [],
    sources: [],
    ...overrides
  };
}

function projected(overrides) {
  return {
    schemaVersion: 1,
    pipeline: {
      leads: { count: 2, basis: 'Distinct Seerist lead items' },
      capturedSources: { count: 1, basis: 'Distinct persisted snapshots; retrieved rows without a snapshot are not counted' },
      acquisitionBlocker: null,
      stagesExclusive: false,
      stages: [
        { key: 'relevant', label: 'Relevant', count: 1, basis: 'Positive verdicts only' },
        { key: 'admitted', label: 'Admitted', count: 0, basis: 'Admission decision approved' },
        { key: 'reviewed', label: 'Reviewed', count: 0, basis: 'Completed reviews only' },
        { key: 'provisionallyReviewed', label: 'Provisionally reviewed', count: 1, basis: 'Support pass skipped; not a completed review' }
      ]
    },
    questions: [],
    exceptions: { open: 0, items: [] },
    sourceExplorer: [],
    ...overrides
  };
}

test('fallback derives blocker, unassessed coverage and explorer from existing journey fields', () => {
  const j = journey({
    brief: { requirements: [{ irId: 'IR1', text: 'Who was hit?', coverage: '' }] },
    leads: [{ pendingRss: true }, { pendingRss: true }, { pendingRss: false }],
    sources: [
      row({ id: 'row-a', title: 'Approved note', candidate: { decision: { outcome: 'approved' } }, review: { status: 'recorded', observations: [{ observationId: 'obs-1', irIds: ['IR1'] }] } }),
      row({ id: 'row-b', title: 'Lead only', state: 'pending' })
    ]
  });
  const model = ev.model(j);
  assert.equal(model.pipeline.blocker.kind, 'pending_rss');
  assert.equal(model.pipeline.blocker.leadCount, 2);
  assert.equal(model.pipeline.leads.count, 3);
  assert.equal(model.questions[0].coverage, 'unassessed');
  assert.deepEqual(model.questions[0].observationIds, ['obs-1']);
  assert.deepEqual(model.questions[0].sourceNoteIds, ['row-a']);
  const byId = Object.fromEntries(model.explorer.map(e => [e.entry.rowId, e.entry]));
  assert.equal(byId['row-a'].disposition, 'admitted');
  assert.equal(byId['row-a'].countsAsEvidence, true);
  assert.equal(byId['row-b'].disposition, 'metadata-only');
  assert.equal(byId['row-b'].countsAsEvidence, false);
});

test('fallback has no blocker when no lead is pending RSS', () => {
  const model = ev.model(journey({ leads: [{ pendingRss: false }] }));
  assert.equal(model.pipeline.blocker, null);
});

test('fallback exceptions list rows that need the analyst', () => {
  const model = ev.model(journey({
    sources: [row({ id: 'row-x', state: 'action', current: { label: 'Waiting for you', state: 'human' }, artifacts: [{ relPath: 'a/b.json' }] })]
  }));
  assert.equal(model.exceptions.open, 1);
  assert.equal(model.exceptions.items[0].kind, 'needs_you');
  assert.equal(model.exceptions.items[0].relPath, 'a/b.json');
});

test('projected payload is used when schemaVersion 1 is present and keeps stage keys', () => {
  const j = journey({
    sources: [row({ id: 'row-a', title: 'Admitted note', candidate: { decision: { outcome: 'approved' } } })],
    evidenceWorkspace: projected({
      sourceExplorer: [{ rowId: 'row-a', title: 'Admitted note', disposition: 'admitted', snapshotId: 'snap-1', countsAsEvidence: true }]
    })
  });
  const model = ev.model(j);
  assert.equal(model.pipeline.captured.count, 1);
  assert.deepEqual(model.pipeline.stages.map(s => s.key), ['relevant', 'admitted', 'reviewed', 'provisionallyReviewed']);
  assert.equal(model.pipeline.stages[3].basis, 'Support pass skipped; not a completed review');
  assert.equal(model.explorer.length, 1);
  assert.equal(model.explorer[0].row.id, 'row-a');
});

test('projected blocker and empty states are rendered from the projection, not recomputed', () => {
  const j = journey({
    leads: [{ pendingRss: true }],
    evidenceWorkspace: projected({
      pipeline: { ...projected().pipeline, acquisitionBlocker: { kind: 'pending_rss', leadCount: 4, explanation: 'Projected explanation' } },
      questions: [],
      exceptions: { open: 0, items: [] }
    })
  });
  const model = ev.model(j);
  assert.equal(model.pipeline.blocker.leadCount, 4);
  assert.equal(model.pipeline.blocker.explanation, 'Projected explanation');
  assert.equal(model.questions.length, 0);
  assert.equal(model.exceptions.open, 0);
  assert.equal(model.exceptions.items.length, 0);
});

test('projected unpersisted links stay null and missing coverage is unassessed', () => {
  const j = journey({
    evidenceWorkspace: projected({
      questions: [{ id: 'IR2', text: 'Open question', coverage: undefined, sourceNoteIds: null, observationIds: null }]
    })
  });
  const [q] = ev.model(j).questions;
  assert.equal(q.coverage, 'unassessed');
  assert.equal(q.sourceNoteIds, null);
  assert.equal(q.observationIds, null);
});

test('projected explorer drops rows that are absent from journey.sources', () => {
  const j = journey({
    sources: [row({ id: 'row-a' })],
    evidenceWorkspace: projected({
      sourceExplorer: [
        { rowId: 'row-a', title: 'A', disposition: 'in-progress', snapshotId: null, countsAsEvidence: false },
        { rowId: 'ghost', title: 'Ghost', disposition: 'admitted', snapshotId: 'snap-9', countsAsEvidence: true }
      ]
    })
  });
  const model = ev.model(j);
  assert.deepEqual(model.explorer.map(e => e.row.id), ['row-a']);
});

test('malformed or future schema falls back to derived model', () => {
  const base = journey({ evidenceWorkspace: projected({ schemaVersion: 2 }) });
  assert.equal(ev.model(base).pipeline.captured, null);
  const missing = journey({ evidenceWorkspace: { schemaVersion: 1, pipeline: {}, questions: 'nope', exceptions: {}, sourceExplorer: [] } });
  assert.equal(ev.model(missing).pipeline.stages.length, 2);
});

test('coverage labels keep typed dispositions and never invent assessment', () => {
  assert.equal(ev.coverageLabel('unassessed'), 'Unassessed');
  assert.equal(ev.coverageLabel(''), 'Unassessed');
  assert.equal(ev.coverageLabel(undefined), 'Unassessed');
  assert.equal(ev.coverageLabel('partially-covered'), 'Partially covered');
});

test('source explorer filters by category and searches title, publisher and status', () => {
  const entries = [
    { entry: { rowId: 'a', title: 'Grid outage', disposition: 'admitted' }, row: row({ id: 'a', title: 'Grid outage', publisher: 'Reuters', state: 'done' }) },
    { entry: { rowId: 'b', title: 'Port strike', disposition: 'metadata-only' }, row: row({ id: 'b', title: 'Port strike', publisher: 'BBC', state: 'pending' }) },
    { entry: { rowId: 'c', title: 'Needs review', disposition: 'pending-admission' }, row: row({ id: 'c', title: 'Needs review', publisher: 'AP', state: 'action' }) }
  ];
  assert.equal(ev.filterExplorer(entries, 'all', '').length, 3);
  assert.deepEqual(ev.filterExplorer(entries, 'pending', '').map(e => e.entry.rowId), ['b']);
  assert.deepEqual(ev.filterExplorer(entries, 'all', 'reuters').map(e => e.entry.rowId), ['a']);
  assert.deepEqual(ev.filterExplorer(entries, 'all', 'Metadata only').map(e => e.entry.rowId), ['b']);
  assert.deepEqual(ev.filterExplorer(entries, 'action', 'bbc'), []);
  assert.equal(ev.filterExplorer(entries, 'all', '   ').length, 3);
});

test('explorer rowIds keep the journey row identity used by the existing drilldown', () => {
  const j = journey({ sources: [row({ id: 'row-keep', title: 'Keep' })], evidenceWorkspace: projected({
    sourceExplorer: [{ rowId: 'row-keep', title: 'Keep', disposition: 'in-progress', snapshotId: null, countsAsEvidence: false }]
  }) });
  const [only] = ev.model(j).explorer;
  assert.equal(only.entry.rowId, only.row.id);
  assert.equal(only.row.id, 'row-keep');
});

test('run_panes registers the sources pane and the evidence helpers', () => {
  assert.equal(typeof C.panes.sources, 'function');
  assert.equal(typeof ev.model, 'function');
});
