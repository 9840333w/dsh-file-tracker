window.__ModuleLoader__.load({
  id: '@local/dsh-file-tracker',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    /* ================= locale ================= */

    const NS = 'file-tracker';

    const zh = {
      title: '文件变动追踪',
      shortDesc: '记录 AI 新建、修改、删除、重命名、移动文件的操作，悬浮窗实时查看。',
      panelTitle: '文件变动记录',
      tabRecords: '记录',
      tabSettings: '设置',
      followLatest: '跟随最新有变动的工作区',
      allSessions: '全部会话',
      allSessionsHint: '显示当前工作区的全部会话',
      wsEmpty: '该工作区暂无文件变动记录。',
      wsEmptyNamed: '工作区「{name}」暂无文件变动记录。',
      idleTag: '非AI活跃期',
      idleHint: 'AI 未运行期间产生的变动（手动操作或其他工具）',
      sessionLabel: '会话',
      wholeWorkspace: '整个工作区',
      workspaceLabel: '工作区',
      searchPlaceholder: '搜索路径…',
      roundLabel: '第 {n} 轮',
      noRecords: '暂无记录。AI 开始改动文件后会自动出现在这里。',
      noRecordsSession: '该会话暂无文件变动记录。',
      loadEarlier: '加载更早的记录',
      loading: '加载中…',
      openLocation: '打开文件所在位置',
      openFolder: '打开该文件夹',
      copyPath: '复制文件路径',
      copied: '已复制路径',
      copyFailed: '复制失败',
      deletedHint: '文件已删除，无法打开所在位置',
      revealFailed: '打开位置失败',
      fileMissingOpened: '文件已不存在（可能被手动删除或移动），已打开所在文件夹',
      allMissing: '文件及其所在文件夹均已不存在',
      logsMigrated: '已迁移 {n} 个日志文件到新目录',
      aggSummary: '共 {count} 个文件变动（排除目录，已折叠）',
      settingsExcludedSummary: '排除目录记录聚合条目',
      settingsExcludedSummaryHint: 'node_modules 等排除目录的变动折叠为一条汇总（新增/修改 + 文件数），不逐个记录。',
      excludedSummary: '{dir} 下 {count} 个文件变动（已按排除规则折叠）',
      kindCreate: '新建',
      kindModify: '修改',
      kindDelete: '删除',
      kindRename: '重命名',
      kindMove: '移动',
      kindExcluded: '已排除',
      filterAll: '全部',
      sortLabel: '排序',
      sortDefault: '默认',
      sortTime: '时间',
      sortSize: '大小',
      sortName: '名称',
      sortKind: '类型',
      settingsEnable: '启用记录',
      settingsEnableHint: '关闭后 AI 的文件操作将不再被记录（已有日志保留）。',
      settingsUi: '悬浮窗',
      settingsShowOnEvent: '有新变动时短暂展开提示',
      settingsOpacity: '不透明度',
      settingsScale: '显示尺寸',
      settingsResetPos: '重置悬浮窗位置',
      settingsCapture: '捕获与日志',
      settingsExclusions: '排除的文件夹名（每行一个）',
      settingsExclusionsHint: '路径中任一层文件夹命中即排除，例如 node_modules。',
      settingsLogDir: '日志保存目录',
      settingsLogDirHint: '留空使用默认目录：{dir}',
      settingsLogDirEffective: '当前生效目录：{dir}',
      logDirOpened: '已在资源管理器中打开日志目录',
      settingsOpenLogDir: '打开日志目录',
      settingsRetention: '日志保留天数',
      settingsSave: '保存设置',
      settingsSaved: '已保存',
      settingsSaveFailed: '保存失败',
      settingsLogs: '日志管理',
      settingsLogsEmpty: '暂无日志文件。',
      settingsLogsDelete: '删除',
      settingsLogsDeleteConfirm: '确定删除会话「{title}」的日志文件吗？此操作不可恢复。',
      settingsLogsDeleted: '日志已删除',
      sessionUnknown: '未知会话',
      capsuleCount: '{n} 项变动',
      closePanel: '收起',
      hostDown: '追踪服务未运行',
      from: '从',
    };

    const en = {
      title: 'File Change Tracker',
      shortDesc: 'Records every file the AI creates, modifies, deletes, renames, or moves, live in a floating panel.',
      panelTitle: 'File changes',
      tabRecords: 'Records',
      tabSettings: 'Settings',
      followLatest: 'Follow latest changed workspace',
      allSessions: 'All sessions',
      allSessionsHint: 'Show every session of the current workspace',
      wsEmpty: 'No file changes recorded for this workspace.',
      wsEmptyNamed: 'No file changes recorded for workspace "{name}".',
      idleTag: 'idle',
      idleHint: 'Change happened while no AI session was running (manual or other tools)',
      sessionLabel: 'Session',
      wholeWorkspace: 'Whole workspace',
      workspaceLabel: 'Workspace',
      searchPlaceholder: 'Search path…',
      roundLabel: 'Round {n}',
      noRecords: 'No records yet. File changes made by the AI will appear here automatically.',
      noRecordsSession: 'No file changes recorded for this session.',
      loadEarlier: 'Load earlier records',
      loading: 'Loading…',
      openLocation: 'Open file location',
      openFolder: 'Open this folder',
      copyPath: 'Copy file path',
      copied: 'Path copied',
      copyFailed: 'Copy failed',
      deletedHint: 'The file was deleted; its location cannot be opened',
      revealFailed: 'Failed to open location',
      fileMissingOpened: 'The file no longer exists (deleted or moved by hand); its folder was opened',
      allMissing: 'Neither the file nor its folder exists anymore',
      logsMigrated: 'Migrated {n} log file(s) to the new directory',
      aggSummary: '{count} file changes (excluded folder, folded)',
      settingsExcludedSummary: 'Aggregate records for excluded folders',
      settingsExcludedSummaryHint: 'Changes inside excluded folders (e.g. node_modules) fold into one summary record (created/modified + file count) instead of per-file records.',
      excludedSummary: '{count} changes under {dir} (folded by exclusion rules)',
      kindCreate: 'Created',
      kindModify: 'Modified',
      kindDelete: 'Deleted',
      kindRename: 'Renamed',
      kindMove: 'Moved',
      kindExcluded: 'Excluded',
      filterAll: 'All',
      sortLabel: 'Sort',
      sortDefault: 'Default',
      sortTime: 'Time',
      sortSize: 'Size',
      sortName: 'Name',
      sortKind: 'Kind',
      settingsEnable: 'Enable tracking',
      settingsEnableHint: 'When off, AI file operations are no longer recorded (existing logs are kept).',
      settingsUi: 'Floating widget',
      settingsShowOnEvent: 'Briefly expand the capsule on new changes',
      settingsOpacity: 'Opacity',
      settingsScale: 'Size',
      settingsResetPos: 'Reset capsule position',
      settingsCapture: 'Capture & logs',
      settingsExclusions: 'Excluded folder names (one per line)',
      settingsExclusionsHint: 'A path is excluded when any of its folders matches, e.g. node_modules.',
      settingsLogDir: 'Log directory',
      settingsLogDirHint: 'Leave empty to use the default: {dir}',
      settingsLogDirEffective: 'Effective directory: {dir}',
      logDirOpened: 'Opened the log directory in your file manager',
      settingsOpenLogDir: 'Open log directory',
      settingsRetention: 'Log retention (days)',
      settingsSave: 'Save settings',
      settingsSaved: 'Saved',
      settingsSaveFailed: 'Save failed',
      settingsLogs: 'Log files',
      settingsLogsEmpty: 'No log files yet.',
      settingsLogsDelete: 'Delete',
      settingsLogsDeleteConfirm: 'Delete the log of session "{title}"? This cannot be undone.',
      settingsLogsDeleted: 'Log deleted',
      sessionUnknown: 'Unknown session',
      capsuleCount: '{n} changes',
      closePanel: 'Collapse',
      hostDown: 'Tracker host is not running',
      from: 'from',
    };

    let T = (key, vars) => {
      const template = zh[key] ?? key;
      return fill(template, vars);
    };
    function fill(template, vars) {
      if (!vars) return template;
      return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
    }

    /* ================= api ================= */

    const API = 'file-tracker/api/';

    async function apiGet(action) {
      const r = await fetch(API + action, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    async function apiSend(action, method, body) {
      const r = await fetch(API + action, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    /* ================= store ================= */

    const SEEN_KEY = 'dsh.fileTracker.seenSeq';

    function loadSeenSeq() {
      try {
        const raw = window.localStorage.getItem(SEEN_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch { return {}; }
    }

    let seenSaveTimer = null;
    function persistSeenSeq(seen) {
      if (seenSaveTimer) clearTimeout(seenSaveTimer);
      seenSaveTimer = setTimeout(() => {
        seenSaveTimer = null;
        try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* ignore */ }
      }, 500);
    }

    const store = {
      state: {
        host: 'unknown',
        failCount: 0,
        settings: null,
        defaultLogDir: '',
        live: [],
        liveSeq: 0,
        sessions: [],
        workspaces: [],
        active: [],
        selection: { mode: 'latest', sessionId: null, wsId: null },
        filterKinds: [],
        sort: { field: 'default', dir: 'desc' },
        query: '',
        panelOpen: false,
        viewing: false,
        tab: 'records',
        seen: loadSeenSeq(),
        menu: null,
        lastEvent: null,
        history: {},
        historyEpoch: 0,
        logs: null,
        logsLoading: false,
        notice: null,
        now: Date.now(),
      },
      listeners: new Set(),
      emit() { for (const fn of this.listeners) { try { fn(); } catch { /* ignore */ } } },
      subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
      set(patch) { Object.assign(this.state, patch); this.emit(); },
    };

    function useStore() {
      const [, force] = useState(0);
      useEffect(() => store.subscribe(() => force((x) => x + 1)), []);
      return store.state;
    }

    /** Open/close the panel; viewing marks the displayed scope as seen. */
    function setPanelOpen(open) {
      store.set({ panelOpen: open, viewing: open });
      if (open) markScopeSeen(store.state);
    }

    /** Mark every session present in the currently displayed scope as seen. */
    function markScopeSeen(s) {
      if (!s.viewing || s.tab !== 'records') return;
      let changed = false;
      for (const rec of viewRecords(s)) {
        const prev = s.seen[rec.sessionId] ?? 0;
        if (rec.seq > prev) {
          s.seen[rec.sessionId] = rec.seq;
          changed = true;
        }
      }
      if (changed) persistSeenSeq(s.seen);
    }

    function setNotice(text) {      store.state.notice = { text, at: Date.now() };
      store.emit();
      setTimeout(() => {
        if (store.state.notice && store.state.notice.text === text) {
          store.state.notice = null;
          store.emit();
        }
      }, 2200);
    }

    /* ================= polling ================= */

    async function pollOnce() {
      const s = store.state;
      try {
        const data = await apiGet('poll?since=' + encodeURIComponent(String(s.liveSeq)));
        s.failCount = 0;
        s.host = 'up';
        if (typeof data.epoch === 'number') s.hostEpoch = data.epoch;
        if (data.settings) s.settings = data.settings;
        if (data.defaultLogDir) s.defaultLogDir = data.defaultLogDir;
        if (Array.isArray(data.sessions)) s.sessions = data.sessions;
        if (Array.isArray(data.workspaces)) s.workspaces = data.workspaces;
        if (Array.isArray(data.active)) s.active = data.active;
        if (data.reset) {
          // Host memory window moved past our cursor: refill from zero, but
          // keep what we already show (seqs are globally unique, dedupe below).
          s.liveSeq = 0;
          s.historyEpoch = (s.historyEpoch || 0) + 1;
        } else {
          if (Array.isArray(data.records) && data.records.length > 0) {
            const seen = s.liveSeqSet || (s.liveSeqSet = new Set());
            for (const rec of data.records) {
              if (seen.has(rec.seq)) continue;
              seen.add(rec.seq);
              s.live.push(rec);
              // A cached-but-empty history for this session is now stale.
              const hc = s.history[rec.sessionId];
              if (hc && hc.loaded && hc.records.length === 0) {
                hc.stale = true;
                s.historyEpoch = (s.historyEpoch || 0) + 1;
              }
            }
            if (s.live.length > 10000) {
              const drop = s.live.splice(0, s.live.length - 10000);
              for (const d of drop) seen.delete(d.seq);
            }
            const last = data.records[data.records.length - 1];
            if (last && last.kind !== 'excluded' && s.settings?.ui?.showOnEvent !== false) {
              s.lastEvent = { record: last, at: Date.now() };
            }
          }
          if (typeof data.seq === 'number') s.liveSeq = data.seq;
        }
        // While the panel is open everything arriving in view is considered seen.
        if (s.viewing) markScopeSeen(s);
        store.emit();
      } catch {
        s.failCount += 1;
        if (s.failCount >= 3 && s.host !== 'down') s.host = 'down';
        store.emit();
      }
    }

    /* ================= history ================= */

    async function ensureHistory(sid) {
      if (!sid) return;
      const cur = store.state.history[sid];
      if (cur && (cur.loading || (cur.loaded && !cur.stale && !(cur.records.length === 0 && Date.now() - (cur.loadedAt || 0) > 20000)))) return;
      // Keep currently displayed records while refreshing — no blank flash.
      store.state.history[sid] = {
        loaded: false, loading: true, stale: false,
        records: cur?.records || [], hasMore: cur?.hasMore || false,
      };
      store.emit();
      try {
        const data = await apiGet('history?session=' + encodeURIComponent(sid) + '&limit=200');
        store.state.history[sid] = { loaded: true, loading: false, loadedAt: Date.now(), stale: false, records: data.records || [], hasMore: !!data.hasMore };
      } catch {
        store.state.history[sid] = { loaded: true, loading: false, loadedAt: Date.now(), stale: false, records: cur?.records || [], hasMore: cur?.hasMore || false };
      }
      store.emit();
    }

    async function loadEarlier(sid) {
      const entry = store.state.history[sid];
      if (!entry || entry.loading || !entry.hasMore || entry.records.length === 0) return;
      entry.loading = true;
      store.emit();
      try {
        const oldest = entry.records[0].seq;
        const data = await apiGet('history?session=' + encodeURIComponent(sid) + '&before=' + oldest + '&limit=200');
        const seen = new Set(entry.records.map((r) => r.seq));
        const older = (data.records || []).filter((r) => !seen.has(r.seq));
        entry.records = older.concat(entry.records);
        entry.hasMore = !!data.hasMore;
      } catch { entry.hasMore = false; }
      entry.loading = false;
      store.emit();
    }

    /* ================= actions ================= */

    let saveTimer = null;
    function saveSettingsDebounced(patch, delay) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        apiSend('settings', 'PUT', patch).then((data) => {
          if (data.settings) store.set({ settings: data.settings });
        }).catch(() => {});
      }, delay ?? 600);
    }

    async function saveSettingsNow(patch) {
      const data = await apiSend('settings', 'PUT', patch);
      if (data.settings) store.set({ settings: data.settings, defaultLogDir: data.defaultLogDir || store.state.defaultLogDir });
      if (typeof data.migrated === 'number' && data.migrated > 0) {
        setNotice(T('logsMigrated', { n: data.migrated }));
        refreshLogs().catch(() => {});
      }
    }

    function applyLocalSettings(mutator) {
      const s = store.state;
      if (!s.settings) return;
      const next = JSON.parse(JSON.stringify(s.settings));
      mutator(next);
      store.set({ settings: next });
      return next;
    }

    async function revealRecord(rec) {
      if (rec.kind === 'delete') { setNotice(T('deletedHint')); return; }
      try {
        const out = await apiSend('reveal', 'POST', { path: rec.path });
        if (!out.ok) {
          setNotice(out.status === 'all-missing' ? T('allMissing') : T('revealFailed'));
          return;
        }
        if (out.status === 'file-missing') setNotice(T('fileMissingOpened'));
      } catch {
        setNotice(T('revealFailed'));
      }
    }

    function copyText(text) {
      const done = () => setNotice(T('copied'));
      const fail = () => setNotice(T('copyFailed'));
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => legacyCopy(text) ? done() : fail());
        } else {
          legacyCopy(text) ? done() : fail();
        }
      } catch { fail(); }
    }

    function legacyCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch { return false; }
    }

    async function refreshLogs() {
      store.state.logsLoading = true;
      store.emit();
      try {
        const data = await apiGet('logs');
        store.state.logs = data.logs || [];
      } catch { store.state.logs = store.state.logs || []; }
      store.state.logsLoading = false;
      store.emit();
    }

    async function deleteLog(sessionId, title) {
      if (!window.confirm(T('settingsLogsDeleteConfirm', { title: title || sessionId }))) return;
      try {
        await apiSend('logs/delete', 'POST', { sessionId });
        setNotice(T('settingsLogsDeleted'));
        await refreshLogs();
      } catch { /* ignore */ }
    }

    /* ================= shared bits ================= */

    const KIND = {
      create: { glyph: '+', token: 'var(--dsw-alias-state-success-primary)', key: 'kindCreate' },
      modify: { glyph: '✎', token: 'var(--dsw-alias-brand-primary)', key: 'kindModify' },
      delete: { glyph: '✕', token: 'var(--dsw-alias-state-error-primary)', key: 'kindDelete' },
      rename: { glyph: '⇆', token: 'var(--dsw-alias-state-warn-primary)', key: 'kindRename' },
      move: { glyph: '➤', token: 'var(--dsw-alias-state-warn-primary)', key: 'kindMove' },
      excluded: { glyph: '…', token: 'var(--dsw-alias-state-idle-primary)', key: 'kindExcluded' },
    };

    function fmtTime(ts) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    function fmtBytes(n) {
      if (n === undefined || n === null) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
      return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    function fmtSize(rec) {
      if (rec.size === undefined || rec.size === null) return '';
      return (rec.sizeApprox ? '~' : '') + fmtBytes(rec.size);
    }

    function splitPath(p) {
      const normalized = String(p).replace(/[\\/]+$/, '');
      const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
      return idx >= 0 ? { name: normalized.slice(idx + 1), dir: normalized.slice(0, idx + 1) } : { name: normalized, dir: '' };
    }

    function sessionTitleOf(s, sid) {
      const meta = s.sessions.find((x) => x.sessionId === sid);
      if (meta?.title) return meta.title;
      const live = [...s.live].reverse().find((r) => r.sessionId === sid && r.title);
      if (live) return live.title;
      return String(sid).slice(0, 10) + '…';
    }

    function latestSid(s) {
      for (let i = s.live.length - 1; i >= 0; i--) {
        if (s.live[i].kind !== 'excluded') return s.live[i].sessionId;
      }
      return s.sessions.length > 0 ? s.sessions[0].sessionId : null;
    }

    /** Workspace the floating widget currently follows (latest activity or explicit pick). */
    function effectiveWsId(s) {
      if (s.selection.mode === 'workspace') return s.selection.wsId;
      if (s.selection.mode === 'latest') {
        for (let i = s.live.length - 1; i >= 0; i--) {
          if (s.live[i].wsId) return s.live[i].wsId;
        }
        const sid = latestSid(s);
        const meta = s.sessions.find((x) => x.sessionId === sid);
        if (meta?.wsId) return meta.wsId;
        return s.workspaces.length > 0 ? s.workspaces[0].id : null;
      }
      return null;
    }

    /** Does a record belong to one workspace? Old records without wsId fall back to the session list. */
    function recInWs(s, rec, wsId) {
      if (!wsId) return false;
      if (rec.wsId) return rec.wsId === wsId;
      const w = s.workspaces.find((x) => x.id === wsId);
      return !!w && (w.sessions || []).includes(rec.sessionId);
    }

    /** Merged history+live records for the current selection scope (unfiltered). */
    function viewRecords(s) {
      const mode = s.selection.mode;
      let sid = mode === 'session' ? s.selection.sessionId : null;
      const wsId = mode === 'workspace' || mode === 'latest' ? effectiveWsId(s) : null;
      if (mode === 'latest' && !wsId) sid = latestSid(s);
      if (mode === 'session' || !wsId) {
        const hist = (sid && s.history[sid]?.records) || [];
        const live = sid ? s.live.filter((r) => r.sessionId === sid) : [];
        const seen = new Set(live.map((r) => r.seq));
        return hist.filter((r) => !seen.has(r.seq)).concat(live);
      }
      const wsEntry = s.workspaces.find((w) => w.id === wsId);
      const live = s.live.filter((r) => recInWs(s, r, wsId));
      const seen = new Set(live.map((r) => r.seq));
      const hist = [];
      for (const hs of (wsEntry?.sessions || [])) {
        for (const r of (s.history[hs]?.records || [])) if (!seen.has(r.seq)) hist.push(r);
      }
      return hist.concat(live).sort((a, b) => a.seq - b.seq);
    }

    /* ================= styles ================= */

    const CSS = `
.ftk-capsule{position:fixed;z-index:2147481000;display:flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);box-shadow:0 4px 18px rgba(0,0,0,.18);cursor:pointer;user-select:none;-webkit-user-select:none;font:12px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--dsw-alias-label-primary,#222);touch-action:none;max-width:60vw;transition:box-shadow .15s}
.ftk-capsule:hover{box-shadow:0 6px 22px rgba(0,0,0,.26)}
.ftk-capsule-icon{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center}
.ftk-capsule-count{font-weight:600;white-space:nowrap}
.ftk-capsule-toast{display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw;color:var(--dsw-alias-label-secondary,#666)}
.ftk-pulse{animation:ftk-pulse 1.2s ease-out}
@keyframes ftk-pulse{0%{box-shadow:0 0 0 0 rgba(74,144,217,.5)}100%{box-shadow:0 0 0 12px rgba(74,144,217,0)}}
.ftk-panel{position:fixed;z-index:2147481001;width:420px;max-width:calc(100vw - 16px);height:540px;max-height:calc(100vh - 16px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden;font:12px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--dsw-alias-label-primary,#222)}
.ftk-panel-header{display:flex;align-items:center;gap:8px;padding:10px 12px 0 12px}
.ftk-panel-title{font-size:13px;font-weight:700}
.ftk-tabs{display:flex;gap:4px;margin-left:auto}
.ftk-tab{padding:4px 12px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);border:1px solid transparent}
.ftk-tab.active{background:var(--dsw-alias-bg-layer-2,#eee);color:var(--dsw-alias-label-primary,#222);border-color:var(--dsw-alias-border-l1,#ddd);font-weight:600}
.ftk-iconbtn{border:none;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:14px;padding:2px 6px;border-radius:6px}
.ftk-iconbtn:hover{background:var(--dsw-alias-bg-layer-2,#eee);color:var(--dsw-alias-label-primary,#222)}
.ftk-toolbar{display:flex;align-items:center;gap:6px;padding:8px 12px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1,#eee)}
.ftk-sortrow{display:flex;align-items:center;gap:6px;padding:5px 12px 7px 12px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1,#eee);background:var(--dsw-alias-bg-layer-2,#f7f7f8)}
.ftk-sortlabel{font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8a8e);flex:none;margin-right:2px;letter-spacing:.03em}
.ftk-sortchip{padding:1px 9px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#ddd);cursor:pointer;color:var(--dsw-alias-label-secondary,#777);font-size:11px;line-height:17px;white-space:nowrap;background:transparent;transition:color .12s,border-color .12s}
.ftk-sortchip:hover{color:var(--dsw-alias-label-primary,#333);border-color:var(--dsw-alias-border-l2,#bbb)}
.ftk-sortchip.active{color:var(--dsw-alias-brand-primary,#247bbf);border-color:var(--dsw-alias-brand-primary,#247bbf);font-weight:600}
.ftk-select{background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;padding:4px 6px;font-size:12px;flex:1 1 0;min-width:0}
.ftk-chip{padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#ccc);cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:11px;white-space:nowrap}
.ftk-chip.active{background:var(--dsw-alias-brand-primary,#247bbf);border-color:var(--dsw-alias-brand-primary,#247bbf);color:#fff}
.ftk-search{flex:1;min-width:90px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;padding:4px 8px;font-size:12px;color:inherit}
.ftk-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
.ftk-group{padding:4px 12px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-bg-layer-2,#f2f2f2);position:sticky;top:0;z-index:1;border-bottom:1px solid var(--dsw-alias-border-l1,#eee)}
.ftk-row{display:flex;gap:8px;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#f0f0f0);align-items:flex-start;cursor:default}
.ftk-row:hover{background:var(--dsw-alias-bg-layer-2,#f6f6f6)}
.ftk-badge{min-width:18px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex:none;margin-top:1px}
.ftk-rowmain{flex:1;min-width:0}
.ftk-name{font-weight:600;word-break:break-all}
.ftk-sess{display:inline-block;margin-right:6px;padding:0 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,#ececef);color:var(--dsw-alias-label-secondary,#777);font-size:10px;line-height:16px;font-weight:500;vertical-align:1px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ftk-dir{color:var(--dsw-alias-label-secondary,#777);font-size:11px;word-break:break-all}
.ftk-time{margin-left:auto;color:var(--dsw-alias-label-secondary,#888);font-size:11px;flex:none;padding-top:2px}
.ftk-size{color:var(--dsw-alias-label-secondary,#888);font-size:11px;flex:none;padding-top:2px;min-width:54px;text-align:right;font-variant-numeric:tabular-nums}
.ftk-empty{padding:28px 16px;text-align:center;color:var(--dsw-alias-label-secondary,#888)}
.ftk-more{padding:8px;text-align:center}
.ftk-more button{background:transparent;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:4px 14px;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.ftk-more button:hover{background:var(--dsw-alias-bg-layer-2,#eee)}
.ftk-menu{position:fixed;z-index:2147481002;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:4px;min-width:170px;font:12px system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--dsw-alias-label-primary,#222)}
.ftk-menu-item{padding:6px 12px;border-radius:6px;cursor:pointer;white-space:nowrap}
.ftk-menu-item:hover{background:var(--dsw-alias-bg-layer-2,#eee)}
.ftk-menu-item.disabled{opacity:.4;cursor:default}
.ftk-menu-item.disabled:hover{background:transparent}
.ftk-notice{position:fixed;left:50%;transform:translateX(-50%);bottom:28px;background:var(--dsw-alias-bg-overlay,#333);color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-l2,#555);box-shadow:0 6px 24px rgba(0,0,0,.3);padding:6px 16px;border-radius:9px;font-size:12px;pointer-events:none;white-space:nowrap;z-index:2147481003}
.ftk-form{flex:1;overflow-y:auto;padding:10px 14px 16px 14px}
.ftk-section{font-size:11px;font-weight:700;color:var(--dsw-alias-label-secondary,#777);margin:12px 0 6px 0;text-transform:uppercase;letter-spacing:.04em}
.ftk-field{display:flex;align-items:center;gap:8px;margin:7px 0}
.ftk-field-col{display:flex;flex-direction:column;gap:4px;margin:7px 0}
.ftk-field label{flex:1}
.ftk-hint{color:var(--dsw-alias-label-secondary,#888);font-size:11px}
.ftk-switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l2,#bbb);cursor:pointer;border:none;flex:none;padding:0;transition:background .15s}
.ftk-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#247bbf)}
.ftk-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
.ftk-switch[aria-checked="true"]::after{left:18px}
.ftk-input{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;padding:4px 8px;font-size:12px;color:inherit;width:100%;box-sizing:border-box}
.ftk-textarea{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;padding:6px 8px;font-size:12px;color:inherit;width:100%;box-sizing:border-box;min-height:72px;resize:vertical;font-family:inherit}
.ftk-range{flex:1;max-width:150px}
.ftk-btn{background:var(--dsw-alias-bg-layer-2,#eee);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:5px 14px;cursor:pointer;color:var(--dsw-alias-label-primary,#222);font-size:12px}
.ftk-btn:hover{border-color:var(--dsw-alias-brand-primary,#247bbf)}
.ftk-btn.primary{background:var(--dsw-alias-brand-primary,#247bbf);border-color:var(--dsw-alias-brand-primary,#247bbf);color:#fff}
.ftk-logrow{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#eee)}
.ftk-logrow .meta{flex:1;min-width:0}
.ftk-logrow .name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ftk-logrow .sub{color:var(--dsw-alias-label-secondary,#888);font-size:11px}
.ftk-danger{color:var(--dsw-alias-state-error-primary,#c0392b)}
`;

    function Styles() { return h('style', null, CSS); }

    function capsuleIcon() {
      return h('svg', { viewBox: '0 0 64 64', width: 16, height: 16, 'aria-hidden': true },
        h('path', { d: 'M8 14a4 4 0 0 1 4-4h12.5l6 6H52a4 4 0 0 1 4 4v4H8z', fill: '#5aa2e0' }),
        h('path', { d: 'M8 24h48v24a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z', fill: '#3a7bc8' }),
        h('polyline', { points: '16,38 24,38 28,30 34,45 38,38 48,38', fill: 'none', stroke: '#fff', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      );
    }

    /* ================= global notice toast ================= */

    function Notice() {
      const s = useStore();
      if (!s.notice) return null;
      return h('div', { className: 'ftk-notice' }, s.notice.text);
    }

    /* ================= context menu ================= */

    function ContextMenu() {
      const s = useStore();
      useEffect(() => {
        if (!s.menu) return undefined;
        const close = () => store.set({ menu: null });
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('pointerdown', close, true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('blur', close);
        return () => {
          window.removeEventListener('pointerdown', close, true);
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('blur', close);
        };
      }, [s.menu]);
      if (!s.menu) return null;
      const rec = s.menu.rec;
      const isDel = rec.kind === 'delete';
      const isExcluded = rec.kind === 'excluded' || (rec.count !== undefined && rec.isDir);
      const x = Math.min(s.menu.x, window.innerWidth - 200);
      const y = Math.min(s.menu.y, window.innerHeight - 100);
      return h('div', {
        className: 'ftk-menu', style: { left: x, top: y },
        onPointerDown: (e) => e.stopPropagation(), 'data-ftk-menu': 'true',
      },
        h('div', {
          className: 'ftk-menu-item' + (isDel ? ' disabled' : ''),
          title: isDel ? T('deletedHint') : undefined,
          onClick: () => { if (!isDel) { revealRecord(rec); store.set({ menu: null }); } },
        }, isExcluded ? T('openFolder') : T('openLocation')),
        h('div', {
          className: 'ftk-menu-item',
          onClick: () => { copyText(rec.fromPath ? rec.fromPath + ' → ' + rec.path : rec.path); store.set({ menu: null }); },
        }, T('copyPath')),
      );
    }

    /* ================= record rows ================= */

    function RecordRow({ rec, sess }) {
      const parts = splitPath(rec.path);
      const meta = KIND[rec.kind] ?? KIND.modify;
      const title = rec.fromPath ? rec.fromPath + ' → ' + rec.path : rec.path;
      const sessTag = sess ? h('span', { className: 'ftk-sess', title: sess }, sess) : null;
      if (rec.kind === 'excluded' || (rec.count !== undefined && rec.isDir)) {
        const aggMeta = KIND[rec.kind] ?? KIND.excluded;
        return h('div', {
          className: 'ftk-row', title,
          onContextMenu: (e) => { e.preventDefault(); store.set({ menu: { x: e.clientX, y: e.clientY, rec } }); },
          onDoubleClick: () => revealRecord(rec),
        },
          h('span', { className: 'ftk-badge', style: { background: aggMeta.token }, 'aria-label': T(aggMeta.key) }, aggMeta.glyph),
          h('div', { className: 'ftk-rowmain' },
            h('div', { className: 'ftk-name' }, sessTag, parts.name + (parts.dir ? ' \\' : '')),
            h('div', { className: 'ftk-dir', style: { fontStyle: 'italic' } },
              T('aggSummary', { count: rec.count ?? 0 })),
            h('div', { className: 'ftk-dir' }, parts.dir)),
          h('span', { className: 'ftk-size' }, fmtSize(rec)),
          h('span', { className: 'ftk-time' }, fmtTime(rec.ts)),
        );
      }
      return h('div', {
        className: 'ftk-row', title,
        onContextMenu: (e) => { e.preventDefault(); store.set({ menu: { x: e.clientX, y: e.clientY, rec } }); },
        onDoubleClick: () => revealRecord(rec),
      },
        h('span', { className: 'ftk-badge', style: { background: meta.token }, 'aria-label': T(meta.key) }, meta.glyph),
        h('div', { className: 'ftk-rowmain' },
          h('div', { className: 'ftk-name' }, sessTag, parts.name,
            rec.idle ? h('span', { className: 'ftk-sess', title: T('idleHint'), style: { marginLeft: 6 } }, '☾ ' + T('idleTag')) : null),
          h('div', { className: 'ftk-dir' }, (rec.fromPath ? T('from') + ' ' + splitPath(rec.fromPath).dir + ' · ' : '') + parts.dir),
        ),
        h('span', { className: 'ftk-size' }, fmtSize(rec)),
        h('span', { className: 'ftk-time' }, fmtTime(rec.ts)),
      );
    }

    function passFilters(rec, kinds, query) {
      if (kinds.length > 0 && !kinds.includes(rec.kind)) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!rec.path.toLowerCase().includes(q) && !(rec.fromPath || '').toLowerCase().includes(q)) return false;
      }
      return true;
    }

    function RecordsView() {
      const s = useStore();
      const mode = s.selection.mode;
      let sid = mode === 'session' ? s.selection.sessionId : null;
      const wsId = mode === 'workspace' || mode === 'latest' ? effectiveWsId(s) : null;
      if (mode === 'latest' && !wsId) sid = latestSid(s); // pre-workspace fallback
      const wsEntry = wsId ? s.workspaces.find((w) => w.id === wsId) : null;
      // Workspace the current view effectively belongs to (also when drilling into one session).
      const wsIdOfSession = (ssid) => {
        if (!ssid) return null;
        const meta = s.sessions.find((x) => x.sessionId === ssid);
        if (meta?.wsId) return meta.wsId;
        const live = [...s.live].reverse().find((r) => r.sessionId === ssid && r.wsId);
        if (live) return live.wsId;
        const w = s.workspaces.find((x) => (x.sessions || []).includes(ssid));
        return w?.id ?? null;
      };
      const effWs = mode === 'session' ? wsIdOfSession(sid) : wsId;
      const effWsEntry = effWs ? s.workspaces.find((w) => w.id === effWs) : null;
      useEffect(() => {
        if (mode === 'session' && sid) ensureHistory(sid);
        if (wsId && wsEntry) {
          for (const hs of (wsEntry.sessions || []).slice(0, 8)) ensureHistory(hs);
        }
        markScopeSeen(s);
      }, [mode, sid, wsId, s.historyEpoch]);

      const kinds = s.filterKinds;
      const kindChips = ['create', 'modify', 'delete', 'rename', 'move'].map((k) =>
        h('span', {
          key: k,
          className: 'ftk-chip' + (kinds.includes(k) ? ' active' : ''),
          onClick: () => {
            const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : kinds.concat([k]);
            store.set({ filterKinds: next });
          },
        }, T(KIND[k].key)));

      const sessionOptions = s.sessions
        .filter((x) => !effWs || (x.wsId ? x.wsId === effWs : ((effWsEntry?.sessions || []).includes(x.sessionId))))
        .map((x) =>
          h('option', { key: x.sessionId, value: x.sessionId }, x.title || String(x.sessionId).slice(0, 12) + '…'));

      const records = viewRecords(s);
      const filtered = records.filter((r) => passFilters(r, kinds, s.query.trim()));

      const sort = s.sort || { field: 'default', dir: 'desc' };
      const KIND_ORDER = { create: 0, modify: 1, rename: 2, move: 3, delete: 4, excluded: 5 };
      const sorted = sort.field === 'default' ? null : filtered.slice().sort((a, b) => {
        let d = 0;
        if (sort.field === 'time') d = a.ts - b.ts;
        else if (sort.field === 'size') d = (a.size ?? -1) - (b.size ?? -1);
        else if (sort.field === 'name') d = splitPath(a.path).name.localeCompare(splitPath(b.path).name);
        else if (sort.field === 'kind') d = ((KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)) || (a.ts - b.ts);
        if (d === 0) d = a.seq - b.seq;
        return sort.dir === 'asc' ? d : -d;
      });
      const setSort = (field) => {
        if (field === 'default') store.set({ sort: { field: 'default', dir: 'desc' } });
        else if (sort.field === field) store.set({ sort: { field, dir: sort.dir === 'desc' ? 'asc' : 'desc' } });
        else store.set({ sort: { field, dir: field === 'name' || field === 'kind' ? 'asc' : 'desc' } });
      };
      const sortChip = (field, key) => h('span', {
        key: field,
        className: 'ftk-sortchip' + (sort.field === field ? ' active' : ''),
        onClick: () => setSort(field),
      }, T(key) + (sort.field === field && field !== 'default' ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''));

      // Grouping.
      const groups = [];
      if (mode !== 'session' && wsId) {
        let curKey = null;
        for (const rec of filtered) {
          if (rec.sessionId !== curKey) {
            curKey = rec.sessionId;
            groups.push({ key: 's' + curKey, label: sessionTitleOf(s, curKey), items: [] });
          }
          groups[groups.length - 1].items.push(rec);
        }
        groups.reverse();
        for (const g of groups) g.items.reverse();
      } else {
        let curKey = null;
        for (let i = filtered.length - 1; i >= 0; i--) {
          const rec = filtered[i];
          const key = String(rec.round ?? 0);
          if (key !== curKey) {
            curKey = key;
            groups.push({ key: 'r' + key, label: T('roundLabel', { n: rec.round ?? 0 }), items: [] });
          }
          groups[groups.length - 1].items.push(rec);
        }
      }

      const histEntry = sid ? s.history[sid] : null;

      return h(React.Fragment, null,
        h('div', { className: 'ftk-toolbar' },
          h('select', {
            className: 'ftk-select',
            title: T('followLatest'),
            value: mode === 'latest' ? 'follow' : (effWs ?? 'follow'),
            onChange: (e) => {
              const v = e.target.value;
              if (v === 'follow') store.set({ selection: { mode: 'latest', sessionId: null, wsId: null } });
              else if (v) store.set({ selection: { mode: 'workspace', wsId: v, sessionId: null } });
            },
          },
            h('option', { value: 'follow' }, T('followLatest')),
            s.workspaces.map((w) => h('option', { key: w.id, value: w.id }, w.name))),
          h('select', {
            className: 'ftk-select',
            title: T('allSessionsHint'),
            value: mode === 'session' ? (s.selection.sessionId ?? '') : '',
            onChange: (e) => {
              const v = e.target.value;
              if (v) store.set({ selection: { mode: 'session', sessionId: v, wsId: null } });
              else {
                const wsNow = effWs ?? effectiveWsId(s);
                store.set({
                  selection: wsNow
                    ? { mode: 'workspace', wsId: wsNow, sessionId: null }
                    : { mode: 'latest', sessionId: null, wsId: null },
                });
              }
            },
          },
            h('option', { value: '' }, T('wholeWorkspace')),
            sessionOptions),
        ),
        h('div', { className: 'ftk-toolbar', style: { padding: '6px 12px' } },
          h('input', {
            className: 'ftk-search',
            placeholder: T('searchPlaceholder'),
            value: s.query,
            onChange: (e) => store.set({ query: e.target.value }),
          }),
        ),
        h('div', { className: 'ftk-toolbar', style: { padding: '6px 12px' } },
          h('span', {
            className: 'ftk-chip' + (kinds.length === 0 ? ' active' : ''),
            onClick: () => store.set({ filterKinds: [] }),
          }, T('filterAll')),
          ...kindChips,
        ),
        h('div', { className: 'ftk-sortrow' },
          h('span', { className: 'ftk-sortlabel' }, T('sortLabel')),
          sortChip('default', 'sortDefault'),
          sortChip('time', 'sortTime'),
          sortChip('size', 'sortSize'),
          sortChip('name', 'sortName'),
          sortChip('kind', 'sortKind'),
        ),
        h('div', { className: 'ftk-list', style: { position: 'relative' } },
          filtered.length === 0
            ? h('div', { className: 'ftk-empty' },
                mode === 'session' || !wsId
                  ? (sid ? T('noRecordsSession') : T('noRecords'))
                  : (wsEntry?.name ? T('wsEmptyNamed', { name: wsEntry.name }) : T('wsEmpty')))
            : null,
          histEntry && histEntry.hasMore && mode === 'session'
            ? h('div', { className: 'ftk-more' },
                h('button', { onClick: () => loadEarlier(sid), disabled: histEntry.loading },
                  histEntry.loading ? T('loading') : T('loadEarlier')))
            : null,
          groups.length > 0 && sort.field === 'default'
            ? groups.map((g) => h(React.Fragment, { key: g.key },
                h('div', { className: 'ftk-group' }, g.label + ' · ' + g.items.length),
                g.items.map((rec) => h(RecordRow, { key: rec.seq + ':' + rec.path, rec })),
              ))
            : null,
          sorted
            ? sorted.map((rec) => h(RecordRow, {
                key: rec.seq + ':' + rec.path,
                rec,
                sess: mode !== 'session' ? sessionTitleOf(s, rec.sessionId) : null,
              }))
            : null,
        ),
      );
    }

    /* ================= settings view ================= */

    function SettingsView({ embedded }) {
      const s = useStore();
      const settings = s.settings;
      const [draft, setDraft] = useState(null);
      const [saveState, setSaveState] = useState('');
      useEffect(() => {
        if (settings && !draft) setDraft(JSON.parse(JSON.stringify(settings)));
      }, [settings]);
      useEffect(() => {
        if (embedded || s.tab === 'settings') refreshLogs();
      }, [embedded, s.tab]);
      if (!settings || !draft) return h('div', { className: 'ftk-empty' }, T('loading'));

      const setField = (path, value) => {
        setDraft((d) => {
          const next = JSON.parse(JSON.stringify(d));
          if (path === 'enabled') next.enabled = value;
          else if (path === 'logDir') next.logDir = value;
          else if (path === 'retentionDays') next.retentionDays = value;
          else if (path === 'exclusions') next.exclusions = value;
          else if (path === 'excludedSummary') next.excludedSummary = value;
          else if (path.startsWith('ui.')) next.ui[path.slice(3)] = value;
          return next;
        });
      };

      const doSave = async () => {
        setSaveState('saving');
        try {
          const payload = {
            enabled: draft.enabled,
            logDir: draft.logDir,
            retentionDays: Number(draft.retentionDays) || 30,
            excludedSummary: draft.excludedSummary !== false,
            exclusions: String(draft.exclusionsText ?? (draft.exclusions || []).join('\n')).split('\n').map((x) => x.trim()).filter(Boolean),
            ui: draft.ui,
          };
          await saveSettingsNow(payload);
          setSaveState('saved');
          setTimeout(() => setSaveState(''), 1600);
        } catch {
          setSaveState('failed');
        }
      };

      const switchRow = (label, hint, checked, onChange) =>
        h('div', { className: 'ftk-field' },
          h('label', null, label, hint ? h('div', { className: 'ftk-hint' }, hint) : null),
          h('button', {
            className: 'ftk-switch', role: 'switch', 'aria-checked': checked ? 'true' : 'false',
            onClick: () => onChange(!checked),
          }));

      return h('div', { className: 'ftk-form' },
        switchRow(T('settingsEnable'), T('settingsEnableHint'), draft.enabled, (v) => {
          setField('enabled', v);
          saveSettingsNow({ enabled: v }).catch(() => {});
        }),

        h('div', { className: 'ftk-section' }, T('settingsUi')),
        switchRow(T('settingsShowOnEvent'), null, draft.ui.showOnEvent !== false, (v) => {
          setField('ui.showOnEvent', v);
          saveSettingsNow({ ui: { ...settings.ui, showOnEvent: v } }).catch(() => {});
        }),
        h('div', { className: 'ftk-field' },
          h('label', null, T('settingsOpacity')),
          h('input', {
            className: 'ftk-range', type: 'range', min: 30, max: 100,
            value: Math.round((draft.ui.opacity ?? 1) * 100),
            onChange: (e) => setField('ui.opacity', Number(e.target.value) / 100),
          }),
          h('span', null, Math.round((draft.ui.opacity ?? 1) * 100) + '%')),
        h('div', { className: 'ftk-field' },
          h('label', null, T('settingsScale')),
          h('input', {
            className: 'ftk-range', type: 'range', min: 75, max: 150, step: 5,
            value: Math.round((draft.ui.scale ?? 1) * 100),
            onChange: (e) => setField('ui.scale', Number(e.target.value) / 100),
          }),
          h('span', null, Math.round((draft.ui.scale ?? 1) * 100) + '%')),
        h('div', { className: 'ftk-field' },
          h('button', {
            className: 'ftk-btn',
            onClick: () => {
              setField('ui.position', null);
              saveSettingsNow({ ui: { ...draft.ui, position: null } }).catch(() => {});
            },
          }, T('settingsResetPos'))),

        h('div', { className: 'ftk-section' }, T('settingsCapture')),
        switchRow(T('settingsExcludedSummary'), T('settingsExcludedSummaryHint'), draft.excludedSummary !== false, (v) => {
          setField('excludedSummary', v);
          saveSettingsNow({ excludedSummary: v }).catch(() => {});
        }),
        h('div', { className: 'ftk-field-col' },
          h('label', null, T('settingsExclusions')),
          h('textarea', {
            className: 'ftk-textarea',
            value: draft.exclusionsText !== undefined ? draft.exclusionsText : (draft.exclusions || []).join('\n'),
            onChange: (e) => setDraft((d) => ({ ...d, exclusionsText: e.target.value })),
          }),
          h('div', { className: 'ftk-hint' }, T('settingsExclusionsHint'))),
        h('div', { className: 'ftk-field-col' },
          h('label', null, T('settingsLogDir')),
          h('input', {
            className: 'ftk-input', value: draft.logDir || '', placeholder: s.defaultLogDir,
            onChange: (e) => setField('logDir', e.target.value),
          }),
          h('div', { className: 'ftk-hint' }, T('settingsLogDirHint', { dir: s.defaultLogDir || '…' })),
          h('div', { className: 'ftk-hint', style: { wordBreak: 'break-all' } }, T('settingsLogDirEffective', { dir: (draft.logDir || s.defaultLogDir) || '…' }))),
        h('div', { className: 'ftk-field' },
          h('label', null, T('settingsRetention')),
          h('input', {
            className: 'ftk-input', style: { width: 70 }, type: 'number', min: 1, max: 3650,
            value: draft.retentionDays,
            onChange: (e) => setField('retentionDays', e.target.value),
          })),
        h('div', { className: 'ftk-field', style: { gap: 10 } },
          h('button', { className: 'ftk-btn primary', onClick: doSave },
            saveState === 'saving' ? T('loading') : T('settingsSave')),
          saveState === 'saved' ? h('span', { style: { color: 'var(--dsw-alias-state-success-primary,#2a7)' } }, T('settingsSaved')) : null,
          saveState === 'failed' ? h('span', { className: 'ftk-danger' }, T('settingsSaveFailed')) : null,
          h('button', {
            className: 'ftk-btn',
            onClick: () => {
              apiSend('open-log-dir', 'POST', {})
                .then((out) => setNotice(out && out.ok ? T('logDirOpened') : T('revealFailed')))
                .catch(() => setNotice(T('revealFailed')));
            },
          }, T('settingsOpenLogDir'))),

        h('div', { className: 'ftk-section' }, T('settingsLogs')),
        s.logsLoading && !s.logs ? h('div', { className: 'ftk-hint' }, T('loading')) : null,
        s.logs && s.logs.length === 0 ? h('div', { className: 'ftk-hint' }, T('settingsLogsEmpty')) : null,
        (s.logs || []).map((log) => h('div', { className: 'ftk-logrow', key: log.file },
          h('div', { className: 'meta' },
            h('div', { className: 'name', title: log.cwd || log.sessionId }, log.title || String(log.sessionId).slice(0, 16) + '…'),
            h('div', { className: 'sub' }, fmtBytes(log.bytes) + ' · ' + new Date(log.mtime).toLocaleString())),
          h('button', {
            className: 'ftk-btn ftk-danger',
            onClick: () => deleteLog(log.sessionId, log.title),
          }, T('settingsLogsDelete')))),
      );
    }

    /* ================= capsule & panel ================= */

    function Panel() {
      const s = useStore();
      if (!s.panelOpen) return null;
      const settings = s.settings;
      const scale = settings?.ui?.scale ?? 1;
      const opacity = settings?.ui?.opacity ?? 1;
      const W = Math.round(420 * scale);
      const H = Math.round(540 * scale);
      const pos = settings?.ui?.position;
      let style;
      if (pos) {
        const left = Math.max(8, Math.min(pos.x, window.innerWidth - W - 8));
        const top = Math.max(8, Math.min(pos.y - H - 10, window.innerHeight - H - 8));
        style = { left, top: Math.min(top, window.innerHeight - 60), width: W, height: H, opacity };
      } else {
        style = { right: 20, bottom: 140, width: W, height: H, opacity };
      }
      return h('div', { className: 'ftk-panel', style, 'data-ftk-panel': 'true' },
        h('div', { className: 'ftk-panel-header' },
          h('span', { className: 'ftk-capsule-icon' }, capsuleIcon()),
          h('span', { className: 'ftk-panel-title' }, T('panelTitle')),
          h('div', { className: 'ftk-tabs' },
            h('span', {
              className: 'ftk-tab' + (s.tab === 'records' ? ' active' : ''),
              onClick: () => store.set({ tab: 'records' }),
            }, T('tabRecords')),
            h('span', {
              className: 'ftk-tab' + (s.tab === 'settings' ? ' active' : ''),
              onClick: () => store.set({ tab: 'settings' }),
            }, T('tabSettings'))),
          h('button', { className: 'ftk-iconbtn', title: T('closePanel'), onClick: () => setPanelOpen(false) }, '✕'),
        ),
        s.tab === 'records' ? h(RecordsView, null) : h(SettingsView, { embedded: false }),
      );
    }

    function Capsule() {
      const s = useStore();
      const settings = s.settings;
      const dragPos = useRef(null);
      const [, force] = useState(0);

      // Re-render to expire the toast.
      useEffect(() => {
        if (!s.lastEvent) return undefined;
        const t = setTimeout(() => force((x) => x + 1), 2900);
        return () => clearTimeout(t);
      }, [s.lastEvent]);

      // Clicking anywhere outside the panel/capsule/menu closes the panel.
      useEffect(() => {
        if (!s.panelOpen) return undefined;
        const onDown = (e) => {
          const t = e.target;
          if (t && typeof t.closest === 'function'
            && t.closest('[data-ftk-panel],[data-ftk-capsule],[data-ftk-menu]')) return;
          setPanelOpen(false);
        };
        window.addEventListener('pointerdown', onDown, true);
        return () => window.removeEventListener('pointerdown', onDown, true);
      }, [s.panelOpen]);

      if (s.host === 'down') return h(Styles, null);
      if (!settings) return h(Styles, null);

      const count = viewRecords(s).reduce((n, r) => n + (r.seq > (s.seen[r.sessionId] ?? 0) ? 1 : 0), 0);
      const toast = s.lastEvent && settings.ui?.showOnEvent !== false && Date.now() - s.lastEvent.at < 2800
        ? s.lastEvent.record : null;
      const pos = dragPos.current ?? settings.ui?.position;
      const posStyle = pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 84 };
      const scale = settings.ui?.scale ?? 1;
      const opacity = settings.ui?.opacity ?? 1;

      const onPointerDown = (e) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const start = { x: e.clientX, y: e.clientY };
        const origin = { x: rect.left, y: rect.top };
        let moved = false;
        const move = (ev) => {
          const dx = ev.clientX - start.x;
          const dy = ev.clientY - start.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) > 6) moved = true;
          if (moved) {
            dragPos.current = {
              x: Math.max(0, Math.min(origin.x + dx, window.innerWidth - 60)),
              y: Math.max(0, Math.min(origin.y + dy, window.innerHeight - 34)),
            };
            force((n) => n + 1);
          }
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (moved && dragPos.current) {
            const final = dragPos.current;
            dragPos.current = null;
            const next = applyLocalSettings((st) => { st.ui.position = { x: Math.round(final.x), y: Math.round(final.y) }; });
            if (next) saveSettingsDebounced({ ui: next.ui }, 400);
          } else {
            setPanelOpen(!s.panelOpen);
          }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        e.preventDefault();
      };

      const kindMeta = toast ? (KIND[toast.kind] ?? KIND.modify) : null;
      return h(React.Fragment, null,
        h(Styles, null),
        h('div', {
          className: 'ftk-capsule' + (toast ? ' ftk-pulse' : ''),
          style: { ...posStyle, opacity, zoom: scale },
          onPointerDown,
          title: T('title'),
          role: 'button',
          'aria-label': T('title'),
          'data-ftk-capsule': 'true',
        },
          h('span', { className: 'ftk-capsule-icon' }, capsuleIcon()),
          h('span', { className: 'ftk-capsule-count' }, T('capsuleCount', { n: count })),
          toast
            ? h('span', { className: 'ftk-capsule-toast' },
                h('span', { style: { color: kindMeta.token, fontWeight: 700 } }, kindMeta.glyph),
                splitPath(toast.path).name)
            : null,
        ),
        h(Panel, null),
        h(ContextMenu, null),
        h(Notice, null),
      );
    }

    /* ================= plugins settings card ================= */

    function SettingsCard(props) {
      const t = props.t || T;
      const s = useStore();
      if (props.view === 'summary') {
        return h('span', null,
          s.settings
            ? (s.settings.enabled ? t('shortDesc') : t('settingsEnableHint'))
            : t('shortDesc'));
      }
      if (s.host === 'down' || !s.settings) {
        return h('div', { className: 'ftk-hint' }, t('hostDown'));
      }
      return h('div', { style: { maxWidth: 560 } },
        h(Styles, null),
        h(SettingsView, { embedded: true }));
    }

    /* ================= settings panel section ================= */

    function SettingsSection(props) {
      const t = props.t || T;
      const s = useStore();
      if (s.host === 'down' || !s.settings) {
        return h('div', { className: 'ftk-hint', style: { padding: 16 } }, t('hostDown'));
      }
      return h('div', { style: { maxWidth: 640, padding: '4px 0 16px 0' } },
        h(Styles, null),
        h(SettingsView, { embedded: true }));
    }

    /* ================= activation ================= */

    /**
     * Register into slots that may not be declared yet at cold boot (the
     * shell declares several seats during its first render). Retry while the
     * injection throws; a silent no-op is indistinguishable from success, so
     * only thrown attempts are retried.
     */
    function injectWithRetry(ctx, label, setup) {
      ctx.effect(() => {
        let dispose = null;
        let timer = null;
        const attempt = () => {
          try { dispose = setup(); return true; } catch { return false; }
        };
        if (!attempt()) {
          timer = setInterval(() => {
            if (attempt()) { clearInterval(timer); timer = null; }
          }, 500);
        }
        return () => {
          if (timer) clearInterval(timer);
          if (dispose) { try { dispose(); } catch { /* ignore */ } }
        };
      }, label);
    }

    function apply(ctx) {
      try {
        const bound = ctx.locale.bind(NS);
        T = (key, vars) => fill(bound(key) ?? zh[key] ?? key, vars);
      } catch { /* keep the built-in zh fallback */ }

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'file-tracker: dictionaries');

      ctx.effect(() => {
        let stopped = false;
        const tick = () => {
          if (stopped) return;
          if (typeof document === 'undefined' || !document.hidden) pollOnce().catch(() => {});
        };
        tick();
        const timer = setInterval(tick, 800);
        const onVis = () => { if (!document.hidden) tick(); };
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
        return () => {
          stopped = true;
          clearInterval(timer);
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
        };
      }, 'file-tracker: poller');

      injectWithRetry(ctx, 'file-tracker: capsule', () => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'file-tracker-capsule',
        order: 500,
      }, Capsule)));

      injectWithRetry(ctx, 'file-tracker: settings card', () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item',
        id: 'file-tracker',
        order: 60,
        label: () => T('title'),
        locale: NS,
      }, SettingsCard)));

      injectWithRetry(ctx, 'file-tracker: settings section', () => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'file-tracker',
        order: 55,
        label: () => T('title'),
        locale: NS,
      }, SettingsSection)));
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale'];
    return module.exports;
  },
});
