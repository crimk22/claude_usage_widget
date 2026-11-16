/**
 * history.js — official readings kept over time (pure helpers).
 * A sample is { t, s, w, sr, wr }: reading time, session %, weekly %, and the
 * reset time of each window (ms, or null).
 */
const DAY = 24 * 3600 * 1000;
const MAX_AGE_MS = 90 * DAY;

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

function makeSample(official) {
  const f = official.fiveHour;
  const w = official.sevenDay;
  return {
    t: official.observedAt,
    s: f && !f.stale ? round1(f.usedPercent) : null,
    w: w && !w.stale ? round1(w.usedPercent) : null,
    sr: f && !f.stale ? f.resetsAt : null,
    wr: w && !w.stale ? w.resetsAt : null
  };
}

/** Append a reading if it is newer than the last one; prune old samples. */
function addSample(list, sample, now) {
  const out = (Array.isArray(list) ? list : []).filter((x) => x && now - x.t <= MAX_AGE_MS);
  const last = out[out.length - 1];
  if (!Number.isFinite(sample.t) || (last && sample.t <= last.t)) return out;
  if (sample.s == null && sample.w == null) return out;
  out.push(sample);
  return out;
}

/** Keep at most maxPoints, preserving peaks (highest session % per time bucket). */
function downsample(list, maxPoints) {
  if (!Array.isArray(list) || list.length <= maxPoints) return list || [];
  const first = list[0].t;
  const span = list[list.length - 1].t - first || 1;
  const buckets = new Map();
  for (const item of list) {
    const idx = Math.min(Math.floor(((item.t - first) / span) * maxPoints), maxPoints - 1);
    const cur = buckets.get(idx);
    if (!cur || (item.s || 0) > (cur.s || 0)) buckets.set(idx, item);
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

/** Headline numbers: peaks, sessions that went past the danger threshold, weekly peaks per window. */
function summarize(list, danger) {
  const out = { count: 0, peakSession: 0, peakWeekly: 0, sessionsAtDanger: 0, sessions: 0, weeklyPeaks: [] };
  if (!Array.isArray(list)) return out;
  const hot = new Set();
  const all = new Set();
  const weeks = new Map();
  for (const x of list) {
    out.count++;
    if (x.s != null) {
      if (x.s > out.peakSession) out.peakSession = x.s;
      if (x.sr) { all.add(x.sr); if (x.s >= danger) hot.add(x.sr); }
    }
    if (x.w != null) {
      if (x.w > out.peakWeekly) out.peakWeekly = x.w;
      if (x.wr) weeks.set(x.wr, Math.max(weeks.get(x.wr) || 0, x.w));
    }
  }
  out.sessions = all.size;
  out.sessionsAtDanger = hot.size;
  out.weeklyPeaks = [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([resetsAt, peak]) => ({ resetsAt, peak }));
  return out;
}

function toCsv(list) {
  const iso = (ms) => (ms ? new Date(ms).toISOString() : '');
  const rows = ['reading_iso,session_pct,weekly_pct,session_resets_at_iso,weekly_resets_at_iso'];
  for (const x of Array.isArray(list) ? list : []) {
    rows.push([iso(x.t), x.s == null ? '' : x.s, x.w == null ? '' : x.w, iso(x.sr), iso(x.wr)].join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

module.exports = { makeSample, addSample, downsample, summarize, toCsv, MAX_AGE_MS };
