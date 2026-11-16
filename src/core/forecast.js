/**
 * forecast.js — "at the current pace, when is the limit reached?"
 * Pure functions (no Electron, no file access): unit-tested.
 */
const HOUR = 3600 * 1000;
const SESSION_WINDOW_MS = 5 * HOUR;
const WEEKLY_WINDOW_MS = 7 * 24 * HOUR;

/**
 * @param {object} p
 * @param {number} p.utilization   current usage, 0-100
 * @param {number|null} p.resetsAt end of the current window (ms)
 * @param {number} p.windowMs      window length
 * @param {number} p.now
 * @param {number|null} [p.recentRatePerMs]  measured recent pace (percent per ms), if known
 * @returns {null|{status:'limit'|'will_hit'|'ok', hitAt:number|null, projectedAtReset:number,
 *          pacePct:number, ratePerHour:number}}
 */
function computeForecast({ utilization, resetsAt, windowMs, now, recentRatePerMs = null }) {
  if (!Number.isFinite(utilization) || !Number.isFinite(resetsAt)) return null;
  const remaining = resetsAt - now;
  if (remaining <= 0) return null;

  const elapsed = Math.min(Math.max(windowMs - remaining, 0), windowMs);
  const pacePct = (elapsed / windowMs) * 100; // where usage would be at an even pace
  if (utilization >= 100) return { status: 'limit', hitAt: null, projectedAtReset: 100, pacePct, ratePerHour: 0 };

  const avgRate = elapsed > 0 ? utilization / elapsed : 0;
  // Blend: recent behaviour matters, but one quiet or busy stretch must not
  // swing the projection on its own.
  const rate = recentRatePerMs == null ? avgRate : (Math.max(recentRatePerMs, 0) + avgRate) / 2;

  if (rate > 0) {
    const hitAt = now + (100 - utilization) / rate;
    if (hitAt < resetsAt) return { status: 'will_hit', hitAt, projectedAtReset: 100, pacePct, ratePerHour: rate * HOUR };
  }
  return {
    status: 'ok',
    hitAt: null,
    projectedAtReset: Math.min(utilization + rate * remaining, 100),
    pacePct,
    ratePerHour: rate * HOUR
  };
}

/**
 * Share of the weekly quota that can still be spent today while keeping an
 * even pace until the reset: remaining quota / remaining days (today included).
 */
function dailyBudget({ utilization, resetsAt, now }) {
  if (!Number.isFinite(utilization) || !Number.isFinite(resetsAt) || resetsAt <= now) return null;
  const daysLeft = Math.max((resetsAt - now) / (24 * HOUR), 1);
  return Math.max(100 - utilization, 0) / daysLeft;
}

module.exports = { computeForecast, dailyBudget, SESSION_WINDOW_MS, WEEKLY_WINDOW_MS };
