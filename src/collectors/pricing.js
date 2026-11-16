/**
 * Cost estimate at API list prices.
 *
 * Price table lookup order (first that exists and is valid wins):
 *   1. file named by the AI_USAGE_PRICING environment variable
 *   2. <userData>/pricing.json   (your own copy: survives app updates)
 *   3. the bundled pricing.json  (shared with the Herdr claude-usage panel)
 *
 * Row format: [model prefix, input, output, cacheRead] in USD per 1M tokens.
 * Cache writes cost 1.25x input (5 min) or 2x input (1 h). First matching
 * prefix wins, so longer prefixes are sorted first automatically.
 * For subscription profiles the result is an "API-equivalent" value.
 */
const fs = require('fs');
const path = require('path');

const BUNDLED = path.join(__dirname, 'pricing.json');

function parseTable(raw) {
  const rows = raw && Array.isArray(raw.models) ? raw.models : null;
  if (!rows) return null;
  const clean = rows.filter((r) => Array.isArray(r) && typeof r[0] === 'string' && r[0] &&
    [r[1], r[2], r[3]].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0));
  if (!clean.length) return null;
  // Longest prefix first: "claude-opus-5-5" must win over "claude-opus-5".
  return clean.map((r) => r.slice(0, 4)).sort((a, b) => b[0].length - a[0].length);
}

function readTable(file) {
  try {
    return parseTable(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
  } catch {
    return null;
  }
}

/** @returns {{ models: Array, source: 'env'|'user'|'bundled', file: string }} */
function loadPricing({ userDir = null, env = process.env } = {}) {
  const candidates = [];
  if (env.AI_USAGE_PRICING) candidates.push(['env', env.AI_USAGE_PRICING]);
  if (userDir) candidates.push(['user', path.join(userDir, 'pricing.json')]);
  candidates.push(['bundled', BUNDLED]);
  for (const [source, file] of candidates) {
    const models = readTable(file);
    if (models) return { models, source, file };
  }
  return { models: [], source: 'bundled', file: BUNDLED };
}

function createPricing(models) {
  const priceOf = (model) =>
    (typeof model === 'string' && models.find(([prefix]) => model.startsWith(prefix))) || null;

  /** Cost in USD of one usage record, or null when the model has no price. */
  function costOf(model, u) {
    const pr = priceOf(model);
    if (!pr || !u) return null;
    const [, pin, pout, pread] = pr;
    const cw = u.cache_creation_input_tokens || 0;
    const w1h = Math.min((u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0, cw);
    return ((u.input_tokens || 0) * pin + (u.output_tokens || 0) * pout + (u.cache_read_input_tokens || 0) * pread +
      (cw - w1h) * pin * 1.25 + w1h * pin * 2) / 1e6;
  }

  return { costOf, priceOf, models };
}

const bundled = createPricing(readTable(BUNDLED) || []);

module.exports = { loadPricing, createPricing, parseTable, costOf: bundled.costOf, PRICES: bundled.models };
