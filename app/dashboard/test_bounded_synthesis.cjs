const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

class Element {
  constructor(tag = 'div', text = '') {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
    this.attributes = {};
    this.events = {};
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}

function render(execution, noteCount = 1) {
  const actions = [];
  const j = {
    rounds: [], sources: [], brief: { requirements: [] },
    readiness: {
      noteCount, newNotes: [], inFlight: [], provisionalNotes: 0,
      canBuild: noteCount > 0, currentRoundComplete: true
    }
  };
  const C = {
    state: { runId: 'run-fixture', view: { boundedSynthesis: execution }, openRounds: {} },
    panes: {}, journey: () => j,
    humanise: value => String(value).replace(/-/g, ' '),
    capital: value => value.charAt(0).toUpperCase() + value.slice(1),
    when: () => '', plural: (n, word) => n + ' ' + word,
    el: (tag, cls, text) => new Element(tag, text),
    add: (parent, ...children) => { children.filter(Boolean).forEach(child => parent.appendChild(child)); return parent; },
    analyst: () => 'TESTER', sectionHead: title => new Element('h2', title),
    linkButton: title => new Element('button', title),
    actButton: (title, cls, callback, ignored, disabled) => {
      const button = new Element('button', title);
      button.disabled = Boolean(disabled);
      button.events.click = callback;
      return button;
    },
    postAction: payload => actions.push(payload),
    replace: (host, child) => { C.rendered = child; }, go() {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'run_panes.js'), 'utf8'), {
    window: { CTI: C },
    document: { getElementById: () => new Element(), createDocumentFragment: () => new Element() }
  });
  C.panes.synthesis();
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  return { nodes: descendants(C.rendered), actions };
}

test('one explicit start names both stages, carries analyst identity and discloses the human stop', () => {
  const output = render(null);
  const button = output.nodes.find(node => node.textContent === 'Start bounded Build and Challenge');
  assert.equal(button.disabled, false);
  button.events.click();
  assert.equal(output.actions[0].action, 'start-bounded-synthesis');
  assert.equal(output.actions[0].reviewerId, 'TESTER');
  assert.ok(output.nodes.some(node => String(node.textContent).includes('One call per needed Build or Challenge stage')));
  assert.ok(output.nodes.some(node => String(node.textContent).includes('then your adjudication')));
  assert.equal(render(null, 0).nodes.find(node => node.textContent === 'Start bounded Build and Challenge').disabled, true);
});

test('resume preserves authority; running, failed, indeterminate and blocked states cannot start new calls', () => {
  const ready = render({
    authorized: true, authorizationId: 'auth-1', status: 'prepared', remainingCalls: 1,
    stages: { build: { phase: 'committed' }, challenge: { phase: 'prepared' } }
  });
  const resume = ready.nodes.find(node => node.textContent === 'Resume bounded synthesis');
  assert.equal(resume.disabled, false);
  resume.events.click();
  assert.equal(ready.actions[0].action, 'resume-bounded-synthesis');
  assert.ok(ready.nodes.some(node => String(node.textContent).includes('Build: committed')));
  assert.ok(ready.nodes.some(node => node.attributes.role === 'status' && node.attributes['aria-live'] === 'polite'));
  for (const status of ['running', 'failed', 'indeterminate', 'blocked']) {
    const output = render({ authorized: true, authorizationId: 'auth-1', status, error: 'Precise saved failure.' });
    assert.equal(output.nodes.find(node => node.textContent === 'Resume bounded synthesis').disabled, true);
    assert.ok(output.nodes.some(node => String(node.textContent).includes('Precise saved failure.')));
  }
  const unavailable = render({ authorized: true, status: 'blocked', error: 'Authorization checksum changed.' });
  assert.equal(unavailable.nodes.find(node => node.textContent === 'Resume bounded synthesis').disabled, true);
});

test('a completed zero-finding Challenge still presents adjudication, not another model call', () => {
  const output = render({
    authorized: true, authorizationId: 'auth-1', status: 'human-waiting', remainingCalls: 0
  });
  assert.equal(output.nodes.some(node => node.textContent === 'Resume bounded synthesis'), false);
  assert.equal(output.nodes.some(node => node.textContent === 'Start bounded Build and Challenge'), false);
  assert.ok(output.nodes.some(node => String(node.textContent).includes('including when it raised no findings')));
});
