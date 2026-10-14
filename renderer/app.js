/* Carmen Planner interface */
(function () {
  const P = window.Planner;
  const $ = (id) => document.getElementById(id);

  // When the page is opened outside the app (for a quick preview), fall back to a demo-only bridge.
  const api =
    window.api ||
    (() => {
      const no = async () => ({ ok: false, error: 'Open Carmen Planner as an app to use this.' });
      return {
        getConfig: async () => ({ baseUrl: 'https://osu.instructure.com', keepSignedIn: true, platform: 'darwin', version: 'preview' }),
        setConfig: async () => ({ ok: true }),
        login: no, sync: no,
        courseItem: no,
        cacheGet: async (k) => { try { return JSON.parse(localStorage.getItem('cp.file.' + k)); } catch { return null; } },
        cacheSet: async (k, v) => { try { localStorage.setItem('cp.file.' + k, JSON.stringify(v)); return true; } catch { return false; } },
        checkUpdate: async () => ({ ok: false }),
        courseContent: no,
        status: async () => ({ signedIn: false }),
        signOut: async () => ({ ok: true }),
        openExternal: async (u) => window.open(u, '_blank'),
        onProgress: () => () => {},
      };
    })();

  const platform = new URLSearchParams(location.search).get('platform') || 'darwin';
  document.body.classList.add('platform-' + platform);

  /* ---------- small helpers ---------- */
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem('cp.' + k);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('cp.' + k, JSON.stringify(v));
      } catch {}
    },
    del(k) {
      try {
        localStorage.removeItem('cp.' + k);
      } catch {}
    },
  };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = (d) => `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
  const fmtShort = (d) => `${MON[d.getMonth()]} ${d.getDate()}`;
  const fmtDue = (d) => {
    const h = d.getHours();
    const m = d.getMinutes();
    if (h === 23 && m === 59) return 'by midnight';
    return P.fmtTime(h * 60 + m);
  };
  const fromKey = (k) => {
    const [y, mo, da] = k.split('-').map(Number);
    return new Date(y, mo - 1, da);
  };

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- state ---------- */
  const DEFAULT_SETTINGS = { weekday: 4, weekend: 3, rest: 'none', start: '19:00', pace: 1 };
  const state = {
    mode: store.get('mode', null), // 'demo' | 'canvas' | null
    data: null,
    settings: Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {})),
    done: new Set(store.get('done', [])),
    weekOffset: 0,
    cfg: null,
    plan: null,
    colors: {},
    briefLoading: false,
    syncing: false,
    needsSignIn: false,
    view: 'week', // 'week' | 'course'
    courseId: null,
  };

  // "MATH 1151 AU2026 (17826)" -> "MATH 1151"; "AU26 MATH 1151 - Calculus 1 (17826)" -> "Calculus 1"
  function tidyCourse(c) {
    const code = String(c.code || '')
      .replace(/\s+(AU|SP|SU|WI|FA|FL)\s?\d{2,4}\b.*$/i, '')
      .replace(/\s*\(\d{3,6}\)\s*$/, '')
      .trim();
    let name = String(c.name || '')
      .replace(/^(AU|SP|SU|WI|FA|FL)\s?\d{2,4}\s+/i, '')
      .replace(/\s*\(\d{3,6}\)\s*$/, '')
      .trim();
    const m = /^[A-Z&]{2,12}\s*\d{3,4}(\.\d+)?[A-Z]{0,2}\s*[-–:]\s*(.+)$/.exec(name);
    if (m) name = m[2].trim();
    return Object.assign({}, c, { code: code || c.code, name: name || c.name });
  }
  function tidyData(d) {
    if (!d || !Array.isArray(d.courses)) return d;
    return Object.assign({}, d, { courses: d.courses.map(tidyCourse) });
  }

  function loadData() {
    if (state.mode === 'demo') state.data = Demo.build();
    else if (state.mode === 'canvas') state.data = tidyData(store.get('data', null));
    else state.data = null;
  }

  function assignColors() {
    state.colors = {};
    ((state.data && state.data.courses) || []).forEach((c, i) => (state.colors[c.id] = `var(--c${(i % 7) + 1})`));
  }
  const colorOf = (courseId) => state.colors[courseId] || 'var(--gray)';

  function rebuild() {
    state.plan = P.build(state.data || { courses: [], assignments: [] }, new Date(), state.settings, state.done);
  }

  /* ---------- screens ---------- */
  function showWelcome() {
    $('welcome').hidden = false;
    $('app').hidden = true;
  }

  function showApp() {
    $('welcome').hidden = true;
    $('app').hidden = false;
    assignColors();
    rebuild();
    renderAll();
  }

  function renderAll() {
    const inCourse = state.view === 'course' && window.Course;
    $('app').classList.toggle('course-mode', !!inCourse);
    $('course').hidden = !inCourse;
    renderSide();
    if (inCourse) {
      window.Course.render();
      return;
    }
    renderAhead();
    renderGrid();
    renderTasks();
    renderBrief();
  }

  function showWeek() {
    state.view = 'week';
    state.courseId = null;
    renderAll();
  }

  function showCourse(id) {
    state.view = 'course';
    state.courseId = id;
    renderAll();
    $('course').scrollTop = 0;
  }

  function weekStart() {
    return P.addDays(P.mondayOf(new Date()), state.weekOffset * 7);
  }

  /* ---------- sidebar ---------- */
  function renderSide() {
    const mon = weekStart();
    const sun = P.addDays(mon, 6);
    $('this-week').textContent =
      state.weekOffset === 0 ? 'This week' : state.weekOffset === 1 ? 'Next week' : `${fmtShort(mon)} – ${fmtShort(sun)}`;
    $('this-week').title = `${fmtShort(mon)} – ${fmtShort(sun)}`;

    if (state.mode === 'demo') {
      $('source-line').textContent = 'Sample courses';
      $('refresh').textContent = 'Sign in to Carmen';
    } else {
      const t = state.data && state.data.syncedAt ? new Date(state.data.syncedAt) : null;
      if (state.syncing) $('source-line').textContent = 'Updating from Carmen…';
      else if (state.needsSignIn) $('source-line').textContent = 'Carmen sign-in expired';
      else $('source-line').textContent = t ? `Updated ${fmtShort(t)}, ${P.fmtTime(t.getHours() * 60 + t.getMinutes())}` : '';
      $('refresh').textContent = state.needsSignIn ? 'Sign in to refresh' : 'Refresh from Canvas';
      $('refresh').disabled = state.syncing;
    }

    const inCourse = state.view === 'course';
    $('nav-week').setAttribute('aria-current', inCourse ? 'false' : 'page');
    $('weeknav').hidden = inCourse;
    $('stats').hidden = inCourse;
    const courses = (state.data && state.data.courses) || [];
    $('course-list').innerHTML = courses.length
      ? courses
          .map(
            (c) => `<li><button class="course-btn" data-course="${esc(c.id)}" aria-current="${inCourse && state.courseId === c.id ? 'page' : 'false'}">
              <span class="sw" style="background:${colorOf(c.id)}"></span>
              <span><span class="ccode">${esc(c.code)}</span><span class="cname">${esc(c.code === c.name ? '' : c.name)}</span></span></button></li>`
          )
          .join('')
      : '<li class="hint">No active courses found.</li>';

    const { inWeek } = weekTasks();
    const done = inWeek.filter((t) => t.done).length;
    const weekKeys = new Set();
    for (let i = 0; i < 7; i++) weekKeys.add(P.dkey(P.addDays(mon, i)));
    const hours = planItems()
      .filter((it) => it.kind === 'study' && weekKeys.has(it.day))
      .reduce((n, it) => n + (it.end - it.start) / 60, 0);
    $('stats').innerHTML = `
      <div class="stat"><span>Due this week</span><b>${inWeek.length}</b></div>
      <div class="stat"><span>Checked off</span><b>${done} of ${inWeek.length}</b></div>
      <div class="stat"><span>Study time planned</span><b>${P.fmtHours(hours)}</b></div>`;
  }

  /* ---------- next 2 weeks ---------- */
  function renderAhead() {
    const today = P.startOfDay(new Date());
    const N = P.HEADS_UP_DAYS;
    const items = state.plan.ahead;
    if (!items.length) {
      $('ahead').innerHTML = '<div class="ruler"><p class="empty">No exams or big assignments in the next 2 weeks.</p></div>';
      return;
    }
    let days = '<div class="rlabel-head"></div>';
    for (let i = 0; i <= N; i++) {
      const d = P.addDays(today, i);
      const cls = i === 0 ? 'today' : d.getDay() === 1 ? 'wk' : '';
      days += `<div class="${cls}">${DOW[d.getDay()].slice(0, 2)}<br>${d.getDate()}</div>`;
    }
    const rows = items
      .map(({ task, startBy }) => {
        const sDiff = startBy ? P.dayDiff(today, fromKey(startBy)) : 0;
        const e = Math.min(N, task.diff);
        const start = Math.min(Math.max(0, sDiff), e);
        let when;
        if (!startBy) when = '<span class="start">Not enough time left. Add study hours.</span>';
        else if (sDiff <= 0) when = '<span class="start">Start today</span>';
        else when = `Start <span class="start">${esc(fmtDay(fromKey(startBy)))}</span>`;
        const dueTxt = task.diff === 0 ? 'due today' : `due in ${task.diff} day${task.diff === 1 ? '' : 's'}`;
        return `<div class="rrow">
          <div class="rlabel"><div class="rname" title="${esc(task.name)}"><span class="sw" style="background:${colorOf(task.courseId)}"></span><span class="rname-t">${esc(task.name)}</span></div>
            <div class="rsub">${esc(task.course)}, ${dueTxt}</div><div class="rwhen">${when}</div></div>
          <div class="rbar${e - start < 1 ? ' one' : e - start < 2 ? ' two' : ''}" style="--cc:${colorOf(task.courseId)};grid-column:${start + 2} / ${e + 3}" title="Work on it from ${startBy ? esc(fmtDay(fromKey(startBy))) : 'today'}; due ${esc(fmtDay(task.due))}">
            <span class="rdue">${e - start < 1 ? task.due.getDate() : esc(fmtShort(task.due))}</span></div></div>`;
      })
      .join('');
    $('ahead').innerHTML = `<div class="ruler"><div class="ruler-days">${days}</div><div class="ruler-rows">${rows}</div></div>`;
  }

  /* ---------- week grid ---------- */
  /* ---------- study plan calendar: automatic sessions + the student's own changes and events ---------- */
  const editsKey = () => `plan.edits.${state.mode}`;
  const eventsKey = () => `plan.events.${state.mode}`;

  function planItems() {
    const edits = store.get(editsKey(), {});
    const events = store.get(eventsKey(), []);
    const items = [];
    Object.entries(state.plan.sessions).forEach(([k, list]) =>
      list.forEach((s) => {
        const id = `${s.task.key}@${k}`;
        const e = edits[id];
        if (e && e.deleted) return;
        items.push({
          id,
          kind: 'study',
          day: (e && e.day) || k,
          start: e && e.start != null ? e.start : s.start,
          end: e && e.end != null ? e.end : s.end,
          title: s.task.name,
          sub: s.task.course,
          color: colorOf(s.task.courseId),
          note: (e && e.note) || '',
          moved: !!(e && (e.day || e.start != null || e.end != null)),
        });
      })
    );
    events.forEach((ev) => items.push({ id: ev.id, kind: 'event', day: ev.day, start: ev.start, end: ev.end, title: ev.title || 'Event', sub: '', color: 'var(--ink-2)', note: ev.note || '' }));
    return items;
  }

  const calHandlers = {
    change(item, patch) {
      if (item.kind === 'study') {
        const edits = store.get(editsKey(), {});
        edits[item.id] = Object.assign({}, edits[item.id], patch);
        store.set(editsKey(), edits);
      } else {
        const events = store.get(eventsKey(), []).map((ev) => (ev.id === item.id ? Object.assign({}, ev, patch) : ev));
        store.set(eventsKey(), events);
      }
      renderAll();
    },
    create(fields) {
      const events = store.get(eventsKey(), []);
      events.push(Object.assign({ id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }, fields));
      store.set(eventsKey(), events);
      renderAll();
      toast('Event added.');
    },
    remove(item) {
      if (item.kind === 'study') {
        const edits = store.get(editsKey(), {});
        edits[item.id] = Object.assign({}, edits[item.id], { deleted: true });
        store.set(editsKey(), edits);
        toast('Session removed from the plan.');
      } else {
        store.set(eventsKey(), store.get(eventsKey(), []).filter((ev) => ev.id !== item.id));
        toast('Event deleted.');
      }
      renderAll();
    },
    reset(item) {
      const edits = store.get(editsKey(), {});
      const note = edits[item.id] && edits[item.id].note;
      if (note) edits[item.id] = { note };
      else delete edits[item.id];
      store.set(editsKey(), edits);
      renderAll();
    },
  };

  function renderGrid() {
    const mon = weekStart();
    const today = P.startOfDay(new Date());
    const dues = {};
    state.plan.tasks.forEach((t) => {
      const k = P.dkey(t.due);
      (dues[k] = dues[k] || []).push({ title: `${t.name} (${t.course})`, color: colorOf(t.courseId), done: t.done });
    });
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = P.addDays(mon, i);
      const diff = P.dayDiff(today, d);
      days.push({ key: P.dkey(d), label: DOW[d.getDay()], date: fmtShort(d), today: diff === 0, past: diff < 0 });
    }
    const keys = new Set(days.map((d) => d.key));
    const items = planItems().filter((it) => keys.has(it.day));
    window.Calendar.render($('grid'), { days, items, dues }, calHandlers);

    const s = state.settings;
    const rest = s.rest === 'sat' ? ', Saturdays off' : s.rest === 'sun' ? ', Sundays off' : '';
    $('plan-hint').textContent = `Up to ${s.weekday} h on weekdays and ${s.weekend} h on weekends, starting around ${P.fmtTime(
      parseInt(s.start, 10) * 60 + parseInt(s.start.split(':')[1] || '0', 10)
    )}${rest}.`;

    const notes = [];
    const missing = state.plan.unscheduled.reduce((x, u) => x + u.hours, 0);
    if (missing > 0.01) {
      notes.push(
        `About ${P.fmtHours(missing)} of work does not fit before its due dates. <button class="link" data-act="settings">Add study time</button> or check off what is already done.`
      );
    }
    if (state.plan.undated) {
      notes.push(`${state.plan.undated} assignment${state.plan.undated === 1 ? ' has' : 's have'} no due date in Canvas yet, so ${state.plan.undated === 1 ? 'it is' : 'they are'} not in the plan.`);
    }
    $('notices').innerHTML = notes.map((n) => `<div class="notice">${n}</div>`).join('');
  }

  /* ---------- task list ---------- */
  function weekTasks() {
    const mon = weekStart();
    const next = P.addDays(mon, 7);
    const isThisWeek = state.weekOffset === 0;
    const inWeek = state.plan.tasks.filter((t) => (t.due >= mon && t.due < next) || (isThisWeek && t.urgency === 'overdue'));
    return { inWeek, isThisWeek };
  }

  function renderTasks() {
    const { inWeek } = weekTasks();
    $('tasks-title').textContent = state.weekOffset === 0 ? 'Due this week' : 'Due that week';
    const left = inWeek.filter((t) => !t.done).length;
    $('tasks-count').textContent = inWeek.length ? `${left} left` : '';

    if (!inWeek.length) {
      $('tasks').innerHTML = '<p class="empty">Nothing is due this week.</p>';
      return;
    }
    const groups = [];
    const byLabel = {};
    const today = P.startOfDay(new Date());
    inWeek.forEach((t) => {
      let label, cls;
      if (t.urgency === 'overdue') {
        label = 'Overdue';
        cls = 'overdue';
      } else {
        const diff = P.dayDiff(today, t.due);
        label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : fmtDay(t.due);
        cls = diff === 0 ? 'today' : diff < 0 ? 'past' : '';
      }
      if (!byLabel[label]) {
        byLabel[label] = { label, cls, items: [] };
        groups.push(byLabel[label]);
      }
      byLabel[label].items.push(t);
    });

    $('tasks').innerHTML = groups
      .map(
        (g) => `<div class="tgroup ${g.cls}"><h4>${esc(g.label)}${g.cls === 'overdue' && g.items.some((t) => !t.done) ? ` <span class="pill">${g.items.filter((t) => !t.done).length}</span>` : ''}</h4>
        ${g.items
          .map(
            (t) => `<div class="task ${t.done ? 'done' : ''}">
              <input type="checkbox" data-key="${esc(t.key)}" ${t.done ? 'checked' : ''} aria-label="Mark ${esc(t.name)} as done" />
              <div><div class="task-name">${esc(t.name)}</div>
                <div class="task-meta"><span class="sw" style="background:${colorOf(t.courseId)}"></span>${esc(t.course)}${t.points ? `, ${t.points} pts` : ''}</div></div>
              <div class="task-right">${esc(fmtDue(t.due))}<br>about ${P.fmtHours(t.hours)}${t.url ? `<button class="open" data-url="${esc(t.url)}">Open in Canvas</button>` : ''}</div>
            </div>`
          )
          .join('')}</div>`
      )
      .join('');
  }

  /* ---------- weekly brief (made on this computer) ---------- */
  // Syllabus rules for each course whose syllabus has been read (opening a course reads it).
  const rulesMemo = {};
  function syllabusRules() {
    const out = {};
    let missing = 0;
    ((state.data && state.data.courses) || []).forEach((c) => {
      const content = state.mode === 'demo' ? Demo.courseContent(c.id) : store.get(`content2.${state.mode}.${c.id}`, null);
      if (!content) return missing++;
      const memoKey = `${state.mode}.${c.id}.${content.fetchedAt || ''}`;
      if (!rulesMemo[memoKey]) {
        const page = (content.syllabus && content.syllabus.blocks) || [];
        const file = (content.syllabusFile && content.syllabusFile.blocks) || [];
        const words = page.reduce((n, b) => n + (String(b.x).match(/\S+/g) || []).length, 0);
        try {
          rulesMemo[memoKey] = window.Syllabus.summarize(file.length && words < 150 ? file : page.concat(file)).dontMiss;
        } catch {
          rulesMemo[memoKey] = [];
        }
      }
      out[c.id] = rulesMemo[memoKey];
    });
    return { rules: out, missing };
  }

  function briefHtml(r) {
    const list = (arr, fn, max) => (Array.isArray(arr) && arr.length ? `<ul>${arr.slice(0, max || 4).map(fn).join('')}</ul>` : '');
    return `<div class="brief-body">
      ${r.headline ? `<p class="brief-headline">${esc(r.headline)}</p>` : ''}
      ${r.do_first && r.do_first.length ? `<div><h5>Do first</h5>${list(r.do_first, (x) => `<li><b>${esc(x.task)}</b>. ${esc(x.why)}</li>`)}</div>` : ''}
      ${r.watch_out && r.watch_out.length ? `<div><h5>Watch out for</h5>${list(r.watch_out, (x) => `<li>${esc(x)}</li>`)}</div>` : ''}
      ${r.by_course && r.by_course.length ? `<div><h5>Course by course</h5>${list(r.by_course, (x) => `<li><b>${esc(x.course)}</b>: ${esc(x.note)}${x.tip ? `<span class="brief-tip">${esc(x.tip)}</span>` : ''}</li>`, 12)}</div>` : ''}
      ${r.pep ? `<p class="pep">${esc(r.pep)}</p>` : ''}
    </div>`;
  }

  function renderBrief() {
    const el = $('brief');
    if (!state.plan) return (el.innerHTML = '');
    const { rules, missing } = syllabusRules();
    const r = window.Brief.make(state.plan, { now: new Date(), settings: state.settings, rules });
    el.innerHTML = `${briefHtml(r)}<p class="meta" style="margin-top:10px">Made on this computer from your plan${
      Object.keys(rules).length ? ' and syllabus rules' : ''
    }. It updates as you check things off.${missing ? ` Open a course once to add its syllabus rules.` : ''}</p>`;
  }

  /* ---------- Canvas ---------- */
  async function signInAndSync() {
    const r = await api.login();
    if (!r.ok) {
      if (r.error) toast(r.error);
      return;
    }
    await sync({ afterLogin: true });
  }

  // quiet: refresh in the background when the app opens, without the overlay or a sign-in window
  async function sync(opts) {
    const quiet = !!(opts && opts.quiet);
    if (state.syncing) return;
    state.syncing = true;
    let off = () => {};
    if (quiet) {
      if (!$('app').hidden) renderSide();
    } else {
      $('busy').hidden = false;
      $('busy-text').textContent = 'Reading Canvas…';
      off = api.onProgress((m) => ($('busy-text').textContent = m));
    }
    const res = await api.sync();
    off();
    state.syncing = false;
    $('busy').hidden = true;
    if (res.ok) {
      state.mode = 'canvas';
      state.needsSignIn = false;
      store.set('mode', 'canvas');
      store.set('data', res.data);
      state.data = tidyData(res.data);
      showApp();
      if (!quiet) toast(`Read ${res.data.courses.length} courses and ${res.data.assignments.length} assignments.`);
    } else if (res.auth) {
      if (quiet) {
        state.needsSignIn = true;
        if (!$('app').hidden) renderSide();
        toast('Your Carmen sign-in expired. Click “Sign in to refresh” to update.');
      } else if (opts && opts.afterLogin) {
        // signed in a moment ago but Carmen still refuses: stop here instead of looping
        state.needsSignIn = true;
        if (!$('app').hidden) renderSide();
        toast('Carmen did not accept the sign-in. Try “Sign in to refresh” again in a minute.');
      } else {
        toast(res.error);
        await signInAndSync();
      }
    } else {
      if (!$('app').hidden) renderSide();
      if (!quiet) toast(res.error || 'Could not read Canvas.');
    }
  }

  /* ---------- updates ---------- */
  async function checkForUpdate() {
    const r = await api.checkUpdate();
    if (!r || !r.ok || !r.available) return;
    if (store.get('skipVersion', null) === r.version) return;
    const el = $('update');
    el.innerHTML = `<div><b>Carmen Planner ${esc(r.version)} is available.</b> You have ${esc(r.current)}. Download it and install it over this one; your courses and settings stay.</div>
      <div class="update-actions"><button class="btn primary" data-url="${esc(r.page)}">Download update</button>
      <button class="btn ghost" id="update-later">Later</button></div>`;
    el.hidden = false;
    $('update-later').onclick = () => {
      store.set('skipVersion', r.version);
      el.hidden = true;
    };
  }

  function startDemo() {
    state.mode = 'demo';
    store.set('mode', 'demo');
    loadData();
    state.weekOffset = 0;
    state.view = 'week';
    showApp();
  }

  /* ---------- themes ---------- */
  function currentTheme() {
    return store.get('theme', 'scarlet');
  }
  function currentPicture() {
    try {
      return localStorage.getItem('cp.picture');
    } catch {
      return null;
    }
  }

  function renderThemes() {
    const cur = currentTheme();
    const grid = $('theme-grid');
    grid.innerHTML = '';
    Themes.THEMES.forEach((t) => {
      const { style, v } = Themes.previewStyle(t);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-card';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === cur));
      b.dataset.theme = t.id;
      const note = t.note || (t.cute ? 'Cute' : t.dark ? 'Dark' : '');
      b.innerHTML = `<span class="theme-prev"><span class="tp-panel"></span><span class="tp-line" style="top:24px;width:42%"></span>
        <span class="tp-line" style="top:38px;width:30%"></span><span class="tp-line" style="top:52px;width:36%"></span><span class="tp-btn"></span></span>
        <span class="theme-name">${esc(t.name)}${note ? `<small>${esc(note)}</small>` : ''}</span>`;
      Object.assign(b.querySelector('.theme-prev').style, style);
      b.querySelector('.tp-panel').style.background = v.panel;
      b.querySelector('.tp-panel').style.boxShadow = `0 0 0 1px ${v.line}`;
      const lines = b.querySelectorAll('.tp-line');
      const cs = v.courses || [v.accent];
      lines.forEach((l, i) => (l.style.background = cs[i % cs.length]));
      b.querySelector('.tp-btn').style.background = v.accent;
      grid.appendChild(b);
    });
    $('pic-remove').hidden = !currentPicture();
  }

  function setTheme(id) {
    store.set('theme', id);
    Themes.apply(id, currentPicture());
    renderThemes();
  }

  // Shrink the picture so it fits in the app's storage, then save it.
  function choosePicture(file) {
    if (!file || !/^image\//.test(file.type)) return;
    if (file.size > 40 * 1024 * 1024) return toast('That picture is too large. Try one under 40 MB.');
    const reader = new FileReader();
    reader.onerror = () => toast('Could not open that picture.');
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let data = c.toDataURL('image/jpeg', 0.84);
        if (data.length > 3500000) data = c.toDataURL('image/jpeg', 0.6);
        try {
          localStorage.setItem('cp.picture', data);
        } catch {
          toast('That picture is too large to save. Try a smaller one.');
          return;
        }
        Themes.apply(currentTheme(), data);
        renderThemes();
        toast('Background picture set.');
      };
      img.onerror = () => toast('Could not open that picture.');
      img.src = reader.result; // a data: URL, which the app's security policy allows
    };
    reader.readAsDataURL(file);
  }

  /* ---------- settings ---------- */
  function openSettings() {
    const s = state.settings;
    $('s-weekday').value = s.weekday;
    $('s-weekend').value = s.weekend;
    $('s-start').value = s.start;
    $('s-rest').value = s.rest;
    $('s-pace').value = String(s.pace);
    $('s-base').value = state.cfg.baseUrl;
    $('s-error').textContent = '';
    $('version').textContent = `Version ${state.cfg.version}`;
    $('s-demo').hidden = state.mode === 'demo';
    $('s-signout').hidden = state.mode !== 'canvas';
    $('s-keep').checked = state.cfg.keepSignedIn !== false;
    $('settings').showModal();
  }

  async function saveSettings() {
    const num = (id, fb) => {
      const v = parseFloat($(id).value);
      return isFinite(v) && v >= 0 && v <= 12 ? v : fb;
    };
    state.settings = {
      weekday: num('s-weekday', 4),
      weekend: num('s-weekend', 3),
      start: /^\d{2}:\d{2}$/.test($('s-start').value) ? $('s-start').value : '19:00',
      rest: $('s-rest').value,
      pace: parseFloat($('s-pace').value) || 1,
    };
    store.set('settings', state.settings);

    const patch = {};
    if ($('s-base').value.trim() && $('s-base').value.trim() !== state.cfg.baseUrl) patch.baseUrl = $('s-base').value.trim();
    if ($('s-keep').checked !== (state.cfg.keepSignedIn !== false)) patch.keepSignedIn = $('s-keep').checked;
    if (Object.keys(patch).length) {
      const r = await api.setConfig(patch);
      if (!r.ok) {
        $('s-error').textContent = r.error;
        return false;
      }
    }
    state.cfg = await api.getConfig();
    rebuild();
    renderAll();
    toast('Settings saved.');
    return true;
  }

  /* ---------- events ---------- */
  function wire() {
    $('w-signin').onclick = signInAndSync;
    $('w-demo').onclick = startDemo;
    $('w-address').onclick = openSettings; // prompt() is not available in Electron

    $('prev-week').onclick = () => {
      state.weekOffset = Math.max(-1, state.weekOffset - 1);
      renderAll();
    };
    $('next-week').onclick = () => {
      state.weekOffset = Math.min(3, state.weekOffset + 1);
      renderAll();
    };
    $('this-week').onclick = () => {
      state.weekOffset = 0;
      renderAll();
    };

    $('nav-week').onclick = showWeek;
    $('course-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-course]');
      if (b) showCourse(b.dataset.course);
    });
    $('open-themes').onclick = () => {
      renderThemes();
      $('themes').showModal();
    };
    $('themes-close').onclick = () => $('themes').close();
    $('theme-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme]');
      if (b) setTheme(b.dataset.theme);
    });
    $('pic-choose').onclick = () => $('pic-input').click();
    $('pic-input').onchange = (e) => {
      choosePicture(e.target.files && e.target.files[0]);
      e.target.value = '';
    };
    $('pic-remove').onclick = () => {
      try {
        localStorage.removeItem('cp.picture');
      } catch {}
      Themes.apply(currentTheme(), null);
      renderThemes();
      toast('Background picture removed.');
    };

    $('refresh').onclick = () => (state.mode === 'demo' || state.needsSignIn ? signInAndSync() : sync());
    $('open-settings').onclick = openSettings;

    $('s-save').onclick = async (e) => {
      e.preventDefault();
      if (await saveSettings()) $('settings').close();
    };
    $('s-demo').onclick = () => {
      $('settings').close();
      startDemo();
    };
    $('s-signout').onclick = async () => {
      if (!confirm('Sign out of Canvas and remove the course data saved on this computer?')) return;
      await api.signOut();
      ['data', 'mode', 'done'].forEach(store.del);
      Object.keys(localStorage)
        .filter((k) => /^cp\.(brief|content2?|ai|mm|collapsed|file|plan)\./.test(k))
        .forEach((k) => localStorage.removeItem(k));
      state.mode = null;
      state.data = null;
      state.done = new Set();
      state.view = 'week';
      $('settings').close();
      showWelcome();
      toast('Signed out. Course data removed from this computer.');
    };

    document.addEventListener('change', (e) => {
      const key = e.target.dataset && e.target.dataset.key;
      if (!key) return;
      if (e.target.checked) state.done.add(key);
      else state.done.delete(key);
      store.set('done', [...state.done]);
      rebuild();
      renderAll();
    });

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-url]');
      if (!b) return;
      if (b.dataset.url) api.openExternal(b.dataset.url);
      else if (b.dataset.act === 'settings') openSettings();
    });

    // Keep "today" correct if the app stays open past midnight.
    let lastDay = P.dkey(new Date());
    setInterval(() => {
      const k = P.dkey(new Date());
      if (k !== lastDay && !$('app').hidden) {
        lastDay = k;
        if (state.mode === 'demo') loadData();
        rebuild();
        renderAll();
      }
    }, 60000);
  }

  /* ---------- shared with course.js ---------- */
  window.CP = {
    api,
    esc,
    store,
    toast,
    state,
    colorOf,
    fmtDay,
    fmtShort,
    signInAndSync,
    rerender: () => renderAll(),
    busy(text) {
      $('busy-text').textContent = text || 'Working…';
      $('busy').hidden = false;
    },
    idle() {
      $('busy').hidden = true;
    },
  };

  /* ---------- start ---------- */
  (async function init() {
    state.cfg = await api.getConfig();
    wire();
    loadData();
    if (state.mode && state.data) showApp();
    else showWelcome();
    // Opened with real courses: refresh quietly if the data is more than 30 minutes old.
    if (state.mode === 'canvas' && state.data) {
      const age = Date.now() - new Date(state.data.syncedAt || 0).getTime();
      if (age > 30 * 60 * 1000) sync({ quiet: true });
    }
    setTimeout(checkForUpdate, 2500);
  })();
})();
