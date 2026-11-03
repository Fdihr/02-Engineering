(function () {
  var esc = window.escapeHtml;
  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var sources = {
    S1: { name: 'National CERT bulletin', tier: 'Tier 2, official', assurance: ['covered', 'Reviewed'] },
    S2: { name: 'Utility OT advisory, national CERT', tier: 'Tier 2, official', assurance: ['covered', 'Reviewed'] },
    S3: { name: 'Control Risks analyst report', tier: 'Tier 1, analyst report', assurance: ['covered', 'Reviewed'] },
    S4: { name: 'Specialist security media', tier: 'Tier 3, specialist media', assurance: ['covered', 'Reviewed'] },
    S5: { name: 'Ministry statement on subsea cable damage', tier: 'Tier 2, official', assurance: ['covered', 'Reviewed'] },
    S6: { name: 'Industry ISAC weekly summary', tier: 'Tier 3, specialist media', assurance: ['covered', 'Reviewed'] },
    S7: { name: 'Regional news report on port security', tier: 'Tier 3, established media', assurance: ['attention', 'Provisional'] },
    S8: { name: 'Researcher social post', tier: 'Tier 5, social', assurance: ['closed', 'Context only'] },
    S9: { name: 'EU agency threat landscape', tier: 'Tier 2, official', assurance: ['covered', 'Reviewed'] }
  };

  var ASSESS = { covered: 'Covered', partial: 'Partial', gap: 'Gap', unclear: 'Unclear' };
  var CAVEAT = ', based on a single unconfirmed report';

  var claims = [
    { id: 'c1', where: 'Bottom line', text: 'State-linked pre-positioning in European utility OT networks is likely to continue through Q1 2027', assess: 'covered', calib: 'Likely',
      baseChanged: true, segs: [['same', 'State-linked pre-positioning in European utility OT networks '], ['del', 'will'], ['ins', 'is likely to'], ['same', ' continue through Q1 2027']],
      v2: 'State-linked pre-positioning in European utility OT networks will continue through Q1 2027',
      ev: [['S9', 'Pre-positioning activity against energy-sector operational networks persisted throughout the reporting period.', 'seg-022 · 4110–4262'],
           ['S3', 'We expect state-aligned access operations against European utilities to continue at the current tempo into early 2027.', 'seg-006 · 980–1114']],
      challenge: 'Challenge asked whether “continue” assumes a stable tempo. Adjudication kept it: both sources describe sustained activity, not a single campaign.' },
    { id: 'c2', where: 'Bottom line', text: 'disruptive action against wind assets remains unlikely without a wider escalation', assess: 'partial', calib: 'Unlikely',
      ev: [['S3', 'Disruptive operations against generation assets have not been observed outside periods of acute crisis.', 'seg-009 · 1502–1630']],
      challenge: 'One analyst source; consistent with the absence of reported incidents. Kept as partial.' },
    { id: 'c3', where: 'Key judgement 1', text: 'Remote-access gateways serving generation sites are the most frequently probed entry point', assess: 'covered', calib: 'Likely',
      ev: [['S2', 'Operators observed repeated authentication attempts against remote-access gateways serving wind generation sites.', 'seg-014 · 2210–2388'],
           ['S1', 'Most reported intrusion attempts targeted VPN and remote-maintenance interfaces.', 'seg-003 · 412–520'],
           ['S6', 'Members again reported credential spraying against remote-access portals.', 'seg-002 · 188–266']],
      challenge: 'No challenge raised.' },
    { id: 'c4', where: 'Key judgement 2', text: 'Ransomware remains the main cause of production disruption at European industrial manufacturers', assess: 'covered', calib: 'Almost certain',
      baseChanged: true, segs: [['same', 'Ransomware '], ['del', 'is a leading cause'], ['ins', 'remains the main cause'], ['same', ' of production disruption at European industrial manufacturers']],
      v2: 'Ransomware is a leading cause of production disruption at European industrial manufacturers',
      ev: [['S9', 'Ransomware accounted for the majority of disruptive incidents in manufacturing.', 'seg-031 · 6020–6118'],
           ['S6', 'Two members reported production stoppages after ransomware incidents this quarter.', 'seg-005 · 702–790']],
      challenge: 'Strengthened in v3 by the EU agency source.' },
    { id: 'c5', where: 'Key judgement 3', text: 'A state-linked group was behind the October intrusion at a Nordic grid operator', assess: 'gap', calib: 'Likely', blocker: 'b1',
      ev: [['S4', 'Investigators linked the activity to a state-aligned cluster known for targeting European utilities.', 'seg-011 · 1840–1952']],
      contra: ['S1', 'Attribution at this stage would be premature; no shared infrastructure has been identified.', 'seg-007 · 860–958'],
      challenge: 'Single source, contradicted by a tier 2 official bulletin. The memo standard requires two independent sources for a key judgement rated likely.' },
    { id: 'c6', where: 'Key judgement 4', text: 'Hybrid sabotage against Baltic subsea cables and ports will remain a recurring risk to logistics', assess: 'covered', calib: 'Likely',
      ev: [['S5', 'The damage is consistent with a dragged anchor; the investigation into intent continues.', 'seg-004 · 530–640'],
           ['S3', 'Incidents affecting Baltic subsea infrastructure have recurred at a rate of several per year since 2023.', 'seg-012 · 2001–2140']],
      challenge: 'Challenge noted intent is unproven in the latest case. Wording speaks of risk, not attribution; kept.' },
    { id: 'c7', where: 'Implications for Vestas', text: 'Port security disruption could delay component shipments through Baltic hubs', assess: 'partial', calib: 'Possible', blocker: 'b2',
      baseChanged: true, v2: null,
      ev: [['S7', 'Security checks at the port added up to two days to some cargo handling last week.', 'seg-003 · 300–402']],
      challenge: 'Rests on a source whose assurance is still provisional.' },
    { id: 'c8', where: 'Implications for Vestas', text: 'Service technicians\u2019 remote-maintenance accounts are an attractive target', assess: 'covered', calib: 'Likely',
      ev: [['S2', 'Compromised maintenance credentials were the initial access vector in two of the cases reviewed.', 'seg-019 · 3340–3460'],
           ['S1', 'Third-party maintenance accounts remain a common route into OT environments.', 'seg-005 · 630–712']],
      challenge: 'No challenge raised.' },
    { id: 'c9', where: 'Indicators to watch', text: 'a public claim of responsibility by a hacktivist group would signal intent to escalate', assess: 'unclear', calib: 'Not rated',
      ev: [['S8', 'Channel posts suggest the group is preparing a campaign against energy firms.', 'post · 2026-10-29']],
      challenge: 'Indicator, not a judgement. Social source used for context only.' }
  ];
  claims.forEach(function (c) { if (c.v2 === undefined) c.v2 = c.text; });

  var blockers = [
    { id: 'b1', claim: 'c5', text: 'Key judgement 3 rests on one source and is contradicted', resolved: false,
      fixes: [['downgrade', 'Downgrade to \u201cpossible\u201d and state the disagreement', 'Confirming rewrites key judgement 3 as \u201cpossible\u201d, quotes both sources, and records the change in memo v3.1. The other judgements stay as they are.'],
              ['remove', 'Move out of key judgements', 'Confirming moves the sentence to background context. It is no longer a key judgement and no longer needs two sources.']] },
    { id: 'b2', claim: 'c7', text: 'Implication on Baltic ports rests on a provisional source', resolved: false,
      fixes: [['caveat', 'Keep with a stated caveat', 'Confirming adds \u201cbased on a single unconfirmed report\u201d to the sentence. The source stays provisional and is listed as such.'],
              ['assure', 'Wait for source assurance', 'Confirming holds publication until the assurance review of this source is recorded.']] }
  ];

  var PROPOSALS = {
    c1: { 'Shorter': 'State-linked pre-positioning in European utility OT networks is likely to continue',
          'Plainer': 'State-backed groups are likely to keep getting into, and staying inside, European utility control systems through Q1 2027',
          'For engineers': 'State-linked pre-positioning in European utility OT networks is likely to continue at the current tempo through Q1 2027' },
    c3: { 'Shorter': 'Remote-access gateways at generation sites are the most probed entry point',
          'Plainer': 'Attackers try the remote-login systems at generation sites more than any other way in',
          'For engineers': 'Remote-access gateways (VPN and remote maintenance) at generation sites are the most frequently probed initial-access route' },
    c7: { 'Shorter': 'Port security checks could delay component shipments through Baltic hubs',
          'Plainer': 'Tighter security at Baltic ports could make component deliveries late',
          'For engineers': 'Port security checks at Baltic hubs could add up to two days of handling time to component shipments' }
  };

  var OUTPUTS = {
    memo: { label: 'memo', name: 'Memo v3.1', version: 'memo v3', published: 'memo v3.1' },
    brief: { label: 'brief', name: 'Brief v1', version: 'brief v1', published: 'brief v1' },
    assessment: { label: 'assessment', name: 'Assessment v1', version: 'assessment v1', published: 'assessment v1' }
  };
  var VISIBLE = { memo: null, brief: ['c1', 'c5', 'c6'], assessment: null };

  var state = {
    tab: 'memo', mode: 'text', sel: null,
    published: { memo: false, brief: false, assessment: false },
    written: { brief: 'none', assessment: 'none' },
    rw: { style: 'Shorter', status: 'idle', proposal: null },
    fadeId: null
  };
  var rwToken = 0;

  var byId = function (id) { return claims.filter(function (c) { return c.id === id; })[0]; };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var mark = function (cls, word) { return '<span class="mark ' + cls + '">' + esc(word) + '</span>'; };
  var openBlocker = function (c) { var b = blockers.filter(function (x) { return x.id === c.blocker; })[0]; return b && !b.resolved ? b : null; };
  var openCount = function () { return blockers.filter(function (b) { return !b.resolved; }).length; };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
  var changed = function (c) { return !!(c.baseChanged || c.edited); };
  var changedCount = function () { return claims.filter(changed).length; };
  var isWritten = function (t) { return t === 'memo' || state.written[t] === 'ready'; };

  function visibleIds() {
    var list = VISIBLE[state.tab];
    return claims.map(function (c) { return c.id; }).filter(function (id) { return !list || list.indexOf(id) !== -1; });
  }

  function refsHtml(c) {
    var seen = [];
    c.ev.forEach(function (e) { if (seen.indexOf(e[0]) === -1) seen.push(e[0]); });
    return '<sup class="refs">' + seen.map(function (s) {
      var n = s.slice(1);
      return '<a href="#src-' + s + '" aria-label="Source ' + n + ': ' + esc(sources[s].name) + '">' + n + '</a>';
    }).join('') + '</sup>';
  }

  function segsHtml(c) {
    var segs;
    if (c.edited) segs = c.v2 ? [['del', c.v2], ['ins', c.text]] : [['ins', c.text]];
    else if (c.segs) segs = c.segs;
    else segs = [['ins', c.text]];
    return segs.map(function (s) {
      var t = esc(s[1]);
      if (s[0] === 'del') return '<del>' + t + '</del> ';
      if (s[0] === 'ins') return '<ins>' + t + '</ins>';
      return t;
    }).join('').replace(/\s+$/, '') + '.';
  }

  function claimHtml(id, plain) {
    var c = byId(id);
    var b = openBlocker(c);
    var showChange = state.mode === 'changes' && changed(c);
    var cls = 'claim' + (b ? ' is-blocker' : '');
    if (state.mode === 'confidence' && !b && c.assess !== 'covered') cls += ' shade-' + c.assess;
    var gutter = '';
    if (!plain && (b || showChange)) {
      gutter = '<span class="gutter">' + (b ? mark('failed', 'Blocker') : '') + (showChange ? mark('running', 'Changed') : '') + '</span>';
    }
    var body = showChange ? segsHtml(c) : esc(cap(c.text)) + '.';
    // A span, not a button: buttons lay out as inline-block and cannot wrap with the prose.
    return gutter + '<span role="button" tabindex="0" class="' + cls + '" data-claim="' + id + '" aria-pressed="' + (state.sel === id) + '">' + body + '</span>' + refsHtml(c);
  }

  function sourcesHtml(ids) {
    var used = Object.keys(sources).filter(function (s) {
      return !ids || claims.some(function (c) { return ids.indexOf(c.id) !== -1 && c.ev.some(function (e) { return e[0] === s; }); });
    });
    return '<section><h4>Sources</h4><ol class="endnotes">' + used.map(function (s) {
      return '<li id="src-' + s + '" value="' + s.slice(1) + '">' + esc(sources[s].name) + '<span class="meta">' + esc(sources[s].tier) + ' · ' + esc(sources[s].assurance[1].toLowerCase()) + '</span></li>';
    }).join('') + '</ol></section>';
  }

  function memoSections() {
    var c = claimHtml;
    return '<section><h4>Bottom line</h4><p class="bluf">' + c('c1') + ' ' + c('c2') + ' Ransomware and hybrid sabotage are the more immediate risks to Vestas operations.</p></section>' +
      '<section><h4>Key judgements</h4><ol>' + ['c3', 'c4', 'c5', 'c6'].map(function (id) { return '<li>' + c(id) + '</li>'; }).join('') + '</ol></section>' +
      '<section><h4>Implications for Vestas</h4>' +
        '<p>' + c('c7') + ' Installation schedules that depend on single Baltic hubs carry the most exposure, because alternative routing adds days rather than hours.</p>' +
        '<p>' + c('c8') + ' Access reviews for third-party and field-service accounts are the most direct control within Vestas\u2019 reach.</p></section>' +
      '<section><h4>Indicators to watch</h4><ul>' +
        '<li>' + cap(c('c9')) + '</li>' +
        '<li>New repeated authentication attempts against remote-access gateways at generation sites.</li>' +
        '<li>Further damage to Baltic subsea cables, and whether investigators establish intent.</li></ul></section>';
  }

  function pageMeta() {
    var o = OUTPUTS[state.tab];
    return 'Vestas leadership · ' + (state.published[state.tab] ? o.published + ' · published' : o.version + ' · draft, not published');
  }

  function docHtml() {
    var tab = state.tab;
    var head = '<h3 class="doc-title">Europe cyber and geopolitical outlook, Q4 2026</h3><p class="doc-meta" id="doc-meta">' + esc(pageMeta()) + '</p>';
    var body;
    if (tab !== 'memo' && state.written[tab] === 'none') {
      body = '<div class="doc-empty"><p>The ' + tab + ' has not been written. You chose a memo when you started; writing a ' + tab + ' uses the same approved evidence.</p>' +
        '<button class="btn-secondary" type="button" data-write="' + tab + '">Write the ' + tab + '</button></div>';
    } else if (tab !== 'memo' && state.written[tab] === 'writing') {
      body = '<div class="doc-writing" aria-busy="true"><span class="ai-mark">AI writing the ' + tab + '</span>' +
        '<div class="skel skel-head"></div><div class="skel w1"></div><div class="skel w2"></div><div class="skel w3"></div>' +
        '<div class="skel skel-head"></div><div class="skel w1"></div><div class="skel w4"></div><div class="skel w2"></div></div>';
    } else if (tab === 'memo') {
      body = memoSections() + sourcesHtml();
    } else if (tab === 'brief') {
      body = '<section><h4>Bottom line</h4><p class="bluf">Pre-positioning in European utility networks is likely to continue. The Nordic grid attribution and Baltic sabotage are the two points leadership should follow.</p></section>' +
        '<section><h4>Key judgements</h4><ol>' + ['c1', 'c5', 'c6'].map(function (id) { return '<li>' + claimHtml(id) + '</li>'; }).join('') + '</ol></section>' +
        sourcesHtml(VISIBLE.brief);
    } else {
      var gaps = claims.filter(function (c) { return c.assess !== 'covered'; });
      body = memoSections() +
        '<section><h4>Confidence and gaps</h4><p>' + plural(gaps.length, 'claim is', 'claims are') + ' partial, a gap or unclear. Read these with the support shown.</p><ul class="gaps-list">' +
        gaps.map(function (c) { return '<li>' + mark(c.assess, ASSESS[c.assess]) + claimHtml(c.id, true) + '<span class="meta">' + esc(c.calib) + '</span></li>'; }).join('') +
        '</ul></section>' + sourcesHtml();
    }
    return '<article class="page"><div class="page-inner">' + head + body + '</div></article>';
  }

  function renderPage() {
    $('doc').innerHTML = docHtml();
    if (state.fadeId) {
      qsa('.claim[data-claim="' + state.fadeId + '"]').forEach(function (b) { b.classList.add('fade'); });
      state.fadeId = null;
    }
    var legend = $('legend');
    legend.hidden = state.mode !== 'confidence';
    legend.innerHTML = state.mode === 'confidence' ? mark('covered', 'Covered, no shade') + mark('partial', 'Partial, yellow') + mark('gap', 'Gap, red') + mark('unclear', 'Unclear, dashed underline') : '';
  }

  function renderTabs() {
    var n = openCount();
    var set = function (id, text, hot) { var el = $('count-' + id); el.textContent = text; el.classList.toggle('hot', !!hot); };
    var out = function (t) {
      if (state.published[t]) return ['published', false];
      if (t === 'memo') return [n ? plural(n, 'blocker', 'blockers') : 'ready', !!n];
      return [{ none: 'not written', writing: 'writing', ready: 'ready' }[state.written[t]], false];
    };
    ['memo', 'brief', 'assessment'].forEach(function (t) { var o = out(t); set(t, o[0], o[1]); });
    $('count-changes').textContent = String(changedCount());
    qsa('.view-tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === state.tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    qsa('#modes .seg-btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
  }

  function renderStrip() {
    var n = openCount();
    var any = state.published.memo || state.published.brief || state.published.assessment;
    var now = $('strip-now');
    var yours = $('strip-yours');
    if (any) {
      var last = state.lastPublished;
      now.innerHTML = '<span class="mark done">Published</span><span>' + esc(OUTPUTS[last].name) + ' published to Vestas leadership</span>';
      $('strip-pub').innerHTML = '<span class="mark done">Publication</span>';
      $('strip-pub').removeAttribute('aria-current');
      yours.textContent = 'Open the published memo';
      yours.href = '/concepts/output.html';
    } else {
      now.innerHTML = '<span class="mark attention">Waiting for you</span><span>' + (n ? 'Memo v3 is ready, with <span class="figures">' + n + '</span> ' + (n === 1 ? 'blocker' : 'blockers') + ' to resolve' : 'Memo v3 is ready to approve') + '</span>';
    }
  }

  function traceHtml(c) {
    var b = openBlocker(c);
    var resolved = c.blocker && !b;
    var blk = blockers.filter(function (x) { return x.id === c.blocker; })[0];
    var ev = function (e, tier) {
      var s = sources[e[0]];
      return '<li class="ev"><blockquote>\u201c' + esc(e[1]) + '\u201d</blockquote><div class="ev-source">' + esc(s.name) + '</div>' +
        '<div class="ev-meta"><span>' + esc(s.tier) + '</span>' + mark(s.assurance[0], s.assurance[1]) + '<span class="anchor">' + esc(e[2]) + '</span></div></li>';
    };
    var html = '<div class="panel-sec"><div class="section-head"><h3>Claim ' + (claims.indexOf(c) + 1) + ' of ' + claims.length + '</h3><span class="meta">' + esc(c.where) + '</span></div>' +
      '<p class="panel-claim">' + esc(cap(c.text)) + '.</p>' +
      '<div class="panel-marks">' + mark(c.assess, ASSESS[c.assess]) + '<span class="meta">Calibrated as ' + esc(c.calib.toLowerCase()) + '</span></div>' +
      (b ? '<p>' + mark('failed', 'Blocker') + ' ' + esc(b.text) + '.</p>' : '') +
      (resolved ? '<p>' + mark('covered', 'Resolved') + ' ' + esc(blk.resolution) + '</p>' : '') + '</div>' +
      '<div class="panel-sec"><h4>Supporting evidence <span class="meta">' + c.ev.length + '</span></h4><ul class="ev-list">' + c.ev.map(ev).join('') + '</ul>' +
      (c.contra ? '<h4>Contradicting evidence <span class="meta">1</span></h4><ul class="ev-list">' + ev(c.contra) + '</ul>' : '') + '</div>' +
      '<div class="panel-sec"><h4>Challenge and adjudication</h4><p>' + esc(c.challenge) + '</p></div>';
    if (b) {
      html += '<div class="panel-sec"><h4>Resolve this blocker</h4>' + b.fixes.map(function (f) {
        return '<div class="fix-option"><button class="btn-secondary" type="button" data-fix="' + b.id + ':' + f[0] + '">' + esc(f[1]) + '</button><p class="meta">' + esc(f[2]) + '</p></div>';
      }).join('') + '</div>';
    }
    return html;
  }

  function rewriteHtml(c) {
    var rw = state.rw;
    var busy = rw.status === 'thinking';
    var styles = ['Shorter', 'Plainer', 'For engineers'];
    var html = '<div class="panel-sec rw-form"><h4>Ask for a rewrite</h4><div class="segmented" role="group" aria-label="Rewrite style">' +
      styles.map(function (s) { return '<button class="seg-btn" type="button" data-style="' + s + '" aria-pressed="' + (rw.style === s) + '"' + (busy ? ' disabled' : '') + '>' + s + '</button>'; }).join('') +
      '</div><div class="btn-row"><button class="btn-secondary" type="button" id="btn-suggest"' + (busy ? ' disabled' : '') + '>Suggest</button>' + (busy ? '<span class="ai-mark">AI rewriting</span>' : '') + '</div>';
    if (rw.status === 'proposal') {
      html += '<div class="rw-prop"><span class="label">Original</span><p><del>' + esc(cap(c.text)) + '.</del></p>' +
        '<span class="label">Proposed, ' + esc(rw.style.toLowerCase()) + '</span><p><ins>' + esc(cap(rw.proposal)) + '.</ins></p>' +
        '<p class="check">' + mark('covered', 'Checked') + '<span>Checked against its sources: still supported.</span></p>' +
        '<div class="btn-row"><button class="btn-secondary" type="button" id="btn-accept">Accept</button><button class="btn-ghost" type="button" id="btn-reject">Reject</button></div></div>';
    } else if (rw.status === 'none') {
      html += '<p class="meta rw-none">No rewrite suggested for this claim.</p>';
    }
    return html + '</div>';
  }

  function summaryHtml() {
    var ids = visibleIds();
    var counts = { covered: 0, partial: 0, gap: 0, unclear: 0 };
    ids.forEach(function (id) { counts[byId(id).assess]++; });
    var rows = blockers.filter(function (b) { return ids.indexOf(b.claim) !== -1; }).map(function (b) {
      var c = byId(b.claim);
      if (b.resolved) return '<li><div class="resolved-row">' + mark('covered', 'Resolved') + '<span>' + esc(cap(c.text)) + '.</span></div></li>';
      return '<li><button class="row-btn" type="button" data-claim="' + c.id + '">' + mark('failed', 'Blocker') + '<span>' + esc(b.text) + '. ' + esc(cap(c.text)) + '.</span></button></li>';
    }).join('');
    return '<div class="panel-sec"><div class="section-head"><h3>Review</h3><span class="meta">' + esc(OUTPUTS[state.tab].label) + '</span></div>' +
      '<p class="meta">Covered <span class="figures">' + counts.covered + '</span> · partial <span class="figures">' + counts.partial + '</span> · gap <span class="figures">' + counts.gap + '</span> · unclear <span class="figures">' + counts.unclear + '</span> of <span class="figures">' + ids.length + '</span> claims. Select a claim in the page to see its evidence.</p>' +
      (rows ? '<ul class="rows-list">' + rows + '</ul>' : '<p class="meta">No blockers.</p>') + '</div>';
  }

  function approveHtml() {
    var t = state.tab;
    var o = OUTPUTS[t];
    var n = openCount();
    var reason = '';
    if (!isWritten(t)) reason = state.written[t] === 'writing' ? 'Wait until the ' + t + ' is written' : 'Write the ' + t + ' first';
    else if (n) reason = 'Resolve ' + plural(n, 'blocker', 'blockers') + ' first';
    return '<div class="panel-sec"><button class="btn-primary" type="button" id="btn-approve"' + (reason ? ' disabled aria-describedby="approve-why"' : '') + '>Approve ' + o.label + ' for publication</button>' +
      '<p class="meta" id="approve-why">' + (reason ? esc(reason) : 'Publishes ' + esc(o.published) + ' to Vestas leadership and freezes its sources and traces.') + '</p></div>';
  }

  function renderPanel(focusSel) {
    var t = state.tab;
    var pub = state.published[t];
    var c = state.sel && visibleIds().indexOf(state.sel) !== -1 ? byId(state.sel) : null;
    var html = '';
    if (pub) {
      html += '<div class="panel-sec"><div class="done-note">' + mark('done', 'Published') + '<span>' + esc(OUTPUTS[t].name) + ' approved for publication by FDIHR. The decision and every claim trace are in the audit trail.</span></div>' +
        '<p class="next-step"><a class="btn-primary" href="/concepts/output.html">Open the published memo</a></p></div>';
    }
    if (c && isWritten(t)) html += traceHtml(c) + (pub ? '' : rewriteHtml(c));
    else html += summaryHtml();
    if (!pub) html += approveHtml();
    $('panel').innerHTML = html;
    if (focusSel) { var el = $('panel').querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
  }

  function renderAll() { renderPage(); renderTabs(); renderStrip(); renderPanel(); }

  function resetRw() { rwToken++; state.rw = { style: state.rw.style || 'Shorter', status: 'idle', proposal: null }; }

  function select(id, scroll) {
    state.sel = id;
    resetRw();
    qsa('.claim').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-claim') === id)); });
    renderPanel();
    if (scroll && id) {
      var btn = document.querySelector('.claim[data-claim="' + id + '"]');
      if (btn) {
        var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        btn.focus({ preventScroll: true });
        btn.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
      }
    }
  }

  function applyFix(blockerId, fix) {
    var b = blockers.filter(function (x) { return x.id === blockerId; })[0];
    var c = byId(b.claim);
    if (fix === 'assure') { window.showToast('Publication held until the source assurance review is recorded.'); return; }
    b.resolved = true;
    if (fix === 'downgrade') {
      c.text = 'A state-linked group was possibly behind the October intrusion at a Nordic grid operator; sources disagree';
      c.assess = 'partial'; c.calib = 'Possible'; c.ev.push(c.contra); delete c.contra;
      b.resolution = 'Downgraded to possible; both sources quoted.';
    }
    if (fix === 'remove') {
      c.text = 'Background context: investigators linked the October intrusion at a Nordic grid operator to a state-aligned cluster; this is not a key judgement';
      c.assess = 'partial'; c.calib = 'Context';
      b.resolution = 'Moved to background context.';
    }
    if (fix === 'caveat') { c.text = c.text + CAVEAT; b.resolution = 'Caveat added; source stays provisional.'; }
    state.fadeId = c.id;
    resetRw();
    renderAll();
    window.showToast('Blocker resolved');
  }

  function suggest() {
    var c = byId(state.sel);
    var style = state.rw.style;
    var token = ++rwToken;
    state.rw = { style: style, status: 'thinking', proposal: null };
    renderPanel('#btn-suggest');
    setTimeout(function () {
      if (token !== rwToken || state.sel !== c.id) return;
      var p = PROPOSALS[c.id] && PROPOSALS[c.id][style];
      if (p && c.text.indexOf(CAVEAT) !== -1) p += CAVEAT;
      state.rw = p ? { style: style, status: 'proposal', proposal: p } : { style: style, status: 'none', proposal: null };
      renderPanel(p ? '#btn-accept' : '#btn-suggest');
    }, 1200);
  }

  function accept() {
    var c = byId(state.sel);
    c.text = state.rw.proposal;
    c.edited = true;
    state.fadeId = c.id;
    resetRw();
    renderAll();
    window.showToast('Rewrite accepted. Changes since v2: ' + changedCount() + '.');
  }

  function writeOutput(t) {
    state.written[t] = 'writing';
    renderPage(); renderTabs(); renderPanel();
    setTimeout(function () {
      state.written[t] = 'ready';
      if (state.tab === t) { renderPage(); renderPanel(); }
      renderTabs();
      window.showToast('The ' + t + ' is written from the approved evidence.');
    }, 2500);
  }

  function setTab(t, focus) {
    state.tab = t;
    if (state.sel && visibleIds().indexOf(state.sel) === -1) { state.sel = null; }
    resetRw();
    renderPage(); renderTabs(); renderPanel();
    if (focus) $('tab-' + t).focus();
  }

  function publish() {
    var t = state.tab;
    if (!isWritten(t) || openCount() || state.published[t]) return;
    state.published[t] = true;
    state.lastPublished = t;
    renderAll();
    window.showToast(OUTPUTS[t].name + ' approved for publication: done.');
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var tab = t.closest('.view-tab');
    if (tab) { setTab(tab.getAttribute('data-tab')); return; }
    var mode = t.closest('[data-mode]');
    if (mode) { state.mode = mode.getAttribute('data-mode'); renderPage(); renderTabs(); return; }
    var write = t.closest('[data-write]');
    if (write) { writeOutput(write.getAttribute('data-write')); return; }
    var fix = t.closest('[data-fix]');
    if (fix) { var p = fix.getAttribute('data-fix').split(':'); applyFix(p[0], p[1]); return; }
    var style = t.closest('[data-style]');
    if (style) { state.rw = { style: style.getAttribute('data-style'), status: 'idle', proposal: null }; rwToken++; renderPanel('[data-style="' + style.getAttribute('data-style') + '"]'); return; }
    if (t.closest('#btn-suggest')) { suggest(); return; }
    if (t.closest('#btn-accept')) { accept(); return; }
    if (t.closest('#btn-reject')) { resetRw(); renderPanel('#btn-suggest'); return; }
    if (t.closest('#btn-approve')) { publish(); return; }
    var claim = t.closest('[data-claim]');
    if (claim) { select(claim.getAttribute('data-claim'), !claim.classList.contains('claim')); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches && e.target.matches('input, textarea, select')) return;
    var tab = e.target.closest && e.target.closest('.view-tab');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      var order = ['memo', 'brief', 'assessment'];
      var i = order.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      e.preventDefault();
      setTab(order[(i + order.length) % order.length], true);
      return;
    }
    var claimEl = e.target.closest && e.target.closest('.claim');
    if (claimEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); claimEl.click(); return; }
    if (e.key === 'Escape' && state.sel) { select(null, false); return; }
    if (e.key !== 'j' && e.key !== 'k' && e.key !== 'J' && e.key !== 'K') return;
    var ids = visibleIds();
    if (!isWritten(state.tab) || !ids.length) return;
    e.preventDefault();
    var idx = ids.indexOf(state.sel);
    var next = idx === -1 ? 0 : Math.max(0, Math.min(ids.length - 1, idx + (e.key.toLowerCase() === 'j' ? 1 : -1)));
    select(ids[next], true);
  });

  renderAll();
})();
