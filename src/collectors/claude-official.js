/**
 * Official Claude plan usage (%), as Claude Code hands it to the status line.
 * Only present for subscription plans, refreshed on each Claude Code turn.
 *
 * Two local files are understood, the freshest wins:
 *   <dir>/statusline-last.json  raw status line input, written by the relay
 *                               this app can install (see core/statusline.js)
 *   <dir>/rate-limits.json      { at, rate_limits } written by a hand-made
 *                               status line script (v1 format, still supported)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function defaultDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

async function readJson(file) {
  try {
    const [text, st] = await Promise.all([fs.promises.readFile(file, 'utf8'), fs.promises.stat(file)]);
    return { data: JSON.parse(text.replace(/^\uFEFF/, '')), mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

function toMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v; // seconds or ms
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function createClaudeOfficialCollector({ dir = defaultDir() } = {}) {
  function windowOf(w, observedAt, now) {
    if (!w || typeof w.used_percentage !== 'number') return null;
    const resetsAt = toMs(w.resets_at);
    // Window already reset since the snapshot: usage restarted from 0.
    if (resetsAt && now >= resetsAt) return { usedPercent: 0, resetsAt: null, previousResetAt: resetsAt, observedAt, stale: true };
    return { usedPercent: Math.max(0, Math.min(100, w.used_percentage)), resetsAt, observedAt };
  }

  async function poll(now = Date.now()) {
    const [relay, legacy] = await Promise.all([
      readJson(path.join(dir, 'statusline-last.json')),
      readJson(path.join(dir, 'rate-limits.json'))
    ]);
    const candidates = [];
    if (relay && relay.data && relay.data.rate_limits) {
      candidates.push({ rl: relay.data.rate_limits, at: relay.mtimeMs });
    }
    if (legacy && legacy.data && legacy.data.rate_limits) {
      candidates.push({ rl: legacy.data.rate_limits, at: toMs(legacy.data.at) || legacy.mtimeMs });
    }
    if (!candidates.length) {
      // The relay ran but Claude Code sent no rate_limits (API key, or plan without them).
      return { available: false, relaySeen: Boolean(relay), observedAt: relay ? relay.mtimeMs : null };
    }
    const { rl, at } = candidates.sort((a, b) => b.at - a.at)[0];
    return {
      available: Boolean(rl.five_hour || rl.seven_day),
      relaySeen: Boolean(relay),
      fiveHour: windowOf(rl.five_hour, at, now),
      sevenDay: windowOf(rl.seven_day, at, now),
      observedAt: at
    };
  }

  return { poll, dir };
}

module.exports = { createClaudeOfficialCollector };
