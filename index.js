/**
 * File Change Tracker — Host half.
 *
 * Captures every file/folder change an AI agent produces, through three
 * cooperating layers, none of which touch the model or consume tokens:
 *
 *  1. Tool layer — an observe-only wrapper around the `tools/execute`
 *     waterfall: for ANY tool (built-in edit/write, MCP filesystem tools,
 *     browser downloads, shell commands), path-like strings are extracted
 *     from the call arguments, stat-snapshotted before dispatch and
 *     compared after, so creates/modifies/deletes/renames are recorded with
 *     exact paths wherever they live on disk.
 *  2. Watcher layer — while any agent is running, the effective working
 *     directories of running sessions are watched (recursively where the
 *     platform supports it), so files produced by spawned scripts and
 *     subprocesses inside the workspace are caught too, with rename pairing.
 *  3. Attribution — `agent/status` transitions delimit rounds (轮次); every
 *     record carries { sessionId, title, round, kind, path, ... }.
 *
 * Records are kept in a bounded in-memory ring (for live polling) and
 * appended as JSONL per session under a configurable log directory
 * (default: <DSH data dir>/file-tracker/logs). A small set of webServer
 * routes behind the standard `connection` trust fence serves the browser
 * half: incremental polling, history paging, settings, log management, and
 * "reveal in file manager".
 */
import { spawn } from 'node:child_process';
import { watch as fsWatch } from 'node:fs';
import { appendFile, mkdir, open as fsOpen, readdir, readFile, rename as fsRename, rm, stat as fsStat, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, normalize, resolve as pathResolve, sep } from 'node:path';

export const name = 'file-tracker';

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

const isWin = platform() === 'win32';

function lower(p) {
  return isWin ? String(p).toLowerCase() : String(p);
}

