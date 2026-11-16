/**
 * Codex (OpenAI) usage from local rollouts (~/.codex/sessions/**\/*.jsonl).
 * Codex logs "token_count" events that include the official rate-limit
 * percentages sent by OpenAI, so no login is needed. The value is as fresh as
 * the last Codex request.
 */
const os = require('os');
const path = require('path');
const { listJsonl, createTail } = require('./jsonl');

function windowOf(w, observedAt) {
  if (!w || typeof w.used_percent !== 'number') return null;
  return {
    usedPercent: w.used_percent,
    windowMinutes: w.window_minutes || null,
    resetsAt: w.resets_at ? w.resets_at * 1000 : null,
    observedAt
  };
}

function createCodexCollector({ root = path.join(os.homedir(), '.codex', 'sessions') } = {}) {
  const tail = createTail();
  let latest = null; // last token_count event with rate limits

  function onRecord(r) {
    const p = r.payload;
    if (!p || p.type !== 'token_count' || !p.rate_limits) return;
    // Some events carry an empty rate_limits shell: keep the last useful one.
    if (!p.rate_limits.primary && !p.rate_limits.secondary) return;
    const t = Date.parse(r.timestamp) || 0;
    if (latest && t < latest.t) return;
    latest = { t, rl: p.rate_limits, info: p.info };
  }

  function poll(now = Date.now()) {
    tail.readNew(listJsonl(root), onRecord);
    if (!latest) return { source: 'codex-local', available: false };
    const { rl, t } = latest;
    const fix = (w) => {
      const x = windowOf(w, t);
      // Window already reset since the last observation: usage is back to 0.
      if (x && x.resetsAt && now >= x.resetsAt) return { ...x, usedPercent: 0, stale: true };
      return x;
    };
    return {
      source: 'codex-local',
      available: true,
      plan: rl.plan_type || null,
      primary: fix(rl.primary),
      secondary: fix(rl.secondary),
      credits: rl.credits || null,
      limitReached: rl.rate_limit_reached_type || null,
      observedAt: t
    };
  }

  return { poll };
}

module.exports = { createCodexCollector };
