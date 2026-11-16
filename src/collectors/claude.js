/**
 * Claude Code usage of one profile, from its local transcripts
 * (<profile dir>/projects/**\/*.jsonl). Read-only, no credentials, no network.
 *
 * Each assistant reply carries message.usage. Streaming can write the same
 * message on several lines, so entries are de-duplicated on message.id+requestId.
 * Periods match the Herdr panel: today, 7 days (today + 6 previous days), month.
 */
const path = require('path');
const { listJsonl, createTail } = require('./jsonl');
const { costOf } = require('./pricing');

const FIVE_H = 5 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

function periodStarts(now) {
  const d = new Date(now);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const week = day - 6 * DAY;
  const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return { day, week, month, since: Math.min(week, month) };
}

function createClaudeCollector({ dir }) {
  const root = path.join(dir, 'projects');
  const tail = createTail();
  const seen = new Set();
  let entries = []; // { t, model, input, output, cacheWrite, cacheRead, cost }
  let unpriced = 0;

  function onRecord(r) {
    if (r.type !== 'assistant' || !r.message || !r.message.usage) return;
    const key = `${r.message.id}:${r.requestId || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const u = r.message.usage;
    const t = Date.parse(r.timestamp);
    if (!Number.isFinite(t)) return;
    const model = r.message.model || 'unknown';
    const cost = costOf(model, u);
    if (cost === null && model !== '<synthetic>') unpriced++;
    entries.push({
      t, model,
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cost: cost || 0
    });
  }

  function sum(list) {
    const s = { cost: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 0 };
    for (const e of list) {
      s.cost += e.cost; s.input += e.input; s.output += e.output;
      s.cacheWrite += e.cacheWrite; s.cacheRead += e.cacheRead; s.messages++;
    }
    s.tokens = s.input + s.output + s.cacheWrite + s.cacheRead;
    return s;
  }

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

  function poll(now = Date.now()) {
    const p = periodStarts(now);
    tail.readNew(listJsonl(root), onRecord, { minMtimeMs: p.since });
    entries = entries.filter((e) => e.t >= p.since).sort((a, b) => a.t - b.t);

    const models = {};
    for (const e of entries) {
      if (e.t < p.month) continue;
      const m = (models[e.model] ||= { cost: 0, messages: 0 });
      m.cost += e.cost; m.messages++;
    }
    const block = currentBlock(now);
    return {
      available: entries.length > 0,
      today: sum(entries.filter((e) => e.t >= p.day)),
      week: sum(entries.filter((e) => e.t >= p.week)),
      month: sum(entries.filter((e) => e.t >= p.month)),
      session: block ? { ...sum(entries.filter((e) => e.t >= block.start)), start: block.start, resetsAt: block.end } : null,
      models,
      unpriced,
      lastActivity: entries.length ? entries[entries.length - 1].t : null
    };
  }

  return { poll };
}

module.exports = { createClaudeCollector };
