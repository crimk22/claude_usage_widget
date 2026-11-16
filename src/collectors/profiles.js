/**
 * Claude Code profiles = config directories (~/.claude, ~/.claude-<name>).
 * Either listed in settings.json ("profiles": [{ name, dir, kind }]) or
 * auto-detected: every ~/.claude* folder that has a projects/ sub-folder.
 * kind: "forfait" (subscription, has plan quotas) or "api" (pay per use).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function discover() {
  const home = os.homedir();
  let names = [];
  try {
    names = fs.readdirSync(home).filter((n) => n === '.claude' || n.startsWith('.claude-'));
  } catch { /* ignore */ }
  return names
    .filter((n) => fs.existsSync(path.join(home, n, 'projects')))
    .sort((a, b) => (a === '.claude' ? -1 : b === '.claude' ? 1 : a.localeCompare(b)))
    .map((n) => {
      const suffix = n === '.claude' ? 'Principal' : n.slice('.claude-'.length);
      return {
        name: suffix.charAt(0).toUpperCase() + suffix.slice(1),
        dir: path.join(home, n),
        kind: /api/i.test(suffix) ? 'api' : 'forfait'
      };
    });
}

function resolveProfiles(configured) {
  if (Array.isArray(configured) && configured.length) {
    return configured
      .filter((p) => p && p.dir)
      .map((p) => ({ name: p.name || path.basename(p.dir), dir: expandHome(p.dir), kind: p.kind === 'api' ? 'api' : 'forfait' }));
  }
  return discover();
}

module.exports = { resolveProfiles };
