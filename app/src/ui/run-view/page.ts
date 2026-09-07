/**
 * Dashboard page. One HTML document, inline CSS and JS, no dependencies.
 *
 * The page never writes: it polls GET /api/run every two seconds and fetches artifacts
 * with GET /api/artifact. All rendering goes through textContent, so quotes and source
 * text inside artifacts are never interpreted as markup.
 */
export const renderPage = (runId: string, pollMs: number): string => {
  const safeRunId = runId.replace(/[^a-zA-Z0-9._-]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Run view: ${safeRunId}</title>
<style>
  :root { --ink:#1F3144; --muted:#606D7B; --line:#A2A9B1; --soft:#E3E5E8; --blue:#005AFF; --sky:#96C8F0; --teal:#19736E; --orange:#E17D28; --red:#772219; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "VestasSans", "Helvetica Neue", Arial, sans-serif; color:var(--ink); background:#fff; }
  header { background:var(--ink); color:#fff; padding:16px 24px; display:flex; gap:24px; align-items:baseline; flex-wrap:wrap; }
  header h1 { font-size:18px; font-weight:500; margin:0; }
  header .meta { color:var(--soft); font-size:12px; }
  header .badge { border:1px solid var(--soft); color:var(--soft); font-size:11px; padding:2px 8px; border-radius:2px; }
  main { display:grid; grid-template-columns: 1fr 420px; gap:24px; padding:24px; }
  section { border:1px solid var(--line); background:#fff; }
  section > h2 { margin:0; padding:12px 16px; font-size:15px; font-weight:500; background:#fff; border-bottom:1px solid var(--soft); }
  .stack { display:flex; flex-direction:column; gap:24px; min-width:0; }
  .waiting { border:2px solid var(--teal); padding:12px 16px; }
  .waiting h2 { border:0; padding:0 0 8px 0; color:var(--teal); }
  .waiting ul { margin:0; padding-left:18px; font-size:13px; }
  .waiting .none { color:var(--muted); font-size:13px; }
  .source { padding:12px 16px; border-bottom:1px solid var(--soft); }
  .source:last-child { border-bottom:0; }
  .source h3 { margin:0 0 8px 0; font-size:14px; font-weight:500; }
  .lane { display:flex; flex-wrap:wrap; gap:8px; }
  .stage { border:1px solid var(--line); padding:8px 10px; min-width:150px; font-size:12px; }
  .stage .name { font-weight:500; margin-bottom:6px; }
  .chip { display:inline-block; font-size:11px; padding:2px 8px; border-radius:2px; border:1px solid var(--line); color:var(--ink); background:var(--soft); }
  .chip.in-progress { background:var(--sky); border-color:var(--blue); }
  .chip.committed { background:var(--blue); color:#fff; border-color:var(--blue); }
  .chip.failed { background:var(--red); color:#fff; border-color:var(--red); }
  .chip.provisional { background:var(--orange); color:#fff; border-color:var(--orange); }
  .chip.reviewed { background:var(--teal); color:#fff; border-color:var(--teal); }
  .chip.synthetic { background:var(--ink); color:#fff; border-color:var(--ink); }
  .stage .detail { color:var(--muted); margin-top:6px; }
  .stage .fail { color:var(--red); }
  .artifact { display:block; margin-top:4px; color:var(--blue); cursor:pointer; text-decoration:underline; font-size:11px; word-break:break-all; }
  .flag { display:inline-block; font-size:10px; color:var(--muted); border:1px solid var(--soft); padding:0 4px; margin-left:4px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--soft); vertical-align:top; }
  th { color:var(--muted); font-weight:500; }
  .empty { color:var(--muted); font-size:12px; padding:12px 16px; }
  aside section { position:sticky; top:24px; }
  pre { margin:0; padding:12px 16px; font-size:11px; line-height:1.4; max-height:70vh; overflow:auto; white-space:pre-wrap; word-break:break-word; }
  .viewer-title { font-size:12px; color:var(--muted); padding:8px 16px; border-bottom:1px solid var(--soft); word-break:break-all; }
  .error { color:var(--red); font-size:12px; padding:12px 16px; }
</style>
</head>
<body>
<header>
  <h1>Run view: <span id="run-id">${safeRunId}</span></h1>
  <span class="meta">scanned <span id="scanned">–</span></span>
  <span class="meta"><span id="counts">–</span></span>
  <span class="badge">read-only; renders the run directory</span>
</header>
<main>
  <div class="stack">
    <section class="waiting">
      <h2>Waiting on a human (derived from artifact presence)</h2>
      <div id="waiting"></div>
    </section>
    <section>
      <h2>Panel 2: source assurance, per admitted source</h2>
      <div id="sources"></div>
    </section>
    <section>
      <h2>Panel 3: synthesis, relevance, memo, verification</h2>
      <div id="synthesis" class="source"></div>
    </section>
    <section>
      <h2>Exception queue</h2>
      <div id="exceptions"></div>
    </section>
    <section>
      <h2>Events (newest first, controller-attributed, content-free)</h2>
      <div id="events"></div>
    </section>
  </div>
  <aside>
    <section>
      <h2>Artifact</h2>
      <div class="viewer-title" id="viewer-title">Click an artifact to view it. Nothing here can be edited.</div>
      <pre id="viewer"></pre>
    </section>
  </aside>
</main>
<script>
(function () {
  var POLL = ${Math.max(500, Math.floor(pollMs))};
  var runId = ${JSON.stringify(safeRunId)};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function chip(status) { return el('span', 'chip ' + status, status); }

  function artifactLink(artifact) {
    var link = el('span', 'artifact', artifact.relPath + ' (' + artifact.size + ' B)');
    link.addEventListener('click', function () { viewArtifact(artifact.relPath); });
    var wrap = el('span');
    wrap.appendChild(link);
    (artifact.flags || []).forEach(function (flag) { wrap.appendChild(el('span', 'flag', flag)); });
    return wrap;
  }

  function stageCard(stage) {
    var card = el('div', 'stage');
    card.appendChild(el('div', 'name', stage.name));
    card.appendChild(chip(stage.status));
    var detail = el('div', 'detail');
    if (stage.attempts > 0) detail.appendChild(el('div', null, 'attempts: ' + stage.attempts));
    var failureKeys = Object.keys(stage.failures || {});
    if (failureKeys.length > 0) {
      detail.appendChild(el('div', 'fail', 'failures: ' + failureKeys.map(function (k) { return k + ' x' + stage.failures[k]; }).join(', ')));
    }
    (stage.artifacts || []).forEach(function (artifact) { detail.appendChild(artifactLink(artifact)); });
    card.appendChild(detail);
    return card;
  }

  function renderWaiting(items) {
    var host = document.getElementById('waiting');
    clear(host);
    if (!items || items.length === 0) { host.appendChild(el('div', 'none', 'Nothing. The run is either complete or running machine work.')); return; }
    var list = el('ul');
    items.forEach(function (item) { list.appendChild(el('li', null, item)); });
    host.appendChild(list);
  }

  function renderSources(sources) {
    var host = document.getElementById('sources');
    clear(host);
    if (!sources || sources.length === 0) { host.appendChild(el('div', 'empty', 'No admitted sources under assurance/ yet.')); return; }
    sources.forEach(function (source) {
      var block = el('div', 'source');
      block.appendChild(el('h3', null, source.snapshotId + (source.waitingOn ? '  ·  waiting: ' + source.waitingOn : '')));
      var lane = el('div', 'lane');
      source.stages.forEach(function (stage) { lane.appendChild(stageCard(stage)); });
      block.appendChild(lane);
      host.appendChild(block);
    });
  }

  function renderSynthesis(stages) {
    var host = document.getElementById('synthesis');
    clear(host);
    if (!stages || stages.length === 0) { host.appendChild(el('div', 'empty', 'No synthesis artifacts yet.')); return; }
    var lane = el('div', 'lane');
    stages.forEach(function (stage) { lane.appendChild(stageCard(stage)); });
    host.appendChild(lane);
  }

  function renderExceptions(items) {
    var host = document.getElementById('exceptions');
    clear(host);
    if (!items || items.length === 0) { host.appendChild(el('div', 'empty', 'Empty. That is the normal state.')); return; }
    var table = el('table');
    var head = el('tr');
    ['kind', 'status', 'raised', 'id'].forEach(function (h) { head.appendChild(el('th', null, h)); });
    table.appendChild(head);
    items.forEach(function (item) {
      var row = el('tr');
      row.appendChild(el('td', null, item.kind));
      var status = el('td'); status.appendChild(chip(item.status === 'open' ? 'failed' : 'committed')); row.appendChild(status);
      row.appendChild(el('td', null, item.raisedAt));
      var idCell = el('td'); idCell.appendChild(artifactLink({ relPath: item.relPath, size: 0, flags: [] })); row.appendChild(idCell);
      table.appendChild(row);
    });
    host.appendChild(table);
  }

  function renderEvents(items) {
    var host = document.getElementById('events');
    clear(host);
    if (!items || items.length === 0) { host.appendChild(el('div', 'empty', 'No events.jsonl found under the run.')); return; }
    var table = el('table');
    var head = el('tr');
    ['at', 'event', 'stage', 'attempt', 'status', 'actor'].forEach(function (h) { head.appendChild(el('th', null, h)); });
    table.appendChild(head);
    items.forEach(function (item) {
      var row = el('tr');
      row.appendChild(el('td', null, item.at));
      row.appendChild(el('td', null, item.type));
      row.appendChild(el('td', null, item.stage));
      row.appendChild(el('td', null, item.attempt === null ? '' : item.attempt));
      row.appendChild(el('td', null, item.status));
      row.appendChild(el('td', null, item.actor));
      table.appendChild(row);
    });
    host.appendChild(table);
  }

  function viewArtifact(relPath) {
    var title = document.getElementById('viewer-title');
    var pre = document.getElementById('viewer');
    title.textContent = relPath;
    pre.textContent = 'loading…';
    fetch('/api/artifact?path=' + encodeURIComponent(relPath)).then(function (res) {
      if (!res.ok) { pre.textContent = 'not available (' + res.status + ')'; return; }
      return res.text().then(function (text) {
        try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); }
        catch (e) { pre.textContent = text; }
      });
    }).catch(function () { pre.textContent = 'request failed'; });
  }

  function refresh() {
    fetch('/api/run').then(function (res) { return res.json(); }).then(function (view) {
      document.getElementById('scanned').textContent = view.scannedAt;
      document.getElementById('counts').textContent = view.counts.files + ' files · ' + view.counts.sources + ' sources · ' + view.counts.openExceptions + ' open exceptions · ' + view.counts.events + ' events' + (view.truncated ? ' · scan truncated' : '');
      renderWaiting(view.waitingOn);
      renderSources(view.sources);
      renderSynthesis(view.synthesis);
      renderExceptions(view.exceptions);
      renderEvents(view.events);
    }).catch(function () {
      document.getElementById('scanned').textContent = 'unreachable';
    });
  }

  refresh();
  setInterval(refresh, POLL);
})();
</script>
</body>
</html>`;
};
