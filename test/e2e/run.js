/**
 * End-to-end check: drives the real app on a generated fake home folder.
 * Run with:  npm run test:e2e   (Linux: xvfb-run -a npm run test:e2e)
 * Screenshots go to $SHOTS_DIR (default: a temp folder).
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');
const { buildDemoHome, seedState } = require('../fixtures');
const { idOf } = require('../../src/collectors/profiles');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-e2e-'));
  const dataDir = path.join(home, 'app-data');
  const now = Date.now();
  buildDemoHome(home, now);
  const mainId = idOf(path.join(home, '.claude'));
  seedState(dataDir, mainId, { now });

  // A local server that must never be reached: proves the network block.
  let hits = 0;
  const server = http.createServer((req, res) => { hits++; res.end('reached'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const forbidden = `http://127.0.0.1:${server.address().port}/`;

  const app = await electron.launch({
    executablePath: require(path.join(ROOT, 'node_modules', 'electron')),
    args: [ROOT, '--no-sandbox', `--lang=${process.env.E2E_LANG || 'fr'}`],
    env: { ...process.env, HOME: home, USERPROFILE: home, AI_USAGE_DATA_DIR: dataDir }
  });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  };
  const widget = await app.firstWindow();
  watch(widget);
  const shot = async (page, name) => { await sleep(500); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };

  // ---- widget ---------------------------------------------------------------
  await widget.waitForSelector('.provider.claude .bar');
  await shot(widget, '01-widget');
  const cards = await widget.$$eval('.provider.claude h2', (els) => els.map((e) => e.textContent));
  assert.strictEqual(cards.length, 2, 'two Claude profiles detected');
  assert.ok(cards[0].startsWith('Principal') && cards[1].startsWith('Api'));
  const sessionValue = await widget.textContent('.provider.claude .bar .value');
  assert.ok(/^≈ \d+ %$/.test(sessionValue), `estimated session gauge, got "${sessionValue}"`);
  assert.ok(await widget.isVisible('.fill.est'), 'estimate segment drawn');
  assert.ok(await widget.isVisible('.forecast'), 'forecast line shown');
  assert.ok(await widget.isVisible('.warn-text'), 'unpriced model warning shown');
  assert.ok((await widget.textContent('#codex-bars')).includes('37'), 'Codex gauge shown');
  const text = await widget.evaluate(() => document.body.innerText);
  assert.ok(!text.includes('CONFIDENTIAL'), 'no conversation text in the widget');

  // ---- zero network -----------------------------------------------------------
  const fromMain = await app.evaluate(async ({ session }, url) => {
    try { await session.defaultSession.fetch(url); return 'reached'; } catch { return 'blocked'; }
  }, forbidden);
  const fromPage = await widget.evaluate(async (url) => {
    try { await fetch(url); return 'reached'; } catch { return 'blocked'; }
  }, forbidden);
  assert.deepStrictEqual([fromMain, fromPage, hits], ['blocked', 'blocked', 0], 'no request leaves the app');

  // ---- dashboard --------------------------------------------------------------
  const [dash] = await Promise.all([app.waitForEvent('window'), widget.click('#dashboard')]);
  watch(dash);
  await dash.waitForSelector('.pcard');
  await dash.setViewportSize({ width: 940, height: 680 }).catch(() => {});
  await shot(dash, '02-overview');
  assert.ok(await dash.isVisible('svg.chart .bar-mark'), 'daily chart drawn');
  assert.ok((await dash.$$('.session')).length >= 1, 'active session listed');

  for (const tab of ['projects', 'models', 'habits', 'history', 'tips', 'settings']) {
    await dash.click(`#tabs button[data-tab="${tab}"]`);
    await shot(dash, `03-${tab}`);
  }
  await dash.click('#tabs button[data-tab="projects"]');
  const projects = await dash.$$eval('td.name', (els) => els.map((e) => e.title));
  assert.deepStrictEqual([...projects].sort(), ['appel-offres', 'crm-sync', 'portail-client', 'supervision']);
  await dash.click('#tabs button[data-tab="history"]');
  assert.ok(await dash.isVisible('svg.chart .line.s1'));
  const box = await dash.locator('svg.chart').boundingBox();
  await dash.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await shot(dash, '04-history-hover');
  assert.ok(await dash.isVisible('#tooltip'));
  const dashText = await dash.evaluate(() => document.body.innerText);
  assert.ok(!dashText.includes('CONFIDENTIAL'), 'no conversation text in the dashboard');

  // ---- relay: install on the API-free profile that has no status line --------------
  await dash.click('#tabs button[data-tab="settings"]');
  const settingsFile = path.join(home, '.claude', 'settings.json');
  assert.ok(!fs.existsSync(settingsFile));
  await dash.click(`button[data-relay-install="${mainId}"]`);
  await dash.waitForSelector('.relay .state.ok');
  const cfg = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.ok(cfg.statusLine.command.includes('ai-usage-relay'), 'relay registered in settings.json');
  await shot(dash, '05-settings-relay');

  // ---- settings: language + theme propagate to both windows ----------------------
  await dash.selectOption('#set-language', 'en');
  await dash.waitForFunction(() => document.querySelector('#tabs button[data-tab="overview"]').textContent === 'Overview');
  await dash.selectOption('#set-theme', 'light');
  await dash.waitForFunction(() => document.body.classList.contains('theme-light'));
  await widget.waitForFunction(() => document.body.classList.contains('theme-light') && document.documentElement.lang === 'en');
  await shot(widget, '06-widget-light-en');
  await dash.click('#tabs button[data-tab="overview"]');
  await shot(dash, '07-overview-light-en');
  await dash.click('#tabs button[data-tab="habits"]');
  await shot(dash, '08-habits-light-en');

  // thresholds are validated by the main process
  await dash.click('#tabs button[data-tab="settings"]');
  await dash.fill('#set-warn', '95');
  await dash.dispatchEvent('#set-warn', 'change');
  await dash.waitForFunction(() => document.querySelector('#set-danger').value === '96');

  // ---- report + CSV builders run on real data --------------------------------------
  const report = await app.evaluate(({ app: a }, root) => {
    const { createEngine } = process.mainModule.require(root + '/src/core/engine');
    const { buildReport } = process.mainModule.require(root + '/src/core/report');
    const { DEFAULTS } = process.mainModule.require(root + '/src/core/settings');
    const engine = createEngine({ dataDir: a.getPath('userData'), getSettings: () => DEFAULTS });
    return engine.collect(Date.now()).then(() => ({
      html: buildReport(engine.reportData(Date.now(), 'last30'), 'fr'),
      csv: engine.csv('projects', engine.profileList()[0].id)
    }));
  }, ROOT);
  fs.writeFileSync(path.join(OUT, 'report.html'), report.html);
  assert.ok(report.html.includes('portail-client') && !report.html.includes('CONFIDENTIAL') && !/<script/i.test(report.html));
  assert.ok(report.csv.startsWith('project,estimated_cost_usd'));

  assert.strictEqual(hits, 0, 'still no network request at the end');
  await app.close();
  server.close();
  const real = errors.filter((e) => !e.includes(forbidden)); // the deliberate blocked fetch logs a CSP error
  if (real.length) {
    console.error('Renderer errors:', real);
    process.exit(1);
  }
  console.log('E2E OK — screenshots in', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
