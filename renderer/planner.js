/* Local planner: no network, no AI. Works the same online and offline. */
(function (root) {
  const DAY = 864e5;
  const HEADS_UP_DAYS = 14; // exams and big assignments within the next 2 weeks
  const HORIZON = 28; // how many days ahead study sessions are scheduled

  const pad = (n) => String(n).padStart(2, '0');
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

  // What kind of work is this, and roughly how many hours does it take?
  function classify(a) {
    const n = (a.name || '').toLowerCase();
    const pts = a.points || 0;
    if (/attendance|survey|syllabus|participation|ice ?breaker|team contract|check-?in|\bsona\b|sign ?up/.test(n))
      return { kind: 'light', hours: 0.25 };
    if (/\b(final exam|exam|midterm|test)\b/.test(n)) return { kind: 'exam', hours: 4 };
    if (/\bquiz/.test(n)) return { kind: 'quiz', hours: 0.75 };
    if (/project|paper|essay|report|presentation|portfolio|draft|proposal|design brief/.test(n))
      return { kind: 'project', hours: pts >= 100 ? 4 : 2.5 };
    if (/\blab\b|pre-?lab|post-?lab/.test(n)) return { kind: 'lab', hours: 1.5 };
    if (/discussion|reflection|response|\bpost\b/.test(n)) return { kind: 'discussion', hours: 0.75 };
    if (/reading|\bread\b|chapter/.test(n)) return { kind: 'reading', hours: 1 };
    return { kind: 'homework', hours: pts >= 50 ? 2 : pts >= 20 ? 1.25 : 1 };
  }

  const roundQ = (h) => Math.max(0.25, Math.round(h * 4) / 4);

  function urgencyOf(diff) {
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    if (diff <= 2) return 'soon';
    if (diff <= 6) return 'week';
    return 'later';
  }

  function parseStart(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    return m ? +m[1] * 60 + +m[2] : 19 * 60;
  }

  // Hours available for studying on a given day.
  function capacity(date, now, s) {
    const dow = date.getDay(); // 0 = Sunday
    if (s.rest === 'sat' && dow === 6) return 0;
    if (s.rest === 'sun' && dow === 0) return 0;
    if (dayDiff(now, date) === 0 && now.getHours() >= 22) return 0; // too late tonight
    return dow === 0 || dow === 6 ? +s.weekend : +s.weekday;
  }

  function build(data, now, settings, doneSet) {
    const s = Object.assign({ weekday: 4, weekend: 3, rest: 'none', start: '19:00', pace: 1 }, settings || {});
    const courses = {};
    ((data && data.courses) || []).forEach((c) => (courses[c.id] = c));
    const today = startOfDay(now);

    // ----- tasks -----
    const tasks = [];
    let undated = 0;
    ((data && data.assignments) || []).forEach((a) => {
      if (a.submitted) return;
      if (!a.dueAt) {
        undated++;
        return;
      }
      const due = new Date(a.dueAt);
      if (isNaN(due)) return;
      const diff = dayDiff(now, due);
      if (diff < -7) return; // older than a week and never submitted: likely no longer relevant
      const cls = classify(a);
      const key = `${a.courseId}:${a.id}`;
      const c = courses[a.courseId] || {};
      tasks.push({
        key,
        courseId: a.courseId,
        course: c.code || c.name || 'Course',
        name: a.name,
        due,
        diff,
        points: a.points || 0,
        group: a.group || '',
        url: a.url || '',
        kind: cls.kind,
        hours: roundQ(cls.hours * (+s.pace || 1)),
        urgency: urgencyOf(diff),
        heavy: cls.kind === 'exam' || cls.kind === 'project' || (a.points || 0) >= 100,
        done: doneSet ? doneSet.has(key) : false,
      });
    });
    tasks.sort((x, y) => x.due - y.due);

    // ----- schedule: earliest deadline first, spread over the days before it is due -----
    const cap = {};
    for (let i = 0; i < HORIZON; i++) {
      const d = addDays(today, i);
      cap[dkey(d)] = capacity(d, now, s);
    }
    const lead = { exam: 7, project: 10, lab: 4, quiz: 3, homework: 4, reading: 3, discussion: 2, light: 1 };
    const chunk = { exam: 1.5, project: 2, lab: 1.5, quiz: 1, homework: 1.5, reading: 1, discussion: 0.75, light: 0.25 };
    const blocks = {};
    const unscheduled = [];

    // Pass 1: exams and big projects get an even share of the days before they are due,
    //         using at most half of each day so smaller work still fits.
    // Pass 2: everything else, earliest deadline first.
    // Pass 3: whatever is left goes into any free time before its deadline (latest days first).
    const half = {};
    Object.keys(cap).forEach((k) => (half[k] = cap[k] / 2));
    const left = new Map();
    const windowOf = (t) => {
      const lateDue = t.due.getHours() >= 21 && t.kind !== 'exam'; // late-night deadlines can use the due day
      const lim = Math.min(Math.max(0, lateDue ? t.diff : t.diff - 1), HORIZON - 1);
      return { lim, early: Math.max(0, lim - (lead[t.kind] || 3)) };
    };
    const place = (t, i, maxHours, limitHalf) => {
      let remaining = left.get(t.key);
      if (i < 0 || i >= HORIZON || remaining <= 0) return;
      const k = dkey(addDays(today, i));
      let take = Math.min(remaining, maxHours, cap[k]);
      if (limitHalf) take = Math.min(take, half[k]);
      take = Math.floor(take * 4) / 4;
      if (take <= 0) return;
      cap[k] -= take;
      if (limitHalf) half[k] -= take;
      left.set(t.key, remaining - take);
      (blocks[k] = blocks[k] || []).push({ task: t, hours: take });
    };

    const open = tasks.filter((t) => !t.done);
    open.forEach((t) => left.set(t.key, t.hours));
    const big = open.filter((t) => t.heavy && t.diff >= 0);
    const small = open.filter((t) => !(t.heavy && t.diff >= 0));

    big.forEach((t) => {
      const w = windowOf(t);
      const lim = w.lim;
      // Leave today and tomorrow for things due soon, unless the deadline is close.
      const early = Math.max(w.early, Math.min(2, lim - 2));
      const days = lim - early + 1;
      const per = Math.max(1, Math.min(chunk[t.kind] || 1.5, Math.ceil((t.hours / days) * 4) / 4));
      const n = Math.min(days, Math.ceil(t.hours / per));
      const step = n > 1 ? (days - 1) / (n - 1) : 0;
      // sessions spaced out, the last one the day before it is due
      for (let j = 0; j < n; j++) {
        const target = lim - Math.round(j * step);
        for (let i = target; i >= early && left.get(t.key) > 0; i--) {
          const before = left.get(t.key);
          place(t, i, Math.min(per, before - (n - j - 1) * per > 0 ? before - (n - j - 1) * per : per), true);
          if (left.get(t.key) < before) break;
        }
      }
    });
    small.forEach((t) => {
      const { lim, early } = windowOf(t);
      // keep short tasks in one sitting when a day has room for them
      for (let i = early; i <= lim && left.get(t.key) > 0; i++) {
        const k = dkey(addDays(today, i));
        if (cap[k] >= t.hours && t.hours <= (chunk[t.kind] || 1.5)) place(t, i, t.hours, false);
      }
      for (let i = early; i <= lim; i++) place(t, i, chunk[t.kind] || 1.5, false);
      for (let i = lim; i >= early; i--) place(t, i, 99, false);
    });
    open.forEach((t) => {
      const { lim } = windowOf(t);
      for (let i = lim; i >= 0; i--) place(t, i, 99, false);
      const r = left.get(t.key);
      if (r > 0.01) unscheduled.push({ task: t, hours: r });
    });

    // merge repeated blocks of the same task on the same day
    Object.keys(blocks).forEach((k) => {
      const m = new Map();
      blocks[k].forEach((b) => {
        const prev = m.get(b.task.key);
        if (prev) prev.hours += b.hours;
        else m.set(b.task.key, { task: b.task, hours: b.hours });
      });
      blocks[k] = [...m.values()];
    });

    // ----- timed sessions -----
    const startMin = parseStart(s.start);
    const sessions = {};
    Object.keys(blocks).forEach((k) => {
      const list = blocks[k].slice().sort((a, b) => a.task.due - b.task.due);
      const total = list.reduce((x, b) => x + b.hours * 60, 0) + (list.length - 1) * 15;
      let t0 = Math.max(8 * 60, Math.min(startMin, 23 * 60 - total));
      sessions[k] = list.map((b) => {
        const st = t0;
        const en = t0 + Math.round(b.hours * 60);
        t0 = en + 15;
        return { task: b.task, hours: b.hours, start: st, end: en };
      });
    });

    // ----- heads-up: exams and big assignments in the next 2 weeks -----
    const firstSession = {};
    Object.keys(sessions)
      .sort()
      .forEach((k) =>
        sessions[k].forEach((x) => {
          if (!(x.task.key in firstSession)) firstSession[x.task.key] = k;
        })
      );
    const ahead = tasks
      .filter((t) => !t.done && t.heavy && t.diff >= 0 && t.diff <= HEADS_UP_DAYS)
      .map((t) => ({ task: t, startBy: firstSession[t.key] || null }));

    return { tasks, sessions, unscheduled, undated, ahead, today };
  }

  function fmtTime(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  // "7:00 – 8:30 PM", or "11:30 AM – 1:00 PM" when it crosses noon
  function fmtRange(a, b) {
    const A = fmtTime(a);
    const B = fmtTime(b);
    if (A.slice(-2) === B.slice(-2)) return `${A.slice(0, -3)} – ${B}`;
    return `${A} – ${B}`;
  }

  function fmtHours(h) {
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    if (!hh) return `${mm} min`;
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  }

  const api = { HEADS_UP_DAYS, HORIZON, build, classify, dkey, addDays, startOfDay, mondayOf, dayDiff, fmtTime, fmtRange, fmtHours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
