/* One course: the syllabus summary. Uses helpers shared by app.js (window.CP). */
(function () {
  const CP = window.CP;
  const { api, esc, store, toast, state } = CP;
  const $ = (id) => document.getElementById(id);

  const memo = {}; // sample-course content, kept in memory
  const loading = new Set();
  const failed = new Set();

  const course = () => ((state.data && state.data.courses) || []).find((c) => c.id === state.courseId);
  const key = (kind, id) => `${kind}.${state.mode}.${id}`;
  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/\*\*/g, '');
  const words = (blocks) => (blocks || []).reduce((n, b) => n + (String(b.x).match(/\S+/g) || []).length, 0);
  const nf = (n) => Number(n).toLocaleString('en-US');

  /* ---------- content ---------- */
  function getContent(id) {
    if (state.mode === 'demo') return memo[id] || (memo[id] = window.Demo.courseContent(id));
    return store.get(key('content2', id), null); // content2: re-read after the syllabus-file fix
  }

  async function loadContent(id) {
    if (state.mode === 'demo') {
      memo[id] = window.Demo.courseContent(id);
      return memo[id];
    }
    if (loading.has(id)) return null;
    loading.add(id);
    CP.busy('Reading this course from Carmen…');
    const off = api.onProgress((m) => ($('busy-text').textContent = m));
    let res;
    try {
      res = await api.courseContent(id);
    } finally {
      off();
    }
    if (!res || !res.ok) {
      CP.idle();
      loading.delete(id);
      if (res && res.auth) {
        toast(res.error);
        await CP.signInAndSync();
      } else toast((res && res.error) || 'Could not read this course.');
      return null;
    }
    const data = res.data;
    const old = store.get(key('content2', id), null);
    if (old && old.extraSyllabus) data.extraSyllabus = old.extraSyllabus; // parts the student added stay
    const f = data.syllabusFile;
    if (f && f.bytes) {
      $('busy-text').textContent = `Reading ${f.name}…`;
      try {
        f.blocks = f.kind === 'docx' ? await window.PdfText.extractDocx(f.bytes) : await window.PdfText.extract(f.bytes);
        if (!f.blocks.length) f.noText = true;
      } catch {
        f.failed = true;
      }
      delete f.bytes;
    }
    store.set(key('content2', id), data);
    CP.idle();
    loading.delete(id);
    return data;
  }

  function syllabusBlocks(content) {
    const page = (content && content.syllabus && content.syllabus.blocks) || [];
    const file = (content && content.syllabusFile && content.syllabusFile.blocks) || [];
    // a short Syllabus page often holds just the contact details, so it is kept next to the file
    const extra = ((content && content.extraSyllabus) || []).flatMap((e) => [{ t: 'h', x: e.title }].concat(e.blocks || []));
    return page.concat(file, extra);
  }

  /* ---------- page ---------- */
  function render() {
    const c = course();
    if (!c) {
      state.view = 'week';
      CP.rerender();
      return;
    }
    $('course-title').textContent = c.code;
    $('course-name').textContent = c.name && c.name !== c.code ? c.name : '';
    $('course-sw').style.background = CP.colorOf(c.id);
    const demo = state.mode === 'demo';
    $('course-refresh').hidden = demo;
    const content = getContent(c.id);
    $('course-updated').textContent = content && !demo ? `Read ${CP.fmtShort(new Date(content.fetchedAt))}` : demo ? 'Sample course' : '';

    const body = $('course-body');
    if (!content) {
      if (loading.has(c.id)) {
        body.innerHTML = `<div class="card empty-card"><p>Reading ${esc(c.code)} from Carmen…</p></div>`;
        return;
      }
      if (failed.has(c.id)) {
        body.innerHTML = `<div class="card empty-card"><p>Carmen Planner couldn’t read this course yet.</p>
          <button class="btn primary" data-act="course-load">Try again</button></div>`;
        return;
      }
      body.innerHTML = `<div class="card empty-card"><p>Reading ${esc(c.code)} from Carmen…</p></div>`;
      loadContent(c.id).then((d) => {
        if (!d) failed.add(c.id);
        if (state.view === 'course' && state.courseId === c.id) render();
      });
      return;
    }
    renderSyllabus(c, content, body);
  }

  /* ---------- syllabus summary ---------- */
  function renderSyllabus(c, content, body) {
    const blocks = syllabusBlocks(content);
    const f = content.syllabusFile;
    const fileNote = f && !(f.blocks && f.blocks.length)
      ? f.unsupported
        ? `The syllabus file “${esc(f.name)}” is a type the app can’t read. Only PDF and Word files are supported.`
        : f.tooBig
          ? `The syllabus file “${esc(f.name)}” is too large to read.`
          : f.noText
            ? `“${esc(f.name)}” looks like a scanned image, so there is no text to read.`
            : `The app couldn’t read “${esc(f.name)}”.`
      : '';

    if (words(blocks) < 40) {
      body.innerHTML = `<div class="card empty-card">
        <h3>No syllabus text found</h3>
        <p>${fileNote || 'This course has no text on its Syllabus page and no file named “syllabus” in its modules.'}</p>
        <div class="row-actions">${openLinks(content, true)}</div>${addSyllabusPicker(content)}</div>${(content.staff && content.staff.length) || words(blocks) ? peopleCard(content, blocks) : ''}`;
      return;
    }
    const sum = window.Syllabus.summarize(blocks);
    const less = sum.dontMiss.filter((d) => d.kind === 'less');
    const risk = sum.dontMiss.filter((d) => d.kind === 'risk');
    const n = words(blocks);
    const madeBy = `<span class="made-by"><b>Made on this computer</b> from a ${nf(n)}-word syllabus${sum.skipped.length ? `, ${sum.skipped.length} standard ${sum.skipped.length === 1 ? 'statement' : 'statements'} left out` : ''}</span>`;

    const group = (items, cls, label) =>
      items.length
        ? `<div class="dm-group"><div class="dm-label ${cls}">${label}</div><ul class="dm-list">${items
            .map((d) => `<li>${md(d.text)}${d.repeats > 1 ? `<span class="rep">The syllabus says this ${d.repeats} times</span>` : ''}</li>`)
            .join('')}</ul></div>`
        : '';
    const dontMiss = `<section class="dont-miss" aria-labelledby="dm-title">
        <div class="dont-miss-head"><h2 id="dm-title">Don’t miss</h2><span class="hint">Rules from the syllabus most people never read</span></div>
        ${group(less, 'less', 'You don’t have to do everything')}
        ${group(risk, 'risk', 'Watch out')}
        ${!sum.dontMiss.length ? (n < 400 && state.mode !== 'demo'
          ? `<p class="dm-none">This syllabus is only ${nf(n)} words, so it is probably not the whole thing: grading and policies are missing. The full syllabus is often a PDF in the first module or in Files. Pick it under <b>Read from</b> and click <b>Add</b>.</p>`
          : '<p class="dm-none">No special rules about dropped scores, required work or late penalties were found. Skim the full syllabus to be sure.</p>') : ''}
      </section>`;

    const otherSecs = sum.sections.filter((x) => x.title !== 'Contact and office hours');
    const secs = otherSecs.length
      ? `<div class="sec-grid">${otherSecs
          .map((s) => `<div class="card sec"><h3>${esc(s.title)}</h3><ul>${s.points.map((p) => `<li>${md(p)}</li>`).join('')}</ul></div>`)
          .join('')}</div>`
      : '';

    const max = Math.max(1, ...sum.grading.map((g) => g.value || 0));
    const grading = sum.grading.length
      ? `<div class="card"><h3>How your grade is made</h3>${sum.grading
          .map(
            (g) => `<div class="grade-row"><span>${esc(g.item)}</span><b>${esc(g.weight)}</b>
              <div class="grade-bar" aria-hidden="true"><span style="width:${Math.round(((g.value || 0) / max) * 100)}%"></span></div>
              ${g.note ? `<span class="grade-note">${md(g.note)}</span>` : ''}</div>`
          )
          .join('')}${sum.gradingTotal && Math.abs(sum.gradingTotal - 100) > 0.5 ? `<p class="grade-total">These add up to ${sum.gradingTotal}%. Check the syllabus for the rest.</p>` : ''}</div>`
      : '';

    const skipped = sum.skipped.length
      ? `<div class="card"><h3>Left out</h3><p class="card-sub">Standard university statements. Worth reading once, but they’re the same in every course.</p>
          <div class="chips">${sum.skipped.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>`
      : '';

    const source = `<div class="card"><h3>Read from</h3><div class="side-links">${sourceList(content)}${openLinks(content)}</div>${addSyllabusPicker(content)}
      ${fileNote ? `<p class="card-sub" style="margin:10px 0 0">${fileNote}</p>` : ''}</div>`;

    body.innerHTML = `<div class="source-row">${madeBy}</div>
      <div class="syl"><div class="syl-main">${dontMiss}${peopleCard(content, blocks)}${secs}</div><div class="syl-side">${grading}${skipped}${source}</div></div>`;
  }

  /* ---------- contact and office hours ---------- */
  function peopleCard(content, blocks) {
    const C = window.Contacts;
    const people = C.parse(blocks, content.staff);
    const peopleLink = content.peopleUrl && state.mode !== 'demo' ? `<button class="link" data-url="${esc(content.peopleUrl)}">Open People in Carmen</button>` : '';
    if (!people.length) {
      return `<section class="card people-card"><h3>Contact and office hours</h3>
        <p class="card-sub">The syllabus doesn’t list names, emails or office hours${content.staff ? ', and Carmen’s People list shows no instructor' : ''}. Check the course home page or announcements.</p>
        <div class="row-actions">${peopleLink}</div></section>`;
    }
    const row = (k, v) => `<div class="p-row"><span class="p-k">${k}</span><span class="p-v">${v}</span></div>`;
    const cards = people
      .map((p) => {
        const ta = p.role !== 'Instructor' && p.role !== 'Course coordinator';
        const email = p.email
          ? `<button class="link p-mail" data-url="mailto:${esc(p.email)}" title="Write an email">${esc(p.email)}</button>`
          : '<span class="hint">Not in the syllabus. Message them in Carmen Inbox.</span>';
        const hours = p.hours.length
          ? p.hours
              .map((h) => `<span class="p-slot"><b>${esc(window.Contacts.daysText(h.days))}</b> ${esc(h.time)}${h.place ? ` <span class="p-place">· ${esc(h.place)}</span>` : ''}</span>`)
              .join('')
          : `<span class="hint">${p.booking === 'only' ? 'No regular hours. By appointment.' : 'Not listed in the syllabus.'}</span>`;
        const officeExtra = p.office && !p.hours.some((h) => h.place === p.office) ? row('Office', esc(p.office)) : '';
        const booking = p.booking ? row('Appointment', esc(window.Contacts.BOOKING[p.booking])) : '';
        return `<div class="person${ta ? ' ta' : ''}">
          <div class="p-top"><span class="p-role">${esc(p.role)}</span><b class="p-name">${esc(p.name || (ta ? 'TA' : 'Instructor'))}</b>${p.fromCarmen ? '<span class="p-src">from Carmen’s People list</span>' : ''}</div>
          ${row('Email', email)}${row('Office hours', hours)}${officeExtra}${booking}${p.reply ? row('Email replies', esc(p.reply)) : ''}
        </div>`;
      })
      .join('');
    // the week at a glance: which days someone holds office hours
    const byDay = {};
    people.forEach((p) =>
      p.hours.forEach((h) =>
        h.days.forEach((d) => (byDay[d] = byDay[d] || []).push({ who: (p.name || p.role).replace(/^(Dr|Prof|Professor)\.?\s+/, ''), role: p.role, time: h.time, start: h.start, book: p.booking === 'required' }))
      )
    );
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter((d) => byDay[d]);
    const week = order.length
      ? `<div class="p-week" aria-label="Weekly office hours by day">${order
          .map(
            (d) => `<div class="p-day"><b>${d}</b>${byDay[d]
              .sort((a, b) => a.start - b.start)
              .map((x) => `<span>${esc(x.time)}<small>${esc(x.who)}${x.role !== 'Instructor' ? ` (${esc(x.role)})` : ''}${x.book ? ' · book first' : ''}</small></span>`)
              .join('')}</div>`
          )
          .join('')}</div>`
      : '';
    const note =
      state.mode !== 'demo' && !content.staff
        ? '<p class="card-sub">Use “Refresh this course” to also check the People list in Carmen for TAs the syllabus leaves out.</p>'
        : '';
    return `<section class="card people-card"><div class="people-head"><h3>Contact and office hours</h3>${peopleLink}</div>
      ${week}<div class="people">${cards}</div>${note}</section>`;
  }

  function sourceList(content) {
    if (state.mode === 'demo') return '<span class="hint">A sample syllabus</span>';
    const parts = [];
    if (words(content.syllabus && content.syllabus.blocks) >= 20) parts.push('<li>The Syllabus page</li>');
    (content.syllabusPages || []).forEach((p) => parts.push(`<li>${esc(p.title)}</li>`));
    const f = content.syllabusFile;
    if (f && f.blocks && f.blocks.length) parts.push(`<li>${esc(f.name)}</li>`);
    (content.extraSyllabus || []).forEach((e, i) => parts.push(`<li>${esc(e.title)} <button class="link small" data-act="syl-remove" data-i="${i}">Remove</button></li>`));
    return parts.length ? `<ul class="src-list">${parts.join('')}</ul>` : '<span class="hint">Nothing yet</span>';
  }

  // Files and pages in this course that could hold the rest of the syllabus
  function syllabusCandidates(content) {
    const have = new Set([].concat((content.extraSyllabus || []).map((e) => e.key), (content.syllabusPages || []).map((p) => 'page:' + p.title), content.syllabusFile ? ['name:' + content.syllabusFile.name] : []));
    const out = [];
    for (const m of content.modules || []) {
      for (const it of m.items || []) {
        if (!((it.type === 'File' && it.contentId) || (it.type === 'Page' && it.pageUrl))) continue;
        const k = it.type === 'Page' ? 'page:' + it.title : 'file:' + it.contentId;
        if (have.has(k) || have.has('name:' + it.title) || out.some((o) => o.key === k)) continue;
        out.push({ key: k, label: `${it.title} (${m.name})`, item: { type: it.type, title: it.title, pageUrl: it.pageUrl, contentId: it.contentId } });
      }
    }
    for (const f of content.files || []) {
      const k = 'file:' + f.id;
      if (!/\.(pdf|docx)$/i.test(f.name) || have.has(k) || have.has('name:' + f.name) || out.some((o) => o.key === k)) continue;
      out.push({ key: k, label: `${f.name} (Files)`, item: { type: 'File', title: f.name, contentId: f.id } });
    }
    // likely ones first
    const likely = (o) => (/syllabus|course (information|info|polic|guide|overview)|grading|polic/i.test(o.label) ? 0 : 1);
    return out.sort((a, b) => likely(a) - likely(b)).slice(0, 200);
  }

  function addSyllabusPicker(content) {
    if (state.mode === 'demo') return '';
    const cands = syllabusCandidates(content);
    if (!cands.length) return '';
    return `<div class="syl-add"><p class="card-sub">Is part of the syllabus somewhere else (grading, policies, office hours)? Add that file or page:</p>
      <div class="row-actions"><select id="syl-pick" aria-label="File or page to add">${cands.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('')}</select>
      <button class="btn" data-act="syl-add">Add</button></div></div>`;
  }

  async function addSyllabusPart(c, content) {
    const cands = syllabusCandidates(content);
    const o = cands[+($('syl-pick') || {}).value];
    if (!o) return;
    CP.busy(`Reading ${o.item.title}…`);
    let blocks = [];
    try {
      const res = await api.courseItem(c.id, o.item);
      const d = (res && res.data) || {};
      if (d.bytes) blocks = await window.PdfText.extractAny(d.kind, d.bytes);
      else if (d.blocks) blocks = d.blocks;
    } catch {
      blocks = [];
    } finally {
      CP.idle();
    }
    if (!blocks.length) return toast(`No text could be read from “${o.item.title}”.`);
    content.extraSyllabus = (content.extraSyllabus || []).concat([{ key: o.key, title: o.item.title, blocks: blocks.slice(0, 1500) }]);
    store.set(key('content2', c.id), content);
    toast(`Added “${o.item.title}” to the syllabus summary.`);
    render();
  }

  function openLinks(content, primary) {
    if (state.mode === 'demo') return '';
    const out = [];
    if (content.syllabusFile && content.syllabusFile.url) out.push(`<button class="${primary ? 'btn' : 'link'}" data-url="${esc(content.syllabusFile.url)}">Open the syllabus file in Carmen</button>`);
    if (content.syllabus && content.syllabus.url) out.push(`<button class="${primary ? 'btn' : 'link'}" data-url="${esc(content.syllabus.url)}">Open the Syllabus page in Carmen</button>`);
    return out.join('');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    if (state.view !== 'course') return;
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const c = course();
    if (!c) return;
    const content = getContent(c.id);
    switch (b.dataset.act) {
      case 'course-load':
        failed.delete(c.id);
        render();
        break;
      case 'syl-add':
        addSyllabusPart(c, content);
        break;
      case 'syl-remove':
        content.extraSyllabus = (content.extraSyllabus || []).filter((_, i) => i !== +b.dataset.i);
        store.set(key('content2', c.id), content);
        render();
        break;
    }
  });

  $('course-refresh').onclick = async () => {
    const c = course();
    if (!c) return;
    const d = await loadContent(c.id);
    if (d) {
      failed.delete(c.id);
      toast(`Read ${c.code} again from Carmen.`);
    }
    render();
  };

  window.Course = { render };
})();
