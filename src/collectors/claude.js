/**
 * Claude Code usage of one profile, from its local transcripts
 * (<profile dir>/projects/**\/*.jsonl). Read-only, no credentials, no network.
 *
 * Only counters are kept (time, model, token counts, project folder, session
 * id). Message text is never stored, logged or sent to the interface.
 *
 * Each assistant reply carries message.usage. Streaming can write the same
 * message on several lines, so entries are de-duplicated on message.id+requestId.
 * Periods match the Herdr panel: today, 7 days (today + 6 previous days), month.
 */
const path = require('path');
const { listJsonl, createTail } = require('./jsonl');
const pricingModule = require('./pricing');

const FIVE_H = 5 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const KEEP = 35 * DAY; // month-to-date always fits, plus 5 full weeks for the habits map
const ACTIVE_MS = 15 * 60 * 1000;

function periodStarts(now) {
  const d = new Date(now);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { day, week: day - 6 * DAY, month: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
}

function projectOf(record, file, root) {
  if (typeof record.cwd === 'string' && record.cwd) {
    return record.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || record.cwd;
  }
  // Fallback: the transcript's folder name (an encoded path such as "C--Users-me-app").
  const rel = path.relative(root, file).split(path.sep)[0] || 'unknown';
  return rel.replace(/^[A-Za-z]--/, '').split('-').filter(Boolean).pop() || rel;
}

function createClaudeCollector({ dir, pricing = pricingModule }) {
  const root = path.join(dir, 'projects');
  const tail = createTail();
  let seen = new Set();
  let entries = []; // { t, model, input, output, cacheWrite, cacheRead, cost, priced, project, sid, key }
  let dirty = false;
  let price = pricing;

  function onRecord(r, file) {
    if (r.type !== 'assistant' || !r.message || !r.message.usage) return;
    const key = `${r.message.id}:${r.requestId || ''}`;
    if (seen.has(key)) return;
    const u = r.message.usage;
    const t = Date.parse(r.timestamp);
    if (!Number.isFinite(t)) return;
    seen.add(key);
    const model = r.message.model || 'unknown';
    const cost = price.costOf(model, u);
    entries.push({
      t, model, key,
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      usage1h: (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0,
      cost: cost || 0,
      priced: cost !== null || model === '<synthetic>',
      project: projectOf(r, file, root),
      sid: r.sessionId || path.basename(file, '.jsonl')
    });
    dirty = true;
  }

  /** Re-price everything already in memory (after the price table changed). */
  function setPricing(next) {
    price = next;
    for (const e of entries) {
      const cost = price.costOf(e.model, {
        input_tokens: e.input, output_tokens: e.output, cache_read_input_tokens: e.cacheRead,
        cache_creation_input_tokens: e.cacheWrite, cache_creation: { ephemeral_1h_input_tokens: e.usage1h }
      });
      e.cost = cost || 0;
      e.priced = cost !== null || e.model === '<synthetic>';
    }
  }

  function sum(list) {
    const s = { cost: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 0, unpriced: 0 };
    for (const e of list) {
      s.cost += e.cost; s.input += e.input; s.output += e.output;
      s.cacheWrite += e.cacheWrite; s.cacheRead += e.cacheRead; s.messages++;
      if (!e.priced) s.unpriced++;
    }
    s.tokens = s.input + s.output + s.cacheWrite + s.cacheRead;
    return s;
  }

  const since = (t) => {
    // entries are sorted: binary search for the first entry at or after t
    let lo = 0;
    let hi = entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid].t < t) lo = mid + 1; else hi = mid;
    }
    return entries.slice(lo);
  };

  /** 5-hour window: opens with the first message after the previous one expired. */
  function currentBlock(now) {
    let start = null;
    for (const e of entries) {
      if (start === null || e.t >= start + FIVE_H) {
        const s = new Date(e.t); s.setMinutes(0, 0, 0); start = s.getTime();
      }
    }
    return start !== null && now < start + FIVE_H ? { start, end: start + FIVE_H } : null;
  }

  /** Read what was appended since the last poll. */
  async function poll(now = Date.now()) {
    await tail.readNew(await listJsonl(root), onRecord, { minMtimeMs: now - KEEP, mustContain: '"usage"' });
    const cutoff = now - KEEP;
    if (dirty || (entries.length && entries[0].t < cutoff)) {
      entries = entries.filter((e) => e.t >= cutoff).sort((a, b) => a.t - b.t);
      seen = new Set(entries.map((e) => e.key)); // bounded: only what is still in memory
      dirty = false;
    }
    return summary(now);
  }

  /** Light figures for the widget. */
  function summary(now = Date.now()) {
    const p = periodStarts(now);
    const month = since(p.month);
    const unpricedModels = [...new Set(month.filter((e) => !e.priced).map((e) => e.model))];
    const block = currentBlock(now);
    return {
      available: entries.length > 0,
      today: sum(since(p.day)),
      week: sum(since(p.week)),
      month: sum(month),
      session: block ? { ...sum(since(block.start)), start: block.start, resetsAt: block.end } : null,
      unpricedModels,
      lastActivity: entries.length ? entries[entries.length - 1].t : null
    };
  }

  /** Estimated cost of what was used in [from, to). */
  function costBetween(from, to) {
    let total = 0;
    for (const e of since(from)) {
      if (e.t >= to) break;
      total += e.cost;
    }
    return total;
  }

  function groupBy(list, keyFn) {
    const map = new Map();
    for (const e of list) {
      const k = keyFn(e);
      const g = map.get(k) || { name: k, cost: 0, tokens: 0, output: 0, messages: 0, unpriced: 0, lastT: 0 };
      g.cost += e.cost;
      g.tokens += e.input + e.output + e.cacheWrite + e.cacheRead;
      g.output += e.output;
      g.messages++;
      if (!e.priced) g.unpriced++;
      if (e.t > g.lastT) g.lastT = e.t;
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  }

  /** Heavier breakdowns for the dashboard and the report. */
  function details(now = Date.now(), { monthStart = null, monthEnd = null } = {}) {
    const p = periodStarts(now);
    const from = monthStart == null ? p.month : monthStart;
    const to = monthEnd == null ? now + 1 : monthEnd;
    const month = since(from).filter((e) => e.t < to);

    // Daily series over the last 30 days (local days, zero-filled).
    const daily = [];
    const dayIndex = new Map();
    for (let i = 29; i >= 0; i--) {
      const start = p.day - i * DAY;
      const d = new Date(start);
      const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayIndex.set(id, daily.length);
      daily.push({ day: id, start, cost: 0, tokens: 0, messages: 0 });
    }
    // Habits: cost per weekday (0 = Monday) and hour over the last 28 days.
    const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const heatFrom = p.day - 27 * DAY;
    for (const e of since(p.day - 29 * DAY)) {
      const d = new Date(e.t);
      const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const idx = dayIndex.get(id);
      if (idx !== undefined) {
        daily[idx].cost += e.cost;
        daily[idx].tokens += e.input + e.output + e.cacheWrite + e.cacheRead;
        daily[idx].messages++;
      }
      if (e.t >= heatFrom) heatmap[(d.getDay() + 6) % 7][d.getHours()] += e.cost;
    }

    // Sessions with activity in the last 15 minutes.
    const recent = since(now - ACTIVE_MS);
    const bySession = new Map();
    for (const e of recent) {
      const s = bySession.get(e.sid) || { sid: e.sid, project: e.project, model: e.model, messages: 0, output: 0, cost: 0, firstT: e.t };
      s.project = e.project; s.model = e.model; s.messages++; s.output += e.output; s.cost += e.cost;
      s.lastT = e.t;
      s.context = e.input + e.cacheRead + e.cacheWrite; // size of the prompt of the latest reply
      bySession.set(e.sid, s);
    }
    const sessions = [...bySession.values()].sort((a, b) => b.lastT - a.lastT).map((s) => ({
      project: s.project, model: s.model, messages: s.messages, cost: s.cost, lastT: s.lastT, context: s.context,
      outputPerMin: s.output / Math.max((s.lastT - s.firstT) / 60000, 1)
    }));

    // Raw material for the optimisation tips.
    const m = sum(month);
    const promptTokens = m.input + m.cacheRead + m.cacheWrite;
    let bigContext = 0;
    let shortTopTier = 0;
    let topTier = 0;
    for (const e of month) {
      if (e.input + e.cacheRead + e.cacheWrite > 150000) bigContext++;
      if (/fable|mythos|opus/i.test(e.model)) {
        topTier++;
        if (e.output < 300) shortTopTier++;
      }
    }

    return {
      range: { from, to: Math.min(to, now) },
      totals: m,
      projects: groupBy(month, (e) => e.project),
      models: groupBy(month, (e) => e.model),
      daily,
      heatmap,
      sessions,
      stats: {
        cacheHitRate: promptTokens ? m.cacheRead / promptTokens : null,
        bigContextShare: m.messages ? bigContext / m.messages : 0,
        topTierMessages: topTier,
        shortTopTierShare: topTier ? shortTopTier / topTier : 0
      }
    };
  }

  return { poll, summary, details, costBetween, setPricing, size: () => entries.length };
}

module.exports = { createClaudeCollector, periodStarts };
