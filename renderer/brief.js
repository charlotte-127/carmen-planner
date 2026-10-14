/* The weekly brief, written on this computer from the plan (no AI, no internet).
   It reads the same plan the app shows and says what a thoughtful older student would:
   what kind of week it is, what to do first and why, a note per course, and where it gets tight. */
(function (root) {
  const P = root.Planner || (typeof require !== 'undefined' ? require('./planner.js') : null);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d) => `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
  const hrs = (h) => P.fmtHours(h);
  const plain = (t) => String(t || '').replace(/\*\*/g, '').trim();
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const fromKey = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const listOf = (xs) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  // "tonight by midnight", "today at 2:20 PM", "tomorrow at 8:00 AM", "Wed Oct 14"
  function when(t, now) {
    const at = t.due.getHours() === 23 && t.due.getMinutes() === 59 ? 'by midnight' : `at ${P.fmtTime(t.due.getHours() * 60 + t.due.getMinutes())}`;
    if (t.diff === 0) return at === 'by midnight' ? 'tonight by midnight' : `today ${at}`;
    if (t.diff === 1) return `tomorrow ${at}`;
    if (t.diff < 0) return day(t.due);
    return t.diff <= 6 ? `${DOW[t.due.getDay()]} ${at}` : day(t.due);
  }
  const KIND_WORD = { exam: 'Exam', project: 'Big assignment', homework: 'Homework', quiz: 'Quiz', lab: 'Lab', reading: 'Reading', discussion: 'Discussion', light: 'Check-in' };
  const label = (t) => `${t.name} (${t.course})`;
  const short = (t) => `${t.course} ${t.name}`;

  // Which syllabus rules matter for these tasks.
  const KIND_RE = {
    quiz: /quiz/i,
    exam: /exam|midterm|final|test/i,
    homework: /homework|assignment|problem set|webassign|\bhw\b/i,
    lab: /\blab/i,
    project: /paper|essay|project|draft/i,
    reading: /reading|discussion|post/i,
    discussion: /discussion|post|participation/i,
  };
  // A rule fits a task if it names the task's kind ("quiz"), or names no kind at all ("late work").
  function fits(r, t) {
    const x = plain(r.text);
    if (KIND_RE[t.kind] && KIND_RE[t.kind].test(x)) return true;
    return !Object.values(KIND_RE).some((re) => re.test(x));
  }
  function ruleFor(rules, items, overdueItems) {
    if (!rules || !rules.length) return null;
    for (const t of overdueItems || []) {
      const late = rules.find((r) => (r.rule === 'late' || /\blate\b/i.test(plain(r.text))) && fits(r, t));
      if (late) return late;
    }
    const hits = rules.filter((r) => items.some((t) => KIND_RE[t.kind] && KIND_RE[t.kind].test(plain(r.text))));
    if (hits.length) return hits.find((r) => r.kind === 'less') || hits[0];
    // otherwise a general warning that applies to anything due, like "late work is not accepted"
    if (!items.length) return null;
    return rules.find((r) => r.kind === 'risk' && (r.rule === 'late' || /\blate\b/i.test(plain(r.text))) && items.some((t) => fits(r, t))) || null;
  }

  function make(plan, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const settings = Object.assign({ weekday: 4, weekend: 3, rest: 'none' }, opts.settings || {});
    const rulesBy = opts.rules || {}; // courseId -> syllabus dontMiss list
    const today = plan.today || P.startOfDay(now);
    const todayKey = P.dkey(today);
    const open = plan.tasks.filter((t) => !t.done);
    const overdue = open.filter((t) => t.due < now);
    const week = open.filter((t) => t.due >= now && t.diff <= 6);
    const later = open.filter((t) => t.diff >= 7 && t.diff <= P.HEADS_UP_DAYS);
    const startBy = {};
    (plan.ahead || []).forEach((a) => (startBy[a.task.key] = a.startBy));

    // ----- how heavy is the week -----
    let capacity = 0;
    let planned = 0;
    for (let i = 0; i < 7; i++) {
      const d = P.addDays(today, i);
      capacity += P.capacity(d, now, settings);
      planned += sum((plan.sessions && plan.sessions[P.dkey(d)]) || [], (s) => s.hours);
    }
    const unfit = sum((plan.unscheduled || []).filter((u) => u.task.diff <= 6), (u) => u.hours);
    const weekHours = sum(week, (t) => t.hours);
    const bigs = week.filter((t) => t.heavy);
    const nextBig = later.filter((t) => t.heavy)[0] || null;
    let load = 'empty';
    if (week.length || overdue.length) {
      const ratio = capacity ? (planned + unfit) / capacity : 2;
      load = unfit >= 1 ? 'over' : ratio >= 0.75 || bigs.length >= 2 ? 'busy' : ratio >= 0.35 || bigs.length ? 'steady' : 'light';
    }

    // ----- headline -----
    const n = week.length;
    const prepNow = later.filter((t) => t.heavy && startBy[t.key] && P.dayDiff(today, fromKey(startBy[t.key])) <= 6);
    const prepNames = () => {
      const names = prepNow.slice(0, 2).map((t) => t.name);
      if (prepNow.length > 2) names.push(`${prepNow.length - 2} more`);
      return listOf(names);
    };
    const bigText = listOf(bigs.slice(0, 2).map((t) => `${t.name} on ${DOW[t.due.getDay()]}`));
    let headline;
    if (load === 'empty') {
      headline = nextBig ? `Nothing is due this week. A good time to get ahead on ${label(nextBig)}, due ${day(nextBig.due)}.` : 'Nothing is due this week.';
    } else if (load === 'over') {
      headline = `More work than time this week: about ${hrs(unfit)} doesn’t fit before the due dates.`;
    } else if (load === 'busy') {
      headline = bigs.length ? `A heavy week: ${bigText}` : `A full week: ${plural(n, 'thing')} due, about ${hrs(weekHours)} of work`;
      headline += prepNow.length ? `, and prep starts for ${prepNames()}.` : '.';
    } else if (load === 'steady') {
      headline = `A steady week: ${plural(n, 'thing')} due, about ${hrs(weekHours)} of work`;
      headline += bigs.length ? `, with ${bigText}.` : prepNow.length ? `. Prep starts for ${prepNames()}.` : '.';
    } else {
      headline = nextBig
        ? `A light week: ${plural(n, 'small thing')} due. Use the spare time to get ahead on ${nextBig.name}, due ${day(nextBig.due)}.`
        : `A light week: ${plural(n, 'thing')} due, about ${hrs(weekHours)} of work.`;
    }
    if (overdue.length) headline += ` ${plural(overdue.length, 'thing is', 'things are')} past due.`;

    // ----- do first -----
    const cand = [];
    overdue.forEach((t) => {
      const r = ruleFor(rulesBy[t.courseId], [], [t]);
      cand.push({ t, score: 100 + t.diff, why: `It was due ${day(t.due)}. ${r ? `The syllabus says: “${plain(r.text)}”` : 'Check in Carmen whether it can still be turned in.'}` });
    });
    week.forEach((t) => {
      const sb = startBy[t.key];
      if (t.diff === 0) cand.push({ t, score: 90, why: `Due ${when(t, now)}. About ${hrs(t.hours)}.` });
      else if (t.heavy && sb && sb <= todayKey)
        cand.push({ t, score: 80 - t.diff, why: `${KIND_WORD[t.kind] || 'Due'} ${when(t, now)}, in ${plural(t.diff, 'day')}. About ${hrs(t.hours)} in total, so start today and spread it out.` });
      else if (t.diff === 1) cand.push({ t, score: 70, why: `Due ${when(t, now)}. About ${hrs(t.hours)}.` });
      else cand.push({ t, score: 50 - t.diff * 4 + Math.min(10, (t.points || 0) / 20), why: `Due ${when(t, now)}${t.points ? `, worth ${t.points} points` : ''}. About ${hrs(t.hours)}.` });
    });
    later.forEach((t) => {
      const sb = startBy[t.key];
      if (t.heavy && sb && sb <= todayKey) cand.push({ t, score: 75 - t.diff, why: `${KIND_WORD[t.kind] || 'Due'} on ${day(t.due)}. The plan starts your prep today, so it isn’t one long night later.` });
    });
    cand.sort((a, b) => b.score - a.score || a.t.due - b.t.due);
    const do_first = cand.slice(0, 4).map((c) => ({ task: label(c.t), why: c.why }));

    // ----- a note for each course -----
    const byCourse = new Map();
    open
      .filter((t) => t.due < now || t.diff <= P.HEADS_UP_DAYS)
      .forEach((t) => {
        if (!byCourse.has(t.courseId)) byCourse.set(t.courseId, { course: t.course, items: [] });
        byCourse.get(t.courseId).items.push(t);
      });
    const by_course = [];
    for (const [cid, g] of byCourse) {
      const late = g.items.filter((t) => t.due < now);
      const thisWeek = g.items.filter((t) => t.due >= now && t.diff <= 6);
      const nextWeek = g.items.filter((t) => t.diff >= 7 && t.heavy);
      const bits = [];
      if (late.length) bits.push(`${late.length} past due`);
      if (thisWeek.length) {
        const big = thisWeek.filter((t) => t.heavy).sort((a, b) => b.hours - a.hours)[0];
        bits.push(`${thisWeek.length} due this week, about ${hrs(sum(thisWeek, (t) => t.hours))}${big ? `; ${big.name} (${DOW[big.due.getDay()]}) is the big one` : ''}`);
      } else if (!late.length) {
        bits.push('Nothing due this week');
      }
      if (nextWeek.length) {
        const t = nextWeek[0];
        const sb = startBy[t.key];
        const sd = sb && fromKey(sb);
        bits.push(`Next: ${t.name} ${day(t.due)}${sd ? `, start ${sb <= todayKey ? 'now' : `${MON[sd.getMonth()]} ${sd.getDate()}`}` : ''}`);
      }
      const r = ruleFor(rulesBy[cid], late.concat(thisWeek, nextWeek), late);
      by_course.push({
        course: g.course,
        note: bits.join('. ') + '.',
        tip: r ? `${r.kind === 'less' ? 'Good to know' : 'Careful'}: ${plain(r.text)}` : '',
        first: Math.min(...g.items.map((t) => +t.due)),
      });
    }
    by_course.sort((a, b) => a.first - b.first);
    by_course.forEach((c) => delete c.first);

    // ----- watch out -----
    const watch_out = [];
    if (unfit >= 1)
      watch_out.push(`About ${hrs(unfit)} of this week’s work doesn’t fit in the hours you set. Add study time in Settings, or check off what’s already done.`);
    const heavyAll = open.filter((t) => t.heavy && t.due >= now && t.diff <= P.HEADS_UP_DAYS);
    for (let i = 0; i < heavyAll.length && watch_out.length < 4; i++) {
      for (let j = i + 1; j < heavyAll.length; j++) {
        const a = heavyAll[i];
        const b = heavyAll[j];
        const gap = b.diff - a.diff;
        if (gap > 1) continue;
        watch_out.push(
          gap === 0
            ? `${short(a)} and ${short(b)} are both on ${day(a.due)}. Work on both during the days before, not on the day.`
            : `${short(a)} (${DOW[a.due.getDay()]}) and ${short(b)} (${DOW[b.due.getDay()]}) are back to back. Aim to be done with the first one a day early.`
        );
        break;
      }
    }
    for (let i = 0; i < 7 && watch_out.length < 4; i++) {
      const d = P.addDays(today, i);
      const due = week.filter((t) => t.diff === i);
      const h = sum(due, (t) => t.hours);
      if (due.length >= 3 || (due.length >= 2 && h >= 4))
        watch_out.push(`${day(d)} has ${plural(due.length, 'thing')} due (${listOf(due.slice(0, 3).map((t) => t.name))}). Finish some of them the day before.`);
    }
    if (plan.undated && watch_out.length < 4)
      watch_out.push(`${plural(plan.undated, 'assignment has', 'assignments have')} no due date in Carmen yet, so ${plan.undated === 1 ? 'it isn’t' : 'they aren’t'} in this plan. Check them once in a while.`);

    // ----- a closing line that fits the week (changes week to week) -----
    const PEP = {
      over: ['You can’t do everything this week, and that’s okay. Do the highest-value work first, and ask about extensions early, not at midnight.', 'When there’s too much, pick what counts most and let the small stuff be good enough.'],
      busy: ['A busy week goes better in small pieces. One focused hour today is worth more than three tired ones on Sunday.', 'Start the big thing first while you’re fresh; the small things fit in the gaps.'],
      steady: ['Keep the rhythm: a little every evening and the week stays calm.', 'Nothing scary here. Stick to the plan and you’ll have your weekend.'],
      light: ['A quiet week is a gift. An hour of getting ahead now makes next week much easier.', 'Light week. Rest a bit, then get a head start on what’s coming.'],
      empty: ['Enjoy the break, you earned it.', 'Nothing due. A short look at what’s coming will keep next week calm.'],
    };
    const wk = Math.floor(+P.mondayOf(today) / (7 * 864e5));
    const pep = PEP[load][wk % PEP[load].length];

    return { headline, do_first, by_course, watch_out, pep, load };
  }

  const api = { make };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Brief = api;
})(typeof window !== 'undefined' ? window : globalThis);
