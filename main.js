const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION = 'persist:canvas'; // Canvas sign-in cookies live here, only on this computer
const DEFAULT_BASE = 'https://osu.instructure.com';
const IS_MAC = process.platform === 'darwin';

let mainWin = null;
let loginWin = null;

/* ---------- local settings (the API key is only ever stored encrypted) ---------- */

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');

function readCfg() {
  const base = { baseUrl: DEFAULT_BASE };
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
  if (res.status === 401 || res.status === 403) {
    // Canvas also answers 401 when a signed-in student simply can't see something
    // (for example a course whose Files tab is hidden). Only treat it as "signed out"
    // when the profile check fails too.
    if (res.status === 401 && (/\/users\/self\/profile/.test(url) || !(await isSignedIn(new URL(url).origin)))) {
      throw authError();
    }
    const e = new Error('No access');
    e.code = 'NOACCESS';
    e.status = res.status;
    throw e;
  }
  if (res.status === 404) {
    const e = new Error('Not found');
    e.code = 'NOACCESS';
    e.status = 404;
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

function decodeEntities(t) {
  return String(t)
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => {
      try {
        return String.fromCodePoint(+n);
      } catch {
        return ' ';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return ' ';
      }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');
}

// Turns an HTML page (syllabus, Canvas page) into simple blocks:
// { t: 'h' | 'li' | 'p', x: 'text' }. Table rows become "cell | cell".
function htmlToBlocks(html) {
  let h = String(html || '');
  h = h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ');
  // a short paragraph that is entirely bold is used as a heading on many syllabi
  h = h.replace(/<p[^>]*>\s*<(strong|b)[^>]*>([\s\S]{1,120}?)<\/\1>\s*:?\s*<\/p>/gi, (m, _t, inner) =>
    /<(p|div|li|br)/i.test(inner) ? m : `\n\u0001H${inner}\n`
  );
  h = h.replace(/<h[1-6][^>]*>/gi, '\n\u0001H').replace(/<\/h[1-6]>/gi, '\n');
  h = h.replace(/<li[^>]*>/gi, '\n\u0001L').replace(/<\/li>/gi, '\n');
  h = h.replace(/<tr[^>]*>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ');
  h = h.replace(/<(br|\/p|p|div|\/div|table|\/table|section|\/section|ul|\/ul|ol|\/ol)[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  h = decodeEntities(h);
  const blocks = [];
  for (const raw of h.split('\n')) {
    let t = 'p';
    let x = raw;
    if (x.includes('\u0001H')) t = 'h';
    else if (x.includes('\u0001L')) t = 'li';
    x = x.replace(/\u0001[HL]/g, ' ').replace(/\s*\|\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!x || /^[|\s]+$/.test(x)) continue;
    if (t === 'h' && x.length > 140) t = 'p';
    blocks.push({ t, x: x.slice(0, 1200) });
  }
  return blocks;
}

// Links to course files inside an HTML body: [{ id, text }]
function fileLinks(html) {
  const out = [];
  const re = /<a[^>]*href="([^"]*\/files\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!out.some((f) => f.id === m[2])) out.push({ id: m[2], text });
  }
  return out;
}

/* ---------- staying signed in ---------- */
// Carmen's sign-in cookies are "session" cookies, which are thrown away when the app quits.
// When "Keep me signed in" is on, we give them an expiry date so they survive a restart,
// the same thing a browser does when you choose to stay signed in. The cookies stay in this
// app's own storage on this computer, and Carmen still ends the session on its side when it
// expires. The password is never seen or stored.
const KEEP_DAYS = 30;

function cookieUrl(c) {
  const host = String(c.domain || '').replace(/^\./, '');
  return `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`;
}

async function keepCookie(c) {
  if (!c || !c.session || readCfg().keepSignedIn === false) return;
  const details = {
    url: cookieUrl(c),
    name: c.name,
    value: c.value,
    path: c.path || '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    expirationDate: Math.floor(Date.now() / 1000) + KEEP_DAYS * 86400,
  };
  if (!c.hostOnly && c.domain) details.domain = c.domain;
  if (c.sameSite && c.sameSite !== 'unspecified') details.sameSite = c.sameSite;
  try {
    await canvasSession().cookies.set(details);
  } catch {}
}

async function keepAllCookies() {
  if (readCfg().keepSignedIn === false) return;
  try {
    const all = await canvasSession().cookies.get({});
    for (const c of all) await keepCookie(c);
    await canvasSession().cookies.flushStore();
  } catch {}
}

function watchCookies() {
  canvasSession().cookies.on('changed', (_e, cookie, _cause, removed) => {
    if (!removed && cookie.session) keepCookie(cookie);
  });
}

/* ---------- update check (reads the public GitHub release list) ---------- */
const pkg = require('./package.json');

const UPDATE_REPO = { owner: 'charlotte-127', repo: 'carmen-planner' }; // used if package.json has no repository

function repoSlug() {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec((pkg.repository && pkg.repository.url) || '');
  return m ? { owner: m[1], repo: m[2] } : UPDATE_REPO;
}

function isNewer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkUpdate() {
  const slug = repoSlug();
  if (!slug) return { ok: false };
  try {
    const res = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'carmen-planner' },
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    const latest = String(json.tag_name || '').replace(/^v/, '');
    if (!latest || !isNewer(latest, app.getVersion())) return { ok: true, available: false };
    return {
      ok: true,
      available: true,
      version: latest,
      current: app.getVersion(),
      page: `https://${slug.owner.toLowerCase()}.github.io/${slug.repo}/#download`,
      notes: String(json.body || '').slice(0, 500),
    };
  } catch {
    return { ok: false };
  }
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
      if (ok) {
        await keepAllCookies();
        finish(true);
      }
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

/* ---------- one course's content: syllabus (page or PDF), modules, page outlines ---------- */

const MAX_PAGES_PER_COURSE = 30;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function soft(promise, fallback) {
  try {
    return await promise;
  } catch (e) {
    if (e.code === 'AUTH') throw e;
    return fallback;
  }
}

async function downloadFile(base, courseId, fileId) {
  const meta = await soft(canvasGet(`${base}/api/v1/courses/${courseId}/files/${fileId}`).then((r) => r.json), null);
  if (!meta || !meta.url) return null;
  const name = meta.display_name || meta.filename || 'Syllabus';
  const type = String(meta['content-type'] || '').toLowerCase();
  const kind = type.includes('pdf') || /\.pdf$/i.test(name) ? 'pdf' : type.includes('wordprocessingml') || /\.docx$/i.test(name) ? 'docx' : null;
  const info = { name, kind, url: `${base}/courses/${courseId}/files/${fileId}` };
  if (!kind) return { ...info, unsupported: true };
  if (meta.size && meta.size > MAX_FILE_BYTES) return { ...info, tooBig: true };
  try {
    const res = await canvasSession().fetch(meta.url, { credentials: 'include' });
    if (!res.ok) return { ...info, failed: true };
    const buf = Buffer.from(await res.arrayBuffer());
    const magic = buf.slice(0, 4).toString('latin1');
    const okMagic = kind === 'pdf' ? magic === '%PDF' : magic === 'PK\u0003\u0004';
    if (buf.length > MAX_FILE_BYTES || !okMagic) return { ...info, failed: true };
    return { ...info, bytes: new Uint8Array(buf) };
  } catch {
    return { ...info, failed: true };
  }
}

function headingsOf(blocks) {
  const skip = /^(overview|introduction|intro|summary|learning (objectives|outcomes|goals)|objectives|readings?|assignments?|due dates?|instructions|resources|materials|to ?do|before class|after class|announcements?|contents?|table of contents|references?|questions\??|next steps?|recap|review)$/i;
  const out = [];
  for (const b of blocks) {
    if (b.t !== 'h') continue;
    const x = b.x.replace(/[:.]\s*$/, '').trim();
    if (x.length < 3 || x.length > 90 || skip.test(x)) continue;
    if (!out.includes(x)) out.push(x);
    if (out.length >= 8) break;
  }
  return out;
}

const SYL_PAGE = /syllabus|course (information|info|policies|policy|guide|overview|details|outline)|grading (policy|policies|scale|breakdown)|course polic/i;

async function courseContent(courseId) {
  const base = readCfg().baseUrl;
  const id = encodeURIComponent(courseId);
  progress('Reading the syllabus…');
  const course = await soft(canvasGet(`${base}/api/v1/courses/${id}?include[]=syllabus_body`).then((r) => r.json), {});
  const syllabusHtml = course.syllabus_body || '';
  let syllabusBlocks = htmlToBlocks(syllabusHtml);
  const links = fileLinks(syllabusHtml);

  progress('Reading modules…');
  const modules = await soft(getAll(base, `/api/v1/courses/${id}/modules?include[]=items&per_page=50`), []);
  const out = [];
  for (const m of Array.isArray(modules) ? modules : []) {
    let items = m.items;
    if (!items && m.items_count) {
      items = await soft(getAll(base, `/api/v1/courses/${id}/modules/${m.id}/items?per_page=100`), []);
      await sleep(100);
    }
    out.push({
      name: m.name || 'Module',
      items: (items || []).map((it) => ({
        type: it.type,
        title: it.title || '',
        externalUrl: it.external_url || null,
        pageUrl: it.page_url || null,
        contentId: it.content_id ? String(it.content_id) : null,
        url: it.html_url || '',
        indent: it.indent || 0,
      })),
    });
  }

  // Page outlines (headings), plus a page that holds the syllabus itself
  let fetched = 0;
  const syllabusPages = [];
  for (const m of out) {
    for (const it of m.items) {
      if (it.type !== 'Page' || !it.pageUrl || fetched >= MAX_PAGES_PER_COURSE) continue;
      fetched++;
      progress(`Reading pages (${fetched})…`);
      const page = await soft(
        canvasGet(`${base}/api/v1/courses/${id}/pages/${encodeURIComponent(it.pageUrl)}`).then((r) => r.json),
        null
      );
      await sleep(110);
      if (!page || !page.body) continue;
      const blocks = htmlToBlocks(page.body);
      it.headings = headingsOf(blocks);
      it.excerpt = blocks
        .filter((b) => b.t !== 'h')
        .map((b) => b.x)
        .join(' ')
        .slice(0, 500);
      if (SYL_PAGE.test(it.title) && !/schedule|calendar/i.test(it.title) && syllabusPages.length < 3) {
        syllabusPages.push({ title: it.title, blocks, url: it.url });
        fileLinks(page.body).forEach((f) => links.push(f));
      }
    }
  }
  // Pages like "Syllabus", "Course Policies" or "Course Information" are part of the syllabus too
  const chars = () => syllabusBlocks.reduce((n, b) => n + b.x.length, 0);
  const extraPages = [];
  for (const pg of syllabusPages) {
    if (chars() > 12000) break;
    syllabusBlocks = syllabusBlocks.concat([{ t: 'h', x: pg.title }], pg.blocks);
    extraPages.push({ title: pg.title, url: pg.url });
  }
  // A short Syllabus page (only contact details, say): the course home page often has the rest
  if (chars() < 1500) {
    const front = await soft(canvasGet(`${base}/api/v1/courses/${id}/front_page`).then((r) => r.json), null);
    if (front && front.body) {
      const fb = htmlToBlocks(front.body);
      if (fb.length) {
        syllabusBlocks = syllabusBlocks.concat([{ t: 'h', x: front.title || 'Course home page' }], fb);
        extraPages.push({ title: front.title || 'Course home page', url: `${base}/courses/${id}` });
        fileLinks(front.body).forEach((f) => links.push(f));
      }
    }
  }

  // A syllabus uploaded as a file: a link or module item whose name says "syllabus".
  // (Calendars and schedules linked from the syllabus page are not the syllabus.)
  const SYL = /syllabus|course (outline|information|info|policies|policy|guide)\b|course polic/i;
  let fileId = null;
  const named = links.find((l) => SYL.test(l.text));
  if (named) fileId = named.id;
  if (!fileId) {
    for (const m of out) {
      const it = m.items.find((x) => x.type === 'File' && SYL.test(x.title) && x.contentId);
      if (it) {
        fileId = it.contentId;
        break;
      }
    }
  }
  if (!fileId) {
    // links with vague text ("click here"): check the real file names
    for (const l of links.slice(0, 4)) {
      const meta = await soft(canvasGet(`${base}/api/v1/courses/${id}/files/${l.id}`).then((r) => r.json), null);
      if (meta && SYL.test(`${meta.display_name || ''} ${meta.filename || ''}`)) {
        fileId = l.id;
        break;
      }
    }
  }
  let syllabusFile = null;
  if (fileId) {
    progress('Downloading the syllabus file…');
    syllabusFile = await downloadFile(base, id, fileId);
  }

  // Instructors and TAs from the course's People list (email only if Carmen shows it to students)
  progress('Reading the teaching team…');
  const staff = [];
  for (const role of ['teacher', 'ta']) {
    const users = await soft(getAll(base, `/api/v1/courses/${id}/users?enrollment_type[]=${role}&include[]=email&per_page=50`, 2), []);
    for (const u of Array.isArray(users) ? users : []) {
      if (!u || !u.name || staff.some((s) => s.id === u.id)) continue;
      staff.push({ id: u.id, name: String(u.name).slice(0, 80), role, email: typeof u.email === 'string' ? u.email : '' });
    }
    await sleep(100);
  }

  // Every file in the course's Files area (if students can see it): lecture slides are sometimes only there
  const filesList = await soft(getAll(base, `/api/v1/courses/${id}/files?per_page=100&sort=name`, 3), []);
  const files = (Array.isArray(filesList) ? filesList : [])
    .filter((f) => f && f.id && !f.hidden_for_user && !f.locked_for_user)
    .map((f) => ({ id: String(f.id), name: String(f.display_name || f.filename || ''), type: String(f['content-type'] || ''), size: f.size || 0 }))
    .slice(0, 300);

  progress('Done.');
  return {
    courseId: String(courseId),
    fetchedAt: new Date().toISOString(),
    syllabus: { blocks: syllabusBlocks, url: `${base}/courses/${id}/assignments/syllabus` },
    syllabusFile,
    modules: out,
    staff: staff.map(({ name, role, email }) => ({ name, role, email })),
    syllabusPages: extraPages,
    files,
    peopleUrl: `${base}/courses/${id}/users`,
  };
}

/* ---------- lecture material: one module item at a time ---------- */

const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|zoom\.us|gradescope\.com|piazza\.com|tophat\.com|mheducation\.com|pearson\.com|cengage\.com|webassign\.net|google\.com|forms\.office\.com|microsoft\.com|kaltura\.com|mediasite\.\w+|panopto\.com|instructure\.com)$/i;

function boldTerms(html) {
  const out = [];
  const re = /<(strong|b)\b[^>]*>([\s\S]{2,80}?)<\/\1>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const t = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().replace(/[:.]$/, '');
    if (t.length >= 2 && t.split(' ').length <= 6 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 80);
}

// item: { type, title, pageUrl, contentId, externalUrl }
async function courseItem(courseId, item) {
  const base = readCfg().baseUrl;
  const id = encodeURIComponent(courseId);
  if (item.type === 'Page' && item.pageUrl) {
    const page = await soft(canvasGet(`${base}/api/v1/courses/${id}/pages/${encodeURIComponent(item.pageUrl)}`).then((r) => r.json), null);
    if (!page || !page.body) return { skipped: 'empty' };
    return { kind: 'html', blocks: htmlToBlocks(page.body).slice(0, 600), terms: boldTerms(page.body) };
  }
  if (item.type === 'File' && item.contentId) {
    const meta = await soft(canvasGet(`${base}/api/v1/courses/${id}/files/${encodeURIComponent(item.contentId)}`).then((r) => r.json), null);
    if (!meta || !meta.url) return { skipped: 'no access' };
    const name = meta.display_name || meta.filename || item.title || '';
    const type = String(meta['content-type'] || '').toLowerCase();
    const kind = /pdf/.test(type) || /\.pdf$/i.test(name) ? 'pdf'
      : /presentationml/.test(type) || /\.pptx$/i.test(name) ? 'pptx'
      : /wordprocessingml/.test(type) || /\.docx$/i.test(name) ? 'docx' : null;
    if (!kind) return { skipped: 'type', name };
    if (meta.size && meta.size > MAX_MATERIAL_BYTES) return { skipped: 'too big', name };
    try {
      const res = await canvasSession().fetch(meta.url, { credentials: 'include' });
      if (!res.ok) return { skipped: 'download', name };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_MATERIAL_BYTES) return { skipped: 'too big', name };
      return { kind, name, bytes: new Uint8Array(buf) };
    } catch {
      return { skipped: 'download', name };
    }
  }
  if (item.type === 'ExternalUrl' && item.externalUrl) {
    let u;
    try {
      u = new URL(item.externalUrl);
    } catch {
      return { skipped: 'link' };
    }
    if (!/^https?:$/.test(u.protocol) || SKIP_HOSTS.test(u.hostname)) return { skipped: 'link' };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return { skipped: 'link' };
      const html = (await res.text()).slice(0, 2 * 1024 * 1024);
      const main = /<(main|article)\b[\s\S]*?<\/\1>/i.exec(html);
      const body = main ? main[0] : html.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
      return { kind: 'html', blocks: htmlToBlocks(body).slice(0, 600), terms: boldTerms(body) };
    } catch {
      return { skipped: 'link' };
    }
  }
  return { skipped: 'type' };
}

