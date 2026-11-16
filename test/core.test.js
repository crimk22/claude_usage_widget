const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeForecast, dailyBudget, SESSION_WINDOW_MS } = require('../src/core/forecast');
const Cal = require('../src/core/calibration');
const { emptyFlags, seedFlags, evaluateAlerts } = require('../src/core/alerts');
const H = require('../src/core/history');
const { buildInsights } = require('../src/core/insights');
const statusline = require('../src/core/statusline');
const { sanitize, DEFAULTS, createSettingsStore } = require('../src/core/settings');
const I18n = require('../src/core/i18n');
const { renderBitmap, levelFor, SIZE } = require('../src/core/tray-icon');

const HOUR = 3600e3;
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const TH = { warn: 75, danger: 90 };
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `aiu-${name}-`));

// ---- forecast ---------------------------------------------------------------
test('forecast: fast burn hits the limit, slow burn does not', () => {
  const fast = computeForecast({ utilization: 60, resetsAt: NOW + 4 * HOUR, windowMs: SESSION_WINDOW_MS, now: NOW });
  assert.strictEqual(fast.status, 'will_hit');
  assert.ok(Math.abs(fast.hitAt - (NOW + (40 / 60) * HOUR)) < 1000);
  const slow = computeForecast({ utilization: 20, resetsAt: NOW + HOUR, windowMs: SESSION_WINDOW_MS, now: NOW });
  assert.deepStrictEqual([slow.status, Math.round(slow.projectedAtReset)], ['ok', 25]);
  assert.strictEqual(computeForecast({ utilization: 100, resetsAt: NOW + HOUR, windowMs: SESSION_WINDOW_MS, now: NOW }).status, 'limit');
  assert.strictEqual(computeForecast({ utilization: 50, resetsAt: NOW - 1, windowMs: SESSION_WINDOW_MS, now: NOW }), null);
  assert.strictEqual(computeForecast({ utilization: 50, resetsAt: null, windowMs: SESSION_WINDOW_MS, now: NOW }), null);
});

test('forecast: a measured recent pace is blended with the window average', () => {
  // 40% after 2h (20%/h average); recent pace 40%/h -> blended 30%/h -> limit in 2h
  const f = computeForecast({ utilization: 40, resetsAt: NOW + 3 * HOUR, windowMs: SESSION_WINDOW_MS, now: NOW, recentRatePerMs: 40 / HOUR });
  assert.strictEqual(Math.round(f.ratePerHour), 30);
  assert.ok(Math.abs(f.hitAt - (NOW + 2 * HOUR)) < 1000);
  // idle for a while: the projection relaxes but does not drop to zero
  const idle = computeForecast({ utilization: 40, resetsAt: NOW + 3 * HOUR, windowMs: SESSION_WINDOW_MS, now: NOW, recentRatePerMs: 0 });
  assert.deepStrictEqual([idle.status, Math.round(idle.projectedAtReset)], ['ok', 70]);
});

test('daily budget spreads what is left over the remaining days', () => {
  assert.strictEqual(dailyBudget({ utilization: 40, resetsAt: NOW + 4 * 24 * HOUR, now: NOW }), 15);
  assert.strictEqual(dailyBudget({ utilization: 40, resetsAt: NOW + 6 * HOUR, now: NOW }), 60, 'last day: everything left');
  assert.strictEqual(dailyBudget({ utilization: 40, resetsAt: NOW - 1, now: NOW }), null);
});

