/**
 * AI Usage Widget — main process.
 * Reads local files only (Claude Code + Codex logs). No credentials, no network:
 * every outgoing request is blocked at the session level.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, session, nativeImage, Notification, dialog, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const I18n = require('./src/core/i18n');
const { createSettingsStore, sanitize } = require('./src/core/settings');
const { createEngine } = require('./src/core/engine');
const { createPercentIcon } = require('./src/core/tray-icon');
const { buildReport } = require('./src/core/report');

// Development and automated tests only: isolated data folder. Must come before
// the single-instance lock, which is keyed on userData: otherwise a demo or e2e
// run quits silently while the real widget is running.
if (!app.isPackaged && process.env.AI_USAGE_DATA_DIR) app.setPath('userData', process.env.AI_USAGE_DATA_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
if (process.platform === 'win32') app.setAppUserModelId('local.ai-usage-widget');

const POLL_MS = 30 * 1000;
const WIDTH = 300;
const ICON = path.join(__dirname, 'src/renderer/icon.png');
const WEB_PREFERENCES = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
};

const settings = createSettingsStore(path.join(app.getPath('userData'), 'settings.json'));
const engine = createEngine({ dataDir: app.getPath('userData'), getSettings: settings.read });

let win = null;
let dash = null;
let tray = null;
let timer = null;
let collecting = null;
let registeredShortcut = null;

const lang = () => I18n.resolveLanguage(settings.read().language, app.getLocale());
const t = (key, vars) => I18n.t(lang(), key, vars);
const windows = () => [win, dash].filter((w) => w && !w.isDestroyed());

function onScreen(pos) {
  if (!pos) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    pos.x >= a.x - 40 && pos.x <= a.x + a.width - 80 && pos.y >= a.y && pos.y <= a.y + a.height - 40);
}

/** What both windows need besides the figures. */
function uiState() {
  const s = settings.read();
  const dark = s.theme === 'dark' || (s.theme === 'system' && nativeTheme.shouldUseDarkColors);
  return { lang: lang(), theme: dark ? 'dark' : 'light', warn: s.warn, danger: s.danger, showCosts: s.showCosts, platform: process.platform };
}

// --- data ---------------------------------------------------------------------
function collect() {
  if (collecting) return collecting;
  collecting = engine.collect(Date.now())
    .then((snapshot) => {
      for (const w of windows()) w.webContents.send('usage', { ...snapshot, ui: uiState() });
      updateTray(snapshot);
      if (settings.read().alerts) snapshot.alerts.forEach(notify);
      return snapshot;
    })
    .catch((err) => console.error('collect failed:', err))
    .finally(() => { collecting = null; });
  return collecting;
}

function notify(alert) {
  if (!Notification.isSupported()) return;
  const l = lang();
  let body;
  if (alert.level === 'reset') body = t('alert.reset');
  else if (alert.level === 'forecast') body = t('alert.forecast', { time: I18n.time(alert.hitAt, l) });
  else body = t(`alert.${alert.level}`, { scope: t(`alert.scope.${alert.scope}`), pct: Math.round(alert.pct) });
  const many = engine.profileList().length > 1;
  const n = new Notification({ title: many ? `${t('alert.title')} · ${alert.profile}` : t('alert.title'), body });
  n.on('click', showWidget);
  n.show();
}

// --- tray ---------------------------------------------------------------------
function baseTrayIcon() {
  return nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.toggle'), click: toggle },
    { label: t('tray.dashboard'), click: openDashboard },
    { label: t('tray.refresh'), click: collect },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() }
  ]));
}

