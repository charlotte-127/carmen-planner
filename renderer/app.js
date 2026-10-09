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
        getConfig: async () => ({ baseUrl: 'https://osu.instructure.com', model: 'claude-sonnet-5-5', hasKey: false, platform: 'darwin', version: 'preview' }),
        setConfig: async () => ({ ok: true }),
        setKey: no, clearKey: no, login: no, sync: no, aiBrief: no,
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
  };

  function loadData() {
    if (state.mode === 'demo') state.data = Demo.build();
    else if (state.mode === 'canvas') state.data = store.get('data', null);
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
    renderSide();
    renderAhead();
    renderGrid();
    renderTasks();
    renderBrief();
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
      $('source-line').textContent = t ? `Updated ${fmtShort(t)}, ${P.fmtTime(t.getHours() * 60 + t.getMinutes())}` : '';
      $('refresh').textContent = 'Refresh from Canvas';
    }

    const courses = (state.data && state.data.courses) || [];
    $('course-list').innerHTML = courses.length
      ? courses
          .map(
            (c) => `<li><span class="sw" style="background:${colorOf(c.id)}"></span>
            <span>${esc(c.code)}<span class="cname">${esc(c.code === c.name ? '' : c.name)}</span></span></li>`
          )
          .join('')
      : '<li class="hint">No active courses found.</li>';

    const { inWeek } = weekTasks();
    const done = inWeek.filter((t) => t.done).length;
    let hours = 0;
    for (let i = 0; i < 7; i++) {
      (state.plan.sessions[P.dkey(P.addDays(mon, i))] || []).forEach((s) => (hours += s.hours));
    }
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
          <div class="rlabel"><div class="rname"><span class="sw" style="background:${colorOf(task.courseId)}"></span>${esc(task.name)}</div>
            <div class="rsub">${esc(task.course)}, ${dueTxt}</div><div class="rwhen">${when}</div></div>
          <div class="rbar" style="--cc:${colorOf(task.courseId)};grid-column:${start + 2} / ${e + 3}" title="Work on it from ${startBy ? esc(fmtDay(fromKey(startBy))) : 'today'}; due ${esc(fmtDay(task.due))}">
            <span class="rdue">${esc(fmtShort(task.due))}</span></div></div>`;
      })
      .join('');
    $('ahead').innerHTML = `<div class="ruler"><div class="ruler-days">${days}</div><div class="ruler-rows">${rows}</div></div>`;
  }

  /* ---------- week grid ---------- */
  function renderGrid() {
    const mon = weekStart();
    const today = P.startOfDay(new Date());
    const byDue = {};
    state.plan.tasks.forEach((t) => {
      const k = P.dkey(t.due);
      (byDue[k] = byDue[k] || []).push(t);
    });

    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = P.addDays(mon, i);
      const k = P.dkey(d);
      const diff = P.dayDiff(today, d);
      const sessions = state.plan.sessions[k] || [];
      const dues = byDue[k] || [];
      const total = sessions.reduce((s, x) => s + x.hours, 0);
      const cls = ['day', diff < 0 ? 'past' : '', diff === 0 ? 'today' : ''].join(' ');
      html += `<div class="${cls}">
        <div class="day-head"><span class="day-name">${diff === 0 ? 'Today' : DOW[d.getDay()]}</span><span class="day-date">${fmtShort(d)}</span></div>
        ${total ? `<div class="day-load">${P.fmtHours(total)} of study</div>` : ''}
        ${
          dues.length
            ? `<div class="sub-label">Due</div><div class="dues">${dues
                .map(
                  (t) =>
                    `<div class="due-chip ${t.done ? 'done' : ''}" style="--cc:${colorOf(t.courseId)}" title="${esc(t.course)}: ${esc(t.name)}"><span>${esc(t.name)}</span></div>`
                )
                .join('')}</div>`
            : ''
        }
        ${
          sessions.length
            ? `<div class="sub-label">Work on</div><div class="sessions">${sessions
                .map(
                  (s) => `<div class="sess" style="--cc:${colorOf(s.task.courseId)}">
                    <div class="sess-time">${P.fmtRange(s.start, s.end)}</div>
                    <div class="sess-name">${esc(s.task.name)}</div>
                    <div class="sess-course">${esc(s.task.course)}</div></div>`
                )
                .join('')}</div>`
            : diff >= 0 && !dues.length
            ? '<div class="day-free">Nothing planned</div>'
            : ''
        }
      </div>`;
    }
    $('grid').innerHTML = html;
    const cols = [];
    for (let i = 0; i < 7; i++) cols.push(P.dayDiff(today, P.addDays(mon, i)) < 0 ? '0.55fr' : '1fr');
    $('grid').style.gridTemplateColumns = cols.map((c) => `minmax(0, ${c})`).join(' ');

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

  /* ---------- weekly brief (AI) ---------- */
  const briefKey = () => `brief.${state.mode}.${P.dkey(P.mondayOf(new Date()))}`;

  function briefHtml(r) {
    const list = (arr, fn) => (Array.isArray(arr) && arr.length ? `<ul>${arr.slice(0, 4).map(fn).join('')}</ul>` : '');
    return `<div class="brief-body">
      ${r.headline ? `<p class="brief-headline">${esc(r.headline)}</p>` : ''}
      ${r.do_first && r.do_first.length ? `<div><h5>Do first</h5>${list(r.do_first, (x) => `<li><b>${esc(x.task)}</b>. ${esc(x.why)}</li>`)}</div>` : ''}
      ${r.by_course && r.by_course.length ? `<div><h5>Course by course</h5>${list(r.by_course, (x) => `<li><b>${esc(x.course)}</b>: ${esc(x.note)}</li>`)}</div>` : ''}
      ${r.watch_out && r.watch_out.length ? `<div><h5>Watch out for</h5>${list(r.watch_out, (x) => `<li>${esc(x)}</li>`)}</div>` : ''}
      ${r.pep ? `<p class="pep">${esc(r.pep)}</p>` : ''}
    </div>`;
  }

  function renderBrief() {
    const el = $('brief');
    if (state.mode === 'demo') {
      el.innerHTML = `${briefHtml(Demo.ai)}<p class="meta" style="margin-top:12px">This is a sample brief. Sign in to Carmen and add a Claude API key in Settings to get one written for your own courses.</p>`;
      return;
    }
    if (!state.cfg || !state.cfg.hasKey) {
      el.innerHTML = `<div class="brief-empty"><p>Add a Claude API key in Settings and Claude will write a short brief for your week: what to do first, a note for each course, and crunch points to plan around. Your plan works without it.</p>
        <button class="btn" data-act="settings">Add an API key</button></div>`;
      return;
    }
    if (state.briefLoading) {
      el.innerHTML = '<div class="brief-empty"><p>Claude is reading your week…</p></div>';
      return;
    }
    const saved = store.get(briefKey(), null);
    if (!saved) {
      el.innerHTML = `<div class="brief-empty"><p>Get a short brief on this week from Claude, based on your due dates and syllabi.</p>
        <button class="btn primary" data-act="brief">Write this week’s brief</button></div>`;
      return;
    }
    const t = new Date(saved.at);
    const body = saved.result ? briefHtml(saved.result) : `<p>${esc(saved.raw || '')}</p>`;
    el.innerHTML = `${body}<div class="actions" style="margin-top:12px">
      <button class="btn" data-act="brief">Write it again</button></div>
      <p class="meta" style="margin-top:8px">Written ${esc(fmtDay(t))}, ${P.fmtTime(t.getHours() * 60 + t.getMinutes())}.</p>`;
  }

  async function writeBrief() {
    const today = P.startOfDay(new Date());
    const tasks = state.plan.tasks
      .filter((t) => t.diff <= 14)
      .map((t) => ({
        task: t.name,
        course: t.course,
        due: t.due.toISOString(),
        days_left: t.diff,
        points: t.points,
        type: t.kind,
        estimated_hours: t.hours,
        checked_off: t.done,
      }));
    const schedule = [];
    for (let i = 0; i < 7; i++) {
      const k = P.dkey(P.addDays(today, i));
      (state.plan.sessions[k] || []).forEach((s) =>
        schedule.push({ day: fmtDay(P.addDays(today, i)), task: s.task.name, course: s.task.course, hours: s.hours })
      );
    }
    const courses = ((state.data && state.data.courses) || []).map((c) => ({
      course: c.code,
      name: c.name,
      syllabus_excerpt: (c.syllabus || '').slice(0, 1200),
    }));
    state.briefLoading = true;
    renderBrief();
    const res = await api.aiBrief({ today: fmtDay(today), tasks, schedule, courses });
    state.briefLoading = false;
    if (res.ok) {
      store.set(briefKey(), { at: new Date().toISOString(), result: res.result || null, raw: res.raw || null });
      toast('Brief written.');
    } else {
      toast(res.error || 'Could not write the brief.');
    }
    renderBrief();
  }

  /* ---------- Canvas ---------- */
  async function signInAndSync() {
    const r = await api.login();
    if (!r.ok) {
      if (r.error) toast(r.error);
      return;
    }
    await sync();
  }

  async function sync() {
    $('busy').hidden = false;
    $('busy-text').textContent = 'Reading Canvas…';
    const off = api.onProgress((m) => ($('busy-text').textContent = m));
    const res = await api.sync();
    off();
    $('busy').hidden = true;
    if (res.ok) {
      state.mode = 'canvas';
      store.set('mode', 'canvas');
      store.set('data', res.data);
      state.data = res.data;
      showApp();
      toast(`Read ${res.data.courses.length} courses and ${res.data.assignments.length} assignments.`);
    } else if (res.auth) {
      toast(res.error);
      await signInAndSync();
    } else {
      toast(res.error || 'Could not read Canvas.');
    }
  }

  function startDemo() {
    state.mode = 'demo';
    store.set('mode', 'demo');
    loadData();
    state.weekOffset = 0;
    showApp();
  }

  /* ---------- settings ---------- */
  function renderKeyRow() {
    $('key-row').innerHTML = state.cfg.hasKey
      ? `<span class="key-saved">A key is saved on this computer.</span><button type="button" class="btn" id="key-remove">Remove</button>`
      : `<input type="password" id="s-key" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />`;
    const rm = $('key-remove');
    if (rm)
      rm.onclick = async () => {
        await api.clearKey();
        state.cfg = await api.getConfig();
        renderKeyRow();
        renderBrief();
        toast('API key removed.');
      };
  }

  function openSettings() {
    const s = state.settings;
    $('s-weekday').value = s.weekday;
    $('s-weekend').value = s.weekend;
    $('s-start').value = s.start;
    $('s-rest').value = s.rest;
    $('s-pace').value = String(s.pace);
    $('s-base').value = state.cfg.baseUrl;
    $('s-model').value = state.cfg.model;
    $('s-error').textContent = '';
    $('version').textContent = `Version ${state.cfg.version}`;
    $('s-demo').hidden = state.mode === 'demo';
    $('s-signout').hidden = state.mode !== 'canvas';
    renderKeyRow();
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
    if ($('s-model').value.trim() && $('s-model').value.trim() !== state.cfg.model) patch.model = $('s-model').value.trim();
    if (Object.keys(patch).length) {
      const r = await api.setConfig(patch);
      if (!r.ok) {
        $('s-error').textContent = r.error;
        return false;
      }
    }
    const keyInput = $('s-key');
    if (keyInput && keyInput.value.trim()) {
      const r = await api.setKey(keyInput.value.trim());
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

    $('refresh').onclick = () => (state.mode === 'demo' ? signInAndSync() : sync());
    $('open-settings').onclick = openSettings;

    $('s-save').onclick = async (e) => {
      e.preventDefault();
      if (await saveSettings()) $('settings').close();
    };
    $('key-help').onclick = () => api.openExternal('https://console.anthropic.com/settings/keys');
    $('s-demo').onclick = () => {
      $('settings').close();
      startDemo();
    };
    $('s-signout').onclick = async () => {
      if (!confirm('Sign out of Canvas and remove the course data saved on this computer?')) return;
      await api.signOut();
      ['data', 'mode', 'done'].forEach(store.del);
      Object.keys(localStorage)
        .filter((k) => k.startsWith('cp.brief.'))
        .forEach((k) => localStorage.removeItem(k));
      state.mode = null;
      state.data = null;
      state.done = new Set();
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
      else if (b.dataset.act === 'brief') writeBrief();
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

  /* ---------- start ---------- */
  (async function init() {
    state.cfg = await api.getConfig();
    wire();
    loadData();
    if (state.mode && state.data) showApp();
    else showWelcome();
  })();
})();
