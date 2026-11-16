/**
 * statusline.js — optional relay that lets the widget see the official quota.
 *
 * Claude Code passes its status line command a JSON document on stdin. For
 * subscription plans it includes "rate_limits" (5-hour and 7-day usage). The
 * relay is a tiny script that saves that JSON, untouched, to
 * <profile dir>/statusline-last.json. It parses nothing, calls nothing, and
 * sends nothing anywhere.
 *
 * This is the only place where the app writes outside its own data folder,
 * and it only happens when the user clicks "install":
 *   - settings.json is backed up first (settings.json.ai-usage-backup),
 *   - an existing status line is preserved: on macOS/Linux the relay chains to
 *     it; on Windows, where chaining to an arbitrary command cannot be done
 *     safely, the app shows a two-line snippet to paste instead,
 *   - uninstall puts the previous configuration back.
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'ai-usage-relay';
const SH_NAME = `${MARKER}.sh`;
const PS_NAME = `${MARKER}.ps1`;
const ORIGINAL_NAME = `${MARKER}-original.txt`;
const BACKUP_NAME = 'settings.json.ai-usage-backup';

const SH_SCRIPT = `#!/bin/sh
# AI Usage Widget relay - saves the status line input for the local widget.
# It writes one local file and sends nothing anywhere. Remove it from the widget settings.
dir="$(cd "$(dirname "$0")" && pwd)"
input="$(cat)"
tmp="$dir/.statusline-last.$$"
printf '%s' "$input" > "$tmp" 2>/dev/null && mv -f "$tmp" "$dir/statusline-last.json" 2>/dev/null
orig="$dir/${ORIGINAL_NAME}"
if [ -s "$orig" ]; then
  printf '%s' "$input" | sh "$orig"
fi
`;

const PS_SCRIPT = `# AI Usage Widget relay - saves the status line input for the local widget.
# It writes one local file and sends nothing anywhere. Remove it from the widget settings.
$ErrorActionPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = [Console]::In.ReadToEnd()
$tmp = Join-Path $dir ('.statusline-last.' + $PID)
[System.IO.File]::WriteAllText($tmp, $raw, $utf8)
Move-Item -Force -LiteralPath $tmp -Destination (Join-Path $dir 'statusline-last.json')
`;

/**
 * Lines to paste into an existing PowerShell status line script, for the given
 * profile folder (works with the Windows PowerShell 5.1 shipped with Windows).
 */
function snippetFor(dir) {
  const target = path.join(dir, 'statusline-last.json').replace(/\\/g, '/').replace(/'/g, "''");
  return `# AI Usage Widget : garder une copie de l'entree de la status line.
# $raw doit contenir le texte JSON lu sur l'entree standard, par exemple : $raw = [Console]::In.ReadToEnd()
[System.IO.File]::WriteAllText('${target}', $raw, (New-Object System.Text.UTF8Encoding($false)))`;
}

function readSettings(dir) {
  const file = path.join(dir, 'settings.json');
  if (!fs.existsSync(file)) return { file, data: {}, exists: false };
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const data = JSON.parse(text); // throws on invalid JSON: callers refuse to touch the file
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.json is not a JSON object');
  return { file, data, exists: true };
}

function commandOf(data) {
  const sl = data.statusLine;
  return sl && typeof sl === 'object' && typeof sl.command === 'string' ? sl.command : null;
}

/**
 * @returns {{mode:'none'|'ours'|'foreign'|'unreadable', command:string|null, canInstall:boolean,
 *            chained:boolean, lastRelayAt:number|null}}
 * mode: none = no status line; ours = relay installed; foreign = another status line is configured.
 */
function status(dir, platform = process.platform) {
  let lastRelayAt = null;
  try {
    lastRelayAt = fs.statSync(path.join(dir, 'statusline-last.json')).mtimeMs;
  } catch { /* never ran */ }
  let command;
  try {
    command = commandOf(readSettings(dir).data);
  } catch {
    return { mode: 'unreadable', command: null, canInstall: false, chained: false, lastRelayAt };
  }
  const chained = fs.existsSync(path.join(dir, ORIGINAL_NAME));
  if (!command) return { mode: 'none', command: null, canInstall: true, chained: false, lastRelayAt };
  if (command.includes(MARKER)) return { mode: 'ours', command, canInstall: false, chained, lastRelayAt };
  // An existing status line can be chained on POSIX shells only.
  const canInstall = platform !== 'win32';
  return { mode: 'foreign', command, canInstall, chained: false, lastRelayAt, ...(!canInstall && { snippet: snippetFor(dir) }) };
}

function writeAtomic(file, text, mode) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

function install(dir, platform = process.platform) {
  const st = status(dir, platform);
  if (st.mode === 'ours') return { ok: true, already: true };
  if (!st.canInstall) return { ok: false, reason: st.mode === 'unreadable' ? 'unreadable' : 'manual' };

  const { file, data, exists } = readSettings(dir);
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, BACKUP_NAME);
  if (exists && !fs.existsSync(backup)) fs.copyFileSync(file, backup);

  let command;
  if (platform === 'win32') {
    const script = path.join(dir, PS_NAME);
    writeAtomic(script, PS_SCRIPT);
    command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${script.replace(/\\/g, '/')}"`;
  } else {
    const script = path.join(dir, SH_NAME);
    writeAtomic(script, SH_SCRIPT, 0o755);
    fs.chmodSync(script, 0o755);
    if (st.command) writeAtomic(path.join(dir, ORIGINAL_NAME), st.command + '\n');
    command = `sh "${script}"`;
  }

  const previous = data.statusLine && typeof data.statusLine === 'object' ? data.statusLine : {};
  data.statusLine = { ...previous, type: 'command', command };
  writeAtomic(file, JSON.stringify(data, null, 2) + '\n');
  return { ok: true, already: false, chained: Boolean(st.command) };
}

function uninstall(dir) {
  const st = status(dir);
  if (st.mode !== 'ours') return { ok: true, already: true };
  const { file, data } = readSettings(dir);
  const originalFile = path.join(dir, ORIGINAL_NAME);
  let original = null;
  try {
    original = fs.readFileSync(originalFile, 'utf8').trim() || null;
  } catch { /* nothing was chained */ }

  if (original) data.statusLine = { ...data.statusLine, command: original };
  else delete data.statusLine;
  writeAtomic(file, JSON.stringify(data, null, 2) + '\n');

  for (const name of [SH_NAME, PS_NAME, ORIGINAL_NAME]) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch { /* not there */ }
  }
  return { ok: true, already: false, restored: Boolean(original) };
}

module.exports = { status, install, uninstall, snippetFor, MARKER };
