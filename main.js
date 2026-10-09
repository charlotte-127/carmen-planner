const { app, BrowserWindow, ipcMain, session, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION = 'persist:canvas'; // Canvas sign-in cookies live here, only on this computer
const DEFAULT_BASE = 'https://osu.instructure.com';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const IS_MAC = process.platform === 'darwin';

let mainWin = null;
let loginWin = null;

/* ---------- local settings (the API key is only ever stored encrypted) ---------- */

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');

function readCfg() {
  const base = { baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL };
  try {
    return { ...base, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) };
  } catch {
    return base;
  }
}

function saveCfg(obj) {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(obj, null, 2));
}

const writeCfg = (patch) => saveCfg({ ...readCfg(), ...patch });

function normalizeBase(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw new Error('That is not a valid web address.');
  }
  if (url.protocol !== 'https:') throw new Error('The Canvas address must start with https://');
  return url.origin;
}

// Mac: encrypted with the Keychain. Windows: encrypted with Windows DPAPI.
function getKey() {
  const c = readCfg();
  if (!c.keyEnc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(c.keyEnc, 'base64'));
  } catch {
    return null;
  }
}

/* ---------- reading Canvas (read-only, with the student's own sign-in) ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const canvasSession = () => session.fromPartition(PARTITION);

function authError() {
  const e = new Error('You are not signed in to Canvas.');
  e.code = 'AUTH';
  return e;
}

async function canvasGet(url) {
  const res = await canvasSession().fetch(url, {
    headers: { Accept: 'application/json+canvas-string-ids, application/json' },
    credentials: 'include',
  });
  if (res.status === 401) throw authError();
  if (res.status === 403) {
    const e = new Error('No access');
    e.status = 403;
    throw e;
  }
  if (!res.ok) throw new Error(`Canvas returned an error (${res.status}).`);
  const text = (await res.text()).replace(/^while\(1\);/, ''); // Canvas prefixes JSON when using cookies
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw authError(); // an HTML sign-in page came back instead of data
  }
  const link = res.headers.get('link') || '';
  const m = link.match(/<([^>]+)>;\s*rel="next"/);
  return { json, next: m ? m[1] : null };
}

async function getAll(base, pathOrUrl, maxPages = 10) {
  let url = pathOrUrl.startsWith('http') ? pathOrUrl : base + pathOrUrl;
  const out = [];
  for (let i = 0; i < maxPages && url; i++) {
    const { json, next } = await canvasGet(url);
    if (!Array.isArray(json)) return json;
    out.push(...json);
    url = next && new URL(next).origin === base ? next : null;
    if (url) await sleep(120); // stay gentle with Canvas
  }
  return out;
}

async function isSignedIn(base) {
  try {
    await canvasGet(`${base}/api/v1/users/self/profile`);
    return true;
  } catch {
    return false;
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function progress(text) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sync:progress', text);
}

// Opens Canvas in a separate window. The student signs in themselves (SSO + Duo).
// The app never sees the password; it only keeps the session cookie on this computer.
function openLogin(base) {
  return new Promise((resolve) => {
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.focus();
      return resolve(false);
    }
    const host = new URL(base).host;
    let finished = false;
    let checking = false;

    loginWin = new BrowserWindow({
      width: 520,
      height: 760,
      title: 'Sign in to Canvas',
      parent: mainWin || undefined,
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
    });

    const finish = (ok) => {
      if (finished) return;
      finished = true;
      const w = loginWin;
      loginWin = null;
      if (w && !w.isDestroyed()) w.close();
      resolve(ok);
    };

    // Only check once the page is back on Canvas itself, not in the middle of SSO or Duo.
    const maybeCheck = async (url) => {
      if (finished || checking) return;
      let u;
      try {
        u = new URL(url);
      } catch {
        return;
      }
      if (u.host !== host || u.pathname.startsWith('/login')) return;
      checking = true;
      const ok = await isSignedIn(base);
      checking = false;
      if (ok) finish(true);
    };

    loginWin.webContents.on('did-navigate', (_e, url) => maybeCheck(url));
    loginWin.webContents.on('did-navigate-in-page', (_e, url) => maybeCheck(url));
    loginWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    loginWin.on('closed', () => finish(false));
    loginWin.loadURL(base);
  });
}

async function syncCanvas() {
  const base = readCfg().baseUrl;
  progress('Reading your courses…');
  const raw = await getAll(
    base,
    '/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=term&include[]=syllabus_body&per_page=100'
  );
  const courses = (Array.isArray(raw) ? raw : []).filter((c) => c && c.name && !c.access_restricted_by_date);
  const out = { base, syncedAt: new Date().toISOString(), courses: [], assignments: [] };

  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    progress(`Reading ${c.course_code || c.name} (${i + 1} of ${courses.length})…`);
    out.courses.push({
      id: String(c.id),
      name: c.name,
      code: c.course_code || c.name,
      term: c.term && c.term.name ? c.term.name : '',
      syllabus: stripHtml(c.syllabus_body).slice(0, 4000),
    });

    const groups = {};
    try {
      const gs = await getAll(base, `/api/v1/courses/${c.id}/assignment_groups?per_page=100`);
      for (const g of gs) groups[String(g.id)] = { name: g.name, weight: g.group_weight || 0 };
      await sleep(120);
    } catch (e) {
      if (e.code === 'AUTH') throw e;
    }

    try {
      const as = await getAll(
        base,
        `/api/v1/courses/${c.id}/assignments?include[]=submission&per_page=100&order_by=due_at`
      );
      for (const a of as) {
        if (a.published === false) continue;
        const sub = a.submission || null;
        const submitted = !!(sub && (sub.submitted_at || sub.workflow_state === 'graded'));
        const g = groups[String(a.assignment_group_id)] || {};
        out.assignments.push({
          id: String(a.id),
          courseId: String(c.id),
          name: a.name,
          dueAt: a.due_at || null,
          points: a.points_possible || 0,
          submitted,
          group: g.name || '',
          groupWeight: g.weight || 0,
          url: a.html_url || '',
        });
      }
    } catch (e) {
      if (e.code === 'AUTH') throw e;
      // a course without access to its assignments is skipped; the rest still load
    }
    await sleep(150);
  }
  progress('Done.');
  return out;
}

/* ---------- Claude (only when a key is saved and the student asks for a brief) ---------- */

