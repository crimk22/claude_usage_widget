/**
 * API list prices, USD per 1M tokens: [model prefix, input, output, cacheRead].
 * Cache writes cost 1.25x input (5 min TTL) or 2x input (1 h TTL).
 * Same table as the Herdr claude-usage panel, so both show the same numbers.
 * For subscription profiles the result is an "API-equivalent" value.
 */
const PRICES = [
  ['claude-fable-5-2', 8, 40, 0.2], ['claude-mythos-5-2', 8, 40, 0.2],
  ['claude-fable-5-1', 10, 50, 1], ['claude-fable-5', 10, 50, 1],
  ['claude-opus-5-5', 4, 20, 0.2], ['claude-opus-5', 5, 25, 0.5],
  ['claude-opus-4', 5, 25, 0.5],
  ['claude-sonnet-5-5', 2, 10, 0.1], ['claude-sonnet-5', 2, 10, 0.2],
  ['claude-sonnet-4', 3, 15, 0.3],
  ['claude-haiku-5-5', 0.1, 0.5, 0.01], ['claude-haiku-4', 1, 5, 0.1]
];

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
