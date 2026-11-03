const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.classList = { add() {}, toggle() {}, contains() { return false; } };
  }
  get firstChild() { return this.children[0]; }
  appendChild(node) { this.children.push(node); return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] || ''; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  matches() { return false; }
}
const all = (node) => [node, ...node.children.flatMap(all)];
const document = {
  body: new Element('body'),
  documentElement: new Element('html'),
  listeners: {},
  getElementById(id) {
    const dynamic = all(this.getHost()).find(node => node.id === id);
    if (dynamic) return dynamic;
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  },
  getHost() {
    if (!elements.has('model-workflow')) elements.set('model-workflow', new Element('ol'));
    return elements.get('model-workflow');
  },
  querySelector() { return this.getElementById('model-settings'); },
  querySelectorAll(selector) {
    return selector === '#model-workflow select' ? all(this.getHost()).filter(node => node.tagName === 'select') : [];
  },
  createElement: tag => new Element(tag),
  createDocumentFragment: () => new Element(),
  createTextNode: text => Object.assign(new Element(), { textContent: text }),
  addEventListener(name, callback) { this.listeners[name] = callback; }
};
document.body.setAttribute('data-run-id', 'live');
const workflow = JSON.parse(process.argv[2]);
let settings = { model: 'default', stages: { challenge: { provider: 'github-copilot-sdk', model: 'reasoning' } } };
let failCatalog = false;
let failSave = false;
const actions = [];
const catalog = [{ id: 'default', name: 'Default model' }, { id: 'reasoning', name: 'Reasoning model' }];
const window = {
  location: { hash: '#/settings', search: '' },
  addEventListener() {},
  requestAnimationFrame() {},
  setInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {}
};
const fetch = async (url, options) => {
  if (url === '/api/copilot-settings') return { json: async () => ({ settings, workflow }) };
  if (url === '/api/copilot-models') return { json: async () => failCatalog ? { error: 'Sign in required' } : { models: catalog } };
  if (url === '/api/action') {
    const payload = JSON.parse(options.body);
    actions.push(payload);
    if (failSave) return { json: async () => ({ ok: false, error: 'Model is no longer available' }) };
    settings = { model: payload.model, stages: payload.stages };
    return { json: async () => ({ ok: true, settings }) };
  }
  if (url === '/api/auth/session') return { ok: true, json: async () => ({ enabled: false }) };
  throw new Error('No research run is loaded in the settings test.');
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'run_view.js'), 'utf8'), {
  window, document, fetch, URLSearchParams, localStorage: { getItem() { return ''; } }, navigator: {}
});
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
const change = (id, value) => {
  const node = document.getElementById(id);
  assert.equal(node.disabled, false, id + ' is disabled');
  node.value = value;
  node.listeners.change({ target: node });
};
const click = id => {
  const node = document.getElementById(id);
  assert.equal(node.disabled, false, id + ' is disabled');
  node.listeners.click();
};

async function main() {
  document.listeners.DOMContentLoaded();
  await flush();
  const state = window.CTI.state;
  assert.equal(document.querySelectorAll('#model-workflow select').length, 7);
  assert.equal(document.getElementById('stage-model-challenge').value, 'reasoning');
  assert.equal(document.getElementById('btn-save-model').disabled, true);
  assert.match(document.getElementById('draft-question-model').textContent, /default/i);

  change('stage-model-challenge', '');
  assert.match(document.getElementById('model-effective-challenge').textContent, /^Default:/);
  assert.equal(state.stageModels.challenge.model, 'reasoning');
  click('btn-discard-models');
  assert.equal(document.getElementById('stage-model-challenge').value, 'reasoning');
  assert.equal(document.getElementById('btn-save-model').disabled, true);

  change('stage-model-build', 'reasoning');
  click('btn-refresh-models');
  await flush();
  assert.equal(document.getElementById('stage-model-build').value, 'reasoning');
  assert.equal(state.stageModels.build, undefined);
  click('btn-save-model');
  assert.equal(document.getElementById('stage-model-build').disabled, true);
  await flush();
  assert.equal(state.stageModels.build.model, 'reasoning');
  assert.equal(actions[0].stages.build.provider, 'github-copilot-sdk');
  assert.equal(document.getElementById('btn-save-model').disabled, true);

  change('copilot-model', 'reasoning');
  assert.equal(state.copilotModel, 'default');
  assert.match(document.getElementById('model-effective-relevance').textContent, /Reasoning model/);
  failSave = true;
  click('btn-save-model');
  await flush();
  assert.equal(state.copilotModel, 'default');
  assert.equal(document.getElementById('copilot-model').value, 'reasoning');
  assert.match(document.getElementById('copilot-setting-status').textContent, /no longer available/);
  assert.equal(document.getElementById('btn-save-model').disabled, false);
  failSave = false;

  failCatalog = true;
  click('btn-refresh-models');
  await flush();
  assert.equal(document.getElementById('btn-save-model').disabled, true);
  assert.match(document.getElementById('copilot-setting-status').textContent, /Sign in required/);
  failCatalog = false;
  click('btn-refresh-models');
  await flush();
  assert.equal(document.getElementById('copilot-model').value, 'reasoning');
  click('btn-discard-models');

  change('stage-model-challenge', '');
  change('stage-model-build', '');
  click('btn-save-model');
  await flush();
  assert.deepEqual(Object.keys(state.stageModels), []);
  assert.match(document.getElementById('model-effective-challenge').textContent, /^Default:/);
  assert.equal(actions.length, 3);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
