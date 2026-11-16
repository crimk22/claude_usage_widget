/**
 * Claude Code usage from local transcripts (~/.claude/projects/**\/*.jsonl).
 * Read-only, no credentials, no network.
 *
 * Each assistant reply carries message.usage. Streaming can write the same
 * message on several lines, so entries are de-duplicated on message.id+requestId.
 */
const os = require('os');
const path = require('path');
const { listJsonl, createTail } = require('./jsonl');

const FIVE_H = 5 * 3600 * 1000;
const WEEK = 7 * 24 * 3600 * 1000;
const KEEP = 8 * 24 * 3600 * 1000; // keep a bit more than a week in memory

function createClaudeCollector({ root = path.join(os.homedir(), '.claude', 'projects') } = {}) {
  const tail = createTail();
  const seen = new Set();
  let entries = []; // { t, model, input, output, cacheWrite, cacheRead }

  function onRecord(r) {
    if (r.type !== 'assistant' || !r.message || !r.message.usage) return;
    const key = `${r.message.id}:${r.requestId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const u = r.message.usage;
    const t = Date.parse(r.timestamp);
    if (!Number.isFinite(t)) return;
    entries.push({
      t,
      model: r.message.model || 'unknown',
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0
    });
  }

  function sum(list) {
    const s = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: list.length, byModel: {} };
    for (const e of list) {
      s.input += e.input; s.output += e.output; s.cacheWrite += e.cacheWrite; s.cacheRead += e.cacheRead;
      const m = (s.byModel[e.model] ||= { output: 0, messages: 0 });
      m.output += e.output; m.messages += 1;
    }
    s.tokens = s.input + s.output + s.cacheWrite; // cache reads shown apart: they are cheap
    return s;
  }

  /**
   * Claude's 5-hour window opens with the first message after the previous
   * window expired. Start is floored to the hour, like the official counter.
   */
  function currentBlock(now) {
    let start = null;
    for (const e of entries) {
      if (start === null || e.t >= start + FIVE_H) {
        start = new Date(e.t); start.setMinutes(0, 0, 0); start = start.getTime();
      }
    }
    if (start === null || now >= start + FIVE_H) return null;
    return { start, end: start + FIVE_H };
  }

  function poll(now = Date.now()) {
    tail.readNew(listJsonl(root), onRecord, { minMtimeMs: now - KEEP });
    entries = entries.filter((e) => e.t >= now - KEEP).sort((a, b) => a.t - b.t);

    const block = currentBlock(now);
    const inBlock = block ? entries.filter((e) => e.t >= block.start) : [];
    const lastHour = entries.filter((e) => e.t >= now - 3600 * 1000);
    return {
      source: 'claude-local',
      available: entries.length > 0,
      session: block ? { ...sum(inBlock), start: block.start, resetsAt: block.end } : null,
      week: sum(entries.filter((e) => e.t >= now - WEEK)),
      lastHourOutput: sum(lastHour).output,
      lastActivity: entries.length ? entries[entries.length - 1].t : null
    };
  }

  return { poll };
}

module.exports = { createClaudeCollector };
