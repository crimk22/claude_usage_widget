const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listJsonl, createTail } = require('../src/collectors/jsonl');
const { createClaudeCollector } = require('../src/collectors/claude');
const { createClaudeOfficialCollector } = require('../src/collectors/claude-official');
const { createCodexCollector } = require('../src/collectors/codex');
const { createPricing, parseTable, loadPricing } = require('../src/collectors/pricing');
const { resolveProfiles } = require('../src/collectors/profiles');
const fx = require('./fixtures');

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `aiu-${name}-`));
const NOW = new Date(2026, 10, 16, 15, 0, 0).getTime();
const PRICES = createPricing(parseTable({ models: [['claude-opus-5', 5, 25, 0.5], ['claude-opus-5-5', 4, 20, 0.2], ['claude-sonnet-5', 2, 10, 0.2]] }));

test('tail: reads only appended data, survives half-written lines and split UTF-8', async () => {
  const dir = tmp('tail');
  const file = path.join(dir, 'a.jsonl');
  fs.writeFileSync(file, '{"usage":1,"n":1}\n{"usage":1,"n":2}\n{"usage":1,"n":3,"s":"caf');
  const tail = createTail();
  const got = [];
  await tail.readNew(await listJsonl(dir), (r) => got.push(r.n), { mustContain: '"usage"' });
  assert.deepStrictEqual(got, [1, 2], 'the unfinished third line waits');
  // finish line 3 with a multi-byte character written in two halves
  const e = Buffer.from('é');
  fs.appendFileSync(file, e.subarray(0, 1));
  await tail.readNew([file], (r) => got.push(r.n));
  fs.appendFileSync(file, Buffer.concat([e.subarray(1), Buffer.from('"}\n{"other":true}\nnot json\n{"usage":1,"n":4}\n')]));
  const seen = [];
  await tail.readNew([file], (r) => { got.push(r.n); seen.push(r); }, { mustContain: '"usage"' });
  assert.deepStrictEqual(got, [1, 2, 3, 4]);
  assert.strictEqual(seen[0].s, 'café');
  // truncation -> start over
  fs.writeFileSync(file, '{"usage":1,"n":9}\n');
  await tail.readNew([file], (r) => got.push(r.n));
  assert.strictEqual(got[got.length - 1], 9);
});

