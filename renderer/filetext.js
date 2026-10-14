// Reads the text of a PDF (like an uploaded syllabus) with Mozilla's pdf.js, on this computer.
// Returns the same simple blocks the rest of the app uses: { t: 'h' | 'li' | 'p', x: 'text' }.

(function () {
// pdf.js is large, so it is only loaded the first time a PDF needs reading.
let loading = null;

function addScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(el);
  });
}

function load() {
  if (!loading) {
    // The worker part runs on this page (globalThis.pdfjsWorker) instead of a separate thread,
    // which keeps it within the app's security policy.
    loading = addScript(BASE + 'vendor/pdfjs/pdf.worker.js')
      .then(() => addScript(BASE + 'vendor/pdfjs/pdf.js'))
      .then(() => {
        globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'vendor/pdfjs/pdf.worker.js';
        return globalThis.pdfjsLib;
      });
  }
  return loading;
}

const BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) || './';

const BULLET = /^\s*([•▪◦●○■□➢►✓✔\-–—*]|\(?[0-9]{1,2}[.)]|\(?[a-hA-H][.)])\s+/;

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function extract(bytes, maxPages = 40) {
  const lib = await load();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = await lib.getDocument({ data, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const lines = [];
  const pages = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let cur = null;
    const flush = () => {
      if (cur && cur.text.trim()) lines.push(cur);
      cur = null;
    };
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform ? it.transform[5] : 0;
      const h = Math.abs(it.height || (it.transform ? it.transform[3] : 0)) || 0;
      if (cur && Math.abs(y - cur.y) > Math.max(2, Math.max(h, cur.h) * 0.6)) flush();
      if (!cur) cur = { text: '', y, h: 0, page: p };
      cur.text += it.str;
      cur.h = Math.max(cur.h, h);
      if (it.hasEOL) flush();
    }
    flush();
    page.cleanup();
  }
  await doc.destroy();
  // Slides saved as PDF: few lines per page. The top line of each page is the slide title.
  const perPage = lines.length / Math.max(1, pages);
  return toBlocks(lines, { slides: pages >= 3 && perPage <= 14 });
}

function toBlocks(lines, opts) {
  const slides = opts && opts.slides;
  const body = median(lines.filter((l) => l.text.trim().length > 40).map((l) => l.h)) || median(lines.map((l) => l.h)) || 10;
  const blocks = [];
  let para = null;
  let prev = null;
  const push = () => {
    if (para && para.x.trim()) blocks.push({ t: para.t, x: para.x.replace(/\s+/g, ' ').trim().slice(0, 1200) });
    para = null;
  };
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (/^(page )?\d+( of \d+)?$/i.test(text)) continue; // page numbers
    const letters = text.replace(/[^A-Za-z]/g, '');
    const isCaps = letters.length >= 4 && letters === letters.toUpperCase() && text.length < 70;
    const bigger = l.h >= body * 1.12;
    const firstOnSlide = slides && (!prev || prev.page !== l.page);
    const looksHeading =
      text.length < 90 &&
      !/[.,;]$/.test(text) &&
      (bigger || isCaps || firstOnSlide || (/:$/.test(text) && text.length < 50));
    const gap = prev && prev.page === l.page ? Math.abs(prev.y - l.y) : 0;
    const newPara = !prev || prev.page !== l.page || gap > Math.max(prev.h, l.h) * 1.7;
    if (looksHeading) {
      push();
      blocks.push({ t: 'h', x: text.replace(/:$/, '') });
    } else if (BULLET.test(text)) {
      push();
      para = { t: 'li', x: text.replace(BULLET, '') };
    } else if (para && !newPara) {
      para.x = para.x.endsWith('-') ? para.x.slice(0, -1) + text : `${para.x} ${text}`;
    } else {
      push();
      para = { t: 'p', x: text };
    }
    prev = l;
  }
  push();
  return blocks;
}

/* ---------- Word (.docx) ---------- */
// A .docx file is a zip archive; the text lives in word/document.xml.

// Read the files inside a zip archive whose names pass test(name). Returns [{ name, text }].
async function readZip(bytes, test) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!test(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.push({ name, text: dec.decode(raw) });
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.push({ name, text: await new Response(stream).text() });
    }
  }
  return out;
}

async function unzipEntry(bytes, wanted) {
  const found = await readZip(bytes, (n) => n === wanted);
  if (!found.length) throw new Error('No document text found');
  return found[0].text;
}

const isTerm = (t) => t.length >= 2 && t.length <= 60 && t.split(/\s+/).length <= 6 && /[A-Za-z]/.test(t) && !/^(note|notes|example|examples|answer|solution|hint|remember|important|why|how|what|step \d+|q|a|ex)\.?:?$/i.test(t);

