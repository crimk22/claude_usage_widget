/**
 * settings.js — the app's own settings file (<userData>/settings.json).
 * Everything coming from the interface goes through sanitize(): unknown keys
 * are dropped and every value is checked.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHORTCUTS = ['', 'CommandOrControl+Alt+U', 'CommandOrControl+Shift+U', 'CommandOrControl+Alt+A'];
const DEFAULTS = {
  profiles: [], //        [] = auto-detect every ~/.claude* folder
  warn: 75,
  danger: 90,
  alerts: true, //        threshold + forecast + reset notifications
  theme: 'dark', //       'dark' | 'light' | 'system'
  language: 'auto', //    'auto' | 'fr' | 'en'
  autoStart: false,
  alwaysOnTop: true,
  trayPercent: true,
  showCosts: true,
  showCodex: true,
  shortcut: SHORTCUTS[1],
  position: null
};

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function sanitizeProfiles(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const p of list.slice(0, 12)) {
    if (!p || typeof p.dir !== 'string' || !p.dir.trim()) continue;
    const dir = path.resolve(expandHome(p.dir.trim()));
    if (seen.has(dir)) continue;
    seen.add(dir);
    out.push({
      name: String(p.name || path.basename(dir)).slice(0, 40),
      dir,
      kind: p.kind === 'api' ? 'api' : 'forfait'
    });
  }
  return out;
}

function sanitize(input, base = DEFAULTS) {
  const s = input && typeof input === 'object' ? input : {};
  const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  const int = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
  };
  let warn = int(s.warn, 1, 98, base.warn);
  let danger = int(s.danger, 2, 99, base.danger);
  if (danger <= warn) danger = Math.min(warn + 1, 99);
  if (warn >= danger) warn = danger - 1;
  const pos = s.position;
  return {
    profiles: s.profiles === undefined ? sanitizeProfiles(base.profiles) : sanitizeProfiles(s.profiles),
    warn,
    danger,
    alerts: bool(s.alerts, base.alerts),
    theme: pick(s.theme, ['dark', 'light', 'system'], base.theme),
    language: pick(s.language, ['auto', 'fr', 'en'], base.language),
    autoStart: bool(s.autoStart, base.autoStart),
    alwaysOnTop: bool(s.alwaysOnTop, base.alwaysOnTop),
    trayPercent: bool(s.trayPercent, base.trayPercent),
    showCosts: bool(s.showCosts, base.showCosts),
    showCodex: bool(s.showCodex, base.showCodex),
    shortcut: pick(s.shortcut, SHORTCUTS, base.shortcut),
    position: pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null
  };
}

function createSettingsStore(file) {
  let cache = null;
  function read() {
    if (cache) return cache;
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch { /* first run or unreadable: defaults */ }
    cache = sanitize(raw);
    return cache;
  }
  function write(patch) {
    cache = sanitize({ ...read(), ...patch }, read());
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
      fs.renameSync(tmp, file);
    } catch { /* non-critical */ }
    return cache;
  }
  return { read, write, file };
}

module.exports = { createSettingsStore, sanitize, sanitizeProfiles, expandHome, DEFAULTS, SHORTCUTS };
