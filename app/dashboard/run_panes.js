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
  var RQ_MARK = { covered: ['covered', 'Covered'], partial: ['partial', 'Partial'], gap: ['gap', 'Gap'], silent: ['', 'No evidence'], contradicted: ['failed', 'Contradicted'] };
  function rqMark(disposition) {
    var entry = RQ_MARK[disposition] || ['unclear', 'Not assessed yet'];
    return el('span', ('mark ' + entry[0]).trim(), entry[1]);
  }
  function requirementText(irId) {
    var j = C.journey();
    var req = j ? j.brief.requirements.filter(function (r) { return r.irId === irId; })[0] : null;
    return req ? req.text : '';
  }

  /* ================= Gate 1: Research Plan (Brief) ================= */
  var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
  var GENERATED = ['in-irs', 'in-disc-queries', 'in-disc-terms', 'in-purpose', 'in-topic', 'in-rationale'];
  var scopedRunId = '';
  var planQuestions = [];
  var planSignature = '';
  var planGenerating = false;
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
      : existingRuns().indexOf(value) >= 0 && value !== scopedRunId ? 'An analysis with this ID already exists.' : '';
    hint.textContent = problem || 'Available.';
    hint.className = 'hint' + (problem ? ' fail' : '');
    $('in-run-id').classList.toggle('invalid', Boolean(problem));
    return !problem;
  }
  function syncDerivations() {
    var thesis = $('in-question').value.trim();
    if (!scopedRunId) {
      if (!state.dirty['in-purpose']) $('in-purpose').value = thesis;
      if (!state.dirty['in-topic']) $('in-topic').value = thesis.slice(0, 400);
    }
    $('plan-scope-summary').textContent = [$('in-geo').value, $('in-from').value + ' to ' + $('in-to').value, $('in-output').selectedOptions[0].textContent].join(' · ');
  }
  function scopeSignature() {
    var p = intentPayload(false);
    return JSON.stringify([p.researchThesis.trim(), p.audience, p.geographies, p.from, p.to, p.requestedOutput]);
  }
  function invalidateGeneratedPlan() {
    syncDerivations();
    if (planSignature && scopeSignature() !== planSignature) {
      $('generated-plan').hidden = true;
      $('draft-question-status').textContent = 'Thesis or scope changed. Generate a new plan to match.';
      $('btn-draft-question').textContent = 'Generate research plan';
    } else if (planSignature) {
      $('generated-plan').hidden = false;
    }
    invalidateReview();
  }
  function syncPlanFields() {
    $('in-irs').value = planQuestions.map(function (item) { return item.question; }).join('\n');
    $('in-disc-queries').value = planQuestions.reduce(function (all, item) { return all.concat(item.searches); }, []).join('\n');
    invalidateReview();
  }
  function renderPlanQuestions() {
    var host = $('generated-plan-questions');
    C.clear(host);
    planQuestions.forEach(function (item, index) {
      var row = el('li', 'plan-question');
      var question = el('div', 'field');
      var questionId = 'plan-question-' + index;
      var label = el('label', null, 'Research question ' + (index + 1));
      label.htmlFor = questionId;
      var input = el('textarea');
      input.id = questionId;
      input.rows = 2;
      input.maxLength = 400;
      input.value = item.question;
      input.addEventListener('input', function () { item.question = input.value; syncPlanFields(); });
      var why = el('details', 'plan-reason');
      add(why, el('summary', null, 'Connection to your thesis'), el('p', 'meta plan-connection', item.rationale));
      add(question, label, input, why);
      var searches = el('div', 'field plan-searches');
      searches.appendChild(el('span', 'label', 'Proposed Seerist searches'));
      item.searches.forEach(function (search, searchIndex) {
        var searchInput = el('input');
        searchInput.type = 'text';
        searchInput.maxLength = 120;
        searchInput.value = search;
        searchInput.setAttribute('aria-label', 'Research question ' + (index + 1) + ', Seerist search ' + (searchIndex + 1));
        searchInput.addEventListener('input', function () { item.searches[searchIndex] = searchInput.value; syncPlanFields(); });
        searches.appendChild(searchInput);
      });
      add(row, question, searches);
      host.appendChild(row);
    });
  }
  function maxExternalBudget() {
    var elIn = $('in-max-external');
    var n = Number((elIn && elIn.value) || 6);
    if (!isFinite(n) || n < 1) return 6;
    return Math.min(20, Math.round(n));
  }
  function intentPayload(runDiscovery) {
    return {
      action: 'approve-intent',
      runDiscovery: Boolean(runDiscovery),
      runPipeline: Boolean(runDiscovery),
      maxExternalArticles: maxExternalBudget(),
      runId: $('in-run-id').value.trim(),
      reviewerId: C.analyst(),
      audience: $('in-audience').value,
      requestedOutput: $('in-output').value,
      geographies: $('in-geo').value,
      from: $('in-from').value,
      to: $('in-to').value,
      purpose: $('in-purpose').value,
      threatTopic: $('in-topic').value,
      researchThesis: $('in-question').value,
      question: $('in-generated-question').value,
      rationale: $('in-rationale').value,
      requirements: $('in-irs').value,
      minimumScore: Number($('in-disc-score').value || 4),
      queries: $('in-disc-queries').value,
      rankingTerms: $('in-disc-terms').value
    };
  }
  function lines(text) { return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean); }
  function invalidateReview() {
    state.drafts['intent:confirm'] = '';
    $('approval-review').hidden = true;
    $('approve-confirm').checked = false;
    syncApproveButtons();
  }
  function syncApproveButtons() {
    var enabled = $('approve-confirm').checked && !state.busy && !planGenerating && Boolean(C.analyst()) &&
      (!planSignature || scopeSignature() === planSignature) && !planEditProblems().length;
    $('btn-approve-collect').disabled = !enabled;
    $('btn-approve-only').disabled = !enabled;
  }
  function intentProblems() {
    var p = intentPayload(true);
    var irs = lines(p.requirements);
    var problems = [];
    if (!C.analyst()) problems.push('Enter your analyst ID in the top bar.');
    if (planSignature && scopeSignature() !== planSignature) problems.push('The thesis or scope changed. Generate a new research plan.');
    problems = problems.concat(planEditProblems());
    if (!p.question.trim()) problems.push('Write the question.');
    if (!validateRunId()) problems.push('Fix the analysis ID.');
    if (!p.from || !p.to || p.from > p.to) problems.push('Set a valid time window.');
    if (!irs.length || irs.length > 24 || irs.some(function (l) { return l.length > 400; })) problems.push('Give 1–24 research questions of at most 400 characters.');
    if (!p.purpose.trim() || !p.threatTopic.trim() || !p.rationale.trim()) problems.push('Complete the purpose, threat topic and why it matters.');
    return problems;
  }
  function planEditProblems() {
    if (!planQuestions.length) return [];
    var searches = planQuestions.reduce(function (all, item) { return all.concat(item.searches); }, []);
    var invalid = planQuestions.some(function (item) { return !item.question.trim() || /[\r\n]/.test(item.question); }) ||
      searches.some(function (search) { return !search.trim() || /[\r\n"“”|():=]|\b(?:AND|OR|NOT)\b/.test(search) || search.trim().split(/\s+/).length > 6; });
    if (invalid) return ['Fill each question and search. Use short search terms without Boolean operators or filters.'];
    if (searches.length > 10 || new Set(searches.map(function (search) { return search.trim().toLowerCase(); })).size !== searches.length) return ['Use at most 10 distinct Seerist searches.'];
    return [];
  }
  function irList() { var text = $('in-irs').value; return text ? text.split(/\r?\n/) : []; }
  function setIrs(list) { $('in-irs').value = list.join('\n'); state.dirty['in-irs'] = true; invalidateReview(); }

  function reviewIntent() {
    var p = intentPayload(true);
    var irs = lines(p.requirements);
    var problems = [];
    problems = problems.concat(planEditProblems());
    if (planSignature && scopeSignature() !== planSignature) problems.push('The thesis or scope changed. Generate a new research plan.');
    if (!C.analyst()) problems.push('Enter your analyst ID in the top bar.');
    if (!p.researchThesis.trim()) problems.push('Write the research thesis.');
    if (!p.question.trim()) problems.push('Write the question.');
    if (!validateRunId()) problems.push('Fix the analysis ID.');
    if (!p.from || !p.to || p.from > p.to) problems.push('Set a valid window.');
    if (!irs.length || irs.length > 24 || irs.some(function (l) { return l.length > 400; })) problems.push('Give 1–24 requirements of at most 400 characters.');
    if (!p.purpose.trim() || !p.threatTopic.trim() || !p.rationale.trim()) problems.push('Complete the scope wording.');
    $('intent-problem').textContent = problems.join(' ');
    if (problems.length) return;
    var summary = document.createDocumentFragment();
    add(summary, C.kv([
      ['Analysis ID', p.runId], ['Approver', C.analyst()], ['Research thesis', p.researchThesis], ['Question', p.question], ['Why it matters', p.rationale],
      ['Purpose', p.purpose], ['Threat topic', p.threatTopic], ['Audience', p.audience], ['Geographies', p.geographies],
      ['Window', p.from + ' → ' + p.to], ['Deliverable', $('in-output').selectedOptions[0].textContent]
    ]));
    add(summary, el('div', 'form-label', 'Information requirements (' + irs.length + ')'));
    var ol = el('ol', 'approval-list');
    irs.forEach(function (ir) { ol.appendChild(el('li', null, ir)); });
    summary.appendChild(ol);
    add(summary, el('div', 'form-label', 'Automated memo pipeline if you choose “Approve plan & generate memo”'));
    add(summary, C.kv([
      ['Searches', lines(p.queries).join(' · ')],
      ['Ranking terms', p.rankingTerms],
      ['Minimum score', String(p.minimumScore)],
      ['External article budget', p.maxExternalArticles + ' publisher articles (+ Seerist analyst reports)']
    ]));
    C.replace($('approval-summary'), summary);
    $('approve-confirm-text').textContent = 'I, ' + C.analyst() + ', approve this scope, question and ' + plural(irs.length, 'requirement') + '.';
    $('approval-review').hidden = false;
    $('approve-confirm').checked = false;
    syncApproveButtons();
    $('approval-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function approve(runDiscovery) {
    if (state.busy || planGenerating || intentProblems().length ||
        !(state.route === 'new' ? $('approve-confirm').checked : state.drafts['intent:confirm'])) return;
    var payload = intentPayload(runDiscovery);
    C.postAction(payload, runDiscovery ? 'Approving plan and starting automated pipeline' : 'Approving the research plan').then(function (data) {
      if (!data || !data.ok) return;
      state.newMode = false;
      state.dirty = {};
      invalidateReview();
      $('in-question').value = '';
      $('in-generated-question').value = '';
      scopedRunId = '';
      planSignature = '';
      planQuestions = [];
      $('generated-plan').hidden = true;
      C.switchRun(data.runId || payload.runId);
      C.navigate(runDiscovery ? 'review' : 'intent');
    });
  }
  C.startNew = function () {
    if (!$('in-to').value) setWindow(60);
    if (!$('in-run-id').value.trim()) suggestRunId('analysis');
    validateRunId();
    syncDerivations();
    $('in-question').focus();
  };
  C.initBrief = function () {
    setWindow(60);
    document.querySelectorAll('[data-window-days]').forEach(function (b) { b.addEventListener('click', function () { setWindow(Number(b.getAttribute('data-window-days'))); invalidateGeneratedPlan(); }); });
    GENERATED.forEach(function (id) { $(id).addEventListener('input', function () { state.dirty[id] = true; }); });
    ['in-question', 'in-geo', 'in-audience', 'in-from', 'in-to', 'in-output'].forEach(function (id) {
      $(id).addEventListener('input', invalidateGeneratedPlan);
      $(id).addEventListener('change', invalidateGeneratedPlan);
    });
    $('in-run-id').addEventListener('input', validateRunId);
    $('brief-new').addEventListener('input', function (e) { if (e.target.id !== 'approve-confirm') invalidateReview(); });
    $('brief-new').addEventListener('change', function (e) { if (e.target.id !== 'approve-confirm') invalidateReview(); });
    $('btn-review-intent').addEventListener('click', reviewIntent);
    $('btn-draft-question').classList.add('act');
    $('btn-draft-question').addEventListener('click', function () {
      if (planGenerating || state.busy) return;
      syncDerivations();
      var payload = intentPayload(false);
      if (!validateRunId()) return;
      if (!payload.researchThesis.trim() || !payload.geographies.trim() || !payload.audience.trim() || !payload.from || !payload.to || payload.from > payload.to) {
        $('draft-question-status').textContent = 'Enter a thesis and check the geography, audience and dates under Refine scope.';
        $('in-question').focus();
        return;
      }
      var signature = scopeSignature();
      payload.action = 'generate-research-plan';
      planGenerating = true;
      invalidateReview();
      $('generated-plan').setAttribute('aria-busy', 'true');
      $('draft-question-status').textContent = 'Turning your thesis into research questions and searches...';
      $('btn-draft-question').textContent = 'Generating plan...';
      C.postAction(payload, 'Generating the research plan').then(function (data) {
        if (!data || !data.ok) {
          $('draft-question-status').textContent = data && data.error || 'Generation failed. Check Settings and retry. Nothing was approved or collected.';
          return;
        }
        if (signature !== scopeSignature()) {
          $('draft-question-status').textContent = 'Your thesis or scope changed during generation. Generate again for the current text.';
          return;
        }
        $('in-generated-question').value = data.draft.question;
        $('in-rationale').value = data.draft.rationale;
        state.dirty['in-rationale'] = true;
        $('in-disc-terms').value = data.draft.rankingTerms.join(', ');
        planQuestions = data.draft.questions;
        planSignature = signature;
        syncPlanFields();
        renderPlanQuestions();
        invalidateReview();
        $('generated-plan-meta').textContent = planQuestions.length + ' questions · ' + lines($('in-disc-queries').value).length + ' searches · Drafted with ' + data.model;
        $('generated-plan').hidden = false;
        $('draft-question-status').textContent = 'Plan ready. Review the questions and searches below.';
        $('generated-plan').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).finally(function () {
        planGenerating = false;
        syncApproveButtons();
        $('generated-plan').setAttribute('aria-busy', 'false');
        $('btn-draft-question').textContent = 'Generate research plan';
      });
    });
    $('btn-edit-intent').addEventListener('click', function () { invalidateReview(); $('in-question').focus(); });
    $('approve-confirm').addEventListener('change', syncApproveButtons);
    $('btn-approve-collect').addEventListener('click', function () { approve(true); });
    $('btn-approve-only').addEventListener('click', function () { approve(false); });
    $('btn-cancel-new').addEventListener('click', function () { C.navigate('intent'); });
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
    { key: 'topic', label: 'Research topic', ids: ['in-topic'], kind: 'text', why: 'Derived from your thesis.' },
    { key: 'rationale', label: 'Thesis connection', ids: ['in-rationale'], kind: 'text', why: 'Proposed by Copilot for your review.' }
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
    add(kicker, el('span', 'mark attention', 'Waiting for you'),     el('span', null, '· Intent decision'));
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

    var q = el('section');
    add(q, C.sectionHead('Research question', 'h2', b.question ? C.artifactLink(b.question.relPath, 'Approved record', true) : null));
    if (b.question) {
      add(q, el('p', 'prose', b.question.question), el('p', 'meta prose', b.question.rationale), el('div', 'meta', 'Approved by ' + (b.question.approvedBy || 'analyst')));
    } else {
      add(q, el('p', 'meta', 'Scope approved. Review or draft the question before collection.'));
      var resume = C.linkButton('Continue question drafting', function () {
        scopedRunId = state.runId;
        var values = {
          'in-run-id': state.runId, 'in-question': s.researchThesis, 'in-purpose': s.purpose,
          'in-topic': s.threatTopic, 'in-geo': s.geographies.join(', '), 'in-audience': s.audience,
          'in-output': s.requestedOutput, 'in-from': s.from.slice(0, 10), 'in-to': s.to.slice(0, 10),
          'in-generated-question': b.draftQuestion ? b.draftQuestion.question : '',
          'in-rationale': b.draftQuestion ? b.draftQuestion.rationale : ''
        };
        Object.keys(values).forEach(function (id) { $(id).value = values[id] || ''; });
        ['in-purpose', 'in-topic', 'in-rationale'].forEach(function (id) { state.dirty[id] = true; });
        syncDerivations();
        planSignature = '';
        planQuestions = [];
        $('generated-plan').hidden = true;
        $('draft-question-status').textContent = 'Existing scope restored. Generate a plan to draft its questions and searches.';
        state.newMode = true;
        invalidateReview();
        C.navigate('new');
        $('in-question').focus();
      });
      add(q, resume);
    }
    main.appendChild(q);
    add(main, C.kv([['Research thesis', s.researchThesis]]));

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
    var list = el('ul', 'rows rq-list');
    b.requirements.forEach(function (r) {
      var li = el('li', 'rq-row');
      add(li, el('strong', 'rq-text', r.text), rqMark(r.coverage), el('span', 'meta rq-id', r.irId));
      list.appendChild(li);
    });
    reqs.appendChild(list);
    if (!b.requirements.length) add(reqs, el('p', 'meta prose', 'No approved research questions. Extraction cannot be prepared until they are recorded (npm run approve:requirements).'));
    main.appendChild(reqs);

    var aside = el('aside', 'trace-pane plate-pane');
    aside.setAttribute('aria-label', 'Gate 1 decision');
    var plate = el('div', 'plate');
    var kicker = el('div', 'plate-kicker');
    add(kicker, el('span', 'mark done', 'Approved'), el('span', null, '· Gate 1 research plan'));
    var open = el('a', 'btn-primary', j.memo ? 'Open Memo' : 'Open automated pipeline');
    open.href = '#/review';
    var actions = el('div', 'btn-row');
    actions.appendChild(open);
    if (!j.memo && b.question && b.requirements.length) {
      actions.appendChild(C.actButton('Generate memo now', 'btn-secondary', function () {
        C.postAction({ action: 'run-pipeline', runId: state.runId, reviewerId: C.analyst(), maxExternalArticles: maxExternalBudget() }, 'Starting automated pipeline')
          .then(function (res) { if (res && res.ok) C.navigate('review'); });
      }, true));
    }
    add(plate, kicker, el('p', 'plate-confirm plate-lead', (b.question ? 'Approved by ' + (b.question.approvedBy || 'analyst') + '. ' : '') + 'This research plan is locked for auditability.'), actions);
    aside.appendChild(plate);
    if (b.question) add(aside, add(el('p', 'meta'), 'Question record: ', C.artifactLink(b.question.relPath, 'Approved record', true)));

    if (b.discoveries.length) {
      var collect = el('section');
      collect.id = 'focus-collect';
      add(collect, C.sectionHead('Recorded Seerist discovery runs', 'h3'));
      var t = el('table', 'collect-table');
      var head = el('tr');
      [['Searches', ''], ['Leads', 'num'], ['API calls', 'num']].forEach(function (h) { head.appendChild(el('th', h[1], h[0])); });
      t.appendChild(head);
      b.discoveries.forEach(function (d) {
        var tr = el('tr');
        var cell = el('td');
        add(cell, el('div', null, d.queries.join(' · ') || d.planId), C.artifactLink(d.relPath, 'Results'));
        add(tr, cell, el('td', 'num', d.candidateCount), el('td', 'num', d.apiCalls));
        t.appendChild(tr);
      });
      add(collect, add(el('div', 'table-wrap'), t));
      aside.appendChild(collect);
    }

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

  /* ================= Evidence projection helpers ================= */
  var EXPLORER_LABEL = { admitted: 'Admitted', 'metadata-only': 'Metadata only', 'pending-admission': 'Pending admission', closed: 'Closed', 'in-progress': 'In progress' };
  var BLOCKER_TEXT = 'Seerist leads wait for the RSS-connected source list before their publisher pages are fetched.';
  function category(row) {
    if (row.state === 'action') return 'action';
    if (row.state === 'pending') return 'pending';
    if (row.state === 'done') return 'done';
    if (row.state === 'closed') return 'closed';
    return 'progress';
  }
  function isProjected(ew) {
    return Boolean(ew && ew.schemaVersion === 1 && ew.pipeline && Array.isArray(ew.questions) && ew.exceptions && Array.isArray(ew.exceptions.items) && Array.isArray(ew.sourceExplorer));
  }
  function rowMapOf(j) {
    var map = {};
    j.sources.forEach(function (r) { map[r.id] = r; });
    return map;
  }
  function fallbackDisposition(row) {
    if (row.candidate && row.candidate.decision && row.candidate.decision.outcome === 'approved') return 'admitted';
    if (row.state === 'closed') return 'closed';
    if (row.state === 'pending') return 'metadata-only';
    if (row.action && row.action.kind === 'admit') return 'pending-admission';
    return 'in-progress';
  }
  function fallbackModel(j) {
    var pending = j.leads.filter(function (l) { return l.pendingRss; }).length;
    var explorer = j.sources.map(function (row) {
      var disposition = fallbackDisposition(row);
      return { entry: { rowId: row.id, title: row.title, disposition: disposition, snapshotId: null, countsAsEvidence: disposition === 'admitted' }, row: row };
    });
    var questions = j.brief.requirements.map(function (req) {
      var observationIds = [];
      var sourceNoteIds = [];
      j.sources.forEach(function (row) {
        if (!row.review || !row.review.observations) return;
        row.review.observations.forEach(function (o) {
          if (!o.irIds || o.irIds.indexOf(req.irId) < 0) return;
          observationIds.push(o.observationId);
          if (sourceNoteIds.indexOf(row.id) < 0) sourceNoteIds.push(row.id);
        });
      });
      return { id: req.irId, text: req.text, coverage: 'unassessed', sourceNoteIds: sourceNoteIds, observationIds: observationIds };
    });
    var items = [];
    j.sources.forEach(function (row) {
      var kind = category(row) === 'action' ? 'needs_you' : row.state === 'failed' ? 'failed' : row.review && row.review.status === 'provisional' ? 'provisional_review' : '';
      if (!kind) return;
      items.push({ id: row.id, kind: kind, status: row.current ? row.current.label : row.state, relPath: row.artifacts && row.artifacts[0] ? row.artifacts[0].relPath : null });
    });
    return {
      pipeline: {
        leads: { count: j.leads.length, basis: 'Seerist leads listed for this run' },
        captured: null,
        blocker: pending ? { kind: 'pending_rss', leadCount: pending, explanation: BLOCKER_TEXT } : null,
        stages: [
          { key: 'admitted', label: 'Admitted as evidence', count: explorer.filter(function (e) { return e.entry.countsAsEvidence; }).length, basis: 'Source rows whose admission decision is approved' },
          { key: 'reviewed', label: 'Source reviews recorded', count: j.sources.filter(function (r) { return r.review && r.review.status === 'recorded'; }).length, basis: 'Source rows with a recorded source review' }
        ]
      },
      questions: questions,
      exceptions: { open: items.length, items: items },
      explorer: explorer,
      projected: false
    };
  }
  function projectedModel(j, ew) {
    var rows = rowMapOf(j);
    var explorer = [];
    ew.sourceExplorer.forEach(function (e) { if (rows[e.rowId]) explorer.push({ entry: e, row: rows[e.rowId] }); });
    return {
      pipeline: {
        leads: ew.pipeline.leads || null,
        captured: ew.pipeline.capturedSources || null,
        blocker: ew.pipeline.acquisitionBlocker || null,
        stages: Array.isArray(ew.pipeline.stages) ? ew.pipeline.stages : []
      },
      questions: ew.questions.map(function (q) {
        return { id: q.id, text: q.text, coverage: q.coverage || 'unassessed', sourceNoteIds: Array.isArray(q.sourceNoteIds) ? q.sourceNoteIds : null, observationIds: Array.isArray(q.observationIds) ? q.observationIds : null };
      }),
      exceptions: { open: ew.exceptions.open, items: ew.exceptions.items },
      explorer: explorer,
      projected: true
    };
  }
  function evidenceModel(j) {
    return isProjected(j.evidenceWorkspace) ? projectedModel(j, j.evidenceWorkspace) : fallbackModel(j);
  }
  function coverageLabel(coverage) {
    return coverage === 'unassessed' || !coverage ? 'Unassessed' : capital(humanise(coverage));
  }
  function filterExplorer(entries, filter, query) {
    var q = (query || '').trim().toLowerCase();
    return entries.filter(function (e) {
      if (filter !== 'all' && category(e.row) !== filter) return false;
      if (!q) return true;
      var hay = [e.entry.title, e.row.publisher, EXPLORER_LABEL[e.entry.disposition] || e.entry.disposition].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  C.evidence = { model: evidenceModel, filterExplorer: filterExplorer, coverageLabel: coverageLabel };

  /* ================= Automated Pipeline & Gate 2 Memo Review ================= */
  var MD_CACHE = {};
  var PIPELINE_STAGES = [
    { key: 'collection', label: '1. Discover & fetch', detail: 'Seerist leads, publisher pages & analyst reports' },
    { key: 'evidence', label: '2. Relevance & extraction', detail: 'Observations & verbatim quotes' },
    { key: 'assurance', label: '3. Source assurance', detail: 'Verbatim quote checks & credibility ceiling' },
    { key: 'synthesis', label: '4. Synthesis & challenge', detail: 'Claims, adversarial caveats & key judgements' },
    { key: 'memo', label: '5. Memo & verification', detail: 'Executive draft & 11 deterministic checks' }
  ];
  var STAGE_ORDER = {
    starting: 0, discovery: 0, collection: 0, collect: 0,
    relevance: 1, extract: 1, evidence: 1,
    assurance: 2, assure: 2,
    synthesis: 3, synthesize: 3, adjudication: 3, adjudicate: 3,
    memo: 4, draft: 4,
    complete: 5, completed: 5
  };
  function pipeStatus(pipe) {
    if (!pipe) return '';
    if (pipe.status) return pipe.status;
    if (pipe.state === 'memo-review') return 'ready-for-review';
    return pipe.state || '';
  }
  function pipeStage(pipe) {
    return (pipe && (pipe.stage || pipe.currentStage || pipe.phase)) || '';
  }
  function pipeMessage(pipe) {
    return (pipe && (pipe.message || pipe.stageDetail || pipe.detail)) || '';
  }

  function openSeeristLead(lead, fallbackTitle) {
    var title = (lead && lead.title) || fallbackTitle || 'Seerist report';
    C.openSheet(title, 'Loading…');
    fetch('/api/lead?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(lead.rawArtifactRef) + '&id=' + encodeURIComponent(lead.providerItemId)).then(function (res) {
      if (!res.ok) throw new Error('Report text not available (' + res.status + ')');
      return res.json();
    }).then(function (d) {
      var head = [
        (lead.tierLabel || humanise(d.sourceType)) + (d.published ? ' · ' + d.published.slice(0, 10) : ''),
        d.countries && d.countries.length ? 'Countries: ' + d.countries.join(', ') : '',
        d.link ? 'Link: ' + d.link : 'Delivered directly by Seerist'
      ].filter(Boolean).join('\n');
      var parts = [head];
      if (d.summary) parts.push('SUMMARY\n' + d.summary);
      parts.push(d.body ? 'FULL TEXT\n' + d.body : 'Only summary text is recorded for this item.');
      C.openSheet(d.title || title, parts.join('\n\n'), true);
    }).catch(function (err) { C.openSheet(title, err.message); });
  }
  function findLeadForUrl(j, url) {
    if (!url || !j || !j.leads) return null;
    var prefix = 'seerist://wod/';
    if (url.indexOf(prefix) === 0) {
      var itemId = url.slice(prefix.length);
      return j.leads.filter(function (l) { return l.providerItemId === itemId; })[0] || null;
    }
    return j.leads.filter(function (l) { return l.url === url; })[0] || null;
  }
  function sourceAccessLink(j, url, label) {
    if (url && /^https?:\/\//i.test(url)) return C.externalLink(url, label || url);
    var lead = findLeadForUrl(j, url);
    if (lead && lead.rawArtifactRef) {
      return C.linkButton(label || 'Read Seerist report', function () { openSeeristLead(lead, label); });
    }
    return url ? el('span', 'meta mono', url) : null;
  }

  function pipelineStageState(idx, pipe, j) {
    var stKey = pipeStage(pipe);
    var pStat = pipeStatus(pipe);
    var activeIdx = stKey in STAGE_ORDER ? STAGE_ORDER[stKey] : -1;
    var running = Boolean(pipe && (pipe.workerActive || pStat === 'running'));
    var failed = Boolean(pipe && (pStat === 'failed' || pStat === 'interrupted'));
    if (j.memo) return 'is-done';
    if (activeIdx > idx) return 'is-done';
    if (activeIdx === idx) return failed ? 'is-failed' : running ? 'is-active' : '';
    if (idx === 0 && j.leads && j.leads.length && !running) return 'is-done';
    if (idx === 1 && j.sources && j.sources.some(function (s) { return s.review; }) && !running) return 'is-done';
    if (idx === 3 && j.rounds && j.rounds.length && !running) return 'is-done';
    return '';
  }

  function pipelineWindow(j) {
    var frag = document.createDocumentFragment();
    var v = state.view || {};
    var pipe = v.pipeline || null;
    var pStat = pipeStatus(pipe);
    var pMsg = pipeMessage(pipe);
    var counts = (pipe && pipe.counts) || v.counts || {};
    var hasPlan = Boolean(j.brief && j.brief.scope && j.brief.question && j.brief.requirements && j.brief.requirements.length);
    var running = Boolean(pipe && (pipe.workerActive || pStat === 'running'));
    var failed = Boolean(pipe && (pStat === 'failed' || pStat === 'interrupted'));

    var card = el('section', 'pipeline-card');
    var head = el('div', 'pipeline-head');
    var left = el('div');
    var badge = running ? el('span', 'ai-mark', 'Running pipeline')
      : failed ? el('span', 'mark failed', pStat === 'interrupted' ? 'Interrupted' : 'Paused')
      : hasPlan ? el('span', 'mark attention', 'Ready to generate')
      : el('span', 'mark', 'No plan yet');
    var headingText = !hasPlan ? 'Approve a research plan first'
      : running ? 'Generating your evidence-grounded memo'
      : failed ? 'Automated pipeline paused before memo completion'
      : 'Ready to run the automated memo pipeline';
    add(left, badge, el('h3', null, headingText),
      el('p', 'meta prose', !hasPlan
        ? 'Start at Gate 1 (New analysis) to turn your thesis into approved research questions and Seerist searches.'
        : running ? (pMsg || 'Collecting sources, verifying verbatim quotes, and drafting the executive memo. This page refreshes automatically.')
        : failed ? ((pipe && pipe.error) || pMsg || 'Fix any missing API key or connection issue in Settings, then resume from the exact checkpoint on disk.')
        : 'Runs Seerist collection, article capture, relevance screening, verbatim quote assurance, synthesis, challenge adjudication, and memo writing end to end.'));

    var actions = el('div', 'btn-row');
    if (!hasPlan) {
      var createBtn = el('button', 'btn-primary', 'Create research plan');
      createBtn.type = 'button';
      createBtn.addEventListener('click', function () { C.navigate('new'); });
      actions.appendChild(createBtn);
    } else if (running) {
      var waitBtn = el('button', 'btn-secondary', 'Running automatically…');
      waitBtn.type = 'button';
      waitBtn.disabled = true;
      actions.appendChild(waitBtn);
    } else {
      actions.appendChild(C.actButton(failed ? 'Resume automated pipeline' : 'Generate memo automatically', 'btn-primary', function () {
        C.postAction({ action: 'run-pipeline', runId: state.runId, reviewerId: C.analyst(), maxExternalArticles: maxExternalBudget() }, 'Starting automated memo pipeline');
      }, true));
    }
    add(head, left, actions);
    card.appendChild(head);

    var stages = el('ol', 'pipeline-stages');
    stages.setAttribute('aria-label', 'Automated pipeline stages');
    PIPELINE_STAGES.forEach(function (st, idx) {
      var cls = pipelineStageState(idx, pipe, j);
      var li = el('li', cls);
      var stMark = cls === 'is-done' ? el('span', 'mark done', 'Done')
        : cls === 'is-active' ? el('span', 'ai-mark', 'Running')
        : cls === 'is-failed' ? el('span', 'mark failed', 'Stopped')
        : el('span', 'mark', 'Queued');
      add(li, stMark, el('span', 'stage-name', st.label), el('span', 'stage-detail', st.detail));
      stages.appendChild(li);
    });
    card.appendChild(stages);

    var leadCount = counts.leads !== undefined ? counts.leads
      : counts.discoveredCandidates !== undefined ? counts.discoveredCandidates
      : (j.leads ? j.leads.length : 0);
    var capturedCount = counts.capturedSources !== undefined ? counts.capturedSources
      : (counts.seeristAnalysisFound !== undefined || counts.externalArticlesCaptured !== undefined)
        ? ((counts.seeristAnalysisFound || 0) + (counts.externalArticlesCaptured || 0))
      : (j.sources ? j.sources.length : 0);
    var assuredCount = counts.assuredSources !== undefined ? counts.assuredSources
      : counts.sourcesAssured !== undefined ? counts.sourcesAssured
      : ((v.counts && v.counts.assuredSources) || 0);
    var claimCount = counts.claims !== undefined && counts.claims > 0 ? counts.claims
      : counts.claimsBuilt !== undefined && counts.claimsBuilt > 0 ? counts.claimsBuilt
      : (j.rounds && j.rounds.length ? j.rounds[j.rounds.length - 1].claims.length : 0);

    var metrics = el('div', 'pipeline-metrics');
    [
      [leadCount, 'Seerist leads'],
      [capturedCount, 'Captured sources'],
      [assuredCount, 'Assured sources'],
      [claimCount, 'Synthesis claims']
    ].forEach(function (m) {
      add(metrics, add(el('div', 'pipeline-metric'), el('strong', null, String(m[0])), el('span', null, m[1])));
    });
    card.appendChild(metrics);
    frag.appendChild(card);

    var liveRows = (j.sources && j.sources.length) ? j.sources.map(function (row) {
      return {
        title: row.title || row.id,
        publisher: row.publisher || '',
        statusCls: row.review && row.review.status === 'recorded' ? 'mark done'
          : row.state === 'closed' ? 'mark closed'
          : row.state === 'failed' ? 'mark failed' : 'mark covered',
        statusText: row.review && row.review.status === 'recorded' ? 'Assured'
          : row.current && row.current.label ? row.current.label : capital(row.state || 'recorded'),
        url: row.url
      };
    }) : (pipe && pipe.sources && pipe.sources.length ? pipe.sources.map(function (row) {
      var st = row.status || 'captured';
      return {
        title: row.title || row.id,
        publisher: row.publisherHost || '',
        statusCls: st === 'assured' ? 'mark done'
          : st === 'admitted' ? 'mark covered'
          : (st === 'extract-failed' || st === 'fetch-skipped' || st === 'not-relevant') ? 'mark closed' : 'mark',
        statusText: st === 'assured' ? ('Assured' + (row.observationCount ? ' (' + row.observationCount + ')' : ''))
          : humanise(st),
        url: row.url || ''
      };
    }) : []);

    if (liveRows.length) {
      var srcSec = el('section', 'analysis-block');
      add(srcSec, C.sectionHead('Sources in pipeline', 'h3', el('span', 'meta', plural(liveRows.length, 'source'))));
      var table = el('table', 'analyses-table');
      var thead = el('thead');
      var hr = el('tr');
      ['Source', 'Publisher', 'Status', 'Link'].forEach(function (col) {
        var th = el('th', null, col);
        th.setAttribute('scope', 'col');
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el('tbody');
      liveRows.forEach(function (row) {
        var tr = el('tr');
        var linkTd = el('td');
        var linkNode = sourceAccessLink(j, row.url, /^https?:\/\//i.test(row.url || '') ? 'Open article' : 'Read report');
        if (linkNode) linkTd.appendChild(linkNode);
        add(tr, el('td', null, row.title), el('td', 'meta', row.publisher), add(el('td'), el('span', row.statusCls, row.statusText)), linkTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      add(srcSec, add(el('div', 'table-wrap'), table));
      frag.appendChild(srcSec);
    }
    return frag;
  }

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
      if (text && text.length > 12 && claimIds && claimIds.length) list.push({ text: text, claimIds: claimIds, source: source });
    }
    ['bluf', 'keyJudgments', 'situation', 'analysis', 'uncertainties', 'indicators'].forEach(function (k) {
      (m[k] || []).forEach(function (s) { push(s.text, s.claimIds, s); });
    });
    (m.competing || []).forEach(function (c) { push(c.text, c.claimId ? [c.claimId] : [], c); });
    Object.keys(m.claims || {}).forEach(function (id) { push(m.claims[id].statement, [id], null); });
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
  function anchorHasCaveat(anchor, m) {
    return anchor.claimIds.some(function (id) {
      var cl = m.claims[id];
      return cl && cl.status === 'contested';
    });
  }
  function shortPublisher(src) {
    var raw = (src && src.publisher) || '';
    if (!raw && src && src.url) {
      var hit = /^https?:\/\/([^/]+)/i.exec(src.url);
      raw = hit ? hit[1] : '';
    }
    raw = raw.replace(/^www\./i, '').trim();
    if (!raw) return 'Source';
    return raw.length > 22 ? raw.slice(0, 20) + '…' : raw;
  }
  function memoRefs(m) {
    var refs = {};
    var byNum = {};
    var list = [];
    Object.keys(m.claims || {}).forEach(function (id) {
      (m.claims[id].sources || []).forEach(function (s) {
        if (refs[s.noteId]) return;
        var num = list.length + 1;
        refs[s.noteId] = num;
        byNum[num] = s;
        list.push(s);
      });
    });
    return { refs: refs, byNum: byNum, list: list };
  }
  function sourceRefs(anchor, ctx) {
    var nums = [];
    anchor.claimIds.forEach(function (id) {
      ((ctx.memo.claims[id] || {}).sources || []).forEach(function (s) {
        var n = ctx.refs[s.noteId];
        if (n && nums.indexOf(n) < 0) nums.push(n);
      });
    });
    nums.sort(function (a, b) { return a - b; });
    return nums;
  }
  function claimStatusMark(status) {
    var kind = status === 'accepted' ? 'covered' : status === 'rejected' ? 'failed' : status === 'contested' ? 'partial' : 'unclear';
    return el('span', 'mark ' + kind, status ? capital(status) : 'Recorded');
  }
  function memoSubtitle(m, j) {
    var scope = j.brief.scope || {};
    var mr = state.view && state.view.memoReview;
    var published = Boolean((mr && mr.publishedArtifactRef) || (m.gate && m.gate.status === 'published'));
    var srcCount = memoRefs(m).list.length;
    return [
      scope.audience || 'Executive leadership',
      'Memo v' + (m.version || m.versions || 1),
      published ? 'Published' : 'Draft ready for Gate 2 review',
      plural(srcCount, 'assured source'),
      'Written ' + when(m.createdAt),
      m.limitedEvidence ? 'Limited evidence noted' : ''
    ].filter(Boolean).join(' · ');
  }

  var review = { mode: 'text', selected: null, cleared: false, focusSourceNum: 0, order: [] };

  function stripReaderNoise(raw) {
    return String(raw || '')
      .replace(/\s*\[claim:[^\]]+\]/g, '')
      .replace(/\s*\*{0,2}(?:Status:\s*[^.*\n]+\.|Contested:\s*\d+\s+open challenges?\.)\*{0,2}/gi, '')
      .replace(/\s*\*{0,2}Confidence:\s*[^.*\n]+\.\*{0,2}/gi, '')
      .replace(/\s*\*{2,}\s*$/g, '')
      .trim();
  }

  function renderMarkdown(text, ctx) {
    var root = el('div', 'page-inner');
    var container = root;
    var para = [];
    var list = null;
    var section = '';
    function matchJudgement(item, m) {
      var bare = stripReaderNoise(item).replace(/\s*\(\s*[a-z-]+ confidence\s*\)\s*$/i, '').trim();
      return (m.keyJudgments || []).filter(function (k) { return k.text === bare; })[0] || null;
    }
    function fill(node, raw) {
      var clean = ctx.anchors ? stripReaderNoise(raw) : raw;
      (ctx.anchors ? splitByAnchors(clean, ctx.anchors) : [{ text: clean }]).forEach(function (seg) {
        if (!seg.anchor) return inlineMarkdown(node, seg.text);
        var anchor = seg.anchor;
        ctx.used[anchor.claimIds.join(',')] = true;
        if (ctx.order) ctx.order.push(anchor);
        var selected = Boolean(ctx.selected && ctx.selected.text === anchor.text);
        var btn = el('span', 'claim' + (ctx.mode === 'confidence' ? ' ' + anchorShade(anchor, ctx.memo) : ''));
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.addEventListener('click', function () { ctx.select(anchor, 0); });
        btn.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.select(anchor, 0); }
        });
        inlineMarkdown(btn, seg.text);
        node.appendChild(btn);

        if (ctx.refs) {
          var nums = sourceRefs(anchor, ctx);
          var hasCaveat = anchorHasCaveat(anchor, ctx.memo);
          if (nums.length || hasCaveat) {
            var pills = el('span', 'cite-pills');
            nums.forEach(function (n) {
              var src = ctx.byNum[n];
              var pill = el('button', 'cite-pill', '[' + n + ' ' + shortPublisher(src) + ']');
              pill.type = 'button';
              pill.title = 'Inspect verbatim quote from ' + ((src && src.title) || ('Source ' + n));
              pill.addEventListener('click', function (e) {
                e.stopPropagation();
                ctx.select(anchor, n);
              });
              pills.appendChild(pill);
            });
            if (hasCaveat) {
              var cav = el('button', 'cite-caveat', 'Caveat');
              cav.type = 'button';
              cav.title = 'View analytical caveat in the inspector';
              cav.addEventListener('click', function (e) {
                e.stopPropagation();
                ctx.select(anchor, 0);
              });
              pills.appendChild(cav);
            }
            node.appendChild(pills);
          }
        }
      });
    }
    var isV4 = Boolean(ctx.memo && Number(ctx.memo.memoStandardVersion || 0) >= 4);
    function flush() {
      if (para.length) {
        var joined = para.join(' ');
        var isMetaLine = isV4 && container === root && /^\*\*(?:To|Window|Scope|Information cutoff):/i.test(joined);
        var p = el('p', isMetaLine ? 'doc-meta' : null);
        fill(p, joined);
        container.appendChild(p);
      }
      para = [];
      if (list) {
        var l = el(list.tag);
        list.items.forEach(function (item) {
          var li = el('li');
          var judgement = !isV4 && ctx.judgements && section === 'key judgements' ? matchJudgement(item, ctx.memo) : null;
          fill(li, judgement ? judgement.text : item);
          l.appendChild(li);
        });
        container.appendChild(l);
      }
      list = null;
    }
    text.replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      if (ctx.anchors && /^\s*>\s*\*{0,2}(?:NOT FOR PUBLICATION|Blockers:|Caveats:)/i.test(line)) return;
      var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      var li = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/.exec(line);
      if (h) {
        flush();
        if (h[1].length === 1) { add(root, el('h3', 'doc-title', h[2])); if (!isV4 && ctx.subtitle) add(root, el('p', 'doc-meta', ctx.subtitle)); }
        else if (h[1].length === 2) { section = h[2].toLowerCase(); container = el('section'); add(container, el('h4', null, h[2])); root.appendChild(container); }
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

  function copyMarkdownButton(m, cls) {
    var wrap = el('span', 'btn-row');
    var status = el('span', 'meta');
    var copy = el('button', cls || 'btn-secondary', 'Copy Markdown');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      fetch('/api/artifact?run=' + encodeURIComponent(state.runId) + '&path=' + encodeURIComponent(m.markdownPath)).then(function (res) {
        if (!res.ok) throw new Error('Markdown not available');
        return res.text();
      }).then(function (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text).then(function () { status.textContent = 'Copied.'; }, function () { C.openSheet('memo.md', text); });
        }
        C.openSheet('memo.md', text);
      }).catch(function (err) { status.textContent = err.message; });
    });
    add(wrap, copy, status);
    return wrap;
  }

  function editorialRevisionDrawer(m, mr) {
    if (!mr || !mr.target || mr.target.memoId !== m.id) return null;
    var det = el('details', 'drawer');
    add(det, el('summary', null, 'Request editorial revision (optional)'));
    var body = el('div', 'form-grid');
    var key = 'editorial-rev:' + state.runId + ':' + m.id;
    var feedback = C.textInput(key, '', 'Describe the tone, structure, or wording refinement you want…', true, 3);
    feedback.maxLength = 2000;
    var err = el('p', 'meta fail');
    var submit = C.actButton('Revise memo wording', 'btn-secondary', function () {
      var text = feedback.value.trim();
      if (text.length < 3) { err.textContent = 'Enter at least a short editorial note first.'; feedback.focus(); return; }
      if (!C.analyst()) { err.textContent = 'Enter your analyst ID in the top bar first.'; return; }
      err.textContent = '';
      C.postAction({
        action: 'record-memo-review',
        runId: state.runId,
        memoId: m.id,
        reviewerId: C.analyst(),
        target: mr.target,
        decision: 'revision-requested',
        issueType: 'editorial',
        feedback: text,
        sampledVerdicts: [],
        drillDownVerdicts: []
      }, 'Recording editorial revision request').then(function (res) {
        if (!res || !res.ok) return;
        C.dropDrafts(key);
        return C.postAction({
          action: 'start-memo-revision',
          runId: state.runId,
          memoId: m.id,
          reviewerId: C.analyst()
        }, 'Revising memo draft');
      });
    }, true);
    add(body, C.field('Editorial instructions', feedback, true), err, add(el('div', 'btn-row'), submit));
    det.appendChild(body);
    return det;
  }

  function publishBox(m) {
    var box = el('div', 'publish-box');
    var mr = state.view && state.view.memoReview;
    var rev = state.view && state.view.memoRevision;
    if (rev && rev.parentMemoId && rev.parentMemoId !== m.id) rev = null;

    var published = Boolean((mr && mr.publishedArtifactRef) || (m.gate && m.gate.status === 'published'));
    if (published) {
      var headPub = el('div', 'section-head');
      add(headPub, el('h3', null, 'Gate 2 · Published'), el('span', 'mark done', 'Published'));
      add(box, headPub,
        el('p', 'meta', 'Published by ' + ((mr && mr.publishedBy) || C.analyst() || 'analyst') + ((mr && mr.publishedAt) ? ' · ' + when(mr.publishedAt) : '') + '.'));
      var dlRow = el('div', 'btn-row');
      var dl = el('a', 'btn-primary', 'Download published package');
      dl.href = '/api/published-memo?run=' + encodeURIComponent(state.runId) + '&memo=' + encodeURIComponent(m.id);
      add(dlRow, dl);
      box.appendChild(dlRow);
      return box;
    }

    if (mr && mr.decision && mr.decision.decision === 'revision-requested') {
      var runningRev = Boolean(rev && (rev.workerActive || rev.status === 'starting' || rev.status === 'running'));
      var authorizedRev = Boolean(rev && rev.authorized);
      var headRev = el('div', 'section-head');
      add(headRev, el('h3', null, 'Editorial revision'), runningRev ? el('span', 'ai-mark', 'Revising') : el('span', 'mark attention', 'Requested'));
      add(box, headRev, el('p', 'prose', mr.decision.feedback || 'Editorial revision requested.'));
      if (rev && (rev.error || rev.launcherError)) {
        add(box, el('p', 'meta fail', rev.error || rev.launcherError));
      }
      var revBtn = C.actButton(runningRev ? 'Revision running…' : authorizedRev ? 'Resume editorial revision' : 'Run editorial revision',
        'btn-primary', function () {
          C.postAction({
            action: authorizedRev ? 'resume-memo-revision' : 'start-memo-revision',
            runId: state.runId,
            memoId: m.id,
            reviewerId: C.analyst()
          }, 'Running editorial revision');
        }, true, runningRev);
      add(box, add(el('div', 'btn-row'), revBtn));
      return box;
    }

    if (mr && mr.decision && mr.decision.decision === 'approved' && !mr.publishedArtifactRef) {
      var headApp = el('div', 'section-head');
      add(headApp, el('h3', null, 'Gate 2 · Approved'), el('span', 'mark covered', 'Approved'));
      add(box, headApp, el('p', 'meta', 'Approved by ' + mr.decision.reviewerId + '. Create the immutable publication package to finish.'));
      var pkgBtn = C.actButton('Publish memo', 'btn-primary', function () {
        C.postAction({ action: 'publish-memo', runId: state.runId, memoId: m.id, publisherId: C.analyst() }, 'Publishing memo');
      }, true);
      pkgBtn.id = 'btn-publish-memo';
      add(box, add(el('div', 'btn-row'), pkgBtn));
      return box;
    }

    var canOneClickPublish = Boolean(mr && !mr.error && mr.target && mr.target.memoId === m.id && mr.approvalAvailable);
    if (canOneClickPublish) {
      var headReady = el('div', 'section-head');
      add(headReady, el('h3', null, 'Gate 2 · Publication'), el('span', 'mark covered', 'Ready'));
      add(box, headReady,
        el('p', 'meta', 'Click any statement or source pill in the memo to inspect verbatim quotes and open original articles. Publish when satisfied.'));
      var pubBtn = C.actButton('Publish memo', 'btn-primary', function () {
        C.postAction({
          action: 'approve-and-publish',
          runId: state.runId,
          memoId: m.id,
          reviewerId: C.analyst(),
          notes: ''
        }, 'Approving and publishing memo');
      }, true);
      pubBtn.id = 'btn-publish-memo';
      add(box, add(el('div', 'btn-row'), pubBtn));
      if (!C.analyst()) add(box, el('p', 'meta', 'Enter your analyst ID in the top bar to enable publication.'));
      var revDrawer = editorialRevisionDrawer(m, mr);
      if (revDrawer) box.appendChild(revDrawer);
      return box;
    }

    var headRefresh = el('div', 'section-head');
    add(headRefresh, el('h3', null, 'Gate 2 · Draft status'), el('span', 'mark attention', 'Needs refresh'));
    var rawErr = (mr && mr.error) ? String(mr.error) : '';
    var reasonText = (mr && mr.approvalBlockers && mr.approvalBlockers.length)
      ? 'Recorded under an earlier draft state (' + mr.approvalBlockers.map(humanise).join(', ') + '). Run the automated pipeline to produce a publication-ready v2 memo.'
      : /checksum|lineage/i.test(rawErr)
      ? 'This draft predates a policy or outlet-table update. Regenerate the memo automatically to prepare 1-click publication.'
      : rawErr ? rawErr
      : 'Run the automated pipeline to verify quotes and prepare 1-click publication.';
    var reasonEl = el('p', 'meta', reasonText);
    if (rawErr && reasonText !== rawErr) reasonEl.title = rawErr;
    add(box, headRefresh, reasonEl);
    var regen = C.actButton('Regenerate memo automatically', 'btn-primary', function () {
      C.postAction({ action: 'run-pipeline', runId: state.runId, reviewerId: C.analyst(), maxExternalArticles: maxExternalBudget() }, 'Running automated pipeline');
    }, true);
    add(box, add(el('div', 'btn-row'), regen));
    return box;
  }

  function quoteInspector(m, j, sel, refInfo) {
    var sec = el('div', 'panel-sec');
    sec.id = 'quote-inspector';
    add(sec, C.sectionHead('Source & quote inspector', 'h3', el('span', 'meta', sel ? plural(sel.claimIds.length, 'claim') : '')));
    if (!sel) {
      add(sec, el('p', 'meta', 'Click any highlighted statement or [Source] pill in the memo (or press J / K) to inspect its verbatim quotes and open the original source.'));
      return sec;
    }
    add(sec, el('p', 'panel-claim', sel.text));
    var round = (j.rounds || []).filter(function (r) { return r.index === m.roundIndex; })[0];

    sel.claimIds.forEach(function (id) {
      var claim = m.claims[id];
      if (!claim) return;
      var roundClaim = round ? (round.claims || []).filter(function (c) { return c.claimId === id; })[0] : null;
      var marks = el('div', 'panel-marks');
      add(marks,
        claimStatusMark(claim.status),
        el('span', 'meta', [
          claim.confidence ? capital(claim.confidence) + ' confidence' : '',
          claim.singleSource ? 'Single-source claim' : ''
        ].filter(Boolean).join(' · ')));
      sec.appendChild(marks);

      (claim.sources || []).forEach(function (src) {
        var num = refInfo.refs[src.noteId];
        var card = el('div', 'inspector-source');
        if (review.focusSourceNum && review.focusSourceNum === num) card.setAttribute('data-focused', 'true');
        var head = el('div', 'inspector-source-head');
        var labelLeft = el('strong', null, (num ? '[' + num + '] ' : '') + (src.publisher || shortPublisher(src)));
        var openLink = sourceAccessLink(j, src.url, /^https?:\/\//i.test(src.url || '') ? 'Open source' : 'Read report');
        add(head, labelLeft, openLink);
        card.appendChild(head);

        var metaBits = [src.title];
        if (src.publishedAt) metaBits.push(src.publishedAt.slice(0, 10));
        if (src.credibility) metaBits.push(humanise(src.credibility));
        add(card, el('div', 'meta', metaBits.filter(Boolean).join(' · ')));

        if (src.quotes && src.quotes.length) {
          src.quotes.forEach(function (q) {
            if (q.quote) add(card, el('blockquote', 'inspector-quote', '“' + q.quote + '”'));
            if (q.text && q.text !== q.quote) add(card, el('div', 'meta', q.text));
          });
        } else {
          add(card, el('div', 'meta', 'Supporting source note recorded without an extracted quote excerpt.'));
        }
        sec.appendChild(card);
      });

      var challenges = (claim.challenges && claim.challenges.length ? claim.challenges : (roundClaim && roundClaim.challenges)) || [];
      if (challenges.length) {
        var cavBox = el('div', 'trace-claim');
        add(cavBox, el('div', 'form-label', 'Analytical caveats (' + challenges.length + ')'));
        challenges.forEach(function (ch) {
          add(cavBox, el('p', 'meta', capital(humanise(ch.check || ch.challengeType || 'caveat')) + ': ' + (ch.rationale || ch.description || '')));
        });
        sec.appendChild(cavBox);
      }
    });
    return sec;
  }

  function verificationDrawer(m) {
    var checks = (m.verification && m.verification.checks) || [];
    var passed = checks.filter(function (c) { return c.status === 'pass'; }).length;
    var det = el('details', 'drawer');
    var label = checks.length ? ('Verification & provenance · ' + passed + '/' + checks.length + ' checks passed') : 'Verification & provenance';
    add(det, el('summary', null, label));
    var body = el('div', 'panel-sec');
    if (m.sourcing && m.sourcing.text) {
      add(body, el('p', 'panel-head', 'Sourcing summary'), el('p', 'meta', m.sourcing.text));
    }
    if ((m.competing || []).length) {
      add(body, el('p', 'panel-head', 'Competing hypotheses (' + m.competing.length + ')'));
      var cl = el('ul', 'rows-list');
      m.competing.forEach(function (c) {
        add(cl, add(el('li'), el('span', 'meta', c.text)));
      });
      body.appendChild(cl);
    }
    if ((m.limitations || []).length) {
      add(body, el('p', 'panel-head', 'Provenance & limitations'));
      var ll = el('ul', 'rows-list');
      m.limitations.forEach(function (lim) {
        add(ll, add(el('li'), el('span', 'meta', lim)));
      });
      body.appendChild(ll);
    }
    if (checks.length) {
      add(body, el('p', 'panel-head', 'Verification checks'));
      var vl = el('ul', 'rows-list');
      checks.forEach(function (c) {
        var status = c.status || (c.passed ? 'pass' : 'fail');
        var kind = status === 'pass' ? 'covered' : status === 'fail' ? 'failed' : 'unclear';
        add(vl, add(el('li'), add(el('div', 'resolved-row'), el('span', 'mark ' + kind, capital(status)), el('span', null, capital(humanise(c.check || c.checkId || 'check'))))));
      });
      body.appendChild(vl);
    }
    var links = el('div', 'file-links');
    add(links,
      C.artifactLink(m.markdownPath, 'View memo.md', true),
      C.artifactLink(m.relPath, 'Memo record', true),
      C.linkButton('Open Audit trail', function () { C.navigate('audit'); }));
    body.appendChild(links);
    det.appendChild(body);
    return det;
  }

  function reviewWindow(m, j) {
    var frag = document.createDocumentFragment();
    var pipe = state.view && state.view.pipeline;
    var bar = el('div', 'output-bar');
    var leftBar = el('div', 'btn-row');
    add(leftBar, el('span', 'meta', memoSubtitle(m, j)));
    if (pipe && (pipe.workerActive || pipe.status === 'running')) {
      add(leftBar, el('span', 'ai-mark', 'Pipeline updating…'));
    }
    var modes = el('div', 'modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Highlight mode');
    var seg = el('div', 'segmented');
    [['text', 'Clean'], ['confidence', 'Confidence']].forEach(function (def) {
      var b = el('button', 'seg-btn', def[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', review.mode === def[0] ? 'true' : 'false');
      b.addEventListener('click', function () { review.mode = def[0]; C.render(true); });
      seg.appendChild(b);
    });
    add(modes, seg, copyMarkdownButton(m, 'btn-secondary'));
    add(bar, leftBar, modes);
    frag.appendChild(bar);

    if (review.mode === 'confidence') {
      var legend = el('p', 'legend');
      add(legend, el('span', 'mark covered', 'Accepted'), el('span', 'mark partial', 'Contested (with caveat)'));
      frag.appendChild(legend);
    }

    var layout = el('div', 'doc-layout');
    var leftCol = el('div');
    var anchors = memoAnchors(m);
    var md = loadMarkdown(m);
    var refInfo = memoRefs(m);
    var activeSel = !review.cleared && review.selected
      ? anchors.filter(function (a) { return a.text === review.selected.text; })[0] || null
      : null;
    if (!activeSel && !review.cleared && anchors.length) {
      activeSel = anchors[0];
    }

    var canvas = el('div', 'doc-canvas');
    canvas.id = 'doc';
    var page = el('div', 'page');
    var used = {};
    review.order = [];
    if (md.state === 'ready') {
      var rendered = renderMarkdown(md.text, {
        memo: m,
        anchors: anchors,
        used: used,
        mode: review.mode,
        selected: activeSel,
        order: review.order,
        refs: refInfo.refs,
        byNum: refInfo.byNum,
        subtitle: memoSubtitle(m, j),
        judgements: true,
        select: function (anchor, sourceNum) {
          var same = activeSel && activeSel.text === anchor.text && (!sourceNum || review.focusSourceNum === sourceNum);
          review.cleared = Boolean(same);
          review.selected = same ? null : anchor;
          review.focusSourceNum = same ? 0 : (sourceNum || 0);
          C.render(true);
        }
      });
      if (!review.selected && !review.cleared && review.order.length) {
        activeSel = review.order[0];
        review.selected = activeSel;
      }
      if (refInfo.list.length) {
        var notes = el('section');
        var ol = el('ol', 'endnotes');
        refInfo.list.forEach(function (s, i) {
          var li = el('li');
          li.id = 'src-' + (i + 1);
          var titleText = s.title || ('Source ' + (i + 1));
          var linkNode = sourceAccessLink(j, s.url, titleText);
          var pubNorm = String(s.publisher || '').replace(/^www\./i, '').toLowerCase();
          var titleNorm = String(titleText).replace(/^www\./i, '').toLowerCase();
          var metaText = [pubNorm && pubNorm !== titleNorm ? s.publisher : '', s.publishedAt ? s.publishedAt.slice(0, 10) : ''].filter(Boolean).join(' · ');
          add(li, linkNode || document.createTextNode(titleText), metaText ? ' — ' : null, metaText ? el('span', 'meta', metaText) : null);
          ol.appendChild(li);
        });
        add(notes, el('h4', null, 'Sources'), ol);
        rendered.appendChild(notes);
      }
      page.appendChild(rendered);
    } else if (md.state === 'loading') {
      add(page, add(el('div', 'doc-empty'), el('p', null, 'Loading memo text…')));
    } else {
      add(page, add(el('div', 'doc-empty'), el('p', null, 'Memo Markdown could not be loaded. Open the memo record from Verification & provenance.')));
    }
    canvas.appendChild(page);
    leftCol.appendChild(canvas);

    var side = el('aside', 'side');
    side.setAttribute('aria-label', 'Publication and quote inspector');
    add(side, publishBox(m), quoteInspector(m, j, activeSel, refInfo), verificationDrawer(m));
    add(layout, leftCol, side);
    frag.appendChild(layout);
    return frag;
  }

  C.reviewKey = function (e) {
    var order = review.order || [];
    if (e.key === 'Escape') {
      if (review.selected || !review.cleared) {
        review.selected = null;
        review.cleared = true;
        review.focusSourceNum = 0;
        C.render(true);
      }
      return;
    }
    var stepDir = e.key === 'j' || e.key === 'J' ? 1 : e.key === 'k' || e.key === 'K' ? -1 : 0;
    if (!stepDir || !order.length) return;
    e.preventDefault();
    var at = -1;
    order.forEach(function (a, i) { if (review.selected && a.text === review.selected.text && at < 0) at = i; });
    var next = at < 0 ? (stepDir > 0 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, at + stepDir));
    review.cleared = false;
    review.selected = order[next];
    review.focusSourceNum = 0;
    C.render(true);
    var node = document.querySelector('.page .claim[aria-pressed="true"]');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  };

  var EVENT_LABELS = {
    'scope.approved': 'Research plan approved',
    'discovery.completed': 'Seerist collection finished',
    'evidence.admission.approved': 'Source admitted as evidence',
    'evidence.admission.rejected': 'Source excluded',
    'synthesis.build.recorded': 'Synthesis built',
    'memo.recorded': 'Memo written'
  };
  function eventLabel(type) {
    return EVENT_LABELS[type] || capital(String(type || '').replace(/\./g, ' ').replace(/[_-]+/g, ' ').trim());
  }

  C.panes.memo = function () {
    var j = C.journey();
    var host = $('pane-memo');
    if (!j) return;
    if (!j.memo) return C.replace(host, pipelineWindow(j));
    C.replace(host, reviewWindow(j.memo, j));
  };

  /* ================= Audit ================= */
  var STEP_NAMES = {
    'human intent gate': 'Intent',
    'bounded seerist collection': 'Seerist collection',
    'classify provider item': 'Source classification',
    'resolve + canonicalize source': 'Duplicate sources merged',
    'ai question-relevance': 'Question relevance',
    'policy admission': 'Evidence admission',
    'build': 'Synthesis',
    'challenge': 'Challenge',
    'adjudicate': 'Adjudication',
    'key judgements': 'Key judgements',
    'memo': 'Memo',
    'verification': 'Verification',
    'publication': 'Publication'
  };
  var STEP_STATUS = {
    reviewed: ['done', 'Approved'],
    committed: ['covered', 'Recorded'],
    'in-progress': ['running', 'Running'],
    pending: ['', 'Waiting'],
    provisional: ['attention', 'Provisional'],
    failed: ['failed', 'Failed'],
    synthetic: ['attention', 'Synthetic']
  };
  var EVENT_KIND_LABEL = { human: 'Decision by a person', exception: 'Exception', model: 'Model step', machine: 'System step' };
  var EVENT_FILTERS = [['all', 'All'], ['human', 'People'], ['exception', 'Exceptions'], ['model', 'Model'], ['machine', 'System']];
  var auditFilter = 'all';
  var auditOpen = null;
  var auditStepOpen = null;

  function stepName(stage) { return STEP_NAMES[String(stage.name || '').toLowerCase()] || capital(humanise(stage.name)); }
  function stepStatus(status) { return STEP_STATUS[status] || STEP_STATUS.pending; }
  function statusDot(status, withText) {
    var s = stepStatus(status);
    var m = el('span', 'mark' + (s[0] ? ' ' + s[0] : ''), withText ? s[1] : '');
    if (!withText) { m.setAttribute('role', 'img'); m.setAttribute('aria-label', s[1]); m.title = s[1]; }
    return m;
  }
  function auditEvents(v) {
    var list = (v.events || []).map(function (e) {
      var kind = e.actor === 'human' ? 'human' : (e.actor === 'ai' || e.actor === 'model') ? 'model' : 'machine';
      var who = kind === 'human' ? (e.actorId || 'A person') : kind === 'model' ? 'Model' : 'System';
      return { at: e.at || '', kind: kind, who: who, text: eventLabel(e.type), stage: e.stage, status: e.status, attempt: e.attempt, file: e.source };
    });
    (v.exceptions || []).forEach(function (x) {
      list.push({ at: x.raisedAt || '', kind: 'exception', who: '', text: 'Exception: ' + humanise(x.kind), status: x.status, file: x.relPath });
    });
    list.sort(function (a, b) {
      if (a.at === b.at) return 0;
      if (!a.at) return 1;
      if (!b.at) return -1;
      return a.at < b.at ? 1 : -1;
    });
    return list;
  }
  function dayOf(at) {
    var d = at ? new Date(at) : null;
    if (!d || isNaN(d.getTime())) return 'Date not recorded';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function timeOf(at) {
    var d = at ? new Date(at) : null;
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function renderTimeline(box, all) {
    var counts = {};
    EVENT_FILTERS.forEach(function (f) { counts[f[0]] = f[0] === 'all' ? all.length : all.filter(function (e) { return e.kind === f[0]; }).length; });
    var frag = document.createDocumentFragment();
    var filters = el('div', 'filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Show events');
    EVENT_FILTERS.forEach(function (f) {
      var b = el('button', 'chip-btn', f[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(auditFilter === f[0]));
      add(b, el('span', 'n', String(counts[f[0]])));
      b.addEventListener('click', function () { auditFilter = f[0]; auditOpen = null; renderTimeline(box, all); });
      filters.appendChild(b);
    });
    frag.appendChild(filters);
    var list = all.filter(function (e) { return auditFilter === 'all' || e.kind === auditFilter; });
    if (!all.length) add(frag, add(el('div', 'empty-state'), el('h3', null, 'No events recorded yet')));
    else if (!list.length) {
      var empty = el('div', 'empty-state');
      add(empty, el('h3', null, 'No events of this kind'), add(el('p'), C.linkButton('Show all events', function () { auditFilter = 'all'; auditOpen = null; renderTimeline(box, all); })));
      frag.appendChild(empty);
    }
    var groups = [];
    list.forEach(function (e, i) {
      e.id = i;
      var day = dayOf(e.at);
      var g = groups[groups.length - 1];
      if (!g || g.day !== day) { g = { day: day, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    groups.forEach(function (g) {
      add(frag, add(el('h3', 'day-head', g.day), el('span', 'meta', plural(g.items.length, 'event'))));
      var ol = el('ol', 'events');
      g.items.forEach(function (e) {
        var li = el('li', 'event ' + e.kind);
        var detailId = 'audit-ev-' + e.id;
        var row = el('button', 'event-row');
        row.type = 'button';
        row.setAttribute('aria-expanded', String(auditOpen === e.id));
        row.setAttribute('aria-controls', detailId);
        var dot = el('span', 'ev-kind ' + e.kind);
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', EVENT_KIND_LABEL[e.kind]);
        dot.title = EVENT_KIND_LABEL[e.kind];
        add(row, el('span', 'ev-time', timeOf(e.at)), dot, el('span', 'ev-text', e.text), el('span', 'ev-who', e.who));
        if (e.kind === 'exception' && e.status) add(row, el('span', 'ev-reason', 'Status: ' + capital(e.status)));
        row.addEventListener('click', function () { auditOpen = auditOpen === e.id ? null : e.id; renderTimeline(box, all); });
        var detail = el('div', 'ev-detail');
        detail.id = detailId;
        var facts = el('dl', 'facts');
        function fact(k, val) { add(facts, el('dt', null, k)); var dd = el('dd'); add(dd, val); facts.appendChild(dd); }
        if (e.kind !== 'exception') fact('Step', e.stage ? capital(humanise(e.stage)) : 'Not recorded');
        if (e.who) fact('Done by', e.who);
        if (e.status) fact('Status', capital(humanise(e.status)));
        if (e.attempt) fact('Attempt', String(e.attempt));
        if (e.file) fact('Record', C.artifactLink(e.file));
        add(detail, add(el('div'), add(el('div', 'ev-detail-body'), facts)));
        add(li, row, detail);
        ol.appendChild(li);
      });
      frag.appendChild(ol);
    });
    C.replace(box, frag);
  }
  function stepRows(tbody, stages, title, colspan) {
    add(tbody, add(el('tr', 'stage-row'), (function () { var th = el('th', null, title); th.setAttribute('scope', 'rowgroup'); th.colSpan = colspan; return th; })()));
    stages.forEach(function (stage) {
      var key = title + '/' + stage.name;
      var records = stage.artifacts || [];
      var open = auditStepOpen === key && records.length > 0;
      var tr = el('tr', 'step');
      var btn = el('button', 'step-btn', stepName(stage));
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(open));
      btn.disabled = !records.length;
      var td = el('td');
      td.appendChild(btn);
      var st = el('td', 'st');
      st.appendChild(statusDot(stage.status, true));
      add(tr, td, st, el('td', 'n', String(records.length)));
      tbody.appendChild(tr);
      var extra = el('tr', 'step-records');
      extra.hidden = !open;
      var cell = el('td');
      cell.colSpan = colspan;
      records.forEach(function (a) { add(cell, add(el('div'), C.artifactLink(a.relPath))); });
      if (stage.attempts > 0) add(cell, el('div', 'meta figures', 'Attempts: ' + stage.attempts));
      var failures = Object.keys(stage.failures || {});
      if (failures.length) add(cell, el('div', 'meta fail', 'Failures: ' + failures.map(function (k) { return k + ' ×' + stage.failures[k]; }).join(', ')));
      extra.appendChild(cell);
      tbody.appendChild(extra);
      btn.addEventListener('click', function () {
        auditStepOpen = auditStepOpen === key ? null : key;
        C.panes.audit();
      });
    });
  }
  C.panes.audit = function () {
    var v = state.view;
    var host = $('pane-audit');
    if (!v) return;
    var frag = document.createDocumentFragment();
    var layout = el('div', 'audit-layout');

    var main = el('section', 'audit-main');
    var timeline = el('div');
    add(main, C.sectionHead('What happened', 'h2', el('span', 'meta', 'Newest first. Select an event to see the record behind it.')), timeline);
    renderTimeline(timeline, auditEvents(v));
    add(main, el('p', 'meta', v.counts.files + ' records on disk' + (v.truncated ? ' · scan truncated' : '')));

    var aside = el('aside', 'audit-aside');
    aside.setAttribute('aria-label', 'Step status, sources and automatic steps');

    var steps = el('div');
    add(steps, C.sectionHead('Where each step stands', 'h3'));
    var table = el('table', 'steps');
    var head = el('tr');
    [['Step', ''], ['Status', ''], ['Records', 'n']].forEach(function (h) { var th = el('th', h[1] || null, h[0]); th.setAttribute('scope', 'col'); head.appendChild(th); });
    add(table, add(el('thead'), head));
    var tbody = el('tbody');
    stepRows(tbody, v.panel1.stages, 'Intent and evidence', 3);
    stepRows(tbody, v.synthesis, 'Findings and writing', 3);
    table.appendChild(tbody);
    var anyFailed = v.panel1.stages.concat(v.synthesis).some(function (s) { return s.status === 'failed'; });
    var legend = el('ul', 'legend');
    legend.setAttribute('aria-label', 'Status key');
    [['done', 'Approved', ' by a person'], ['covered', 'Recorded', ' by the system'], ['running', 'Running', ' not finished'], ['', 'Waiting', ' not started'], ['attention', 'Provisional', ' needs a decision']]
      .concat(anyFailed ? [['failed', 'Failed', ' a step failed']] : []).forEach(function (l) {
        add(legend, add(el('li'), el('span', 'mark' + (l[0] ? ' ' + l[0] : ''), l[1]), l[2]));
      });
    add(steps, table, legend);

    var sources = el('div');
    add(sources, C.sectionHead('Sources', 'h3', el('span', 'meta', plural(v.sources.length, 'source'))));
    if (!v.sources.length) add(sources, el('p', 'meta', 'No sources reviewed yet.'));
    else {
      var note = (C.journey() && C.journey().notes) || {};
      var grid = el('table', 'src-grid');
      var gh = el('tr');
      var first = el('th', null, 'Source');
      first.setAttribute('scope', 'col');
      gh.appendChild(first);
      var cols = v.sources[0].stages.map(function (s) { return s.name; });
      cols.forEach(function (name) { var th = el('th', 'c', capital(humanise(name))); th.setAttribute('scope', 'col'); gh.appendChild(th); });
      add(grid, add(el('thead'), gh));
      var gb = el('tbody');
      v.sources.forEach(function (s) {
        var title = Object.keys(note).map(function (k) { return note[k]; }).filter(function (n) { return n.snapshotId === s.snapshotId; })[0];
        var tr = el('tr');
        add(tr, el('td', 'src-name', title ? title.title : s.snapshotId));
        cols.forEach(function (name) {
          var stage = s.stages.filter(function (x) { return x.name === name; })[0];
          add(tr, add(el('td', 'c'), stage ? statusDot(stage.status, false) : ''));
        });
        gb.appendChild(tr);
      });
      grid.appendChild(gb);
      add(sources, grid, add(el('p'), C.linkButton('Open Memo', function () { C.navigate('review'); })));
    }

    var auto = el('div', 'next-auto');
    add(auto, C.sectionHead('Automated pipeline', 'h3'),
      el('p', null, 'Runs or resumes the automated evidence-to-memo pipeline under the approved research plan.'),
      C.actButton('Run automated pipeline', 'btn-secondary', function () {
        C.postAction({ action: 'run-pipeline', runId: state.runId, reviewerId: C.analyst(), maxExternalArticles: maxExternalBudget() })
          .then(function (res) { if (res && res.ok) C.navigate('review'); });
      }, true));

    add(aside, steps, sources, auto);
    add(layout, main, aside);
    frag.appendChild(layout);
    C.replace(host, frag);
  };

  /* ================= Settings ================= */
  var settingsState = { data: null, loading: false, error: '', openKey: '', formError: '', draft: '', reveal: false, checks: {}, checking: {}, saving: false, savingConfig: {}, note: '' };
  var ANALYST_KEY = 'cti_reviewer_id';

  function settingsRequest(path, body) {
    var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) throw new Error(data.error || 'Something went wrong. Try again.');
        return data;
      });
    });
  }
  function loadSettings() {
    settingsState.loading = true;
    settingsState.error = '';
    renderSettings();
    return settingsRequest('/api/settings').then(function (data) {
      settingsState.data = data;
    }).catch(function (err) {
      settingsState.error = err.message || 'Could not load settings.';
    }).then(function () {
      settingsState.loading = false;
      renderSettings();
    });
  }
  function clockTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function closeKeyForm() {
    settingsState.openKey = '';
    settingsState.formError = '';
    settingsState.draft = '';
    settingsState.reveal = false;
  }
  function saveKey(key) {
    settingsState.saving = true;
    settingsState.formError = '';
    renderSettings();
    settingsRequest('/api/settings/key', { name: key.name, value: settingsState.draft }).then(function () {
      closeKeyForm();
      settingsState.checks[key.name] = null;
      settingsState.note = key.label + ' key saved. New collection steps use it straight away.';
      settingsState.saving = false;
      return loadSettings();
    }).catch(function (err) {
      settingsState.saving = false;
      settingsState.formError = err.message;
      renderSettings();
    });
  }
  function removeKey(key) {
    if (!window.confirm('Remove the ' + key.label + ' key from this computer? Collection stops working until you add a key again. Analyses already collected stay as they are.')) return;
    settingsRequest('/api/settings/key/remove', { name: key.name }).then(function () {
      settingsState.checks[key.name] = null;
      settingsState.note = key.label + ' key removed.';
      return loadSettings();
    }).catch(function (err) {
      settingsState.note = err.message;
      renderSettings();
    });
  }
  function checkKey(key) {
    settingsState.checking[key.name] = true;
    renderSettings();
    settingsRequest('/api/settings/check', { name: key.name }).then(function (data) {
      settingsState.checks[key.name] = data.result;
    }).catch(function (err) {
      settingsState.checks[key.name] = { ok: false, message: err.message, checkedAt: new Date().toISOString() };
    }).then(function () {
      settingsState.checking[key.name] = false;
      renderSettings();
    });
  }
  function saveConfig(item, input) {
    settingsState.savingConfig[item.name] = true;
    renderSettings();
    settingsRequest('/api/settings/config', { name: item.name, value: input.value }).then(function (result) {
      settingsState.note = item.label + (input.value.trim() ? ' saved.' : ' cleared.') +
        (result.persisted ? ' Stored in this Windows user account.' : ' Available to this dashboard session only.');
      if (result.ssoEnabled && item.name.indexOf('ENTRA_') === 0) {
        window.location.assign('/');
        return;
      }
      return loadSettings();
    }).catch(function (err) {
      settingsState.note = err.message;
      renderSettings();
    }).then(function () {
      settingsState.savingConfig[item.name] = false;
      renderSettings();
    });
  }
  function keyForm(key) {
    var form = el('form', 'key-form');
    form.noValidate = true;
    var inputId = 'set-key-' + key.name;
    var label = el('label', null, 'New key for ' + key.label);
    label.setAttribute('for', inputId);
    var input = el('input');
    input.id = inputId;
    input.type = settingsState.reveal ? 'text' : 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = settingsState.draft;
    input.addEventListener('input', function () { settingsState.draft = input.value; });
    var show = el('button', 'btn-link', settingsState.reveal ? 'Hide' : 'Show');
    show.type = 'button';
    show.setAttribute('aria-pressed', String(settingsState.reveal));
    show.addEventListener('click', function () {
      settingsState.reveal = !settingsState.reveal;
      input.type = settingsState.reveal ? 'text' : 'password';
      show.textContent = settingsState.reveal ? 'Hide' : 'Show';
      show.setAttribute('aria-pressed', String(settingsState.reveal));
    });
    var line = el('div', 'key-input');
    add(line, input, show);
    var save = el('button', 'btn-primary', settingsState.saving ? 'Saving…' : 'Save key');
    save.type = 'submit';
    save.disabled = settingsState.saving;
    var btns = el('div', 'btn-row');
    add(btns, save, C.linkButton('Cancel', function () { closeKeyForm(); renderSettings(); }));
    add(form, label, line);
    if (settingsState.formError) {
      var err = el('div', 'reason-error', settingsState.formError);
      err.setAttribute('role', 'alert');
      form.appendChild(err);
    }
    form.appendChild(btns);
    form.addEventListener('submit', function (e) { e.preventDefault(); saveKey(key); });
    if (settingsState.focusNext) {
      settingsState.focusNext = false;
      window.setTimeout(function () { input.focus(); }, 0);
    }
    return form;
  }
  function keyRow(key) {
    var row = el('div', 'key-row');
    var name = el('div', 'key-name');
    add(name, el('strong', null, key.label), el('span', 'meta mono', key.name));
    var status = el('div', 'key-status');
    add(status, key.set ? el('span', 'mark covered', 'Set · ends in ' + key.last4) : el('span', 'mark attention', 'Not set'));
    var check = settingsState.checks[key.name];
    if (check) {
      var stamp = clockTime(check.checkedAt);
      add(status, el('span', 'mark ' + (check.ok ? 'done' : 'failed'), check.message + (stamp ? ' · checked ' + stamp : '')));
    }
    var actions = el('div', 'key-actions');
    var checking = Boolean(settingsState.checking[key.name]);
    var test = el('button', 'btn-secondary', checking ? 'Checking…' : 'Check connection');
    test.type = 'button';
    test.disabled = !key.set || checking;
    test.addEventListener('click', function () { checkKey(key); });
    add(actions, test, C.linkButton(key.set ? 'Replace key' : 'Add key', function () {
      var same = settingsState.openKey === key.name;
      closeKeyForm();
      settingsState.openKey = same ? '' : key.name;
      settingsState.focusNext = !same;
      renderSettings();
    }));
    if (key.set) actions.appendChild(C.linkButton('Remove', function () { removeKey(key); }));
    add(row, name, status, actions);
    if (settingsState.openKey === key.name) row.appendChild(keyForm(key));
    return row;
  }
  function analystSection() {
    var sec = el('section', 'settings-section');
    sec.setAttribute('aria-labelledby', 'h-set-analyst');
    var head = C.sectionHead('Analyst', 'h2');
    head.firstChild.id = 'h-set-analyst';
    var field = el('div', 'field');
    var label = el('label', null, 'Your analyst ID');
    label.setAttribute('for', 'set-analyst');
    var input = el('input');
    input.id = 'set-analyst';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    try { input.value = localStorage.getItem(ANALYST_KEY) || ''; } catch (e) { /* storage unavailable */ }
    var saved = el('span', 'meta', '');
    saved.setAttribute('role', 'status');
    var save = el('button', 'btn-secondary', 'Save');
    save.type = 'button';
    save.addEventListener('click', function () {
      var value = input.value.trim();
      try { localStorage.setItem(ANALYST_KEY, value); } catch (e) { /* storage unavailable */ }
      var top = document.getElementById('analyst-id');
      top.value = value;
      top.dispatchEvent(new Event('input', { bubbles: true }));
      saved.textContent = value ? 'Saved. Decisions you approve are recorded as ' + value + '.' : 'Cleared.';
    });
    add(field, label, el('span', 'hint', 'Recorded with every decision you approve. Stored in this browser.'), input);
    add(sec, head, field, add(el('div', 'btn-row'), save, saved));
    return sec;
  }
  function configField(item, hint) {
    var row = el('div', 'config-row');
    var field = el('div', 'config-field');
    var inputId = 'config-' + item.name.toLowerCase().replace(/_/g, '-');
    var label = el('label', null, item.label);
    label.setAttribute('for', inputId);
    var input = el('input');
    input.id = inputId;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = item.value || '';
    input.placeholder = item.name === 'AZURE_AI_FOUNDRY_ENDPOINT' ? 'https://<resource>.services.ai.azure.com' : '';
    add(field, label, el('span', 'hint', hint), input);
    var actions = el('div', 'config-actions');
    var save = el('button', 'btn-secondary', settingsState.savingConfig[item.name] ? 'Saving…' : 'Save');
    save.type = 'button';
    save.disabled = Boolean(settingsState.savingConfig[item.name]);
    save.addEventListener('click', function () { saveConfig(item, input); });
    add(actions, save);
    if (item.configured) {
      actions.appendChild(C.linkButton('Clear', function () {
        input.value = '';
        saveConfig(item, input);
      }));
    }
    add(row, field, actions);
    return row;
  }
  function integrationSection(id, title, description, fields) {
    var sec = el('section', 'settings-section');
    sec.setAttribute('aria-labelledby', id);
    var head = C.sectionHead(title, 'h2');
    head.firstChild.id = id;
    add(sec, head, el('p', 'meta config-description', description));
    fields.forEach(function (item) { sec.appendChild(item); });
    return sec;
  }
  function integrationsSection(config) {
    var byName = {};
    config.forEach(function (item) { byName[item.name] = item; });
    return [
      integrationSection('h-set-entra', 'Microsoft Entra ID', 'Once both IDs are set, Entra sign-in is required. Register this app as a public client with http://localhost as a redirect URI and delegated User.Read permission. First sign-in provisions workbench access; accounts themselves remain managed in Entra.', [
        configField(byName.ENTRA_TENANT_ID, 'Tenant identifier or tenant domain.'),
        configField(byName.ENTRA_CLIENT_ID, 'Application (client) ID from the app registration.')
      ]),
      integrationSection('h-set-foundry', 'Azure AI Foundry', 'Configuration only. The endpoint is not yet used for model calls.', [
        configField(byName.AZURE_AI_FOUNDRY_ENDPOINT, 'HTTPS endpoint for the Foundry resource or project. Query strings and fragments are not accepted.')
      ])
    ];
  }
  function foldersSection(info) {
    var sec = el('section', 'settings-section');
    sec.setAttribute('aria-labelledby', 'h-set-runs');
    var head = C.sectionHead('Runs folder', 'h2');
    head.firstChild.id = 'h-set-runs';
    var facts = el('dl', 'facts');
    function fact(term, content) { add(facts, el('dt', null, term), add(el('dd'), content)); }
    fact('Folder', el('span', 'mono', info.path));
    fact('Analyses', String(info.analyses));
    fact('Writable', el('span', 'mark ' + (info.writable ? 'done' : 'failed'), info.writable ? 'Yes' : 'No'));
    add(sec, head, facts, el('p', 'meta', 'To use a different folder, restart the dashboard with that folder\u2019s path.'));
    return sec;
  }
  function renderSettings() {
    var host = document.getElementById('integration-settings');
    var frag = document.createDocumentFragment();
    var status = el('p', 'meta', settingsState.loading && !settingsState.data ? 'Loading settings…' : settingsState.error || settingsState.note);
    status.setAttribute('role', 'status');
    if (settingsState.error) {
      status.classList.add('fail');
      add(status, ' ', C.linkButton('Try again', loadSettings));
    }
    frag.appendChild(status);
    var data = settingsState.data;
    if (data) {
      var keys = el('section', 'settings-section');
      keys.setAttribute('aria-labelledby', 'h-set-keys');
      var head = C.sectionHead('API keys', 'h2', el('span', 'meta', 'Used by approved data collection.'));
      head.firstChild.id = 'h-set-keys';
      add(keys, head);
      data.keys.forEach(function (key) { keys.appendChild(keyRow(key)); });
      add(frag, keys);
      integrationsSection(data.config || []).forEach(function (section) { frag.appendChild(section); });
      add(frag, analystSection(), foldersSection(data.runsFolder));
    }
    C.replace(host, frag);
  }
  var settingsShown = false;
  C.panes.settings = function () {
    var visible = state.route === 'settings';
    if (!visible) { settingsShown = false; return; }
    if (settingsShown) return;
    settingsShown = true;
    settingsState.note = '';
    loadSettings();
  };
})();
