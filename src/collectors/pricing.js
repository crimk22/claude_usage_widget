/**
 * Cost estimate at API list prices. The table lives in pricing.json, which the
 * Herdr claude-usage panel reads too: edit prices there, in one place only.
 * For subscription profiles the result is an "API-equivalent" value.
 */
const PRICES = require('./pricing.json').models;

const priceOf = (model) => PRICES.find(([p]) => typeof model === 'string' && model.startsWith(p)) || null;

/** Cost in USD of one usage record, or null when the model is unknown. */
function costOf(model, u) {
  const pr = priceOf(model);
  if (!pr) return null;
  const [, pin, pout, pread] = pr;
  const cw = u.cache_creation_input_tokens || 0;
  const w1h = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  return ((u.input_tokens || 0) * pin + (u.output_tokens || 0) * pout + (u.cache_read_input_tokens || 0) * pread +
    (cw - w1h) * pin * 1.25 + w1h * pin * 2) / 1e6;
}

module.exports = { costOf, PRICES };
