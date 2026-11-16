/**
 * Builds a fake home folder with Claude Code and Codex logs, for tests,
 * screenshots and `npm run demo`. Deterministic for a given `now`.
 */
const fs = require('fs');
const path = require('path');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function writeLines(file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
}

function assistant({ t, sid, cwd, model, id, input, output, cacheWrite, cacheRead, w1h = 0 }) {
  return {
    type: 'assistant', timestamp: new Date(t).toISOString(), sessionId: sid, cwd, requestId: `req_${id}`,
    message: {
      id: `msg_${id}`, model, role: 'assistant',
      content: [{ type: 'text', text: 'CONFIDENTIAL-REPLY-TEXT' }],
      usage: {
        input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheWrite,
        cache_read_input_tokens: cacheRead, cache_creation: { ephemeral_1h_input_tokens: w1h, ephemeral_5m_input_tokens: cacheWrite - w1h }
      }
    }
  };
}

/** A month of plausible Claude Code activity for one profile. */
function claudeProfile(dir, { now, seed, projects, models, intensity = 1, activeNow = true }) {
  const rand = rng(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  let n = 0;
  const perProject = new Map();
  const push = (cwd, line) => {
    const folder = cwd.replace(/[:\\/]/g, '-');
    if (!perProject.has(folder)) perProject.set(folder, []);
    perProject.get(folder).push(line);
  };

  for (let d = 34; d >= 0; d--) {
    const dayStart = new Date(now - d * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const weekend = [0, 6].includes(dayStart.getDay());
    const sessions = weekend ? (rand() < 0.25 ? 1 : 0) : 1 + Math.floor(rand() * 3 * intensity);
    for (let s = 0; s < sessions; s++) {
      const cwd = pick(projects);
      const model = pick(models);
      const sid = `sess-${seed}-${d}-${s}`;
      let t = dayStart.getTime() + (8.5 + rand() * 9) * HOUR;
      const replies = 6 + Math.floor(rand() * 30 * intensity);
      let context = 15000 + Math.floor(rand() * 20000);
      push(cwd, { type: 'user', timestamp: new Date(t).toISOString(), sessionId: sid, cwd, message: { role: 'user', content: 'CONFIDENTIAL-PROMPT-TEXT' } });
      for (let r = 0; r < replies; r++) {
        t += (20 + rand() * 160) * 1000;
        if (t >= now) break;
        const output = rand() < 0.45 ? 80 + Math.floor(rand() * 200) : 400 + Math.floor(rand() * 2500);
        const fresh = 500 + Math.floor(rand() * 4000);
        const line = assistant({ t, sid, cwd, model, id: `${seed}_${n++}`, input: 20 + Math.floor(rand() * 400), output, cacheWrite: fresh, cacheRead: context, w1h: rand() < 0.2 ? fresh : 0 });
        push(cwd, line);
        if (rand() < 0.1) push(cwd, line); // streaming duplicate
        context += fresh + output;
      }
    }
  }

  if (activeNow) {
    const cwd = projects[0];
    const sid = `sess-${seed}-live`;
    let context = 148000;
    for (let i = 9; i >= 0; i--) {
      const t = now - i * 70 * 1000 - 20000;
      push(cwd, assistant({ t, sid, cwd, model: models[0], id: `${seed}_live_${i}`, input: 120, output: 900 + i * 40, cacheWrite: 2500, cacheRead: context }));
      context += 3400;
    }
  }

  for (const [folder, lines] of perProject) {
    writeLines(path.join(dir, 'projects', folder, 'transcript.jsonl'), [...lines, '{"type":"assistant","broken":']); // + a half-written line
  }
}

/** Status line input as Claude Code hands it over (only the fields the widget reads). */
function writeStatusline(dir, { now, ageMs = 4 * 60 * 1000, session, weekly, sessionResetIn = 1.6 * HOUR, weeklyResetIn = 3.2 * DAY, rateLimits = true }) {
  const file = path.join(dir, 'statusline-last.json');
  const doc = { hook_event_name: 'Status', model: { id: 'claude-opus-5-5' }, workspace: { current_dir: '/x' } };
  if (rateLimits) {
    doc.rate_limits = {
      five_hour: { used_percentage: session, resets_at: Math.round((now + sessionResetIn) / 1000) },
      seven_day: { used_percentage: weekly, resets_at: Math.round((now + weeklyResetIn) / 1000) }
    };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc));
  const at = new Date(now - ageMs);
  fs.utimesSync(file, at, at);
}

function codexSessions(home, { now, primary = 37, secondary = 58 }) {
  const t = now - 26 * 60 * 1000;
  writeLines(path.join(home, '.codex', 'sessions', '2026', 'rollout-demo.jsonl'), [
    { timestamp: new Date(t - 60000).toISOString(), type: 'event_msg', payload: { type: 'token_count', rate_limits: {} } },
    {
      timestamp: new Date(t).toISOString(), type: 'event_msg',
      payload: {
        type: 'token_count', info: {},
        rate_limits: {
          plan_type: 'plus',
          primary: { used_percent: primary, window_minutes: 300, resets_at: Math.round((now + 2.4 * HOUR) / 1000) },
          secondary: { used_percent: secondary, window_minutes: 10080, resets_at: Math.round((now + 4.1 * DAY) / 1000) }
        }
      }
    }
  ]);
}

/** Synthetic history of official readings + a learned calibration, as state.json holds them. */
function seedState(dataDir, profileId, { now, ratio = 9 }) {
  const history = [];
  for (let t = now - 21 * DAY; t < now - HOUR; t += 25 * 60 * 1000) {
    const d = new Date(t);
    if (d.getHours() < 9 || d.getHours() > 18 || [0, 6].includes(d.getDay())) continue;
    const sessionStart = Math.floor(t / (5 * HOUR)) * 5 * HOUR;
    const weekStart = Math.floor(t / (7 * DAY)) * 7 * DAY;
    const peak = 45 + ((sessionStart / HOUR) % 7) * 9;
    history.push({
      t,
      s: Math.round(Math.min(100, ((t - sessionStart) / (5 * HOUR)) * peak * 1.15) * 10) / 10,
      w: Math.round(Math.min(100, ((t - weekStart) / (7 * DAY)) * 80) * 10) / 10,
      sr: sessionStart + 5 * HOUR,
      wr: weekStart + 7 * DAY
    });
  }
  const state = { history: { [profileId]: history }, calibration: { [profileId]: { last: null, ratios: { session: [ratio, ratio * 1.1, ratio * 0.9, ratio], weekly: [ratio / 12, ratio / 11, ratio / 13] } } } };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(state));
}

/** Full demo home: a subscription profile, an API profile, and Codex. */
function buildDemoHome(home, now = Date.now()) {
  const win = (name) => `C:\\Users\\demo\\projets\\${name}`;
  claudeProfile(path.join(home, '.claude'), {
    now, seed: 11, intensity: 1.2,
    projects: [win('portail-client'), win('appel-offres'), win('supervision'), win('crm-sync')],
    models: ['claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2']
  });
  writeStatusline(path.join(home, '.claude'), { now, session: 58, weekly: 41 });
  claudeProfile(path.join(home, '.claude-api'), {
    now, seed: 23, intensity: 0.5, activeNow: false,
    projects: ['/home/demo/batch-rapports', '/home/demo/chatbot'],
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-nova-9']
  });
  codexSessions(home, { now });
  return home;
}

module.exports = { buildDemoHome, claudeProfile, writeStatusline, codexSessions, seedState, assistant, writeLines, HOUR, DAY };