// ---- calibration --------------------------------------------------------------
test('calibration: learns percent-per-dollar from pairs of readings, then extrapolates', () => {
  const reset = NOW + 3 * HOUR;
  const cost = (from, to) => ((to - from) / HOUR) * 2; // $2 of usage per hour
  let st = Cal.emptyState();
  const reading = (h, pct) => ({ at: NOW + h * HOUR, session: { pct, resetsAt: reset }, weekly: null });
  st = Cal.learn(st, reading(0, 10), cost);
  assert.strictEqual(Cal.ratioOf(st, 'session'), null, 'not calibrated yet');
  st = Cal.learn(st, reading(0.5, 20), cost); // +10% for $1
  st = Cal.learn(st, reading(1, 31), cost); //   +11% for $1
  st = Cal.learn(st, reading(1.5, 40), cost); // +9%  for $1
  assert.strictEqual(Cal.ratioOf(st, 'session'), 10);

  const win = { usedPercent: 40, observedAt: NOW + 1.5 * HOUR };
  const est = Cal.estimate(st, 'session', win, cost, NOW + 2 * HOUR); // $1 since the reading
  assert.ok(Math.abs(est.pct - 50) < 0.01);
  assert.strictEqual(Cal.estimate(st, 'session', win, cost, NOW + 1.5 * HOUR + 60e3), null, 'too little happened');
  assert.strictEqual(Cal.estimate(st, 'weekly', win, cost, NOW + 2 * HOUR), null, 'weekly not calibrated');
  assert.strictEqual(Cal.estimate(st, 'session', { ...win, usedPercent: 95 }, cost, NOW + 3 * HOUR).pct, 100, 'capped');
});

test('calibration: ignores other windows, drops, stale readings and idle pairs', () => {
  const cost = () => 1;
  let st = Cal.learn(Cal.emptyState(), { at: 1, session: { pct: 50, resetsAt: 1000e3 }, weekly: null }, cost);
  st = Cal.learn(st, { at: 2, session: { pct: 5, resetsAt: 9000e3 }, weekly: null }, cost); // new window
  st = Cal.learn(st, { at: 3, session: { pct: 4, resetsAt: 9000e3 }, weekly: null }, cost); // went down
  st = Cal.learn(st, { at: 2, session: { pct: 80, resetsAt: 9000e3 }, weekly: null }, cost); // older than last
  st = Cal.learn(st, { at: 4, session: { pct: 9, resetsAt: 9000e3 }, weekly: null }, () => 0); // no local usage
  assert.deepStrictEqual(st.ratios.session, []);
  assert.strictEqual(st.last.at, 4);
});

test('calibration: after a reset the estimate counts from the reset', () => {
  const st = { last: null, ratios: { session: [10, 10, 10], weekly: [] } };
  const calls = [];
  const cost = (from, to) => { calls.push(from); return 2; };
  const est = Cal.estimate(st, 'session', { usedPercent: 0, stale: true, previousResetAt: 500, observedAt: 100 }, cost, 1000);
  assert.deepStrictEqual([est.pct, calls[0]], [20, 500]);
});

// ---- alerts -------------------------------------------------------------------
const G = (s, w, extra = {}) => ({ session: { pct: s, resetsAt: NOW + HOUR }, weekly: { pct: w, resetsAt: NOW + 48 * HOUR }, forecast: null, ...extra });

test('alerts: warn then danger, once each; straight to danger skips warn; re-arm after reset', () => {
  let r = evaluateAlerts(emptyFlags(), G(76, 10), TH, NOW);
  assert.deepStrictEqual(r.alerts.map((a) => `${a.scope}:${a.level}`), ['session:warn']);
  r = evaluateAlerts(r.flags, G(80, 10), TH, NOW);
  assert.deepStrictEqual(r.alerts, []);
  r = evaluateAlerts(r.flags, G(92, 95), TH, NOW);
  assert.deepStrictEqual(r.alerts.map((a) => `${a.scope}:${a.level}`), ['session:danger', 'weekly:danger']);
  r = evaluateAlerts(r.flags, G(3, 95), TH, NOW);
  r = evaluateAlerts(r.flags, G(78, 95), TH, NOW);
  assert.deepStrictEqual(r.alerts.map((a) => a.level), ['warn']);
});

test('alerts: nothing fires for what is already on screen at startup', () => {
  const flags = seedFlags(G(93, 80, { forecast: { status: 'will_hit', hitAt: NOW + 1 } }), TH);
  assert.deepStrictEqual(evaluateAlerts(flags, G(94, 81, { forecast: { status: 'will_hit', hitAt: NOW + 1 } }), TH, NOW).alerts, []);
});

test('alerts: forecast once per window, between 50% and danger', () => {
  const f = { forecast: { status: 'will_hit', hitAt: NOW + 20 * 60e3 } };
  let r = evaluateAlerts(emptyFlags(), G(30, 0, f), TH, NOW);
  assert.deepStrictEqual(r.alerts, []);
  r = evaluateAlerts(r.flags, G(55, 0, f), TH, NOW);
  assert.deepStrictEqual(r.alerts.map((a) => a.level), ['forecast']);
  r = evaluateAlerts(r.flags, G(60, 0, f), TH, NOW);
  assert.deepStrictEqual(r.alerts, []);
});

