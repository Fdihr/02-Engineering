(function () {
  'use strict';

  var body = document.body;
  var state = {
    runId: new URLSearchParams(window.location.search).get('run') || body.getAttribute('data-run-id'),
    view: null,
    lastText: '',
    tab: 'now',
    busy: false,
    pendingRender: false,
    newMode: false,
    draft: false,
    expanded: {},
    openRounds: {},
    drafts: {},
    promptAt: {},
    sourceFilter: '',
    sourceQuery: '',
    evidenceQuestion: '',
    homeFilter: 'all',
    homeSel: '',
    leadFilter: 'pending',
    recent: [],
    dirty: {},
    copilotModel: null,
    stageModels: {},
    modelCatalog: [],
    modelWorkflow: [],
    draftModel: null,
    draftStages: {},
    modelSaving: false,
    catalogLoaded: false,
    modelLoading: false,
    settingsLoaded: false
  };
  var pollMs = Math.max(1000, Number(body.getAttribute('data-poll-ms')) || 2000);
  var TABS = ['now', 'brief', 'sources', 'synthesis', 'memo', 'audit', 'settings'];

  /* ---------- DOM helpers ---------- */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return parent;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function replace(node, fragment) { clear(node); node.appendChild(fragment); }
  function humanise(value) { return String(value || '').replace(/[_-]+/g, ' ').trim(); }
  function capital(value) { var s = String(value || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function when(iso) { return iso ? String(iso).slice(0, 16).replace('T', ' ') : ''; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function analyst() { return (document.getElementById('analyst-id').value || '').trim(); }
  function journey() { return (state.view && state.view.journey) || null; }

  function statusMark(kind, label) {
    var known = ['pending', 'in-progress', 'committed', 'failed', 'provisional', 'reviewed', 'synthetic'];
    var mark = el('span', 'status ' + (known.indexOf(kind) >= 0 ? kind : 'pending'));
    add(mark, el('span', 'status-dot'), String(label || humanise(kind)));
    return mark;
  }
  function actorMark(actor) {
    var labels = { you: 'You decide', ai: 'Copilot', system: 'Automatic' };
    return el('span', 'actor ' + actor, labels[actor] || actor);
  }
  var STEP_MARK = { done: 'reviewed', you: 'in-progress', ai: 'in-progress', system: 'in-progress', failed: 'failed', closed: 'pending', skipped: 'pending', todo: 'pending', provisional: 'provisional', ready: 'pending' };
  function lifecycle(steps) {
    var list = el('ol', 'lifecycle');
    steps.forEach(function (step) {
      var li = el('li', 's-' + step.state);
      li.title = step.detail || humanise(step.state);
      add(li, statusMark(STEP_MARK[step.state] || 'pending', step.label));
      list.appendChild(li);
    });
    return list;
  }
  function artifactLink(relPath, label, inline) {
    var link = el('button', 'artifact-link' + (inline ? ' inline' : ''), label || relPath);
    link.type = 'button';
    link.addEventListener('click', function () { viewArtifact(relPath); });
    return link;
  }
  function linkButton(label, onClick) {
    var b = el('button', 'btn-link', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function actButton(label, cls, onClick, needsAnalyst, blocked) {
    var b = el('button', cls + ' act', label);
    b.type = 'button';
    if (needsAnalyst) b.setAttribute('data-needs-analyst', '1');
    setBlocked(b, blocked);
    b.addEventListener('click', onClick);
    return b;
  }
  function setBlocked(b, blocked) {
    b.setAttribute('data-blocked', blocked ? '1' : '');
    b.disabled = state.busy || Boolean(blocked) || (b.getAttribute('data-needs-analyst') === '1' && !analyst());
  }
  function sectionHead(title, level, extra) {
    var head = el('div', 'section-head');
    add(head, el(level || 'h2', null, title), extra || null);
    return head;
  }
  function kv(pairs) {
    var dl = el('dl', 'kv');
    pairs.forEach(function (pair) {
      if (pair[1] === undefined || pair[1] === null || pair[1] === '') return;
      add(dl, el('dt', null, pair[0]));
      var dd = el('dd');
      add(dd, typeof pair[1] === 'string' || typeof pair[1] === 'number' ? String(pair[1]) : pair[1]);
      dl.appendChild(dd);
    });
    return dl;
  }
  function externalLink(url, label) {
    var a = el('a', null, label || url);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  /* Form fields keep their values across re-renders through state.drafts. */
  function bindDraft(input, key, fallback) {
    var has = Object.prototype.hasOwnProperty.call(state.drafts, key);
    if (input.type === 'checkbox') {
      input.checked = has ? state.drafts[key] === '1' : Boolean(fallback);
    } else {
      input.value = has ? state.drafts[key] : (fallback === undefined || fallback === null ? '' : fallback);
    }
    var save = function () { state.drafts[key] = input.type === 'checkbox' ? (input.checked ? '1' : '') : input.value; };
    input.addEventListener('input', save);
    input.addEventListener('change', save);
    return input;
  }
  function dropDrafts(prefix) {
    Object.keys(state.drafts).forEach(function (key) { if (key.indexOf(prefix) === 0) delete state.drafts[key]; });
  }
  var fieldSeq = 0;
  function field(label, input, wide) {
    var wrap = el('div', 'field' + (wide ? ' field-wide' : ''));
    input.id = input.id || 'f-' + (++fieldSeq);
    var lab = el('label', null, label);
    lab.htmlFor = input.id;
    add(wrap, lab, input);
    return wrap;
  }
  function selectInput(options, key, fallback) {
    var sel = el('select');
    options.forEach(function (opt) {
      var o = el('option', null, opt[1]);
      o.value = opt[0];
      sel.appendChild(o);
    });
    return bindDraft(sel, key, fallback || '');
  }
  function textInput(key, fallback, placeholder, multiline, rows) {
    var input = el(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    if (multiline) input.rows = rows || 2;
    if (placeholder) input.placeholder = placeholder;
    return bindDraft(input, key, fallback);
  }

  /* ---------- Artefact sheet ---------- */
  function openSheet(title, text, reading) {
    document.getElementById('artifact-sheet').hidden = false;
    document.getElementById('sheet-backdrop').hidden = false;
    document.getElementById('viewer-title').textContent = title;
    document.getElementById('viewer').textContent = text;
    document.getElementById('viewer').classList.toggle('reading', Boolean(reading));
  }
  function closeSheet() {
    document.getElementById('artifact-sheet').hidden = true;
    document.getElementById('sheet-backdrop').hidden = true;
  }
  function viewArtifact(relPath) {
    openSheet(state.runId + ' / ' + relPath, 'Loading…');
    fetch('/api/artifact?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(relPath)).then(function (res) {
      if (!res.ok) throw new Error('Not available (' + res.status + ')');
      return res.text();
    }).then(function (text) {
      var pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* not JSON */ }
      document.getElementById('viewer').textContent = pretty;
    }).catch(function (err) { document.getElementById('viewer').textContent = err.message; });
  }

  /* ---------- Actions ---------- */
  var ACTION_TITLES = {
    'approve-intent': 'Approving the analysis',
    'discover-seerist': 'Collecting Seerist leads',
    'intake-candidate': 'Classifying the provider item',
    'review-evidence': 'Recording your admission decision',
    'record-relevance': 'Recording the AI relevance check',
    'record-assurance-review': 'Recording your source review',
    'record-adjudication': 'Recording your adjudication',
    'record-ai-stage': 'Recording the AI answer',
    'run-ai-stage': 'Running local Copilot',
    'draft-research-question': 'Approving scope and drafting the research question',
    'save-copilot-settings': 'Saving the Copilot model',
    'prepare-synthesis': 'Preparing the synthesis Build',
    'prepare-key-judgements': 'Preparing the key-judgement selection',
    'prepare-memo-writer': 'Preparing the memo writer',
    'run-next': 'Checking the next deterministic step'
  };
  function readStepFields(text) {
    var fields = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var match = /^([A-Z][A-Za-z ]+):\s*(.+)/.exec(line.trim());
      if (match) fields[match[1]] = match[2].trim();
    });
    return fields;
  }
  function describeStep(step) {
    var script = (/npm run (\S+)/.exec(step.command || '') || /^(\S+:\S+)/.exec(step.command || '') || [])[1] || 'workflow step';
    var f = readStepFields(step.stdout);
    var reused = /reused existing/.test(step.command || '');
    var map = {
      'approve:scope': ['Scope approved', f['Approved by'] ? 'Approved by ' + f['Approved by'] : ''],
      'approve:question': ['Research question approved', f['Approved by'] ? 'Approved by ' + f['Approved by'] : ''],
      'approve:requirements': ['Information requirements approved', f['Requirements'] ? f['Requirements'] + ' requirements' : ''],
      'discover:seerist': ['Seerist leads collected', (f['Candidates'] || '0') + ' ranked leads from ' + (f['API calls'] || '0') + ' API calls'],
      'intake:seerist': [reused ? 'Lead already classified' : 'Lead classified', reused ? 'Reused the existing record' : humanise(f['Role']) + ' → ' + humanise(f['Route'])],
      'canonicalize:source': ['Article text prepared', f['Segments'] ? f['Segments'] + ' anchored text segments' : ''],
      'prepare:question-relevance': ['Relevance check prepared', 'Next: run Copilot relevance'],
      'review:evidence': ['Admission decision recorded', humanise(f['Decision']) + (f['Reviewer'] ? ' by ' + f['Reviewer'] : '')],
      'check:ai-answer': ['AI answer checked', f['Quotes'] ? 'All ' + f['Quotes'] + ' quotes matched the source exactly' : ''],
      'record:question-relevance': ['AI relevance check recorded', f['Verdict'] ? 'Verdict: ' + humanise(f['Verdict']) : ''],
      'record:assurance-review': ['Source review recorded', humanise(f['Review status']) + (f['Verdicts'] ? ' · ' + f['Verdicts'] + ' verdicts' : '')],
      'assemble:assurance': ['Source note assembled', (f['In-scope observations'] ? f['In-scope observations'] + ' in-scope observations' : '') + (f['Gaps'] ? ' · ' + f['Gaps'] + ' gaps' : '')],
      'measure:assurance': ['Assurance measured', 'Support failure rate ' + (f['Support failure rate'] || 'n/a')],
      'adjudication:record': ['Adjudication recorded', (f['Accepted'] || '0') + ' accepted · ' + (f['Contested'] || '0') + ' contested · ' + (f['Rejected'] || '0') + ' rejected'],
      'prepare:key-judgements': ['Key-judgement selection prepared', 'Next: run Copilot selection'],
      'prepare:assurance-extract': ['Extraction prepared', 'Next: run Copilot extraction'],
      'record:assurance-extract': ['AI extraction recorded', (f['Observations'] ? f['Observations'] + ' observations' : humanise(f['Status']))],
      'prepare:assurance-review': ['Review package prepared', f['Observations'] ? f['Observations'] + ' observations for your review' : ''],
      'prepare:synthesis-build': ['Synthesis Build prepared', (f['Source notes'] ? f['Source notes'] + ' source notes · ' : '') + 'Next: run Copilot Build'],
      'record:synthesis-build': ['AI Build recorded', f['Claims'] ? f['Claims'] + ' claims' : ''],
      'prepare:synthesis-challenge': ['Challenge prepared', 'Next: run Copilot Challenge'],
      'record:synthesis-challenge': ['AI Challenge recorded', (f['Challenges raised'] ? f['Challenges raised'] + ' challenges raised' : '') + ' · Next: your adjudication'],
      'record:key-judgements': ['AI key judgements recorded', (f['Selected'] || '0') + ' selected · ' + (f['Omitted'] || '0') + ' omitted'],
      'prepare:memo-writer': ['Memo writer prepared', 'Next: run Copilot memo writing'],
      'record:memo-writer': ['Memo committed', (f['Key judgments'] ? f['Key judgments'] + ' key judgements' : '') + (f['Publication'] ? ' · publication ' + f['Publication'] : '')],
      'run:next': ['Next step checked', '']
    };
    var entry = map[script] || [capital(humanise(script)), ''];
    var output = f['Output'] || '';
    var prefix = 'runs/' + state.runId + '/';
    return { title: entry[0], detail: entry[1], relPath: output.indexOf(prefix) === 0 ? output.slice(prefix.length) : '' };
  }
  function friendlyError(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var hit = lines.filter(function (l) { return /failed|rejected|error|invalid|not configured|required/i.test(l) && l.indexOf('>') !== 0; });
    return (hit[hit.length - 1] || lines[lines.length - 1] || 'The step failed.').replace(/^Error:\s*/, '');
  }
  var activityTimer = null;
  function showActivity(title, data, running, requestError) {
    var box = document.getElementById('activity');
    clear(box);
    box.hidden = false;
    window.clearTimeout(activityTimer);
    var ok = !running && !requestError && data && data.ok;
    box.className = 'activity' + (!running && !ok ? ' fail' : '');
    var head = el('div', 'activity-head');
    add(head, statusMark(running ? 'in-progress' : ok ? 'reviewed' : 'failed', title + (running ? ' — working, this can take a minute' : ok ? ' — done' : ' — stopped')));
    if (!running) add(head, linkButton('Dismiss', function () { box.hidden = true; }));
    box.appendChild(head);
    if (running) return;
    var steps = (data && data.steps) || [];
    if (steps.length) {
      var list = el('ol', 'action-steps');
      steps.forEach(function (step) {
        var info = describeStep(step);
        var li = el('li', 'action-step');
        add(li, statusMark(step.ok ? 'reviewed' : 'failed', info.title));
        if (step.ok && info.detail) add(li, el('div', 'meta', info.detail));
        if (!step.ok) add(li, el('div', 'meta fail', friendlyError(step.stderr || step.stdout)));
        list.appendChild(li);
      });
      box.appendChild(list);
    }
    if (!ok && (requestError || (!steps.length && data && data.error))) add(box, el('div', 'meta fail', requestError || data.error));
    var raw = [];
    steps.forEach(function (step) {
      raw.push('> ' + step.command + ' (exit ' + step.exitCode + ')');
      if (step.stdout) raw.push(step.stdout);
      if (step.stderr) raw.push(step.stderr);
    });
    if (raw.length) {
      var log = el('details', 'action-log');
      add(log, el('summary', null, 'Technical log'), el('pre', null, raw.join('\n')));
      box.appendChild(log);
    }
    if (ok) activityTimer = window.setTimeout(function () { if (!box.matches(':hover')) box.hidden = true; }, 12000);
  }
  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll('button.act').forEach(function (b) { setBlocked(b, b.getAttribute('data-blocked') === '1'); });
    updateModelControls();
  }
  function postAction(payload, label) {
    if (state.busy) return Promise.resolve(null);
    var title = label || ACTION_TITLES[payload.action] || 'Workflow action';
    setBusy(true);
    showActivity(title, null, true);
    return fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      data = data || {};
      showActivity(title, data, false);
      state.recent.unshift({ at: new Date().toISOString(), title: title, ok: Boolean(data.ok) });
      state.recent = state.recent.slice(0, 6);
      return data;
    }).catch(function (err) {
      showActivity(title, {}, false, 'Request failed: ' + (err.message || err));
      return { ok: false };
    }).then(function (data) {
      setBusy(false);
      state.lastText = '';
      return refresh().then(function () { return data; });
    });
  }

  /* ---------- AI task ---------- */
  var STAGE_INFO = {
    relevance: ['AI relevance check', 'The AI judges whether this article helps answer the approved question and quotes the passages that support its verdict. Every quote is checked against the article text.'],
    extract: ['AI extraction', 'The AI extracts dated, attributed observations from the admitted article and maps them to the information requirements. Every quote must match the article.'],
    build: ['AI synthesis Build', 'The AI proposes atomic claims from the reviewed observations. Confidence is capped by how many independent sources support each claim.'],
    challenge: ['AI Challenge', 'The AI tests every claim against a fixed checklist (independence, alternative explanations, overreach) so you can decide what stands.'],
    'key-judgements': ['AI key-judgement selection', 'The AI selects at most one key judgement per requirement from the claims you accepted, or explains why none qualifies.'],
    'memo-writer': ['AI memo writer', 'The AI writes the memo using only the selected judgements and claims. The workflow verifies every citation before committing it.']
  };
  function parseAnswer(text) {
    var cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    var starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter(function (i) { return i >= 0; });
    if (!starts.length) return { error: 'No JSON found yet.' };
    var body = cleaned.slice(Math.min.apply(null, starts));
    var ends = [body.length, body.lastIndexOf('}') + 1, body.lastIndexOf(']') + 1];
    for (var i = 0; i < ends.length; i++) {
      if (ends[i] <= 0) continue;
      try { return { value: JSON.parse(body.slice(0, ends[i])) }; } catch (e) { /* try a shorter slice */ }
    }
    try { JSON.parse(body); } catch (e2) { return { error: 'Not valid JSON yet: ' + e2.message }; }
    return { error: 'Not valid JSON yet.' };
  }
  function describeJson(value, expected) {
    if (Array.isArray(value)) return { ok: true, text: 'Valid JSON · list of ' + plural(value.length, 'item') };
    var keys = Object.keys(value || {});
    var parts = keys.slice(0, 6).map(function (k) { return Array.isArray(value[k]) ? k + ' (' + value[k].length + ')' : k; });
    var missing = (expected || []).filter(function (k) { return keys.indexOf(k) < 0; });
    return {
      ok: missing.length === 0,
      text: 'Valid JSON · ' + parts.join(', ') + (keys.length > 6 ? ' …' : '') + (missing.length ? ' · missing: ' + missing.join(', ') : '')
    };
  }
  function aiTask(kind, item) {
    var stage = kind === 'relevance' ? 'relevance' : item.stage;
    var info = STAGE_INFO[stage] || [item.label || 'AI step', ''];
    var path = item.requestPath;
    var wrap = el('div');
    add(wrap, el('p', 'meta prose', info[1]));
    var selectedModel = modelForStage(stage);
    add(wrap, el('p', 'meta', selectedModel ? 'Model: ' + selectedModel + (state.stageModels[stage] ? ' (stage override)' : ' (default)') + '. Fresh session, no tools. The answer is validated before recording.' : 'Choose a model in Settings before running Copilot.'));
    var autoRow = el('div', 'btn-row');
    add(autoRow, actButton('Run with Copilot', 'btn-primary', function () {
      postAction({ action: 'run-ai-stage', runId: state.runId, requestPath: path, reviewerId: analyst() }, info[0] + ' with Copilot');
    }, true, !selectedModel), linkButton('Model settings', function () { selectTab('settings', true); }));
    wrap.appendChild(autoRow);
    var manual = el('details', 'drawer');
    manual.appendChild(el('summary', null, 'Manual copy/paste fallback'));
    var steps = el('ol', 'ai-task');

    var s1 = el('li', state.promptAt[path] ? 'done' : '');
    add(s1, el('div', 'step-title', 'Copy the prompt'), el('div', 'meta', 'Open a new Copilot chat and paste it there. A fresh chat keeps earlier context out of the answer.'));
    var copyRow = el('div', 'btn-row');
    var copyStatus = el('span', 'meta', state.promptAt[path] ? 'Copied at ' + when(state.promptAt[path]) : '');
    add(copyRow, actButton('Copy prompt', 'btn-secondary', function () {
      copyStatus.textContent = 'Preparing…';
      var endpoint = kind === 'relevance' ? '/api/relevance-prompt' : '/api/stage-prompt';
      fetch(endpoint + '?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(path)).then(function (res) {
        if (!res.ok) throw new Error('Prompt not available (' + res.status + ')');
        return res.json();
      }).then(function (data) {
        state.promptAt[path] = new Date().toISOString();
        s1.className = 'done';
        return navigator.clipboard.writeText(data.prompt).then(function () {
          copyStatus.textContent = 'Copied (' + Math.round(data.prompt.length / 1000) + 'k characters). Paste it into a new Copilot chat.';
        }, function () {
          openSheet(info[0] + ' prompt — select all and copy', data.prompt);
          copyStatus.textContent = 'Clipboard blocked: the prompt is open on the right for manual copying.';
        });
      }).catch(function (err) { copyStatus.textContent = err.message; });
    }), copyStatus, artifactLink(path, 'Inspect request', true));
    s1.appendChild(copyRow);
    steps.appendChild(s1);

    var s2 = el('li');
    add(s2, el('div', 'step-title', 'Paste the JSON answer'));
    var answer = textInput('ans:' + path, '', '{ … }', true, 6);
    answer.className = 'answer-box';
    var check = el('div', 'json-check');
    var expected = kind === 'relevance' ? ['verdict', 'rationale', 'support', 'limitations'] : [];
    function runCheck() {
      if (!answer.value.trim()) { check.className = 'json-check'; check.textContent = ''; s2.className = ''; return; }
      var parsed = parseAnswer(answer.value);
      if (parsed.error) { check.className = 'json-check bad'; check.textContent = parsed.error; s2.className = ''; return; }
      var summary = describeJson(parsed.value, expected);
      check.className = 'json-check ' + (summary.ok ? 'ok' : 'bad');
      check.textContent = summary.text;
      s2.className = summary.ok ? 'done' : '';
    }
    answer.addEventListener('input', runCheck);
    add(s2, field('Copilot answer', answer, true), check);
    runCheck();
    steps.appendChild(s2);

    var s3 = el('li');
    add(s3, el('div', 'step-title', 'Record the answer'));
    var freshLabel = el('label', 'check');
    var fresh = el('input');
    fresh.type = 'checkbox';
    bindDraft(fresh, 'fresh:' + path, false);
    add(freshLabel, fresh, 'I pasted this prompt into a fresh Copilot chat');
    var problem = el('span', 'meta fail');
    var needsAnalyst = kind !== 'relevance';
    var record = actButton('Record answer', 'btn-primary', function () {
      var parsed = parseAnswer(answer.value);
      if (parsed.error) { problem.textContent = 'Paste a valid JSON answer first.'; answer.focus(); return; }
      if (!fresh.checked) { problem.textContent = 'Confirm the answer came from a fresh Copilot chat.'; return; }
      problem.textContent = '';
      var payload = kind === 'relevance'
        ? { action: 'record-relevance', runId: state.runId, requestPath: path, answer: answer.value, promptCopiedAt: state.promptAt[path] || '' }
        : { action: 'record-ai-stage', runId: state.runId, requestPath: path, reviewerId: analyst(), freshSession: true, answer: answer.value, promptCopiedAt: state.promptAt[path] || '' };
      postAction(payload, info[0]).then(function (data) {
        if (data && data.ok) { dropDrafts('ans:' + path); dropDrafts('fresh:' + path); }
      });
    }, needsAnalyst);
    var row = el('div', 'btn-row');
    add(row, record, needsAnalyst && !analyst() ? el('span', 'meta', 'Enter your analyst ID in the top bar first.') : null, problem);
    add(s3, freshLabel, row);
    steps.appendChild(s3);
    manual.appendChild(steps);
    wrap.appendChild(manual);
    return wrap;
  }

  /* ---------- Navigation ---------- */
  var ROUTES = {
    'home': { pane: 'now' },
    'new': { pane: 'brief', title: 'New analysis', sub: 'From a thesis to a research plan. You decide when collection starts.' },
    'intent': { pane: 'brief', title: 'Intent review', run: true },
    'analysis/evidence': { pane: 'sources', title: 'Evidence', run: true },
    'analysis/findings': { pane: 'synthesis', title: 'Findings', run: true },
    'review': { pane: 'memo', title: 'Publication review', run: true },
    'output': { pane: 'memo', title: 'Output', run: true },
    'audit': { pane: 'audit', title: 'Audit', run: true },
    'settings': { pane: 'settings', title: 'Settings', sub: 'Workflow models, keys and connections. Model choices are shared across analyses in this run folder.' }
  };
  var TAB_ROUTE = { now: 'home', brief: 'intent', sources: 'analysis/evidence', synthesis: 'analysis/findings', memo: 'review', audit: 'audit' };
  function currentRoute() {
    var route = (window.location.hash || '').replace(/^#\/?/, '');
    return ROUTES[route] ? route : 'home';
  }
  function applyRoute() {
    var route = currentRoute();
    var previous = state.route;
    state.route = route;
    state.newMode = route === 'new';
    if (route !== 'new' && route !== 'intent') state.draft = false;
    state.tab = ROUTES[route].pane;
    TABS.forEach(function (name) { document.getElementById('pane-' + name).hidden = name !== state.tab; });
    document.getElementById('nav-home').setAttribute('aria-current', route === 'home' ? 'page' : 'false');
    document.getElementById('nav-audit').setAttribute('aria-current', route === 'audit' ? 'page' : 'false');
    document.getElementById('nav-settings').setAttribute('aria-current', route === 'settings' ? 'page' : 'false');
    document.getElementById('nav-new').setAttribute('aria-current', route === 'new' ? 'page' : 'false');
    if (route === 'new' && previous !== 'new' && window.CTI.startNew) window.CTI.startNew();
    if (route === 'settings' && !state.catalogLoaded && !state.modelLoading) {
      if (state.settingsLoaded) loadModels();
      else loadSavedModel().then(function () { if (state.settingsLoaded) loadModels(); });
    }
    render(true);
    var target = state.pendingScroll;
    state.pendingScroll = null;
    window.requestAnimationFrame(function () {
      var id = target && (target.row ? 'src-' + target.row : target.round ? 'round-' + target.round : target.focus ? 'focus-' + target.focus : '');
      var node = id ? document.getElementById(id) : null;
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (previous !== route) window.scrollTo({ top: 0 });
    });
  }
  function navigate(route, target) {
    state.pendingScroll = target || null;
    if (currentRoute() === route && (window.location.hash || '') === '#/' + route) return applyRoute();
    window.location.hash = '#/' + route;
  }
  function go(target) {
    if (!target) return;
    if (target.row) { state.expanded[target.row] = true; state.sourceFilter = 'all'; state.selectedSource = target.row; }
    if (target.round) state.openRounds[target.round] = true;
    navigate(TAB_ROUTE[target.tab || 'now'] || 'home', target);
  }
  function selectTab(tab) { go({ tab: tab }); }
  function switchRun(runId) {
    if (!runId || runId === state.runId) return;
    state.runId = runId;
    state.lastText = '';
    state.expanded = {};
    state.openRounds = {};
    state.sourceFilter = '';
    var url = new URL(window.location.href);
    url.searchParams.set('run', runId);
    window.history.replaceState({}, '', url.toString());
    document.title = 'CTI workbench: ' + runId;
    refresh();
  }

  /* ---------- Run window header and activity strip ---------- */
  var PHASE_LABEL = { frame: 'Intent', collect: 'Evidence', evidence: 'Evidence', assure: 'Evidence', synthesise: 'Findings', memo: 'Writing' };
  var STAGES = [
    { label: 'Intent', phases: ['frame'] },
    { label: 'Evidence', phases: ['collect', 'evidence', 'assure'] },
    { label: 'Findings', phases: ['synthesise'] },
    { label: 'Writing', phases: ['memo'] },
    { label: 'Publication', phases: [] }
  ];
  var LIVE = { active: 1, ready: 1, stale: 1, attention: 1 };
  function stageStates(j) {
    var byKey = {};
    j.phases.forEach(function (p) { byKey[p.key] = p.state; });
    return STAGES.map(function (stage) {
      var states = stage.phases.map(function (k) { return byKey[k] || 'todo'; });
      if (!stage.phases.length) {
        var gate = j.memo && j.memo.gate;
        if (!gate) return 'todo';
        return gate.humanApprovalAvailable ? 'ready' : 'attention';
      }
      if (states.every(function (s) { return s === 'done'; })) return 'done';
      return states.some(function (s) { return LIVE[s]; }) ? 'ready' : 'todo';
    });
  }
  function renderStrip(j) {
    var strip = el('div', 'activity-strip');
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Analysis progress');
    var states = stageStates(j);
    var current = states.findIndex(function (s) { return s !== 'done'; });
    var now = el('span', 'now');
    var mine = j.queue.filter(function (q) { return q.actor === 'you'; })[0];
    var next = mine || j.queue[0];
    if (!next) {
      add(now, el('span', 'mark done', 'Nothing is waiting'));
    } else if (next.actor === 'you') {
      add(now, el('span', 'mark attention', 'Waiting for you'), next.title);
    } else {
      add(now, el('span', 'ai-mark', 'AI step ready'), next.title);
    }
    var list = el('ol', 'stages');
    STAGES.forEach(function (stage, i) {
      var li = el('li');
      if (i === current) li.setAttribute('aria-current', 'step');
      var cls = states[i] === 'done' ? 'mark done' : states[i] === 'attention' ? 'mark attention' : i === current ? 'mark running' : null;
      add(li, el('span', cls, stage.label));
      list.appendChild(li);
    });
    add(strip, now, list);
    if (next) add(strip, add(el('span', 'yours'), linkButton(next.actor === 'you' ? 'Open your next step' : 'Open the AI step', function () { go(next.target); })));
    return strip;
  }
  function renderDraftStrip() {
    var strip = el('div', 'activity-strip');
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Analysis progress');
    add(strip, add(el('span', 'now'), el('span', 'mark attention', 'Waiting for you'), 'Research plan drafted. Nothing has been collected.'));
    var list = el('ol', 'stages');
    STAGES.forEach(function (stage, i) {
      var li = el('li');
      if (i === 0) li.setAttribute('aria-current', 'step');
      add(li, el('span', i === 0 ? 'mark attention' : null, stage.label));
      list.appendChild(li);
    });
    add(strip, list, add(el('span', 'yours'), linkButton('Edit the question', function () { navigate('new'); })));
    return strip;
  }
  function renderHead() {
    var j = journey();
    var route = state.route || currentRoute();
    var def = ROUTES[route];
    var head = document.createDocumentFragment();
    if (route === 'home' || route === 'new') return replace(document.getElementById('run-head'), head);
    var crumb = el('a', 'parent-link', 'Home');
    crumb.href = '#/home';
    var title = el('div', 'page-head');
    add(title, crumb, el('h2', null, def.title));
    if (def.sub) add(title, el('div', 'meta', def.sub));
    if (route === 'intent' && state.draft) {
      var dq = document.getElementById('in-question').value.trim();
      var dg = document.getElementById('in-geo').value.trim();
      add(title, el('div', 'meta', ['Draft analysis ' + document.getElementById('in-run-id').value.trim(), dg, document.getElementById('in-audience').value.trim()].filter(Boolean).join(' · ') + '. Nothing has been collected.'));
      head.appendChild(title);
      add(head, el('p', 'question-line', dq || 'No question yet'), renderDraftStrip());
      return replace(document.getElementById('run-head'), head);
    }
    var scope = j && j.brief.scope;
    var q = j && j.brief.question;
    if (def.run) {
      var bits = ['Analysis ' + state.runId];
      if (scope) bits.push((scope.geographies || []).join(', '), (scope.from || '').slice(0, 10) + ' → ' + (scope.to || '').slice(0, 10), scope.audience);
      add(title, el('div', 'meta', bits.filter(Boolean).join(' · ')));
    }
    if (route === 'review' && j && j.memo) {
      var keys = el('div', 'keys');
      keys.setAttribute('aria-label', 'Keyboard shortcuts');
      add(keys, add(el('span'), el('kbd', null, 'J'), el('kbd', null, 'K'), ' next, previous claim'), add(el('span'), el('kbd', null, 'Esc'), ' deselect'));
      title.classList.add('head-keys');
      title.appendChild(keys);
    }
    head.appendChild(title);
    if (def.run && j) {
      add(head, el('p', 'question-line', q ? q.question : 'No approved question yet'), renderStrip(j));
    }
    replace(document.getElementById('run-head'), head);
  }
  function renderCounts() {
    var j = journey();
    if (!j) return;
    function count(id, n) { document.getElementById(id).textContent = n ? String(n) : ''; }
    count('count-home', j.queue.filter(function (q) { return q.actor === 'you'; }).length);
    count('count-audit', (state.view.counts && state.view.counts.openExceptions) || 0);
  }

  /* ---------- Home ---------- */
  var HOME_FILTERS = [['all', 'All'], ['decision', 'Decisions'], ['ai', 'AI steps'], ['option', 'Next options']];
  var KIND_LABEL = { decision: 'Decision for you', ai: 'AI step', option: 'Next option' };
  var WINDOW_LABEL = { now: 'Home', brief: 'Intent', sources: 'Evidence', synthesis: 'Findings', memo: 'Publication review', audit: 'Audit' };
  function homeItems(j) {
    var items = [];
    j.queue.forEach(function (q, i) {
      var kind = q.actor === 'you' ? 'decision' : 'ai';
      items.push({ id: kind + ':' + i + ':' + q.title, kind: kind, title: q.title, detail: q.detail, phase: q.phase, target: q.target });
    });
    j.suggestions.forEach(function (s, i) {
      items.push({ id: 'option:' + i + ':' + s.title, kind: 'option', title: s.title, detail: s.detail, phase: '', target: s.target });
    });
    return items;
  }
  function itemMark(item) {
    if (item.kind === 'decision') return el('span', 'mark attention', 'Waiting for you');
    if (item.kind === 'ai') return el('span', 'ai-mark', 'AI step ready');
    return el('span', 'mark', 'Suggested');
  }
  function queueRow(id, title, age, meta, mark, selected, onClick) {
    var li = el('li');
    var b = el('button', 'queue-item');
    b.type = 'button';
    b.setAttribute('data-id', id);
    b.setAttribute('aria-current', selected ? 'true' : 'false');
    add(b, el('span', 'q-title', title), age ? el('span', 'q-age', age) : null, el('span', 'q-meta', meta || ''), add(el('span', 'q-state'), mark));
    b.addEventListener('click', onClick);
    li.appendChild(b);
    return li;
  }
  function factList(pairs) {
    var dl = el('dl', 'facts');
    pairs.forEach(function (pair) {
      if (pair[1] === undefined || pair[1] === null || pair[1] === '') return;
      add(dl, el('dt', null, pair[0]), add(el('dd'), pair[1]));
    });
    return dl;
  }
  function homeVisible(j) {
    var all = homeItems(j);
    return all.filter(function (i) { return state.homeFilter === 'all' || i.kind === state.homeFilter; });
  }
  function homeSelect(id) {
    state.homeSel = id;
    renderNow();
    var btn = document.querySelector('#pane-now .queue-item[data-id="' + id.replace(/"/g, '\\"') + '"]');
    if (btn) btn.focus();
  }
  function homeMove(step) {
    var j = journey();
    if (!j) return;
    var list = homeVisible(j);
    if (!list.length) return;
    var idx = list.map(function (i) { return i.id; }).indexOf(state.homeSel);
    homeSelect(list[Math.max(0, Math.min(list.length - 1, idx + step))].id);
  }
  function homeDetail(item, j) {
    var box = el('div', 'detail-body');
    if (!item) {
      add(box, add(el('div', 'empty-state'), el('h3', null, j.queue.length || j.suggestions.length ? 'Choose an item' : 'Nothing is waiting'), el('p', null, j.queue.length || j.suggestions.length ? 'Select a row on the left, or press J.' : 'Every started step is complete. Open an analysis step or start a new analysis.')));
      return box;
    }
    var plate = el('div', 'plate');
    var kicker = el('div', 'plate-kicker');
    add(kicker, itemMark(item), el('span', null, KIND_LABEL[item.kind] + (item.phase ? ' · ' + (PHASE_LABEL[item.phase] || '') : '')));
    var title = el('h3', 'plate-title', item.title);
    title.id = 'detail-title';
    var open = el('button', 'btn-primary', item.kind === 'ai' ? 'Open the AI step' : 'Open');
    open.type = 'button';
    open.addEventListener('click', function () { go(item.target); });
    var actions = el('div', 'btn-row');
    add(actions, open);
    if (item.kind === 'ai') {
      add(actions, actButton('Check next step', 'btn-inverse', function () { postAction({ action: 'run-next', runId: state.runId }); }));
    }
    add(plate, kicker, title, el('p', 'plate-confirm', item.detail), actions);
    box.appendChild(plate);

    var row = item.target && item.target.row ? j.sources.filter(function (r) { return r.id === item.target.row; })[0] : null;
    var lead = row && row.lead;
    var facts = factList([
      ['Kind', KIND_LABEL[item.kind]],
      ['Phase', PHASE_LABEL[item.phase] || ''],
      ['Opens', item.target ? WINDOW_LABEL[item.target.tab || 'now'] || '' : ''],
      ['Source', row ? row.title : ''],
      ['Article', row && row.url ? externalLink(row.url) : ''],
      ['Publisher', row ? row.publisher : ''],
      ['Seerist score', lead ? String(lead.score) : ''],
      ['Published', lead && lead.providerTimestamp ? lead.providerTimestamp.slice(0, 10) : '']
    ]);
    add(box, add(el('section'), sectionHead('Facts', 'h3'), facts));
    return box;
  }
  function renderNow() {
    var j = journey();
    var pane = document.createDocumentFragment();
    var host = document.getElementById('pane-now');
    if (!j) { add(pane, el('div', 'empty', 'Loading…')); return replace(host, pane); }
    var q = j.brief.question;
    var all = homeItems(j);
    var waiting = all.filter(function (i) { return i.kind === 'decision'; }).length;
    var head = el('div', 'page-head home-head');
    var titleBox = el('div');
    add(titleBox, el('h2', null, 'Home'), el('p', 'meta', plural(waiting, 'decision') + ' waiting. The workflow moves only when you decide.'),
      el('p', 'meta', 'Analysis ' + state.runId + (q ? ' · ' + q.question : '')));
    var keys = el('div', 'keys');
    keys.setAttribute('aria-label', 'Keyboard shortcuts');
    add(keys, add(el('span'), el('kbd', null, 'J'), el('kbd', null, 'K'), ' next, previous'));
    var newBtn = el('button', 'btn-primary', 'New analysis');
    newBtn.type = 'button';
    newBtn.addEventListener('click', function () { navigate('new'); });
    add(head, titleBox, add(el('div', 'head-actions'), keys, newBtn));
    pane.appendChild(head);

    var visible = homeVisible(j);
    var selected = visible.filter(function (i) { return i.id === state.homeSel; })[0] || visible[0] || null;
    state.homeSel = selected ? selected.id : '';

    var inbox = el('div', 'inbox');
    var listCol = el('div');
    var filters = el('div', 'filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter the list');
    HOME_FILTERS.forEach(function (def) {
      var n = def[0] === 'all' ? all.length : all.filter(function (i) { return i.kind === def[0]; }).length;
      var b = el('button', 'chip-btn', def[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', state.homeFilter === def[0] ? 'true' : 'false');
      add(b, el('span', 'n', n));
      b.addEventListener('click', function () { state.homeFilter = def[0]; renderNow(); });
      filters.appendChild(b);
    });
    listCol.appendChild(filters);
    if (visible.length) {
      var list = el('ul', 'queue');
      list.setAttribute('aria-label', 'Decisions, AI steps and next options');
      visible.forEach(function (item) {
        list.appendChild(queueRow(item.id, item.title, PHASE_LABEL[item.phase] || '', item.detail, itemMark(item), selected && item.id === selected.id, function () { homeSelect(item.id); }));
      });
      listCol.appendChild(list);
    } else {
      add(listCol, add(el('div', 'empty-state'), el('h3', null, 'Nothing in this view'), el('p', null, 'Nothing of this kind is waiting. Choose another filter or All.')));
    }

    var runs = (state.view.availableRuns || []).map(function (r) { return r.runId; });
    if (runs.indexOf(state.runId) < 0) runs.unshift(state.runId);
    add(listCol, add(el('h3', 'group-head'), 'Your analyses ', el('span', 'meta', String(runs.length))));
    var rl = el('ul', 'queue');
    rl.setAttribute('aria-label', 'Your analyses');
    runs.forEach(function (id) {
      var cur = id === state.runId;
      rl.appendChild(queueRow('run:' + id, id, '', cur && q ? q.question : '', cur ? el('span', 'mark covered', 'Open now') : el('span', 'meta', 'Open'), false, function () { if (!cur) switchRun(id); }));
    });
    listCol.appendChild(rl);

    var detail = el('section', 'detail');
    detail.setAttribute('aria-live', 'polite');
    detail.appendChild(homeDetail(selected, j));
    add(inbox, listCol, detail);
    pane.appendChild(inbox);
    replace(host, pane);
  }

  /* Brief, Sources, Synthesis, Memo and Audit register themselves from run_panes.js. */
  var panes = {};

  function settingsMessage(text, failed) {
    var status = document.getElementById('copilot-setting-status');
    status.textContent = text;
    status.className = 'meta' + (failed ? ' fail' : '');
  }
  function modelForStage(stage) {
    return state.stageModels[stage] ? state.stageModels[stage].model : state.copilotModel;
  }
  function modelName(id) {
    var match = state.modelCatalog.find(function (model) { return model.id === id; });
    return match ? match.name : id;
  }
  function modelsChanged() {
    return state.draftModel !== state.copilotModel || state.modelWorkflow.some(function (step) {
      return step.kind === 'ai' && (state.draftStages[step.id] || '') !== (state.stageModels[step.id] ? state.stageModels[step.id].model : '');
    });
  }
  function modelAvailable(id) {
    return state.modelCatalog.some(function (model) { return model.id === id; });
  }
  function updateModelControls() {
    var locked = state.modelSaving || state.modelLoading || state.busy || !state.settingsLoaded;
    document.querySelector('.model-settings').classList.toggle('has-model-changes', modelsChanged() || state.modelSaving);
    var questionModel = modelForStage('research-question');
    document.getElementById('draft-question-model').textContent = questionModel ? 'Research planning model: ' + modelName(questionModel) + (state.stageModels['research-question'] ? ' (stage override).' : ' (default).') : 'Choose and save a model in Settings before generating a plan.';
    setBlocked(document.getElementById('btn-draft-question'), !questionModel);
    var valid = state.catalogLoaded && modelAvailable(state.draftModel) && Object.keys(state.draftStages).every(function (id) {
      return !state.draftStages[id] || modelAvailable(state.draftStages[id]);
    });
    document.getElementById('btn-save-model').disabled = locked || !valid || !modelsChanged();
    document.getElementById('btn-discard-models').disabled = locked || !modelsChanged();
    document.getElementById('btn-refresh-models').disabled = state.modelSaving || state.modelLoading || state.busy;
    document.getElementById('copilot-model').disabled = locked || !state.catalogLoaded || !state.modelCatalog.length;
    document.querySelectorAll('#model-workflow select').forEach(function (select) {
      select.disabled = locked || !state.catalogLoaded || !state.modelCatalog.length;
      var id = select.getAttribute('data-stage');
      var model = state.draftStages[id] || state.draftModel;
      var hint = document.getElementById('model-effective-' + id);
      hint.textContent = model ? (state.draftStages[id] ? 'Override: ' : 'Default: ') + modelName(model) + (state.catalogLoaded && !modelAvailable(model) ? ' (unavailable)' : '') : 'No default selected';
      hint.className = 'meta model-step-effective' + (state.catalogLoaded && (!model || !modelAvailable(model)) ? ' fail' : '');
    });
  }
  function fillModelSelect(select, selected, placeholder) {
    clear(select);
    var empty = el('option', null, placeholder);
    empty.value = '';
    select.appendChild(empty);
    state.modelCatalog.forEach(function (model) {
      var option = el('option', null, model.name);
      option.value = model.id;
      select.appendChild(option);
    });
    if (selected && !modelAvailable(selected)) {
      var missing = el('option', null, selected + (state.catalogLoaded ? ' (unavailable)' : ' (not checked)'));
      missing.value = selected;
      missing.disabled = true;
      select.appendChild(missing);
    }
    select.value = selected || '';
  }
  function renderModelSettings() {
    fillModelSelect(document.getElementById('copilot-model'), state.draftModel, 'Choose a default model');
    var host = document.getElementById('model-workflow');
    clear(host);
    var index = 0;
    state.modelWorkflow.forEach(function (step) {
      var ai = step.kind === 'ai';
      var row = el('li', 'model-step' + (ai ? ' model-step-ai' : ''));
      var marker = el('span', 'model-step-marker', ai ? String(++index) : step.kind === 'human' ? 'H' : 'S');
      marker.setAttribute('aria-hidden', 'true');
      var copy = el('div', 'model-step-copy');
      add(copy, el('h4', null, step.label), el('span', 'actor' + (ai ? ' ai' : step.kind === 'human' ? ' you' : ''), ai ? 'AI reasoning' : step.kind === 'human' ? 'Human decision' : 'Deterministic'));
      copy.appendChild(el('p', 'meta', step.description));
      add(row, marker, copy);
      if (ai) {
        var control = el('div', 'model-step-control');
        var label = el('label', null, 'GitHub Copilot');
        label.htmlFor = 'stage-model-' + step.id;
        var select = el('select');
        select.id = label.htmlFor;
        select.setAttribute('aria-label', step.label + ' model');
        select.setAttribute('data-stage', step.id);
        select.setAttribute('aria-describedby', 'model-effective-' + step.id);
        fillModelSelect(select, state.draftStages[step.id], 'Use default model');
        select.addEventListener('change', function () {
          if (select.value) state.draftStages[step.id] = select.value;
          else delete state.draftStages[step.id];
          updateModelControls();
          settingsMessage(modelsChanged() ? 'Unsaved changes. Save to apply to future AI invocations.' : 'No unsaved changes.');
        });
        var hint = el('span', 'meta model-step-effective');
        hint.id = 'model-effective-' + step.id;
        add(control, label, select, hint);
        row.appendChild(control);
      } else {
        row.appendChild(el('span', 'model-step-gate', 'No model assigned'));
      }
      host.appendChild(row);
    });
    var count = Object.keys(state.stageModels).length;
    document.getElementById('copilot-saved-model').textContent = state.copilotModel ? 'Saved default: ' + modelName(state.copilotModel) + ' · ' + count + ' stage override' + (count === 1 ? '' : 's') : 'No model selected.';
    updateModelControls();
  }
  var savedModelRequest = null;
  function loadSavedModel() {
    if (savedModelRequest) return savedModelRequest;
    savedModelRequest = fetch('/api/copilot-settings', { cache: 'no-store' }).then(function (res) { return res.json(); }).then(function (data) {
      if (data.error) throw new Error(data.error);
      state.copilotModel = data.settings.model;
      state.stageModels = data.settings.stages || {};
      state.draftModel = state.copilotModel;
      state.draftStages = {};
      Object.keys(state.stageModels).forEach(function (id) { state.draftStages[id] = state.stageModels[id].model; });
      state.modelWorkflow = data.workflow;
      state.settingsLoaded = true;
      renderModelSettings();
      render(true);
    }).catch(function (error) {
      settingsMessage(error.message + ' Refresh models to retry.', true);
      document.getElementById('btn-refresh-models').disabled = false;
    }).finally(function () { savedModelRequest = null; });
  }
  function loadModels() {
    if (state.modelLoading || state.modelSaving || state.busy) return;
    state.modelLoading = true;
    updateModelControls();
    settingsMessage('Loading models from local Copilot...');
    document.getElementById('copilot-connection-status').textContent = 'Checking your local Copilot account...';
    return fetch('/api/copilot-models', { cache: 'no-store' }).then(function (res) { return res.json(); }).then(function (data) {
      if (data.error) throw new Error(data.error);
      state.modelCatalog = data.models;
      state.catalogLoaded = true;
      var unavailable = (state.draftModel && !modelAvailable(state.draftModel)) || Object.keys(state.draftStages).some(function (id) { return !modelAvailable(state.draftStages[id]); });
      document.getElementById('copilot-connection-status').textContent = data.models.length ? 'Connected · ' + data.models.length + ' models available from your account.' : 'Connected, but this account has no available models.';
      renderModelSettings();
      settingsMessage(!data.models.length ? 'No models available for this account.' : unavailable ? 'A selected model is unavailable. Choose a replacement or use the default before saving.' : modelsChanged() ? 'Models refreshed. Your unsaved selections are retained.' : 'Models loaded. Choose a default and optional stage overrides.', !data.models.length || Boolean(unavailable));
    }).catch(function (error) {
      state.catalogLoaded = false;
      document.getElementById('copilot-connection-status').textContent = 'Connection check failed. Refresh models to retry.';
      settingsMessage(error.message, true);
    }).finally(function () {
      state.modelLoading = false;
      updateModelControls();
    });
  }

  /* ---------- Refresh and render ---------- */
  function isTyping() {
    var active = document.activeElement;
    return Boolean(active && active.closest && active.closest('main') && /^(TEXTAREA|INPUT|SELECT)$/.test(active.tagName) && active.type !== 'checkbox');
  }
  function render(force) {
    if (!state.view) return;
    if (!force && isTyping()) { state.pendingRender = true; return; }
    state.pendingRender = false;
    syncRunSelect();
    renderHead();
    renderCounts();
    renderNow();
    Object.keys(panes).forEach(function (name) { panes[name](); });
    setBusy(state.busy);
  }
  function syncRunSelect() {
    var sel = document.getElementById('run-select');
    var runs = (state.view.availableRuns || []).map(function (r) { return r.runId; });
    if (runs.indexOf(state.runId) < 0) runs.unshift(state.runId);
    var key = runs.join('|') + '#' + state.runId;
    if (sel.getAttribute('data-key') === key) return;
    sel.setAttribute('data-key', key);
    clear(sel);
    runs.forEach(function (id) {
      var o = el('option', null, id);
      o.value = id;
      if (id === state.runId) o.selected = true;
      sel.appendChild(o);
    });
  }
  function refresh() {
    return fetch('/api/run?run=' + encodeURIComponent(state.runId)).then(function (res) {
      if (!res.ok) throw new Error('Run data unavailable');
      return res.text();
    }).then(function (text) {
      if (text === state.lastText) return;
      state.lastText = text;
      state.view = JSON.parse(text);
      state.runId = state.view.runId || state.runId;
      render(false);
    }).catch(function () {
      replace(document.getElementById('run-head'), add(document.createDocumentFragment(), el('div', 'meta fail', 'Could not load this analysis. Check that the server is running and refresh.')));
    });
  }

  window.CTI = {
    state: state, el: el, add: add, clear: clear, replace: replace, humanise: humanise, capital: capital, when: when, plural: plural,
    analyst: analyst, journey: journey, statusMark: statusMark, actorMark: actorMark, lifecycle: lifecycle, artifactLink: artifactLink,
    linkButton: linkButton, actButton: actButton, setBlocked: setBlocked, sectionHead: sectionHead, kv: kv, externalLink: externalLink, bindDraft: bindDraft,
    dropDrafts: dropDrafts, field: field, selectInput: selectInput, textInput: textInput, openSheet: openSheet, viewArtifact: viewArtifact,
    postAction: postAction, aiTask: aiTask, go: go, navigate: navigate, selectTab: selectTab, switchRun: switchRun, render: render, refresh: refresh, panes: panes,
    STEP_MARK: STEP_MARK
  };

  /* ---------- Wiring ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var analystInput = document.getElementById('analyst-id');
    try { analystInput.value = localStorage.getItem('cti_reviewer_id') || ''; } catch (e) { /* storage unavailable */ }
    analystInput.classList.toggle('missing', !analyst());
    var authAccount = document.getElementById('auth-account');
    var signOut = document.getElementById('sign-out');
    function checkAuthSession() {
      fetch('/api/auth/session', { cache: 'no-store' }).then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || 'Authentication status could not be checked.');
          return data;
        });
      }).then(function (session) {
        if (session.enabled && !session.authenticated) {
          window.location.assign('/');
          return;
        }
        if (session.enabled && session.user) {
          analystInput.value = session.user.username;
          analystInput.readOnly = true;
          analystInput.classList.remove('missing');
          authAccount.textContent = session.user.displayName;
          authAccount.hidden = false;
          signOut.hidden = false;
        } else {
          analystInput.readOnly = false;
          authAccount.hidden = true;
          signOut.hidden = true;
        }
      }).catch(function () {});
    }
    checkAuthSession();
    window.setInterval(checkAuthSession, 60000);
    signOut.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function () { window.location.assign('/'); });
    });
    var analystTimer = null;
    analystInput.addEventListener('input', function () {
      try { localStorage.setItem('cti_reviewer_id', analyst()); } catch (e) { /* storage unavailable */ }
      analystInput.classList.toggle('missing', !analyst());
      setBusy(state.busy);
      window.clearTimeout(analystTimer);
      analystTimer = window.setTimeout(function () { render(true); }, 400);
    });

    document.getElementById('run-select').addEventListener('change', function (e) { switchRun(e.target.value); });
    window.addEventListener('hashchange', applyRoute);
    document.getElementById('btn-close-sheet').addEventListener('click', closeSheet);
    document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
    document.getElementById('btn-copy-sheet').addEventListener('click', function () {
      var text = document.getElementById('viewer').textContent;
      navigator.clipboard.writeText(text).catch(function () { /* user can still select the text */ });
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
      if (state.route === 'review' && window.CTI.reviewKey && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target && e.target.matches && e.target.matches('input, textarea, select'))) window.CTI.reviewKey(e);
      if (state.route !== 'home' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); homeMove(1); }
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); homeMove(-1); }
    });
    document.getElementById('main').addEventListener('focusout', function () {
      window.setTimeout(function () { if (state.pendingRender && !isTyping()) render(false); }, 60);
    });

    var themeToggle = document.getElementById('theme-toggle');
    function syncTheme() {
      var dark = document.documentElement.classList.contains('dark');
      themeToggle.textContent = dark ? 'Light theme' : 'Dark theme';
      themeToggle.setAttribute('aria-pressed', String(dark));
    }
    themeToggle.addEventListener('click', function () {
      var dark = !document.documentElement.classList.contains('dark');
      document.documentElement.classList.toggle('dark', dark);
      try { localStorage.setItem('app_theme', dark ? 'dark' : 'light'); } catch (e) { /* storage unavailable */ }
      syncTheme();
    });
    document.getElementById('btn-refresh-models').addEventListener('click', function () {
      if (state.settingsLoaded) loadModels();
      else loadSavedModel().then(function () { if (state.settingsLoaded) loadModels(); });
    });
    document.getElementById('copilot-model').addEventListener('change', function (event) {
      state.draftModel = event.target.value || null;
      updateModelControls();
      settingsMessage(modelsChanged() ? 'Unsaved changes. Stages using the default will follow this model.' : 'No unsaved changes.');
    });
    document.getElementById('btn-discard-models').addEventListener('click', function () {
      state.draftModel = state.copilotModel;
      state.draftStages = {};
      Object.keys(state.stageModels).forEach(function (id) { state.draftStages[id] = state.stageModels[id].model; });
      renderModelSettings();
      settingsMessage('Unsaved changes discarded.');
    });
    document.getElementById('btn-save-model').addEventListener('click', function () {
      if (state.modelSaving || state.modelLoading || state.busy) return;
      var stages = {};
      Object.keys(state.draftStages).forEach(function (id) {
        stages[id] = { provider: 'github-copilot-sdk', model: state.draftStages[id] };
      });
      state.modelSaving = true;
      updateModelControls();
      settingsMessage('Checking model availability and saving...');
      postAction({ action: 'save-copilot-settings', model: state.draftModel, stages: stages }, 'Saving model settings').then(function (data) {
        if (!data || !data.ok) {
          settingsMessage(data && data.error || 'Could not save the model. Refresh models and retry.', true);
          return;
        }
        state.copilotModel = data.settings.model;
        state.stageModels = data.settings.stages;
        renderModelSettings();
        settingsMessage('Saved. Future AI invocations use these assignments. Recorded answers are unchanged.');
        render(true);
      }).finally(function () {
        state.modelSaving = false;
        updateModelControls();
      });
    });
    syncTheme();

    if (window.CTI.initBrief) window.CTI.initBrief();
    loadSavedModel();
    applyRoute();
    refresh();
    window.setInterval(function () { if (!document.hidden && !state.busy) refresh(); }, pollMs);
  });
})();
