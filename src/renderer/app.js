const $ = (id) => document.getElementById(id);

let ui = { lang: 'fr', theme: 'dark', warn: 75, danger: 90, showCosts: true };
const T = (key, vars) => I18n.t(ui.lang, key, vars);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmtReset(ms, now, approx) {
  if (!ms) return '';
  if (ms - now <= 0) return T('reset.done');
  return (approx ? '≈ ' : '') + T('reset.in', { left: I18n.left(ms - now, ui.lang), when: I18n.when(ms, now, ui.lang) });
}

/**
 * One usage bar.
 * g: { pct, official?, estimated?, resetsAt, approxReset?, stale? } — windowMs draws the even-pace marker.
 */
function bar(label, g, now, windowMs) {
  const box = el('div', 'bar');
  const row = el('div', 'row');
  row.append(el('span', 'label', label));
  if (!g) {
    row.append(el('span', 'value', '–'));
    box.append(row);
    return box;
  }
  const p = Math.max(0, Math.min(100, g.pct));
  const level = p >= ui.danger ? 'danger' : p >= ui.warn ? 'warn' : '';
  const value = el('span', 'value', (g.estimated ? '≈ ' : '') + I18n.pct(p, ui.lang));
  if (g.estimated) value.title = T('bar.estimated', { official: Math.round(g.official) });
  row.append(value);

  const track = el('div', 'track');
  const official = g.estimated ? Math.max(0, Math.min(100, g.official)) : p;
  const fill = el('div', `fill ${level}`);
  fill.style.width = `${official}%`;
  track.append(fill);
  if (g.estimated && p > official) {
    // Lighter segment: what local activity adds on top of the last official reading.
    const est = el('div', `fill est ${level}`);
    est.style.left = `${official}%`;
    est.style.width = `${p - official}%`;
    track.append(est);
  }
  if (g.resetsAt && windowMs && !g.stale) {
    const elapsed = 1 - (g.resetsAt - now) / windowMs;
    if (elapsed > 0 && elapsed < 1) {
      const m = el('div', 'pace');
      m.title = T('bar.pace');
      m.style.left = `${elapsed * 100}%`;
      track.append(m);
    }
  }
  box.append(row, track, el('div', 'reset', g.stale ? T('reset.stale') : fmtReset(g.resetsAt, now, g.approxReset)));
  return box;
}

function forecastLine(c, now) {
  const f = c.forecast || {};
  const s = f.session;
  let text = '';
  let level = '';
  if (s && s.status === 'limit') { text = T('forecast.limit'); level = 'danger'; }
  else if (s && s.status === 'will_hit') { text = T('forecast.hit', { time: I18n.time(s.hitAt, ui.lang) }); level = 'warn'; }
  else if (f.weekly && f.weekly.status === 'limit') { text = T('forecast.limit'); level = 'danger'; }
  else if (f.weekly && f.weekly.status === 'will_hit') { text = T('forecast.weekHit', { time: I18n.when(f.weekly.hitAt, now, ui.lang) }); level = 'warn'; }
  else if (s && s.status === 'ok') text = T('forecast.ok', { pct: Math.round(s.projectedAtReset) });
  else if (f.budget != null) text = T('forecast.budget', { pct: Math.round(f.budget) });
  return text ? el('p', `forecast ${level}`, text) : null;
}