test('alerts: "session has reset" after a nearly exhausted session', () => {
  let r = evaluateAlerts(emptyFlags(), G(95, 0), TH, NOW);
  assert.strictEqual(r.flags.hotUntil, NOW + HOUR);
  r = evaluateAlerts(r.flags, G(95, 0), TH, NOW + 30 * 60e3);
  assert.ok(!r.alerts.some((a) => a.level === 'reset'));
  r = evaluateAlerts(r.flags, { session: { pct: 0, resetsAt: null }, weekly: null, forecast: null }, TH, NOW + HOUR + 1);
  assert.deepStrictEqual(r.alerts.map((a) => a.level), ['reset']);
  r = evaluateAlerts(r.flags, { session: { pct: 0, resetsAt: null }, weekly: null, forecast: null }, TH, NOW + 2 * HOUR);
  assert.deepStrictEqual(r.alerts, [], 'only once');
});

// ---- history ------------------------------------------------------------------
test('history: one sample per official reading, peaks and hot sessions', () => {
  const off = (t, s, w, sr) => ({ observedAt: t, fiveHour: { usedPercent: s, resetsAt: sr }, sevenDay: { usedPercent: w, resetsAt: 9e12 } });
  let list = H.addSample([], H.makeSample(off(1000, 40, 10, 5000)), 2000);
  list = H.addSample(list, H.makeSample(off(1000, 40, 10, 5000)), 2000);
  list = H.addSample(list, H.makeSample(off(3000, 95, 12, 5000)), 4000);
  list = H.addSample(list, H.makeSample(off(6000, 20, 14, 9000)), 7000);
  assert.strictEqual(list.length, 3, 'the repeated reading is not stored twice');
  const s = H.summarize(list, 90);
  assert.deepStrictEqual([s.peakSession, s.peakWeekly, s.sessions, s.sessionsAtDanger], [95, 14, 2, 1]);
  assert.deepStrictEqual(s.weeklyPeaks, [{ resetsAt: 9e12, peak: 14 }]);
  assert.strictEqual(H.makeSample({ observedAt: 5, fiveHour: { usedPercent: 0, stale: true }, sevenDay: null }).s, null);
  assert.strictEqual(H.toCsv(list).trim().split('\r\n').length, 4);
  assert.ok(H.downsample(Array.from({ length: 500 }, (_, i) => ({ t: i, s: i === 250 ? 99 : 1, w: 0 })), 50).some((x) => x.s === 99));
});

// ---- insights -----------------------------------------------------------------
test('insights: rules fire on the right figures and are sorted by urgency', () => {
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(1));
  heat[1][14] = 60;
  const details = {
    totals: { messages: 200, cost: 100, unpriced: 4 },
    models: [{ name: 'claude-opus-5-5', cost: 80 }, { name: 'claude-sonnet-5', cost: 20 }],
    projects: [{ name: 'alpha', cost: 70 }, { name: 'b', cost: 20 }, { name: 'c', cost: 10 }],
    heatmap: heat,
    stats: { cacheHitRate: 0.9, bigContextShare: 0.4, topTierMessages: 120, shortTopTierShare: 0.6 }
  };
  const tips = buildInsights({
    kind: 'forfait', details, relay: { mode: 'none' }, official: { available: false }, unpricedModels: ['nova'], thresholds: TH,
    history: { count: 40, sessions: 10, sessionsAtDanger: 4, weeklyPeaks: [] }
  });
  const ids = tips.map((x) => x.id);
  for (const id of ['unpriced', 'relayMissing', 'topTierShort', 'bigContext', 'goodCache', 'oneProject', 'peakSlot', 'planTooSmall']) assert.ok(ids.includes(id), id);
  assert.strictEqual(tips[tips.length - 1].level, 'good');
  assert.deepStrictEqual(tips.find((x) => x.id === 'peakSlot').vars, { day: 1, hour: 14, share: 26 });

  const quiet = buildInsights({
    kind: 'forfait', details: { ...details, totals: { messages: 10, cost: 1, unpriced: 0 } }, relay: { mode: 'ours' }, official: { available: true }, unpricedModels: [], thresholds: TH,
    history: { count: 30, sessions: 8, sessionsAtDanger: 0, weeklyPeaks: [{ peak: 12 }, { peak: 20 }, { peak: 8 }] }
  });
  assert.deepStrictEqual(quiet.map((x) => x.id), ['planTooLarge']);
  assert.deepStrictEqual(buildInsights({ kind: 'api', details: null, relay: null, unpricedModels: [], thresholds: TH }), []);
});

