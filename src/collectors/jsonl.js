/**
 * Incremental JSONL reader: remembers, per file, how many bytes were already
 * parsed, so each poll only reads what was appended since the last one.
 */
const fs = require('fs');
const path = require('path');

function listJsonl(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonl(full));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

function createTail() {
  const offsets = new Map(); // file -> { size, pending }

  /** Calls onRecord(obj, file) for every complete new line in every file. */
  function readNew(files, onRecord, { minMtimeMs = 0 } = {}) {
    for (const file of files) {
      let st;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      if (st.mtimeMs < minMtimeMs && !offsets.has(file)) continue;
      const prev = offsets.get(file) || { size: 0, pending: '' };
      if (st.size < prev.size) { prev.size = 0; prev.pending = ''; } // truncated / rewritten
      if (st.size === prev.size) { offsets.set(file, prev); continue; }

      let chunk;
      try {
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(st.size - prev.size);
        fs.readSync(fd, buf, 0, buf.length, prev.size);
        fs.closeSync(fd);
        chunk = prev.pending + buf.toString('utf8');
      } catch {
        continue;
      }
      const lines = chunk.split('\n');
      const pending = lines.pop(); // last piece may be a half-written line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onRecord(JSON.parse(line), file);
        } catch { /* ignore malformed line */ }
      }
      offsets.set(file, { size: st.size, pending });
    }
  }

  return { readNew };
}

module.exports = { listJsonl, createTail };
