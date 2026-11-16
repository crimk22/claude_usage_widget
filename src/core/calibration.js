/**
 * calibration.js — bridges the gap between two official readings.
 *
 * The official percentage only refreshes when Claude Code answers. In between,
 * the local transcripts still tell how much was consumed. By comparing, on
 * past readings, "percentage gained" with "estimated cost consumed", the app
 * learns a personal ratio (percent per dollar-equivalent) and uses it to
 * extrapolate the gauge. Pure functions; the state is a plain object.
 *
 * Limits, shown in the UI: it is an estimate, and it only sees what this PC
 * logged (usage from claude.ai or another machine is invisible until the next
 * official reading).
 */
const MAX_RATIOS = 40;
const MIN_RATIOS = 3;
const MIN_COST = 0.02; // ignore pairs with almost no local usage: ratio would be noise

function emptyState() {
  return { last: null, ratios: { session: [], weekly: [] } };
}

function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const sameWindow = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 90 * 1000;

/**
 * Feed a new official reading. Returns the updated state (same object shape).
 * @param {object} state
 * @param {{at:number, session:{pct:number, resetsAt:number}|null, weekly:{...}|null}} reading
 * @param {(from:number, to:number) => number} costBetween
 */
function learn(state, reading, costBetween) {
  const next = { last: state.last, ratios: { session: [...state.ratios.session], weekly: [...state.ratios.weekly] } };
  const prev = state.last;
  if (prev && reading.at <= prev.at) return next;

  if (prev) {
    const cost = costBetween(prev.at, reading.at);
    for (const scope of ['session', 'weekly']) {
      const a = prev[scope];
      const b = reading[scope];
      if (!a || !b || !sameWindow(a.resetsAt, b.resetsAt)) continue;
      const gained = b.pct - a.pct;
      if (gained > 0 && cost >= MIN_COST) {
        next.ratios[scope].push(gained / cost);
        if (next.ratios[scope].length > MAX_RATIOS) next.ratios[scope].shift();
      }
    }
  }
  next.last = reading;
  return next;
}

/** Percent per dollar-equivalent for a scope, or null while still learning. */
function ratioOf(state, scope) {
  const list = state.ratios[scope];
  return list.length >= MIN_RATIOS ? median(list) : null;
}

/**
 * Estimated current percentage for one window.
 * @param {object} state
 * @param {'session'|'weekly'} scope
 * @param {{usedPercent:number, observedAt:number, stale?:boolean, previousResetAt?:number}} win official window
 * @param {(from:number, to:number) => number} costBetween
 * @param {number} now
 * @returns {null|{pct:number, added:number}} null when not calibrated or nothing to add
 */
function estimate(state, scope, win, costBetween, now) {
  const k = ratioOf(state, scope);
  if (k == null || !win || typeof win.usedPercent !== 'number') return null;
  // After a reset, count from the reset; otherwise from the official reading.
  const from = win.stale ? (win.previousResetAt || win.observedAt) : win.observedAt;
  if (!Number.isFinite(from)) return null;
  const added = k * costBetween(from, now + 1);
  if (added < 0.5) return null; // nothing meaningful happened since the reading
  return { pct: Math.min(win.usedPercent + added, 100), added };
}

module.exports = { emptyState, learn, ratioOf, estimate, median, MIN_RATIOS };
