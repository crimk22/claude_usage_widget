/**
 * alerts.js — decides which desktop notifications to fire.
 *
 * Pure state machine: (previous flags, current gauges, thresholds) ->
 * (new flags, alerts). Each event fires once per usage window:
 *   warn / danger  usage crossed a threshold
 *   forecast       at this pace the session limit is reached before the reset
 *   reset          a session that was nearly exhausted has just reset
 */
const SCOPES = ['session', 'weekly'];

function emptyFlags() {
  return { session_warn: false, session_danger: false, weekly_warn: false, weekly_danger: false, forecast: null, hotUntil: null };
}

/** Thresholds already exceeded at startup are treated as acknowledged. */
function seedFlags(g, th) {
  const flags = emptyFlags();
  for (const scope of SCOPES) {
    const pct = (g[scope] && g[scope].pct) || 0;
    if (pct >= th.danger) { flags[`${scope}_danger`] = true; flags[`${scope}_warn`] = true; }
    else if (pct >= th.warn) flags[`${scope}_warn`] = true;
  }
  const s = g.session;
  if (s && s.resetsAt) {
    if (s.pct >= th.danger) flags.hotUntil = s.resetsAt;
    if (g.forecast && g.forecast.status === 'will_hit') flags.forecast = s.resetsAt;
  }
  return flags;
}

/**
 * @param {object} prev
 * @param {{session:{pct:number, resetsAt:number|null}|null, weekly:{...}|null,
 *          forecast:null|{status:string, hitAt:number|null}}} g
 * @param {{warn:number, danger:number}} th
 * @param {number} now
 */
function evaluateAlerts(prev, g, th, now) {
  const flags = Object.assign(emptyFlags(), prev);
  const alerts = [];

  // A nearly exhausted session whose reset time has passed: good news first.
  if (flags.hotUntil && now >= flags.hotUntil) {
    alerts.push({ level: 'reset', scope: 'session' });
    flags.hotUntil = null;
  }

  for (const scope of SCOPES) {
    const pct = (g[scope] && g[scope].pct) || 0;
    const warnKey = `${scope}_warn`;
    const dangerKey = `${scope}_danger`;
    if (pct < th.warn) { flags[warnKey] = false; flags[dangerKey] = false; }
    if (pct >= th.danger && !flags[dangerKey]) {
      flags[dangerKey] = true;
      flags[warnKey] = true; // jumped straight to danger: skip the warn alert
      alerts.push({ level: 'danger', scope, pct });
    } else if (pct >= th.warn && !flags[warnKey]) {
      flags[warnKey] = true;
      alerts.push({ level: 'warn', scope, pct });
    }
  }

  const s = g.session;
  if (s && s.resetsAt && s.pct >= th.danger) flags.hotUntil = s.resetsAt;

  // Early warning: once the session is meaningfully used, not yet in danger.
  if (s && s.resetsAt && g.forecast && g.forecast.status === 'will_hit' && g.forecast.hitAt &&
      flags.forecast !== s.resetsAt && s.pct >= 50 && s.pct < th.danger) {
    flags.forecast = s.resetsAt;
    alerts.push({ level: 'forecast', scope: 'session', pct: s.pct, hitAt: g.forecast.hitAt });
  }

  return { flags, alerts };
}

module.exports = { emptyFlags, seedFlags, evaluateAlerts };
