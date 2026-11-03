const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
class Element {
  constructor(tag = 'div', text = '') {
    this.tagName = tag;
    this.textContent = text;
    this.value = '';
    this.children = [];
    this.listeners = {};
    this.selectedOptions = [{ textContent: 'Intelligence memo' }];
    this.classList = { add() {}, toggle() {} };
  }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() {}
  scrollIntoView() {}
}
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  },
  querySelectorAll() { return []; }
};
const $ = id => document.getElementById(id);
const actions = [];
const state = { dirty: {}, drafts: {}, busy: false, route: 'new', view: { availableRuns: [] } };
const plan = {
  question: 'Does supplier disruption cause more downtime than direct attacks?',
  rationale: 'Compare the two pathways in the thesis.',
  questions: [
    { question: 'Which suppliers caused downtime?', rationale: 'Tests supplier risk.', searches: ['supplier downtime'] },
    { question: 'Which direct attacks caused downtime?', rationale: 'Tests direct risk.', searches: ['manufacturing cyberattack'] },
    { question: 'What contradicts the thesis?', rationale: 'Tests alternatives.', searches: ['production resilience'] }
  ],
  rankingTerms: ['supplier', 'production', 'disruption']
};
let respond = null;
let analyst = '';
const C = {
  state, panes: {}, analyst: () => analyst,
  el: (tag, cls, text) => new Element(tag, text),
  add: (parent, ...children) => { children.forEach(child => parent.appendChild(child)); return parent; },
  clear: node => { node.children = []; },
  postAction: payload => {
    actions.push(payload);
    return new Promise(resolve => { respond = resolve; });
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'run_panes.js'), 'utf8'), {
  window: { CTI: C }, document
});
const change = (id, value) => {
  $(id).value = value;
  $(id).listeners.input({ target: $(id) });
};
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
const reply = () => respond({ ok: true, draft: plan, model: 'test-model' });

async function main() {
  $('in-geo').value = 'Europe';
  $('in-audience').value = 'Leadership';
  $('in-output').value = 'memo';
  $('generated-plan').hidden = true;
  C.initBrief();
  C.startNew();
  assert.equal($('in-question').value, '');
  assert.equal($('in-irs').value, '');
  assert.equal($('in-disc-queries').value, '');
  change('in-question', 'Supplier disruption is more serious than direct attacks.');
  $('btn-draft-question').listeners.click();
  assert.equal(actions[0].action, 'generate-research-plan');
  assert.equal(actions[0].scopeConfirmed, undefined);
  assert.equal(actions[0].runDiscovery, false);
  assert.equal(actions[0].researchThesis, $('in-question').value);
  assert.equal(actions[0].requirements, '');
  $('btn-draft-question').listeners.click();
  assert.equal(actions.length, 1, 'Duplicate generation must not spend twice');
  reply();
  await flush();
  assert.equal($('generated-plan').hidden, false);
  assert.equal($('generated-plan-questions').children.length, 3);
  const reason = $('generated-plan-questions').children[0].children[0].children[2];
  assert.equal(reason.tagName, 'details');
  assert.equal(reason.children[0].textContent, 'Connection to your thesis');
  assert.equal(reason.children[1].textContent, plan.questions[0].rationale);
  assert.equal($('in-irs').value.split('\n')[0], plan.questions[0].question);
  assert.equal($('in-disc-queries').value.split('\n')[0], 'supplier downtime');
  assert.equal($('approve-confirm').checked, false);
  assert.equal($('btn-approve-collect').disabled, true, 'Generation without analyst cannot approve');

  const firstSearch = $('generated-plan-questions').children[0].children[1].children[1];
  firstSearch.value = 'supplier outage';
  firstSearch.listeners.input();
  assert.equal($('in-disc-queries').value.split('\n')[0], 'supplier outage');
  analyst = 'reviewer';
  firstSearch.value = '';
  firstSearch.listeners.input();
  $('btn-review-intent').listeners.click();
  assert.match($('intent-problem').textContent, /Fill each question and search/);
  firstSearch.value = 'supplier outage';
  firstSearch.listeners.input();
  analyst = '';
  change('in-question', 'A different thesis');
  assert.equal($('generated-plan').hidden, true);
  assert.equal($('approval-review').hidden, true);
  assert.match($('draft-question-status').textContent, /Generate a new plan/);

  $('btn-draft-question').listeners.click();
  change('in-question', 'Thesis changed while Copilot was running');
  reply();
  await flush();
  assert.equal($('generated-plan').hidden, true);
  assert.match($('draft-question-status').textContent, /changed during generation/);

  $('btn-draft-question').listeners.click();
  respond({ ok: false, error: 'Copilot unavailable' });
  await flush();
  assert.equal($('generated-plan').hidden, true);
  assert.equal($('draft-question-status').textContent, 'Copilot unavailable');
  assert.equal($('btn-draft-question').textContent, 'Generate research plan');
  assert.equal(actions.every(action => action.action === 'generate-research-plan'), true);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
