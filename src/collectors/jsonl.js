/**
 * Incremental, non-blocking JSONL reader.
 *
 * Remembers, per file, how many bytes were already parsed, so each poll only
 * reads what was appended since the last one. Files are read in chunks with a
 * yield between them, so a month of transcripts never freezes the tray or the
 * window. Incomplete trailing lines are kept as raw bytes (a multi-byte
 * character cut in half by a concurrent write is never decoded early).
 */
const fs = require('fs');
const path = require('path');

const CHUNK = 4 * 1024 * 1024;
const NEWLINE = 0x0a;
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

async function listJsonl(dir, depth = 0) {
  const out = [];
  if (depth > 6) return out;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listJsonl(full, depth + 1)));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

function createTail() {
  const state = new Map(); // file -> { size, pending: Buffer }

  /**
   * Calls onRecord(obj, file) for every complete new line of every file.
   * @param {string[]} files
   * @param {(record: object, file: string) => void} onRecord
   * @param {object} [opts]
   * @param {number} [opts.minMtimeMs]   skip never-seen files older than this
   * @param {string} [opts.mustContain]  cheap pre-filter: lines without this
   *        substring are skipped before JSON.parse (most lines are large and irrelevant)
   */
  async function readNew(files, onRecord, { minMtimeMs = 0, mustContain = '' } = {}) {
    const alive = new Set(files);
    for (const known of state.keys()) if (!alive.has(known)) state.delete(known);

    for (const file of files) {
      let st;
      try {
        st = await fs.promises.stat(file);
      } catch {
        continue;
      }
      if (st.mtimeMs < minMtimeMs && !state.has(file)) continue;
      const cur = state.get(file) || { size: 0, pending: Buffer.alloc(0) };
      if (st.size < cur.size) { cur.size = 0; cur.pending = Buffer.alloc(0); } // truncated / rewritten
      state.set(file, cur);
      if (st.size === cur.size) continue;

      let handle;
      try {
        handle = await fs.promises.open(file, 'r');
        while (cur.size < st.size) {
          const want = Math.min(CHUNK, st.size - cur.size);
          const buf = Buffer.alloc(want);
          const { bytesRead } = await handle.read(buf, 0, want, cur.size);
          if (!bytesRead) break;
          cur.size += bytesRead;
          const data = cur.pending.length ? Buffer.concat([cur.pending, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
          const cut = data.lastIndexOf(NEWLINE);
          if (cut === -1) { cur.pending = Buffer.from(data); continue; }
          cur.pending = Buffer.from(data.subarray(cut + 1));
          for (const line of data.toString('utf8', 0, cut).split('\n')) {
            if (!line || (mustContain && !line.includes(mustContain))) continue;
            try {
              onRecord(JSON.parse(line), file);
            } catch { /* malformed line: ignore */ }
          }
          await yieldToLoop();
        }
      } catch { /* unreadable right now: retry on next poll */ } finally {
        if (handle) await handle.close().catch(() => {});
      }
    }
  }

  return { readNew, trackedFiles: () => state.size };
}

module.exports = { listJsonl, createTail };
