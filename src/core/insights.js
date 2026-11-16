/**
 * insights.js — optimisation tips computed locally from counters only.
 * No AI call, no network: plain rules over the month's figures. Each tip is
 * { id, level: 'action'|'info'|'good', vars } and is worded in i18n.js
 * ("tip.<id>.title" / "tip.<id>.text").
 */
function buildInsights({ kind, details, history, official, relay, unpricedModels, thresholds }) {
  const tips = [];
  const add = (id, level, vars = {}) => tips.push({ id, level, vars });
  const pc = (x) => Math.round(x * 100);
  const d = details;
  const s = d ? d.stats : null;

  if (unpricedModels && unpricedModels.length) {
    add('unpriced', 'action', { models: unpricedModels.join(', '), n: d ? d.totals.unpriced : 0 });
  }

  if (kind !== 'api') {
    if (!relay || relay.mode === 'none') add('relayMissing', 'action');
    else if (relay.mode === 'foreign' && !(official && official.available)) add('relayForeign', 'action');
    else if (official && !official.available && official.relaySeen) add('noRateLimits', 'info');
  }

  if (d && d.totals.messages >= 50) {
    // Top-tier models spent on short answers.
    const topCost = d.models.filter((m) => /fable|mythos|opus/i.test(m.name)).reduce((a, m) => a + m.cost, 0);
    const share = d.totals.cost > 0 ? topCost / d.totals.cost : 0;
    if (share >= 0.6 && s.topTierMessages >= 30 && s.shortTopTierShare >= 0.5) {
      add('topTierShort', 'action', { share: pc(share), short: pc(s.shortTopTierShare) });
    }
    // Very large prompts: each reply re-reads the whole context.
    if (s.bigContextShare >= 0.25) add('bigContext', 'action', { share: pc(s.bigContextShare) });
    // Cache efficiency.
    if (s.cacheHitRate != null) {
      if (s.cacheHitRate < 0.5) add('lowCache', 'info', { rate: pc(s.cacheHitRate) });
      else if (s.cacheHitRate >= 0.85) add('goodCache', 'good', { rate: pc(s.cacheHitRate) });
    }
    // Concentration on one project.
    const top = d.projects[0];
    if (top && d.totals.cost > 0 && d.projects.length >= 3 && top.cost / d.totals.cost >= 0.6) {
      add('oneProject', 'info', { project: top.name, share: pc(top.cost / d.totals.cost) });
    }
    // Busiest slot of the week.
    let best = { v: 0, day: 0, hour: 0 };
    let total = 0;
    d.heatmap.forEach((row, day) => row.forEach((v, hour) => {
      total += v;
      if (v > best.v) best = { v, day, hour };
    }));
    if (total > 0 && best.v / total >= 0.08) add('peakSlot', 'info', { day: best.day, hour: best.hour, share: pc(best.v / total) });
  }

  if (kind !== 'api' && history && history.count >= 10) {
    // Plan sizing, from what the official gauges actually reached.
    if (history.sessions >= 5 && history.sessionsAtDanger / history.sessions >= 0.3) {
      add('planTooSmall', 'action', { hot: history.sessionsAtDanger, total: history.sessions, pct: thresholds.danger });
    }
    const weeks = history.weeklyPeaks;
    if (weeks.length >= 3 && weeks.slice(-3).every((w) => w.peak < 30)) {
      add('planTooLarge', 'info', { peak: Math.round(Math.max(...weeks.slice(-3).map((w) => w.peak))) });
    }
  }

  const order = { action: 0, info: 1, good: 2 };
  return tips.sort((a, b) => order[a.level] - order[b.level]);
}

module.exports = { buildInsights };