/* ---------- PowerPoint (.pptx): slide titles, text and bold words ---------- */
async function extractPptx(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const slides = await readZip(data, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  slides.sort((x, y) => +x.name.match(/(\d+)\.xml$/)[1] - +y.name.match(/(\d+)\.xml$/)[1]);
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const Pn = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const blocks = [];
  for (const sl of slides) {
    const doc = new DOMParser().parseFromString(sl.text, 'application/xml');
    const shapes = Array.from(doc.getElementsByTagNameNS(Pn, 'sp'));
    let title = '';
    const body = [];
    const terms = [];
    for (const sp of shapes) {
      const ph = sp.getElementsByTagNameNS(Pn, 'ph')[0];
      const isTitle = ph && /title/i.test(ph.getAttribute('type') || '');
      for (const para of Array.from(sp.getElementsByTagNameNS(A, 'p'))) {
        let text = '';
        for (const n of Array.from(para.getElementsByTagNameNS(A, '*'))) {
          if (n.localName === 't') text += n.textContent;
          else if (n.localName === 'br') text += ' ';
        }
        text = text.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (isTitle) {
          title = title ? `${title} ${text}` : text;
          continue;
        }
        body.push(text);
        for (const r of Array.from(para.getElementsByTagNameNS(A, 'r'))) {
          const rPr = r.getElementsByTagNameNS(A, 'rPr')[0];
          if (!rPr || !/^(1|true)$/.test(rPr.getAttribute('b') || '')) continue;
          const t = (r.getElementsByTagNameNS(A, 't')[0] || {}).textContent || '';
          const tt = t.replace(/\s+/g, ' ').trim().replace(/[:.,]$/, '');
          if (isTerm(tt) && !terms.includes(tt)) terms.push(tt);
        }
      }
    }
    if (title) blocks.push({ t: 'h', x: title.slice(0, 160) });
    body.forEach((x) => blocks.push({ t: 'li', x: x.slice(0, 600) }));
    terms.forEach((x) => blocks.push({ t: 'term', x }));
  }
  return blocks;
}

async function extractDocx(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const xml = await unzipEntry(data, 'word/document.xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (el, name) => Array.from(el.childNodes).filter((c) => c.namespaceURI === W && c.localName === name);
  const textOf = (p) => {
    let t = '';
    p.querySelectorAll('*').forEach((n) => {
      if (n.namespaceURI !== W) return;
      if (n.localName === 't') t += n.textContent;
      else if (n.localName === 'tab' || n.localName === 'br') t += ' ';
    });
    return t.replace(/\s+/g, ' ').trim();
  };
  const blocks = [];
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return blocks;
  for (const el of Array.from(body.childNodes)) {
    if (el.namespaceURI !== W) continue;
    if (el.localName === 'tbl') {
      for (const tr of el.getElementsByTagNameNS(W, 'tr')) {
        // paragraphs inside one cell are separate lines ("9" / "Approximating...") — keep a space between them
        const cells = kids(tr, 'tc')
          .map((tc) => tc.getElementsByTagNameNS(W, 'p').length ? Array.from(tc.getElementsByTagNameNS(W, 'p')).map(textOf).filter(Boolean).join(' ') : textOf(tc))
          .filter(Boolean);
        if (cells.length) blocks.push({ t: 'p', x: cells.join(' | ').slice(0, 1200) });
      }
      continue;
    }
    if (el.localName !== 'p') continue;
    const x = textOf(el);
    if (!x) continue;
    const pPr = kids(el, 'pPr')[0];
    const style = pPr && kids(pPr, 'pStyle')[0] ? kids(pPr, 'pStyle')[0].getAttributeNS(W, 'val') || '' : '';
    const isList = !!(pPr && kids(pPr, 'numPr').length) || /list/i.test(style);
    const runs = kids(el, 'r').filter((r) => textOf(r));
    const allBold = runs.length > 0 && runs.every((r) => {
      const rPr = kids(r, 'rPr')[0];
      const b = rPr && kids(rPr, 'b')[0];
      return b && b.getAttributeNS(W, 'val') !== '0' && b.getAttributeNS(W, 'val') !== 'false';
    });
    let t = 'p';
    if (/^(heading|title|subtitle)/i.test(style) || (allBold && x.length < 90 && !/[.,;]$/.test(x))) t = 'h';
    else if (isList) t = 'li';
    blocks.push({ t, x: (t === 'h' ? x.replace(/:$/, '') : x).slice(0, 1200) });
    if (t !== 'h' && !allBold) {
      runs.forEach((r) => {
        const rPr = kids(r, 'rPr')[0];
        const b = rPr && kids(rPr, 'b')[0];
        if (!b || /^(0|false)$/.test(b.getAttributeNS(W, 'val') || '')) return;
        const tt = textOf(r).replace(/[:.,]$/, '');
        if (isTerm(tt)) blocks.push({ t: 'term', x: tt });
      });
    }
  }
  return blocks;
}

// One entry point for any lecture file: returns blocks.
async function extractAny(kind, bytes) {
  if (kind === 'pdf') return extract(bytes, 120);
  if (kind === 'pptx') return extractPptx(bytes);
  if (kind === 'docx') return extractDocx(bytes);
  return [];
}

window.PdfText = { extract, toBlocks, extractDocx, extractPptx, extractAny };
})();