const AI_SYSTEM = `You are a calm, practical study coach for a first-year college student.
You get a JSON object with their upcoming Canvas tasks, a rough study schedule, and short syllabus excerpts.
Reply with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "headline": "one sentence describing what kind of week this is",
  "do_first": [{"task": "task name", "why": "one short sentence"}],
  "by_course": [{"course": "course code", "note": "1-2 sentences: what to focus on and how"}],
  "watch_out": ["short warning about a crunch, conflict, or deadline cluster"],
  "pep": "one short, honest, encouraging sentence"
}
Rules: at most 4 items in do_first and 4 in watch_out. Use only task names and courses from the input.
Do not invent deadlines. If a syllabus excerpt is empty, say less about that course rather than guessing.`;

async function aiBrief(payload) {
  const key = getKey();
  if (!key) return { ok: false, error: 'No API key saved yet. Add one in Settings.' };
  const body = JSON.stringify(payload || {});
  if (body.length > 80000) return { ok: false, error: 'There is too much data to send at once.' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: readCfg().model || DEFAULT_MODEL,
        max_tokens: 1500,
        system: AI_SYSTEM,
        messages: [{ role: 'user', content: body }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json && json.error && json.error.message ? json.error.message : `Error ${res.status}`;
      return { ok: false, error: msg };
    }
    const text = (json.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try {
      return { ok: true, result: JSON.parse(cleaned) };
    } catch {
      return { ok: true, raw: text };
    }
  } catch {
    return { ok: false, error: 'Could not reach Claude. Check your internet connection.' };
  }
}

/* ---------- messages from the interface ---------- */

ipcMain.handle('cfg:get', () => {
  const c = readCfg();
  return {
    baseUrl: c.baseUrl,
    model: c.model,
    hasKey: !!c.keyEnc,
    platform: process.platform,
    version: app.getVersion(),
  };
});

ipcMain.handle('cfg:set', (_e, patch) => {
  try {
    const next = {};
    if (patch && patch.baseUrl) next.baseUrl = normalizeBase(patch.baseUrl);
    if (patch && patch.model) next.model = String(patch.model).trim().slice(0, 80);
    writeCfg(next);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('key:set', (_e, raw) => {
  const k = String(raw || '').trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) {
    return { ok: false, error: 'That does not look like a Claude API key. It should start with sk-ant-' };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'Secure storage is not available on this computer right now.' };
  }
  writeCfg({ keyEnc: safeStorage.encryptString(k).toString('base64') });
  return { ok: true };
});

ipcMain.handle('key:clear', () => {
  const c = readCfg();
  delete c.keyEnc;
  saveCfg(c);
  return { ok: true };
});

ipcMain.handle('canvas:status', async () => ({ signedIn: await isSignedIn(readCfg().baseUrl) }));

ipcMain.handle('canvas:login', async () => {
  const base = readCfg().baseUrl;
  if (await isSignedIn(base)) return { ok: true };
  return { ok: await openLogin(base) };
});

ipcMain.handle('canvas:sync', async () => {
  try {
    return { ok: true, data: await syncCanvas() };
  } catch (e) {
    if (e.code === 'AUTH') return { ok: false, auth: true, error: 'Your Canvas sign-in expired. Sign in again.' };
    return { ok: false, error: e.message || 'Something went wrong while reading Canvas.' };
  }
});

ipcMain.handle('canvas:signout', async () => {
  await canvasSession().clearStorageData();
  await canvasSession().clearCache();
  return { ok: true };
});

ipcMain.handle('ai:brief', (_e, payload) => aiBrief(payload));

ipcMain.handle('open:external', (_e, url) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') shell.openExternal(u.toString());
  } catch {}
});

/* ---------- window ---------- */

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1120,
    minHeight: 660,
    title: 'Carmen Planner',
    backgroundColor: '#F4F3F1',
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { platform: process.platform },
  });
  mainWin.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});
