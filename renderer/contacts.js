/* Who to contact in a course, read from the syllabus (and the course's People list in Carmen):
   each instructor and TA with their email, weekly office hours (days, times, place),
   and whether you need an appointment. No network; works on the syllabus text blocks. */
(function (root) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_WORD = [
    [/^mon(day)?s?$|^m$/i, 0],
    [/^tue(s(day)?)?s?$|^tu$|^t$/i, 1],
    [/^wed(nesday)?s?$|^w$/i, 2],
    [/^thu(r(s(day)?)?)?s?$|^th$|^r$/i, 3],
    [/^fri(day)?s?$|^f$/i, 4],
    [/^sat(urday)?s?$/i, 5],
    [/^sun(day)?s?$/i, 6],
  ];
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  const ROLE_RE =
    /\b(course coordinator|course instructor|instructor of record|primary instructor|lead instructor|instructors?|professor|lecturer|faculty|graduate teaching associate|graduate teaching assistant|undergraduate teaching assistant|teaching associates?|teaching assistants?|recitation (?:instructor|leader|ta)|lab (?:instructor|ta)|learning assistants?|grader|g\.?t\.?a\.?s?|u\.?t\.?a\.?s?|tas?)\b/i;
  const ROLE_LABEL = new RegExp(`(?:^|[\\s|;,.(])(${ROLE_RE.source.slice(3, -3)})\\s*(?:\\(s\\))?\\s*[:\\-–—]\\s*`, 'gi');
  const FIELD =
    /\b(e-?mail(?: address)?|phone|tel(?:ephone)?|office location|office hours?|student hours|drop-?in hours|virtual office hours|zoom office hours|office|location|zoom(?: link)?|pronouns|name)\s*:\s*/gi;

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const roleName = (r) => {
    r = r.toLowerCase();
    if (/coordinator/.test(r)) return 'Course coordinator';
    if (/recitation/.test(r)) return 'Recitation TA';
    if (/lab/.test(r)) return 'Lab TA';
    if (/learning assistant/.test(r)) return 'Learning assistant';
    if (/grader/.test(r)) return 'Grader';
    if (/undergraduate|u\.?t\.?a/.test(r)) return 'TA';
    if (/teaching|\bg\.?t\.?a|\bta/.test(r)) return 'TA';
    return 'Instructor';
  };
  const isTA = (role) => role !== 'Instructor' && role !== 'Course coordinator';

  /* ---------- office hours: days and times ---------- */
  function dayTokens(text) {
    const out = new Set();
    const t = ` ${text} `;
    // ranges: "Monday through Thursday", "Mon–Fri"
    const range = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?:-|–|—|through|thru|to)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi;
    let m;
    const idx = (w) => DAYS.findIndex((d) => d.toLowerCase() === w.slice(0, 3).toLowerCase());
    while ((m = range.exec(t))) {
      const a = idx(m[1]);
      const b = idx(m[2]);
      if (a >= 0 && b >= a) for (let i = a; i <= b; i++) out.add(i);
    }
    if (/\bweekdays\b/i.test(t)) [0, 1, 2, 3, 4].forEach((i) => out.add(i));
    // words and abbreviations: "Mondays", "Tues", "Tu/Th", "Thurs."
    const word = /\b(mondays?|monday|mon|tuesdays?|tues|tue|tu|wednesdays?|wed|thursdays?|thurs|thur|thu|th|fridays?|fri|saturdays?|sat|sundays?|sun)\b\.?/gi;
    while ((m = word.exec(t))) {
      const w = m[1];
      for (const [re, i] of DAY_WORD) if (re.test(w)) out.add(i);
    }
    // compact capital letters: "MW", "TR", "MWF", "TTh", "M/W", "T/R"
    const compact = /(?:^|[\s,(])((?:M|T|W|R|F|Th|Tu)(?:\s*\/\s*|,\s*|&\s*)?(?:M|T|W|R|F|Th|Tu)(?:(?:\s*\/\s*|,\s*|&\s*)?(?:M|T|W|R|F|Th|Tu))*)(?=[\s,:;.)]|$)/g;
    while ((m = compact.exec(t))) {
      const parts = m[1].replace(/[\s/,&]/g, '').match(/Th|Tu|M|T|W|R|F/g) || [];
      parts.forEach((p) => out.add({ M: 0, T: 1, Tu: 1, W: 2, R: 3, Th: 3, F: 4 }[p]));
    }
    // a lone "M" or "W" before a time: "M 2-3pm"
    const single = /(?:^|[\s,;(])([MTWRF])(?=\s+\d)/g;
    while ((m = single.exec(t))) out.add({ M: 0, T: 1, W: 2, R: 3, F: 4 }[m[1]]);
    return [...out].sort((a, b) => a - b);
  }

  const TIME = String.raw`(noon|midnight|\d{1,2}(?::[0-5]\d)?)\s*(a\.?m\.?|p\.?m\.?)?`;
  const RANGE = new RegExp(`${TIME}\\s*(?:-|–|—|to|until|till)\\s*${TIME}`, 'gi');
  function toMin(v, ap) {
    if (/noon/i.test(v)) return 12 * 60;
    if (/midnight/i.test(v)) return 24 * 60;
    const [h, mm] = v.split(':').map(Number);
    let hh = h % 12;
    if (ap && /p/i.test(ap)) hh += 12;
    return hh * 60 + (mm || 0);
  }
  function guessAp(v) {
    if (/noon|midnight/i.test(v)) return null;
    const h = Number(v.split(':')[0]);
    return h >= 8 && h <= 11 ? 'am' : 'pm';
  }
  const fmt = (min) => {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    if (h === 12 && !m) return 'noon';
    return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  function timeRanges(text) {
    const out = [];
    let m;
    RANGE.lastIndex = 0;
    while ((m = RANGE.exec(text))) {
      const [all, a, apA, b, apB] = m;
      // not a date ("10/14"), a room ("Room 2-3"), or a count ("1-2 weeks")
      if (!apA && !apB && !/:/.test(a + b) && !/noon|midnight/i.test(a + b)) {
        const after = text.slice(m.index + all.length, m.index + all.length + 12);
        if (!/^\s*(o'?clock|in|on|at|,|;|\.|$|\(|and|or|\s*$)/i.test(after) || /^\s*(weeks?|days?|hours?|minutes?|pages?|points?|%)/i.test(after)) continue;
        if (Number(a) > 12 || Number(b) > 12) continue;
      }
      if (/\d\s*\/\s*$/.test(text.slice(0, m.index))) continue;
      if (/\b(pages?|pp\.?|chapters?|ch\.?|sections?|questions?|problems?|exercises?|items?|weeks?|units?|lectures?|labs?|modules?|exams?|quizzes|points?|rooms?|rm\.?|grades?)\s*$/i.test(text.slice(Math.max(0, m.index - 14), m.index))) continue;
      let endAp = apB || null;
      let startAp = apA || null;
      if (!endAp && !startAp) {
        endAp = guessAp(b);
        startAp = guessAp(a);
      } else if (!startAp) {
        const sa = Number(a.split(':')[0]) % 12;
        const sb = Number((b.split(':')[0] || '12')) % 12;
        startAp = /noon/i.test(b) ? 'am' : sa <= sb ? endAp : /p/i.test(endAp) ? 'am' : 'pm';
      } else if (!endAp) endAp = apA;
      const start = toMin(a, startAp);
      let end = toMin(b, endAp);
      if (end <= start) end += 12 * 60;
      if (end - start > 8 * 60 || end - start < 10) continue;
      out.push({ start, end, at: m.index, len: all.length });
    }
    return out;
  }

  function placeOf(text) {
    const m = /\b(?:in|at|@|room|location:?)\s+((?:[A-Z][A-Za-z.&'-]*\s){0,4}(?:Hall|Tower|Building|Library|Center|Lab|Labs|Room|Rm\.?|Bldg\.?)?\s*[A-Z]{0,4}\s*\d{2,4}[A-Z]?)\b/.exec(text);
    if (m) return clean(m[1]);
    const k = /\b((?:[A-Z][A-Za-z.'-]+\s){1,3}(?:Hall|Tower|Building|Library|Center|Lab|Labs|Annex|House)\s+[A-Z]?\d{2,4}[A-Z]?)\b/.exec(text);
    if (k) return clean(k[1]);
    const n = /\b(?:in|at)\s+((?:[A-Z][A-Za-z.'-]+\s){0,3}(?:Hall|Tower|Building|Library|Center|Lab))\b/.exec(text);
    if (n) return clean(n[1]);
    return /\b(zoom|online|virtual|teams)\b/i.test(text) ? 'Zoom / online' : '';
  }

  // "Mon & Wed 2:00 – 3:30 PM in Math Tower 412" -> [{ days: [0, 2], start, end, place }]
  function slotsOf(text) {
    const ranges = timeRanges(text);
    const slots = [];
    ranges.forEach((r, i) => {
      const prevEnd = i ? ranges[i - 1].at + ranges[i - 1].len : 0;
      const before = text.slice(prevEnd, r.at);
      const nextStart = i < ranges.length - 1 ? ranges[i + 1].at : text.length;
      const after = text.slice(r.at + r.len, nextStart);
      let days = dayTokens(before);
      if (!days.length) days = dayTokens(after.split(/[;.]/)[0]);
      if (!days.length && slots.length) days = slots[slots.length - 1].days;
      const place = placeOf(after.split(/[;]|\.\s/)[0]) || placeOf(before.slice(-60));
      slots.push({ days, start: r.start, end: r.end, place });
    });
    // "Mon 2-3pm, Mon 4-5pm" stays as two; identical slots once
    return slots.filter((s, i) => slots.findIndex((x) => x.start === s.start && x.end === s.end && x.days.join() === s.days.join()) === i);
  }

  function bookingOf(text, hasSlots) {
    const t = text.toLowerCase();
    if (/no appointment (is )?(needed|necessary|required)|drop[- ]?in|walk[- ]?in|just (stop|come) by|feel free to (stop|come|drop) by/.test(t)) return hasSlots ? 'none' : 'none';
    if (/by appointment only|only by appointment|appointment (is |are )?(required|needed|necessary)|must (schedule|book|make|sign up)|please (schedule|book|make|request) (an |a )?(appointment|meeting|time)|sign[- ]?up (is )?(required|needed)|(sign up|register) (for a slot|in advance|ahead)|calendly|book (a |an )?(slot|time|appointment|meeting)|email (me )?(in advance|ahead( of time)?|beforehand|first) to (schedule|set up|arrange|make)/.test(t))
      return hasSlots ? 'required' : 'only';
    if (/(or|and|also|otherwise|other times)\s+(by|by an?)\s+appointment|by appointment|upon request|by request|schedule a (time|meeting)/.test(t)) return hasSlots ? 'also' : 'only';
    return hasSlots ? 'unknown' : null;
  }

  const replyOf = (text) => {
    const m = /\b(?:respond|reply|answer|get back to)\w*\b[^.]{0,40}?\bwithin\s+([^.;,]{2,50})/i.exec(text);
    return m ? `within ${clean(m[1]).replace(/\s*\)$/, '')}` : '';
  };

  /* ---------- people ---------- */
  function nameFrom(v) {
    let s = clean(v)
      .replace(EMAIL, ' ')
      .split(/\s*(?:[,;|(<]|\s[-–—]\s|\b(?:e-?mail|phone|office|pronouns|she\/her|he\/him|they\/them)\b)/i)[0]
      .trim();
    s = s.replace(/^(?:is|are|:)\s+/i, '').replace(/[.:]+$/, '');
    if (!s || s.length > 48 || /\d/.test(s)) return '';
    const words = s.split(/\s+/);
    if (words.length > 6) return '';
    if (!/^(?:(?:Dr|Prof|Professor|Mr|Ms|Mrs|Mx)\.?\s+)?[A-Z][\p{L}'’-]+/u.test(s)) return '';
    if (/\b(information|info|hours|the|course|office|contact|team|syllabus|section|email|will|please)\b/i.test(s) && !/^(Dr|Prof)/.test(s)) return '';
    return s;
  }

  function newPerson(role, name) {
    return { role, name: name || '', email: '', phone: '', office: '', text: '', slots: [] };
  }

  // Split "Instructor: Dr. Jane Smith Email: smith.1@osu.edu Office hours: MW 2-3pm" into labeled parts.
  function fields(x) {
    const marks = [];
    let m;
    ROLE_LABEL.lastIndex = 0;
    while ((m = ROLE_LABEL.exec(x))) marks.push({ at: m.index + (m[0].length - m[0].trimStart().length), end: m.index + m[0].length, kind: 'role', label: m[1] });
    FIELD.lastIndex = 0;
    while ((m = FIELD.exec(x))) marks.push({ at: m.index, end: m.index + m[0].length, kind: 'field', label: m[1].toLowerCase() });
    marks.sort((a, b) => a.at - b.at);
    const out = [];
    if (!marks.length || marks[0].at > 0) out.push({ kind: 'text', value: x.slice(0, marks.length ? marks[0].at : x.length) });
    marks.forEach((mk, i) => out.push({ kind: mk.kind, label: mk.label, value: x.slice(mk.end, i < marks.length - 1 ? marks[i + 1].at : x.length).trim() }));
    return out.filter((f) => f.kind !== 'text' || clean(f.value));
  }

  function parse(blocks, staff) {
    const people = [];
    let cur = null;
    let headRole = null; // role from a heading like "Teaching Assistants"
    let inContact = false; // inside a contact-ish section
    const general = { text: '' }; // office-hours text not tied to anyone
    const start = (role, name) => {
      cur = newPerson(role, name);
      people.push(cur);
      return cur;
    };
    const absorb = (p, label, v) => {
      if (!p) return;
      const e = EMAIL.exec(v);
      if (e && !p.email) p.email = e[0];
      if (/^(e-?mail)/.test(label)) {
        const rest = clean(v.replace(EMAIL, ' '));
        if (rest.length > 3) p.text += ' ' + rest;
        return;
      }
      if (/^(phone|tel)/.test(label)) {
        const ph = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(v);
        if (ph) p.phone = ph[0];
        return;
      }
      if (/^(office location|location)$/.test(label) || (label === 'office' && !/\d{1,2}(:\d\d)?\s*(am|pm)|\bhours?\b/i.test(v))) {
        if (!p.office) p.office = clean(v.replace(EMAIL, '')).replace(/[.;,]+$/, '').slice(0, 60);
        return;
      }
      if (/hours|zoom/.test(label)) p.text += ' ' + v;
      else if (label === 'name' && !p.name) p.name = nameFrom(v);
      else p.text += ' ' + v;
    };

    for (const b of blocks || []) {
      const x = clean(b.x);
      if (!x) continue;
      if (b.t === 'h') {
        // a heading that is itself a person: "Lecturer: Julian Alonso Mejia Cordero (Dr. Mejia)"
        const rf = fields(x).find((f) => f.kind === 'role' && (nameFrom(f.value) || EMAIL.test(f.value)));
        if (rf) {
          const p = start(roleName(rf.label), nameFrom(rf.value));
          const e = EMAIL.exec(rf.value);
          if (e) p.email = e[0];
          inContact = true;
          headRole = null;
          continue;
        }
        const rm = ROLE_RE.exec(x);
        inContact = !!rm || /contact|office hours|teaching team|course staff|communication/i.test(x);
        headRole = rm ? roleName(rm[1]) : /teaching team|course staff/i.test(x) ? null : headRole && inContact ? headRole : null;
        if (!inContact) cur = null;
        continue;
      }
      // table row: "Instructor | Dr. Jane Smith | smith.1@osu.edu | MW 2-3pm"
      if (x.includes(' | ')) {
        const cells = x.split(' | ').map(clean);
        const rc = cells.find((c) => ROLE_RE.test(c) && c.length < 40);
        const em = cells.find((c) => EMAIL.test(c));
        if (rc || em) {
          const role = rc ? roleName(ROLE_RE.exec(rc)[1]) : headRole || 'Instructor';
          const name = cells.map((c) => (c === rc ? '' : nameFrom(c))).find(Boolean) || '';
          const p = start(role, name);
          if (em) p.email = EMAIL.exec(em)[0];
          cells.forEach((c) => {
            if (c !== rc && c !== em && (timeRanges(c).length || /appointment|zoom/i.test(c))) p.text += ' ' + c;
            else if (c !== rc && c !== em && /\b(hall|tower|room|building|bldg)\b/i.test(c) && !p.office) p.office = c;
          });
          continue;
        }
      }
      const parts = fields(x);
      const hasRoleLabel = parts.some((f) => f.kind === 'role');
      // a list of people under a heading: "Alex Kim – kim.2@osu.edu – Tue 3-4pm"
      if (!hasRoleLabel && headRole && (b.t === 'li' || EMAIL.test(x)) && nameFrom(x) && (EMAIL.test(x) || timeRanges(x).length)) {
        const p = start(headRole, nameFrom(x));
        const e = EMAIL.exec(x);
        if (e) p.email = e[0];
        p.text += ' ' + x;
        continue;
      }
      for (const f of parts) {
        if (f.kind === 'role') {
          const role = roleName(f.label);
          const name = nameFrom(f.value);
          // "Instructor: TBA" or a sentence ("instructor - see below") still starts a person if there is an email or a name
          if (name || EMAIL.test(f.value.slice(0, 80))) {
            const p = start(role, name);
            absorb(p, 'text', f.value.slice(0, 160));
          } else if (/^(?:s\)?\s*)?$/.test(f.value) || f.value.length < 3) {
            headRole = role; // "Teaching Assistants:" followed by a list
            inContact = true;
          }
          continue;
        }
        if (f.kind === 'field') {
          if (f.label === 'name' && headRole && (!cur || cur.name)) start(headRole, nameFrom(f.value));
          const target = cur && (inContact || people.length) ? cur : null;
          if (target) absorb(target, f.label, f.value);
          else if (/hours/.test(f.label)) general.text += ' ' + f.value;
          continue;
        }
        // plain text
        const v = f.value;
        if (/\bcourse (account|e-?mail|inbox|mailbox)\b/i.test(v)) continue; // about a shared course inbox, not a person
        if (inContact && headRole && !cur && nameFrom(v) && v.length < 60) {
          start(headRole, nameFrom(v));
          continue;
        }
        if (inContact && cur && !cur.name && nameFrom(v) && v.length < 60 && !EMAIL.test(v)) cur.name = nameFrom(v);
        const e = EMAIL.exec(v);
        if (e && inContact) {
          if (cur && !cur.email) cur.email = e[0];
          else if (!cur || cur.email !== e[0]) {
            const p = start(headRole || 'Instructor', nameFrom(v));
            p.email = e[0];
          }
        }
        if (/office hours|student hours|drop-?in hours/i.test(v)) {
          if (cur && inContact) cur.text += ' ' + v;
          else general.text += ' ' + v;
        } else if (inContact && cur && (timeRanges(v).length || /\bappointment\b|\b(respond|reply)\w*\b.*\bwithin\b/i.test(v))) cur.text += ' ' + v;
        else if (/\b(respond|reply)\w*\b[^.]{0,40}\bwithin\b/i.test(v)) general.text += ' ' + v;
      }
    }

    // "Office hours: MW 2-3pm" with nobody named nearby belongs to the instructor when there is just one
    const instructors = people.filter((p) => !isTA(p.role));
    if (general.text.trim()) {
      if (instructors.length === 1) instructors[0].text += ' ' + general.text;
      else if (!people.length) people.push(Object.assign(newPerson('Instructor', ''), { text: general.text }));
    }

    // merge duplicates (same email, or same name and role)
    const merged = [];
    for (const p of people) {
      const key = (q) => (q.email ? q.email.toLowerCase() : `${q.role}:${q.name.toLowerCase()}`);
      const lastName = (n) => (n.split(/\s+/).pop() || '').toLowerCase();
      const same = merged.find(
        (q) => (p.email && q.email && q.email.toLowerCase() === p.email.toLowerCase()) || (p.name && q.name && lastName(q.name) === lastName(p.name) && isTA(q.role) === isTA(p.role)) || (!p.name && !p.email && key(q) === key(p))
      );
      if (same) {
        same.name = same.name.length >= p.name.length ? same.name : p.name;
        same.email = same.email || p.email;
        same.office = same.office || p.office;
        same.phone = same.phone || p.phone;
        same.text += ' ' + p.text;
      } else merged.push(p);
    }

    // people from Carmen's People list that the syllabus doesn't mention
    for (const s of staff || []) {
      const role = s.role === 'ta' ? 'TA' : 'Instructor';
      const last = (s.name || '').split(/\s+/).pop().toLowerCase();
      const known = merged.find((q) => (s.email && q.email && q.email.toLowerCase() === s.email.toLowerCase()) || (last && q.name && q.name.toLowerCase().split(/\s+/).pop() === last));
      if (known) {
        if (!known.email && s.email) known.email = s.email;
        if (s.name && (!known.name || /^(dr|prof)/i.test(known.name)) && s.name.split(/\s+/).length > 1) known.full = s.name;
        known.inCarmen = true;
        continue;
      }
      // an unnamed "Instructor" from the syllabus gets the Carmen name
      const unnamed = merged.find((q) => !q.name && isTA(q.role) === (role === 'TA'));
      if (unnamed) {
        unnamed.name = s.name;
        unnamed.email = unnamed.email || s.email || '';
        unnamed.inCarmen = true;
        continue;
      }
      merged.push(Object.assign(newPerson(role, s.name), { email: s.email || '', fromCarmen: true }));
    }

    return merged
      .filter((p) => p.name || p.email || p.text.trim())
      .map((p) => {
        const text = clean(p.text);
        const slots = slotsOf(text);
        if (!p.office) {
          const pl = slots.find((s) => s.place && s.place !== 'Zoom / online');
          if (pl) p.office = pl.place;
        }
        return {
          role: p.role,
          name: p.full || p.name,
          email: p.email,
          phone: p.phone,
          office: p.office,
          hours: slots.map((s) => ({ days: s.days.map((d) => DAYS[d]), start: s.start, end: s.end, time: `${fmt(s.start)} – ${fmt(s.end)}`, place: s.place })),
          booking: bookingOf(text, slots.length > 0),
          reply: replyOf(text),
          fromCarmen: !!p.fromCarmen,
        };
      })
      .sort((a, b) => isTA(a.role) - isTA(b.role));
  }

  // "Mon & Wed", "Tue, Thu & Fri", "Mon – Fri"
  function daysText(days) {
    if (!days || !days.length) return 'Day not stated';
    const idx = days.map((d) => DAYS.indexOf(d));
    const run = idx.length >= 3 && idx.every((v, i) => !i || v === idx[i - 1] + 1);
    if (run) return `${days[0]} – ${days[days.length - 1]}`;
    return days.length === 1 ? days[0] : `${days.slice(0, -1).join(', ')} & ${days[days.length - 1]}`;
  }

  const BOOKING = {
    none: 'No appointment needed. Just drop in during office hours.',
    also: 'No appointment needed during office hours. Other times by appointment.',
    required: 'Appointment needed. Book or email ahead, even during office hours.',
    only: 'By appointment only. Email to set up a time.',
    unknown: 'The syllabus doesn’t say. Office hours are usually drop-in.',
  };

  const api = { parse, slotsOf, dayTokens, timeRanges, bookingOf, daysText, BOOKING, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Contacts = api;
})(typeof window !== 'undefined' ? window : globalThis);
