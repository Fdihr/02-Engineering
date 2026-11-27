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
    sourceFilter: '',
    sourceQuery: '',
    evidenceQuestion: '',
    evidenceView: 'coverage',
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
  var TABS = ['now', 'brief', 'memo', 'audit', 'settings'];

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
  function when(iso) {
    if (!iso) return '';
    if (typeof iso === 'number') return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
    return String(iso).slice(0, 16).replace('T', ' ');
  }
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
    'approve-intent': 'Approving research plan',
    'run-pipeline': 'Starting automated memo pipeline',
    'resume-pipeline': 'Resuming automated memo pipeline',
    'approve-and-publish': 'Publishing memo',
    'record-memo-review': 'Recording editorial feedback',
    'start-memo-revision': 'Running editorial revision',
    'resume-memo-revision': 'Resuming editorial revision',
    'discover-seerist': 'Collecting Seerist leads',
    'save-copilot-settings': 'Saving workflow models',
    'run-next': 'Checking next step'
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
    if (data && data.message) add(box, el('p', 'meta prose', data.message));
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

  /* ---------- Navigation ---------- */
  var ROUTES = {
    'home': { pane: 'now' },
    'new': { pane: 'brief', title: 'New analysis', sub: 'Gate 1 — Approve a research plan once; collection, quote verification and memo drafting run automatically.' },
    'intent': { pane: 'brief', title: 'Approved research plan', run: true },
    'analysis/evidence': { pane: 'memo', title: 'Memo', run: true },
    'analysis/findings': { pane: 'memo', title: 'Memo', run: true },
    'review': { pane: 'memo', title: 'Memo', run: true },
    'output': { pane: 'memo', title: 'Memo', run: true },
    'audit': { pane: 'audit', title: 'Audit', run: true },
    'settings': { pane: 'settings', title: 'Settings', sub: 'Workflow models, keys and connections. Model choices are shared across analyses in this run folder.' }
  };
  var TAB_ROUTE = { now: 'home', brief: 'intent', sources: 'review', synthesis: 'review', memo: 'review', audit: 'audit' };
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
    TABS.forEach(function (name) {
      var node = document.getElementById('pane-' + name);
      if (node) node.hidden = name !== state.tab;
    });
    var onMemo = state.tab === 'memo' || route === 'intent';
    document.getElementById('nav-home').setAttribute('aria-current', route === 'home' ? 'page' : 'false');
    var navReview = document.getElementById('nav-review');
    if (navReview) navReview.setAttribute('aria-current', onMemo ? 'page' : 'false');
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

  /* ---------- Run window header and 2-gate activity strip ---------- */
  function renderStrip(j) {
    var strip = el('div', 'activity-strip');
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Analysis progress');
    var v = state.view || {};
    var pipe = v.pipeline || null;
    var pStat = pipe ? (pipe.status || (pipe.state === 'memo-review' ? 'ready-for-review' : pipe.state) || '') : '';
    var pMsg = pipe ? (pipe.message || pipe.stageDetail || pipe.detail || '') : '';
    var mr = v.memoReview || null;
    var memo = j && j.memo;
    var intentDone = Boolean(j && j.brief && j.brief.scope && j.brief.question && j.brief.requirements && j.brief.requirements.length);
    var published = Boolean((mr && mr.publishedArtifactRef) || (memo && memo.gate && memo.gate.status === 'published'));
    var running = Boolean(pipe && (pipe.workerActive || pStat === 'running'));
    var failed = Boolean(pipe && (pStat === 'failed' || pStat === 'interrupted'));

    var now = el('span', 'now');
    if (published) {
      add(now, el('span', 'mark done', 'Published'), 'Gate 2 complete — published memo package on disk.');
    } else if (running) {
      add(now, el('span', 'ai-mark', 'Running pipeline'), pMsg || 'Gathering sources, checking quotes, and drafting memo.');
    } else if (memo) {
      add(now, el('span', 'mark covered', 'Ready for review'), 'Gate 2 — check inline source quotes and publish.');
    } else if (failed) {
      add(now, el('span', 'mark failed', 'Pipeline paused'), (pipe && pipe.error) || pMsg || 'Resume the automated pipeline from Memo.');
    } else if (intentDone) {
      add(now, el('span', 'mark attention', 'Plan approved'), 'Ready to run the automated memo pipeline.');
    } else {
      add(now, el('span', 'mark attention', 'Gate 1 pending'), 'Start or approve a research plan first.');
    }

    var steps = [
      { label: 'Gate 1: Plan', cls: intentDone ? 'mark done' : 'mark attention', cur: !intentDone },
      { label: 'Automated pipeline', cls: memo ? 'mark done' : running ? 'mark running' : failed ? 'mark failed' : null, cur: intentDone && !memo },
      { label: 'Gate 2: Publish', cls: published ? 'mark done' : memo ? 'mark covered' : null, cur: Boolean(memo && !published) }
    ];
    var list = el('ol', 'stages');
    steps.forEach(function (step) {
      var li = el('li');
      if (step.cur) li.setAttribute('aria-current', 'step');
      add(li, el('span', step.cls, step.label));
      list.appendChild(li);
    });
    add(strip, now, list);

    var route = state.route || currentRoute();
    if (route === 'intent') {
      add(strip, add(el('span', 'yours'), linkButton('Open Memo', function () { navigate('review'); })));
    } else if (intentDone) {
      add(strip, add(el('span', 'yours'), linkButton('Approved plan', function () { navigate('intent'); })));
    }
    return strip;
  }
  function renderHead() {
    var j = journey();
    var route = state.route || currentRoute();
    var def = ROUTES[route];
    var head = document.createDocumentFragment();
    if (route === 'home' || route === 'new' || route === 'settings') return replace(document.getElementById('run-head'), head);
    var crumb = el('a', 'parent-link', 'Analyses');
    crumb.href = '#/home';
    var title = el('div', 'page-head');
    add(title, crumb, el('h2', null, def.title));
    if (def.sub) add(title, el('div', 'meta', def.sub));
    var scope = j && j.brief.scope;
    var q = j && j.brief.question;
    if (def.run) {
      var bits = ['Analysis ' + state.runId];
      if (scope) bits.push((scope.geographies || []).join(', '), (scope.from || '').slice(0, 10) + ' → ' + (scope.to || '').slice(0, 10), scope.audience);
      add(title, el('div', 'meta', bits.filter(Boolean).join(' · ')));
    }
    if (state.tab === 'memo' && j && j.memo) {
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
  function renderCounts() {}

  /* ---------- Analyses overview (#/home) ---------- */
  function isReadyStatus(st) {
    return st === 'review' || st === 'ready-for-review';
  }
  function isApprovedStatus(st) {
    return st === 'intent-approved' || st === 'approved';
  }
  function isDraftStatus(st) {
    return !st || st === 'empty' || st === 'draft';
  }
  function runStatusMark(r) {
    var st = r.status || 'empty';
    if (st === 'published') return el('span', 'mark done', 'Published');
    if (isReadyStatus(st)) return el('span', 'mark covered', 'Ready for review');
    if (st === 'running') return el('span', 'ai-mark', 'Running pipeline');
    if (st === 'failed' || st === 'interrupted') return el('span', 'mark failed', st === 'interrupted' ? 'Interrupted' : 'Failed');
    if (st === 'in-progress') return el('span', 'mark attention', 'In progress');
    if (isApprovedStatus(st)) return el('span', 'mark attention', 'Plan approved');
    return el('span', 'mark', 'Draft');
  }
  function openRunMemo(id, status) {
    if (id !== state.runId) switchRun(id);
    if (isDraftStatus(status)) navigate('new');
    else navigate('review');
  }
  function homeMove() {}
  function renderNow() {
    var j = journey();
    var pane = document.createDocumentFragment();
    var host = document.getElementById('pane-now');
    if (!j) { add(pane, el('div', 'empty', 'Loading analyses…')); return replace(host, pane); }

    var head = el('div', 'page-head home-head');
    var titleBox = el('div');
    add(titleBox,
      el('h2', null, 'Analyses'),
      el('p', 'meta', 'Approve a research plan once (Gate 1), let the pipeline gather and verify sources automatically, and publish the finished memo (Gate 2).'));
    var newBtn = el('button', 'btn-primary', 'New analysis');
    newBtn.type = 'button';
    newBtn.addEventListener('click', function () { navigate('new'); });
    add(head, titleBox, add(el('div', 'head-actions'), newBtn));
    pane.appendChild(head);

    var runs = (state.view && state.view.availableRuns) ? state.view.availableRuns.slice() : [];
    if (!runs.some(function (r) { return r.runId === state.runId; }) && state.runId) {
      runs.unshift({
        runId: state.runId,
        question: (j.brief && j.brief.question && j.brief.question.question) || '',
        scopeSummary: '',
        status: j.memo ? 'ready-for-review' : 'draft',
        sourceCount: (state.view.counts && state.view.counts.assuredSources) || 0,
        updatedAt: state.view.generatedAt || ''
      });
    }

    var meaningful = runs.filter(function (r) { return !isDraftStatus(r.status) || r.question || r.fileCount > 0 || r.runId === state.runId; });
    if (!meaningful.length) {
      var empty = el('div', 'empty-state');
      add(empty, el('h3', null, 'No analyses yet'), el('p', null, 'Start a new analysis from a thesis or strategic question to generate your first evidence-grounded memo.'));
      pane.appendChild(empty);
      return replace(host, pane);
    }

    var wrap = el('div', 'table-wrap');
    var table = el('table', 'analyses-table');
    var thead = el('thead');
    var hr = el('tr');
    [['Analysis', ''], ['Status', ''], ['Assured sources', 'num'], ['Updated', 'num'], ['', 'num']].forEach(function (col) {
      var th = el('th', col[1] || null, col[0]);
      if (col[0]) th.setAttribute('scope', 'col');
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    meaningful.forEach(function (r) {
      var cur = r.runId === state.runId;
      var tr = el('tr', cur ? 'is-current' : '');
      var mainTd = el('td');
      var qText = r.question || (cur && j.brief && j.brief.question && j.brief.question.question) || 'No approved research plan yet';
      var subBits = [r.runId];
      if (r.scopeSummary) subBits.push(r.scopeSummary);
      add(mainTd, el('span', 'analysis-q', qText), el('span', 'analysis-sub', subBits.join(' · ')));

      var statusTd = el('td');
      statusTd.appendChild(runStatusMark(r));

      var srcTd = el('td', 'num', String(r.sourceCount || 0));
      var updTd = el('td', 'num meta', when(r.updatedAt || r.mtimeMs));

      var actTd = el('td', 'num');
      var readyOrPub = r.status === 'published' || isReadyStatus(r.status);
      var ctaLabel = readyOrPub ? 'Open memo' : isDraftStatus(r.status) ? 'Create plan' : 'Open pipeline';
      var openBtn = el('button', isReadyStatus(r.status) ? 'btn-primary' : 'btn-secondary', ctaLabel);
      openBtn.type = 'button';
      openBtn.addEventListener('click', function () { openRunMemo(r.runId, r.status); });
      actTd.appendChild(openBtn);

      add(tr, mainTd, statusTd, srcTd, updTd, actTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    pane.appendChild(wrap);
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
    postAction: postAction, go: go, navigate: navigate, selectTab: selectTab, switchRun: switchRun, render: render, refresh: refresh, panes: panes,
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