/* ---------- small file cache for course material (too big for the page's own storage) ---------- */

const cacheDir = () => path.join(app.getPath('userData'), 'cache');
const cacheFile = (key) => path.join(cacheDir(), String(key).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) + '.json');

/* ---------- messages from the interface ---------- */

ipcMain.handle('cfg:get', () => {
  const c = readCfg();
  return {
    baseUrl: c.baseUrl,
    keepSignedIn: c.keepSignedIn !== false,
    platform: process.platform,
    version: app.getVersion(),
  };
});

ipcMain.handle('cfg:set', async (_e, patch) => {
  try {
    const next = {};
    if (patch && patch.baseUrl) next.baseUrl = normalizeBase(patch.baseUrl);
    if (patch && typeof patch.keepSignedIn === 'boolean') next.keepSignedIn = patch.keepSignedIn;
    writeCfg(next);
    if (next.keepSignedIn === true) await keepAllCookies();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('canvas:status', async () => ({ signedIn: await isSignedIn(readCfg().baseUrl) }));

ipcMain.handle('canvas:login', async () => {
  const base = readCfg().baseUrl;
  if (await isSignedIn(base)) return { ok: true };
  return { ok: await openLogin(base) };
});

ipcMain.handle('canvas:sync', async () => {
  try {
    const data = await syncCanvas();
    await keepAllCookies();
    return { ok: true, data };
  } catch (e) {
    if (e.code === 'AUTH') return { ok: false, auth: true, error: 'Your Canvas sign-in expired. Sign in again.' };
    return { ok: false, error: e.message || 'Something went wrong while reading Canvas.' };
  }
});

ipcMain.handle('canvas:signout', async () => {
  try {
    fs.rmSync(cacheDir(), { recursive: true, force: true });
  } catch {}
  await canvasSession().clearStorageData();
  await canvasSession().clearCache();
  return { ok: true };
});


ipcMain.handle('canvas:item', async (_e, courseId, item) => {
  try {
    return { ok: true, data: await courseItem(String(courseId), item || {}) };
  } catch (e) {
    if (e.code === 'AUTH') return { ok: false, auth: true, error: 'Your Canvas sign-in expired. Sign in again.' };
    return { ok: true, data: { skipped: 'error' } };
  }
});

ipcMain.handle('cache:get', (_e, key) => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('cache:set', (_e, key, value) => {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('canvas:content', async (_e, courseId) => {
  try {
    return { ok: true, data: await courseContent(String(courseId)) };
  } catch (e) {
    if (e.code === 'AUTH') return { ok: false, auth: true, error: 'Your Canvas sign-in expired. Sign in again.' };
    return { ok: false, error: e.message || 'Something went wrong while reading this course.' };
  }
});

ipcMain.handle('update:check', () => checkUpdate());

ipcMain.handle('open:external', (_e, url) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || (u.protocol === 'mailto:' && /^[^@\s]+@[^@\s]+$/.test(decodeURIComponent(u.pathname)))) shell.openExternal(u.toString());
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
  // A test build briefly offered built-in AI with a saved key; the app no longer uses AI, so remove any saved key.
  try {
    fs.rmSync(path.join(app.getPath('userData'), 'ai-keys.json'), { force: true });
  } catch {}
  watchCookies();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try {
    canvasSession().cookies.flushStore();
  } catch {}
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

// for tests
module.exports = { htmlToBlocks };
