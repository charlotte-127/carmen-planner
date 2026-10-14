/* Week calendar for the study plan, like a desktop calendar app:
   drag a block to move it (to another time or day), drag its bottom edge to change its length,
   click it to edit times and notes, click or drag on an empty spot to add your own event.

   Calendar.render(el, {
     days:  [{ key: '2026-10-09', label: 'Fri', date: 'Oct 9', today, past }],
     items: [{ id, kind: 'study' | 'event', day, start, end, title, sub, color, note, moved }],   start/end in minutes
     dues:  { dayKey: [{ title, color, done }] },
   }, handlers: { change(item, patch), create(fields), remove(item), reset(item) }) */
(function () {
  const SNAP = 15;
  const PX = 0.8; // pixels per minute (48 px per hour)
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const fromHHMM = (v) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
    return m ? +m[1] * 60 + +m[2] : null;
  };
  function label(m) {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${((h + 11) % 12) + 1}${mm ? `:${pad(mm)}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  function range(a, b) {
    const A = label(a);
    const B = label(b);
    return A.slice(-2) === B.slice(-2) ? `${A.slice(0, -3)} – ${B}` : `${A} – ${B}`;
  }

  // Side-by-side columns for blocks that overlap in time
  function arrange(list) {
    const sorted = list.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    const out = [];
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const cols = [];
      cluster.forEach((it) => {
        let c = cols.findIndex((end) => end <= it.start);
        if (c < 0) {
          c = cols.length;
          cols.push(0);
        }
        cols[c] = it.end;
        out.push({ it, col: c });
      });
      out.slice(out.length - cluster.length).forEach((o) => (o.cols = cols.length));
      cluster = [];
    };
    sorted.forEach((it) => {
      if (cluster.length && it.start >= clusterEnd) {
        flush();
        clusterEnd = -1;
      }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    });
    if (cluster.length) flush();
    return out;
  }

  let ctx = null; // current render: { el, opts, handlers, from, to }

  function render(el, opts, handlers) {
    const prevScroll = el.querySelector('.cal-scroll') ? el.querySelector('.cal-scroll').scrollTop : null;
    const items = opts.items || [];
    const earliest = Math.min(7 * 60, ...items.map((i) => i.start));
    const from = Math.max(0, Math.floor(earliest / 60) * 60);
    const to = 24 * 60;
    ctx = { el, opts, handlers, from, to };
    const H = (to - from) * PX;

    const head = opts.days
      .map((d) => {
        const mins = items.filter((i) => i.day === d.key && i.kind === 'study').reduce((n, i) => n + (i.end - i.start), 0);
        return `<div class="cal-dh${d.today ? ' today' : ''}${d.past ? ' past' : ''}"><b>${d.today ? 'Today' : esc(d.label)}</b><span>${esc(d.date)}</span>
          ${mins ? `<em>${mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}` : `${mins} min`}</em>` : ''}</div>`;
      })
      .join('');
    const dues = opts.days
      .map((d) => {
        const list = (opts.dues && opts.dues[d.key]) || [];
        const shown = list.slice(0, 3);
        return `<div class="cal-due${d.past ? ' past' : ''}">${shown
          .map((x) => `<div class="due-chip${x.done ? ' done' : ''}" style="--cc:${x.color}" title="Due: ${esc(x.title)}"><span>${esc(x.title)}</span></div>`)
          .join('')}${list.length > 3 ? `<div class="cal-more" title="${esc(list.slice(3).map((x) => x.title).join(', '))}">+${list.length - 3} more</div>` : ''}</div>`;
      })
      .join('');
    let hours = '';
    for (let m = from; m < to; m += 60) hours += `<div class="cal-hour" style="top:${(m - from) * PX}px">${m === from ? '' : label(m)}</div>`;

    const cols = opts.days
      .map((d) => {
        const mine = arrange(items.filter((i) => i.day === d.key && i.end > from));
        const blocks = mine
          .map(({ it, col, cols: n }) => {
            const top = (Math.max(it.start, from) - from) * PX;
            const h = Math.max(18, (it.end - Math.max(it.start, from)) * PX - 2);
            const w = 100 / n;
            const short = h < 40;
            return `<div class="cal-item ${it.kind}${it.moved ? ' moved' : ''}${short ? ' short' : ''}" data-id="${esc(it.id)}" tabindex="0" role="button"
              aria-label="${esc(`${it.title}, ${range(it.start, it.end)}${it.note ? `. Note: ${it.note}` : ''}. Press Enter to edit.`)}"
              style="top:${top}px;height:${h}px;left:calc(${col * w}% + 2px);width:calc(${w}% - 4px);--cc:${it.color}">
              <div class="ci-time">${range(it.start, it.end)}</div><div class="ci-title">${esc(it.title)}</div>
              ${it.sub && !short ? `<div class="ci-sub">${esc(it.sub)}</div>` : ''}${it.note && !short ? `<div class="ci-note">${esc(it.note)}</div>` : ''}
              <div class="cal-resize" aria-hidden="true"></div></div>`;
          })
          .join('');
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        const nowLine = d.today && nowM >= from ? `<div class="cal-now" style="top:${(nowM - from) * PX}px"></div>` : '';
        return `<div class="cal-col${d.today ? ' today' : ''}${d.past ? ' past' : ''}" data-day="${d.key}">${blocks}${nowLine}</div>`;
      })
      .join('');

    // past days get narrower columns so the days ahead have room
    const tpl = opts.days.map((d) => `minmax(0, ${d.past ? 0.55 : 1}fr)`).join(' ');
    el.innerHTML = `<div class="cal" style="--hour:${60 * PX}px">
      <div class="cal-row cal-heads" style="grid-template-columns:52px ${tpl}"><div class="cal-gutter"></div>${head}</div>
      <div class="cal-row cal-dues" style="grid-template-columns:52px ${tpl}"><div class="cal-gutter cal-gl">Due</div>${dues}</div>
      <div class="cal-scroll"><div class="cal-body" style="height:${H}px">
        <div class="cal-gutter cal-hours">${hours}</div>
        <div class="cal-cols" style="grid-template-columns:${tpl}">${cols}</div>
      </div></div></div>`;

    const sc = el.querySelector('.cal-scroll');
    if (prevScroll != null) sc.scrollTop = prevScroll;
    else {
      const firstStart = Math.min(...items.filter((i) => opts.days.some((d) => d.key === i.day)).map((i) => i.start), 18 * 60);
      sc.scrollTop = Math.max(0, (firstStart - from - 60) * PX);
    }
    el.querySelectorAll('.cal-item').forEach(fit);
    el.querySelector('.cal-cols').addEventListener('pointerdown', onDown);
    el.querySelector('.cal-cols').addEventListener('keydown', onKey);
  }

  /* ---------- dragging ---------- */
  let drag = null;

  function minuteAt(clientY) {
    const body = ctx.el.querySelector('.cal-cols').getBoundingClientRect();
    const m = ctx.from + (clientY - body.top) / PX;
    return Math.round(m / SNAP) * SNAP;
  }
  function dayAt(clientX) {
    const cols = Array.from(ctx.el.querySelectorAll('.cal-col'));
    let best = cols[0];
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      if (clientX >= r.left) best = c;
    }
    return best;
  }
  const itemById = (id) => (ctx.opts.items || []).find((i) => i.id === id);

  function onDown(e) {
    if (e.button !== 0) return;
    const block = e.target.closest('.cal-item');
    const col = e.target.closest('.cal-col');
    if (!col) return;
    e.preventDefault();
    if (block) {
      const it = itemById(block.dataset.id);
      if (!it) return;
      drag = {
        mode: e.target.closest('.cal-resize') ? 'resize' : 'move',
        it,
        el: block,
        x: e.clientX,
        y: e.clientY,
        m0: minuteAt(e.clientY),
        start: it.start,
        end: it.end,
        day: it.day,
        moved: false,
      };
    } else {
      const m = Math.max(ctx.from, Math.min(ctx.to - SNAP, Math.floor(minuteAt(e.clientY) / SNAP) * SNAP));
      const ghost = document.createElement('div');
      ghost.className = 'cal-item event ghost';
      col.appendChild(ghost);
      drag = { mode: 'create', el: ghost, col, x: e.clientX, y: e.clientY, a: m, start: m, end: m + 60, day: col.dataset.day, moved: false };
      place(ghost, m, m + 60);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  // Short blocks: drop the note, then the course, then cut the title, so nothing spills past the edge.
  function fit(el) {
    const over = () => el.scrollHeight > el.clientHeight + 1;
    for (const sel of ['.ci-sub', '.ci-note']) {
      if (!over()) return;
      const x = el.querySelector(sel);
      if (!x) continue;
      if (sel === '.ci-note') {
        el.title = x.textContent; // the student's own note is still there on hover
        el.classList.add('noted');
      }
      x.remove();
    }
    const t = el.querySelector('.ci-title');
    if (!t || !over()) return;
    const room = el.clientHeight - t.offsetTop - 2;
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 15;
    t.style.webkitLineClamp = String(Math.max(1, Math.floor(room / lh)));
    t.classList.add('clamp');
  }

  function place(el, start, end) {
    el.style.top = `${(start - ctx.from) * PX}px`;
    el.style.height = `${Math.max(18, (end - start) * PX - 2)}px`;
    const t = el.querySelector('.ci-time');
    if (t) t.textContent = range(start, end);
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.moved = true;
    const m = minuteAt(e.clientY);
    if (drag.mode === 'move') {
      const dur = drag.it.end - drag.it.start;
      drag.start = Math.max(ctx.from, Math.min(ctx.to - dur, drag.it.start + (m - drag.m0)));
      drag.end = drag.start + dur;
      const col = dayAt(e.clientX);
      if (col.dataset.day !== drag.el.parentElement.dataset.day) {
        col.appendChild(drag.el);
        drag.el.style.left = '2px';
        drag.el.style.width = 'calc(100% - 4px)';
      }
      drag.day = col.dataset.day;
      drag.el.classList.add('dragging');
      place(drag.el, drag.start, drag.end);
    } else if (drag.mode === 'resize') {
      drag.end = Math.max(drag.it.start + SNAP, Math.min(ctx.to, m));
      drag.el.classList.add('dragging');
      place(drag.el, drag.it.start, drag.end);
    } else {
      const a = drag.a;
      const b = Math.max(ctx.from, Math.min(ctx.to, m));
      drag.start = Math.min(a, b);
      drag.end = Math.max(a + SNAP, b, drag.start + SNAP);
      place(drag.el, drag.start, drag.end);
    }
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.mode === 'create') {
      d.el.remove();
      openEditor(null, { day: d.day, start: d.start, end: d.moved ? d.end : d.start + 60 });
      return;
    }
    if (!d.moved) {
      openEditor(d.it);
      return;
    }
    const patch = d.mode === 'move' ? { day: d.day, start: d.start, end: d.end } : { end: d.end };
    ctx.handlers.change(d.it, patch);
  }

  function onKey(e) {
    const block = e.target.closest && e.target.closest('.cal-item');
    if (!block) return;
    const it = itemById(block.dataset.id);
    if (!it) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openEditor(it);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && it.kind === 'event') {
      e.preventDefault();
      ctx.handlers.remove(it);
    }
  }

  /* ---------- edit dialog ---------- */
  function openEditor(it, fresh) {
    const dlg = document.getElementById('cal-edit');
    const isNew = !it;
    const v = it || Object.assign({ kind: 'event', title: '', note: '' }, fresh);
    const days = ctx.opts.days;
    document.getElementById('ce-title').textContent = isNew ? 'New event' : v.kind === 'study' ? 'Study session' : 'Event';
    document.getElementById('ce-body').innerHTML = `
      ${v.kind === 'study' ? `<p class="ce-task"><b>${esc(v.title)}</b><span>${esc(v.sub || '')}</span></p>` : `<label>Title<input type="text" id="ce-name" value="${esc(v.title)}" placeholder="Club meeting, gym, review with friends…" maxlength="80" /></label>`}
      <div class="row3">
        <label>Day<select id="ce-day">${days.map((d) => `<option value="${d.key}"${d.key === v.day ? ' selected' : ''}>${esc(d.label)}, ${esc(d.date)}</option>`).join('')}${days.some((d) => d.key === v.day) ? '' : `<option value="${v.day}" selected>${v.day}</option>`}</select></label>
        <label>Starts<input type="time" id="ce-start" step="900" value="${hhmm(v.start)}" /></label>
        <label>Ends<input type="time" id="ce-end" step="900" value="${hhmm(v.end % 1440 === 0 && v.end > 0 ? 1439 : v.end)}" /></label>
      </div>
      <label>Note<textarea id="ce-note" rows="3" maxlength="400" placeholder="${v.kind === 'study' ? 'What to focus on, pages to read…' : 'Anything to remember'}">${esc(v.note || '')}</textarea></label>
      <p class="error" id="ce-error" role="alert"></p>`;
    const del = document.getElementById('ce-delete');
    const reset = document.getElementById('ce-reset');
    del.hidden = isNew;
    del.textContent = v.kind === 'study' ? 'Remove from plan' : 'Delete event';
    reset.hidden = !(v.kind === 'study' && v.moved);
    del.onclick = () => {
      dlg.close();
      ctx.handlers.remove(v);
    };
    reset.onclick = () => {
      dlg.close();
      ctx.handlers.reset(v);
    };
    document.getElementById('ce-save').onclick = (e) => {
      e.preventDefault();
      const start = fromHHMM(document.getElementById('ce-start').value);
      let end = fromHHMM(document.getElementById('ce-end').value);
      if (end === 1439) end = 1440;
      if (start == null || end == null || end <= start) {
        document.getElementById('ce-error').textContent = 'The end time must be after the start time.';
        return;
      }
      const fields = { day: document.getElementById('ce-day').value, start, end, note: document.getElementById('ce-note').value.trim() };
      if (v.kind !== 'study') fields.title = (document.getElementById('ce-name').value || '').trim() || 'Event';
      dlg.close();
      if (isNew) ctx.handlers.create(fields);
      else ctx.handlers.change(v, fields);
    };
    document.getElementById('ce-cancel').onclick = () => dlg.close();
    dlg.showModal();
    const first = document.getElementById(v.kind === 'study' ? 'ce-start' : 'ce-name');
    if (first) first.focus();
  }

  window.Calendar = { render, range, arrange };
})();