function updateTray(snapshot = engine.last()) {
  if (!tray || !snapshot) return;
  const s = settings.read();
  const l = lang();
  const pct = (g) => (g ? `${g.estimated ? '≈' : ''}${Math.round(g.pct)}%` : '–');
  const quota = snapshot.claude.filter((c) => c.official && c.official.available);
  const lines = quota.map((c) => `${c.name}  5h ${pct(c.session)} · ${l === 'fr' ? '7j' : '7d'} ${pct(c.weekly)}`);
  const x = snapshot.codex;
  if (x.available) {
    const cp = (w) => (w && typeof w.usedPercent === 'number' ? `${Math.round(w.usedPercent)}%` : '–');
    lines.push(`Codex  ${cp(x.primary)}${x.secondary ? ` · ${cp(x.secondary)}` : ''}`);
  }
  tray.setToolTip(lines.join('\n').slice(0, 127) || 'AI Usage'); // Windows caps tooltips at 127 chars

  // Icon: the most used session gauge across subscription profiles.
  try {
    const worst = quota.map((c) => c.session).filter(Boolean).sort((a, b) => b.pct - a.pct)[0];
    tray.setImage(s.trayPercent && worst ? createPercentIcon(worst.pct, s.warn, s.danger) : baseTrayIcon());
  } catch { /* keep the previous icon */ }
}

// --- windows ------------------------------------------------------------------
function createWindow() {
  const s = settings.read();
  win = new BrowserWindow({
    width: WIDTH,
    height: 360,
    ...(onScreen(s.position) && { x: s.position.x, y: s.position.y }),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: s.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    icon: ICON,
    webPreferences: WEB_PREFERENCES
  });
  if (s.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  win.once('ready-to-show', () => { win.show(); collect(); });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let moveTimer = null;
  win.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => { if (win) { const { x, y } = win.getBounds(); settings.write({ position: { x, y } }); } }, 400);
  });
  win.on('closed', () => { win = null; });
}

function showWidget() {
  if (!win) return createWindow();
  win.show();
  win.focus();
  collect();
}

function toggle() {
  if (win && win.isVisible()) win.hide();
  else showWidget();
}

function openDashboard() {
  if (dash && !dash.isDestroyed()) {
    dash.show();
    dash.focus();
    return;
  }
  dash = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 760,
    minHeight: 520,
    title: t('dash.title'),
    autoHideMenuBar: true,
    backgroundColor: uiState().theme === 'dark' ? '#18181c' : '#f6f5f2',
    show: false,
    icon: ICON,
    webPreferences: WEB_PREFERENCES
  });
  dash.setMenuBarVisibility(false);
  dash.loadFile(path.join(__dirname, 'src/renderer/dashboard.html'));
  dash.once('ready-to-show', () => dash.show());
  dash.webContents.on('will-navigate', (e) => e.preventDefault());
  dash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  dash.on('closed', () => { dash = null; });
}

// --- settings side effects ------------------------------------------------------
function registerShortcut(accelerator) {
  if (registeredShortcut === accelerator) return;
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  registeredShortcut = null;
  if (!accelerator) return;
  try {
    if (globalShortcut.register(accelerator, toggle)) registeredShortcut = accelerator;
  } catch { /* taken by another application */ }
}

function applySettings() {
  const s = settings.read();
  registerShortcut(s.shortcut);
  if (win) win.setAlwaysOnTop(s.alwaysOnTop, 'floating');
  if (app.isPackaged && process.platform !== 'linux') {
    app.setLoginItemSettings({
      openAtLogin: s.autoStart,
      ...(process.platform === 'win32' && { path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe') })
    });
  }
  buildTrayMenu();
  if (dash && !dash.isDestroyed()) dash.setTitle(t('dash.title'));
}

// --- IPC: only our own two windows may call --------------------------------------
function trusted(event) {
  return windows().some((w) => event.sender === w.webContents && event.senderFrame === w.webContents.mainFrame);
}
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Forbidden');
    return fn(...args);
  });
}
function on(channel, fn) {
  ipcMain.on(channel, (event, ...args) => { if (trusted(event)) fn(event, ...args); });
}

async function saveText(parent, defaultName, filter, text) {
  const result = await dialog.showSaveDialog(parent, { defaultPath: defaultName, filters: [filter] });
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, text, 'utf8');
  return result.filePath;
}

