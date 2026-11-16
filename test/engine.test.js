const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEngine } = require('../src/core/engine');
const { buildReport } = require('../src/core/report');
const { sanitize } = require('../src/core/settings');
const { idOf } = require('../src/collectors/profiles');
const fx = require('./fixtures');

const NOW = new Date(2026, 10, 16, 15, 0, 0).getTime();

function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aiu-engine-'));
  const dataDir = path.join(home, 'app-data');
  fx.buildDemoHome(home, NOW);
  const id = idOf(path.join(home, '.claude'));
  fx.seedState(dataDir, id, { now: NOW });
  let settings = sanitize({});
  const engine = createEngine({ dataDir, getSettings: () => settings, home, env: {}, platform: 'linux' });
  return { home, dataDir, id, engine, set: (patch) => { settings = sanitize({ ...settings, ...patch }, settings); } };
}

test('engine: one view per detected profile, estimate on top of the official reading', async () => {
  const { engine, id } = setup();
  const snap = await engine.collect(NOW);
  assert.deepStrictEqual(snap.claude.map((c) => [c.name, c.kind]), [['Principal', 'forfait'], ['Api', 'api']]);
  const main = snap.claude[0];
  assert.strictEqual(main.id, id);
  assert.strictEqual(main.session.official, 58);
  assert.ok(main.session.estimated && main.session.pct > 58 && main.session.pct <= 100, 'local activity since the reading is added');
  assert.ok(main.forecast.session && ['ok', 'will_hit', 'limit'].includes(main.forecast.session.status));
  assert.ok(main.forecast.budget > 0);
  assert.strictEqual(main.relay.mode, 'none');
  assert.strictEqual(snap.claude[1].session, null, 'an API profile has no quota');
  assert.deepStrictEqual(snap.claude[1].local.unpricedModels, ['claude-nova-9']);
  assert.strictEqual(snap.codex.primary.usedPercent, 37);
  assert.deepStrictEqual(snap.alerts, [], 'the first pass only seeds the alert state');
  assert.ok(!JSON.stringify(snap).includes('CONFIDENTIAL'));
});

test('engine: a new official reading feeds history, calibration and alerts', async () => {
  const { engine, home, dataDir, id } = setup();
  await engine.collect(NOW);
  const before = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  const samples = before.history[id].length;
  assert.strictEqual(before.calibration[id].last.session.pct, 58);

  const later = NOW + 10 * 60 * 1000;
  fx.writeStatusline(path.join(home, '.claude'), { now: later, ageMs: 1000, session: 96, weekly: 43, sessionResetIn: 1.4 * fx.HOUR });
  const snap = await engine.collect(later);
  assert.deepStrictEqual(snap.alerts.map((a) => `${a.profile}:${a.scope}:${a.level}`), ['Principal:session:danger']);
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.strictEqual(after.history[id].length, samples + 1);
  assert.strictEqual(after.calibration[id].last.session.pct, 96);

  assert.deepStrictEqual((await engine.collect(later + 30000)).alerts, [], 'no repeat on the next poll');
  // the window ends: the nearly exhausted session is announced as reset
  const afterReset = await engine.collect(later + 2 * fx.HOUR);
  assert.deepStrictEqual(afterReset.alerts.map((a) => a.level), ['reset']);
});

test('engine: dashboard, CSV and report are built from the same counters', async () => {
  const { engine, id } = setup();
  await engine.collect(NOW);
  const d = engine.dashboard(NOW);
  const main = d.profiles[0];
  assert.deepStrictEqual(main.details.projects.map((p) => p.name).sort(), ['appel-offres', 'crm-sync', 'portail-client', 'supervision']);
  assert.strictEqual(main.details.daily.length, 30);
  assert.ok(main.details.sessions.length >= 1 && main.details.sessions[0].context > 150000);
  assert.ok(main.history.length > 20 && main.historySummary.peakSession > 0);
  assert.ok(main.insights.some((t) => t.id === 'relayMissing'));
  assert.ok(d.profiles[1].insights.some((t) => t.id === 'unpriced'));
  assert.strictEqual(d.pricing.source, 'bundled');

  const csv = engine.csv('projects', id, NOW).trim().split('\r\n');
  assert.strictEqual(csv.length, 5);
  assert.strictEqual(engine.csv('daily', id, NOW).trim().split('\r\n').length, 31);
  assert.ok(engine.csv('history', id, NOW).startsWith('reading_iso'));
  assert.strictEqual(engine.csv('projects', 'unknown', NOW), null);

  for (const lang of ['fr', 'en']) {
    const html = buildReport(engine.reportData(NOW, 'last30'), lang);
    assert.ok(html.includes('portail-client') && html.includes('claude-nova-9'));
    assert.ok(!/<script/i.test(html) && !/https?:\/\//.test(html), 'self-contained: no script, no external link');
    assert.ok(!html.includes('CONFIDENTIAL'));
  }
});

test('engine: explicit profiles, user price table, relay through the engine', async () => {
  const { engine, home, dataDir, id, set } = setup();
  set({ profiles: [{ name: 'Moi', dir: path.join(home, '.claude'), kind: 'forfait' }] });
  assert.deepStrictEqual(engine.reloadProfiles().map((p) => [p.name, p.auto, p.id]), [['Moi', false, id]]);
  const base = (await engine.collect(NOW)).claude[0].local.month.cost;

  // doubling every price in the user's copy doubles the estimate
  const file = engine.ensureUserPricing();
  assert.strictEqual(file, path.join(dataDir, 'pricing.json'));
  const table = JSON.parse(fs.readFileSync(file, 'utf8'));
  table.models = table.models.map(([m, a, b, c]) => [m, a * 2, b * 2, c * 2]);
  fs.writeFileSync(file, JSON.stringify(table));
  assert.strictEqual(engine.reloadPricing().source, 'user');
  const doubled = (await engine.collect(NOW)).claude[0].local.month.cost;
  assert.ok(Math.abs(doubled - base * 2) < 1e-6);

  assert.strictEqual(engine.relay.install(id).ok, true);
  assert.strictEqual(engine.relay.status(id).mode, 'ours');
  assert.strictEqual(engine.relay.uninstall(id).ok, true);
  assert.strictEqual(engine.relay.install('nope').ok, false);
});