test('pricing: longest prefix wins, 1h cache writes cost more, unknown model -> null', () => {
  const u = { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  assert.strictEqual(PRICES.costOf('claude-opus-5-5-20261001', u), 4);
  assert.strictEqual(PRICES.costOf('claude-opus-5-1', u), 5);
  assert.strictEqual(PRICES.costOf('gpt-x', u), null);
  const w = { cache_creation_input_tokens: 1e6, cache_creation: { ephemeral_1h_input_tokens: 4e5 } };
  assert.strictEqual(Math.round(PRICES.costOf('claude-sonnet-5', w) * 100) / 100, 0.6 * 2 * 1.25 + 0.4 * 2 * 2);
  assert.strictEqual(parseTable({ models: [['x', 'a', 1, 1]] }), null, 'invalid rows are rejected');
});

test('pricing: env file > user copy > bundled', () => {
  const dir = tmp('price');
  assert.strictEqual(loadPricing({ userDir: dir, env: {} }).source, 'bundled');
  fs.writeFileSync(path.join(dir, 'pricing.json'), JSON.stringify({ models: [['m', 1, 2, 3]] }));
  assert.strictEqual(loadPricing({ userDir: dir, env: {} }).source, 'user');
  const envFile = path.join(dir, 'env.json');
  fs.writeFileSync(envFile, JSON.stringify({ models: [['z', 9, 9, 9]] }));
  const p = loadPricing({ userDir: dir, env: { AI_USAGE_PRICING: envFile } });
  assert.deepStrictEqual([p.source, p.models[0][0]], ['env', 'z']);
  assert.strictEqual(loadPricing({ userDir: dir, env: { AI_USAGE_PRICING: path.join(dir, 'missing.json') } }).source, 'user', 'a broken env path falls back');
});

test('claude collector: de-duplicates, prices, groups by project/model, flags unpriced', async () => {
  const dir = tmp('claude');
  const line = (id, mins, model, cwd, extra = {}) => fx.assistant({ t: NOW - mins * 60000, sid: 's1', cwd, model, id, input: 1000, output: 500, cacheWrite: 0, cacheRead: 100000, ...extra });
  fx.writeLines(path.join(dir, 'projects', 'p1', 'a.jsonl'), [
    { type: 'user', timestamp: new Date(NOW).toISOString(), message: { content: 'SECRET' } },
    line('a', 30, 'claude-opus-5-5', 'C:\\work\\alpha'),
    line('a', 30, 'claude-opus-5-5', 'C:\\work\\alpha'), // duplicate
    line('b', 20, 'claude-sonnet-5', '/home/me/beta/'),
    line('c', 10, 'mystery-model', '/home/me/beta'),
    line('old', 60 * 24 * 40, 'claude-opus-5-5', '/home/me/beta') // older than the retention
  ]);
  const c = createClaudeCollector({ dir, pricing: PRICES });
  const s = await c.poll(NOW);
  assert.strictEqual(s.month.messages, 3);
  assert.strictEqual(s.month.unpriced, 1);
  assert.deepStrictEqual(s.unpricedModels, ['mystery-model']);
  const opus = (1000 * 4 + 500 * 20 + 100000 * 0.2) / 1e6;
  const sonnet = (1000 * 2 + 500 * 10 + 100000 * 0.2) / 1e6;
  assert.ok(Math.abs(s.month.cost - (opus + sonnet)) < 1e-9);
  assert.ok(Math.abs(c.costBetween(NOW - 25 * 60000, NOW) - sonnet) < 1e-9);

  const d = c.details(NOW);
  assert.deepStrictEqual(d.projects.map((p) => p.name).sort(), ['alpha', 'beta']);
  assert.strictEqual(d.models.find((m) => m.name === 'mystery-model').unpriced, 1);
  assert.strictEqual(d.daily.length, 30);
  assert.strictEqual(d.daily[29].messages, 3);
  assert.strictEqual(d.sessions.length, 1);
  assert.strictEqual(d.sessions[0].context, 101000);
  assert.ok(!JSON.stringify([s, d]).includes('SECRET') && !JSON.stringify([s, d]).includes('CONFIDENTIAL'), 'no message text leaves the collector');

  // a second poll adds nothing; re-pricing updates costs in place
  assert.strictEqual((await c.poll(NOW)).month.messages, 3);
  c.setPricing(createPricing(parseTable({ models: [['mystery', 1, 1, 1]] })));
  const again = c.summary(NOW);
  assert.strictEqual(again.month.unpriced, 2);
  assert.deepStrictEqual(again.unpricedModels.sort(), ['claude-opus-5-5', 'claude-sonnet-5']);
});

test('official collector: relay file, legacy file, reset handling', async () => {
  const dir = tmp('official');
  const c = createClaudeOfficialCollector({ dir });
  assert.deepStrictEqual(await c.poll(NOW), { available: false, relaySeen: false, observedAt: null });

  fs.writeFileSync(path.join(dir, 'rate-limits.json'), '\uFEFF' + JSON.stringify({
    at: (NOW - 3600e3) / 1000,
    rate_limits: { five_hour: { used_percentage: 20, resets_at: (NOW + 3600e3) / 1000 }, seven_day: { used_percentage: 30, resets_at: (NOW + 86400e3) / 1000 } }
  }));
  let r = await c.poll(NOW);
  assert.strictEqual(r.fiveHour.usedPercent, 20);
  assert.strictEqual(r.observedAt, NOW - 3600e3);

  fx.writeStatusline(dir, { now: NOW, ageMs: 60000, session: 64, weekly: 31 });
  r = await c.poll(NOW);
  assert.strictEqual(r.fiveHour.usedPercent, 64, 'the fresher relay file wins');
  assert.strictEqual(r.relaySeen, true);

  r = await c.poll(NOW + 2 * 3600e3); // session window has ended since the reading
  assert.deepStrictEqual([r.fiveHour.usedPercent, r.fiveHour.stale, r.fiveHour.resetsAt], [0, true, null]);
  assert.strictEqual(r.sevenDay.usedPercent, 31);

  const apiDir = tmp('official-api');
  fx.writeStatusline(apiDir, { now: NOW, rateLimits: false });
  r = await createClaudeOfficialCollector({ dir: apiDir }).poll(NOW);
  assert.deepStrictEqual([r.available, r.relaySeen], [false, true]);
});

test('codex collector keeps the last useful reading', async () => {
  const home = tmp('codex');
  fx.codexSessions(home, { now: NOW, primary: 37, secondary: 58 });
  const r = await createCodexCollector({ root: path.join(home, '.codex', 'sessions') }).poll(NOW);
  assert.deepStrictEqual([r.available, r.plan, r.primary.usedPercent, r.secondary.windowMinutes], [true, 'plus', 37, 10080]);
});

test('profiles: auto-detection and explicit list', () => {
  const home = tmp('profiles');
  for (const d of ['.claude', '.claude-api', '.claude-empty', '.claudex']) fs.mkdirSync(path.join(home, d), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'projects'));
  fs.mkdirSync(path.join(home, '.claude-api', 'projects'));
  const auto = resolveProfiles([], home);
  assert.deepStrictEqual(auto.map((p) => [p.name, p.kind, p.auto]), [['Principal', 'forfait', true], ['Api', 'api', true]]);
  assert.ok(/^[0-9a-f]{10}$/.test(auto[0].id) && auto[0].id !== auto[1].id);
  const set = resolveProfiles([{ name: 'Moi', dir: path.join(home, '.claude'), kind: 'forfait' }], home);
  assert.deepStrictEqual([set.length, set[0].name, set[0].auto, set[0].id], [1, 'Moi', false, auto[0].id]);
});