function nowMs() {
  return Date.now();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function statOrNull(path) {
  try {
    const s = await fsStat(path);
    return { exists: true, isDir: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs, ctimeMs: s.ctimeMs };
  } catch {
    try {
      // A dangling symlink still "exists" for our purposes.
      const { lstat } = await import('node:fs/promises');
      const s = await lstat(path);
      return { exists: true, isDir: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs, ctimeMs: s.ctimeMs };
    } catch {
      return { exists: false };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Plugin data directory and settings                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_EXCLUSIONS = [
  'node_modules', '.git', '.svn', '.hg', '__pycache__',
  '.venv', 'venv', '.next', '.nuxt', '.cache', '.pnpm-store',
  '.gradle', '.pytest_cache', '.mypy_cache', '.tox', '.turbo',
];

function defaultSettings() {
  return {
    enabled: true,
    logDir: '',            // '' = <dataDir>/logs
    retentionDays: 30,
    excludedSummary: true, // aggregate one-line records for excluded folders
    exclusions: [...DEFAULT_EXCLUSIONS],
    ui: {
      opacity: 0.96,
      scale: 1,
      position: null,      // { x, y } viewport px, or null = default corner
      showOnEvent: true,
    },
  };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function sanitizeSettings(input, base) {
  const out = { ...base, ui: { ...base.ui } };
  if (typeof input !== 'object' || input === null) return out;
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
  if (typeof input.excludedSummary === 'boolean') out.excludedSummary = input.excludedSummary;
  if (typeof input.logDir === 'string') {
    const dir = input.logDir.trim();
    out.logDir = dir === '' || isAbsolute(dir) ? dir : base.logDir;
  }
  if (input.retentionDays !== undefined) out.retentionDays = Math.round(clampNumber(input.retentionDays, 1, 3650, base.retentionDays));
  if (Array.isArray(input.exclusions)) {
    out.exclusions = input.exclusions
      .filter((e) => typeof e === 'string')
      .map((e) => e.trim().replace(/[\\/]+$/, ''))
      .filter((e) => e !== '')
      .slice(0, 200);
  }
  if (typeof input.ui === 'object' && input.ui !== null) {
    const ui = input.ui;
    if (ui.opacity !== undefined) out.ui.opacity = clampNumber(ui.opacity, 0.3, 1, base.ui.opacity);
    if (ui.scale !== undefined) out.ui.scale = clampNumber(ui.scale, 0.75, 1.5, base.ui.scale);
    if (ui.showOnEvent !== undefined && typeof ui.showOnEvent === 'boolean') out.ui.showOnEvent = ui.showOnEvent;
    if (ui.position === null) out.ui.position = null;
    else if (typeof ui.position === 'object' && ui.position !== null) {
      const x = clampNumber(ui.position.x, 0, 100000, 0);
      const y = clampNumber(ui.position.y, 0, 100000, 0);
      out.ui.position = { x, y };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Path extraction from arbitrary tool arguments                        */
/* ------------------------------------------------------------------ */

const ABS_WIN = /^[A-Za-z]:[\\/]/;
const PATH_KEYS = new Set([
  'file_path', 'filepath', 'path', 'savepath', 'save_path', 'target',
  'source', 'destination', 'dest', 'old_path', 'new_path', 'directory',
  'workdir', 'cwd', 'output', 'outfile', 'config',
]);

function looksAbsolute(s) {
  return ABS_WIN.test(s) || (s.startsWith('/') && s.length > 1 && !s.includes('\0'));
}

/** Extract absolute-path candidate strings from any JSON-ish tool argument. */
function collectCandidates(value, out, depth = 0) {
  if (depth > 6 || out.size > 40) return;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.length > 1 && s.length < 2000 && looksAbsolute(s)) out.add(stripQuotes(s));
    else if (s.length > 20 && s.length < 20000) {
      // Command text: mine quoted Windows paths (may contain spaces), bare
      // Windows paths, and quoted POSIX paths.
      const reQuoted = /["']([A-Za-z]:[\\/][^"'<>|\r\n]*)["']/g;
      let mq;
      while ((mq = reQuoted.exec(s)) !== null && out.size < 40) {
        out.add(mq[1].replace(/[.,;]+$/, ''));
      }
      const re = /(?:[A-Za-z]:\\[^\s"'`|<>*?;,)\]]+)|(?:'\/[^']+')|(?:"\/[^"]+")/g;
      let m;
      while ((m = re.exec(s)) !== null && out.size < 40) {
        out.add(stripQuotes(m[0]));
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCandidates(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && PATH_KEYS.has(k.toLowerCase())) {
        const s = stripQuotes(v.trim());
        if (looksAbsolute(s)) out.add(s);
      }
      collectCandidates(v, out, depth + 1);
    }
  }
}

function stripQuotes(s) {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Editor/atomic-write scratch files that are pure noise: Windows `~RF*.TMP`
 * backups, `*.tmp`, DSH atomic-write `*.tmpdir` trees, vim swaps, neovim's
 * 4913 probe, and `.DS_Store`.
 */
const NOISE_RE = /(?:~RF[0-9A-Fa-f]+\.TMP$)|(?:\.tmpdir(?:[\\/]|$))|(?:[\\/]4913$)|(?:\.s?wpx?$)|(?:[\\/]\.DS_Store$)|(?:\.tmp$)/i;

function isNoisePath(p) {
  return NOISE_RE.test(String(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Recursively total a directory's file sizes with a hard entry budget;
 * bigger trees report an approximate sum (flagged) instead of stalling.
 */
async function dirSize(root) {
  let total = 0;
  let entries = 0;
  let approx = false;
  try {
    await readdir(root);
  } catch {
    return { size: 0, approx: false, readable: false };
  }
  const stack = [root];
  while (stack.length > 0) {
    const d = stack.pop();
    let ents;
    try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (entries++ > 20000) { approx = true; break; }
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try { const s = await fsStat(p); total += s.size; } catch { /* skip unreadable */ }
      }
    }
    if (approx) break;
  }
  return { size: total, approx, readable: true };
}

/* ------------------------------------------------------------------ */
/* Plugin body                                                          */
/* ------------------------------------------------------------------ */

export function apply(ctx) {
  const HOST_EPOCH = Date.now();
  const svc = (n) => {
    try {
      return typeof ctx.get === 'function' ? ctx.get(n) : ctx[n];
    } catch {
      return undefined;
    }
  };
  const log = {
    info: (...a) => { try { ctx.logger?.info?.(...a); } catch { /* ignore */ } },
    warn: (...a) => { try { ctx.logger?.warn?.(...a); } catch { /* ignore */ } },
  };

  /* ---------------- data dir & settings ---------------- */

  const dataDir = pathResolve(
    process.env.DSH_FILE_TRACKER_HOME
    || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'file-tracker') : '')
    || join(homedir(), '.dsh', 'file-tracker'),
  );
  let settings = defaultSettings();
  let settingsReady = (async () => {
    try {
      await mkdir(dataDir, { recursive: true });
      const raw = await readFile(join(dataDir, 'settings.json'), 'utf8');
      settings = sanitizeSettings(JSON.parse(raw), defaultSettings());
    } catch { /* first run: defaults */ }
    try {
      await mkdir(logDir(), { recursive: true });
      const probe = join(logDir(), '.write-probe');
      await writeFile(probe, 'ok', 'utf8');
      await rm(probe, { force: true });
    } catch (e) {
      // A configured logDir from another machine / dead disk must never brick
      // the plugin: fall back to the per-machine default and warn.
      if (settings.logDir) {
        log.warn(`[file-tracker] configured logDir unusable (${errorMessage(e)}); falling back to default`);
        settings.logDir = '';
        await mkdir(logDir(), { recursive: true }).catch(() => {});
      } else {
        log.warn(`[file-tracker] cannot create log dir: ${errorMessage(e)}`);
      }
    }
    await restoreSeq();
  })();

  /** Continue the sequence space after a reload so JSONL seqs stay unique. */
  async function restoreSeq() {
    try {
      const dir = logDir();
      const top = await readdir(dir);
      const files = [];
      for (const entry of top) {
        if (entry.endsWith('.jsonl')) files.push(join(dir, entry));
        else {
          // Workspace subfolders.
          try {
            const st = await statOrNull(join(dir, entry));
            if (st.exists && st.isDir) {
              for (const f of await readdir(join(dir, entry))) {
                if (f.endsWith('.jsonl')) files.push(join(dir, entry, f));
              }
            }
          } catch { /* ignore */ }
        }
      }
      let max = 0;
      for (const p of files) {
        const s = await statOrNull(p);
        if (!s.exists || s.size === 0) continue;
        const fh = await fsOpen(p, 'r');
        try {
          const len = Math.min(s.size, 65536);
          const buf = Buffer.alloc(len);
          await fh.read(buf, 0, len, s.size - len);
          const text = buf.toString('utf8');
          const matches = text.match(/"seq":(\d+)/g) ?? [];
          for (const m of matches) {
            const n = Number(m.slice(6));
            if (Number.isFinite(n) && n > max) max = n;
          }
          // Continue each session's round counter across reloads.
          let fileMaxRound = 0;
          const rMatches = text.match(/"round":(\d+)/g) ?? [];
          for (const rm of rMatches) {
            const n = Number(rm.slice(8));
            if (Number.isFinite(n) && n > fileMaxRound) fileMaxRound = n;
          }
          if (fileMaxRound > 0) {
            const fileSid = basename(p).slice(0, -'.jsonl'.length);
            if (fileMaxRound > (rounds.get(fileSid) ?? 0)) rounds.set(fileSid, fileMaxRound);
          }
        } finally {
          await fh.close();
        }
      }
      if (max > globalSeq) globalSeq = max;
    } catch { /* fresh installation */ }
  }

  function logDir() {
    return settings.logDir && isAbsolute(settings.logDir) ? settings.logDir : join(dataDir, 'logs');
  }

  let saveChain = Promise.resolve();
  function saveSettings() {
    saveChain = saveChain.then(async () => {
      try {
        await mkdir(dataDir, { recursive: true });
        const tmp = join(dataDir, 'settings.json.tmp');
        await writeFile(tmp, JSON.stringify(settings, null, 2), 'utf8');
        await fsRename(tmp, join(dataDir, 'settings.json'));
      } catch (e) {
        log.warn(`[file-tracker] settings save failed: ${errorMessage(e)}`);
      }
    }).catch(() => {});
    return saveChain;
  }

  /* ---------------- session index (titles/cwd) ---------------- */

  const sessionIndex = new Map(); // sessionId -> { title, cwd, wsId, lastTs }
  const wsIndex = new Map();      // workspaceId -> { slug, name, path }
  const sidWs = new Map();        // sessionId -> workspaceId

  function sessionIndexFile() {
    return join(logDir(), 'index.json');
  }

  let indexSaveTimer = null;
  function scheduleIndexSave() {
    if (indexSaveTimer !== null) return;
    indexSaveTimer = setTimeout(() => {
      indexSaveTimer = null;
      const payload = {
        v: 2,
        workspaces: Object.fromEntries(wsIndex),
        sessions: Object.fromEntries(sessionIndex),
      };
      writeFile(sessionIndexFile(), JSON.stringify(payload, null, 1), 'utf8')
        .catch(() => {});
    }, 4000);
    if (indexSaveTimer.unref) indexSaveTimer.unref();
  }

  function loadIndexSync() {
    return readFile(sessionIndexFile(), 'utf8')
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.v === 2) {
            for (const [k, v] of Object.entries(parsed.workspaces ?? {})) {
              if (!wsIndex.has(k)) wsIndex.set(k, v);
            }
            for (const [k, v] of Object.entries(parsed.sessions ?? {})) {
              if (!sessionIndex.has(k)) sessionIndex.set(k, v);
              if (v?.wsId) sidWs.set(k, v.wsId);
            }
          } else if (parsed && typeof parsed === 'object') {
            // Legacy flat format: sessionId -> meta.
            for (const [k, v] of Object.entries(parsed)) {
              if (!sessionIndex.has(k)) sessionIndex.set(k, v);
            }
          }
        } catch { /* corrupt index: ignore */ }
      })
      .catch(() => {});
  }

  /* ---------------- workspace attribution ---------------- */

  function sanitizeSlug(s) {
    return String(s).replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'workspace';
  }

  function hash4(s) {
    let hsh = 5381;
    for (const ch of String(s)) hsh = ((hsh << 5) + hsh + ch.charCodeAt(0)) | 0;
    return (hsh >>> 0).toString(36).slice(0, 4);
  }

  function wsNameOf(w) {
    return (w && (w.title || w.name)) || (w && w.path ? basename(w.path) : undefined);
  }

  function slugForWs(wsId, name, path) {
    const existing = wsIndex.get(wsId);
    if (existing) return existing.slug;
    let slug = sanitizeSlug(name || (path ? basename(path) : '') || 'workspace');
    for (const [id, meta] of wsIndex) {
      if (id !== wsId && meta.slug === slug) {
        slug = `${slug}-${hash4(path || wsId)}`;
        break;
      }
    }
    wsIndex.set(wsId, { slug, name: name || slug, path: path || '' });
    scheduleIndexSave();
    return slug;
  }

  function wsOfSession(sessionId) {
    const cached = sidWs.get(sessionId);
    if (cached && wsIndex.has(cached)) return cached;
    const cwd = cwdOf(sessionId);
    let ws = null;
    try {
      const reg = svc('workspaceRegistry');
      if (reg && cwd) ws = reg.resolveByPath?.(cwd) ?? null;
      if (!ws && reg?.list && cwd) {
        let best = null;
        for (const w of reg.list() ?? []) {
          if (!w?.path) continue;
          const base = lower(String(w.path).replace(/[\\/]+$/, ''));
          const lc = lower(cwd);
          if (lc === base || lc.startsWith(base + '\\') || lc.startsWith(base + '/')) {
            if (!best || base.length > best.base.length) best = { w, base };
          }
        }
        ws = best?.w ?? null;
      }
    } catch { /* ignore */ }
    const wsId = ws?.id ?? (cwd ? `path:${lower(cwd)}` : 'unknown');
    sidWs.set(sessionId, wsId);
    slugForWs(wsId, wsNameOf(ws) ?? (cwd ? basename(cwd) : '') ?? 'unknown', ws?.path ?? cwd ?? '');
    return wsId;
  }

  function slugForSession(sessionId) {
    const wsId = wsOfSession(sessionId);
    return wsIndex.get(wsId)?.slug ?? 'unknown';
  }

  function titleOf(sessionId) {
    try {
      const sessions = svc('sessions');
      const session = sessions?.get?.(sessionId);
      if (!session) return sessionIndex.get(sessionId)?.title;
      const st = svc('sessionTitle');
      const snap = st?.get?.(session);
      const title = snap?.title ?? snap?.current ?? session?.title ?? session?.header?.title;
      return typeof title === 'string' && title ? title : sessionIndex.get(sessionId)?.title;
    } catch {
      return sessionIndex.get(sessionId)?.title;
    }
  }

  function cwdOf(sessionId) {
    try {
      const sessions = svc('sessions');
      const session = sessions?.get?.(sessionId);
      if (!session) return sessionIndex.get(sessionId)?.cwd;
      const wd = svc('workingDirectory');
      const cwd = wd?.get?.(session) ?? session?.cwd ?? session?.header?.cwd;
      return typeof cwd === 'string' && cwd ? cwd : sessionIndex.get(sessionId)?.cwd;
    } catch {
      return sessionIndex.get(sessionId)?.cwd;
    }
  }

  function touchSession(sessionId) {
    const entry = sessionIndex.get(sessionId) ?? {};
    entry.title = titleOf(sessionId) ?? entry.title;
    entry.cwd = cwdOf(sessionId) ?? entry.cwd;
    entry.wsId = wsOfSession(sessionId);
    entry.lastTs = nowMs();
    sessionIndex.set(sessionId, entry);
    scheduleIndexSave();
  }

  /* ---------------- record store ---------------- */

  const MEM_CAP = 5000;
  const mem = [];               // live ring buffer
  let globalSeq = 0;
  const writeQueues = new Map(); // log file path -> promise chain
  const recentRecords = new Map(); // dedupe key -> ts (cross-layer, 3s window)

  const recentToolOps = new Map(); // lower(path) -> ts (watcher dedup window)
  const lastKnownSize = new Map(); // lower(path) -> { size, isDir, ts } (last-known stats across layers)

  function noteSize(path, size, isDir) {
    if (size === undefined && isDir === undefined) return;
    lastKnownSize.set(lower(path), { size, isDir: !!isDir, ts: nowMs() });
    if (lastKnownSize.size > 4000) {
      const cutoff = nowMs() - 600000;
      for (const [k, v] of lastKnownSize) if (v.ts < cutoff) lastKnownSize.delete(k);
    }
  }

  function isOwnPath(p) {
    const lp = lower(p);
    return lp.startsWith(lower(dataDir)) || lp.startsWith(lower(logDir()));
  }

  function isExcluded(p, cwd) {
    if (isOwnPath(p)) return true;
    const rel = cwd && lower(p).startsWith(lower(cwd)) ? p.slice(cwd.length) : p;
    const segments = String(rel).split(/[\\/]+/).filter(Boolean);
    // Never exclude the top-level directory itself.
    const segsToCheck = cwd && lower(p).startsWith(lower(cwd)) ? segments.slice(0, -1) : segments;
    const excl = settings.exclusions;
    for (const seg of segsToCheck) {
      for (const e of excl) {
        if (e.includes('/') || e.includes('\\')) {
          if (lower(p).includes(lower(e))) return true;
        } else if (lower(seg) === lower(e)) {
          return true;
        }
      }
    }
    return false;
  }

  function appendJsonl(sessionId, line) {
    const file = join(logDir(), slugForSession(sessionId), `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_')}.jsonl`);
    const prev = writeQueues.get(file) ?? Promise.resolve();
    const next = prev
      .then(() => mkdir(dirname(file), { recursive: true }))
      .then(() => appendFile(file, line + '\n', 'utf8'))
      .catch((e) => log.warn(`[file-tracker] append failed: ${errorMessage(e)}`));
    writeQueues.set(file, next);
    return next;
  }

  function record(rec) {
    if (!settings.enabled) return null;
    if (!rec || typeof rec.path !== 'string') return null;
    if (isOwnPath(rec.path)) return null;
    const full = {
      seq: ++globalSeq,
      ts: nowMs(),
      sessionId: rec.sessionId ? String(rec.sessionId) : 'unknown',
      round: rec.round ?? 0,
      kind: rec.kind,
      path: rec.path,
      via: rec.via ?? 'tool',
      ...(rec.fromPath ? { fromPath: rec.fromPath } : {}),
      ...(rec.tool ? { tool: rec.tool } : {}),
      ...(rec.isDir !== undefined ? { isDir: !!rec.isDir } : {}),
      ...(rec.size !== undefined ? { size: rec.size } : {}),
      ...(rec.count !== undefined ? { count: rec.count } : {}),
      ...(rec.idle ? { idle: true } : {}),
    };
    const title = titleOf(full.sessionId);
    if (title) full.title = title;
    const wsId = wsOfSession(full.sessionId);
    const wsm = wsIndex.get(wsId);
    if (wsm) {
      full.wsId = wsId;
      full.wsName = wsm.name;
    }
    // Cross-layer dedupe: the watcher and the tool stat-diff can both see the
    // same logical operation (long shell commands); keep the first record.
    const dedupeKey = full.sessionId + '|' + lower(full.path) + '|' + full.kind;
    const lastRec = recentRecords.get(dedupeKey);
    recentRecords.set(dedupeKey, full.ts);
    if (recentRecords.size > 4000) {
      const cutoff = nowMs() - 10000;
      for (const [k, ts] of recentRecords) if (ts < cutoff) recentRecords.delete(k);
    }
    if (lastRec !== undefined && full.ts - lastRec < 3000) return null;
    const finish = () => {
      mem.push(full);
      if (mem.length > MEM_CAP) mem.splice(0, mem.length - MEM_CAP);
      touchSession(full.sessionId);
      appendJsonl(full.sessionId, JSON.stringify(full)).catch(() => {});
      return full;
    };
    // Folders carry their recursive total size (bounded, approximate past the
    // budget) so the user can see how much space an operation consumed.
    if (full.isDir && full.size === undefined && full.kind !== 'delete') {
      return dirSize(full.path)
        .then((ds) => {
          if (ds.readable) {
            full.size = ds.size;
            if (ds.approx) full.sizeApprox = true;
          }
          return finish();
        })
        .catch(() => finish());
    }
    finish();
    return full;
  }

  /* ---------------- rounds & active sessions ---------------- */

  const rounds = new Map();        // sessionId -> current round number
  const activeSessions = new Map(); // sessionId -> { since, stopTimer }

  function markRunning(sessionId) {
    const prev = rounds.get(sessionId) ?? 0;
    rounds.set(sessionId, prev + 1);
    const entry = activeSessions.get(sessionId);
    if (entry?.stopTimer) { clearTimeout(entry.stopTimer); entry.stopTimer = null; }
    activeSessions.set(sessionId, { since: nowMs(), stopTimer: null });
    ensureWatchers();
  }

  function markIdle(sessionId) {
    const entry = activeSessions.get(sessionId);
    if (!entry) return;
    if (entry.stopTimer) clearTimeout(entry.stopTimer);
    // Grace window: tool effects can land slightly after status flips.
    entry.stopTimer = setTimeout(() => {
      entry.stopTimer = null;
      activeSessions.delete(sessionId);
      ensureWatchers();
    }, 6000);
    if (entry.stopTimer.unref) entry.stopTimer.unref();
  }

  /* ---------------- layer 1: tool stat-diff ---------------- */

  const TOOL_STAT_SKIP = new Set(['read', 'glob', 'grep', 'skill', 'todo_write', 'ask_user_question']);

  function snapshotArgs(exec, cwd) {
    const out = new Set();
    try { collectCandidates(exec?.arguments, out); } catch { /* ignore */ }
    // Resolve well-known relative path keys against the session cwd.
    try {
      const args = exec?.arguments;
      if (args && typeof args === 'object' && cwd) {
        for (const [k, v] of Object.entries(args)) {
          if (typeof v === 'string' && PATH_KEYS.has(k.toLowerCase())) {
            const s = stripQuotes(v.trim());
            if (s && !looksAbsolute(s) && !s.includes('\n')) {
              out.add(pathResolve(cwd, s));
            }
          }
        }
      }
    } catch { /* ignore */ }
    const paths = [...out].filter((p) => !isOwnPath(p) && !isNoisePath(p) && !isExcluded(p, cwd)).slice(0, 24);
    return paths;
  }

  async function snapshotStats(paths) {
    const map = new Map();
    await Promise.all(paths.map(async (p) => {
      map.set(p, await statOrNull(p));
    }));
    return map;
  }

  function noteToolOp(path) {
    recentToolOps.set(lower(path), nowMs());
    if (recentToolOps.size > 4000) {
      const cutoff = nowMs() - 10000;
      for (const [k, ts] of recentToolOps) if (ts < cutoff) recentToolOps.delete(k);
    }
  }

  async function observeToolAfter(exec, before, result, sessionId, round, cwd) {
    const after = await snapshotStats([...before.keys()]);
    const gone = [];
    const appeared = [];
    for (const [p, b] of before) {
      const a = after.get(p) ?? { exists: false };
      if (b.exists && !a.exists) gone.push(p);
      else if (!b.exists && a.exists) appeared.push({ path: p, stat: a });
      else if (b.exists && a.exists && !a.isDir && (a.mtimeMs !== b.mtimeMs || a.size !== b.size)) {
        emitFileRecord(sessionId, round, 'modify', p, a, exec?.name);
      }
    }
    // Pair gone/appeared within one call as rename/move.
    const usedAppeared = new Set();
    for (const g of gone) {
      let best = null;
      for (const a of appeared) {
        if (usedAppeared.has(a.path)) continue;
        const sameName = basename(g) === basename(a.path);
        const sameSize = before.get(g)?.size === a.stat.size;
        if (sameName || sameSize) { best = a; break; }
      }
      if (best) {
        usedAppeared.add(best.path);
        const kind = dirname(lower(g)) === dirname(lower(best.path)) ? 'rename' : 'move';
        noteToolOp(g); noteToolOp(best.path);
        noteSize(best.path, best.stat.isDir ? undefined : best.stat.size, best.stat.isDir);
        record({
          sessionId, round, kind, path: best.path, fromPath: g,
          via: 'tool', tool: exec?.name, isDir: best.stat.isDir, size: best.stat.isDir ? undefined : best.stat.size,
        });
      } else {
        noteToolOp(g);
        emitFileRecord(sessionId, round, 'delete', g, { exists: false, isDir: before.get(g)?.isDir, size: before.get(g)?.size }, exec?.name);
      }
    }
    for (const a of appeared) {
      if (usedAppeared.has(a.path)) continue;
      noteToolOp(a.path);
      emitFileRecord(sessionId, round, 'create', a.path, a.stat, exec?.name);
    }
    // Errors with no observable change produce nothing — stat diff is the truth.
    void result;
  }

  function emitFileRecord(sessionId, round, kind, path, statInfo, toolName) {
    noteToolOp(path);
    if (kind !== 'delete') noteSize(path, statInfo?.size, statInfo?.isDir);
    record({
      sessionId, round, kind, path, via: 'tool', tool: toolName,
      ...(statInfo?.isDir !== undefined ? { isDir: statInfo.isDir } : {}),
      ...(statInfo?.size !== undefined && statInfo?.isDir === false ? { size: statInfo.size } : {}),
    });
  }

  ctx.on('tools/execute', async (exec, next) => {
    const toolName = exec?.name;
    let before = null;
    let attribution = null;
    try {
      if (settings.enabled && toolName && !TOOL_STAT_SKIP.has(toolName)) {
        const sessionId = exec?.agent?.id ?? exec?.agent?.sessionId ?? exec?.sessionId;
        if (sessionId) {
          const cwd = cwdOf(sessionId);
          const paths = snapshotArgs(exec, cwd);
          if (paths.length > 0) {
            before = await snapshotStats(paths);
            attribution = { sessionId: String(sessionId), round: rounds.get(String(sessionId)) ?? 0, cwd };
          }
        }
      }
    } catch { /* observation must never break dispatch */ }
    const result = await next();
    if (before && attribution) {
      observeToolAfter(exec, before, result, attribution.sessionId, attribution.round, attribution.cwd)
        .catch((e) => log.warn(`[file-tracker] tool observation failed: ${errorMessage(e)}`));
    }
    return result;
  });

  /* ---------------- layer 2: workspace watchers ---------------- */

  const watchers = new Map();  // lower(root) -> { watcher, cwd, runningSids, idleSids, startedAt, debounce, pendingGone, known, suppressed }
  const RENAME_PAIR_WINDOW = 2500;
  const DEBOUNCE_MS = 600;
  const WATCH_CAP = 12;

  /**
   * Continuous coverage: watch every known workspace root at all times (the
   * user switches workspaces/sessions freely), not only while an agent runs.
   * Running sessions win attribution; idle-period changes fall back to the
   * workspace's most recent session and are flagged `idle`.
   */
  function ensureWatchers() {
    if (!settings.enabled) return;
    const wanted = new Map(); // lower(root) -> { root, running: [], idle: [] }
    const addRoot = (root, sid, running) => {
      if (!root || !isAbsolute(root)) return;
      const key = lower(root);
      const e = wanted.get(key) ?? { root, running: [], idle: [] };
      if (sid) (running ? e.running : e.idle).push(sid);
      wanted.set(key, e);
    };
    for (const sid of activeSessions.keys()) addRoot(cwdOf(sid), sid, true);
    for (const [sid, meta] of sessionIndex) addRoot(meta?.cwd ?? cwdOf(sid), sid, false);
    try {
      for (const w of svc('workspaceRegistry')?.list?.() ?? []) addRoot(w?.path, null, false);
    } catch { /* ignore */ }
    if (wanted.size > WATCH_CAP) {
      const scored = [...wanted.entries()].map(([key, e]) => {
        let ts = e.running.length > 0 ? Number.MAX_SAFE_INTEGER : 0;
        for (const sid of e.idle) ts = Math.max(ts, sessionIndex.get(sid)?.lastTs ?? 0);
        return [key, ts];
      }).sort((a, b) => b[1] - a[1]);
      for (const [key] of scored.slice(WATCH_CAP)) wanted.delete(key);
    }
    for (const [key, entry] of [...watchers]) {
      if (!wanted.has(key)) closeWatcher(key, entry);
    }
    for (const [key, want] of wanted) {
      const existing = watchers.get(key);
      if (existing) {
        existing.runningSids = want.running;
        existing.idleSids = want.idle;
        continue;
      }
      startWatcher(key, want);
    }
  }

  function closeWatcher(key, entry) {
    try { entry.watcher.close(); } catch { /* ignore */ }
    for (const t of entry.debounce.values()) clearTimeout(t.timer ?? t);
    for (const g of entry.pendingGone.values()) clearTimeout(g.timer);
    for (const sp of entry.suppressed.values()) if (sp.timer) clearTimeout(sp.timer);
    watchers.delete(key);
  }

  /** Prefer a running session on this root; else the most recent indexed one. */
  function attributeSid(entry) {
    let best = null;
    let bestTs = -1;
    let idle = false;
    for (const sid of entry.runningSids) {
      const ts = activeSessions.get(sid)?.since ?? 0;
      if (ts > bestTs) { bestTs = ts; best = sid; idle = false; }
    }
    if (best) return { sid: String(best), idle };
    for (const sid of entry.idleSids) {
      const ts = sessionIndex.get(sid)?.lastTs ?? 0;
      if (ts > bestTs) { bestTs = ts; best = sid; idle = true; }
    }
    return best ? { sid: String(best), idle } : null;
  }

  function startWatcher(key, want) {
    let watcher;
    const handler = (eventType, filename) => {
      const entry = watchers.get(key);
      if (!entry) return;
      if (!filename) return;
      let full;
      try { full = pathResolve(entry.cwd, filename.toString()); } catch { return; }
      onWatchEvent(entry, full, eventType);
    };
    try {
      watcher = fsWatch(want.root, { recursive: true }, handler);
    } catch {
      try { watcher = fsWatch(want.root, handler); } catch (e) {
        log.warn(`[file-tracker] watch failed for ${want.root}: ${errorMessage(e)}`);
        return;
      }
    }
    watcher.on('error', () => {
      const entry = watchers.get(key);
      if (entry) closeWatcher(key, entry);
    });
    const entry = {
      watcher,
      cwd: want.root,
      runningSids: want.running,
      idleSids: want.idle,
      startedAt: nowMs(),
      debounce: new Map(),
      pendingGone: new Map(),
      known: new Map(),
      suppressed: new Map(),
    };
    watchers.set(key, entry);
    seedKnown(entry, want.root, 1).catch(() => {});
  }

  /** Shallow-seed the known-file cache so cold watchers classify modify vs create. */
  async function seedKnown(entry, dir, depth) {
    let ents;
    try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      if (entry.known.size > 5000) return;
      const p = join(dir, ent.name);
      if (isNoisePath(p) || isExcluded(p, entry.cwd)) continue;
      const lp = lower(p);
      if (ent.isDirectory()) {
        entry.known.set(lp, { size: -1, mtimeMs: -1, isDir: true });
        if (depth > 0) await seedKnown(entry, p, depth - 1);
      } else {
        const st = await statOrNull(p);
        if (st.exists) entry.known.set(lp, { size: st.size, mtimeMs: st.mtimeMs, isDir: false });
      }
    }
  }

  function onWatchEvent(entry, full, eventType) {
    const lp = lower(full);
    if (isOwnPath(full) || isNoisePath(full)) return;
    if (recentToolOps.get(lp) && nowMs() - recentToolOps.get(lp) < 4000) return; // tool layer already recorded it
    if (isExcluded(full, entry.cwd)) {
      if (settings.excludedSummary !== false) noteSuppressed(entry, full);
      return;
    }
    const prev = entry.debounce.get(lp);
    if (prev) clearTimeout(prev.timer);
    // Keep the FIRST event type of the burst: creation/move fires 'rename'
    // then 'change'; a pure content write fires only 'change'.
    const item = {
      eventType: prev?.eventType ?? eventType,
      timer: setTimeout(() => {
        entry.debounce.delete(lp);
        classifyWatched(entry, full, item.eventType).catch(() => {});
      }, DEBOUNCE_MS),
    };
    entry.debounce.set(lp, item);
  }

  function noteSuppressed(entry, full) {
    // Fold changes under an excluded top-level directory into one aggregate
    // record per 30s window, with real kind semantics: a directory born
    // during this watcher's life is a 'create' (e.g. a fresh dependency
    // install); later churn is a 'modify'.
    const rel = full.slice(entry.cwd.length).replace(/^[\\/]+/, '');
    const top = rel.split(/[\\/]+/)[0] || rel;
    const dir = join(entry.cwd, top);
    const key = lower(dir);
    let s = entry.suppressed.get(key);
    if (!s) {
      s = { paths: new Set(), overflow: 0, timer: null, createdEmitted: false };
      entry.suppressed.set(key, s);
    }
    // Count distinct paths, not raw events (one file fires several).
    if (s.paths.size < 10000) s.paths.add(lower(full));
    else s.overflow += 1;
    if (s.timer) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      const count = s.paths.size + s.overflow;
      s.paths.clear();
      s.overflow = 0;
      if (count <= 0) return;
      // The folder's own creation is recorded as a plain 'create' (with its
      // aggregated size) by the classifier; the folded line always means
      // "churn inside", so it carries 'modify' semantics.
      const attr = attributeSid(entry);
      if (!attr) return;
      record({
        sessionId: attr.sid, round: rounds.get(attr.sid) ?? 0,
        kind: 'modify', path: dir, count, via: 'watch', isDir: true,
        ...(attr.idle ? { idle: true } : {}),
      });
    }, 30000);
    if (s.timer.unref) s.timer.unref();
  }

  async function classifyWatched(entry, full, eventType) {
    const lp = lower(full);
    const attr = attributeSid(entry);
    if (!attr) return;
    const sid = attr.sid;
    const idleFlag = attr.idle ? { idle: true } : {};
    const round = rounds.get(sid) ?? 0;
    const st = await statOrNull(full);
    if (recentToolOps.get(lp) && nowMs() - recentToolOps.get(lp) < 4000) return;

    /** Pair with a fresh pending disappearance as rename/move; true when recorded. */
    const tryPair = () => {
      for (const [goneLp, gone] of entry.pendingGone) {
        if (goneLp === lp) continue;
        if (nowMs() - gone.ts > RENAME_PAIR_WINDOW) continue;
        const sameName = basename(goneLp) === basename(lp);
        const sameSize = gone.size !== undefined && st.size === gone.size;
        if (sameName || sameSize) {
          clearTimeout(gone.timer);
          entry.pendingGone.delete(goneLp);
          entry.known.delete(goneLp);
          const kind = dirname(lower(gone.path)) === dirname(lp) ? 'rename' : 'move';
          noteSize(full, st.isDir ? undefined : st.size, st.isDir);
          record({
            sessionId: sid, round, kind, path: full, fromPath: gone.path,
            via: 'watch', isDir: st.isDir, size: st.isDir ? undefined : st.size,
            ...idleFlag,
          });
          entry.known.set(lp, { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDir });
          return true;
        }
      }
      return false;
    };

    if (st.exists) {
      if (tryPair()) return;
      let known = entry.known.get(lp);
      let kind;
      if (known) {
        kind = 'modify';
      } else {
        // Deterministic cold classification: a file born after the watcher
        // started is a creation; anything older already existed (modify).
        const born = Math.max(st.birthtimeMs ?? 0, st.ctimeMs ?? 0);
        kind = born > entry.startedAt - 5000 ? 'create' : 'modify';
      }
      if (!known && kind === 'create') {
        // An appeared file may still be the target of an in-flight rename whose
        // source event lands a beat later — give pairing a short second chance,
        // and treat a same-path gone→appeared pair as an atomic replace (modify).
        await sleep(400);
        if (recentToolOps.get(lp) && nowMs() - recentToolOps.get(lp) < 4000) return;
        if (tryPair()) return;
        const self = entry.pendingGone.get(lp);
        if (self) {
          clearTimeout(self.timer);
          entry.pendingGone.delete(lp);
          kind = 'modify';
        }
        known = entry.known.get(lp);
        if (known) kind = 'modify';
      }
      if (st.isDir && kind === 'modify') {
        // Directory mtime churns on every child operation — not a user-visible modify.
        entry.known.set(lp, { size: st.size, mtimeMs: st.mtimeMs, isDir: true });
        return;
      }
      entry.known.set(lp, { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDir });
      if (known && known.size === st.size && known.mtimeMs === st.mtimeMs) return; // no real change
      noteSize(full, st.isDir ? undefined : st.size, st.isDir);
      record({
        sessionId: sid, round, kind, path: full, via: 'watch',
        isDir: st.isDir, size: st.isDir ? undefined : st.size,
        ...idleFlag,
      });
      if (entry.known.size > 20000) {
        const first = entry.known.keys().next();
        if (!first.done) entry.known.delete(first.value);
      }
    } else {
      if (entry.pendingGone.has(lp)) return;
      const known = entry.known.get(lp);
      const lks = lastKnownSize.get(lp);
      const wasDir = known ? (known.isDir ?? known.size === -1) : (lks ? lks.isDir : undefined);
      const lastSize = (known && known.size >= 0) ? known.size : (lks && !lks.isDir ? lks.size : undefined);
      const pending = {
        path: full,
        ts: nowMs(),
        size: lastSize,
        timer: setTimeout(() => {
          entry.pendingGone.delete(lp);
          entry.known.delete(lp);
          lastKnownSize.delete(lp);
          if (recentToolOps.get(lp) && nowMs() - recentToolOps.get(lp) < 6000) return; // tool layer owns it
          record({
            sessionId: sid, round, kind: 'delete', path: full, via: 'watch',
            ...(wasDir !== undefined ? { isDir: wasDir } : {}),
            ...(wasDir !== true && lastSize !== undefined ? { size: lastSize } : {}),
            ...idleFlag,
          });
        }, RENAME_PAIR_WINDOW),
      };
      if (pending.timer.unref) pending.timer.unref();
      entry.pendingGone.set(lp, pending);
    }
  }

  // While anything is active, keep watcher bindings fresh (cwd can change).
  ctx.effect(() => {
    const t = setInterval(() => {
      ensureWatchers();
    }, 3000);
    if (t.unref) t.unref();
    return () => clearInterval(t);
  }, 'file-tracker: watcher refresh');

  /* ---------------- attribution events ---------------- */

  ctx.on('agent/status', (payload) => {
    try {
      const agent = payload?.agent;
      const sid = agent?.id ?? agent?.sessionId;
      if (!sid) return;
      if (payload?.status === 'running') markRunning(String(sid));
      else markIdle(String(sid));
    } catch { /* never break the emitter */ }
  });

  ctx.on('agent/disposed', (payload) => {
    try {
      const sid = payload?.agent?.id ?? payload?.agent?.sessionId;
      if (!sid) return;
      const entry = activeSessions.get(String(sid));
      if (entry?.stopTimer) clearTimeout(entry.stopTimer);
      activeSessions.delete(String(sid));
      ensureWatchers();
    } catch { /* ignore */ }
  });

  /* ---------------- bootstrap: adopt already-running agents ---------------- */

  ctx.effect(() => {
    let cancelled = false;
    settingsReady.then(async () => {
      if (cancelled) return;
      await loadIndexOnce().catch(() => {});
      await migrateFlatLogs().catch(() => {});
      await reconcileIndex().catch(() => {});
      if (cancelled) return;
      ensureWatchers();
      try {
        const agents = svc('agents');
        for (const agent of agents?.list?.() ?? []) {
          const sid = agent?.id ?? agent?.sessionId;
          const st = agent?.status ?? agent?.state;
          if (sid && st === 'running') markRunning(String(sid));
        }
      } catch { /* ignore */ }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, 'file-tracker: bootstrap');

  /* ---------------- retention purge ---------------- */

  async function purgeOldLogs() {
    try {
      const dir = logDir();
      const cutoff = nowMs() - settings.retentionDays * 86400000;
      const tops = await readdir(dir);
      const dirs = [dir];
      for (const t of tops) {
        const st = await statOrNull(join(dir, t));
        if (st.exists && st.isDir) dirs.push(join(dir, t));
      }
      for (const d of dirs) {
        for (const f of await readdir(d)) {
          if (!f.endsWith('.jsonl')) continue;
          const p = join(d, f);
          const s = await statOrNull(p);
          if (s.exists && s.mtimeMs < cutoff) await rm(p, { force: true });
        }
      }
    } catch { /* ignore */ }
  }

  ctx.effect(() => {
    settingsReady.then(() => purgeOldLogs()).catch(() => {});
    const t = setInterval(() => { purgeOldLogs().catch(() => {}); }, 6 * 3600 * 1000);
    if (t.unref) t.unref();
    return () => clearInterval(t);
  }, 'file-tracker: retention');

  /* ---------------- history & logs reading ---------------- */

  function logFileFor(sessionId) {
    return join(logDir(), slugForSession(sessionId), `${String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_')}.jsonl`);
  }

  /** Move and merge every session log (incl. workspace subfolders) from oldDir into newDir (best effort). */
  async function migrateLogs(oldDir, newDir) {
    if (lower(oldDir) === lower(newDir)) return { moved: 0 };
    let files;
    try { files = await readdir(oldDir); } catch { return { moved: 0 }; }
    let moved = 0;
    const moveFile = async (src, dst) => {
      const d = await statOrNull(dst);
      if (d.exists) {
        const content = await readFile(src);
        await appendFile(dst, content);
        await rm(src, { force: true });
      } else {
        try {
          await fsRename(src, dst);
        } catch {
          // Cross-device move: copy then delete.
          const content = await readFile(src);
          await writeFile(dst, content);
          await rm(src, { force: true });
        }
      }
    };
    for (const f of files) {
      const src = join(oldDir, f);
      try {
        const s = await statOrNull(src);
        if (!s.exists) continue;
        if (s.isDir) {
          const dst = join(newDir, f);
          const d = await statOrNull(dst);
          if (!d.exists) {
            try { await fsRename(src, dst); moved += 1; continue; } catch { /* cross-device: merge below */ }
            try { await mkdir(dst, { recursive: true }); } catch { /* ignore */ }
          }
          for (const cf of await readdir(src)) {
            if (!cf.endsWith('.jsonl')) continue;
            await mkdir(dst, { recursive: true });
            await moveFile(join(src, cf), join(dst, cf));
            moved += 1;
          }
          await rm(src, { recursive: true, force: true }).catch(() => {});
          continue;
        }
        if (!f.endsWith('.jsonl') && f !== 'index.json') continue;
        const dst = join(newDir, f);
        if (f === 'index.json') {
          let a = {};
          let b = {};
          try { a = JSON.parse(await readFile(src, 'utf8')); } catch { /* ignore */ }
          try { b = JSON.parse(await readFile(dst, 'utf8')); } catch { /* ignore */ }
          const merged = { ...a, ...b };
          if (a.v === 2 && b.v === 2) {
            merged.workspaces = { ...(a.workspaces ?? {}), ...(b.workspaces ?? {}) };
            merged.sessions = { ...(a.sessions ?? {}), ...(b.sessions ?? {}) };
          }
          await writeFile(dst, JSON.stringify(merged, null, 1), 'utf8');
          await rm(src, { force: true });
        } else {
          await moveFile(src, dst);
        }
        moved += 1;
      } catch { /* best effort per file */ }
    }
    return { moved };
  }

  async function readHistory(sessionId, beforeSeq, limit) {    const file = logFileFor(sessionId);
    let raw;
    try { raw = await readFile(file, 'utf8'); } catch { return { records: [], hasMore: false, title: undefined }; }
    const out = [];
    let title;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.title) title = rec.title;
        if (typeof rec.seq === 'number' && (beforeSeq === undefined || rec.seq < beforeSeq)) out.push(rec);
      } catch { /* skip corrupt line */ }
    }
    const hasMore = out.length > limit;
    const records = hasMore ? out.slice(out.length - limit) : out;
    return { records, hasMore, title };
  }

  async function listLogs() {
    await settingsReady;
    await loadIndexOnce();
    const dir = logDir();
    let tops;
    try { tops = await readdir(dir); } catch { return []; }
    const out = [];
    const scanDir = async (d, wsName) => {
      let files;
      try { files = await readdir(d); } catch { return; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const p = join(d, f);
        const s = await statOrNull(p);
        if (!s.exists) continue;
        const sid = decodeSid(f.slice(0, -'.jsonl'.length));
        const meta = sessionIndex.get(sid) ?? {};
        out.push({
          sessionId: sid, file: f, bytes: s.size, mtime: Math.round(s.mtimeMs),
          title: meta.title, cwd: meta.cwd, wsId: meta.wsId, wsName: wsName || meta.wsName,
        });
      }
    };
    await scanDir(dir, '');
    for (const t of tops) {
      const p = join(dir, t);
      const st = await statOrNull(p);
      if (!st.exists || !st.isDir) continue;
      let wsName = t;
      for (const [, meta] of wsIndex) if (meta.slug === t) { wsName = meta.name; break; }
      await scanDir(p, wsName);
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  }

  /** One-time move of legacy flat session logs into their workspace folders. */
  async function migrateFlatLogs() {
    const dir = logDir();
    let tops;
    try { tops = await readdir(dir); } catch { return; }
    for (const f of tops) {
      if (!f.endsWith('.jsonl')) continue;
      const sid = decodeSid(f.slice(0, -'.jsonl'.length));
      const slug = slugForSession(sid);
      const target = join(dir, slug);
      try {
        await mkdir(target, { recursive: true });
        await fsRename(join(dir, f), join(target, f));
      } catch { /* leave in place */ }
    }
  }

  /**
   * Reconcile the in-memory index with what is actually on disk: sessions
   * whose log file was deleted (from the UI or by hand) leave the index, and
   * workspaces left without sessions and without log files disappear from
   * the dropdowns. Cheap: one stat per indexed session, one readdir per ws.
   */
  async function reconcileIndex() {
    await loadIndexOnce();
    let changed = false;
    for (const [sid, meta] of [...sessionIndex]) {
      const slug = (meta?.wsId && wsIndex.get(meta.wsId)?.slug) || slugForSession(sid);
      const file = join(logDir(), slug, `${String(sid).replace(/[^A-Za-z0-9._-]/g, '_')}.jsonl`);
      const st = await statOrNull(file);
      if (!st.exists) {
        // The file may still be in the append queue right after first record.
        if ((meta?.lastTs ?? 0) > nowMs() - 10000) continue;
        sessionIndex.delete(sid);
        sidWs.delete(sid);
        changed = true;
      }
    }
    for (const [wsId, wmeta] of [...wsIndex]) {
      if ([...sessionIndex.values()].some((m) => m.wsId === wsId)) continue;
      let hasFiles = false;
      try {
        const files = await readdir(join(logDir(), wmeta.slug));
        hasFiles = files.some((f) => f.endsWith('.jsonl'));
      } catch { hasFiles = false; }
      if (!hasFiles) {
        wsIndex.delete(wsId);
        changed = true;
      }
    }
    if (changed) scheduleIndexSave();
  }

  function decodeSid(fileSid) {
    // index.json keys are raw session ids; file names are sanitized. Match loosely.
    for (const key of sessionIndex.keys()) {
      if (String(key).replace(/[^A-Za-z0-9._-]/g, '_') === fileSid) return key;
    }
    return fileSid;
  }

  let indexLoaded = false;
  function loadIndexOnce() {
    if (indexLoaded) return Promise.resolve();
    indexLoaded = true;
    return loadIndexSync();
  }

  /* ---------------- reveal in file manager ---------------- */

  function revealPath(targetPath) {
    return new Promise((res) => {
      const note = (cmd, err) => {
        appendFile(join(dataDir, 'reveal-debug.jsonl'),
          JSON.stringify({ ts: nowMs(), path: targetPath, cmd, err: err ?? null }) + '\n', 'utf8').catch(() => {});
      };
      // No windowsHide: CREATE_NO_WINDOW can suppress GUI launcher windows.
      // attempts: [cmd, args, extraOptions?] — explorer needs its raw command
      // line verbatim (/select unquoted, path quoted), hence windowsVerbatimArguments.
      const runChain = (attempts, status, i = 0) => {
        if (i >= attempts.length) {
          note('all-failed');
          res({ ok: false, status: 'spawn-failed' });
          return;
        }
        const [cmd, args, opts] = attempts[i];
        try {
          const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...(opts ?? {}) });
          let settled = false;
          child.on('error', (e) => {
            note(cmd, errorMessage(e));
            if (!settled) { settled = true; runChain(attempts, status, i + 1); }
          });
          child.unref();
          setTimeout(() => {
            if (!settled) { settled = true; note(cmd, null); res({ ok: true, status }); }
          }, 300);
        } catch (e) {
          note(cmd, errorMessage(e));
          runChain(attempts, status, i + 1);
        }
      };
      (async () => {
        const st = await statOrNull(targetPath);
        const parent = dirname(targetPath);
        const status = st.exists ? (st.isDir ? 'dir' : 'file') : 'file-missing';
        if (!st.exists) {
          const pst = await statOrNull(parent);
          if (!pst.exists) { res({ ok: false, status: 'all-missing' }); return; }
        }
        const VERBATIM = { windowsVerbatimArguments: true };
        if (platform() === 'win32') {
          if (st.exists && !st.isDir) {
            runChain([
              ['explorer.exe', [`/select,"${targetPath}"`], VERBATIM],
              ['cmd.exe', ['/c', 'start', '""', `"${parent}"`]],
              ['explorer.exe', [parent]],
            ], status);
          } else if (st.exists) {
            runChain([
              ['explorer.exe', [`"${targetPath}"`], VERBATIM],
              ['cmd.exe', ['/c', 'start', '""', `"${targetPath}"`]],
            ], status);
          } else {
            runChain([
              ['explorer.exe', [`"${parent}"`], VERBATIM],
              ['cmd.exe', ['/c', 'start', '""', `"${parent}"`]],
            ], status);
          }
        } else if (platform() === 'darwin') {
          if (st.exists) runChain([['open', ['-R', targetPath]]], status);
          else runChain([['open', [parent]]], status);
        } else if (st.exists) {
          runChain([['xdg-open', [targetPath]]], status);
        } else {
          runChain([['xdg-open', [parent]]], status);
        }
      })().catch(() => res({ ok: false, status: 'all-missing' }));
    });
  }

  /* ---------------- HTTP routes ---------------- */

  const ROUTE = '/file-tracker/api';
  let pollHits = 0;
  let lastStatsWrite = 0;

  function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.byteLength;
      if (size > 64 * 1024) { req.resume(); return null; }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  }

  async function handleApi(req, res) {
    const connection = svc('connection');
    if (connection?.requestRejection) {
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) { res.statusCode = rejection; res.end(); return; }
    }
    const url = new URL(String(req.url), 'http://localhost');
    const action = url.pathname.slice(ROUTE.length + 1);
    await settingsReady;
    try {
      if (action === 'poll' && req.method === 'GET') {
        pollHits += 1;
        const nowTs = nowMs();
        if (nowTs - lastStatsWrite > 5000) {
          lastStatsWrite = nowTs;
          writeFile(join(dataDir, 'poll-stats.json'), JSON.stringify({ hits: pollHits, lastPollAt: nowTs })).catch(() => {});
        }
        const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10) || 0;
        const sessionFilter = url.searchParams.get('session') || null;
        await reconcileIndex();
        const minSeq = mem.length > 0 ? mem[0].seq - 1 : globalSeq;
        if (since < minSeq) {
          // Client cursor fell behind the memory window (host restart with a
          // restored sequence): send a reset AND backfill the live window so
          // the page has content immediately and resumes streaming.
          sendJson(res, 200, {
            reset: true,
            epoch: HOST_EPOCH,
            seq: globalSeq,
            records: mem.slice(-800),
            settings,
            sessions: sessionsView(),
            workspaces: workspacesView(),
            defaultLogDir: join(dataDir, 'logs'),
          });
          return;
        }
        let records = since >= globalSeq ? [] : mem.filter((r) => r.seq > since);
        if (sessionFilter) records = records.filter((r) => r.sessionId === sessionFilter);
        if (records.length > 800) records = records.slice(records.length - 800);
        sendJson(res, 200, {
          epoch: HOST_EPOCH,
          seq: globalSeq,
          records,
          settings,
          sessions: sessionsView(),
          workspaces: workspacesView(),
          active: [...activeSessions.keys()],
          defaultLogDir: join(dataDir, 'logs'),
        });
        return;
      }
      if (action === 'history' && req.method === 'GET') {
        const sid = url.searchParams.get('session') ?? '';
        const beforeRaw = url.searchParams.get('before');
        const before = beforeRaw === null || beforeRaw === '' ? undefined : Number.parseInt(beforeRaw, 10);
        const limit = Math.min(400, Number.parseInt(url.searchParams.get('limit') ?? '200', 10) || 200);
        if (!sid) { sendJson(res, 400, { error: 'session required' }); return; }
        const { records, hasMore, title } = await readHistory(sid, before, limit);
        sendJson(res, 200, { records, hasMore, title });
        return;
      }
      if (action === 'logs' && req.method === 'GET') {
        await reconcileIndex();
        sendJson(res, 200, { logs: await listLogs() });
        return;
      }
      if (action === 'logs/delete' && req.method === 'POST') {
        const text = await readBody(req);
        if (text === null) { sendJson(res, 413, { error: 'body too large' }); return; }
        let body; try { body = JSON.parse(text); } catch { body = null; }
        const sid = body?.sessionId;
        if (typeof sid !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(sid)) {
          sendJson(res, 400, { error: 'invalid sessionId' }); return;
        }
        await rm(logFileFor(sid), { force: true });
        // Also purge the in-memory live window so polling stops re-serving it.
        for (let i = mem.length - 1; i >= 0; i--) {
          if (mem[i].sessionId === sid) mem.splice(i, 1);
        }
        const idx = sessionIndex.get(sid);
        if (idx) { sessionIndex.delete(sid); scheduleIndexSave(); }
        // Cascade: when a workspace loses its last session AND its last log
        // file, drop it from the index (and remove the empty folder) so the
        // UI dropdowns never show ghost workspaces.
        const idxWs = idx?.wsId;
        if (idxWs && ![...sessionIndex.values()].some((m) => m.wsId === idxWs)) {
          const slug = wsIndex.get(idxWs)?.slug;
          let hasFiles = false;
          if (slug) {
            try {
              const files = await readdir(join(logDir(), slug));
              hasFiles = files.some((f) => f.endsWith('.jsonl'));
            } catch { hasFiles = false; }
          }
          if (!hasFiles) {
            if (slug) await rm(join(logDir(), slug), { recursive: true, force: true }).catch(() => {});
            wsIndex.delete(idxWs);
            scheduleIndexSave();
          }
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      if (action === 'settings' && req.method === 'GET') {
        sendJson(res, 200, { settings, defaultLogDir: join(dataDir, 'logs') });
        return;
      }
      if (action === 'settings' && req.method === 'PUT') {
        const text = await readBody(req);
        if (text === null) { sendJson(res, 413, { error: 'body too large' }); return; }
        let body; try { body = JSON.parse(text); } catch { body = null; }
        if (!body) { sendJson(res, 400, { error: 'invalid JSON' }); return; }
        const next = sanitizeSettings(body, settings);
        const oldDir = logDir();
        const dirChanged = next.logDir !== settings.logDir;
        settings = next;
        await saveSettings();
        let migrated = 0;
        if (dirChanged) {
          try { await mkdir(logDir(), { recursive: true }); } catch { /* ignore */ }
          try {
            migrated = (await migrateLogs(oldDir, logDir())).moved;
            await restoreSeq();
          } catch { /* best effort */ }
        }
        if (!settings.enabled) {
          for (const [, entry] of watchers) { try { entry.watcher.close(); } catch { /* ignore */ } }
          watchers.clear();
        } else {
          ensureWatchers();
        }
        sendJson(res, 200, { settings, defaultLogDir: join(dataDir, 'logs'), migrated });
        return;
      }
      if (action === 'reveal' && req.method === 'POST') {
        const text = await readBody(req);
        if (text === null) { sendJson(res, 413, { error: 'body too large' }); return; }
        let body; try { body = JSON.parse(text); } catch { body = null; }
        const target = typeof body?.path === 'string' ? body.path.trim() : '';
        if (!target || !isAbsolute(target) || /[\r\n\0]/.test(target)) {
          sendJson(res, 400, { error: 'absolute path required' }); return;
        }
        const outcome = await revealPath(target);
        sendJson(res, outcome.ok ? 200 : 502, outcome);
        return;
      }
      if (action === 'open-log-dir' && req.method === 'POST') {
        const dir = logDir();
        try { await mkdir(dir, { recursive: true }); } catch { /* ignore */ }
        const outcome = await revealPath(dir);
        sendJson(res, outcome.ok ? 200 : 502, outcome);
        return;
      }
      res.statusCode = 404;
      res.end();
    } catch (e) {
      log.warn(`[file-tracker] route error: ${errorMessage(e)}`);
      sendJson(res, 500, { error: 'internal' });
    }
  }

  function sessionsView() {
    const out = [];
    for (const [sid, meta] of sessionIndex) {
      out.push({
        sessionId: sid, title: meta.title, cwd: meta.cwd, lastTs: meta.lastTs ?? 0,
        wsId: meta.wsId, wsName: meta.wsName,
      });
    }
    out.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
    return out.slice(0, 100);
  }

  function workspacesView() {
    const out = [];
    for (const [wsId, meta] of wsIndex) {
      let lastTs = 0;
      const sessions = [];
      for (const [sid, s] of sessionIndex) {
        if (s.wsId === wsId) {
          sessions.push(sid);
          if ((s.lastTs ?? 0) > lastTs) lastTs = s.lastTs ?? 0;
        }
      }
      out.push({ id: wsId, name: meta.name, slug: meta.slug, path: meta.path, lastTs, sessions });
    }
    out.sort((a, b) => b.lastTs - a.lastTs);
    return out.slice(0, 50);
  }

  let routesDispose = null;
  /**
   * Register the API routes as soon as the webServer service exists. On a
   * cold boot this plugin can activate before the webserver row, so a single
   * lookup at apply() time would silently lose the routes until the next
   * re-apply — poll until the service appears instead.
   */
  function tryRegisterRoutes() {
    if (routesDispose) return true;
    const ws = svc('webServer');
    if (!ws || typeof ws.register !== 'function') return false;
    try {
      routesDispose = ws.register({
        kind: 'prefix',
        path: ROUTE,
        handler: (req, res) => handleApi(req, res),
      });
      log.info('[file-tracker] api routes registered');
      return true;
    } catch (e) {
      log.warn(`[file-tracker] route registration failed: ${errorMessage(e)}`);
      routesDispose = null;
      return false;
    }
  }

  ctx.effect(() => {
    let timer = null;
    if (!tryRegisterRoutes()) {
      log.warn('[file-tracker] webServer not ready yet; retrying route registration');
      timer = setInterval(() => {
        if (tryRegisterRoutes()) { clearInterval(timer); timer = null; }
      }, 500);
      if (timer.unref) timer.unref();
    }
    return () => {
      if (timer) clearInterval(timer);
      if (routesDispose) { try { routesDispose(); } catch { /* ignore */ } routesDispose = null; }
    };
  }, 'file-tracker: route bootstrap');

  /* ---------------- teardown ---------------- */

  ctx.effect(() => () => {
    for (const [, entry] of watchers) {
      try { entry.watcher.close(); } catch { /* ignore */ }
      for (const t of entry.debounce.values()) clearTimeout(t.timer ?? t);
      for (const g of entry.pendingGone.values()) clearTimeout(g.timer);
      for (const sp of entry.suppressed.values()) if (sp.timer) clearTimeout(sp.timer);
    }
    watchers.clear();
    for (const [, entry] of activeSessions) {
      if (entry.stopTimer) clearTimeout(entry.stopTimer);
    }
    activeSessions.clear();
    if (indexSaveTimer) clearTimeout(indexSaveTimer);
  }, 'file-tracker: teardown');

  log.info(`[file-tracker] active (data dir: ${dataDir})`);
  void delimiter; void normalize; void sep;
}
