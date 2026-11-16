/**
 * AI Usage Widget — main process.
 * Reads local files only (Claude Code + Codex logs). No credentials, no network:
 * every outgoing request is blocked at the session level.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, session, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { createClaudeCollector } = require('./src/collectors/claude');
const { createClaudeOfficialCollector } = require('./src/collectors/claude-official');
const { createCodexCollector } = require('./src/collectors/codex');
const { resolveProfiles } = require('./src/collectors/profiles');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
if (process.platform === 'win32') app.setAppUserModelId('local.ai-usage-widget');

const POLL_MS = 30 * 1000;
const WIDTH = 300;
const SHORTCUT = 'CommandOrControl+Alt+U';

let profiles = []; // [{ name, dir, kind, local, official }]
const codex = createCodexCollector();

function loadProfiles() {
  profiles = resolveProfiles(readSettings().profiles).map((p) => ({
    ...p,
    local: createClaudeCollector({ dir: p.dir }),
    official: createClaudeOfficialCollector({ dir: p.dir })
  }));
}

let win = null;
let tray = null;
let timer = null;
let last = null;

// --- tiny settings file (window position only) -----------------------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }));
  } catch { /* non-critical */ }
}
function onScreen(pos) {
  if (!pos) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    pos.x >= a.x - 40 && pos.x <= a.x + a.width - 80 && pos.y >= a.y && pos.y <= a.y + a.height - 40);
}

// --- data ---------------------------------------------------------------------
function collect() {
  const now = Date.now();
  const safe = (fn) => { try { return fn(now); } catch (e) { return { available: false, error: String(e.message || e) }; } };
  last = {
    now,
    claude: profiles.map((p) => ({
      name: p.name,
      kind: p.kind,
      official: p.kind === 'api' ? { available: false } : safe(p.official.poll),
      local: safe(p.local.poll)
    })),
    codex: safe(codex.poll)
  };
  if (win && !win.isDestroyed()) win.webContents.send('usage', last);
  updateTray();
}

function pct(w) { return w && typeof w.usedPercent === 'number' ? `${Math.round(w.usedPercent)}%` : '–'; }

function updateTray() {
  if (!tray || !last) return;
  const lines = last.claude
    .filter((c) => c.official.available)
    .map((c) => `${c.name}  5h ${pct(c.official.fiveHour)} · 7j ${pct(c.official.sevenDay)}`);
  const x = last.codex;
  if (x.available) lines.push(`Codex  ${pct(x.primary)}${x.secondary ? ` · ${pct(x.secondary)}` : ''}`);
  tray.setToolTip(lines.join('\n').slice(0, 127) || 'AI Usage'); // Windows caps tooltips at 127 chars
}

// --- window -------------------------------------------------------------------
function createWindow() {
  const saved = readSettings().position;
  win = new BrowserWindow({
    width: WIDTH,
    height: 360,
    ...(onScreen(saved) && { x: saved.x, y: saved.y }),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: path.join(__dirname, 'src/renderer/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  win.once('ready-to-show', () => { win.show(); collect(); });
  // Dev only: WIDGET_SCREENSHOT=<file.png> saves what the window renders.
  if (!app.isPackaged && process.env.WIDGET_SCREENSHOT) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.WIDGET_SCREENSHOT, img.toPNG());
    }, 4000);
  }
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let t = null;
  win.on('move', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (win) { const { x, y } = win.getBounds(); writeSettings({ position: { x, y } }); } }, 400);
  });
  win.on('closed', () => { win = null; });
}

function toggle() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); collect(); }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'src/renderer/icon.png')).resize({ width: 16, height: 16 }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Afficher / masquer', click: toggle },
    { label: 'Actualiser', click: collect },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() }
  ]));
  tray.on('click', toggle);
  updateTray();
}

// --- lifecycle ----------------------------------------------------------------
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } else createWindow(); });

app.whenReady().then(() => {
  // Zero network: block every request that is not a local file.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !/^(file|devtools|chrome-extension):/i.test(details.url) });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  ipcMain.on('refresh', collect);
  ipcMain.on('hide', () => win && win.hide());
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('resize', (_e, h) => {
    const height = Math.max(120, Math.min(800, Math.round(Number(h) || 0)));
    if (win) win.setSize(WIDTH, height);
  });

  loadProfiles();
  createWindow();
  createTray();
  globalShortcut.register(SHORTCUT, toggle);
  timer = setInterval(collect, POLL_MS);
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep living in the tray
app.on('will-quit', () => { clearInterval(timer); globalShortcut.unregisterAll(); });
