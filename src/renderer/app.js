/* global widget */
const $ = (id) => document.getElementById(id);

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function fmtReset(ms, now) {
  if (!ms) return '';
  const d = ms - now;
  if (d <= 0) return 'réinitialisé';
  const h = Math.floor(d / 3600e3);
  const m = Math.floor((d % 3600e3) / 60e3);
  const days = Math.floor(h / 24);
  const left = days >= 1 ? `${days} j ${h % 24} h` : h >= 1 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  const at = new Date(ms);
  const sameDay = at.toDateString() === new Date(now).toDateString();
  const when = sameDay ? fmtTime(ms) : at.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `reset dans ${left} · ${when}`;
}
function fmtAgo(ms, now) {
  if (!ms) return '';
  const m = Math.round((now - ms) / 60e3);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(n);
}

/** One usage bar. windowMs lets us draw the even-pace marker. */
function bar(label, w, now, windowMs) {
  const el = document.createElement('div');
  el.className = 'bar';
  if (!w) {
    el.innerHTML = `<div class="row"><span class="label"></span><span class="value">–</span></div>`;
    el.querySelector('.label').textContent = label;
    return el;
  }
  const p = Math.max(0, Math.min(100, w.usedPercent));
  const level = p >= 90 ? 'danger' : p >= 75 ? 'warn' : '';
  el.innerHTML = `
    <div class="row"><span class="label"></span><span class="value"></span></div>
    <div class="track"><div class="fill ${level}"></div></div>
    <div class="reset"></div>`;
  el.querySelector('.label').textContent = label;
  el.querySelector('.value').textContent = `${Math.round(p)} %`;
  el.querySelector('.fill').style.width = `${p}%`;
  el.querySelector('.reset').textContent = w.stale ? 'fenêtre réinitialisée depuis la dernière mesure' : fmtReset(w.resetsAt, now);
  if (w.resetsAt && windowMs && !w.stale) {
    const elapsed = 1 - (w.resetsAt - now) / windowMs;
    if (elapsed > 0 && elapsed < 1) {
      const m = document.createElement('div');
      m.className = 'pace';
      m.title = 'Rythme régulier';
      m.style.left = `${elapsed * 100}%`;
      el.querySelector('.track').appendChild(m);
    }
  }
  return el;
}

const usd = (n) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function profileCard(c, now) {
  const sec = el('section', 'provider claude');
  const h = el('h2');
  h.append(el('span', 'dot'), document.createTextNode(c.name),
    el('span', `tag ${c.kind === 'api' ? 'api' : ''}`, c.kind === 'api' ? 'facturé' : 'équiv. API'));
  sec.append(h);

  const o = c.official;
  if (c.kind !== 'api') {
    if (o.available) {
      sec.append(bar('Session (5 h)', o.fiveHour, now, 5 * 3600e3), bar('Semaine (7 j)', o.sevenDay, now, 7 * 24 * 3600e3));
    } else {
      sec.append(el('p', 'empty', 'Quota : pas encore de données (ouvrez une session Claude Code sur ce profil)'));
    }
  }

  const l = c.local;
  if (l.available) {
    const costs = el('div', 'costs');
    for (const [k, b] of [["Aujourd'hui", l.today], ['7 jours', l.week], ['Ce mois', l.month]]) {
      const cell = el('div');
      cell.append(el('div', 'k', k), el('div', 'v', usd(b.cost)), el('div', 's', `${fmtTokens(b.tokens)} tok`));
      costs.append(cell);
    }
    sec.append(costs);
  }

  const meta = [];
  if (o.observedAt) meta.push(`quota relevé ${fmtAgo(o.observedAt, now)}`);
  if (l.lastActivity) meta.push(`dernière activité ${fmtAgo(l.lastActivity, now)}`);
  if (meta.length) sec.append(el('p', 'meta', meta.join(' · ')));
  return sec;
}

function render(d) {
  const now = d.now;

  // Claude: one card per profile
  const box = $('claude-profiles');
  box.replaceChildren(...d.claude.map((c) => profileCard(c, now)));
  const total = d.claude.reduce((s, c) => s + (c.local.available ? c.local.month.cost : 0), 0);
  $('claude-total').innerHTML = d.claude.length > 1 ? '<span>Claude · total du mois (estimé)</span><b></b>' : '';
  if (d.claude.length > 1) $('claude-total').querySelector('b').textContent = usd(total);

  // Codex
  const xb = $('codex-bars');
  xb.replaceChildren();
  const x = d.codex;
  $('codex-plan').textContent = x.plan ? `· ${x.plan}` : '';
  if (x.available) {
    const name = (w) => {
      if (!w || !w.windowMinutes) return 'Limite';
      const min = w.windowMinutes;
      if (min <= 300) return `Session (${Math.round(min / 60)} h)`;
      if (min <= 10080) return `Semaine (${Math.round(min / 1440)} j)`;
      return `Mois (${Math.round(min / 1440)} j)`;
    };
    if (x.primary) xb.append(bar(name(x.primary), x.primary, now, x.primary.windowMinutes * 60e3));
    if (x.secondary) xb.append(bar(name(x.secondary), x.secondary, now, x.secondary.windowMinutes * 60e3));
    $('codex-meta').textContent = x.observedAt ? `mesuré ${fmtAgo(x.observedAt, now)} (dernière requête Codex)` : '';
  } else {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Aucune donnée Codex trouvée';
    xb.append(p);
    $('codex-meta').textContent = '';
  }

  $('footer').textContent = `100 % local · aucun réseau · ${fmtTime(now)}`;
  requestAnimationFrame(() => widget.resize(document.getElementById('card').offsetHeight + 12));
}

widget.onUsage(render);
$('refresh').addEventListener('click', () => widget.refresh());
$('hide').addEventListener('click', () => widget.hide());
$('quit').addEventListener('click', () => widget.quit());
