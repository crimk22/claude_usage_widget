/**
 * report.js — self-contained HTML usage report (no script, no external file).
 * Built from the same local counters as the dashboard.
 */
const I18n = require('./i18n');

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dailyChart(daily, from) {
  const days = daily.filter((d) => d.start + 24 * 3600e3 > from);
  if (!days.length) return '';
  const W = 720;
  const H = 150;
  const pad = { l: 44, r: 8, t: 8, b: 20 };
  const max = Math.max(...days.map((d) => d.cost), 0.01);
  const step = (W - pad.l - pad.r) / days.length;
  const bw = Math.max(Math.min(step - 2, 18), 2);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" width="100%">`;
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + (1 - f) * (H - pad.t - pad.b);
    out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="#e3e0d8"/>`;
    out += `<text x="${pad.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#6b6a65">${esc(I18n.usd(max * f))}</text>`;
  }
  days.forEach((d, i) => {
    const h = (d.cost / max) * (H - pad.t - pad.b);
    const x = pad.l + i * step + (step - bw) / 2;
    const y = H - pad.b - h;
    if (h > 0.5) out += `<path d="M${x},${H - pad.b} V${y + 3} Q${x},${y} ${x + 3},${y} H${x + bw - 3} Q${x + bw},${y} ${x + bw},${y + 3} V${H - pad.b} Z" fill="#c25f3c"><title>${esc(d.day)} · ${esc(I18n.usd(d.cost))}</title></path>`;
    if (i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) {
      out += `<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="10" fill="#6b6a65">${esc(d.day.slice(5))}</text>`;
    }
  });
  return out + '</svg>';
}

function table(rows, head, lang, total) {
  if (!rows.length) return '';
  const body = rows.slice(0, 12).map((r) => {
    const share = total > 0 ? (r.cost / total) * 100 : 0;
    return `<tr><td>${esc(r.name)}${r.unpriced ? ` <em>(${esc(I18n.t(lang, 'col.unpriced'))})</em>` : ''}</td>` +
      `<td class="n">${esc(I18n.usd(r.cost))}</td><td class="n">${esc(I18n.pct(share, lang))}</td>` +
      `<td class="n">${esc(I18n.tokens(r.tokens, lang))}</td><td class="n">${r.messages}</td></tr>`;
  }).join('');
  const T = (k) => esc(I18n.t(lang, k));
  return `<table><thead><tr><th>${esc(head)}</th><th class="n">${T('col.cost')}</th><th class="n">${T('col.share')}</th><th class="n">${T('col.tokens')}</th><th class="n">${T('col.messages')}</th></tr></thead><tbody>${body}</tbody></table>`;
}

function tipText(lang, tip) {
  const vars = { ...tip.vars };
  if (tip.id === 'peakSlot') vars.day = I18n.t(lang, `dayLong.${vars.day}`);
  return { title: I18n.t(lang, `tip.${tip.id}.title`), text: I18n.t(lang, `tip.${tip.id}.text`, vars) };
}

/** @param {object} data  from engine.reportData()  @param {'fr'|'en'} lang */
function buildReport(data, lang) {
  const T = (k, v) => esc(I18n.t(lang, k, v));
  const total = data.profiles.reduce((s, p) => s + p.details.totals.cost, 0);
  const from = data.profiles.length ? Math.min(...data.profiles.map((p) => p.details.range.from)) : data.now;

  const sections = data.profiles.map((p) => {
    const d = p.details;
    const tag = I18n.t(lang, p.kind === 'api' ? 'tag.api' : 'tag.plan');
    if (!d.totals.messages) return `<section><h2>${esc(p.name)} <span class="tag">${esc(tag)}</span></h2><p class="muted">${T('report.noData')}</p></section>`;
    const h = p.historySummary;
    const quota = p.kind !== 'api' && h.count
      ? `<p>${T('report.quota', { s: Math.round(h.peakSession), w: Math.round(h.peakWeekly), hot: h.sessionsAtDanger, pct: data.danger || 90 })}</p>` : '';
    const tips = p.insights.length
      ? `<h3>${T('report.tips')}</h3><ul>${p.insights.map((tip) => { const x = tipText(lang, tip); return `<li><strong>${esc(x.title)}.</strong> ${esc(x.text)}</li>`; }).join('')}</ul>` : '';
    return `<section>
      <h2>${esc(p.name)} <span class="tag">${esc(tag)}</span></h2>
      <div class="tiles">
        <div><span>${T('report.total')}</span><b>${esc(I18n.usd(d.totals.cost))}</b></div>
        <div><span>${T('col.messages')}</span><b>${d.totals.messages}</b></div>
        <div><span>${T('col.tokens')}</span><b>${esc(I18n.tokens(d.totals.tokens, lang))}</b></div>
      </div>
      ${quota}
      <h3>${T('report.daily')}</h3>${dailyChart(d.daily, d.range.from)}
      <h3>${T('report.topProjects')}</h3>${table(d.projects, I18n.t(lang, 'col.project'), lang, d.totals.cost)}
      <h3>${T('report.models')}</h3>${table(d.models, I18n.t(lang, 'col.model'), lang, d.totals.cost)}
      ${tips}
    </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T('report.title')}</title>
<style>
  body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#1f1e1c;background:#faf9f6;margin:0;padding:32px}
  main{max-width:820px;margin:0 auto}
  h1{font-size:24px;margin:0 0 4px}
  h2{font-size:18px;margin:0 0 12px;display:flex;align-items:center;gap:8px}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b6a65;margin:20px 0 6px}
  section{background:#fff;border:1px solid #e3e0d8;border-radius:10px;padding:20px 24px;margin-top:20px;break-inside:avoid}
  .muted,.note{color:#6b6a65}
  .note{font-size:12px;margin-top:24px}
  .tag{font-size:11px;font-weight:400;background:#f0eee8;border-radius:4px;padding:1px 8px;color:#6b6a65}
  .tiles{display:flex;gap:12px}
  .tiles>div{flex:1;border:1px solid #e3e0d8;border-radius:8px;padding:10px 14px}
  .tiles span{display:block;font-size:12px;color:#6b6a65}
  .tiles b{font-size:22px;font-variant-numeric:tabular-nums}
  .hero{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;margin:12px 0 0}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  th{font-size:12px;color:#6b6a65;font-weight:600;text-align:left;border-bottom:1px solid #e3e0d8;padding:4px 6px}
  td{padding:4px 6px;border-bottom:1px solid #f0eee8}
  .n{text-align:right}
  ul{margin:0;padding-left:18px}
  li{margin:4px 0}
  @media print{body{background:#fff;padding:0}section{border-color:#ccc}}
</style></head>
<body><main>
  <h1>${T('report.title')}</h1>
  <p class="muted">${T('report.period', { from: I18n.dateLong(from, lang), to: I18n.dateLong(data.now, lang) })}</p>
  <p class="muted">${T('report.total')}</p>
  <p class="hero">${esc(I18n.usd(total))}</p>
  ${sections || `<p class="muted">${T('report.noData')}</p>`}
  <p class="note">${T('report.generated', { date: I18n.dateLong(data.now, lang) })}</p>
</main></body></html>
`;
}

module.exports = { buildReport };