// ---- status line relay ----------------------------------------------------------
test('relay: installs on an empty profile, backs up, and uninstalls cleanly', () => {
  const dir = tmp('relay');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ model: 'opus', permissions: { allow: ['x'] } }));
  assert.strictEqual(statusline.status(dir, 'linux').mode, 'none');
  assert.deepStrictEqual(statusline.install(dir, 'linux'), { ok: true, already: false, chained: false });
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.strictEqual(after.model, 'opus', 'other settings are untouched');
  assert.deepStrictEqual(after.permissions, { allow: ['x'] });
  assert.ok(after.statusLine.command.includes('ai-usage-relay.sh'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json.ai-usage-backup'), 'utf8')), { model: 'opus', permissions: { allow: ['x'] } });
  assert.strictEqual(statusline.status(dir, 'linux').mode, 'ours');
  assert.strictEqual(statusline.install(dir, 'linux').already, true);
  statusline.uninstall(dir);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')), { model: 'opus', permissions: { allow: ['x'] } });
  assert.ok(!fs.existsSync(path.join(dir, 'ai-usage-relay.sh')));
});

test('relay: the script saves stdin untouched and chains to an existing status line', { skip: process.platform === 'win32' }, () => {
  const dir = tmp('relay-chain');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'tr a-z A-Z', padding: 0 } }));
  assert.deepStrictEqual(statusline.install(dir, 'linux'), { ok: true, already: false, chained: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.strictEqual(cfg.statusLine.padding, 0);
  const input = '{"rate_limits":{"five_hour":{"used_percentage":42}},"note":"café $HOME `x`"}';
  const out = require('child_process').execSync(cfg.statusLine.command, { input, encoding: 'utf8' });
  assert.strictEqual(out, input.toUpperCase().replace('É', 'é'), 'the original status line still produces the output');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'statusline-last.json'), 'utf8'), input);
  assert.deepStrictEqual(statusline.uninstall(dir), { ok: true, already: false, restored: true });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).statusLine.command, 'tr a-z A-Z');
});

test('relay: never rewrites what it cannot handle safely', () => {
  const win = tmp('relay-win');
  fs.writeFileSync(path.join(win, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'my.ps1' } }));
  assert.deepStrictEqual(statusline.install(win, 'win32'), { ok: false, reason: 'manual' }, 'existing status line on Windows -> manual snippet');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(win, 'settings.json'), 'utf8')).statusLine.command, 'my.ps1');
  const snippet = statusline.status(win, 'win32').snippet;
  assert.ok(snippet.includes('statusline-last.json') && snippet.includes(path.basename(win)) && !snippet.includes('\\'), 'the snippet targets this profile folder');

  const empty = tmp('relay-win2');
  assert.strictEqual(statusline.install(empty, 'win32').ok, true);
  const cmd = JSON.parse(fs.readFileSync(path.join(empty, 'settings.json'), 'utf8')).statusLine.command;
  assert.ok(/^powershell -NoProfile -ExecutionPolicy Bypass -File ".*ai-usage-relay\.ps1"$/.test(cmd) && !cmd.includes('\\'));

  const broken = tmp('relay-broken');
  fs.writeFileSync(path.join(broken, 'settings.json'), '{ not json');
  assert.strictEqual(statusline.status(broken, 'linux').mode, 'unreadable');
  assert.deepStrictEqual(statusline.install(broken, 'linux'), { ok: false, reason: 'unreadable' });
  assert.strictEqual(fs.readFileSync(path.join(broken, 'settings.json'), 'utf8'), '{ not json');
});

