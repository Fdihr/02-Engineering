(function () {
  'use strict';

  var C = window.CTI;
  var state = C.state;
  var el = C.el;
  var add = C.add;
  var humanise = C.humanise;
  var capital = C.capital;
  var when = C.when;
  var plural = C.plural;

  function step(title, children) {
    var panel = el('div', 'step-panel');
    add(panel, el('h4', null, title));
    children.forEach(function (child) { add(panel, child); });
    return panel;
  }
  function quoteList(items) {
    var list = el('ul', 'quote-list');
    items.forEach(function (item) {
      var li = el('li');
      add(li, el('blockquote', 'quote', item.quote), item.note ? el('div', 'meta', item.note) : null);
      list.appendChild(li);
    });
    return list;
  }
  function bullets(items) {
    var list = el('ul', 'bullets');
    items.forEach(function (text) { list.appendChild(el('li', null, text)); });
    return list;
  }
  var COVERAGE = { covered: ['committed', 'Covered'], partial: ['provisional', 'Partial'], silent: ['pending', 'No evidence'], contradicted: ['failed', 'Contradicted'] };
  function coverageMark(disposition) {
    var entry = COVERAGE[disposition] || ['pending', 'Not assessed yet'];
    return C.statusMark(entry[0], entry[1]);
  }
  function requirementText(irId) {
    var j = C.journey();
    var req = j ? j.brief.requirements.filter(function (r) { return r.irId === irId; })[0] : null;
    return req ? req.text : '';
  }

  /* ================= Brief ================= */
  var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
  var LENS_CONFIG = {
    ot: {
      label: 'wind farm OT/SCADA and grid interconnections',
      ir: 'Which state-linked or criminal actors conducted cyber intrusions, pre-positioning, or disruptive operations against energy, wind, grid, or OT/ICS infrastructure in the scoped geography?',
      queries: ['power grid cyberattack', 'energy infrastructure cyberattack'],
      terms: ['energy', 'power grid', 'electricity', 'wind', 'renewable', 'scada', 'operational technology', 'ics', 'substation', 'utility', 'state-sponsored']
    },
    mfg: {
      label: 'manufacturing and turbine assembly operations',
      ir: 'Which ransomware or extortion campaigns disrupted industrial manufacturing, engineering, or production operations in the scoped geography, and what changed in their targeting?',
      queries: ['ransomware manufacturing', 'ransomware energy company'],
      terms: ['ransomware', 'extortion', 'manufactur', 'industrial', 'production', 'factory', 'plant', 'disrupt', 'outage']
    },
    supply: {
      label: 'tier-1 industrial, OT vendor, and software supply chain',
      ir: 'Which software, firmware, or vendor supply-chain compromises affected industrial, energy, or enterprise environments relevant to Vestas suppliers and remote service access?',
      queries: ['supply chain cyberattack', 'critical vulnerability industrial'],
      terms: ['supply chain', 'vendor', 'firmware', 'remote access', 'backdoor', 'malicious package', 'vulnerability', 'exploit']
    },
    hybrid: {
      label: 'hybrid sabotage, maritime, and logistics corridors',
      ir: 'What geopolitical developments, hybrid sabotage incidents, or physical-cyber disruptions affected subsea infrastructure, ports, energy corridors, or logistics routes?',
      queries: ['sabotage critical infrastructure', 'hybrid attack Europe'],
      terms: ['sabotage', 'hybrid', 'subsea', 'cable', 'pipeline', 'port', 'maritime', 'rail', 'infrastructure', 'russian']
    }
  };
  var PRESETS = {
    europe: {
      slug: 'europe-cyber-geopol', geo: 'Europe', lenses: ['ot', 'mfg', 'supply', 'hybrid'],
      question: 'Assess European cyber and geopolitical activity over the last two months—specifically state-linked OT/energy targeting, industrial ransomware, and hybrid infrastructure sabotage—and determine what operational or supply-chain exposure this creates for Vestas.'
    },
    ransomware: {
      slug: 'europe-mfg-ransomware', geo: 'Europe, Germany, Denmark, Poland', lenses: ['mfg', 'supply'],
      question: 'Which ransomware and extortion groups disrupted European industrial manufacturing and OT vendor operations over the last two months, and what is the exposure to Vestas turbine production and Tier-1 suppliers?'
    },
    baltic: {
      slug: 'nordic-baltic-hybrid', geo: 'Europe, Baltic, Nordic, Poland, Germany', lenses: ['ot', 'hybrid'],
      question: 'Assess hybrid sabotage, state-linked cyber pre-positioning, and maritime/subsea infrastructure threats in the Nordic and Baltic region over the last two months and their impact on Vestas offshore and grid operations.'
    }
  };
  var GENERATED = ['in-irs', 'in-disc-queries', 'in-disc-terms', 'in-purpose', 'in-topic', 'in-rationale'];
  function $(id) { return document.getElementById(id); }
  function isoDate(date) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function setWindow(days) {
    var end = new Date();
    $('in-to').value = isoDate(end);
    $('in-from').value = isoDate(new Date(end.getTime() - days * 86400000));
    document.querySelectorAll('[data-window-days]').forEach(function (b) {
      b.setAttribute('aria-pressed', Number(b.getAttribute('data-window-days')) === days ? 'true' : 'false');
    });
  }
  function existingRuns() {
    return ((state.view && state.view.availableRuns) || []).map(function (r) { return r.runId; });
  }
  function suggestRunId(slug) {
    var base = slug + '-' + isoDate(new Date()).slice(0, 7);
    var runs = existingRuns();
    var candidate = base;
    for (var i = 2; runs.indexOf(candidate) >= 0; i++) candidate = base + '-' + i;
    $('in-run-id').value = candidate;
    validateRunId();
  }
  function validateRunId() {
    var value = $('in-run-id').value.trim();
    var hint = $('run-id-hint');
    var problem = !SAFE_ID.test(value) ? 'Use letters, digits, dots and dashes (start with a letter or digit).'
      : existingRuns().indexOf(value) >= 0 ? 'An analysis with this ID already exists.' : '';
    hint.textContent = problem || 'Available.';
    hint.className = 'hint' + (problem ? ' fail' : '');
    $('in-run-id').classList.toggle('invalid', Boolean(problem));
    return !problem;
  }
  function checkedLenses() {
    var list = [];
    document.querySelectorAll('.vestas-lens:checked').forEach(function (cb) { if (LENS_CONFIG[cb.value]) list.push(LENS_CONFIG[cb.value]); });
    return list;
  }
  function syncDerivations() {
    var thesis = $('in-question').value.trim();
    var geo = $('in-geo').value.trim() || 'Europe';
    var lenses = checkedLenses();
    var irs = lenses.map(function (l) { return l.ir; });
    irs.push('What concrete operational, OT/SCADA, manufacturing, or supply-chain exposure pathways connect these findings to Vestas in ' + geo + '?');
    var queries = [];
    lenses.forEach(function (l) { l.queries.forEach(function (q) { queries.push(q); }); });
    if (!queries.length) queries.push('cyberattack Europe');
    var terms = ['cyberattack', 'cyber', 'vestas'];
    geo.split(',').forEach(function (g) { var c = g.trim().toLowerCase(); if (c && terms.indexOf(c) < 0) terms.push(c); });
    lenses.forEach(function (l) { l.terms.forEach(function (t) { if (terms.indexOf(t) < 0) terms.push(t); }); });
    var labels = lenses.map(function (l) { return l.label; });
    var values = {
      'in-irs': irs.join('\n'),
      'in-disc-queries': queries.join('\n'),
      'in-disc-terms': terms.join(', '),
      'in-purpose': thesis.slice(0, 220) || ('Assess cyber and geopolitical activity in ' + geo + ' and implications for Vestas.'),
      'in-topic': 'Cyber and geopolitical activity in ' + geo + (labels.length ? ' affecting ' + labels.join(', ') : '') + '.',
      'in-rationale': 'Grounded assessment of ' + geo + ' threat activity mapped against Vestas ' + (labels.join(', ') || 'operational footprint') + '.'
    };
    GENERATED.forEach(function (id) { if (!state.dirty[id]) $(id).value = values[id]; });
  }
  function applyPreset(name) {
    var preset = PRESETS[name];
    $('in-question').value = preset.question;
    $('in-geo').value = preset.geo;
    document.querySelectorAll('.vestas-lens').forEach(function (cb) { cb.checked = preset.lenses.indexOf(cb.value) >= 0; });
    state.dirty = {};
    syncDerivations();
    suggestRunId(preset.slug);
    invalidateReview();
  }
  function intentPayload(runDiscovery) {
    return {
      action: 'approve-intent',
      runDiscovery: Boolean(runDiscovery),
      runId: $('in-run-id').value.trim(),
      reviewerId: C.analyst(),
      audience: $('in-audience').value,
      requestedOutput: $('in-output').value,
      geographies: $('in-geo').value,
      from: $('in-from').value,
      to: $('in-to').value,
      purpose: $('in-purpose').value,
      threatTopic: $('in-topic').value,
      question: $('in-question').value,
      rationale: $('in-rationale').value,
      requirements: $('in-irs').value,
      minimumScore: Number($('in-disc-score').value || 4),
      queries: $('in-disc-queries').value,
      rankingTerms: $('in-disc-terms').value
    };
  }
  function lines(text) { return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean); }
  function invalidateReview() { state.drafts['intent:confirm'] = ''; }
  function intentProblems() {
    var p = intentPayload(true);
    var irs = lines(p.requirements);
    var problems = [];
    if (!C.analyst()) problems.push('Enter your analyst ID in the top bar.');
    if (!p.question.trim()) problems.push('Write the question.');
    if (!validateRunId()) problems.push('Fix the analysis ID.');
    if (!p.from || !p.to || p.from > p.to) problems.push('Set a valid time window.');
    if (!irs.length || irs.length > 24 || irs.some(function (l) { return l.length > 400; })) problems.push('Give 1–24 research questions of at most 400 characters.');
    if (!p.purpose.trim() || !p.threatTopic.trim() || !p.rationale.trim()) problems.push('Complete the purpose, threat topic and why it matters.');
    return problems;
  }
  function irList() { var text = $('in-irs').value; return text ? text.split(/\r?\n/) : []; }
  function setIrs(list) { $('in-irs').value = list.join('\n'); state.dirty['in-irs'] = true; invalidateReview(); }

  function propose() {
    var question = $('in-question');
    if (!question.value.trim()) {
      $('question-error').hidden = false;
      question.setAttribute('aria-invalid', 'true');
      question.focus();
      return;
    }
    if (!$('in-from').value || !$('in-to').value) setWindow(60);
    if (!$('in-run-id').value.trim()) suggestRunId('analysis');
    syncDerivations();
    draftEdit = { row: '', ir: -1, plan: false };
    invalidateReview();
    state.draft = true;
    C.navigate('intent');
  }
  function approve(runDiscovery) {
    var payload = intentPayload(runDiscovery);
    C.postAction(payload, runDiscovery ? 'Approving and collecting leads' : 'Approving the analysis').then(function (data) {
      if (!data || !data.ok) return;
      state.draft = false;
      state.dirty = {};
      invalidateReview();
      $('in-question').value = '';
      $('in-run-id').value = '';
      C.switchRun(data.runId || payload.runId);
      C.go({ tab: 'sources', focus: 'leads' });
    });
  }
  C.startNew = function () {
    if (!$('in-to').value) setWindow(60);
    if (!$('in-question').value.trim()) { state.dirty = {}; syncDerivations(); }
    if (!$('in-run-id').value.trim()) suggestRunId('analysis');
    validateRunId();
    $('in-question').focus();
  };
  C.initBrief = function () {
    setWindow(60);
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); }); });
    document.querySelectorAll('[data-window-days]').forEach(function (b) { b.addEventListener('click', function () { setWindow(Number(b.getAttribute('data-window-days'))); invalidateReview(); }); });
    $('in-question').addEventListener('input', function () {
      $('question-error').hidden = true;
      $('in-question').removeAttribute('aria-invalid');
      syncDerivations();
    });
    $('in-geo').addEventListener('input', syncDerivations);
    document.querySelectorAll('.vestas-lens').forEach(function (cb) { cb.addEventListener('change', syncDerivations); });
    $('in-run-id').addEventListener('input', validateRunId);
    $('brief-new').addEventListener('input', invalidateReview);
    $('brief-new').addEventListener('change', invalidateReview);
    $('brief-new').addEventListener('submit', function (e) { e.preventDefault(); propose(); });
  };

  /* ---------- Intent review: draft plan before approval ---------- */
  var draftEdit = { row: '', ir: -1, plan: false };
  var SCOPE_ROWS = [
    { key: 'run', label: 'Analysis ID', ids: ['in-run-id'], kind: 'text' },
    { key: 'purpose', label: 'Purpose', ids: ['in-purpose'], kind: 'text', why: 'Drafted from your question.' },
    { key: 'audience', label: 'Audience', ids: ['in-audience'], kind: 'text' },
    { key: 'geo', label: 'Geography', ids: ['in-geo'], kind: 'text' },
    { key: 'window', label: 'Time window', ids: ['in-from', 'in-to'], kind: 'dates' },
    { key: 'output', label: 'Deliverable', ids: ['in-output'], kind: 'output' },
    { key: 'topic', label: 'Threat topic', ids: ['in-topic'], kind: 'text', why: 'Drafted from your question, geography and exposure lenses.' },
    { key: 'rationale', label: 'Why it matters to Vestas', ids: ['in-rationale'], kind: 'text', why: 'Drafted from your geography and exposure lenses.' }
  ];
  function isAssumed(row) { return Boolean(row.why) && !row.ids.some(function (id) { return state.dirty[id]; }); }
  function rowValue(row) {
    if (row.kind === 'dates') return $('in-from').value + ' → ' + $('in-to').value;
    if (row.kind === 'output') return $('in-output').selectedOptions[0].textContent;
    return $(row.ids[0]).value;
  }
  function liveInput(source, cls) {
    var input = el('input', cls);
    input.type = source.type === 'date' ? 'date' : 'text';
    input.value = source.value;
    input.addEventListener('input', function () {
      source.value = input.value;
      state.dirty[source.id] = true;
      invalidateReview();
      if (source.id === 'in-run-id') validateRunId();
    });
    return input;
  }
  function scopeEditor(row) {
    var wrap = el('div', 'row-edit');
    if (row.kind === 'dates') {
      var a = liveInput($('in-from'));
      var b = liveInput($('in-to'));
      a.setAttribute('aria-label', 'From');
      b.setAttribute('aria-label', 'To');
      add(wrap, a, el('span', 'meta', 'to'), b);
    } else if (row.kind === 'output') {
      var sel = el('select');
      Array.prototype.forEach.call($('in-output').options, function (o) {
        var opt = el('option', null, o.textContent);
        opt.value = o.value;
        opt.selected = o.value === $('in-output').value;
        sel.appendChild(opt);
      });
      sel.setAttribute('aria-label', row.label);
      sel.addEventListener('change', function () { $('in-output').value = sel.value; invalidateReview(); });
      wrap.appendChild(sel);
    } else {
      var input = liveInput($(row.ids[0]));
      input.setAttribute('aria-label', row.label);
      wrap.appendChild(input);
    }
    return wrap;
  }
  function toggleLink(label, onClick) { return C.linkButton(label, onClick); }
  function focusEditor() {
    window.requestAnimationFrame(function () {
      var node = $('brief-draft').querySelector('.row-edit input, .row-edit select, .row-edit textarea');
      if (node) node.focus();
    });
  }
  function scopeSection() {
    var sec = el('section');
    sec.setAttribute('aria-labelledby', 'h-scope');
    var assumed = SCOPE_ROWS.filter(isAssumed).length;
    var head = el('div', 'section-head');
    var title = el('h3', null, 'Scope');
    title.id = 'h-scope';
    add(head, title, el('span', 'meta', assumed ? plural(assumed, 'row') + ' of ' + SCOPE_ROWS.length + (assumed === 1 ? ' is assumed' : ' are assumed') + '. Check ' + (assumed === 1 ? 'it' : 'them') + ' before you approve.' : 'Every row comes from you.'));
    sec.appendChild(head);
    var table = el('table', 'scope-table');
    var thead = el('thead');
    var hr = el('tr');
    ['Field', 'Value', 'Origin', 'Action'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    SCOPE_ROWS.forEach(function (row) {
      var tr = el('tr');
      var editing = draftEdit.row === row.key;
      var th = el('th', null, row.label);
      th.scope = 'row';
      var value = el('td');
      if (editing) {
        value.appendChild(scopeEditor(row));
      } else {
        add(value, rowValue(row));
        if (isAssumed(row)) add(value, el('p', 'meta', row.why));
      }
      var origin = el('td');
      origin.appendChild(isAssumed(row) ? el('span', 'mark attention', 'Assumed') : el('span', 'mark covered', 'Stated by you'));
      var act = el('td');
      act.appendChild(toggleLink(editing ? 'Done' : 'Edit', function () {
        draftEdit.row = editing ? '' : row.key;
        renderDraft();
        if (!editing) focusEditor();
      }));
      add(tr, th, value, origin, act);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    add(sec, add(el('div', 'table-wrap'), table));
    return sec;
  }
  function questionsSection() {
    var irs = irList();
    var sec = el('section');
    sec.setAttribute('aria-labelledby', 'h-rq');
    var head = el('div', 'section-head');
    var title = el('h3', null, 'Research questions');
    title.id = 'h-rq';
    add(head, title, add(el('span', 'meta'), add(el('span', 'figures'), String(lines(irs.join('\n')).length)), ' questions'));
    sec.appendChild(head);
    var list = el('ul', 'rows rq-list');
    irs.forEach(function (text, i) {
      var li = el('li');
      var editing = draftEdit.ir === i;
      var main = el('div');
      if (editing) {
        var wrap = el('div', 'row-edit');
        var input = el('textarea');
        input.rows = 2;
        input.value = text;
        input.setAttribute('aria-label', 'Research question ' + (i + 1));
        input.addEventListener('input', function () { var next = irList(); next[i] = input.value; setIrs(next); });
        wrap.appendChild(input);
        main.appendChild(wrap);
      } else {
        main.appendChild(el('strong', null, text || 'Empty question'));
      }
      var actions = el('span', 'rq-actions');
      add(actions, toggleLink(editing ? 'Done' : 'Edit', function () {
        draftEdit.ir = editing ? -1 : i;
        renderDraft();
        if (!editing) focusEditor();
      }), toggleLink('Remove', function () {
        var next = irList();
        next.splice(i, 1);
        setIrs(next);
        draftEdit.ir = -1;
        renderDraft();
      }));
      add(li, main, actions);
      list.appendChild(li);
    });
    sec.appendChild(list);
    var addBtn = el('button', 'btn-secondary', 'Add a question');
    addBtn.type = 'button';
    addBtn.addEventListener('click', function () {
      var next = irList();
      next.push('');
      setIrs(next);
      draftEdit.ir = next.length - 1;
      renderDraft();
      focusEditor();
    });
    add(sec, add(el('p', 'rq-note'), addBtn), el('p', 'meta rq-note', 'Each question is one information requirement. Collection and evidence checks are scored against them.'));
    return sec;
  }
  function searchesSection() {
    var sec = el('section');
    sec.setAttribute('aria-labelledby', 'h-search');
    var head = el('div', 'section-head');
    var title = el('h3', null, 'Seerist searches');
    title.id = 'h-search';
    var editing = draftEdit.plan;
    add(head, title, toggleLink(editing ? 'Done' : 'Edit', function () { draftEdit.plan = !editing; renderDraft(); if (!editing) focusEditor(); }));
    sec.appendChild(head);
    var facts = el('dl', 'facts');
    function fact(label, content) { add(facts, el('dt', null, label), add(el('dd'), content)); }
    if (editing) {
      var queries = el('textarea');
      queries.rows = 4;
      queries.value = $('in-disc-queries').value;
      queries.setAttribute('aria-label', 'Seerist searches, one per line');
      var terms = liveInput($('in-disc-terms'));
      terms.setAttribute('aria-label', 'Ranking terms');
      var score = el('input');
      score.type = 'number';
      score.min = '1';
      score.max = '20';
      score.value = $('in-disc-score').value;
      score.setAttribute('aria-label', 'Minimum lead score');
      queries.addEventListener('input', function () { $('in-disc-queries').value = queries.value; invalidateReview(); });
      score.addEventListener('input', function () { $('in-disc-score').value = score.value; invalidateReview(); });
      fact('Searches', add(el('div', 'row-edit'), queries, el('p', 'meta', 'One per line. Two or three words work best; Seerist treats words as AND.')));
      fact('Ranking terms', add(el('div', 'row-edit'), terms));
      fact('Minimum lead score', add(el('div', 'row-edit'), score));
    } else {
      var searches = el('ul', 'bullets');
      lines($('in-disc-queries').value).forEach(function (q) { searches.appendChild(el('li', null, q)); });
      fact('Searches', searches);
      fact('Ranking terms', $('in-disc-terms').value);
      fact('Minimum lead score', $('in-disc-score').value);
    }
    sec.appendChild(facts);
    add(sec, el('p', 'meta rq-note', 'Runs only if you choose “Approve and collect leads”. Raw responses stay in the run folder and are not committed.'));
    return sec;
  }
  function decisionPlate() {
    var p = intentPayload(true);
    var irs = lines(p.requirements);
    var problems = intentProblems();
    var plate = el('section', 'plate');
    plate.setAttribute('aria-labelledby', 'h-decision');
    var kicker = el('div', 'plate-kicker');
    add(kicker, el('span', 'mark attention', 'Waiting for you'), el('span', null, 'Intent decision'));
    var title = el('h3', 'plate-title', 'Approve the research plan');
    title.id = 'h-decision';
    add(plate, kicker, title, el('div', 'plate-meta', irs.length + ' research questions · ' + lines(p.queries).length + ' Seerist searches'));
    add(plate, el('p', 'plate-confirm', 'Approving records the scope, question and research questions under your analyst ID. Nothing is collected unless you choose to collect leads.'));
    if (problems.length) {
      var list = el('ul', 'plate-problems');
      problems.forEach(function (text) { list.appendChild(el('li', null, text)); });
      plate.appendChild(list);
    }
    var confirm = el('input');
    confirm.type = 'checkbox';
    C.bindDraft(confirm, 'intent:confirm', false);
    var label = el('label', 'check');
    add(label, confirm, el('span', null, (C.analyst() ? 'I, ' + C.analyst() + ', approve' : 'I approve') + ' this scope, question and ' + plural(irs.length, 'research question') + '.'));
    plate.appendChild(label);
    var collect = C.actButton('Approve and collect leads', 'btn-primary', function () { approve(true); }, true, problems.length || !confirm.checked);
    var only = C.actButton('Approve without collecting', 'btn-inverse', function () { approve(false); }, true, problems.length || !confirm.checked);
    confirm.addEventListener('change', function () {
      var blocked = intentProblems().length || !confirm.checked;
      C.setBlocked(collect, blocked);
      C.setBlocked(only, blocked);
    });
    add(plate, add(el('div', 'btn-row'), collect, only));
    return plate;
  }
  function renderDraft() {
    var host = $('brief-draft');
    var frag = document.createDocumentFragment();
    var layout = el('div', 'review');
    var main = el('div', 'intent-main');
    add(main, scopeSection(), questionsSection(), searchesSection());
    var aside = el('aside', 'trace-pane plate-pane');
    aside.setAttribute('aria-label', 'Intent decision');
    aside.appendChild(decisionPlate());
    add(layout, main, aside);
    frag.appendChild(layout);
    C.replace(host, frag);
  }

  /* ---------- Intent review: approved brief of an existing analysis ---------- */
  function renderApproved() {
    var j = C.journey();
    var host = $('brief-run');
    var frag = document.createDocumentFragment();
    if (!j || !j.brief.scope) {
      var none = el('section');
      add(none, C.sectionHead('This analysis has no approved scope'), el('p', 'meta prose', 'Start a new analysis to frame a question, set the scope and approve the research questions.'));
      var start = el('button', 'btn-primary', 'Start a new analysis');
      start.type = 'button';
      start.addEventListener('click', function () { C.navigate('new'); });
      add(none, add(el('div', 'btn-row'), start));
      frag.appendChild(none);
      return C.replace(host, frag);
    }
    var b = j.brief;
    var s = b.scope;
    var layout = el('div', 'review');
    var main = el('div', 'intent-main');

    var scope = el('section');
    add(scope, C.sectionHead('Approved scope', 'h3', C.artifactLink(s.relPath, 'Approved record', true)));
    add(scope, C.kv([
      ['Purpose', s.purpose], ['Threat topic', s.threatTopic], ['Audience', s.audience], ['Geographies', (s.geographies || []).join(', ')],
      ['Time window', (s.from || '').slice(0, 10) + ' → ' + (s.to || '').slice(0, 10)], ['Deliverable', capital(s.requestedOutput)],
      ['Why it matters', b.question ? b.question.rationale : ''],
      ['Approved', (s.approvedBy || '') + (s.approvedAt ? ' · ' + when(s.approvedAt) : '')]
    ]));
    scope.lastChild.className = 'facts';
    main.appendChild(scope);

    var reqs = el('section');
    var latest = j.rounds.length ? j.rounds[j.rounds.length - 1].index : 0;
    add(reqs, C.sectionHead('Research questions', 'h3', el('span', 'meta', latest ? 'Coverage from synthesis round ' + latest : 'Coverage appears after the first synthesis round')));
    var list = el('ul', 'rows');
    b.requirements.forEach(function (r) {
      var li = el('li', 'queue-row');
      add(li, el('span', 'figures meta', r.irId), el('span', null, r.text), coverageMark(r.coverage));
      list.appendChild(li);
    });
    reqs.appendChild(list);
    if (!b.requirements.length) add(reqs, el('p', 'meta prose', 'No approved research questions. Extraction cannot be prepared until they are recorded (npm run approve:requirements).'));
    main.appendChild(reqs);

    var aside = el('aside', 'trace-pane');
    aside.setAttribute('aria-label', 'Intent decision');
    var done = el('div', 'caution is-done');
    add(done, el('span', 'mark done', 'Approved'), el('span', null, (b.question ? 'Approved by ' + (b.question.approvedBy || 'analyst') + '. ' : '') + 'This brief is read-only.'));
    aside.appendChild(done);
    if (b.question) add(aside, el('p', 'meta', 'Question record: '), null);
    if (b.question) aside.lastChild.appendChild(C.artifactLink(b.question.relPath, 'Approved record', true));
    var nextStep = el('p', 'next-step');
    var open = el('a', 'btn-primary', 'Open the evidence');
    open.href = '#/analysis/evidence';
    nextStep.appendChild(open);
    aside.appendChild(nextStep);

    var collect = el('section');
    collect.id = 'focus-collect';
    add(collect, C.sectionHead('Collect leads', 'h3'));
    if (b.discoveries.length) {
      var t = el('table');
      var head = el('tr');
      ['Searches', 'Leads', 'API calls'].forEach(function (h) { head.appendChild(el('th', null, h)); });
      t.appendChild(head);
      b.discoveries.forEach(function (d) {
        var tr = el('tr');
        var cell = el('td');
        add(cell, el('div', null, d.queries.join(' · ') || d.planId), C.artifactLink(d.relPath, 'Results'));
        add(tr, cell, el('td', 'num', d.candidateCount), el('td', 'num', d.apiCalls));
        t.appendChild(tr);
      });
      add(collect, add(el('div', 'table-wrap'), t));
    } else {
      add(collect, el('p', 'meta', 'No Seerist search has run yet.'));
    }
    var last = b.discoveries.length ? b.discoveries[b.discoveries.length - 1] : null;
    var queries = C.textInput('collect:queries', last ? last.queries.join('\n') : '', 'one search per line', true, 4);
    var terms = C.textInput('collect:terms', last ? last.rankingTerms.join(', ') : '', 'comma-separated');
    var score = C.textInput('collect:score', String(last && last.minimumScore ? last.minimumScore : 4));
    score.type = 'number';
    score.min = '1';
    score.max = '20';
    var form = el('div', 'form-grid');
    add(form, C.field('Searches (2–3 words each; Seerist treats words as AND)', queries, true), C.field('Ranking terms', terms, true), C.field('Minimum lead score', score));
    collect.appendChild(form);
    var run = C.actButton('Run Seerist search', 'btn-secondary', function () {
      C.postAction({ action: 'discover-seerist', runId: state.runId, questionId: (b.question || {}).id, minimumScore: Number(score.value || 4), queries: queries.value, rankingTerms: terms.value })
        .then(function (data) { if (data && data.ok) C.go({ tab: 'sources', focus: 'leads' }); });
    }, false, !b.question);
    add(collect, add(el('div', 'btn-row'), run, el('span', 'meta', 'New leads are added to the Evidence window; nothing is pulled automatically.')));
    aside.appendChild(collect);

    add(layout, main, aside);
    frag.appendChild(layout);
    C.replace(host, frag);
  }

  C.panes.brief = function () {
    var route = state.route;
    if (route !== 'new' && route !== 'intent') return;
    var drafting = route === 'intent' && Boolean(state.draft);
    $('brief-new').hidden = route !== 'new';
    $('brief-draft').hidden = !drafting;
    $('brief-run').hidden = route === 'new' || drafting;
    if (route === 'new') { validateRunId(); return; }
    if (drafting) return renderDraft();
    renderApproved();
  };

  /* ================= Sources ================= */
  var SOURCE_FILTERS = [['action', 'Needs you'], ['progress', 'In progress'], ['done', 'In synthesis'], ['closed', 'Closed'], ['all', 'All']];
  function category(row) {
    if (row.state === 'action') return 'action';
    if (row.state === 'done') return 'done';
    if (row.state === 'closed') return 'closed';
    return 'progress';
  }
  function nextMark(row) {
    var label = row.current.label;
    switch (row.state) {
      case 'action': return add(el('span'), C.actorMark(row.current.state), ' ' + label);
      case 'done': return C.statusMark('reviewed', 'In synthesis');
      case 'closed': return C.statusMark('pending', 'Closed at ' + label.toLowerCase());
      case 'failed': return C.statusMark('failed', label + ': needs attention');
      case 'ready': return C.statusMark('pending', 'Ready for synthesis');
      case 'provisional': return C.statusMark('provisional', 'Provisional review');
      default: return C.statusMark('in-progress', label);
    }
  }
  function readLead(lead) {
    C.openSheet(lead.title, 'Loading…');
    fetch('/api/lead?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(lead.rawArtifactRef) + '&id=' + encodeURIComponent(lead.providerItemId)).then(function (res) {
      if (!res.ok) throw new Error('Lead text not available (' + res.status + ')');
      return res.json();
    }).then(function (d) {
      var head = [
        (lead.tierLabel || humanise(d.sourceType)) + (d.published ? ' · ' + d.published.slice(0, 10) : ''),
        d.countries.length ? 'Countries: ' + d.countries.join(', ') : '',
        d.link ? 'Link: ' + d.link : 'No web link: text delivered by Seerist'
      ].filter(Boolean).join('\n');
      var parts = [head];
      if (d.summary) parts.push('SUMMARY\n' + d.summary);
      parts.push(d.body ? 'FULL TEXT\n' + d.body : 'Seerist provides only a summary for this lead. Pull it to retrieve the full article.');
      C.openSheet(d.title || lead.title, parts.join('\n\n'), true);
    }).catch(function (err) { C.openSheet(lead.title, err.message); });
  }
  function pullLead(lead) {
    return C.postAction({
      action: 'intake-candidate', runId: state.runId, rawArtifactRef: lead.rawArtifactRef, providerItemId: lead.providerItemId,
      questionId: lead.researchQuestionId, sourceUrl: lead.sourceUrl
    }, 'Pulling: ' + lead.title);
  }
  function admitPanel(row) {
    var cand = row.candidate;
    var parts = [el('p', 'meta prose', 'The AI rated this article ' + humanise(cand.verdict) + '. Read its reasoning and the quoted passages, then decide whether the article may be used as evidence. Your decision is recorded under your analyst ID and cannot be changed.')];
    if (cand.rationale) parts.push(el('p', 'prose', cand.rationale));
    if (cand.support.length) parts.push(el('div', 'form-label', 'Quoted passages (' + cand.support.length + ')'), quoteList(cand.support.map(function (s) { return { quote: s.quote, note: s.relation }; })));
    if (cand.limitations.length) parts.push(el('div', 'form-label', 'Limitations noted by the AI'), bullets(cand.limitations));
    var reason = C.textInput('reason:' + cand.candidateId, '', 'Why admit, revise or reject? e.g. partially relevant: quantifies exposed EU wind OT; no in-window incident.', true, 2);
    parts.push(C.field('Reason for your decision', reason, true));
    var problem = el('span', 'meta fail');
    var row2 = el('div', 'btn-row');
    [['approve', 'Admit as evidence', 'btn-primary'], ['revise', 'Request revision', 'btn-secondary'], ['reject', 'Reject', 'btn-secondary']].forEach(function (def) {
      row2.appendChild(C.actButton(def[1], def[2], function () {
        if (reason.value.trim().length < 3) { problem.textContent = 'Give a short reason first.'; reason.focus(); return; }
        C.postAction({ action: 'review-evidence', runId: state.runId, candidateId: cand.candidateId, decision: def[0], reviewerId: C.analyst(), reason: reason.value }, def[1] + ': ' + cand.title)
          .then(function (data) { if (data && data.ok) C.dropDrafts('reason:' + cand.candidateId); });
      }, true));
    });
    add(row2, C.analyst() ? el('span', 'meta', 'Deciding as ' + C.analyst()) : el('span', 'meta', 'Enter your analyst ID in the top bar first.'), problem);
    parts.push(row2);
    return step('Decide whether to admit this article as evidence', parts);
  }
  function reviewPanel(row) {
    var review = row.review;
    var snap = review.snapshotId;
    var key = 'rv:' + snap + ':';
    var parts = [];
    parts.push(el('p', 'meta prose', review.status === 'provisional'
      ? 'This source was recorded without the support pass. Its note is provisional and blocks publication. Complete the review to replace it.'
      : 'Check each observation against its quote, confirm how the source covers each requirement, and assess the source. This is the support pass.'));
    parts.push(el('div', 'form-label', 'Observations: does the quote support the statement?'));
    var bulk = el('button', 'btn-secondary', 'Mark all supported');
    bulk.type = 'button';
    bulk.addEventListener('click', function () {
      review.observations.forEach(function (o, idx) { state.drafts[key + 'v' + idx] = 'supported'; });
      C.render(true);
    });
    parts.push(add(el('div', 'btn-row'), bulk));
    var obsList = el('ol', 'review-obs');
    var verdicts = [];
    review.observations.forEach(function (obs, idx) {
      var li = el('li');
      add(li, el('div', null, obs.text), el('blockquote', 'quote', obs.quote),
        el('div', 'meta', capital(humanise(obs.claimKind)) + ' · ' + humanise(obs.attribution) + (obs.attributedTo ? ' (' + obs.attributedTo + ')' : '') + ' · ' + (obs.irIds.length ? obs.irIds.join(', ') : 'no requirement')));
      var verdict = C.selectInput([['', 'Choose…'], ['supported', 'Supported'], ['unsupported', 'Unsupported'], ['duplicate', 'Duplicate of an earlier one'], ['chrome', 'Page chrome']], key + 'v' + idx);
      var dup = C.selectInput([['', 'Duplicate of…']].concat(review.observations.slice(0, idx).map(function (o, k) { return [o.observationId, (k + 1) + '. ' + o.text.slice(0, 60)]; })), key + 'd' + idx);
      var dupField = C.field('Duplicate of', dup);
      dupField.hidden = verdict.value !== 'duplicate';
      verdict.addEventListener('change', function () { dupField.hidden = verdict.value !== 'duplicate'; });
      var note = C.textInput(key + 'n' + idx, '');
      add(li, add(el('div', 'review-row'), C.field('Verdict', verdict), dupField, C.field('Note (optional)', note)));
      verdicts.push({ observationId: obs.observationId, verdict: verdict, duplicateOf: dup, note: note });
      obsList.appendChild(li);
    });
    parts.push(obsList);
    parts.push(el('div', 'form-label', 'Requirement coverage (prefilled with the AI proposal; a note is required unless covered)'));
    var irs = [];
    review.requirements.forEach(function (req) {
      var box = el('div', 'review-ir');
      add(box, el('div', 'meta', req.irId + ': ' + req.text));
      var disp = C.selectInput([['covered', 'Covered'], ['partial', 'Partial'], ['silent', 'Silent'], ['contradicted', 'Contradicted']], key + 'ir:' + req.irId, req.disposition || 'silent');
      var note = C.textInput(key + 'irn:' + req.irId, req.note || (req.disposition === 'silent' ? 'The source does not address this requirement.' : ''));
      add(box, add(el('div', 'review-row'), C.field('Disposition', disp), C.field('Note', note)));
      irs.push({ irId: req.irId, disposition: disp, note: note });
      parts.push(box);
    });
    parts.push(el('div', 'form-label', 'Source assessment'));
    var access = C.selectInput([['', 'Choose…'], ['direct', 'Direct'], ['indirect', 'Indirect'], ['unknown', 'Unknown']], key + 'acc');
    var accessWhy = C.textInput(key + 'accw', '', 'e.g. journalist summarises a third-party study');
    var track = C.selectInput([['', 'Choose…'], ['established', 'Established'], ['limited', 'Limited'], ['unknown', 'Unknown']], key + 'tr');
    var trackWhy = C.textInput(key + 'trw', '', 'e.g. national daily, energy desk');
    var dep = C.selectInput([['', 'Choose…'], ['original', 'Original reporting'], ['relayed', 'Relayed'], ['mixed', 'Mixed'], ['unknown', 'Unknown']], key + 'dep');
    var upstream = C.textInput(key + 'up', '', 'e.g. NCSC-NL study, Modat');
    var grid = el('div', 'form-grid');
    add(grid, C.field('Access to the events', access), C.field('Why', accessWhy), C.field('Track record', track), C.field('Why', trackWhy), C.field('Dependency', dep), C.field('Upstream sources (comma-separated)', upstream));
    parts.push(grid);
    var depWhy = C.textInput(key + 'depw', '', '', true);
    var alignment = C.textInput(key + 'al', '', 'e.g. consistent with NCSC-NL findings; not independently corroborated', true);
    var limits = C.textInput(key + 'lim', '', 'one per line', true);
    parts.push(C.field('Dependency rationale', depWhy, true), C.field('Alignment with other reporting', alignment, true), C.field('Limitations', limits, true));
    var problem = el('span', 'meta fail');
    var submit = C.actButton('Record review', 'btn-primary', function () {
      var missing = verdicts.filter(function (v) { return !v.verdict.value || (v.verdict.value === 'duplicate' && !v.duplicateOf.value); }).length;
      var missingIr = irs.filter(function (r) { return r.disposition.value !== 'covered' && !r.note.value.trim(); }).length;
      var incomplete = !access.value || !track.value || !dep.value;
      if (missing || missingIr || incomplete) {
        problem.textContent = (missing ? missing + ' observation(s) need a verdict. ' : '') + (missingIr ? missingIr + ' requirement(s) need a note. ' : '') + (incomplete ? 'Complete the source assessment.' : '');
        return;
      }
      problem.textContent = '';
      C.postAction({
        action: 'record-assurance-review', runId: state.runId, snapshotId: snap, reviewerId: C.analyst(), mode: 'performed',
        verdicts: verdicts.map(function (v) { return { observationId: v.observationId, verdict: v.verdict.value, duplicateOf: v.duplicateOf.value, note: v.note.value }; }),
        irReview: irs.map(function (r) { return { irId: r.irId, disposition: r.disposition.value, note: r.note.value }; }),
        assessment: {
          access: access.value, accessRationale: accessWhy.value, trackRecord: track.value, trackRecordRationale: trackWhy.value,
          alignment: alignment.value, dependencyKind: dep.value, upstreamSources: upstream.value, dependencyRationale: depWhy.value, limitations: limits.value
        }
      }, 'Source review: ' + row.title).then(function (data) { if (data && data.ok) C.dropDrafts(key); });
    }, true);
    var btns = el('div', 'btn-row');
    add(btns, submit);
    if (review.status !== 'provisional') {
      add(btns, C.actButton('Skip the support pass (provisional)', 'btn-secondary', function () {
        C.postAction({ action: 'record-assurance-review', runId: state.runId, snapshotId: snap, reviewerId: C.analyst(), mode: 'provisional' }, 'Provisional review: ' + row.title);
      }, true));
    }
    add(btns, C.analyst() ? el('span', 'meta', 'Reviewing as ' + C.analyst()) : el('span', 'meta', 'Enter your analyst ID in the top bar first.'), problem);
    parts.push(btns);
    return step(review.status === 'provisional' ? 'Complete the skipped support pass' : 'Review the extracted observations', parts);
  }
  function actionPanel(row) {
    var action = row.action;
    if (!action) {
      var text = row.state === 'done' ? 'Nothing to do. This source supports ' + plural(row.claimCount, 'claim') + ' in the current synthesis round.'
        : row.state === 'closed' ? 'Closed: ' + row.current.detail + '. It will not be used as evidence.'
        : row.current.detail || 'Nothing to do yet.';
      return step('No action needed', [el('p', 'meta prose', text)]);
    }
    if (action.kind === 'relevance') return step('Run the AI relevance check', [C.aiTask('relevance', action.item)]);
    if (action.kind === 'ai-stage') return step('Run the AI extraction', [C.aiTask('stage', action.item)]);
    if (action.kind === 'admit') return admitPanel(row);
    if (action.kind === 'review') return reviewPanel(row);
    if (action.kind === 'pull' && action.lead) {
      return step('Retrieval did not complete', [
        el('p', 'meta prose', row.current.detail + '. Pulling again re-fetches the article; the earlier attempt stays in the audit trail.'),
        add(el('div', 'btn-row'), C.actButton('Pull again', 'btn-primary', function () { pullLead(action.lead); }))
      ]);
    }
    if (row.state === 'ready') return step('Ready for synthesis', [el('p', 'meta prose', 'This source note is not in the current synthesis round yet.'), add(el('div', 'btn-row'), C.linkButton('Go to synthesis', function () { C.go({ tab: 'synthesis', focus: 'gate' }); }))]);
    return step(row.current.label, [el('p', 'meta prose', row.current.detail)]);
  }
  function sourceFacts(row) {
    var box = el('div');
    var lead = row.lead;
    var cand = row.candidate;
    var decision = cand && cand.decision;
    add(box, C.kv([
      ['Article', row.url ? C.externalLink(row.url) : ''],
      ['Publisher', row.publisher],
      ['Seerist lead', lead ? 'Score ' + lead.score + ' · ' + humanise(lead.sourceType) + (lead.providerTimestamp ? ' · ' + lead.providerTimestamp.slice(0, 10) : '') : 'Added directly'],
      ['Matched terms', lead && lead.matchedTerms.length ? lead.matchedTerms.join(', ') : ''],
      ['Seerist text', lead && lead.rawArtifactRef ? C.linkButton('Read the Seerist lead', function () { readLead(lead); }) : ''],
      ['AI relevance', cand ? capital(humanise(cand.verdict)) : row.relevance && row.relevance.verdict ? capital(humanise(row.relevance.verdict)) : ''],
      ['Admission', decision ? capital(humanise(decision.outcome)) + ' by ' + (decision.reviewerId || 'analyst') + ' · ' + when(decision.decidedAt) : ''],
      ['Source review', row.review ? (row.review.status === 'recorded' ? 'Reviewed by ' + row.review.reviewerId : humanise(row.review.status)) : ''],
      ['Current synthesis', row.noteId ? plural(row.claimCount, 'claim') : ''],
      ['Duplicates', row.duplicates ? plural(row.duplicates, 'extra retrieval') + ' of the same lead (ignored)' : '']
    ]));
    if (cand && cand.rationale && !(row.action && row.action.kind === 'admit')) {
      var why = el('details', 'trace');
      add(why, el('summary', null, 'AI relevance reasoning and quotes'), el('p', 'prose', cand.rationale), quoteList(cand.support.map(function (s) { return { quote: s.quote, note: s.relation }; })));
      box.appendChild(why);
    }
    if (row.artifacts.length) {
      add(box, el('div', 'form-label', 'Records'));
      row.artifacts.forEach(function (a) { box.appendChild(C.artifactLink(a.relPath, a.label)); });
    }
    return box;
  }
  function sourceRow(row) {
    var li = el('li', 'source-row');
    li.id = 'src-' + row.id;
    var open = state.selectedSource === row.id;
    var btn = el('button', 'source-summary');
    btn.type = 'button';
    if (open) btn.setAttribute('aria-current', 'true');
    var left = el('div');
    var meta = [row.publisher, row.lead ? 'Seerist score ' + row.lead.score : 'added directly'].filter(Boolean).join(' · ');
    add(left, el('div', 'source-title', row.title), el('div', 'meta', meta));
    var right = el('div', 'source-next');
    add(right, nextMark(row));
    add(btn, left, right);
    btn.addEventListener('click', function () { state.selectedSource = row.id; C.render(true); });
    li.appendChild(btn);
    return li;
  }
  function sourceDetail(row) {
    var d = el('section', 'detail');
    d.id = 'detail-' + row.id;
    add(d, C.sectionHead(row.title, 'h2'), el('p', 'meta', [row.publisher, row.lead && row.lead.providerTimestamp ? 'published ' + row.lead.providerTimestamp.slice(0, 10) : ''].filter(Boolean).join(' · ')));
    add(d, el('h4', null, 'Next step'), actionPanel(row));
    var quotes = [];
    if (row.review && row.review.observations) {
      row.review.observations.forEach(function (o) { if (o && o.quote) quotes.push({ quote: o.quote, note: o.attribution || '' }); });
    }
    if (quotes.length) add(d, el('h4', null, 'Quotes recorded in source review'), quoteList(quotes));
    add(d, el('h4', null, 'Source facts'), sourceFacts(row));
    return d;
  }
  function runNextButton() {
    return C.actButton('Check next step', 'btn-secondary', function () { C.postAction({ action: 'run-next', runId: state.runId }); });
  }
  function analysisTabs(active, j) {
    var bar = el('div', 'output-bar');
    var nav = el('div', 'view-tabs');
    nav.setAttribute('role', 'tablist');
    [['sources', 'Evidence', j.sources.length], ['synthesis', 'Findings', j.rounds.length ? j.rounds[j.rounds.length - 1].claims.length : 0]].forEach(function (t) {
      var b = el('button', 'view-tab', t[1] + ' ');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', active === t[0] ? 'true' : 'false');
      add(b, el('span', 'tab-count', t[2]));
      b.addEventListener('click', function () { if (active !== t[0]) C.go({ tab: t[0] }); });
      nav.appendChild(b);
    });
    var tools = el('div', 'modes');
    tools.title = 'Runs run:next, which takes a deterministic step if one exists. It never makes a human or model decision.';
    add(tools, runNextButton());
    add(bar, nav, tools);
    return bar;
  }
  function publicationLink(j) {
    if (!j.memo) return null;
    var wrap = el('p', 'next-step');
    var a = el('a', 'btn-secondary', 'Open publication review');
    a.href = '#/review';
    wrap.appendChild(a);
    return wrap;
  }
  function leadsSection(j) {
    var sec = el('section');
    sec.id = 'focus-leads';
    var selected = Object.keys(state.selectedLeads).filter(function (id) { return state.selectedLeads[id]; });
    var pullSelected = C.actButton('Pull selected (' + selected.length + ')', 'btn-secondary', function () {
      var ids = Object.keys(state.selectedLeads).filter(function (id) { return state.selectedLeads[id]; });
      var leads = j.leads.filter(function (l) { return ids.indexOf(l.providerItemId) >= 0; });
      var chain = Promise.resolve({ ok: true });
      leads.forEach(function (lead) {
        chain = chain.then(function (prev) { return prev && prev.ok ? pullLead(lead) : prev; });
      });
      chain.then(function () { state.selectedLeads = {}; state.sourceFilter = 'action'; C.render(true); });
    }, false, !selected.length);
    var seg = el('div', 'segmented');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Lead filter');
    var unpulled = j.leads.filter(function (l) { return !l.rowId; }).length;
    [['open', 'Not pulled', unpulled], ['all', 'All', j.leads.length]].forEach(function (def) {
      var b = el('button', 'seg-btn', def[1] + ' ');
      b.type = 'button';
      b.setAttribute('aria-pressed', state.leadFilter === def[0] ? 'true' : 'false');
      add(b, el('span', 'tab-count', def[2]));
      b.addEventListener('click', function () { state.leadFilter = def[0]; C.render(true); });
      seg.appendChild(b);
    });
    add(sec, C.sectionHead('Seerist leads', 'h2', add(el('div', 'btn-row'), seg, pullSelected)));
    add(sec, el('p', 'meta prose', 'Grouped by source tier (Control Risks analyst reports first), then by matched terms. Tiers only order the list; every lead Seerist returned is kept. Pulling a lead retrieves the full article and prepares the AI relevance check; nothing becomes evidence without your admission decision.'));
    var leads = j.leads.filter(function (l) { return state.leadFilter === 'all' || !l.rowId; });
    if (!j.leads.length) {
      add(sec, el('p', 'meta', 'No leads yet. '), C.linkButton('Run a Seerist search', function () { C.go({ tab: 'brief', focus: 'collect' }); }));
      return sec;
    }
    var t = el('table', 'leads-table');
    var head = el('tr');
    ['', 'Score', 'Lead', 'Published', ''].forEach(function (h) { head.appendChild(el('th', null, h)); });
    t.appendChild(head);
    var tierCounts = {};
    leads.forEach(function (lead) { tierCounts[lead.tier] = (tierCounts[lead.tier] || 0) + 1; });
    var lastTier = null;
    leads.forEach(function (lead) {
      if (lead.tier !== lastTier) {
        lastTier = lead.tier;
        var groupRow = el('tr', 'tier-row');
        var groupCell = el('th', null, (lead.tier < 9 ? 'Tier ' + lead.tier + ' · ' : '') + lead.tierLabel + ' (' + tierCounts[lead.tier] + ')');
        groupCell.colSpan = 5;
        groupRow.appendChild(groupCell);
        t.appendChild(groupRow);
      }
      var tr = el('tr', lead.shortlisted ? null : 'below-shortlist');
      var sel = el('td', 'sel');
      if (!lead.rowId && lead.sourceUrl) {
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = Boolean(state.selectedLeads[lead.providerItemId]);
        cb.setAttribute('aria-label', 'Select ' + lead.title);
        cb.addEventListener('change', function () {
          state.selectedLeads[lead.providerItemId] = cb.checked;
          var n = Object.keys(state.selectedLeads).filter(function (id) { return state.selectedLeads[id]; }).length;
          pullSelected.textContent = 'Pull selected (' + n + ')';
          C.setBlocked(pullSelected, !n);
        });
        sel.appendChild(cb);
      }
      var titleCell = el('td', 'title-cell');
      var readBtn = C.linkButton(lead.title, function () { readLead(lead); });
      readBtn.title = 'Read this lead';
      add(titleCell, readBtn, el('div', 'meta', humanise(lead.sourceType) + (lead.matchedTerms.length ? ' · matched: ' + lead.matchedTerms.join(', ') : '') + (lead.shortlisted ? '' : ' · below score threshold')));
      var act = el('td', 'compact');
      if (lead.rowId) act.appendChild(C.linkButton('In pipeline →', function () { C.go({ tab: 'sources', row: lead.rowId }); }));
      else if (!lead.sourceUrl) act.appendChild(el('span', 'meta', 'Read in Seerist; in-app intake not built yet'));
      else act.appendChild(C.actButton('Pull', 'btn-secondary', function () {
        pullLead(lead).then(function (data) { if (data && data.ok) C.go({ tab: 'sources', row: lead.providerItemId }); });
      }));
      add(tr, sel, el('td', 'num', lead.score), titleCell, el('td', 'compact figures', (lead.providerTimestamp || '').slice(0, 10)), act);
      t.appendChild(tr);
    });
    add(sec, add(el('div', 'table-wrap'), t));
    if (!leads.length) add(sec, el('p', 'meta', 'Every lead has been pulled.'));
    return sec;
  }
  C.panes.sources = function () {
    var j = C.journey();
    var host = $('pane-sources');
    var frag = document.createDocumentFragment();
    if (!j) return;
    var counts = {};
    j.sources.forEach(function (r) { var c = category(r); counts[c] = (counts[c] || 0) + 1; });
    if (!state.sourceFilter || (state.sourceFilter === 'action' && !counts.action)) state.sourceFilter = counts.action ? 'action' : 'all';
    var tabs = analysisTabs('sources', j);
    var sec = el('section');
    var seg = el('div', 'filters');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Source filter');
    SOURCE_FILTERS.forEach(function (def) {
      var n = def[0] === 'all' ? j.sources.length : (counts[def[0]] || 0);
      var b = el('button', 'chip-btn', def[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', state.sourceFilter === def[0] ? 'true' : 'false');
      add(b, el('span', 'n', n));
      b.addEventListener('click', function () { state.sourceFilter = def[0]; C.render(true); });
      seg.appendChild(b);
    });
    var rows = j.sources.filter(function (r) { return state.sourceFilter === 'all' || category(r) === state.sourceFilter; });
    var selected = j.sources.filter(function (r) { return r.id === state.selectedSource; })[0];
    if (!selected || (rows.length && rows.indexOf(selected) < 0)) selected = rows[0] || null;
    state.selectedSource = selected ? selected.id : '';
    var inbox = el('div', 'inbox');
    var listCol = el('div');
    add(listCol, seg);
    if (!j.sources.length) add(listCol, el('p', 'meta', 'Nothing pulled yet. Choose leads below.'));
    else if (!rows.length) add(listCol, el('p', 'meta', 'No sources in this view.'));
    var list = el('ul', 'rows');
    rows.forEach(function (row) { list.appendChild(sourceRow(row)); });
    listCol.appendChild(list);
    add(inbox, listCol, selected ? sourceDetail(selected) : el('div'));
    add(sec, C.sectionHead('Sources in the pipeline', 'h2'), el('p', 'meta prose', 'Each pulled lead moves through retrieval, an AI relevance check, your admission decision, AI extraction and your review before it can support a claim. Pick a source to do its next step.'), inbox);
    add(frag, tabs, publicationLink(j), sec);
    frag.appendChild(leadsSection(j));
    C.replace(host, frag);
  };

  /* ================= Synthesis ================= */
  function adjudicationPanel(round) {
    var key = 'adj:' + round.index + ':';
    var parts = [el('p', 'meta prose', 'The AI Challenge questioned the claims below. Uphold a challenge to keep it open (the claim stays contested and the memo says so), or dismiss it. You can also reject a claim outright.')];
    var challengeInputs = [];
    var rejectInputs = [];
    var list = el('ol', 'claim-list');
    round.claims.forEach(function (claim) {
      var li = el('li', 'claim');
      add(li, el('div', 'claim-text', claim.statement), el('div', 'meta', [claim.alias, capital(humanise(claim.kind)), (claim.confidence || 'unknown') + ' confidence', claim.singleSource ? 'single source' : ''].filter(Boolean).join(' · ')));
      if (!claim.challenges.length) add(li, el('div', 'meta', 'No challenges raised.'));
      claim.challenges.forEach(function (ch) {
        var box = el('div', 'challenge');
        add(box, el('div', null, capital(humanise(ch.check))), el('div', 'meta', ch.rationale));
        if (ch.hypothesis) add(box, el('blockquote', 'quote', 'Alternative: ' + ch.hypothesis));
        var decision = C.selectInput([['', 'Choose…'], ['uphold', 'Uphold — keep open'], ['dismiss', 'Dismiss']], key + 'c:' + ch.id);
        var note = C.textInput(key + 'n:' + ch.id, '');
        add(box, add(el('div', 'review-row'), C.field('Decision', decision), C.field('Note (optional)', note)));
        challengeInputs.push({ challengeId: ch.id, decision: decision, note: note });
        li.appendChild(box);
      });
      var rejectLabel = el('label', 'check');
      var reject = el('input');
      reject.type = 'checkbox';
      C.bindDraft(reject, key + 'r:' + claim.claimId, false);
      add(rejectLabel, reject, 'Reject this claim');
      li.appendChild(rejectLabel);
      rejectInputs.push({ claimId: claim.claimId, input: reject });
      list.appendChild(li);
    });
    parts.push(list);
    var problem = el('span', 'meta fail');
    var submit = C.actButton('Record adjudication', 'btn-primary', function () {
      var open = challengeInputs.filter(function (c) { return !c.decision.value; }).length;
      if (open) { problem.textContent = open + ' challenge(s) still need a decision.'; return; }
      problem.textContent = '';
      C.postAction({
        action: 'record-adjudication', runId: state.runId, challengeRecordPath: round.challengeRecordPath, reviewerId: C.analyst(),
        challenges: challengeInputs.map(function (c) { return { challengeId: c.challengeId, decision: c.decision.value, note: c.note.value }; }),
        claims: rejectInputs.map(function (r) { return { claimId: r.claimId, reject: r.input.checked }; })
      }, 'Adjudication of round ' + round.index).then(function (data) { if (data && data.ok) C.dropDrafts(key); });
    }, true);
    parts.push(add(el('div', 'btn-row'), submit, C.analyst() ? el('span', 'meta', 'Adjudicating as ' + C.analyst()) : el('span', 'meta', 'Enter your analyst ID in the top bar first.'), problem));
    return step('Adjudicate the challenged claims', parts);
  }
  function claimsList(round, notes) {
    var list = el('ol', 'claim-list');
    round.claims.forEach(function (claim) {
      var li = el('li', 'claim');
      var head = el('div', 'claim-head');
      var statusKind = claim.status === 'accepted' ? 'reviewed' : claim.status === 'rejected' ? 'failed' : claim.status === 'contested' ? 'provisional' : 'pending';
      add(head, el('div', 'claim-text', claim.statement), C.statusMark(statusKind, claim.status ? capital(claim.status) : 'Not adjudicated'));
      li.appendChild(head);
      var sources = claim.noteIds.map(function (id) { return (notes[id] && notes[id].title) || id; });
      add(li, el('div', 'meta', [claim.alias, capital(humanise(claim.kind)), (claim.confidence || 'unknown') + ' confidence' + (claim.ceiling ? ' (ceiling ' + claim.ceiling + ')' : ''), claim.singleSource ? 'single source' : ''].filter(Boolean).join(' · ')));
      add(li, el('div', 'meta', 'Sources: ' + sources.join('; ')));
      claim.challenges.forEach(function (ch) {
        var box = el('div', 'challenge');
        add(box, el('div', 'meta', capital(humanise(ch.check)) + ': ' + ch.rationale));
        li.appendChild(box);
      });
      list.appendChild(li);
    });
    return list;
  }
  function roundBody(round, j) {
    var body = el('div');
    var active = round.current ? round.steps.filter(function (s) { return s.state === 'you' || s.state === 'ai' || s.state === 'ready'; })[0] : null;
    var showingAdjudication = false;
    if (active) {
      var aiTitles = { challenge: 'Run the AI Challenge', 'key-judgements': 'Run the AI key-judgement selection', memo: 'Run the AI memo writer' };
      if (active.state === 'ai') body.appendChild(step(aiTitles[active.key] || 'Run the AI step', [C.aiTask('stage', active.action.item)]));
      else if (active.key === 'adjudicate') { body.appendChild(adjudicationPanel(round)); showingAdjudication = true; }
      else if (active.state === 'ready') {
        var payload = active.key === 'key-judgements'
          ? { action: 'prepare-key-judgements', runId: state.runId, challengeRecordPath: active.action.challengeRecordPath }
          : { action: 'prepare-memo-writer', runId: state.runId, keyJudgementRecordPath: active.action.keyJudgementRecordPath };
        body.appendChild(step(active.label + ' not prepared', [
          el('p', 'meta prose', 'The previous step finished but this one was not prepared automatically. Prepare it to continue.'),
          add(el('div', 'btn-row'), C.actButton('Prepare ' + active.label.toLowerCase(), 'btn-primary', function () { C.postAction(payload); }))
        ]));
      }
    }
    if (!showingAdjudication) {
      var claims = el('section');
      add(claims, C.sectionHead('Claims (' + round.claims.length + ')', 'h3'), claimsList(round, j.notes));
      body.appendChild(claims);
    }
    if (round.keyJudgements) {
      var kj = el('section');
      add(kj, C.sectionHead('Key judgements selected', 'h3'));
      var list = el('ul', 'rows');
      round.keyJudgements.selections.forEach(function (s) {
        var li = el('li');
        add(li, el('div', null, s.text), el('div', 'meta', s.requirementId + ' · ' + (s.confidence || 'unknown') + ' confidence · ' + humanise(s.status)));
        list.appendChild(li);
      });
      round.keyJudgements.omissions.forEach(function (o) {
        var li = el('li');
        add(li, el('div', 'meta', o.requirementId + ' omitted: ' + o.reason));
        list.appendChild(li);
      });
      if (round.keyJudgements.withoutClaim.length) add(list, add(el('li'), el('div', 'meta', 'No eligible claim for ' + round.keyJudgements.withoutClaim.join(', '))));
      kj.appendChild(list);
      body.appendChild(kj);
    }
    if (round.coverage.length) {
      var cov = el('section');
      add(cov, C.sectionHead('Requirement coverage', 'h3'));
      var cl = el('ul', 'rows');
      round.coverage.forEach(function (c) {
        var li = el('li', 'queue-row');
        add(li, el('span', 'figures meta', c.irId), el('span', null, requirementText(c.irId)), coverageMark(c.disposition));
        cl.appendChild(li);
      });
      cov.appendChild(cl);
      body.appendChild(cov);
    }
    var recs = el('div');
    add(recs, el('div', 'form-label', 'Records'), C.artifactLink(round.buildPath, 'Build record'));
    if (round.challengeRecordPath) recs.appendChild(C.artifactLink(round.challengeRecordPath, 'Challenge record'));
    if (round.adjudicationPath) recs.appendChild(C.artifactLink(round.adjudicationPath, 'Adjudication'));
    if (round.keyJudgements) recs.appendChild(C.artifactLink(round.keyJudgements.path, 'Key-judgement record'));
    round.memoPaths.forEach(function (p, i) { recs.appendChild(C.artifactLink(p, 'Memo ' + (i + 1))); });
    body.appendChild(recs);
    return body;
  }
  function coverageDot(disposition) {
    var map = { covered: ['covered', 'Covered'], partial: ['partial', 'Partial'], gap: ['gap', 'No evidence'], silent: ['gap', 'No evidence'], contradicted: ['failed', 'Contradicted'] };
    var entry = map[disposition] || ['unclear', 'Not assessed yet'];
    return el('span', 'mark ' + entry[0], entry[1]);
  }
  function claimRow(claim) {
    var li = el('li');
    add(li, el('p', 'finding-text', claim.statement));
    var marks = el('div', 'finding-marks');
    add(marks, claimStatusMark(claim.status), el('span', 'meta', capital(claim.confidence || 'unknown') + ' confidence'), el('span', 'meta figures', plural(claim.noteIds.length, 'source')),
      el('span', 'meta', claim.challenges.length ? plural(claim.challenges.length, 'challenge') + ' raised' : 'No challenges raised'));
    li.appendChild(marks);
    return li;
  }
  function claimGroups(j) {
    var round = j.rounds[j.rounds.length - 1];
    if (!round || !round.claims.length) return null;
    var byId = {};
    round.claims.forEach(function (c) { byId[c.claimId] = c; });
    var selections = round.keyJudgements ? round.keyJudgements.selections : [];
    var coverage = {};
    round.coverage.forEach(function (c) { coverage[c.irId] = c.disposition; });
    var placed = {};
    var sec = el('section', 'finding-section');
    add(sec, C.sectionHead('Claims by research question', 'h2', el('span', 'meta', 'Round ' + round.index + ' · ' + when(round.recordedAt))));
    add(sec, el('p', 'meta prose', 'A claim is placed under a question only where the key-judgement selection links them. Other claims from the round follow.'));
    j.brief.requirements.forEach(function (req) {
      var claims = selections.filter(function (s) { return s.requirementId === req.irId && byId[s.claimId]; }).map(function (s) { placed[s.claimId] = true; return byId[s.claimId]; });
      if (!claims.length && !coverage[req.irId]) return;
      var group = el('div', 'finding-group');
      add(group, C.sectionHead(req.text, 'h3', coverageDot(coverage[req.irId])), el('div', 'meta figures', req.irId));
      var list = el('ul', 'rows');
      claims.forEach(function (c) { list.appendChild(claimRow(c)); });
      if (!claims.length) add(list, add(el('li'), el('span', 'meta', 'No claim selected for this question.')));
      group.appendChild(list);
      sec.appendChild(group);
    });
    var rest = round.claims.filter(function (c) { return !placed[c.claimId]; });
    if (rest.length) {
      var other = el('div', 'finding-group');
      add(other, C.sectionHead(selections.length || round.coverage.length ? 'Other claims in this round' : 'Claims in this round', 'h3', el('span', 'meta', String(rest.length))));
      var ol = el('ul', 'rows');
      rest.forEach(function (c) { ol.appendChild(claimRow(c)); });
      other.appendChild(ol);
      sec.appendChild(other);
    }
    return sec;
  }
  C.panes.synthesis = function () {
    var j = C.journey();
    var host = $('pane-synthesis');
    if (!j) return;
    var frag = document.createDocumentFragment();
    add(frag, analysisTabs('synthesis', j), publicationLink(j));
    var r = j.readiness;
    var gate = el('section', 'gate');
    gate.id = 'focus-gate';
    add(gate, C.sectionHead('Synthesis inputs', 'h2'));
    add(gate, el('p', 'prose', plural(r.noteCount, 'assured source note') + (j.rounds.length ? ' · ' + (r.newNotes.length ? plural(r.newNotes.length, 'new note') + ' not in round ' + j.rounds[j.rounds.length - 1].index : 'all included in round ' + j.rounds[j.rounds.length - 1].index) : '') + '.'));
    if (r.newNotes.length) add(gate, bullets(r.newNotes.map(function (n) { return n.title + (n.reviewStatus === 'provisional' ? ' (provisional)' : ''); })));
    if (r.inFlight.length) {
      add(gate, el('p', 'meta prose', 'Still in progress and not included if you build now:'), bullets(r.inFlight.map(function (s) { return s.title + ' — at ' + s.step.toLowerCase(); })));
    }
    if (r.provisionalNotes) add(gate, el('p', 'meta', plural(r.provisionalNotes, 'note is', 'notes are') + ' provisional. A memo built on them cannot be published.'));
    if (j.nextBuild) {
      gate.appendChild(step('Round ' + j.nextBuild.index + ': run the AI synthesis Build', [C.aiTask('stage', j.nextBuild.item)]));
    } else {
      var label = j.rounds.length ? 'Build round ' + (j.rounds.length + 1) + ' from ' + plural(r.noteCount, 'note') : 'Build the first synthesis from ' + plural(r.noteCount, 'note');
      var primary = !j.rounds.length || r.newNotes.length > 0;
      var build = C.actButton(label, primary ? 'btn-primary' : 'btn-secondary', function () { C.postAction({ action: 'prepare-synthesis', runId: state.runId }); }, false, !r.canBuild);
      add(gate, add(el('div', 'btn-row'), build, !r.canBuild ? el('span', 'meta', 'Admit and review at least one source first.') : !primary ? el('span', 'meta', 'No new notes since the last round; a rebuild uses the same inputs.') : null));
    }
    frag.appendChild(gate);
    add(frag, claimGroups(j));

    if (!j.rounds.length) {
      add(frag, el('p', 'meta', 'No synthesis round yet.'));
    }
    j.rounds.slice().reverse().forEach(function (round) {
      var det = el('details', 'round');
      det.id = 'round-' + round.index;
      det.open = round.current ? state.openRounds[round.index] !== false : Boolean(state.openRounds[round.index]);
      det.addEventListener('toggle', function () { state.openRounds[round.index] = det.open; });
      var sum = el('summary');
      var left = el('div');
      var waiting = round.steps.filter(function (s) { return s.state === 'you' || s.state === 'ai'; })[0];
      var mark = round.current
        ? (waiting ? C.statusMark('in-progress', 'Current · ' + waiting.label.toLowerCase() + ' waiting') : C.statusMark('reviewed', 'Current · complete'))
        : C.statusMark('pending', 'Superseded');
      add(left, el('span', 'round-title', 'Round ' + round.index + ' '), mark, el('div', 'meta', when(round.recordedAt) + ' · ' + plural(round.claims.length, 'claim') + ' from ' + plural(round.noteIds.length, 'source note')));
      add(sum, left, C.lifecycle(round.steps));
      det.appendChild(sum);
      if (det.open) det.appendChild(roundBody(round, j));
      else det.addEventListener('toggle', function once() {
        det.removeEventListener('toggle', once);
        if (det.open && det.childNodes.length === 1) det.appendChild(roundBody(round, j));
      });
      frag.appendChild(det);
    });
    C.replace(host, frag);
  };

  /* ================= Memo ================= */
  var MD_CACHE = {};
  function loadMarkdown(memo) {
    var key = state.runId + '|' + memo.markdownPath + '|' + memo.createdAt;
    if (MD_CACHE[key]) return MD_CACHE[key];
    var entry = MD_CACHE[key] = { state: 'loading', text: '' };
    fetch('/api/artifact?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(memo.markdownPath)).then(function (res) {
      if (!res.ok) throw new Error('Markdown not available');
      return res.text();
    }).then(function (text) { entry.state = 'ready'; entry.text = text; }, function () { entry.state = 'failed'; }).then(function () { C.render(false); });
    return entry;
  }
  function inlineMarkdown(parent, text) {
    var re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.charAt(0) === '`') add(parent, el('code', null, tok.slice(1, -1)));
      else if (tok.slice(0, 2) === '**') add(parent, el('strong', null, tok.slice(2, -2)));
      else add(parent, el('em', null, tok.slice(1, -1)));
      last = m.index + tok.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function memoAnchors(m) {
    var list = [];
    function push(text, claimIds, source) {
      if (text && text.length > 12 && claimIds.length) list.push({ text: text, claimIds: claimIds, source: source });
    }
    ['bluf', 'keyJudgments', 'analysis', 'uncertainties', 'indicators'].forEach(function (k) { m[k].forEach(function (s) { push(s.text, s.claimIds, s); }); });
    m.competing.forEach(function (c) { push(c.text, c.claimId ? [c.claimId] : [], c); });
    Object.keys(m.claims).forEach(function (id) { push(m.claims[id].statement, [id], null); });
    return list.sort(function (a, b) { return b.text.length - a.text.length; });
  }
  function splitByAnchors(text, anchors) {
    var out = [];
    var pos = 0;
    for (;;) {
      var best = null;
      var bestAt = -1;
      anchors.forEach(function (a) {
        var at = text.indexOf(a.text, pos);
        if (at >= 0 && (best === null || at < bestAt)) { best = a; bestAt = at; }
      });
      if (!best) break;
      if (bestAt > pos) out.push({ text: text.slice(pos, bestAt) });
      out.push({ text: best.text, anchor: best });
      pos = bestAt + best.text.length;
    }
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
  }
  var CLAIM_RANK = { accepted: 0, contested: 2, rejected: 3 };
  function anchorShade(anchor, m) {
    var worst = 0;
    anchor.claimIds.forEach(function (id) {
      var status = (m.claims[id] || {}).status;
      var rank = status in CLAIM_RANK ? CLAIM_RANK[status] : 1;
      if (rank > worst) worst = rank;
    });
    return worst === 3 ? 'shade-gap' : worst === 2 ? 'shade-partial' : worst === 1 ? 'shade-unclear' : '';
  }
  function renderMarkdown(text, ctx) {
    var root = el('div', 'page-inner');
    var container = root;
    var para = [];
    var list = null;
    function fill(node, raw) {
      (ctx.anchors ? splitByAnchors(raw, ctx.anchors) : [{ text: raw }]).forEach(function (seg) {
        if (!seg.anchor) return inlineMarkdown(node, seg.text);
        var anchor = seg.anchor;
        ctx.used[anchor.claimIds.join(',')] = true;
        var selected = ctx.selected && ctx.selected.text === anchor.text;
        var btn = el('button', 'claim' + (ctx.mode === 'confidence' ? ' ' + anchorShade(anchor, ctx.memo) : ''));
        btn.type = 'button';
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.addEventListener('click', function () { ctx.select(selected ? null : anchor); });
        inlineMarkdown(btn, seg.text);
        node.appendChild(btn);
      });
    }
    function flush() {
      if (para.length) { var p = el('p'); fill(p, para.join(' ')); container.appendChild(p); }
      para = [];
      if (list) {
        var l = el(list.tag);
        list.items.forEach(function (item) { var li = el('li'); fill(li, item); l.appendChild(li); });
        container.appendChild(l);
      }
      list = null;
    }
    text.replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      var li = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/.exec(line);
      if (h) {
        flush();
        if (h[1].length === 1) add(root, el('h3', 'doc-title', h[2]));
        else if (h[1].length === 2) { container = el('section'); add(container, el('h4', null, h[2])); root.appendChild(container); }
        else add(container, el('h5', null, h[2]));
      } else if (li) {
        var tag = li[1] ? 'ul' : 'ol';
        if (para.length || (list && list.tag !== tag)) flush();
        if (!list) list = { tag: tag, items: [] };
        list.items.push(li[2]);
      } else if (!line.trim()) {
        flush();
      } else if (list && /^\s+\S/.test(line)) {
        list.items[list.items.length - 1] += ' ' + line.trim();
      } else {
        if (list) flush();
        para.push(line.trim());
      }
    });
    flush();
    return root;
  }
  function blockerRoute(code) {
    return { OPEN_KEY_JUDGEMENT_CONTEST: ['analysis/findings', 'Open findings'], PROVISIONAL_SOURCE_LINEAGE: ['analysis/evidence', 'Open evidence'], LEGACY_SCOPE_LINEAGE_UNAVAILABLE: ['intent', 'Open intent'] }[code] || null;
  }
  function claimStatusMark(status) {
    var kind = status === 'accepted' ? 'covered' : status === 'rejected' ? 'failed' : status === 'contested' ? 'partial' : 'unclear';
    return el('span', 'mark ' + kind, status ? capital(status) : 'Not adjudicated');
  }
  function gateMark(gate) {
    return el('span', 'mark ' + (gate.status === 'blocked' ? 'attention' : gate.status ? 'covered' : 'unclear'), gate.status ? capital(humanise(gate.status)) : 'Not checked');
  }
  function noMemo() {
    var none = el('section');
    add(none, C.sectionHead('No memo yet', 'h2'), el('p', 'meta prose', 'The memo is written by the AI memo writer from the key judgements you get at the end of a synthesis round. It only uses claims that came from admitted, reviewed sources.'));
    add(none, add(el('div', 'btn-row'), C.linkButton('Go to findings', function () { C.navigate('analysis/findings'); })));
    return none;
  }
  function copyMarkdown(m) {
    var tools = el('div', 'btn-row');
    var status = el('span', 'meta');
    var copy = el('button', 'btn-secondary', 'Copy as Markdown');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      fetch('/api/artifact?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(m.markdownPath)).then(function (res) {
        if (!res.ok) throw new Error('Markdown not available');
        return res.text();
      }).then(function (text) {
        return navigator.clipboard.writeText(text).then(function () { status.textContent = 'Copied.'; }, function () { C.openSheet('memo.md', text); });
      }).catch(function (err) { status.textContent = err.message; });
    });
    add(tools, copy, C.artifactLink(m.markdownPath, 'View memo.md', true), C.artifactLink(m.relPath, 'Memo record', true), status);
    return tools;
  }
  function memoMeta(m, j) {
    var scope = j.brief.scope || {};
    return ['Memo version ' + m.versions, 'written ' + when(m.createdAt), 'from round ' + m.roundIndex, humanise(m.reviewStatus) + ' sources', m.limitedEvidence ? 'limited evidence' : '', 'for ' + (scope.audience || 'Vestas leadership')].filter(Boolean).join(' · ');
  }

  /* ----- Publication review: the memo as a page, claim trace in the side panel ----- */
  var review = { mode: 'text', selected: null };
  function tracePanel(m, j, sel) {
    var sec = el('div', 'panel-sec');
    if (!sel) {
      add(sec, el('h3', null, 'Claim trace'), el('p', 'meta', 'Select an underlined claim in the text to see the claims, sources and challenges behind it.'));
      return sec;
    }
    add(sec, el('h3', null, 'Claim trace'), el('p', 'panel-claim', sel.text));
    var s = sel.source;
    var marks = el('div', 'panel-marks');
    if (s && s.status) marks.appendChild(claimStatusMark(s.status));
    if (s && s.confidence) marks.appendChild(el('span', 'meta', capital(s.confidence) + ' confidence' + (s.ceiling && s.ceiling !== s.confidence ? ' (ceiling ' + s.ceiling + ')' : '')));
    if (s && s.openChallengeIds && s.openChallengeIds.length) marks.appendChild(el('span', 'meta', plural(s.openChallengeIds.length, 'open challenge')));
    sec.appendChild(marks);
    if (s && s.confidenceRationale) add(sec, el('p', 'meta', s.confidenceRationale));
    var round = j.rounds.filter(function (r) { return r.index === m.roundIndex; })[0];
    sel.claimIds.forEach(function (id) {
      var claim = m.claims[id];
      var roundClaim = round ? round.claims.filter(function (c) { return c.claimId === id; })[0] : null;
      var box = el('div', 'trace-claim');
      if (!claim) { add(box, el('div', 'meta', id + ' is not in the memo round.')); sec.appendChild(box); return; }
      add(box, el('div', null, claim.statement));
      var line = el('div', 'panel-marks');
      add(line, claimStatusMark(claim.status), el('span', 'meta', [claim.alias, capital(humanise(claim.kind)), (claim.confidence || 'unknown') + ' confidence', claim.singleSource ? 'single source' : ''].filter(Boolean).join(' · ')));
      box.appendChild(line);
      claim.sources.forEach(function (src) {
        var row = el('div');
        add(row, src.url ? C.externalLink(src.url, src.title) : el('span', null, src.title), el('span', 'meta', ' · ' + (src.publisher || '') + (src.reviewStatus === 'provisional' ? ' · provisional' : '')));
        box.appendChild(row);
        if (src.quotes.length) box.appendChild(quoteList(src.quotes.map(function (q) { return { quote: q.quote, note: q.text }; })));
      });
      if (roundClaim && roundClaim.challenges.length) {
        roundClaim.challenges.forEach(function (ch) { add(box, add(el('div', 'challenge'), el('div', 'meta', capital(humanise(ch.check)) + ': ' + ch.rationale))); });
        if (round.adjudicationPath) box.appendChild(C.artifactLink(round.adjudicationPath, 'Adjudication record'));
      } else if (roundClaim) add(box, el('div', 'meta', 'No challenges raised.'));
      sec.appendChild(box);
    });
    return sec;
  }
  function reviewSide(m, j, sel) {
    var side = el('div');
    var gate = el('div', 'panel-sec');
    add(gate, el('h3', null, 'Publication gate'), add(el('div', 'panel-marks'), gateMark(m.gate), el('span', 'meta', m.gate.humanApprovalAvailable ? 'Human approval is available.' : 'Human approval is not available.')));
    var approve = el('button', 'btn-primary', 'Approve for publication');
    approve.type = 'button';
    approve.disabled = true;
    approve.setAttribute('aria-describedby', 'approve-reason');
    var reason = el('p', 'meta', 'Publication approval is not a workflow action yet. Gate: ' + (m.gate.status || 'not checked') + '.');
    reason.id = 'approve-reason';
    add(gate, approve, reason);
    side.appendChild(gate);

    var bl = el('div', 'panel-sec');
    add(bl, el('h3', null, 'Blockers (' + m.blockers.length + ')'));
    if (!m.blockers.length) add(bl, el('p', 'meta', 'No publication blockers recorded.'));
    var bl2 = el('ul', 'rows-list');
    m.blockers.forEach(function (b) {
      var li = el('li');
      var box = el('div', 'resolved-row');
      var route = blockerRoute(b.code);
      var text = el('div');
      add(text, el('div', null, b.label), el('div', 'meta', b.explanation || b.code), route ? C.linkButton(route[1], function () { C.navigate(route[0]); }) : el('div', 'meta', 'Not resolved by a workflow action in this workbench.'));
      add(box, el('span', 'mark attention', ''), text);
      li.appendChild(box);
      bl2.appendChild(li);
    });
    if (m.blockers.length) bl.appendChild(bl2);
    side.appendChild(bl);

    side.appendChild(tracePanel(m, j, sel));

    var ver = el('div', 'panel-sec');
    add(ver, el('h3', null, 'Verification'), el('p', 'meta', 'Content ' + (m.verification.contentVerdict || 'not run') + ' · publication ' + (m.verification.publicationVerdict || 'not run')));
    var vl = el('ul', 'rows-list');
    m.verification.checks.forEach(function (c) {
      var kind = c.status === 'pass' ? 'covered' : c.status === 'fail' ? 'failed' : 'unclear';
      add(vl, add(el('li'), add(el('div', 'resolved-row'), el('span', 'mark ' + kind, capital(c.status)), el('span', null, capital(humanise(c.check))))));
    });
    if (m.verification.checks.length) ver.appendChild(vl);
    else add(ver, el('p', 'meta', 'No checks recorded.'));
    side.appendChild(ver);
    return side;
  }
  function reviewPage(m, j) {
    var layout = el('div', 'doc-layout');
    var left = el('div');
    var anchors = memoAnchors(m);
    var md = loadMarkdown(m);
    var legend = el('p', 'legend');
    if (review.mode === 'confidence') {
      add(legend, el('span', 'mark covered', 'Accepted'), el('span', 'mark partial', 'Contested, shaded yellow'), el('span', 'mark failed', 'Rejected, shaded red'), el('span', 'mark unclear', 'Not adjudicated, dashed'));
      left.appendChild(legend);
    }
    var sel = review.selected && anchors.filter(function (a) { return a.text === review.selected.text; })[0];
    var canvas = el('div', 'doc-canvas');
    canvas.id = 'doc';
    var page = el('div', 'page');
    var used = {};
    if (md.state === 'ready') {
      page.appendChild(renderMarkdown(md.text, {
        memo: m, anchors: anchors, used: used, mode: review.mode, selected: sel,
        select: function (anchor) { review.selected = anchor; C.render(true); }
      }));
      add(page, el('p', 'doc-meta', memoMeta(m, j)));
    } else if (md.state === 'loading') {
      var wait = el('div', 'doc-empty');
      add(wait, el('p', null, 'Loading the memo text…'));
      page.appendChild(wait);
    } else {
      add(page, add(el('div', 'doc-empty'), el('p', null, 'The memo text could not be loaded. The claims behind it are listed below.')));
    }
    canvas.appendChild(page);
    left.appendChild(canvas);
    var usedIds = {};
    Object.keys(used).forEach(function (k) { k.split(',').forEach(function (id) { usedIds[id] = true; }); });
    var loose = Object.keys(m.claims).filter(function (id) { return !usedIds[id]; });
    if (loose.length) {
      var more = el('section', 'analysis-block');
      add(more, C.sectionHead('Claims not found in the text (' + loose.length + ')', 'h3'));
      var rl = el('ul', 'rows-list');
      loose.forEach(function (id) {
        var claim = m.claims[id];
        var b = el('button', 'row-btn');
        b.type = 'button';
        add(b, claimStatusMark(claim.status), el('span', null, claim.statement));
        b.addEventListener('click', function () { review.selected = { text: claim.statement, claimIds: [id], source: null }; C.render(true); });
        add(rl, add(el('li'), b));
      });
      add(more, rl);
      left.appendChild(more);
    }
    var side = el('aside', 'side');
    side.setAttribute('aria-label', 'Review panel');
    side.appendChild(reviewSide(m, j, sel));
    add(layout, left, side);
    return layout;
  }
  function reviewWindow(m, j) {
    var frag = document.createDocumentFragment();
    var out = (j.brief.scope && j.brief.scope.requestedOutput) || 'memo';
    var bar = el('div', 'output-bar');
    var tabs = el('div', 'view-tabs');
    var tab = el('button', 'view-tab', capital(out));
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'true');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Requested output');
    tabs.appendChild(tab);
    var modes = el('div', 'modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Show');
    var seg = el('div', 'segmented');
    [['text', 'Text'], ['confidence', 'Confidence']].forEach(function (def) {
      var b = el('button', 'seg-btn', def[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', review.mode === def[0] ? 'true' : 'false');
      b.addEventListener('click', function () { review.mode = def[0]; C.render(true); });
      seg.appendChild(b);
    });
    add(modes, el('span', null, 'Show:'), seg);
    add(bar, tabs, modes);
    frag.appendChild(bar);
    if (out !== 'memo') add(frag, el('p', 'meta prose', 'Requested output: ' + humanise(out) + '. This workflow only writes the memo.'));
    if (!m.isCurrent) {
      var old = el('div', 'memo-banner');
      add(old, el('span', null, 'Out of date: written from round ' + (m.roundIndex || '?') + '. Round ' + m.currentRound + ' is newer.'), C.linkButton('Go to round ' + m.currentRound, function () { C.go({ tab: 'synthesis', round: m.currentRound }); }));
      frag.appendChild(old);
    }
    add(frag, add(el('div', 'btn-row'), copyMarkdown(m)));
    frag.appendChild(reviewPage(m, j));
    return frag;
  }

  /* ----- Output: the memo read-only, versions and audit trail ----- */
  function outputWindow(m, j) {
    var frag = document.createDocumentFragment();
    var published = m.gate.status === 'published';
    var layout = el('div', 'output-layout');
    var article = el('article', 'output-article');
    article.setAttribute('aria-label', 'Memo');
    var md = loadMarkdown(m);
    if (md.state === 'ready') article.appendChild(renderMarkdown(md.text, { memo: m, anchors: null, used: {}, mode: 'text', selected: null }));
    else add(article, el('p', 'meta', md.state === 'loading' ? 'Loading the memo text…' : 'The memo text could not be loaded. Open the memo record instead.'));
    var aside = el('aside', 'output-aside');
    aside.setAttribute('aria-label', 'Export, versions and audit');
    var status = el('div');
    add(status, add(el('div', 'panel-marks'), published ? el('span', 'mark done', 'Published') : el('span', 'mark attention', 'Draft, not published')));
    add(status, el('p', 'meta', published ? 'Publication gate: ' + m.gate.status + '.' : 'Publication approval is not a workflow action yet. Gate: ' + (m.gate.status || 'not checked') + '.'), copyMarkdown(m));
    var versions = el('div');
    add(versions, add(el('div', 'section-head'), el('h3', null, 'Versions')));
    var vl = el('ul', 'rows');
    var all = [];
    j.rounds.forEach(function (r) { r.memoPaths.forEach(function (p) { all.push({ path: p, round: r.index }); }); });
    all.reverse().forEach(function (v, i) {
      var current = v.path === m.relPath;
      var li = el('li');
      add(li, C.artifactLink(v.path, 'Memo from round ' + v.round, true), ' ', current ? el('span', 'mark attention', published ? 'Published' : 'Latest draft') : el('span', 'mark closed', 'Superseded'));
      if (current) add(li, el('div', 'when', 'Written ' + when(m.createdAt)));
      vl.appendChild(li);
    });
    if (!all.length) add(vl, add(el('li'), el('span', 'meta', 'Only the current memo record is available.')));
    versions.appendChild(vl);
    var ran = el('div');
    add(ran, add(el('div', 'section-head'), el('h3', null, 'Ran under')));
    ran.appendChild(C.kv([['Analysis', state.runId], ['Synthesis round', String(m.roundIndex || '')], ['Memo versions', String(m.versions)], ['Sources', m.reviewStatus ? humanise(m.reviewStatus) : '']]));
    var trail = el('div');
    var events = state.view.events || [];
    add(trail, add(el('div', 'section-head'), el('h3', null, 'Audit trail'), C.linkButton('All events', function () { C.navigate('audit'); })));
    var tl = el('ul', 'rows');
    events.slice(0, 8).forEach(function (e) {
      var li = el('li');
      add(li, humanise(e.type), el('div', 'when', [when(e.at), e.actor ? 'by ' + e.actor : ''].filter(Boolean).join(' · ')));
      tl.appendChild(li);
    });
    if (!events.length) add(tl, add(el('li'), el('span', 'meta', 'No events recorded.')));
    trail.appendChild(tl);
    add(aside, status, versions, ran, trail);
    add(layout, article, aside);
    frag.appendChild(layout);
    return frag;
  }
  C.panes.memo = function () {
    var j = C.journey();
    var host = $('pane-memo');
    if (!j) return;
    var m = j.memo;
    if (!m) return C.replace(host, add(document.createDocumentFragment(), noMemo()));
    C.replace(host, state.route === 'output' ? outputWindow(m, j) : reviewWindow(m, j));
  };

  /* ================= Audit ================= */
  function stageRow(stage) {
    var row = el('div', 'stage');
    var kind = stage.status;
    add(row, el('div', 'name', capital(stage.name)), C.statusMark(kind, humanise(stage.status)));
    var detail = el('div', 'detail');
    if (stage.attempts > 0) add(detail, el('div', 'figures', 'Attempts: ' + stage.attempts));
    var failures = Object.keys(stage.failures || {});
    if (failures.length) add(detail, el('div', 'meta fail', 'Failures: ' + failures.map(function (k) { return k + ' ×' + stage.failures[k]; }).join(', ')));
    if ((stage.artifacts || []).length) {
      var d = el('details');
      add(d, el('summary', null, plural(stage.artifacts.length, 'record')));
      stage.artifacts.forEach(function (a) { d.appendChild(C.artifactLink(a.relPath)); });
      detail.appendChild(d);
    }
    row.appendChild(detail);
    return row;
  }
  function lane(stages) {
    var l = el('div', 'lane');
    stages.forEach(function (s) { l.appendChild(stageRow(s)); });
    return l;
  }
  C.panes.audit = function () {
    var v = state.view;
    var host = $('pane-audit');
    if (!v) return;
    var frag = document.createDocumentFragment();

    var ex = el('section');
    add(ex, C.sectionHead('Exceptions', 'h2'));
    if (!v.exceptions.length) add(ex, el('p', 'meta', 'No exceptions recorded.'));
    else {
      var t = el('ul', 'rows audit-rows');
      v.exceptions.forEach(function (e) {
        var li = el('li', 'audit-row');
        add(li, add(el('div'), C.artifactLink(e.relPath, humanise(e.kind))), C.statusMark(e.status === 'open' ? 'failed' : 'committed', capital(e.status)), el('span', 'meta figures', 'Raised ' + when(e.raisedAt)));
        t.appendChild(li);
      });
      ex.appendChild(t);
    }
    frag.appendChild(ex);

    var board = el('section');
    add(board, C.sectionHead('Artefact board', 'h2', el('span', 'meta', v.counts.files + ' files' + (v.truncated ? ' · scan truncated' : ''))));
    add(board, el('p', 'meta prose', 'Status inferred from the files on disk. Use it to inspect records; the other windows show the workflow.'));
    add(board, el('h3', null, 'Intent, collection and admission'), lane(v.panel1.stages));
    v.sources.forEach(function (s) {
      var note = (C.journey() && C.journey().notes) || {};
      var title = Object.keys(note).map(function (k) { return note[k]; }).filter(function (n) { return n.snapshotId === s.snapshotId; })[0];
      add(board, el('h3', null, 'Source: ' + (title ? title.title : s.snapshotId)), lane(s.stages));
    });
    add(board, el('h3', null, 'Synthesis and memo'), lane(v.synthesis));
    frag.appendChild(board);

    var adv = el('section');
    add(adv, C.sectionHead('Deterministic next step', 'h2'), el('p', 'meta prose', 'Runs run:next, which checks the run for a deterministic step it can take without a human or model decision.'));
    add(adv, add(el('div', 'btn-row'), runNextButton()));
    frag.appendChild(adv);

    var evs = el('section');
    evs.id = 'focus-events';
    add(evs, C.sectionHead('Events (' + v.events.length + ', newest first)', 'h2'));
    if (!v.events.length) add(evs, el('p', 'meta', 'No events recorded.'));
    else {
      var et = el('ul', 'rows audit-rows');
      v.events.forEach(function (e) {
        var li = el('li', 'audit-row');
        add(li, el('span', 'meta figures', when(e.at)), el('span', null, e.type), el('span', 'meta', [humanise(e.stage), e.status, e.actor].filter(Boolean).join(' · ')));
        et.appendChild(li);
      });
      evs.appendChild(et);
    }
    frag.appendChild(evs);
    C.replace(host, frag);
  };
})();
