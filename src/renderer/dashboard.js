/**
 * dashboard.js — the cockpit window: overview, projects, models, habits,
 * history, tips and settings. Everything shown comes from the main process,
 * which only read local counters.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const HOUR = 3600e3;
const $ = (id) => document.getElementById(id);

let data = null;
let ui = { lang: 'fr', theme: 'dark', warn: 75, danger: 90 };
let tab = 'overview';
let profileId = null;
let histRange = '7d';
let histTable = false;

const T = (key, vars) => I18n.t(ui.lang, key, vars);

/** h('div', 'cls', child1, 'text', ...) — tiny DOM builder (text is always escaped). */
function h(tag, cls, ...children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
function s(tag, attrs, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
function button(label, cls, onClick) {
  const b = h('button', `btn ${cls || ''}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
const current = () => (data && (data.profiles.find((p) => p.id === profileId) || data.profiles[0])) || null;

// ---- tooltip -----------------------------------------------------------------
const tip = $('tooltip');
function showTip(event, ...children) {
  tip.replaceChildren(...children);
  tip.hidden = false;
  const pad = 14;
  const w = tip.offsetWidth;
  const x = event.clientX + pad + w > window.innerWidth ? event.clientX - w - pad : event.clientX + pad;
  tip.style.left = `${Math.max(x, 4)}px`;
  tip.style.top = `${Math.max(event.clientY - tip.offsetHeight - 8, 4)}px`;
}
const hideTip = () => { tip.hidden = true; };

// ---- shared pieces --------------------------------------------------------------
function bar(label, g, now, windowMs) {
  const box = h('div', 'bar');
  if (!g) {
    box.append(h('div', 'row', h('span', 'label', label), h('span', 'value', '–')));
    return box;
  }
  const p = Math.max(0, Math.min(100, g.pct));
  const level = p >= ui.danger ? 'danger' : p >= ui.warn ? 'warn' : '';
  const value = h('span', 'value', (g.estimated ? '≈ ' : '') + I18n.pct(p, ui.lang));
  if (g.estimated) value.title = T('bar.estimated', { official: Math.round(g.official) });
  const track = h('div', 'track');
  const official = g.estimated ? Math.max(0, Math.min(100, g.official)) : p;
  const fill = h('div', `fill ${level}`);
  fill.style.width = `${official}%`;
  track.append(fill);
  if (g.estimated && p > official) {
    const est = h('div', `fill est ${level}`);
    est.style.left = `${official}%`;
    est.style.width = `${p - official}%`;
    track.append(est);
  }
  if (g.resetsAt && windowMs && !g.stale) {
    const elapsed = 1 - (g.resetsAt - now) / windowMs;
    if (elapsed > 0 && elapsed < 1) {
      const m = h('div', 'pace');
      m.title = T('bar.pace');
      m.style.left = `${elapsed * 100}%`;
      track.append(m);
    }
  }
  let reset = '';
  if (g.stale) reset = T('reset.stale');
  else if (g.resetsAt) {
    reset = g.resetsAt <= now ? T('reset.done')
      : (g.approxReset ? '≈ ' : '') + T('reset.in', { left: I18n.left(g.resetsAt - now, ui.lang), when: I18n.when(g.resetsAt, now, ui.lang) });
  }
  box.append(h('div', 'row', h('span', 'label', label), value), track, h('div', 'reset', reset));
  return box;
}

function forecastLines(v, now) {
  const out = [];
  const f = v.forecast || {};
  if (f.session) {
    if (f.session.status === 'limit') out.push(h('p', 'forecast danger', T('forecast.limit')));
    else if (f.session.status === 'will_hit') out.push(h('p', 'forecast warn', T('forecast.hit', { time: I18n.time(f.session.hitAt, ui.lang) })));
    else out.push(h('p', 'forecast', T('forecast.ok', { pct: Math.round(f.session.projectedAtReset) })));
  }
  if (f.weekly && f.weekly.status === 'will_hit') out.push(h('p', 'forecast warn', T('forecast.weekHit', { time: I18n.when(f.weekly.hitAt, now, ui.lang) })));
  else if (f.budget != null) out.push(h('p', 'forecast', T('forecast.budget', { pct: Math.round(f.budget) })));
  return out;
}

function costCells(local) {
  const costs = h('div', 'costs');
  for (const [k, b] of [[T('cost.today'), local.today], [T('cost.week'), local.week], [T('cost.month'), local.month]]) {
    costs.append(h('div', '', h('div', 'k', k), h('div', 'v', I18n.usd(b.cost))));
  }
  return costs;
}

function profileCard(p, now) {
  const v = p.view || { official: {}, local: {} };
  const card = h('div', 'card pcard');
  card.append(h('h2', '', h('span', 'dot'), p.name, h('span', 'tag', T(p.kind === 'api' ? 'tag.api' : 'tag.plan'))));
  if (p.kind !== 'api') {
    if (v.official && v.official.available) {
      card.append(bar(T('bar.session'), v.session, now, 5 * HOUR), bar(T('bar.week'), v.weekly, now, 7 * 24 * HOUR), ...forecastLines(v, now));
      card.append(h('p', 'meta', T('meta.quota', { ago: I18n.ago(v.official.observedAt, now, ui.lang) })));
    } else {
      const key = p.relay && p.relay.mode === 'none' ? 'quota.none' : v.official && v.official.relaySeen ? 'quota.noLimits' : 'quota.open';
      card.append(h('p', 'muted', T(key)));
    }
  }
  if (v.local && v.local.available) card.append(costCells(v.local));
  return card;
}

function codexCard(x, now) {
  const card = h('div', 'card pcard codex');
  card.append(h('h2', '', h('span', 'dot'), 'Codex', x.plan ? h('span', 'tag', x.plan) : null));
  const name = (w) => {
    if (!w.windowMinutes) return T('bar.limit');
    if (w.windowMinutes <= 300) return T('bar.sessionH', { n: Math.round(w.windowMinutes / 60) });
    if (w.windowMinutes <= 10080) return T('bar.weekD', { n: Math.round(w.windowMinutes / 1440) });
    return T('bar.month', { n: Math.round(w.windowMinutes / 1440) });
  };
  for (const w of [x.primary, x.secondary]) {
    if (w) card.append(bar(name(w), { pct: w.usedPercent, resetsAt: w.resetsAt, stale: w.stale }, now, w.windowMinutes * 60e3));
  }
  if (x.observedAt) card.append(h('p', 'meta', T('codex.measured', { ago: I18n.ago(x.observedAt, now, ui.lang) })));
  return card;
}

// ---- overview ------------------------------------------------------------------
function dailyChart(daily) {
  const W = 880;
  const H = 170;
  const pad = { l: 46, r: 6, t: 8, b: 22 };
  const max = Math.max(...daily.map((d) => d.cost), 0.01);
  const innerH = H - pad.t - pad.b;
  const step = (W - pad.l - pad.r) / daily.length;
  const bw = Math.min(step - 2, 20);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': T('ov.daily') });
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + (1 - f) * innerH;
    svg.append(s('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
    svg.append(s('text', { class: 'axis', x: pad.l - 6, y: y + 3, 'text-anchor': 'end' }, I18n.usd(max * f)));
  }
  daily.forEach((d, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    const base = H - pad.b;
    const hgt = (d.cost / max) * innerH;
    const y = base - hgt;
    const r = Math.min(4, hgt, bw / 2);
    // hit area first, mark second: the column is hoverable over its full height
    const hit = s('rect', { class: 'bar-hit', x: pad.l + i * step, y: pad.t, width: step, height: innerH });
    hit.addEventListener('pointermove', (e) => showTip(e,
      h('div', 't', I18n.date(d.start, ui.lang)),
      h('div', 'r', T('col.cost'), h('b', '', I18n.usd(d.cost))),
      h('div', 'r', T('col.messages'), h('b', '', d.messages))));
    hit.addEventListener('pointerleave', hideTip);
    svg.append(hit);
    if (hgt > 0.5) {
      svg.append(s('path', {
        class: 'bar-mark',
        d: `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`
      }));
    }
    if (i % 5 === 4 || i === 0) {
      svg.append(s('text', { class: 'axis', x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }, I18n.date(d.start, ui.lang)));
    }
  });
  return svg;
}

function paneOverview(pane) {
  const now = data.now;
  const cards = h('div', 'grid cols');
  for (const p of data.profiles) cards.append(profileCard(p, now));
  if (data.codex && data.codex.available) cards.append(codexCard(data.codex, now));
  if (!cards.children.length) cards.append(h('div', 'card', h('p', 'muted', T('profile.none'))));
  pane.append(cards);

  const p = current();
  if (!p) return;
  const d = p.details;
  if (!d.totals.messages) {
    pane.append(h('div', 'card', h('p', 'empty', T('dash.empty'))));
    return;
  }
  const today = p.view && p.view.local && p.view.local.available ? p.view.local.today : { cost: 0, tokens: 0 };
  const top = d.projects[0];
  const tile = (k, v, sub) => h('div', 'card tile', h('div', 'k', k), h('div', 'v', v), h('div', 's', sub || ' '));
  pane.append(h('div', 'grid tiles',
    tile(T('ov.month'), I18n.usd(d.totals.cost), `${I18n.tokens(d.totals.tokens, ui.lang)} ${T('unit.tok')}`),
    tile(T('ov.today'), I18n.usd(today.cost), `${I18n.tokens(today.tokens, ui.lang)} ${T('unit.tok')}`),
    tile(T('ov.messages'), String(d.totals.messages), d.totals.unpriced ? `${d.totals.unpriced} ${T('col.unpriced')}` : ''),
    tile(T('ov.topProject'), top ? top.name : '–', top ? I18n.usd(top.cost) : '')));

  pane.append(h('div', 'card', h('h3', '', T('ov.daily')), dailyChart(d.daily)));

  const active = h('div', 'card', h('h3', '', T('ov.active')));
  if (!d.sessions.length) active.append(h('p', 'muted', T('ov.noActive')));
  for (const x of d.sessions) {
    const heavy = x.context > 150000;
    active.append(h('div', 'session',
      h('span', 'p', x.project), h('span', 'm', x.model),
      h('span', 'm', T('ov.burn', { n: I18n.tokens(x.outputPerMin, ui.lang) })),
      h('span', `x ${heavy ? 'warn' : ''}`, heavy ? T('ov.contextHigh') + ' · ' : '', T('ov.context', { n: I18n.tokens(x.context, ui.lang) }), ' · ', I18n.ago(x.lastT, now, ui.lang))));
  }
  pane.append(active);
  if (p.kind !== 'api') pane.append(h('p', 'hint', T('ov.equiv')));
}

// ---- projects / models -----------------------------------------------------------
function paneTable(pane, kind) {
  const p = current();
  if (!p) return;
  const rows = kind === 'models' ? p.details.models : p.details.projects;
  const total = p.details.totals.cost;
  const card = h('div', 'card');
  const exportBtn = button(T('export.csv'), 'small', async () => {
    if (await widget.exportCsv(kind, p.id)) flash(exportBtn, T('export.done'), T('export.csv'));
  });
  card.append(h('h3', '', T(kind === 'models' ? 'tab.models' : 'tab.projects'), ' · ', T('table.period'), h('span', 'spacer'), exportBtn));
  if (!rows.length) {
    card.append(h('p', 'empty', T('dash.empty')));
    pane.append(card);
    return;
  }
  const table = h('table');
  table.append(h('thead', '', h('tr', '',
    h('th', '', T(kind === 'models' ? 'col.model' : 'col.project')), h('th', 'n', T('col.cost')), h('th', '', T('col.share')),
    h('th', 'n', T('col.tokens')), h('th', 'n', T('col.messages')), h('th', 'n', T('col.last')))));
  const body = h('tbody');
  for (const r of rows) {
    const share = total > 0 ? (r.cost / total) * 100 : 0;
    const fill = h('div', 'fill');
    fill.style.width = `${share}%`;
    const name = h('td', 'name', r.name, r.unpriced ? h('span', 'badge', T('col.unpriced')) : null);
    name.title = r.name;
    body.append(h('tr', '', name, h('td', 'n', I18n.usd(r.cost)),
      h('td', '', h('div', 'share', h('div', 'track', fill), h('span', '', I18n.pct(share, ui.lang)))),
      h('td', 'n', I18n.tokens(r.tokens, ui.lang)), h('td', 'n', r.messages), h('td', 'n', I18n.ago(r.lastT, data.now, ui.lang))));
  }
  table.append(body);
  card.append(h('div', 'scroll', table));
  pane.append(card);
  if (p.kind !== 'api') pane.append(h('p', 'hint', T('ov.equiv')));
}

// ---- habits ----------------------------------------------------------------------
function paneHabits(pane) {
  const p = current();
  if (!p) return;
  const heat = p.details.heatmap;
  const max = Math.max(...heat.flat());
  const card = h('div', 'card', h('h3', '', T('habits.title')));
  if (max <= 0) {
    card.append(h('p', 'empty', T('habits.empty')));
    pane.append(card);
    return;
  }
  const grid = h('div', 'heat');
  grid.append(h('div', ''));
  for (let hour = 0; hour < 24; hour++) grid.append(h('div', 'hd', hour % 3 === 0 ? hour : ''));
  let best = { v: 0, day: 0, hour: 0 };
  heat.forEach((row, day) => {
    grid.append(h('div', 'day', T(`day.${day}`)));
    row.forEach((v, hour) => {
      if (v > best.v) best = { v, day, hour };
      const level = v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999));
      const cell = h('div', `cell l${level}`);
      cell.addEventListener('pointermove', (e) => showTip(e, h('div', 't', `${T(`dayLong.${day}`)} · ${hour} h`), h('div', 'r', T('col.cost'), h('b', '', I18n.usd(v)))));
      cell.addEventListener('pointerleave', hideTip);
      grid.append(cell);
    });
  });
  card.append(grid);
  card.append(h('div', 'heat-legend', T('habits.less'), h('span', 'cell'), h('span', 'cell l1'), h('span', 'cell l2'), h('span', 'cell l3'), h('span', 'cell l4'), T('habits.more')));
  pane.append(card, h('p', 'hint', T('habits.peak', { day: T(`dayLong.${best.day}`), hour: best.hour })));
}

// ---- history -----------------------------------------------------------------------
const RANGES = { '24h': 24 * HOUR, '7d': 7 * 24 * HOUR, '30d': 30 * 24 * HOUR, '90d': 90 * 24 * HOUR };

function historyChart(samples, from, now) {
  const W = 880;
  const H = 230;
  const pad = { l: 40, r: 10, t: 10, b: 22 };
  const X = (t) => pad.l + ((t - from) / (now - from)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - Math.min(Math.max(v, 0), 100) / 100) * (H - pad.t - pad.b);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': T('hist.title') });
  for (const v of [0, 25, 50, 75, 100]) {
    svg.append(s('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v) }));
    if (v % 50 === 0) svg.append(s('text', { class: 'axis', x: pad.l - 6, y: Y(v) + 3, 'text-anchor': 'end' }, `${v}%`));
  }
  for (let i = 0; i < 5; i++) {
    const tm = from + ((now - from) * i) / 4;
    const label = histRange === '24h' ? I18n.time(tm, ui.lang) : I18n.date(tm, ui.lang);
    svg.append(s('text', { class: 'axis', x: X(tm), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, label));
  }
  // A line only joins readings of the same window: a reset is a gap, not a slope.
  const path = (key, resetKey) => {
    let d = '';
    let prev = null;
    for (const p of samples) {
      if (p[key] == null) { prev = null; continue; }
      const joined = prev && prev[resetKey] === p[resetKey];
      d += `${joined ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p[key]).toFixed(1)}`;
      prev = p;
    }
    return d;
  };
  svg.append(s('path', { class: 'line s2', d: path('w', 'wr') }), s('path', { class: 'line s1', d: path('s', 'sr') }));
  // Isolated readings have no segment: draw them as dots so nothing is invisible.
  if (samples.length <= 40) {
    for (const p of samples) {
      if (p.w != null) svg.append(s('circle', { class: 'pt s2', cx: X(p.t), cy: Y(p.w), r: 3 }));
      if (p.s != null) svg.append(s('circle', { class: 'pt s1', cx: X(p.t), cy: Y(p.s), r: 3 }));
    }
  }
  const hover = s('g', { visibility: 'hidden' });
  const cross = s('line', { class: 'cross', y1: pad.t, y2: H - pad.b });
  const d2 = s('circle', { class: 'pt s2', r: 4 });
  const d1 = s('circle', { class: 'pt s1', r: 4 });
  hover.append(cross, d2, d1);
  svg.append(hover);
  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const tm = from + ((((e.clientX - rect.left) / rect.width) * W - pad.l) / (W - pad.l - pad.r)) * (now - from);
    let best = null;
    for (const p of samples) if (!best || Math.abs(p.t - tm) < Math.abs(best.t - tm)) best = p;
    if (!best) return;
    hover.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', X(best.t));
    cross.setAttribute('x2', X(best.t));
    for (const [dot, v] of [[d1, best.s], [d2, best.w]]) {
      dot.setAttribute('visibility', v == null ? 'hidden' : 'inherit');
      if (v != null) { dot.setAttribute('cx', X(best.t)); dot.setAttribute('cy', Y(v)); }
    }
    showTip(e, h('div', 't', I18n.dayTime(best.t, ui.lang)),
      h('div', 'r', h('span', 'swatch'), T('bar.session'), h('b', '', best.s == null ? '–' : I18n.pct(best.s, ui.lang))),
      h('div', 'r', h('span', 'swatch s2'), T('bar.week'), h('b', '', best.w == null ? '–' : I18n.pct(best.w, ui.lang))));
  });
  svg.addEventListener('pointerleave', () => { hover.setAttribute('visibility', 'hidden'); hideTip(); });
  return svg;
}

function paneHistory(pane) {
  const p = current();
  if (!p) return;
  const card = h('div', 'card');
  const seg = h('div', 'seg');
  for (const key of Object.keys(RANGES)) {
    const b = button(T(`hist.${key}`), 'small', () => { histRange = key; render(); });
    b.setAttribute('aria-pressed', String(key === histRange));
    seg.append(b);
  }
  const viewBtn = button(T(histTable ? 'hist.chart' : 'hist.table'), 'small', () => { histTable = !histTable; render(); });
  const exportBtn = button(T('export.csv'), 'small', async () => {
    if (await widget.exportCsv('history', p.id)) flash(exportBtn, T('export.done'), T('export.csv'));
  });
  card.append(h('h3', '', T('hist.title'), h('span', 'spacer'), seg, viewBtn, exportBtn));

  if (p.kind === 'api') {
    card.append(h('p', 'empty', T('hist.api')));
    pane.append(card);
    return;
  }
  const from = data.now - RANGES[histRange];
  const samples = p.history.filter((x) => x.t >= from);
  if (!samples.length) {
    card.append(h('p', 'empty', T('hist.empty')));
    pane.append(card);
    return;
  }
  if (histTable) {
    const table = h('table');
    table.append(h('thead', '', h('tr', '', h('th', '', T('col.time')), h('th', 'n', T('bar.session')), h('th', 'n', T('bar.week')))));
    const body = h('tbody');
    for (const x of samples.slice(-400).reverse()) {
      body.append(h('tr', '', h('td', '', I18n.dayTime(x.t, ui.lang)),
        h('td', 'n', x.s == null ? '–' : I18n.pct(x.s, ui.lang)), h('td', 'n', x.w == null ? '–' : I18n.pct(x.w, ui.lang))));
    }
    table.append(body);
    card.append(h('div', 'scroll', table));
  } else {
    card.append(h('div', 'legend', h('span', '', h('span', 'swatch'), T('bar.session')), h('span', '', h('span', 'swatch s2'), T('bar.week'))));
    card.append(h('div', 'chart-wrap', historyChart(samples, from, data.now)));
  }
  pane.append(card);

  let peakS = 0;
  let peakW = 0;
  const hot = new Set();
  for (const x of samples) {
    if (x.s != null) { peakS = Math.max(peakS, x.s); if (x.s >= ui.danger && x.sr) hot.add(x.sr); }
    if (x.w != null) peakW = Math.max(peakW, x.w);
  }
  const tile = (k, v) => h('div', 'card tile', h('div', 'k', k), h('div', 'v', v));
  pane.append(h('div', 'grid tiles', tile(T('hist.peakSession'), I18n.pct(peakS, ui.lang)), tile(T('hist.peakWeekly'), I18n.pct(peakW, ui.lang)),
    tile(T('hist.hot', { pct: ui.danger }), String(hot.size))));
}

// ---- tips --------------------------------------------------------------------------
function paneTips(pane) {
  const p = current();
  if (!p) return;
  pane.append(h('h3', 'muted', T('tips.title')));
  if (!p.insights.length) {
    pane.append(h('div', 'card', h('p', 'empty', T('tips.none'))));
    return;
  }
  for (const x of p.insights) {
    const vars = { ...x.vars };
    if (x.id === 'peakSlot') vars.day = T(`dayLong.${vars.day}`);
    pane.append(h('div', 'card tip',
      h('span', `lvl ${x.level}`, T(`tips.level.${x.level}`)),
      h('div', '', h('h4', '', T(`tip.${x.id}.title`)), h('p', '', T(`tip.${x.id}.text`, vars)))));
  }
}

// ---- settings ------------------------------------------------------------------------
function flash(node, text, back) {
  node.textContent = text;
  setTimeout(() => { node.textContent = back; }, 1800);
}

let savedMark = null;
async function save(patch) {
  const next = { ...data.settings, ...patch };
  delete next.detected;
  data.settings = await widget.saveSettings(next);
  await load();
  if (savedMark) {
    savedMark.classList.add('on');
    setTimeout(() => savedMark && savedMark.classList.remove('on'), 1500);
  }
}

function checkbox(key, label) {
  const input = h('input');
  input.type = 'checkbox';
  input.checked = Boolean(data.settings[key]);
  input.addEventListener('change', () => save({ [key]: input.checked }));
  const lab = h('label', '', label);
  input.id = `set-${key}`;
  lab.htmlFor = input.id;
  return h('div', 'form-row', lab, input);
}

function select(key, label, options) {
  const sel = h('select');
  for (const [value, text] of options) {
    const o = h('option', '', text);
    o.value = value;
    sel.append(o);
  }
  sel.value = data.settings[key];
  sel.addEventListener('change', () => save({ [key]: sel.value }));
  sel.id = `set-${key}`;
  const lab = h('label', '', label);
  lab.htmlFor = sel.id;
  return h('div', 'form-row', lab, sel);
}

function number(key, label) {
  const input = h('input');
  input.type = 'number';
  input.min = 1;
  input.max = 99;
  input.value = data.settings[key];
  input.addEventListener('change', () => save({ [key]: Number(input.value) }));
  input.id = `set-${key}`;
  const lab = h('label', '', label);
  lab.htmlFor = input.id;
  return h('div', 'form-row', lab, input, h('span', 'muted', '%'));
}

function relayRow(p) {
  const r = p.relay;
  const row = h('div', 'relay');
  if (!r) return row;
  const stateKey = r.mode === 'ours' ? (r.chained ? 'set.relay.oursChained' : 'set.relay.ours') : `set.relay.${r.mode}`;
  row.append(h('span', '', T('set.relay'), ' : '), h('span', `state ${r.mode === 'ours' ? 'ok' : 'todo'}`, T(stateKey)));
  row.append(h('span', '', '· ', r.lastRelayAt ? T('set.relay.last', { ago: I18n.ago(r.lastRelayAt, data.now, ui.lang) }) : T('set.relay.never')));
  row.append(h('span', 'spacer'));
  if (r.mode === 'ours') {
    row.append(button(T('set.relay.uninstall'), 'small', async () => { await widget.uninstallRelay(p.id); await load(); }));
  } else if (r.canInstall) {
    const b = button(T('set.relay.install'), 'small primary', async () => {
      const res = await widget.installRelay(p.id);
      if (!res || !res.ok) flash(b, T('set.relay.failed'), T('set.relay.install'));
      await load();
    });
    b.dataset.relayInstall = p.id;
    row.append(b);
  }
  return row;
}

function paneSettings(pane) {
  const st = data.settings;
  const explicit = st.profiles.length > 0;
  const byId = new Map(data.profiles.map((p) => [p.id, p]));

  // Profiles
  const pc = h('div', 'card', h('h3', '', T('set.profiles'), h('span', 'spacer'), (savedMark = h('span', 'saved', T('set.saved')))));
  pc.append(h('p', 'hint', T('set.profilesHint')));
  const list = st.detected.map((p) => ({ name: p.name, dir: p.dir, kind: p.kind }));
  const commit = () => save({ profiles: list });
  st.detected.forEach((p, i) => {
    const full = byId.get(p.id);
    const name = h('input');
    name.type = 'text';
    name.value = p.name;
    name.setAttribute('aria-label', T('set.name'));
    name.addEventListener('change', () => { list[i].name = name.value; commit(); });
    const kind = h('select');
    for (const [v, k] of [['forfait', 'set.kind.plan'], ['api', 'set.kind.api']]) {
      const o = h('option', '', T(k));
      o.value = v;
      kind.append(o);
    }
    kind.value = p.kind;
    kind.addEventListener('change', () => { list[i].kind = kind.value; commit(); });
    const dir = h('span', 'dir', p.dir, p.auto ? ` · ${T('set.auto')}` : '');
    dir.title = p.dir;
    const row = h('div', 'prow', name, kind, dir,
      button(T('set.remove'), 'small', () => { list.splice(i, 1); commit(); }));
    if (full && full.kind !== 'api') {
      row.append(relayRow(full));
      if (full.relay && full.relay.snippet) {
        row.append(h('p', 'relay', T('set.relay.snippet')), h('pre', 'snippet', full.relay.snippet));
      }
    }
    pc.append(row);
  });
  if (!st.detected.length) pc.append(h('p', 'muted', T('profile.none')));
  const actions = h('div', 'form-row', h('span', 'lab hint', T('set.relay.explain')),
    button(T('set.add'), '', async () => {
      const picked = await widget.pickProfileFolder();
      if (!picked) return;
      list.push({ name: picked.name, dir: picked.dir, kind: /api/i.test(picked.name) ? 'api' : 'forfait' });
      commit();
    }));
  if (explicit) actions.append(button(T('set.autoDetect'), '', () => save({ profiles: [] })));
  pc.append(actions);
  pane.append(pc);

  // Alerts
  pane.append(h('div', 'card', h('h3', '', T('set.alerts')),
    checkbox('alerts', T('set.alertsOn')), number('warn', T('set.warn')), number('danger', T('set.danger'))));

  // Display
  const shortcutLabel = (a) => a.replace('CommandOrControl', ui.platform === 'darwin' ? '⌘' : 'Ctrl').replace(/\+/g, ' + ');
  pane.append(h('div', 'card', h('h3', '', T('set.display')),
    select('theme', T('set.theme'), [['dark', T('set.theme.dark')], ['light', T('set.theme.light')], ['system', T('set.theme.system')]]),
    select('language', T('set.language'), [['auto', T('set.language.auto')], ['fr', 'Français'], ['en', 'English']]),
    select('shortcut', T('set.shortcut'), [['', T('set.shortcut.off')],
      ...['CommandOrControl+Alt+U', 'CommandOrControl+Shift+U', 'CommandOrControl+Alt+A'].map((a) => [a, shortcutLabel(a)])]),
    checkbox('alwaysOnTop', T('set.alwaysOnTop')), checkbox('trayPercent', T('set.trayPercent')),
    checkbox('showCosts', T('set.showCosts')), checkbox('showCodex', T('set.showCodex')), checkbox('autoStart', T('set.autoStart'))));

  // Price table
  const pr = data.pricing;
  pane.append(h('div', 'card', h('h3', '', T('set.pricing')),
    h('p', 'hint', T('set.pricing.hint')),
    h('div', 'form-row', h('span', 'lab', T(`set.pricing.${pr.source}`), ` · ${pr.models}`),
      button(T('set.pricing.edit'), '', async () => { await widget.editPricing(); await load(); }),
      button(T('set.pricing.reload'), '', async () => { await widget.reloadPricing(); await load(); }))));

  // Report
  const range = h('select');
  for (const [v, text] of [['month', T('set.report.current')], ['last30', T('hist.30d')]]) {
    const o = h('option', '', text);
    o.value = v;
    range.append(o);
  }
  const reportBtn = button(T('export.report'), 'primary', async () => {
    if (await widget.exportReport(range.value)) flash(reportBtn, T('export.done'), T('export.report'));
  });
  pane.append(h('div', 'card', h('h3', '', T('set.report')), h('div', 'form-row', h('span', 'lab hint', T('export.reportHint')), range, reportBtn)));
  pane.append(h('p', 'hint', T('set.privacy')));
}

// ---- shell -----------------------------------------------------------------------------
const PANES = {
  overview: paneOverview,
  projects: (pane) => paneTable(pane, 'projects'),
  models: (pane) => paneTable(pane, 'models'),
  habits: paneHabits,
  history: paneHistory,
  tips: paneTips,
  settings: paneSettings
};

function render() {
  if (!data) return;
  ui = data.ui;
  document.documentElement.lang = ui.lang;
  document.body.className = `theme-${ui.theme}`;
  document.title = T('dash.title');
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = T(n.dataset.i18n); });
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));

  if (!data.profiles.some((p) => p.id === profileId)) profileId = data.profiles[0] ? data.profiles[0].id : null;
  const sel = $('profileSelect');
  sel.replaceChildren(...data.profiles.map((p) => {
    const o = h('option', '', p.name);
    o.value = p.id;
    return o;
  }));
  sel.value = profileId || '';
  $('profilePick').hidden = data.profiles.length < 2 || tab === 'settings';

  hideTip();
  const pane = $('pane');
  const scroll = pane.scrollTop;
  pane.replaceChildren();
  PANES[tab](pane);
  pane.scrollTop = scroll;
}

async function load() {
  data = await widget.getDashboard();
  render();
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  $('pane').scrollTop = 0;
  render();
});
$('profileSelect').addEventListener('change', (e) => { profileId = e.target.value; render(); });

// New figures after each poll — but never rebuild a form the user is typing in.
widget.onUsage(() => {
  const typing = tab === 'settings' && document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName);
  if (!typing) load();
});

load();
