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
    expanded: {},
    openRounds: {},
    drafts: {},
    promptAt: {},
    sourceFilter: '',
    leadFilter: 'pending',
    recent: [],
    dirty: {},
    copilotModel: null
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
    add(wrap, el('p', 'meta', state.copilotModel ? 'Model: ' + state.copilotModel + '. Fresh session, no tools. The answer is validated before recording.' : 'Choose a model in Settings before running Copilot.'));
    var autoRow = el('div', 'btn-row');
    add(autoRow, actButton('Run with Copilot', 'btn-primary', function () {
      postAction({ action: 'run-ai-stage', runId: state.runId, requestPath: path, reviewerId: analyst() }, info[0] + ' with Copilot');
    }, true, !state.copilotModel), linkButton('Model settings', function () { selectTab('settings', true); }));
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
  function selectTab(tab, focusTab) {
    if (TABS.indexOf(tab) < 0) tab = 'now';
    state.tab = tab;
    if (tab === 'settings' && !state.catalogLoaded) loadModels();
    TABS.forEach(function (name) {
      var button = document.getElementById('tab-' + name);
      var selected = name === tab;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      document.getElementById('pane-' + name).hidden = !selected;
    });
    if (focusTab) document.getElementById('tab-' + tab).focus();
    var url = new URL(window.location.href);
    url.hash = tab === 'now' ? '' : tab;
    window.history.replaceState({}, '', url.toString());
  }
  function go(target) {
    if (!target) return;
    if (target.row) { state.expanded[target.row] = true; state.sourceFilter = 'all'; }
    if (target.round) state.openRounds[target.round] = true;
    if (target.tab === 'brief') state.newMode = false;
    selectTab(target.tab || 'now');
    render(true);
    window.requestAnimationFrame(function () {
      var id = target.row ? 'src-' + target.row : target.round ? 'round-' + target.round : target.focus ? 'focus-' + target.focus : '';
      var node = id ? document.getElementById(id) : null;
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
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

  /* ---------- Header, progress and counts ---------- */
  var PHASE_WORDS = { done: ['reviewed', 'Done'], active: ['in-progress', 'In progress'], ready: ['pending', 'Ready'], stale: ['provisional', 'Out of date'], attention: ['failed', 'Needs attention'], todo: ['pending', 'Not started'] };
  var PHASE_TARGET = { frame: { tab: 'brief' }, collect: { tab: 'brief', focus: 'collect' }, evidence: { tab: 'sources' }, assure: { tab: 'sources' }, synthesise: { tab: 'synthesis' }, memo: { tab: 'memo' } };
  function renderHead() {
    var j = journey();
    var head = document.createDocumentFragment();
    var q = j && j.brief.question;
    var scope = j && j.brief.scope;
    add(head, el('div', 'meta', 'Analysis ' + state.runId));
    add(head, el('h2', 'run-question', q ? q.question : 'No approved question yet'));
    if (scope) {
      var facts = el('div', 'run-facts');
      [['Geographies', (scope.geographies || []).join(', ')], ['Window', (scope.from || '').slice(0, 10) + ' → ' + (scope.to || '').slice(0, 10)], ['Audience', scope.audience], ['Approved by', scope.approvedBy]].forEach(function (pair) {
        if (!pair[1]) return;
        var span = el('span');
        add(span, pair[0] + ': ', el('strong', null, pair[1]));
        facts.appendChild(span);
      });
      head.appendChild(facts);
    }
    replace(document.getElementById('run-head'), head);

    var bar = document.createDocumentFragment();
    (j ? j.phases : []).forEach(function (phase) {
      var li = el('li', 'phase ' + phase.state);
      var b = el('button');
      b.type = 'button';
      var word = PHASE_WORDS[phase.state] || ['pending', phase.state];
      var waiting = [];
      if (phase.waiting.you) waiting.push(phase.waiting.you + ' for you');
      if (phase.waiting.ai) waiting.push(phase.waiting.ai + ' AI');
      add(b, el('span', 'phase-label', phase.label), statusMark(word[0], word[1] + (waiting.length ? ' · ' + waiting.join(' · ') : '')), phase.summary ? el('span', 'phase-summary', phase.summary) : null);
      b.addEventListener('click', function () { go(PHASE_TARGET[phase.key]); });
      li.appendChild(b);
      bar.appendChild(li);
    });
    replace(document.getElementById('phasebar'), bar);

    function count(id, text, hot) {
      var node = document.getElementById(id);
      node.textContent = text;
      node.className = 'tab-count' + (hot ? ' hot' : '');
    }
    if (!j) return;
    var actionRows = j.sources.filter(function (r) { return r.state === 'action'; }).length;
    var roundWork = j.queue.filter(function (q) { return q.target.tab === 'synthesis'; }).length;
    count('count-now', j.queue.length ? String(j.queue.length) : '', j.queue.length > 0);
    count('count-sources', actionRows ? actionRows + ' / ' + j.sources.length : String(j.sources.length || ''), actionRows > 0);
    count('count-synthesis', roundWork ? String(roundWork) : (j.rounds.length ? 'R' + j.rounds.length : ''), roundWork > 0);
    count('count-memo', j.memo ? (j.memo.isCurrent ? 'draft' : 'out of date') : '', Boolean(j.memo && !j.memo.isCurrent));
    var openEx = (state.view.counts && state.view.counts.openExceptions) || 0;
    count('count-audit', openEx ? String(openEx) : '', openEx > 0);
  }

  /* ---------- Now ---------- */
  var PHASE_LABEL = { frame: 'Frame', collect: 'Collect', evidence: 'Admit evidence', assure: 'Assure sources', synthesise: 'Synthesise', memo: 'Memo' };
  function renderNow() {
    var j = journey();
    var pane = document.createDocumentFragment();
    if (!j) { add(pane, el('div', 'empty', 'Loading…')); return replace(document.getElementById('pane-now'), pane); }
    var split = el('div', 'split');
    var left = el('div');
    var right = el('div');

    if (j.queue.length) {
      var first = j.queue[0];
      var plate = el('section', 'plate');
      plate.setAttribute('aria-labelledby', 'next-title');
      var kicker = el('div', 'plate-kicker');
      add(kicker, actorMark(first.actor), 'Up next · ' + PHASE_LABEL[first.phase]);
      var title = el('h2', null, first.title);
      title.id = 'next-title';
      var go1 = el('button', 'btn-primary', first.actor === 'ai' ? 'Open the AI step' : 'Open');
      go1.type = 'button';
      go1.addEventListener('click', function () { go(first.target); });
      add(plate, kicker, title, el('div', 'meta', first.detail), add(el('div', 'btn-row'), go1));
      left.appendChild(plate);
      if (j.queue.length > 1) {
        var also = el('section');
        add(also, sectionHead('Also waiting (' + (j.queue.length - 1) + ')'));
        var list = el('ul', 'rows');
        j.queue.slice(1).forEach(function (item) {
          var li = el('li', 'queue-row');
          add(li, actorMark(item.actor), el('span', 'title', item.title), linkButton('Open', function () { go(item.target); }), el('span', 'meta', PHASE_LABEL[item.phase] + ' · ' + item.detail));
          list.appendChild(li);
        });
        also.appendChild(list);
        left.appendChild(also);
      }
    } else {
      var idle = el('section');
      add(idle, sectionHead('Nothing is waiting on you'), el('p', 'meta prose', 'Every started step is complete. Choose what to do next.'));
      left.appendChild(idle);
    }
    if (j.suggestions.length) {
      var sug = el('section');
      add(sug, sectionHead(j.queue.length ? 'When that is done' : 'Next options'));
      var sl = el('ul', 'rows');
      j.suggestions.forEach(function (s) {
        var li = el('li', 'queue-row');
        add(li, el('span'), el('span', 'title', s.title), linkButton('Open', function () { go(s.target); }), el('span', 'meta', s.detail));
        sl.appendChild(li);
      });
      sug.appendChild(sl);
      left.appendChild(sug);
    }

    var progress = el('section');
    add(progress, sectionHead('Evidence funnel', 'h2'));
    var funnel = el('p', 'funnel');
    j.funnel.forEach(function (f, idx) {
      if (idx) add(funnel, el('span', 'arrow', '→'));
      add(funnel, el('span', 'n', f.value), el('span', 'l', f.label.toLowerCase()));
    });
    add(progress, funnel, el('p', 'meta', 'Leads come from Seerist ranking. Only admitted, reviewed sources can support claims in the memo.'));
    right.appendChild(progress);

    var memoBox = el('section');
    add(memoBox, sectionHead('Memo', 'h2', j.memo ? linkButton('Read', function () { go({ tab: 'memo' }); }) : null));
    if (j.memo) {
      var m = j.memo;
      add(memoBox, statusMark(m.isCurrent ? 'reviewed' : 'provisional', m.isCurrent ? 'Current draft (round ' + m.roundIndex + ')' : 'Out of date: written from round ' + (m.roundIndex || '?') + ', latest is round ' + m.currentRound));
      add(memoBox, el('div', 'meta', plural(m.keyJudgments.length, 'key judgement') + ' · ' + when(m.createdAt)));
      if (m.blockers.length) add(memoBox, el('div', 'meta', 'Not publishable: ' + m.blockers.map(function (b) { return b.label.toLowerCase(); }).join('; ')));
    } else {
      add(memoBox, el('p', 'meta', 'No memo yet. It is written after the synthesis round and key-judgement selection.'));
    }
    right.appendChild(memoBox);

    var recent = el('section');
    add(recent, sectionHead('Recent activity', 'h2', linkButton('All events', function () { go({ tab: 'audit', focus: 'events' }); })));
    var rl = el('ul', 'rows activity-list');
    state.recent.forEach(function (r) {
      var li = el('li');
      add(li, el('span', 'meta figures', when(r.at)), statusMark(r.ok ? 'reviewed' : 'failed', r.title));
      rl.appendChild(li);
    });
    (state.view.events || []).slice(0, 8).forEach(function (ev) {
      var li = el('li');
      add(li, el('span', 'meta figures', when(ev.at)), el('span', null, capital(humanise(String(ev.type).replace(/\./g, ' '))) + (ev.actor === 'human' ? ' (you)' : '')));
      rl.appendChild(li);
    });
    if (!rl.firstChild) add(rl, add(el('li'), el('span', 'meta', 'No activity yet.')));
    recent.appendChild(rl);
    right.appendChild(recent);

    add(split, left, right);
    pane.appendChild(split);
    replace(document.getElementById('pane-now'), pane);
  }

  /* Brief, Sources, Synthesis, Memo and Audit register themselves from run_panes.js. */
  var panes = {};

  function settingsMessage(text, failed) {
    var status = document.getElementById('copilot-setting-status');
    status.textContent = text;
    status.className = 'meta' + (failed ? ' fail' : '');
  }
  function loadSavedModel() {
    return fetch('/api/copilot-settings').then(function (res) { return res.json(); }).then(function (data) {
      if (data.error) throw new Error(data.error);
      state.copilotModel = data.settings.model;
      document.getElementById('copilot-saved-model').textContent = state.copilotModel ? 'Saved for all AI stages: ' + state.copilotModel : 'No model selected.';
      render(true);
    }).catch(function (error) { settingsMessage(error.message, true); });
  }
  function loadModels() {
    if (state.modelLoading) return;
    state.modelLoading = true;
    var select = document.getElementById('copilot-model');
    var refreshButton = document.getElementById('btn-refresh-models');
    select.disabled = true;
    refreshButton.disabled = true;
    document.getElementById('btn-save-model').disabled = true;
    settingsMessage('Loading models from local Copilot...');
    fetch('/api/copilot-models').then(function (res) { return res.json(); }).then(function (data) {
      if (data.error) throw new Error(data.error);
      clear(select);
      var placeholder = el('option', null, 'Choose a model');
      placeholder.value = '';
      select.appendChild(placeholder);
      data.models.forEach(function (model) {
        var option = el('option', null, model.name);
        option.value = model.id;
        select.appendChild(option);
      });
      var available = data.models.some(function (model) { return model.id === state.copilotModel; });
      if (state.copilotModel && !available) {
        var missing = el('option', null, state.copilotModel + ' (unavailable)');
        missing.value = state.copilotModel;
        missing.disabled = true;
        select.appendChild(missing);
      }
      select.value = state.copilotModel || '';
      select.disabled = !data.models.length;
      state.catalogLoaded = true;
      document.getElementById('btn-save-model').disabled = !select.value || !available;
      settingsMessage(!data.models.length ? 'No models available for this account.' : state.copilotModel && !available ? 'The saved model is unavailable. Select another model and save it.' : 'Models loaded. Select a model and save.', !data.models.length || Boolean(state.copilotModel && !available));
    }).catch(function (error) { settingsMessage(error.message, true); }).finally(function () {
      state.modelLoading = false;
      refreshButton.disabled = false;
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
    postAction: postAction, aiTask: aiTask, go: go, selectTab: selectTab, switchRun: switchRun, render: render, refresh: refresh, panes: panes,
    STEP_MARK: STEP_MARK
  };

  /* ---------- Wiring ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var analystInput = document.getElementById('analyst-id');
    try { analystInput.value = localStorage.getItem('cti_reviewer_id') || ''; } catch (e) { /* storage unavailable */ }
    analystInput.classList.toggle('missing', !analyst());
    var analystTimer = null;
    analystInput.addEventListener('input', function () {
      try { localStorage.setItem('cti_reviewer_id', analyst()); } catch (e) { /* storage unavailable */ }
      analystInput.classList.toggle('missing', !analyst());
      setBusy(state.busy);
      window.clearTimeout(analystTimer);
      analystTimer = window.setTimeout(function () { render(true); }, 400);
    });

    document.getElementById('run-select').addEventListener('change', function (e) { switchRun(e.target.value); });
    document.getElementById('btn-new').addEventListener('click', function () {
      state.newMode = true;
      selectTab('brief');
      render(true);
      if (window.CTI.startNew) window.CTI.startNew();
    });
    TABS.forEach(function (name, idx) {
      var tab = document.getElementById('tab-' + name);
      tab.addEventListener('click', function () { selectTab(name); render(true); });
      tab.addEventListener('keydown', function (e) {
        var delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (e.key === 'Home') { e.preventDefault(); selectTab(TABS[0], true); return; }
        if (e.key === 'End') { e.preventDefault(); selectTab(TABS[TABS.length - 1], true); return; }
        if (!delta) return;
        e.preventDefault();
        selectTab(TABS[(idx + delta + TABS.length) % TABS.length], true);
      });
    });
    document.getElementById('btn-close-sheet').addEventListener('click', closeSheet);
    document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
    document.getElementById('btn-copy-sheet').addEventListener('click', function () {
      var text = document.getElementById('viewer').textContent;
      navigator.clipboard.writeText(text).catch(function () { /* user can still select the text */ });
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
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
      loadSavedModel();
      document.getElementById('btn-refresh-models').addEventListener('click', loadModels);
      document.getElementById('copilot-model').addEventListener('change', function (event) {
        document.getElementById('btn-save-model').disabled = !event.target.value || state.busy;
        settingsMessage('Selection not saved yet.');
      });
      document.getElementById('btn-save-model').addEventListener('click', function () {
        var model = document.getElementById('copilot-model').value;
        document.getElementById('btn-save-model').disabled = true;
        settingsMessage('Checking model availability and saving...');
        postAction({ action: 'save-copilot-settings', model: model }, 'Saving the model').then(function (data) {
          if (!data || !data.ok) {
            settingsMessage(data && data.error || 'Could not save the model. Refresh models and retry.', true);
            document.getElementById('btn-save-model').disabled = false;
            return;
          }
          state.copilotModel = data.settings.model;
          document.getElementById('copilot-saved-model').textContent = 'Saved for all AI stages: ' + state.copilotModel;
          settingsMessage('Saved. All automatic AI stages now use ' + state.copilotModel + '.');
          render(true);
        });
      });
    });
    syncTheme();

    if (window.CTI.initBrief) window.CTI.initBrief();
    selectTab((window.location.hash || '').replace('#', '') || 'now');
    refresh();
    window.setInterval(function () { if (!document.hidden && !state.busy) refresh(); }, pollMs);
  });
})();
