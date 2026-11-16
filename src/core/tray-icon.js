/**
 * tray-icon.js — draws the usage percentage straight into the tray icon.
 *
 * No canvas in the main process, so the icon is painted pixel by pixel into
 * a BGRA bitmap: a rounded square coloured by alert level, with the number
 * in a tiny 3x5 pixel font.
 */
const SIZE = 32;

// 3x5 digit glyphs, one string per row.
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111']
};

const COLORS = {
  normal: [0xc2, 0x5f, 0x3c],
  warn: [0xd9, 0x77, 0x06],
  danger: [0xdc, 0x26, 0x26]
};

function levelFor(pct, warn, danger) {
  if (pct >= danger) return 'danger';
  if (pct >= warn) return 'warn';
  return 'normal';
}

/** @returns {Buffer} SIZE x SIZE BGRA pixels */
function renderBitmap(pct, level) {
  const buf = Buffer.alloc(SIZE * SIZE * 4, 0);
  const [r, g, b] = COLORS[level] || COLORS.normal;
  const radius = 7;

  const setPixel = (x, y, cr, cg, cb) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    buf[i] = cb;
    buf[i + 1] = cg;
    buf[i + 2] = cr;
    buf[i + 3] = 255;
  };

  // Rounded-square background.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x < radius ? radius - x - 0.5 : x >= SIZE - radius ? x - (SIZE - radius) + 0.5 : 0;
      const dy = y < radius ? radius - y - 0.5 : y >= SIZE - radius ? y - (SIZE - radius) + 0.5 : 0;
      if (dx * dx + dy * dy <= radius * radius) setPixel(x, y, r, g, b);
    }
  }

  // Number: two digits at 3x scale, "100" at 2x scale so it still fits.
  const text = String(Math.min(Math.max(Math.round(pct), 0), 100));
  const scale = text.length >= 3 ? 2 : 3;
  const gap = scale === 3 ? 3 : 2;
  const glyphW = 3 * scale;
  const glyphH = 5 * scale;
  const totalW = text.length * glyphW + (text.length - 1) * gap;
  let x0 = Math.floor((SIZE - totalW) / 2);
  const y0 = Math.floor((SIZE - glyphH) / 2);

  for (const ch of text) {
    const rows = GLYPHS[ch];
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (rows[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPixel(x0 + gx * scale + sx, y0 + gy * scale + sy, 255, 255, 255);
          }
        }
      }
    }
    x0 += glyphW + gap;
  }
  return buf;
}

function createPercentIcon(pct, warn, danger) {
  const { nativeImage } = require('electron'); // lazy: keeps renderBitmap testable in plain Node
  const bitmap = renderBitmap(pct, levelFor(pct, warn, danger));
  return nativeImage.createFromBitmap(bitmap, { width: SIZE, height: SIZE, scaleFactor: 2 });
}

module.exports = { createPercentIcon, renderBitmap, levelFor, SIZE };