function profileCard(c, now) {
  const sec = el('section', 'provider claude');
  const h = el('h2');
  h.append(el('span', 'dot'), document.createTextNode(c.name),
    el('span', `tag ${c.kind === 'api' ? 'api' : ''}`, T(c.kind === 'api' ? 'tag.api' : 'tag.plan')));
  sec.append(h);

  const o = c.official || {};
  if (c.kind !== 'api') {
    if (o.available) {
      sec.append(bar(T('bar.session'), c.session, now, 5 * 3600e3), bar(T('bar.week'), c.weekly, now, 7 * 24 * 3600e3));
      const line = forecastLine(c, now);
      if (line) sec.append(line);
    } else if (c.relay && c.relay.mode === 'none') {
      const p = el('p', 'empty', T('quota.none') + ' · ');
      const link = el('button', 'link', T('quota.enable'));
      link.addEventListener('click', () => widget.openDashboard());
      p.append(link);
      sec.append(p);
    } else {
      sec.append(el('p', 'empty', T(o.relaySeen ? 'quota.noLimits' : 'quota.open')));
    }
  }

  const l = c.local || {};
  if (l.available && ui.showCosts) {
    const costs = el('div', 'costs');
    for (const [k, b] of [[T('cost.today'), l.today], [T('cost.week'), l.week], [T('cost.month'), l.month]]) {
      const cell = el('div');
      cell.append(el('div', 'k', k), el('div', 'v', I18n.usd(b.cost)), el('div', 's', `${I18n.tokens(b.tokens, ui.lang)} ${T('unit.tok')}`));
      costs.append(cell);
    }
    sec.append(costs);
  }

  const meta = [];
  if (o.observedAt && o.available) meta.push(T('meta.quota', { ago: I18n.ago(o.observedAt, now, ui.lang) }));
  if (l.lastActivity) meta.push(T('meta.activity', { ago: I18n.ago(l.lastActivity, now, ui.lang) }));
  if (meta.length) sec.append(el('p', 'meta', meta.join(' · ')));
  if (l.unpricedModels && l.unpricedModels.length && ui.showCosts) {
    const warn = el('p', 'meta warn-text', T('meta.unpriced', { n: l.unpricedModels.length }));
    warn.title = l.unpricedModels.join(', ');
    sec.append(warn);
  }
  return sec;
}

function codexName(w) {
  if (!w || !w.windowMinutes) return T('bar.limit');
  const min = w.windowMinutes;
  if (min <= 300) return T('bar.sessionH', { n: Math.round(min / 60) });
  if (min <= 10080) return T('bar.weekD', { n: Math.round(min / 1440) });
  return T('bar.month', { n: Math.round(min / 1440) });
}

function render(d) {
  const now = d.now;
  ui = d.ui || ui;
  document.documentElement.lang = ui.lang;
  document.body.className = `theme-${ui.theme}`;
  document.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = T(n.dataset.i18nTitle); });

  // Claude: one card per profile
  const box = $('claude-profiles');
  if (d.claude.length) box.replaceChildren(...d.claude.map((c) => profileCard(c, now)));
  else {
    const sec = el('section', 'provider claude');
    sec.append(el('p', 'empty', T('profile.none')));
    box.replaceChildren(sec);
  }
  const total = d.claude.reduce((s, c) => s + (c.local && c.local.available ? c.local.month.cost : 0), 0);
  const totalBox = $('claude-total');
  totalBox.replaceChildren();
  if (d.claude.length > 1 && ui.showCosts) totalBox.append(el('span', '', T('cost.total')), el('b', '', I18n.usd(total)));

  // Codex
  const x = d.codex;
  $('codex').hidden = Boolean(x.hidden);
  const xb = $('codex-bars');
  xb.replaceChildren();
  $('codex-plan').textContent = x.plan ? `· ${x.plan}` : '';
  if (x.available) {
    const g = (w) => ({ pct: w.usedPercent, resetsAt: w.resetsAt, stale: w.stale });
    if (x.primary) xb.append(bar(codexName(x.primary), g(x.primary), now, x.primary.windowMinutes * 60e3));
    if (x.secondary) xb.append(bar(codexName(x.secondary), g(x.secondary), now, x.secondary.windowMinutes * 60e3));
    $('codex-meta').textContent = x.observedAt ? T('codex.measured', { ago: I18n.ago(x.observedAt, now, ui.lang) }) : '';
  } else {
    xb.append(el('p', 'empty', T('codex.none')));
    $('codex-meta').textContent = '';
  }

  $('footer').textContent = T('app.footer', { time: I18n.time(now, ui.lang) });
  requestAnimationFrame(() => widget.resize($('card').offsetHeight + 12));
}

widget.onUsage(render);
$('dashboard').addEventListener('click', () => widget.openDashboard());
$('refresh').addEventListener('click', () => widget.refresh());
$('hide').addEventListener('click', () => widget.hide());
$('quit').addEventListener('click', () => widget.quit());
