/**
 * Official Claude plan usage (%), as Claude Code hands it to the status line.
 * The user's status line script dumps it to ~/.claude/rate-limits.json:
 *   { "at": <epoch s>, "rate_limits": { "five_hour": {used_percentage, resets_at},
 *                                       "seven_day": {...} } }
 * Only present for Pro / Max / Ultra plans, refreshed on each Claude Code turn.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function defaultDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function createClaudeOfficialCollector({ dir = defaultDir() } = {}) {
  const file = path.join(dir, 'rate-limits.json');
  function windowOf(w, observedAt, now) {
    if (!w || typeof w.used_percentage !== 'number') return null;
    const resetsAt = w.resets_at ? w.resets_at * 1000 : null;
    // Window already reset since the snapshot: usage restarted from 0.
    if (resetsAt && now >= resetsAt) return { usedPercent: 0, resetsAt: null, observedAt, stale: true };
    return { usedPercent: w.used_percentage, resetsAt, observedAt };
  }

  function poll(now = Date.now()) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch {
      return { source: 'claude-official', available: false };
    }
    const rl = data.rate_limits || {};
    const at = data.at ? data.at * 1000 : null;
    return {
      source: 'claude-official',
      available: Boolean(rl.five_hour || rl.seven_day),
      fiveHour: windowOf(rl.five_hour, at, now),
      sevenDay: windowOf(rl.seven_day, at, now),
      observedAt: at
    };
  }

  return { poll, file };
}

module.exports = { createClaudeOfficialCollector };
