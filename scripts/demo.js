/**
 * npm run demo — launches the app on a generated fake home folder, so the
 * whole interface can be explored without touching (or having) real logs.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildDemoHome, seedState } = require('../test/fixtures');
const { idOf } = require('../src/collectors/profiles');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-demo-'));
const dataDir = path.join(home, 'app-data');
const now = Date.now();
buildDemoHome(home, now);
seedState(dataDir, idOf(path.join(home, '.claude')), { now });

console.log('Demo home:', home);
const child = spawn(require('electron'), [path.join(__dirname, '..'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, HOME: home, USERPROFILE: home, AI_USAGE_DATA_DIR: dataDir, AI_USAGE_OPEN_DASHBOARD: '1' }
});
child.on('exit', (code) => process.exit(code || 0));
