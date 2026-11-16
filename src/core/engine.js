/**
 * engine.js — everything the app knows, with no Electron dependency.
 *
 * Owns the profiles and their collectors, the learned calibration, the history
 * of official readings and the alert state. main.js only wires it to windows,
 * tray and notifications; tests drive it directly against fixture folders.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClaudeCollector } = require('../collectors/claude');
const { createClaudeOfficialCollector } = require('../collectors/claude-official');
const { createCodexCollector } = require('../collectors/codex');
const { resolveProfiles } = require('../collectors/profiles');
const { loadPricing, createPricing } = require('../collectors/pricing');
const { computeForecast, dailyBudget, SESSION_WINDOW_MS, WEEKLY_WINDOW_MS } = require('./forecast');
const Calibration = require('./calibration');
const Alerts = require('./alerts');
const History = require('./history');
const { buildInsights } = require('./insights');
const statusline = require('./statusline');

const RECENT_MS = 45 * 60 * 1000;

function createEngine({ dataDir, getSettings, home = os.homedir(), env = process.env, platform = process.platform }) {
  const stateFile = path.join(dataDir, 'state.json');
  let state = { history: {}, calibration: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (raw && typeof raw === 'object') state = { history: raw.history || {}, calibration: raw.calibration || {} };
  } catch { /* first run */ }

  let pricingInfo = loadPricing({ userDir: dataDir, env });
  let pricing = createPricing(pricingInfo.models);
  let profiles = []; // [{ id, name, dir, kind, auto, local, official }]
  const codex = createCodexCollector({ root: path.join(home, '.codex', 'sessions') });
  const alertFlags = new Map(); // profile id -> flags (in memory: re-seeded at each start)
  let last = null;

  function saveState() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = `${stateFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, stateFile);
    } catch { /* non-critical */ }
  }

  function reloadProfiles() {
    const previous = new Map(profiles.map((p) => [p.id, p]));
    profiles = resolveProfiles(getSettings().profiles, home).map((p) => {
      const old = previous.get(p.id);
      return {
        ...p,
        local: old ? old.local : createClaudeCollector({ dir: p.dir, pricing }),
        official: old ? old.official : createClaudeOfficialCollector({ dir: p.dir })
      };
    });
    return profiles.map(({ id, name, dir, kind, auto }) => ({ id, name, dir, kind, auto }));
  }

  function reloadPricing() {
    pricingInfo = loadPricing({ userDir: dataDir, env });
    pricing = createPricing(pricingInfo.models);
    for (const p of profiles) p.local.setPricing(pricing);
    return { source: pricingInfo.source, file: pricingInfo.file, models: pricingInfo.models.length };
  }

  /** One gauge: official reading, estimate on top of it, and where the window ends. */
  function gauge(scope, win, cal, p, now, localSession) {
    if (!win) return null;
    const est = Calibration.estimate(cal, scope, win, p.local.costBetween, now);
    let resetsAt = win.resetsAt || null;
    let approxReset = false;
    // After a reset the official end of the new window is unknown until the next
    // reading; the local transcripts give a close approximation for the session.
    if (!resetsAt && win.stale && est && scope === 'session' && localSession) {
      resetsAt = localSession.resetsAt;
      approxReset = true;
    }
    return {
      official: win.usedPercent,
      pct: est ? est.pct : win.usedPercent,
      estimated: Boolean(est),
      resetsAt,
      approxReset,
      stale: Boolean(win.stale) && !est,
      observedAt: win.observedAt
    };
  }

  async function collectProfile(p, now, thresholds) {
    const local = await p.local.poll(now);
    const official = p.kind === 'api' ? { available: false } : await p.official.poll(now);
    const relay = p.kind === 'api' ? null : statusline.status(p.dir, platform);

    let cal = state.calibration[p.id] || Calibration.emptyState();
    let changed = false;
    if (official.available && official.observedAt && (!cal.last || official.observedAt > cal.last.at)) {
      const f = official.fiveHour;
      const w = official.sevenDay;
      cal = Calibration.learn(cal, {
        at: official.observedAt,
        session: f && !f.stale ? { pct: f.usedPercent, resetsAt: f.resetsAt } : null,
        weekly: w && !w.stale ? { pct: w.usedPercent, resetsAt: w.resetsAt } : null
      }, p.local.costBetween);
      state.calibration[p.id] = cal;
      state.history[p.id] = History.addSample(state.history[p.id], History.makeSample(official), now);
      changed = true;
    }

    let session = null;
    let weekly = null;
    const forecast = { session: null, weekly: null, budget: null };
    if (official.available) {
      session = gauge('session', official.fiveHour, cal, p, now, local.session);
      weekly = gauge('weekly', official.sevenDay, cal, p, now, null);
      const k = Calibration.ratioOf(cal, 'session');
      const recentRatePerMs = k == null ? null : (k * p.local.costBetween(now - RECENT_MS, now + 1)) / RECENT_MS;
      if (session && session.resetsAt) {
        forecast.session = computeForecast({ utilization: session.pct, resetsAt: session.resetsAt, windowMs: SESSION_WINDOW_MS, now, recentRatePerMs });
      }
      if (weekly && weekly.resetsAt) {
        forecast.weekly = computeForecast({ utilization: weekly.pct, resetsAt: weekly.resetsAt, windowMs: WEEKLY_WINDOW_MS, now });
        forecast.budget = dailyBudget({ utilization: weekly.pct, resetsAt: weekly.resetsAt, now });
      }
    }

    // Alerts (first pass after start only seeds the flags).
    const alerts = [];
    if (official.available) {
      const g = { session, weekly, forecast: forecast.session };
      const prev = alertFlags.get(p.id);
      if (!prev) alertFlags.set(p.id, Alerts.seedFlags(g, thresholds));
      else {
        const res = Alerts.evaluateAlerts(prev, g, thresholds, now);
        alertFlags.set(p.id, res.flags);
        for (const a of res.alerts) alerts.push({ ...a, profile: p.name });
      }
    }

    return {
      changed,
      alerts,
      view: {
        id: p.id, name: p.name, kind: p.kind,
        official: { available: Boolean(official.available), relaySeen: Boolean(official.relaySeen), observedAt: official.observedAt || null },
        session, weekly, forecast,
        calibrated: Calibration.ratioOf(cal, 'session') != null,
        local,
        relay: relay ? { mode: relay.mode, canInstall: relay.canInstall } : null
      }
    };
  }

  /** Poll everything. Returns the snapshot shown by the widget. */
  async function collect(now = Date.now()) {
    const settings = getSettings();
    const thresholds = { warn: settings.warn, danger: settings.danger };
    const claude = [];
    const alerts = [];
    let changed = false;
    for (const p of profiles) {
      try {
        const r = await collectProfile(p, now, thresholds);
        claude.push(r.view);
        alerts.push(...r.alerts);
        changed = changed || r.changed;
      } catch (err) {
        claude.push({ id: p.id, name: p.name, kind: p.kind, error: String(err.message || err), official: { available: false }, local: { available: false }, forecast: {} });
      }
    }
    let codexView;
    try {
      codexView = settings.showCodex ? await codex.poll(now) : { available: false, hidden: true };
    } catch (err) {
      codexView = { available: false, error: String(err.message || err) };
    }
    if (changed) saveState();
    last = { now, claude, codex: codexView, alerts };
    return last;
  }

  const findProfile = (id) => profiles.find((p) => p.id === id) || null;

  function historyOf(id) {
    return state.history[id] || [];
  }

  /** Everything the dashboard shows. */
  function dashboard(now = Date.now()) {
    const settings = getSettings();
    const views = new Map(((last && last.claude) || []).map((v) => [v.id, v]));
    return {
      now,
      codex: last ? last.codex : { available: false },
      pricing: { source: pricingInfo.source, file: pricingInfo.file, models: pricingInfo.models.length },
      profiles: profiles.map((p) => {
        const view = views.get(p.id) || null;
        const details = p.local.details(now);
        const history = historyOf(p.id);
        const historySummary = History.summarize(history, settings.danger);
        const relay = p.kind === 'api' ? null : statusline.status(p.dir, platform);
        return {
          id: p.id, name: p.name, dir: p.dir, kind: p.kind, auto: p.auto,
          view,
          details,
          history: History.downsample(history, 800),
          historySummary,
          relay,
          insights: buildInsights({
            kind: p.kind, details, history: historySummary, relay,
            official: view ? view.official : null,
            unpricedModels: view && view.local ? view.local.unpricedModels : [],
            thresholds: { warn: settings.warn, danger: settings.danger }
          })
        };
      })
    };
  }

  /** Data for the report: 'month' (month to date) or 'last30'. */
  function reportData(now = Date.now(), range = 'month') {
    const settings = getSettings();
    const from = range === 'last30' ? now - 30 * 24 * 3600 * 1000 : null;
    return {
      now,
      range,
      danger: settings.danger,
      profiles: profiles.map((p) => {
        const details = p.local.details(now, from == null ? {} : { monthStart: from });
        const hist = historyOf(p.id).filter((x) => x.t >= details.range.from);
        const historySummary = History.summarize(hist, settings.danger);
        return {
          name: p.name, kind: p.kind, details, historySummary,
          insights: buildInsights({
            kind: p.kind, details, history: historySummary, relay: { mode: 'ours' }, official: null,
            unpricedModels: [...new Set(details.models.filter((m) => m.unpriced).map((m) => m.name))],
            thresholds: { warn: settings.warn, danger: settings.danger }
          }).filter((tip) => !/^relay|^noRate/.test(tip.id))
        };
      })
    };
  }

  const csvCell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  function csv(kind, id, now = Date.now()) {
    const p = findProfile(id);
    if (!p) return null;
    if (kind === 'history') return History.toCsv(historyOf(id));
    const d = p.local.details(now);
    const rows = kind === 'daily'
      ? [['day', 'estimated_cost_usd', 'tokens', 'replies'], ...d.daily.map((x) => [x.day, x.cost.toFixed(4), x.tokens, x.messages])]
      : [[kind === 'models' ? 'model' : 'project', 'estimated_cost_usd', 'tokens', 'replies', 'replies_without_price', 'last_activity_iso'],
        ...(kind === 'models' ? d.models : d.projects).map((x) => [x.name, x.cost.toFixed(4), x.tokens, x.messages, x.unpriced, new Date(x.lastT).toISOString()])];
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  /** Copy the active price table to the user's folder so it can be edited safely. */
  function ensureUserPricing() {
    const file = path.join(dataDir, 'pricing.json');
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, '..', 'collectors', 'pricing.json'), file);
    }
    return file;
  }

  reloadProfiles();

  return {
    collect, dashboard, reportData, csv, reloadProfiles, reloadPricing, ensureUserPricing,
    last: () => last,
    profileList: () => profiles.map(({ id, name, dir, kind, auto }) => ({ id, name, dir, kind, auto })),
    relay: {
      status: (id) => { const p = findProfile(id); return p ? statusline.status(p.dir, platform) : null; },
      install: (id) => { const p = findProfile(id); return p ? statusline.install(p.dir, platform) : { ok: false, reason: 'unknown' }; },
      uninstall: (id) => { const p = findProfile(id); return p ? statusline.uninstall(p.dir) : { ok: false, reason: 'unknown' }; }
    }
  };
}

module.exports = { createEngine };
