/* Syllabus summary made on this computer (no AI).
   Input: blocks [{ t: 'h' | 'li' | 'p', x: 'text' }] from the syllabus page, PDF or Word file.
   Output: the rules students must not miss, the grade breakdown, short policy sections,
   and the list of boilerplate sections that were left out.
   Key phrases are wrapped in **double asterisks**; the interface turns them into highlights. */
(function (root) {
  const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)';

  // Sections that are university boilerplate, the same in every syllabus.
  const BOILER = new RegExp(
    [
      'academic (mis)?conduct',
      'academic integrity',
      'plagiarism',
      'disabilit',
      'accessib',
      'accommodat',
      '\\bslds\\b',
      'mental health',
      'counsel',
      'title ix',
      'sexual (misconduct|harass)',
      'diversity',
      'inclusi',
      'equity',
      'religious',
      'copyright',
      'intellectual property',
      'weather',
      'emergenc',
      'health and safety',
      'covid',
      'land acknowledg',
      'grievance',
      'university polic',
      'student (life|services|resources|support)',
      'wellness',
      'basic needs',
      'technology (requirements|support|skills)',
      'tech(nical)? support',
      'carmen(canvas)? (access|help|support)',
      'self-service',
      'necessary (software|equipment)',
      'baseline technical',
      'general education',
      '\\bge\\b',
      'learning outcomes',
      'expected learning',
      '\\belos?\\b',
      'goals and outcomes',
      'instructional modality',
      'mode of delivery',
      'credit hours?',
      'time commitment',
      'privacy',
      'ferpa',
      'recording of',
      'content warning',
      'trigger warning',
      'artificial intelligence',
      'generative ai',
      'use of ai',
    ].join('|'),
    'i'
  );
  const BOILER_SENTENCE =
    /committee on academic misconduct|student life disability services|title ix|counseling and consultation|988|suicide|ombuds|religious accommodation|sexual misconduct|faculty rule 3335|disability services|accessibility services|osu wellness/i;

  const CATS = [
    { key: 'late', title: 'Late work and make-ups', head: /\blate\b|make-?up|missed|extension|deadline/i, sent: /\blate\b|make-?up|extension|\bmissed\b/i },
    { key: 'attendance', title: 'Attendance', head: /attendance|absen|class participation|^participation/i, sent: /attendance|absen/i },
    { key: 'exams', title: 'Exams', head: /exam|midterm|\bfinal\b|test/i, sent: /\b(exam|midterm|final exam|test)s?\b/i },
    { key: 'materials', title: 'Materials to get', head: /textbook|materials|required (text|book)|\bbooks?\b|supplies|software|calculator|access code/i, sent: /textbook|access code|calculator|\bclicker|tophat|top hat|lab coat|goggles|required (text|book)|isbn/i },
    { key: 'contact', title: 'Contact and office hours', head: /instructor|contact|office hours|teaching assistant|\bta\b|communication/i, sent: /office hours|email|\b(reply|respond) within\b/i },
  ];
  const GRADING_HEAD = /grad(e|ing)|evaluation|assessment|breakdown|weights?|points/i;

  // Rules that mean less work than it looks ("less"), and rules that can cost a lot ("risk").
  const RULES = [
    { g: 'drop', kind: 'less', w: 5, re: new RegExp(`\\b(lowest|worst)\\b[^.;,]{0,60}?\\b(drop(ped|s)?|not (be )?count(ed)?|won'?t count|will not count|excluded|removed|replaced)\\b`, 'i') },
    { g: 'drop', kind: 'less', w: 5, re: new RegExp(`\\bdrop(s|ped|ping)?\\b[^.;,]{0,30}?\\b(your |the )?(${NUM} )?(lowest|worst)\\b[^.;,]{0,30}`, 'i') },
    { g: 'best', kind: 'less', w: 5, re: new RegExp(`\\b(best|top|highest) ${NUM}\\b[^.;,]{0,30}?\\b(of|out of) (the |your )?${NUM}\\b[^.;,]{0,25}`, 'i') },
    { g: 'only', kind: 'less', w: 5, re: new RegExp(`\\b(complete|submit|do|attend|write|post)\\s+(any |at least |only )?${NUM}\\s+(of|out of)\\s+(the |your )?${NUM}\\b[^.;,]{0,30}`, 'i') },
    { g: 'only', kind: 'less', w: 5, re: /\b(only|just) (need|have|are required|required) to\b[^.;,]{0,60}/i },
    { g: 'any', kind: 'less', w: 4, re: new RegExp(`\\bany ${NUM} of the\\b[^.;,]{0,40}`, 'i') },
    { g: 'replace', kind: 'less', w: 4, re: /\breplaces?\b[^.;,]{0,50}?\b(lowest|exam|midterm|quiz|score)\b[^.;,]{0,20}|\b(lowest|exam|midterm) (score )?(will be |is )?replaced\b[^.;,]{0,40}/i },
    { g: 'grace', kind: 'less', w: 4, re: /\b(free|grace|no[- ]questions[- ]asked)\s+(late\s+)?(days?|period|extensions?|passes?|tokens?)\b|\b(\d+|one|two|three)[- ](hour|day)\s+(no[- ]questions[- ]asked\s+)?extensions?\b|\blate (days?|tokens?|passes?|coupons?)\b/i },
    { g: 'optional', kind: 'less', w: 4, re: /\b(final( exam)?|exams?|quiz(zes)?|assignments?|homework|labs?|readings?|attendance|projects?|papers?|essays?|work|posts?)\b[^.;,]{0,30}?\b(is|are) (optional|not required)\b[^.;,]{0,40}|\boptional\b[^.;,]{0,20}?\b(final|exam|quiz|assignment|homework|lab|extra|bonus)\w*/i },
    { g: 'extra', kind: 'less', w: 3, re: /\bextra credit\b[^.;,]{0,40}|\bbonus (points?|credit)\b/i },
    { g: 'exempt', kind: 'less', w: 3, re: /\bexempt(ed)? from\b[^.;,]{0,40}/i },
    { g: 'curve', kind: 'less', w: 2, re: /\b(grades?|scores?|exams?|course|final|class)\b[^.;,]{0,30}?\b(will be |may be |are |is )?curved\b|\bcurve (the |all |final |exam |course )?(grades?|scores?|exams?)\b|\bon a curve\b/i },
    { g: 'fail', kind: 'risk', w: 5, re: /\b(automatic(ally)?\s+)?(fail|failing grade|E)\b[^.;,]{0,15}\b(the|this) (course|class)\b|\b(automatic|an automatic) (E|F|failure)\b|\bwill (receive|earn|get) (an? )?(E|F|zero|0)\b[^.;,]{0,30}/i },
    { g: 'must', kind: 'risk', w: 5, re: /\bmust (pass|complete|attend|submit|achieve|earn|be present)\b[^.;,]{0,60}|\b(required|mandatory) (in order )?to pass\b[^.;,]{0,30}|\bto pass (the|this) (course|class)\b/i },
    { g: 'makeup', kind: 'risk', w: 4, re: /\bcan(not|'t|no) be made up\b[^.;,]{0,30}|\bno make-?ups?\b[^.;,]{0,40}|\bmake-?ups?\b[^.;,]{0,40}?\b(not|only|won'?t|will not)\b[^.;,]{0,30}/i },
    { g: 'late', kind: 'risk', w: 4, re: /\blate\b[^.;,]{0,60}?\b(not (be )?accepted|no credit|receive (a )?zero|zero|penal\w*|deduct\w*|lose|loses)\b[^.;,]{0,40}/i },
    { g: 'absence', kind: 'risk', w: 4, re: new RegExp(`\\b(more than|over|exceed(ing|s)?|after)\\s+${NUM}\\s+(unexcused\\s+)?absences?\\b[^.;,]{0,50}`, 'i') },
    { g: 'attendance', kind: 'risk', w: 3, re: /\b(each|every) (unexcused )?absence\b[^.;,]{0,50}|\battendance\b[^.;,]{0,40}?\b(\d+\s?%|percent|is graded|counts|required|mandatory)\b/i },
    { g: 'minimum', kind: 'risk', w: 3, re: /\bminimum\b[^.;,]{0,30}?\b(grade|score|%)\b[^.;,]{0,30}/i },
    { g: 'cumulative', kind: 'risk', w: 2, re: /\b(cumulative|comprehensive) final\b[^.;,]{0,30}/i },
  ];

  const GRADE_SCALE = /^\s*[A-E][+-]?\s*(:|=|\||\s)\s*\d{2}/;

  const VERB = /\b(is|are|was|were|be|been|will|won'?t|must|can|cannot|can't|may|should|need|needs|have|has|get|gets|count|counts|drop|drops|dropped|lose|loses|receive|accept|accepted|allow|allowed|require|requires|required|replace|replaces|take|submit|complete|attend|give|given|offer|offered|provide|provided|apply|applies)\b/i;
  const DAYS = '(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?';
  const MONTHS = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  const SCHEDULE_LINE = new RegExp(
    [
      '^\\s*\\(?\\d{1,2}\\)?\\s*[(.:-]?\\s*\\(?' + DAYS,         // "15 (Tues.) Exam 4"
      '^\\s*(week|wk|day|class|lecture|session|module|unit)\\s*\\d+',
      '^\\s*' + DAYS + ',?\\s+(\\d|' + MONTHS + ')',            // "Tue, Oct 14 ..."
      '^\\s*' + MONTHS + '\\s+\\d{1,2}\\b',                   // "Oct 14 ..."
      '^\\s*\\d{1,2}/\\d{1,2}\\b',                            // "10/14 ..."
      '^\\s*\\d{1,2}[A-Z][a-z]',                                // "9Approximating" (calendar cells run together)
    ].join('|'),
    'i'
  );

  // Table rows, calendar lines and fragments are not rules a student needs to read.
  function isJunk(s) {
    if (s.includes(' | ')) return true;
    if (SCHEDULE_LINE.test(s)) return true;
    if (!VERB.test(s)) return true;
    if ((s.match(/[A-Z]{3,}\)/g) || []).length >= 2) return true; // lots of "(ATAUAC)" style codes
    return false;
  }

  const STOP = new Set('the a an and or of to in on for with your you is are be will this that if at by from as it its all any only not no can may must there their they them which what when each every also more than have has been were was our we us about after before into over under per one two three four five'.split(' '));
  const content = (s) => new Set(String(s).toLowerCase().replace(/\*\*/g, '').match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) || []);
  function similar(a, b) {
    const A = content(a);
    const B = content(b);
    if (!A.size || !B.size) return false;
    let inter = 0;
    A.forEach((w) => B.has(w) && inter++);
    const union = A.size + B.size - inter;
    return inter / union >= 0.5 || (Math.min(A.size, B.size) >= 3 && inter / Math.min(A.size, B.size) >= 0.8);
  }
  const NOUNS = ['final', 'midterm', 'exam', 'quiz', 'homework', 'lab', 'reflection', 'discussion', 'post', 'attendance', 'absence', 'extension', 'extra credit', 'participation', 'project', 'paper', 'essay', 'assignment', 'reading'];
  const nounOf = (s) => NOUNS.find((n) => new RegExp(`\\b${n}`, 'i').test(s)) || '';

  // Join a sentence that runs on into the next lines ("... the first 3 exams AND" + bullets).
  function joinContinued(blocks) {
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const x = clean(b.x);
      if (b.t !== 'h' && x.length > 30 && /(\b(and|or|if|unless|including|when|that|to|the|of)|[:,])\s*$/i.test(x) && i + 1 < blocks.length && blocks[i + 1].t !== 'h') {
        let joined = x.replace(/:$/, '');
        let j = i + 1;
        const parts = [];
        const listMode = blocks[i + 1].t === 'li';
        while (j < blocks.length && blocks[j].t !== 'h' && parts.length < 4) {
          if (listMode && blocks[j].t !== 'li') break; // the bullet list ended
          parts.push(clean(blocks[j].x).replace(/[.;]$/, ''));
          j++;
          if (!listMode) break;
        }
        joined = /:$/.test(x) || blocks[i + 1].t === 'li' ? `${joined} ${parts.join('; ')}.` : `${joined} ${parts.join(' ')}`;
        out.push({ t: b.t, x: joined });
        i = j - 1;
      } else out.push(b);
    }
    return out;
  }

  function clean(t) {
    return String(t || '')
      .replace(/\s+/g, ' ')
      .replace(/\*\*/g, '*')
      .trim();
  }

  function sentencesOf(block) {
    const x = clean(block.x);
    if (block.t === 'li' || x.includes(' | ')) return [x];
    const parts = x
      .split(/(?<=[^.\s][.!?])\s+(?=[A-Z0-9("“'])/) // not after "....." leaders
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    // keep very short follow-up sentences ("Just email me first.") with the sentence before
    const out = [];
    for (const p of parts) {
      // ...unless the short sentence is a rule of its own ("Late work is not accepted.")
      if (out.length && p.length < 36 && !/\d\s?%\s*$/.test(p) && !RULES.some((r) => r.re.test(p))) out[out.length - 1] += ' ' + p;
      else out.push(p);
    }
    return out;
  }

  function shorten(s, at, len) {
    if (s.length <= 260) return s;
    const start = Math.max(0, at - 90);
    const end = Math.min(s.length, at + len + 120);
    return (start > 0 ? '…' : '') + s.slice(start, end).trim() + (end < s.length ? '…' : '');
  }

  // Bold a span, widened to whole words, with surrounding spaces kept outside the markers.
  function bold(s, start, len) {
    let a = start;
    let b = start + len;
    while (a > 0 && /[A-Za-z0-9'’-]/.test(s[a - 1])) a--;
    while (b < s.length && /[A-Za-z0-9'’%-]/.test(s[b])) b++;
    while (b > a && /[\s,;:]/.test(s[b - 1])) b--;
    while (a < b && /\s/.test(s[a])) a++;
    const tail = /(\s+(and|or|but|the|a|an|to|of|for|with|because|which|that))+$/i.exec(s.slice(a, b));
    if (tail) b -= tail[0].length;
    while (b > a && /[\s,;:]/.test(s[b - 1])) b--;
    return `${s.slice(0, a)}**${s.slice(a, b)}**${s.slice(b)}`;
  }

  // Highlight numbers that matter in an ordinary sentence: dates, times, counts, percentages.
  const KEY_BITS = new RegExp(
    [
      '\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.? \\d{1,2}\\b',
      '\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.? \\d{1,2}(st|nd|rd|th)?\\b',
      '\\b\\d{1,2}/\\d{1,2}\\b',
      '\\b\\d{1,2}(:\\d{2})?\\s?(am|pm|a\\.m\\.|p\\.m\\.)',
      '\\bweek \\d{1,2}\\b',
      `\\b${NUM} (business )?(days?|hours?|absences?|times?)\\b`,
      '\\b\\d{1,3}(\\.\\d+)?\\s?%( per day)?',
      '\\bwithin \\d+ (hours?|days?)\\b',
    ].join('|'),
    'gi'
  );

  function markBits(s) {
    let n = 0;
    return s.replace(KEY_BITS, (m) => (n++ < 2 ? `**${m}**` : m));
  }

  function words(blocks) {
    return blocks.reduce((n, b) => n + (b.x.match(/\S+/g) || []).length, 0);
  }

  function sectionize(blocks) {
    const sections = [];
    let cur = { title: '', blocks: [] };
    for (const b of blocks) {
      if (b.t === 'h') {
        if (cur.title || cur.blocks.length) sections.push(cur);
        cur = { title: clean(b.x).replace(/[:.]$/, ''), blocks: [] };
      } else cur.blocks.push(b);
    }
    if (cur.title || cur.blocks.length) sections.push(cur);
    return sections;
  }

  function parseGrading(sentences) {
    const items = [];
    const seen = new Set();
    for (const s0 of sentences) {
      if (s0.length > 160 || GRADE_SCALE.test(s0)) continue;
      // "Homework | 20%", "Homework ........ 20%", "Homework (20%)", "Homework: 20%", "Exams (3) 50%"
      const parts = s0.split(/;|,(?=\s*[A-Z][a-z])/);
      for (const part of parts) {
        // the row must end in a percentage: "Homework | 20%", "Homework ..... 20%", "Exams (3 x 20%): 60%"
        const m = /^\s*[-•*]?\s*([A-Za-z][^%]{0,70}?|[A-Za-z].{0,70}?%\)?)\s*(?:\||:|–|—|-|\.{2,}|\(|=)?\s*(\d{1,3}(?:\.\d+)?)\s?%\s*\)?\s*(?:\|[^%]*)?$/.exec(part);
        if (!m) continue;
        let label = m[1].replace(/[\s(.|:–—=-]+$/, '').replace(/^(the|your)\s+/i, '').trim();
        const w = parseFloat(m[2]);
        if (!label || w <= 0 || w > 100) continue;
        if (/\b(late|per day|penalt|deduct|lose|discount|curve|attendance policy|total|final grade|course grade|grade)\s*$/i.test(label)) continue;
        if (/\b(late|penalt|deduct|lose|minimum|at least|above|below|grade of|this is|worth)\b/i.test(label) || label.split(' ').length > 8) continue;
        if (/^[A-E][+-]?$/.test(label)) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ item: label.charAt(0).toUpperCase() + label.slice(1), weight: w });
      }
    }
    return items;
  }

  function summarize(blocks) {
    blocks = joinContinued((blocks || []).filter((b) => b && b.x && clean(b.x)));
    const sections = sectionize(blocks);
    const skipped = [];
    const kept = [];
    for (const sec of sections) {
      if (sec.title && BOILER.test(sec.title)) {
        if (!skipped.some((x) => x.toLowerCase() === sec.title.toLowerCase())) skipped.push(sec.title.slice(0, 60));
        continue;
      }
      const sents = [];
      sec.blocks.forEach((b) => sentencesOf(b).forEach((s) => sents.push(s)));
      const good = sents.filter((s) => !BOILER_SENTENCE.test(s));
      if (sents.length && good.length < sents.length / 2 && !sec.title) {
        if (!skipped.includes('University policy statements')) skipped.push('University policy statements');
        continue;
      }
      kept.push({ title: sec.title, sentences: good });
    }

    // ----- don't miss -----
    const found = [];
    for (const sec of kept) {
      for (const s0 of sec.sentences) {
        const s = s0.replace(/^\s*([-•*]|\(?[0-9a-h]{1,2}[.)])\s+/, '');
        if (GRADE_SCALE.test(s) || s.length < 20 || isJunk(s)) continue;
        let best = null;
        let score = 0;
        const kinds = { less: 0, risk: 0 };
        for (const r of RULES) {
          const m = r.re.exec(s);
          if (!m) continue;
          score += r.w;
          kinds[r.kind] += r.w;
          if (!best || r.w > best.w || (r.w === best.w && m.index < best.m.index)) best = { w: r.w, g: r.g, m };
        }
        if (!best) continue;
        if (/\d/.test(s)) score += 1;
        if (/[.!]$/.test(s) && s.length >= 30 && s.length <= 220) score += 1; // a proper sentence reads better
        const kind = kinds.less >= kinds.risk ? 'less' : 'risk';
        const at = best.m.index;
        const text = bold(s, at, best.m[0].length);
        found.push({ kind, score, group: `${best.g}:${nounOf(s)}`, text: shorten(text, at, best.m[0].length + 4), raw: s0 });
      }
    }
    found.sort((a, b) => b.score - a.score || a.raw.length - b.raw.length);
    // one entry per rule: the same rule repeated in the schedule, the policy section and the FAQ counts once
    const dontMiss = [];
    for (const f of found) {
      const dup = dontMiss.find((d) => d.group === f.group || similar(d.raw, f.raw));
      if (dup) {
        dup.repeats = (dup.repeats || 1) + 1;
        continue;
      }
      dontMiss.push(f);
      if (dontMiss.length >= 6) break;
    }
    // "less work" rules first, then risks
    dontMiss.sort((a, b) => (a.kind === b.kind ? b.score - a.score : a.kind === 'less' ? -1 : 1));
    const used = new Set(found.map((d) => d.raw));

    // ----- grading -----
    const gradingSecs = kept.filter((s) => GRADING_HEAD.test(s.title));
    let grading = parseGrading(gradingSecs.flatMap((s) => s.sentences));
    const sumOf = (g) => g.reduce((n, x) => n + x.weight, 0);
    if (Math.abs(sumOf(grading) - 100) > 12) {
      const all = parseGrading(kept.flatMap((s) => s.sentences));
      if (Math.abs(sumOf(all) - 100) < Math.abs(sumOf(grading) - 100)) grading = all;
    }
    grading = grading.slice(0, 10);

    // ----- short sections -----
    const out = [];
    for (const cat of CATS) {
      const picks = [];
      const fromHead = kept.filter((s) => cat.head.test(s.title)).flatMap((s) => s.sentences);
      const fromAll = kept.flatMap((s) => s.sentences).filter((s) => cat.sent.test(s));
      for (const s of fromHead.concat(fromAll)) {
        if (picks.length >= 3) break;
        if (used.has(s) || s.length < 20 || s.length > 400 || GRADE_SCALE.test(s) || isJunk(s)) continue;
        if (picks.some((p) => similar(p.raw, s))) continue;
        if (/^[^.]{1,80}\d{1,3}(\.\d+)?\s?%\s*\)?\s*$/.test(s)) continue; // a grade row, already in the table
        if (picks.some((p) => p.raw === s)) continue;
        picks.push({ raw: s, text: markBits(s.length > 280 ? s.slice(0, 277) + '…' : s) });
        used.add(s);
      }
      if (picks.length) out.push({ title: cat.title, points: picks.map((p) => p.text) });
    }

    const total = words(blocks);
    const shown =
      dontMiss.reduce((n, d) => n + d.text.split(/\s+/).length, 0) +
      out.reduce((n, s) => n + s.points.join(' ').split(/\s+/).length, 0) +
      grading.length * 3;
    return {
      dontMiss: dontMiss.map((d) => ({ kind: d.kind, text: d.text, repeats: d.repeats || 1, rule: d.group.split(':')[0] })),
      grading: grading.map((g) => ({ item: g.item, weight: `${+g.weight.toFixed(2)}%`, value: g.weight })),
      gradingTotal: grading.length ? +sumOf(grading).toFixed(2) : 0,
      sections: out,
      skipped: skipped.slice(0, 14),
      words: total,
      minutesSaved: Math.max(0, Math.round((total - shown) / 230)),
      empty: total < 40,
    };
  }

  const api = { summarize, sectionize, isJunk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Syllabus = api;
})(typeof window !== 'undefined' ? window : globalThis);