function registerIpc() {
  on('refresh', collect);
  on('hide', (e) => { if (win && e.sender === win.webContents) win.hide(); });
  on('quit', () => app.quit());
  on('open-dashboard', openDashboard);
  on('resize', (e, h) => {
    if (!win || e.sender !== win.webContents) return;
    const height = Math.max(120, Math.min(900, Math.round(Number(h) || 0)));
    win.setSize(WIDTH, height);
  });

  handle('ui:get', () => uiState());
  handle('dashboard:get', async () => {
    if (!engine.last()) await collect();
    return { ...engine.dashboard(Date.now()), ui: uiState(), settings: publicSettings() };
  });

  handle('settings:save', async (input) => {
    const before = settings.read();
    // The window position is owned by the main process, never by the interface.
    const next = sanitize({ ...(input && typeof input === 'object' ? input : {}), position: before.position }, before);
    settings.write(next);
    engine.reloadProfiles();
    applySettings();
    await collect();
    return publicSettings();
  });

  handle('profiles:pick', async () => {
    const result = await dialog.showOpenDialog(dash || win, { properties: ['openDirectory', 'showHiddenFiles'], defaultPath: app.getPath('home') });
    if (result.canceled || !result.filePaths[0]) return null;
    const dir = result.filePaths[0];
    return { dir, name: path.basename(dir).replace(/^\.claude-?/, '') || 'Principal', hasProjects: fs.existsSync(path.join(dir, 'projects')) };
  });

  // The relay is the only write outside the app's own folder: explicit click only.
  handle('relay:install', async (id) => {
    let result;
    try {
      result = engine.relay.install(String(id));
    } catch (err) {
      result = { ok: false, reason: 'error', message: String(err.message || err) };
    }
    await collect();
    return result;
  });
  handle('relay:uninstall', async (id) => {
    let result;
    try {
      result = engine.relay.uninstall(String(id));
    } catch (err) {
      result = { ok: false, reason: 'error', message: String(err.message || err) };
    }
    await collect();
    return result;
  });

  handle('pricing:edit', () => {
    const file = engine.ensureUserPricing();
    shell.showItemInFolder(file);
    return engine.reloadPricing();
  });
  handle('pricing:reload', async () => {
    const info = engine.reloadPricing();
    await collect();
    return info;
  });

  handle('export:csv', async (kind, id) => {
    if (!['projects', 'models', 'daily', 'history'].includes(kind)) return false;
    const text = engine.csv(kind, String(id));
    if (text == null) return false;
    return Boolean(await saveText(dash || win, `ai-usage-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, { name: 'CSV', extensions: ['csv'] }, '\uFEFF' + text));
  });
  handle('export:report', async (range) => {
    const data = engine.reportData(Date.now(), range === 'last30' ? 'last30' : 'month');
    const html = buildReport(data, lang());
    const file = await saveText(dash || win, `ai-usage-${new Date().toISOString().slice(0, 7)}.html`, { name: 'HTML', extensions: ['html'] }, html);
    if (file) shell.showItemInFolder(file);
    return Boolean(file);
  });
}

function publicSettings() {
  const s = settings.read();
  return {
    warn: s.warn, danger: s.danger, alerts: s.alerts, theme: s.theme, language: s.language, autoStart: s.autoStart,
    alwaysOnTop: s.alwaysOnTop, trayPercent: s.trayPercent, showCosts: s.showCosts, showCodex: s.showCodex, shortcut: s.shortcut,
    profiles: s.profiles,
    detected: engine.profileList()
  };
}

// --- lifecycle ----------------------------------------------------------------
app.on('second-instance', showWidget);
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

app.whenReady().then(() => {
  // Zero network: block every request that is not a local file.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !/^(file|devtools|chrome-extension):/i.test(details.url) });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  registerIpc();
  createWindow();
  tray = new Tray(baseTrayIcon());
  tray.on('click', toggle);
  applySettings();
  nativeTheme.on('updated', () => { if (settings.read().theme === 'system') collect(); });

  timer = setInterval(collect, POLL_MS);

  // Dev only: AI_USAGE_OPEN_DASHBOARD=1 opens the dashboard at startup.
  if (!app.isPackaged && process.env.AI_USAGE_OPEN_DASHBOARD) openDashboard();
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep living in the tray
app.on('will-quit', () => { clearInterval(timer); globalShortcut.unregisterAll(); });