// ---- settings -----------------------------------------------------------------
test('settings: untrusted input is rebuilt field by field', () => {
  const s = sanitize({ warn: 95, danger: 50, theme: 'pink', language: 'de', shortcut: 'rm -rf', alerts: 'yes', extra: 1, profiles: [{ dir: '~/.claude', kind: 'x' }, { dir: '' }, { dir: '~/.claude' }] });
  assert.deepStrictEqual([s.warn, s.danger, s.theme, s.language, s.shortcut, s.alerts], [95, 96, 'dark', 'auto', DEFAULTS.shortcut, true]);
  assert.strictEqual(s.extra, undefined);
  assert.strictEqual(s.profiles.length, 1);
  assert.deepStrictEqual([s.profiles[0].kind, path.isAbsolute(s.profiles[0].dir)], ['forfait', true]);

  const file = path.join(tmp('settings'), 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ position: { x: 10.4, y: 20 }, profiles: [{ name: 'Moi', dir: '/x/.claude' }] }));
  const store = createSettingsStore(file);
  assert.deepStrictEqual(store.read().position, { x: 10, y: 20 }, 'v1 settings file is still understood');
  store.write({ theme: 'light' });
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).profiles[0].name, 'Moi', 'a partial write keeps the rest');
});

// ---- i18n / icon ----------------------------------------------------------------
test('i18n: both languages have the same keys and placeholders', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  assert.deepStrictEqual(Object.keys(I18n.STRINGS.en).sort(), Object.keys(I18n.STRINGS.fr).sort());
  for (const k of Object.keys(I18n.STRINGS.fr)) assert.strictEqual(vars(I18n.STRINGS.en[k]), vars(I18n.STRINGS.fr[k]), k);
});

test('i18n: every key used in the code exists', () => {
  const root = path.join(__dirname, '..');
  const files = ['main.js', ...fs.readdirSync(path.join(root, 'src/renderer')).map((f) => `src/renderer/${f}`), ...fs.readdirSync(path.join(root, 'src/core')).map((f) => `src/core/${f}`)]
    .filter((f) => /\.(js|html)$/.test(f) && !f.endsWith('i18n.js') && fs.existsSync(path.join(root, f)));
  const missing = new Set();
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    const re = /(?:\bT|\bt|\btr)\(\s*'([a-zA-Z0-9_.]+)'|data-i18n(?:-title)?="([a-zA-Z0-9_.]+)"/g;
    let m;
    while ((m = re.exec(text))) {
      const key = m[1] || m[2];
      if (!key.includes('.') || key.endsWith('.')) continue;
      if (!(key in I18n.STRINGS.fr)) missing.add(`${f}: ${key}`);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

test('i18n: formatting helpers', () => {
  assert.strictEqual(I18n.resolveLanguage('auto', 'fr-MA'), 'fr');
  assert.strictEqual(I18n.resolveLanguage('auto', 'ar-MA'), 'en');
  assert.strictEqual(I18n.t('fr', 'forecast.ok', { pct: 62 }), 'rythme OK · ~62 % au reset');
  assert.strictEqual(I18n.t('en', 'nope.key'), 'nope.key');
  assert.deepStrictEqual([I18n.tokens(1234567, 'fr'), I18n.tokens(1234567, 'en'), I18n.tokens(8400, 'fr')], ['1,2 M', '1.2 M', '8 k']);
  assert.deepStrictEqual([I18n.usd(3.456), I18n.usd(250.4), I18n.pct(41.6, 'fr'), I18n.pct(41.6, 'en')], ['$3.46', '$250', '42 %', '42%']);
  assert.strictEqual(I18n.left(3 * HOUR + 5 * 60e3, 'fr'), '3 h 05');
  assert.strictEqual(I18n.ago(NOW - 5 * 60e3, NOW, 'en'), '5 min ago');
});

test('tray icon bitmap', () => {
  const buf = renderBitmap(71, 'normal');
  assert.strictEqual(buf.length, SIZE * SIZE * 4);
  assert.deepStrictEqual(Array.from(buf.subarray(0, 4)), [0, 0, 0, 0], 'rounded corner is transparent');
  assert.deepStrictEqual([levelFor(74, 75, 90), levelFor(75, 75, 90), levelFor(100, 75, 90)], ['normal', 'warn', 'danger']);
  assert.doesNotThrow(() => renderBitmap(100, 'danger'));
});
