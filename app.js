'use strict';

/* =====================================================================
   Daybook — a private journal by year, month and day.
   Data lives in this browser (IndexedDB). Nothing is uploaded anywhere.
   ===================================================================== */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MOODS = [
  { v: 1, label: 'Rough' },
  { v: 2, label: 'Low' },
  { v: 3, label: 'Okay' },
  { v: 4, label: 'Good' },
  { v: 5, label: 'Great' },
];
const MAX_PHOTO_EDGE = 1600;
const SAVE_DELAY = 600;

const $main = document.getElementById('main');
const $toast = document.getElementById('toast');
const $filePicker = document.getElementById('filePicker');
const $importPicker = document.getElementById('importPicker');
const $todayBtn = document.getElementById('todayBtn');

/* ---------- Small helpers ---------- */

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

const pad = n => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(y, m, 0).getDate();
const fmtNum = n => n.toLocaleString('en');
const plural = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : many}`;

function todayParts() {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

function shiftDay(y, m, d, delta) {
  const t = new Date(y, m - 1, d + delta);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

function shiftMonth(y, m, delta) {
  const t = new Date(y, m - 1 + delta, 1);
  return { y: t.getFullYear(), m: t.getMonth() + 1 };
}

const ICON = {
  left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  photo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>',
  list: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".8" fill="currentColor"/><circle cx="4.5" cy="12" r=".8" fill="currentColor"/><circle cx="4.5" cy="18" r=".8" fill="currentColor"/></svg>',
  quote: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 17v-4.5C5 9 7 7 10 6.5V9c-1.4.4-2 1.3-2 2.5h2V17H5zm9 0v-4.5C14 9 16 7 19 6.5V9c-1.4.4-2 1.3-2 2.5h2V17h-5z"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
};

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 3500);
}

/* ---------- Storage (IndexedDB) ---------- */

let db;
const meta = new Map(); // date -> { date, title, mood, words, snippet, thumb, updated }

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('daybook', 3);
    req.onupgradeneeded = e => {
      const d = req.result;
      if (e.oldVersion < 1) {
        d.createObjectStore('entries', { keyPath: 'date' });
        d.createObjectStore('meta', { keyPath: 'date' });
      }
      if (e.oldVersion < 2) {
        d.createObjectStore('sections', { keyPath: 'id' });
        d.createObjectStore('notes', { keyPath: 'id' });
      }
      if (e.oldVersion < 3) d.createObjectStore('deleted', { keyPath: 'key' }); // tombstones, so deletes can sync
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

const getEntry = date => wrap(db.transaction('entries').objectStore('entries').get(date));
const getAllEntries = () => wrap(db.transaction('entries').objectStore('entries').getAll());
const getAllMeta = () => wrap(db.transaction('meta').objectStore('meta').getAll());

function putEntry(entry, m) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'meta'], 'readwrite');
    tx.objectStore('entries').put(entry);
    tx.objectStore('meta').put(m);
    tx.oncomplete = () => { scheduleSync(); resolve(); };
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

const dbAll = store => wrap(db.transaction(store).objectStore(store).getAll());

function dbWrite(stores, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    fn(tx);
    tx.oncomplete = () => { scheduleSync(); resolve(); };
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
const dbPut = (store, value) => dbWrite(store, tx => tx.objectStore(store).put(value));

function removeEntry(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'meta', 'deleted'], 'readwrite');
    tx.objectStore('entries').delete(date);
    tx.objectStore('meta').delete(date);
    tx.objectStore('deleted').put({ key: `e:${date}`, updated: Date.now() });
    tx.oncomplete = () => { scheduleSync(); resolve(); };
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

/* ---------- Sanitising stored/imported HTML ---------- */

const ALLOWED = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'FIGURE', 'IMG', 'FIGCAPTION', 'DIV', 'SPAN']);
const DATA_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;

function sanitizeInto(src, dest) {
  for (const node of [...src.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.append(document.createTextNode(node.nodeValue));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      if (!ALLOWED.has(tag)) { sanitizeInto(node, dest); continue; }
      const el = document.createElement(tag.toLowerCase());
      if (tag === 'IMG') {
        const s = node.getAttribute('src') || '';
        if (!DATA_IMG.test(s)) continue;
        el.setAttribute('src', s);
        el.setAttribute('alt', node.getAttribute('alt') || '');
      }
      if (tag === 'FIGURE') {
        const size = node.dataset.size;
        el.className = 'photo';
        el.dataset.size = ['small', 'wide', 'full'].includes(size) ? size : 'wide';
      }
      sanitizeInto(node, el);
      dest.append(el);
    }
  }
}

function cleanHTML(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const out = document.createElement('div');
  sanitizeInto(doc.body, out);
  return out.innerHTML;
}

/* ---------- Photos ---------- */

async function compressImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const hgt = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, hgt);
  ctx.drawImage(bmp, 0, 0, w, hgt);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

const thumbCache = new Map();
function makeThumb(src) {
  if (thumbCache.has(src)) return Promise.resolve(thumbCache.get(src));
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const edge = 160;
      const s = Math.max(edge / img.width, edge / img.height);
      const c = document.createElement('canvas');
      c.width = c.height = edge;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, (edge - img.width * s) / 2, (edge - img.height * s) / 2, img.width * s, img.height * s);
      const out = c.toDataURL('image/jpeg', 0.7);
      thumbCache.set(src, out);
      resolve(out);
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

/* ---------- Trades ---------- */

const optionMultiplier = type => (type === 'option' ? 100 : 1);

function tradeResult(t) {
  if (!t) return null;
  const { qty, buy, sell } = t;
  if (![qty, buy, sell].every(n => typeof n === 'number' && Number.isFinite(n)) || qty <= 0 || buy < 0 || sell < 0) return null;
  const mult = optionMultiplier(t.type);
  const fees = Number.isFinite(t.fees) ? t.fees : 0;
  const cost = buy * qty * mult;
  const proceeds = sell * qty * mult;
  const pl = proceeds - cost - fees;
  return { pl, pct: cost > 0 ? (pl / cost) * 100 : null, cost, proceeds, fees };
}

const money = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cleanTrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e12 ? v : null);
  const t = {
    type: raw.type === 'option' ? 'option' : 'stock',
    symbol: String(raw.symbol || '').toUpperCase().replace(/[^A-Z0-9. -]/g, '').slice(0, 12),
    qty: n(raw.qty), buy: n(raw.buy), sell: n(raw.sell), fees: n(raw.fees),
  };
  return t.symbol || t.qty != null || t.buy != null || t.sell != null || t.fees != null ? t : null;
}

async function buildMeta(entry) {
  const tmp = document.createElement('div');
  tmp.innerHTML = entry.html;
  tmp.querySelectorAll('p,h2,h3,li,blockquote,figcaption,div,br').forEach(n => n.after(' '));
  const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  const firstImg = tmp.querySelector('img');
  return {
    date: entry.date,
    title: entry.title,
    mood: entry.mood || 0,
    words: text ? text.split(' ').length : 0,
    snippet: text.slice(0, 120),
    text,
    trade: entry.trade ? { type: entry.trade.type, symbol: entry.trade.symbol } : null,
    pl: (() => { const r = tradeResult(entry.trade); return r ? r.pl : null; })(),
    thumb: firstImg ? await makeThumb(firstImg.getAttribute('src')) : '',
    updated: entry.updated,
  };
}

/* ---------- Routing ---------- */

let viewToken = 0;
let activeEditor = null; // { flush(): Promise }

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(Number);
  if (parts.some(n => !Number.isInteger(n))) return [];
  const [y, m, d] = parts;
  if (y && (y < 1900 || y > 2999)) return [];
  if (m && (m < 1 || m > 12)) return [y];
  if (d && (d < 1 || d > daysIn(y, m))) return [y, m];
  return parts.slice(0, 3);
}

/* The page behind an open day is "the base": the year, month or search the
   person came from. The day opens as a popup over it, and closing returns there. */
let base = { kind: 'year', y: todayParts().y, hash: `#/${todayParts().y}` };
let shownBase = null;
let openDialog = null;

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function baseTitle(b) {
  if (b.kind === 'search') return b.q ? `Search: ${b.q}` : 'Search';
  if (b.kind === 'month') return `${MONTHS[b.m - 1]} ${b.y}`;
  return String(b.y);
}

function closeDialog() {
  if (!openDialog) return false;
  openDialog.close();
  openDialog.remove();
  openDialog = null;
  return true;
}

async function render() {
  const token = ++viewToken;
  if (activeEditor) { await activeEditor.flush(); activeEditor = null; }
  if (token !== viewToken) return;

  const now = todayParts();
  $todayBtn.href = `#/${now.y}/${now.m}/${now.d}`;

  const raw = location.hash.replace(/^#\/?/, '');
  const inNotebook = raw === 'notebook' || raw.startsWith('notebook/');
  document.getElementById('navJournal').setAttribute('aria-current', inNotebook ? 'false' : 'page');
  document.getElementById('navNotebook').setAttribute('aria-current', inNotebook ? 'page' : 'false');
  $main.classList.toggle('wide', inNotebook);

  if (inNotebook) {
    const [sid, nid] = raw.split('/').slice(1);
    const nb = notebookView(sid, nid);
    closeDialog();
    shownBase = null;
    $main.replaceChildren(...nb.nodes);
    window.scrollTo(0, 0);
    document.title = `${nb.title} · Daybook`;
    nb.mount();
    return;
  }

  let route;
  if (raw === 'search' || raw.startsWith('search/')) {
    const q = safeDecode(raw.slice(7)).trim();
    route = { kind: 'search', q, hash: `#/search/${encodeURIComponent(q)}` };
  } else {
    const [y, m, d] = parseRoute();
    if (y && m && d) route = { kind: 'day', y, m, d };
    else if (y && m) route = { kind: 'month', y, m, hash: `#/${y}/${m}` };
    else route = { kind: 'year', y: y || now.y, hash: `#/${y || now.y}` };
  }

  if (route.kind === 'day') {
    const b = base;
    const stillFits = b.kind === 'search'
      || (b.kind === 'year' && b.y === route.y)
      || (b.kind === 'month' && b.y === route.y && b.m === route.m);
    if (!stillFits) base = { kind: 'month', y: route.y, m: route.m, hash: `#/${route.y}/${route.m}` };
  } else {
    base = route;
  }

  const view = base.kind === 'search' ? searchView(base.q)
    : base.kind === 'month' ? monthView(base.y, base.m)
    : yearView(base.y);
  const dialog = route.kind === 'day' ? await dayView(route.y, route.m, route.d, token) : null;
  if (token !== viewToken) return;

  const hadDialog = closeDialog();
  const keepY = shownBase === base.hash ? window.scrollY : 0;
  $main.replaceChildren(...view.filter(Boolean));
  shownBase = base.hash;
  window.scrollTo(0, keepY);

  if (dialog) {
    if (!hadDialog) dialog.classList.add('opening');
    document.body.append(dialog);
    dialog.showModal();
    openDialog = dialog;
    document.title = `${route.d} ${MONTHS[route.m - 1]} ${route.y} · Daybook`;
    dialog.querySelector('.title-input')?.focus({ preventScroll: true });
  } else {
    document.title = `${baseTitle(base)} · Daybook`;
    $main.focus({ preventScroll: true });
  }
}

/* ---------- Shared view pieces ---------- */

function crumbs(items) {
  return h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
    h('ol', null, items.map((it, i) => h('li', null,
      i === items.length - 1
        ? h('span', { 'aria-current': 'page' }, it.label)
        : h('a', { href: it.href }, it.label)))));
}

function stepBtn(href, label, icon) {
  return h('a', { class: 'icon-btn bordered', href, 'aria-label': label, title: label, html: icon });
}

function statsFor(prefix) {
  let entries = 0, words = 0, pl = 0, trades = 0;
  for (const [date, mt] of meta) {
    if (!date.startsWith(prefix)) continue;
    entries++; words += mt.words;
    if (typeof mt.pl === 'number') { pl += mt.pl; trades++; }
  }
  return { entries, words, pl, trades };
}

function plClause(pl, n) {
  return [' · ', h('span', { class: ['pl', pl > 0 ? 'win' : pl < 0 ? 'loss' : ''].join(' ').trim() },
    `${pl < 0 ? 'Net loss' : pl > 0 ? 'Net profit' : 'Break-even'} ${money(pl)}`), ` from ${plural(n, 'trade', 'trades')}`];
}

/* ---------- On this day ---------- */

function onThisDay(m, d, exceptYear) {
  const tail = `-${pad(m)}-${pad(d)}`;
  return [...meta.values()]
    .filter(mt => mt.date.endsWith(tail) && Number(mt.date.slice(0, 4)) !== exceptYear)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function memoryLink(mt) {
  const [y, m, d] = mt.date.split('-').map(Number);
  const yearsAgo = todayParts().y - y;
  return h('a', { class: 'memory', href: `#/${y}/${m}/${d}` },
    mt.thumb ? h('img', { src: mt.thumb, alt: '', loading: 'lazy' }) : null,
    h('span', { class: 'memory-text' },
      h('span', { class: 'memory-year' }, String(y), yearsAgo > 0 ? ` (${yearsAgo === 1 ? '1 year ago' : yearsAgo + ' years ago'})` : ''),
      h('span', { class: 'memory-title' }, mt.title || mt.snippet || 'Photo entry')));
}

/* ---------- Search ---------- */

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, terms) {
  if (!terms.length) return [text];
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', null, part) : part));
}

function snippetAround(text, terms) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = lower.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; }
  const start = Math.max(0, at - 70);
  const slice = text.slice(start, start + 190);
  return (start > 0 ? '…' : '') + slice + (start + 190 < text.length ? '…' : '');
}

function searchView(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = terms.length
    ? [...meta.values()]
      .filter(mt => { const hay = `${mt.title} ${mt.text || ''}`.toLowerCase(); return terms.every(t => hay.includes(t)); })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    : [];
  const shown = hits.slice(0, 200);
  const noteHits = terms.length
    ? [...nbNotes.values()]
      .filter(n => { const hay = `${n.title} ${n.text || ''}`.toLowerCase(); return terms.every(t => hay.includes(t)); })
      .sort((a, b) => b.updated - a.updated)
      .slice(0, 100)
    : [];
  const total = hits.length + noteHits.length;

  const head = h('div', { class: 'page-head' },
    h('div', null,
      h('h1', null, 'Search'),
      h('p', { class: 'page-sub' }, !terms.length
        ? 'Type a word or phrase in the search box above.'
        : total
          ? `${plural(total, 'result matches', 'results match')} “${q}”${hits.length > shown.length ? `. Showing the newest ${shown.length} journal entries.` : ''}`
          : `Nothing matches “${q}”. Try fewer or different words.`)));

  const noteList = noteHits.length ? [
    h('h2', { class: 'results-head' }, 'Notebook'),
    h('ol', { class: 'results' }, noteHits.map(n => {
      const sec = nbSections.find(s => s.id === n.section);
      return h('li', null, h('a', { class: 'result', href: nbHref(n.section, n.id) },
        h('span', { class: 'result-date' }, `Notebook · ${sec ? sec.name : 'Section'} · ${fmtShort(n.updated)}`),
        h('span', { class: 'result-title' }, highlight(n.title || 'Untitled topic', terms)),
        n.text ? h('span', { class: 'result-snippet' }, highlight(snippetAround(n.text, terms), terms)) : null));
    })),
  ] : null;

  const list = shown.length ? h('ol', { class: 'results' }, shown.map(mt => {
    const [y, m, d] = mt.date.split('-').map(Number);
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
    return h('li', null, h('a', { class: 'result', href: `#/${y}/${m}/${d}` },
      h('span', { class: 'result-date' }, `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]} ${y}`,
        mt.mood ? h('span', { class: 'result-mood' }, h('b', { style: `background:var(--mood-${mt.mood})`, 'aria-hidden': 'true' }), MOODS[mt.mood - 1].label) : null),
      h('span', { class: 'result-title' }, highlight(mt.title || 'Untitled', terms)),
      mt.text ? h('span', { class: 'result-snippet' }, highlight(snippetAround(mt.text, terms), terms)) : null,
      mt.thumb ? h('img', { class: 'result-thumb', src: mt.thumb, alt: '', loading: 'lazy' }) : null));
  })) : null;

  const input = document.getElementById('q');
  if (input && document.activeElement !== input) input.value = q;
  const journalHead = list && noteList ? h('h2', { class: 'results-head' }, 'Journal') : null;
  return [crumbs([{ label: 'Journal', href: '#/' }, { label: 'Search' }]), head, journalHead, list, noteList].flat();
}

/* ---------- Year view ---------- */

function yearView(year) {
  const now = todayParts();
  const years = new Set([now.y, year]);
  for (const date of meta.keys()) years.add(Number(date.slice(0, 4)));
  const sorted = [...years].sort((a, b) => b - a);

  const { entries, words, pl: yearPl, trades: yearTrades } = statsFor(`${year}-`);
  const head = h('div', { class: 'page-head' },
    h('div', null,
      h('h1', null, String(year)),
      h('p', { class: 'page-sub' }, entries
        ? `${plural(entries, 'entry', 'entries')} · ${plural(words, 'word', 'words')} written`
        : 'Nothing written yet. Pick any day to start.',
        yearTrades ? plClause(yearPl, yearTrades) : null)),
    h('div', { class: 'stepper' },
      stepBtn(`#/${year - 1}`, `Previous year, ${year - 1}`, ICON.left),
      stepBtn(`#/${year + 1}`, `Next year, ${year + 1}`, ICON.right)));

  const chips = h('nav', { class: 'year-chips', 'aria-label': 'Years' },
    sorted.map(yr => h('a', { class: 'chip', href: `#/${yr}`, 'aria-current': yr === year ? 'page' : false }, String(yr))));

  const months = h('div', { class: 'months' }, MONTHS.map((name, i) => {
    const m = i + 1;
    const lead = (new Date(year, i, 1).getDay() + 6) % 7;
    const n = daysIn(year, m);
    const { entries: count } = statsFor(`${year}-${pad(m)}-`);
    const cells = [];
    for (let k = 0; k < lead; k++) cells.push(h('i', { 'aria-hidden': 'true' }));
    for (let day = 1; day <= n; day++) {
      const mt = meta.get(keyOf(year, m, day));
      const isToday = year === now.y && m === now.m && day === now.d;
      const label = `${day} ${name} ${year}` + (mt ? `, ${mt.title || 'entry'}${mt.mood ? ', feeling ' + MOODS[mt.mood - 1].label.toLowerCase() : ''}` : ', no entry');
      cells.push(h('a', {
        href: `#/${year}/${m}/${day}`,
        class: [mt ? 'has' : '', isToday ? 'today' : ''].join(' ').trim(),
        'data-mood': mt && mt.mood ? mt.mood : false,
        'aria-label': label,
        title: label,
      }));
    }
    return h('section', { class: 'mini', 'aria-label': `${name} ${year}` },
      h('h2', null, h('a', { href: `#/${year}/${m}` }, name), count ? h('span', null, plural(count, 'entry', 'entries')) : null),
      h('div', { class: 'mini-grid' }, cells));
  }));

  const legend = h('div', { class: 'legend', 'aria-label': 'Colour key' },
    h('span', null, 'How the day felt:'),
    MOODS.map(mo => h('span', null, h('b', { style: `background:var(--mood-${mo.v})` }), mo.label)),
    h('span', null, h('b', { style: 'background:var(--entry)' }), 'No mood set'),
    h('span', null, h('b', { style: 'background:var(--empty)' }), 'No entry'));

  const tools = h('div', { class: 'tools' },
    h('p', null, 'Your entries and notebook are stored only in this browser. Download a backup now and then, especially before clearing site data.'),
    h('button', { class: 'btn', type: 'button', onclick: exportAll }, 'Download backup'),
    h('button', { class: 'btn', type: 'button', onclick: () => $importPicker.click() }, 'Restore from backup'));

  const memories = year === now.y ? onThisDay(now.m, now.d, now.y) : [];
  const memorySection = memories.length
    ? h('section', { class: 'memories', 'aria-labelledby': 'memHead' },
      h('h2', { id: 'memHead' }, `On this day, ${now.d} ${MONTHS[now.m - 1]}`),
      h('div', { class: 'memory-list' }, memories.map(memoryLink)))
    : null;

  return [crumbs([{ label: 'Journal', href: '#/' }, { label: String(year) }]), head, chips, memorySection, months, legend, tools];
}

/* ---------- Month view ---------- */

function monthView(year, month) {
  const now = todayParts();
  const name = MONTHS[month - 1];
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const { entries, words, pl: monthPl, trades: monthTrades } = statsFor(`${year}-${pad(month)}-`);

  const head = h('div', { class: 'page-head' },
    h('div', null,
      h('h1', null, name, h('small', null, String(year))),
      h('p', { class: 'page-sub' }, entries
        ? `${plural(entries, 'entry', 'entries')} · ${plural(words, 'word', 'words')}`
        : 'No entries this month. Choose a day to write.',
        monthTrades ? plClause(monthPl, monthTrades) : null)),
    h('div', { class: 'stepper' },
      stepBtn(`#/${prev.y}/${prev.m}`, `Previous month, ${MONTHS[prev.m - 1]} ${prev.y}`, ICON.left),
      stepBtn(`#/${next.y}/${next.m}`, `Next month, ${MONTHS[next.m - 1]} ${next.y}`, ICON.right)));

  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const n = daysIn(year, month);
  const rows = Math.ceil((lead + n) / 7);
  const tbody = h('tbody');
  let day = 1 - lead;
  for (let r = 0; r < rows; r++) {
    const tr = h('tr');
    for (let c = 0; c < 7; c++, day++) {
      if (day < 1 || day > n) { tr.append(h('td', { class: 'pad' })); continue; }
      const mt = meta.get(keyOf(year, month, day));
      const isToday = year === now.y && month === now.m && day === now.d;
      const isFuture = new Date(year, month - 1, day) > new Date(now.y, now.m - 1, now.d);
      const full = `${WEEKDAYS[c]} ${day} ${name}` + (mt ? `: ${mt.title || 'untitled entry'}${typeof mt.pl === 'number' ? (mt.pl >= 0 ? ', profit ' : ', loss ') + money(mt.pl) : ''}` : ', no entry yet');
      tr.append(h('td', null,
        h('a', {
          class: ['day', mt ? 'has' : '', isToday ? 'today' : '', isFuture ? 'future' : ''].join(' ').trim(),
          href: `#/${year}/${month}/${day}`,
          'data-mood': mt && mt.mood ? mt.mood : false,
          'aria-label': full,
          'aria-current': isToday ? 'date' : false,
        },
          h('span', { class: 'day-mood', 'aria-hidden': 'true' }),
          h('span', { class: 'day-num', 'aria-hidden': 'true' }, String(day)),
          mt ? h('span', { class: 'day-title', 'aria-hidden': 'true' }, mt.title || mt.snippet || 'Photo entry') : null,
          mt && typeof mt.pl === 'number' ? h('span', { class: ['day-pl', mt.pl > 0 ? 'win' : mt.pl < 0 ? 'loss' : ''].join(' ').trim(), 'aria-hidden': 'true' }, (mt.pl > 0 ? 'Profit ' : mt.pl < 0 ? 'Loss ' : 'Even ') + money(mt.pl)) : null,
          mt && mt.words ? h('span', { class: 'day-words', 'aria-hidden': 'true' }, plural(mt.words, 'word', 'words')) : null,
          mt && mt.thumb ? h('img', { class: 'day-thumb', src: mt.thumb, alt: '', loading: 'lazy' }) : null)));
    }
    tbody.append(tr);
  }

  const table = h('table', { class: 'cal' },
    h('caption', { class: 'sr-only' }, `${name} ${year}. Each day links to its journal entry.`),
    h('thead', null, h('tr', null, WEEKDAYS.map(w => h('th', { scope: 'col', abbr: w }, w.slice(0, 3))))),
    tbody);

  return [crumbs([{ label: 'Journal', href: '#/' }, { label: String(year), href: `#/${year}` }, { label: name }]), head, table];
}

/* ---------- Day view (editor) ---------- */

async function dayView(year, month, day, token) {
  const date = keyOf(year, month, day);
  const stored = await getEntry(date);
  if (token !== viewToken) return [];

  const dow = (new Date(year, month - 1, day).getDay() + 6) % 7;
  const prev = shiftDay(year, month, day, -1);
  const next = shiftDay(year, month, day, 1);
  const dayLink = p => `#/${p.y}/${p.m}/${p.d}`;

  let mood = stored?.mood || 0;
  let savedRange = null;
  let dirty = false;
  let saveTimer;
  let selectedFig = null;

  /* header */
  const status = h('span', { class: 'save-state', role: 'status', 'aria-live': 'polite' }, stored ? 'Saved' : '');
  const closeBtn = h('a', { class: 'icon-btn bordered close-btn', href: base.hash, 'aria-label': 'Close entry', title: 'Close (Esc)', html: ICON.close });
  const nav = h('div', { class: 'modal-head' },
    h('div', { class: 'modal-head-l' },
      stepBtn(dayLink(prev), `Previous day, ${prev.d} ${MONTHS[prev.m - 1]}`, ICON.left),
      h('h2', { class: 'date', id: 'dlgTitle' }, h('strong', null, WEEKDAYS[dow]), ` ${day} ${MONTHS[month - 1]} ${year}`),
      stepBtn(dayLink(next), `Next day, ${next.d} ${MONTHS[next.m - 1]}`, ICON.right)),
    h('div', { class: 'modal-head-r' }, status, closeBtn));

  const titleInput = h('textarea', {
    class: 'title-input', id: 'entryTitle', rows: 1, maxlength: 120, autocomplete: 'off', spellcheck: 'true',
    placeholder: 'Give this day a title', 'aria-label': 'Entry title',
  });
  titleInput.value = stored?.title || '';
  const fitTitle = () => { titleInput.style.height = 'auto'; titleInput.style.height = titleInput.scrollHeight + 'px'; };

  /* mood */
  const moodSet = h('fieldset', { class: 'mood' }, h('legend', null, 'How did the day feel?'),
    MOODS.map(mo => h('label', null,
      h('input', { type: 'radio', name: 'mood', value: mo.v, checked: mood === mo.v, onclick: e => {
        // clicking the selected option again clears it
        if (mood === mo.v) { e.target.checked = false; mood = 0; } else mood = mo.v;
        queueSave();
      } }),
      h('span', { style: `--c:var(--mood-${mo.v})` }, mo.label))));

  /* trade log */
  const T0 = stored?.trade || {};
  let tType = T0.type === 'option' ? 'option' : 'stock';
  const numField = (id, val, ph) => {
    const el = h('input', { type: 'text', inputmode: 'decimal', id, autocomplete: 'off', placeholder: ph });
    el.value = val == null ? '' : String(val);
    return el;
  };
  const fSymbol = h('input', { type: 'text', id: 'trSymbol', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'e.g. SOFI' });
  fSymbol.value = T0.symbol || '';
  const fQty = numField('trQty', T0.qty, '0');
  const fBuy = numField('trBuy', T0.buy, '0.00');
  const fSell = numField('trSell', T0.sell, '0.00');
  const fFees = numField('trFees', T0.fees, '0.00');
  const lblQty = h('label', { for: 'trQty' });
  const lblBuy = h('label', { for: 'trBuy' });
  const lblSell = h('label', { for: 'trSell' });
  const tradeHint = h('p', { class: 'trade-hint', id: 'trHint' });
  const tradeOut = h('div', { class: 'trade-out', role: 'status', 'aria-live': 'polite' });
  const tradeBadge = h('span', { class: 'trade-badge' });
  const typeRadios = [['stock', 'Stock'], ['option', 'Options']].map(([v, label]) => h('label', null,
    h('input', { type: 'radio', name: 'tradeType', value: v, checked: tType === v, onchange: () => { tType = v; tradeChanged(); } }),
    h('span', null, label)));

  const parseNum = el => {
    const t = el.value.replace(/[$,\s]/g, '');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  function readTrade() {
    const vals = { qty: parseNum(fQty), buy: parseNum(fBuy), sell: parseNum(fSell), fees: parseNum(fFees) };
    return cleanTrade({ type: tType, symbol: fSymbol.value, ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number.isNaN(v) ? null : v])) });
  }
  function renderTrade() {
    const opt = tType === 'option';
    lblQty.textContent = opt ? 'Contracts' : 'Shares';
    lblBuy.textContent = opt ? 'Bought price per share' : 'Bought price';
    lblSell.textContent = opt ? 'Sold price per share' : 'Sold price';
    tradeHint.textContent = opt
      ? 'Option prices are quoted per share, and one contract covers 100 shares, so the total is price × contracts × 100.'
      : 'Leave sold price empty if you still hold it. Type the price you are aiming for to see the potential result.';
    let bad = false;
    for (const el of [fQty, fBuy, fSell, fFees]) {
      const isBad = Number.isNaN(parseNum(el));
      el.setAttribute('aria-invalid', isBad ? 'true' : 'false');
      bad = bad || isBad;
    }
    const t = readTrade();
    const r = tradeResult(t);
    const tone = r ? (r.pl > 0 ? ' win' : r.pl < 0 ? ' loss' : '') : '';
    tradeOut.className = 'trade-out' + tone;
    tradeBadge.className = 'trade-badge' + tone;
    tradeBadge.textContent = r ? `${r.pl < 0 ? 'Loss' : r.pl > 0 ? 'Profit' : 'Even'} ${money(r.pl)}` : '';
    if (bad) { tradeOut.replaceChildren('Use numbers only, like 12.50. Commas and a $ sign are fine.'); return; }
    if (r) {
      tradeOut.replaceChildren(
        h('strong', { class: 'trade-big' }, `${r.pl < 0 ? 'Loss' : r.pl > 0 ? 'Profit' : 'Break-even'} ${money(r.pl)}`,
          r.pct != null ? ` (${r.pct > 0 ? '+' : r.pct < 0 ? '−' : ''}${Math.abs(r.pct).toFixed(1)}%)` : ''),
        h('span', { class: 'trade-detail' }, `Paid ${money(r.cost)} · Received ${money(r.proceeds)}${r.fees ? ' · Fees ' + money(r.fees) : ''}`));
    } else if (t && t.qty && t.buy != null) {
      tradeOut.replaceChildren(`Position cost ${money(t.buy * t.qty * optionMultiplier(tType))}. Add a sold price to see profit or loss.`);
    } else {
      tradeOut.replaceChildren(`Fill in ${opt ? 'contracts' : 'shares'}, bought price and sold price to see profit or loss.`);
    }
  }
  function tradeChanged() { renderTrade(); queueSave(); }
  [fSymbol, fQty, fBuy, fSell, fFees].forEach(el => el.addEventListener('input', tradeChanged));
  fSymbol.addEventListener('input', () => { fSymbol.value = fSymbol.value.toUpperCase(); });
  const fieldBox = (lbl, el) => h('div', { class: 'field' }, lbl, el);
  const tradeSection = h('details', { class: 'trade', open: !!stored?.trade },
    h('summary', null, h('span', null, 'Trade log'), h('span', { class: 'trade-opt' }, 'optional'), tradeBadge),
    h('div', { class: 'trade-body' },
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'What did you trade?' }, typeRadios),
      h('div', { class: 'trade-grid' },
        fieldBox(h('label', { for: 'trSymbol' }, 'Symbol'), fSymbol),
        fieldBox(lblQty, fQty),
        fieldBox(lblBuy, fBuy),
        fieldBox(lblSell, fSell),
        fieldBox(h('label', { for: 'trFees' }, 'Fees (optional)'), fFees)),
      tradeHint, tradeOut));
  tradeSection.querySelectorAll('input[type="text"]').forEach(el => el.setAttribute('aria-describedby', 'trHint'));

  /* editor */
  const body = h('div', {
    class: 'editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
    'aria-label': 'Journal entry', 'data-placeholder': 'Write about your day. Press the Add photo button to put a picture below the line you are on.',
  });
  body.innerHTML = cleanHTML(stored?.html) || '<p><br></p>';
  body.querySelectorAll('figure.photo').forEach(enhanceFigure);
  document.execCommand('defaultParagraphSeparator', false, 'p');

  const photoBar = buildPhotoBar();
  photoBar.hidden = true;

  /* toolbar */
  const cmd = (label, content, fn, extra) => {
    const b = h('button', { class: 'tb', type: 'button', 'aria-label': label, title: label, 'aria-pressed': 'false', ...extra });
    if (typeof content === 'string' && content.startsWith('<')) b.innerHTML = content; else b.textContent = content;
    b.addEventListener('mousedown', e => e.preventDefault()); // keep text selection
    b.addEventListener('click', () => { restoreRange(); fn(); body.focus(); onInput(); refreshToolbar(); });
    return b;
  };
  const tbBold = cmd('Bold', 'B', () => document.execCommand('bold'));
  tbBold.style.fontWeight = '800';
  const tbItalic = cmd('Italic', 'I', () => document.execCommand('italic'));
  tbItalic.style.fontStyle = 'italic';
  const tbHead = cmd('Heading', 'H', () => toggleBlock('h2'));
  const tbList = cmd('Bulleted list', ICON.list, () => document.execCommand('insertUnorderedList'));
  const tbQuote = cmd('Quote', ICON.quote, () => toggleBlock('blockquote'));
  const addPhoto = h('button', { class: 'tb photo-add', type: 'button', onclick: () => { rememberRange(); $filePicker.click(); } },
    h('span', { html: ICON.photo }), 'Add photo');
  addPhoto.addEventListener('mousedown', e => e.preventDefault());
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    tbBold, tbItalic, h('span', { class: 'sep', 'aria-hidden': 'true' }), tbHead, tbList, tbQuote, addPhoto);

  const foot = h('div', { class: 'day-foot' },
    h('span', { id: 'wordCount' }),
    stored ? h('button', { class: 'btn btn-danger', type: 'button', onclick: deleteEntry }, 'Delete this entry') : null);

  const memories = onThisDay(month, day, year);
  const memorySection = memories.length
    ? h('section', { class: 'memories in-modal', 'aria-labelledby': 'memHeadDay' },
      h('h3', { id: 'memHeadDay' }, `Also on ${day} ${MONTHS[month - 1]}`),
      h('div', { class: 'memory-list' }, memories.map(memoryLink)))
    : null;

  const wrapEl = h('div', { class: 'pagewrap' }, body, photoBar);

  /* ---- behaviours ---- */

  function toggleBlock(tag) {
    const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    document.execCommand('formatBlock', false, cur === tag ? 'p' : tag);
  }

  function refreshToolbar() {
    const sel = document.getSelection();
    if (!sel.anchorNode || !body.contains(sel.anchorNode)) return;
    const blk = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    const set = (b, on) => b.setAttribute('aria-pressed', on ? 'true' : 'false');
    set(tbBold, document.queryCommandState('bold'));
    set(tbItalic, document.queryCommandState('italic'));
    set(tbHead, blk === 'h2');
    set(tbQuote, blk === 'blockquote');
    set(tbList, document.queryCommandState('insertUnorderedList'));
  }

  function rememberRange() {
    const sel = document.getSelection();
    if (sel.rangeCount && body.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    if (!savedRange) return;
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  const onSelectionChange = () => { rememberRange(); refreshToolbar(); };
  document.addEventListener('selectionchange', onSelectionChange);

  function blockOf(node) {
    while (node && node.parentNode !== body) node = node.parentNode;
    return node && node !== body ? node : null;
  }

  function ensureParagraph() {
    if (!body.firstElementChild) body.innerHTML = '<p><br></p>';
  }

  function updateEmptyState() {
    const hasText = body.textContent.trim().length > 0;
    const hasFig = !!body.querySelector('figure.photo');
    body.classList.toggle('is-empty', !hasText && !hasFig && body.children.length <= 1);
    const plain = body.innerText.trim();
    const words = plain ? plain.split(/\s+/).length : 0;
    const photos = body.querySelectorAll('figure.photo').length;
    const wc = document.getElementById('wordCount');
    if (wc) wc.textContent = plural(words, 'word', 'words') + (photos ? ` · ${plural(photos, 'photo', 'photos')}` : '');
  }

  function enhanceFigure(fig) {
    fig.classList.add('photo');
    fig.setAttribute('contenteditable', 'false');
    fig.setAttribute('tabindex', '0');
    fig.setAttribute('role', 'group');
    fig.setAttribute('aria-label', 'Photo. Press Delete to remove.');
    let cap = fig.querySelector('figcaption');
    if (!cap) { cap = document.createElement('figcaption'); fig.append(cap); }
    cap.setAttribute('contenteditable', 'true');
    cap.setAttribute('data-placeholder', 'Add a caption');
    cap.setAttribute('role', 'textbox');
    cap.setAttribute('aria-label', 'Photo caption');
    if (!fig.dataset.size) fig.dataset.size = 'wide';
  }

  function makeFigure(src) {
    const fig = document.createElement('figure');
    fig.dataset.size = 'wide';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    fig.append(img);
    enhanceFigure(fig);
    return fig;
  }

  async function addPhotos(files, range) {
    const images = [...files].filter(f => f.type.startsWith('image/'));
    if (!images.length) { toast('That file is not an image. Choose a JPG, PNG, WebP or GIF.'); return; }
    let anchor = null;
    if (range && body.contains(range.startContainer)) anchor = blockOf(range.startContainer);
    let last = null;
    for (const file of images) {
      try {
        const src = await compressImage(file);
        const fig = makeFigure(src);
        if (last) last.after(fig);
        else if (anchor) {
          const isEmptyLine = anchor.tagName === 'P' && !anchor.textContent.trim() && !anchor.querySelector('img');
          anchor.after(fig);
          if (isEmptyLine && anchor.nextElementSibling === fig) anchor.remove();
        } else body.append(fig);
        last = fig;
      } catch {
        toast(`Couldn't read ${file.name}. Try a JPG or PNG.`);
      }
    }
    if (!last) return;
    if (!last.nextElementSibling || last.nextElementSibling.matches('figure')) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      last.after(p);
    }
    const r = document.createRange();
    r.setStart(last.nextElementSibling, 0);
    r.collapse(true);
    savedRange = r;
    selectFigure(last);
    last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onInput();
  }

  /* photo bar */
  function buildPhotoBar() {
    const bar = h('div', { class: 'photobar', role: 'toolbar', 'aria-label': 'Photo options' });
    const btn = (label, text, fn, cls) => {
      const b = h('button', { type: 'button', class: cls || '', 'aria-label': label, title: label, 'data-size': fn.size || false }, text);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { fn(); positionBar(); });
      return b;
    };
    const size = s => { const f = () => { if (selectedFig) { selectedFig.dataset.size = s; onInput(); syncSizeButtons(); } }; f.size = s; return f; };
    bar.append(
      btn('Small photo', 'Small', size('small')),
      btn('Wide photo', 'Wide', size('wide')),
      btn('Full-width photo', 'Full', size('full')),
      btn('Move photo up', h('span', { html: ICON.up }), () => moveFig(-1)),
      btn('Move photo down', h('span', { html: ICON.down }), () => moveFig(1)),
      btn('Remove photo', h('span', { html: ICON.trash }), removeFig, 'rm'));
    return bar;
  }

  function syncSizeButtons() {
    photoBar.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(selectedFig?.dataset.size === b.dataset.size)));
  }

  function selectFigure(fig) {
    if (selectedFig === fig) { positionBar(); return; }
    selectedFig?.classList.remove('selected');
    selectedFig = fig;
    if (!fig) { photoBar.hidden = true; return; }
    fig.classList.add('selected');
    photoBar.hidden = false;
    syncSizeButtons();
    positionBar();
  }

  function positionBar() {
    if (!selectedFig) return;
    const wr = wrapEl.getBoundingClientRect();
    const fr = selectedFig.getBoundingClientRect();
    const bw = photoBar.offsetWidth;
    let left = fr.left - wr.left + 8;
    left = Math.max(0, Math.min(left, wr.width - bw));
    photoBar.style.left = left + 'px';
    photoBar.style.top = Math.max(8, fr.top - wr.top + 8) + 'px';
  }

  function moveFig(dir) {
    const f = selectedFig;
    if (!f) return;
    const sib = dir < 0 ? f.previousElementSibling : f.nextElementSibling;
    if (!sib) return;
    if (dir < 0) sib.before(f); else sib.after(f);
    onInput();
    f.focus({ preventScroll: true });
    f.scrollIntoView({ block: 'nearest' });
  }

  function removeFig() {
    const f = selectedFig;
    if (!f) return;
    const next = f.nextElementSibling || f.previousElementSibling;
    selectFigure(null);
    f.remove();
    ensureParagraph();
    onInput();
    toast('Photo removed');
    (next || body).focus?.();
  }

  /* saving */
  function serialize() {
    const clone = body.cloneNode(true);
    clone.querySelectorAll('figure.photo').forEach(f => {
      f.classList.remove('selected');
      f.removeAttribute('contenteditable');
      f.removeAttribute('tabindex');
      f.removeAttribute('role');
      f.removeAttribute('aria-label');
      const cap = f.querySelector('figcaption');
      const img = f.querySelector('img');
      if (img) img.alt = cap ? cap.textContent.trim() : '';
      if (cap && !cap.textContent.trim()) cap.remove();
    });
    clone.querySelectorAll('figcaption').forEach(c => { c.removeAttribute('contenteditable'); c.removeAttribute('data-placeholder'); c.removeAttribute('role'); c.removeAttribute('aria-label'); });
    return clone.innerHTML;
  }

  function queueSave() {
    dirty = true;
    status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_DELAY);
  }

  async function persist() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    const html = serialize();
    const entry = { date, title: titleInput.value.trim(), mood, html, trade: readTrade(), updated: Date.now() };
    const hasContent = entry.title || mood || entry.trade || /<img/.test(html) || (body.textContent || '').trim();
    try {
      if (!hasContent) {
        await removeEntry(date);
        meta.delete(date);
        status.textContent = '';
      } else {
        const m = await buildMeta(entry);
        await putEntry(entry, m);
        meta.set(date, m);
        status.textContent = 'Saved';
      }
    } catch (err) {
      dirty = true;
      status.textContent = 'Not saved';
      toast(err && err.name === 'QuotaExceededError'
        ? 'Not saved: browser storage is full. Download a backup and remove some photos.'
        : 'Not saved. Check that your browser allows site storage.');
    }
  }

  function onInput() {
    updateEmptyState();
    queueSave();
    if (selectedFig) positionBar();
  }

  async function deleteEntry() {
    if (!window.confirm(`Delete the entry for ${day} ${MONTHS[month - 1]} ${year}? This cannot be undone.`)) return;
    dirty = false;
    clearTimeout(saveTimer);
    await removeEntry(date);
    meta.delete(date);
    toast('Entry deleted');
    location.hash = base.hash;
  }

  /* events */
  titleInput.addEventListener('input', () => { fitTitle(); queueSave(); });
  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); body.focus(); }
  });
  body.addEventListener('input', onInput);

  body.addEventListener('keydown', e => {
    const fig = e.target.closest?.('figure.photo');
    if (fig && e.target === fig && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      selectFigure(fig);
      removeFig();
    }
  });

  const onPointer = e => {
    const fig = e.target.closest?.('figure.photo');
    if (fig && body.contains(fig)) selectFigure(fig);
    else if (!photoBar.contains(e.target)) selectFigure(null);
  };
  document.addEventListener('pointerdown', onPointer);
  body.addEventListener('focusin', e => {
    const fig = e.target.closest?.('figure.photo');
    if (fig) selectFigure(fig);
  });
  window.addEventListener('resize', positionBar);

  body.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); rememberRange(); addPhotos(files, savedRange); return; }
    // paste text only, so outside styles don't leak in
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  body.addEventListener('dragover', e => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); body.classList.add('dragover'); }
  });
  body.addEventListener('dragleave', () => body.classList.remove('dragover'));
  body.addEventListener('drop', e => {
    body.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    e.preventDefault();
    let range = null;
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(e.clientX, e.clientY);
    else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
    }
    addPhotos(files, range || savedRange);
  });

  const onPick = () => {
    const files = $filePicker.files;
    if (files && files.length) addPhotos(files, savedRange);
    $filePicker.value = '';
  };
  $filePicker.onchange = onPick;

  const onUnload = () => { if (dirty) persist(); };
  const onVisibility = () => { if (document.hidden && dirty) persist(); };
  window.addEventListener('pagehide', onUnload);
  document.addEventListener('visibilitychange', onVisibility);

  activeEditor = {
    async flush() {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', positionBar);
      window.removeEventListener('resize', fitTitle);
      window.removeEventListener('pagehide', onUnload);
      $filePicker.onchange = null;
      await persist();
    },
  };

  updateEmptyState();
  renderTrade();

  requestAnimationFrame(fitTitle);
  window.addEventListener('resize', fitTitle);

  const dialog = h('dialog', { class: 'modal', 'aria-labelledby': 'dlgTitle' },
    h('div', { class: 'panel' },
      nav,
      h('div', { class: 'panel-body' }, titleInput, moodSet, tradeSection, toolbar, wrapEl, foot, memorySection)));
  // Esc and a click on the dimmed backdrop both close the entry and return to the page behind it
  dialog.addEventListener('cancel', e => { e.preventDefault(); location.hash = base.hash; });
  dialog.addEventListener('pointerdown', e => { if (e.target === dialog) location.hash = base.hash; });
  return dialog;
}

/* ---------- Notebook: sections > topics ---------- */

const NB_COLORS = ['var(--accent)', 'var(--mood-4)', 'var(--mood-5)', 'var(--mood-1)', 'var(--mood-2)', 'var(--mood-3)'];
const nbSections = []; // kept sorted by .order
const nbNotes = new Map(); // id -> { id, section, title, html, text, words, created, updated }
let nbFocus = null; // 'name' | 'title': what to focus after the next notebook render

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const validId = s => typeof s === 'string' && /^[a-z0-9]{1,40}$/i.test(s);
const nbHref = (sid, nid) => '#/notebook' + (sid ? '/' + sid : '') + (nid ? '/' + nid : '');
const sectionNotes = sid => [...nbNotes.values()].filter(n => n.section === sid).sort((a, b) => b.updated - a.updated);

function fmtShort(ts) {
  const d = new Date(ts);
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
}

function plainText(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  doc.body.querySelectorAll('p,h2,h3,li,blockquote,div,br').forEach(n => n.after(' '));
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

const removeNoteRecord = id => dbWrite(['notes', 'deleted'], tx => {
  tx.objectStore('notes').delete(id);
  tx.objectStore('deleted').put({ key: `n:${id}`, updated: Date.now() });
});

async function removeSection(id) {
  const ids = sectionNotes(id).map(n => n.id);
  const t = Date.now();
  await dbWrite(['sections', 'notes', 'deleted'], tx => {
    tx.objectStore('sections').delete(id);
    tx.objectStore('deleted').put({ key: `s:${id}`, updated: t });
    ids.forEach(i => { tx.objectStore('notes').delete(i); tx.objectStore('deleted').put({ key: `n:${i}`, updated: t }); });
  });
  const at = nbSections.findIndex(s => s.id === id);
  if (at !== -1) nbSections.splice(at, 1);
  ids.forEach(i => nbNotes.delete(i));
}

function noteToolbar(body, onChange) {
  const btns = [];
  const block = () => (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
  const toggleBlock = tag => document.execCommand('formatBlock', false, block() === tag ? 'p' : tag);
  const refresh = () => {
    const sel = document.getSelection();
    if (!sel.anchorNode || !body.contains(sel.anchorNode)) return;
    for (const [b, state] of btns) b.setAttribute('aria-pressed', String(!!state()));
  };
  const mk = (label, content, run, state) => {
    const b = h('button', { class: 'tb', type: 'button', 'aria-label': label, title: label, 'aria-pressed': 'false' });
    if (content.startsWith('<')) b.innerHTML = content; else b.textContent = content;
    b.addEventListener('mousedown', e => e.preventDefault()); // keep the text selection
    b.addEventListener('click', () => { body.focus(); run(); onChange(); refresh(); });
    btns.push([b, state]);
    return b;
  };
  const bold = mk('Bold', 'B', () => document.execCommand('bold'), () => document.queryCommandState('bold'));
  bold.style.fontWeight = '800';
  const italic = mk('Italic', 'I', () => document.execCommand('italic'), () => document.queryCommandState('italic'));
  italic.style.fontStyle = 'italic';
  const bar = h('div', { class: 'toolbar nb-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    bold, italic,
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    mk('Heading', 'H', () => toggleBlock('h2'), () => block() === 'h2'),
    mk('Bulleted list', ICON.list, () => document.execCommand('insertUnorderedList'), () => document.queryCommandState('insertUnorderedList')),
    mk('Numbered list', '1.', () => document.execCommand('insertOrderedList'), () => document.queryCommandState('insertOrderedList')),
    mk('Quote', ICON.quote, () => toggleBlock('blockquote'), () => block() === 'blockquote'));
  return { bar, refresh };
}

function notebookView(sid, nid) {
  const section = nbSections.find(s => s.id === sid) || null;
  const stored = section && nid ? nbNotes.get(nid) : null;
  const note = stored && stored.section === section.id ? stored : null;
  const pane = note ? 'note' : section ? 'topics' : 'sections';

  const want = nbHref(section?.id, note?.id);
  if (location.hash !== want) history.replaceState(null, '', want); // unknown ids fall back quietly

  const focusWanted = nbFocus;
  nbFocus = null;
  let gone = false; // set once the section or note is deleted, so nothing writes it back
  const savers = [];
  const cleanups = [];

  /* --- sections pane --- */
  const secList = h('ul', { class: 'nb-list' });
  const renderSections = () => secList.replaceChildren(...nbSections.map(s => {
    const n = sectionNotes(s.id).length;
    return h('li', null, h('a', {
      class: 'nb-sec', href: nbHref(s.id), style: `--c:${NB_COLORS[s.color % NB_COLORS.length]}`,
      'aria-current': section && s.id === section.id ? 'page' : false,
    },
      h('span', { class: 'nb-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'nb-sec-name' }, s.name || 'Untitled section'),
      h('span', { class: 'nb-count' }, String(n), h('span', { class: 'sr-only' }, n === 1 ? ' topic' : ' topics'))));
  }));

  async function addSection() {
    const s = {
      id: newId(), name: 'New section', color: nbSections.length % NB_COLORS.length,
      order: nbSections.reduce((m, x) => Math.max(m, x.order), 0) + 1, created: Date.now(), updated: Date.now(),
    };
    try { await dbPut('sections', s); } catch { toast('Couldn’t add the section. Check that your browser allows site storage.'); return; }
    nbSections.push(s);
    nbFocus = 'name';
    location.hash = nbHref(s.id);
  }

  const sectionsPane = h('aside', { class: 'nb-pane nb-sections', 'aria-label': 'Sections' },
    h('div', { class: 'nb-pane-head' },
      h('h2', null, 'Sections'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: addSection }, h('span', { html: ICON.plus }), 'New section')),
    nbSections.length
      ? secList
      : h('p', { class: 'nb-hint' }, 'Sections are the big headings, like Work, Recipes or Ideas. Topics live inside them. Make your first section to begin.'));
  renderSections();

  /* --- topics pane --- */
  let topicsPane;
  let renderTopics = () => {};
  if (section) {
    let nameDirty = false;
    let nameTimer;
    const nameInput = h('input', {
      class: 'nb-name', type: 'text', maxlength: 60, autocomplete: 'off', spellcheck: 'true',
      placeholder: 'Section name', 'aria-label': 'Section name',
    });
    nameInput.value = section.name;
    const persistSection = async () => {
      clearTimeout(nameTimer);
      if (!nameDirty || gone) return;
      nameDirty = false;
      section.name = section.name.trim() || 'Untitled section';
      section.updated = Date.now();
      try { await dbPut('sections', section); } catch { nameDirty = true; toast('Section name not saved.'); }
    };
    nameInput.addEventListener('input', () => {
      section.name = nameInput.value;
      nameDirty = true;
      renderSections();
      clearTimeout(nameTimer);
      nameTimer = setTimeout(persistSection, SAVE_DELAY);
    });
    nameInput.addEventListener('blur', () => { if (!nameInput.value.trim()) { nameInput.value = 'Untitled section'; section.name = nameInput.value; nameDirty = true; renderSections(); } persistSection(); });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });
    savers.push(persistSection);

    const at = () => nbSections.indexOf(section);
    const upBtn = h('button', { class: 'icon-btn bordered', type: 'button', 'aria-label': 'Move section up', title: 'Move section up', html: ICON.up, onclick: () => moveSection(-1) });
    const downBtn = h('button', { class: 'icon-btn bordered', type: 'button', 'aria-label': 'Move section down', title: 'Move section down', html: ICON.down, onclick: () => moveSection(1) });
    const syncMove = () => { upBtn.disabled = at() <= 0; downBtn.disabled = at() >= nbSections.length - 1; };
    async function moveSection(dir) {
      const j = at() + dir;
      if (j < 0 || j >= nbSections.length) return;
      const a = section, b = nbSections[j];
      [a.order, b.order] = [b.order, a.order];
      a.updated = b.updated = Date.now();
      await dbWrite('sections', tx => { tx.objectStore('sections').put(a); tx.objectStore('sections').put(b); });
      nbSections.sort((x, y) => x.order - y.order);
      renderSections();
      syncMove();
    }
    async function deleteSection() {
      const n = sectionNotes(section.id).length;
      const what = n ? `“${section.name}” and its ${plural(n, 'topic', 'topics')}` : `“${section.name}”`;
      if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
      gone = true;
      await removeSection(section.id);
      toast('Section deleted');
      location.hash = nbHref();
    }
    async function addNote() {
      const t = Date.now();
      const n = { id: newId(), section: section.id, title: '', html: '', text: '', words: 0, created: t, updated: t };
      try { await dbPut('notes', n); } catch { toast('Couldn’t add the topic. Check that your browser allows site storage.'); return; }
      nbNotes.set(n.id, n);
      nbFocus = 'title';
      location.hash = nbHref(section.id, n.id);
    }

    const topicSub = h('p', { class: 'nb-sub' });
    const topicList = h('ul', { class: 'nb-list nb-topic-list' });
    renderTopics = () => {
      const list = sectionNotes(section.id);
      topicSub.textContent = list.length ? plural(list.length, 'topic', 'topics') : 'No topics yet';
      topicList.replaceChildren(...list.map(n => h('li', null, h('a', {
        class: 'nb-topic', href: nbHref(section.id, n.id), 'aria-current': note && n.id === note.id ? 'page' : false,
      },
        h('span', { class: 'nb-topic-title' }, n.title || 'Untitled topic'),
        n.text ? h('span', { class: 'nb-topic-snip' }, n.text.slice(0, 90)) : null,
        h('span', { class: 'nb-topic-date' }, fmtShort(n.updated))))));
    };
    renderTopics();
    syncMove();

    topicsPane = h('section', { class: 'nb-pane nb-topics', 'aria-label': `Topics in ${section.name}` },
      h('a', { class: 'nb-back', href: nbHref() }, h('span', { html: ICON.left }), 'All sections'),
      h('div', { class: 'nb-sec-head', style: `--c:${NB_COLORS[section.color % NB_COLORS.length]}` },
        h('span', { class: 'nb-dot big', 'aria-hidden': 'true' }),
        nameInput),
      h('div', { class: 'nb-sec-tools' }, topicSub, h('span', { class: 'nb-spacer' }), upBtn, downBtn,
        h('button', { class: 'icon-btn bordered', type: 'button', 'aria-label': 'Delete section', title: 'Delete section', html: ICON.trash, onclick: deleteSection })),
      h('button', { class: 'btn btn-primary nb-new', type: 'button', onclick: addNote }, h('span', { html: ICON.plus }), 'New topic'),
      topicList,
      topicList.children.length ? null : h('p', { class: 'nb-hint' }, 'Topics are your individual notes. Add one to start writing in this section.'));
  } else {
    topicsPane = h('section', { class: 'nb-pane nb-topics nb-idle', 'aria-label': 'Topics' },
      h('p', { class: 'nb-hint' }, nbSections.length ? 'Choose a section to see its topics.' : 'Your topics will appear here.'));
  }

  /* --- note pane --- */
  let notePane;
  let focusNote = () => {};
  if (note) {
    let dirty = false;
    let timer;
    const status = h('span', { class: 'save-state', role: 'status', 'aria-live': 'polite' }, note.title || note.text ? 'Saved' : '');
    const titleInput = h('textarea', {
      class: 'title-input', rows: 1, maxlength: 120, autocomplete: 'off', spellcheck: 'true',
      placeholder: 'Topic title', 'aria-label': 'Topic title',
    });
    titleInput.value = note.title;
    const fitTitle = () => { titleInput.style.height = 'auto'; titleInput.style.height = titleInput.scrollHeight + 'px'; };

    const body = h('div', {
      class: 'editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
      'aria-label': 'Topic notes', 'data-placeholder': 'Start writing…',
    });
    body.innerHTML = cleanHTML(note.html) || '<p><br></p>';
    document.execCommand('defaultParagraphSeparator', false, 'p');

    const wordCount = h('span');
    const edited = h('span', { class: 'nb-edited' });
    const refreshFoot = () => {
      const t = body.innerText.trim();
      wordCount.textContent = plural(t ? t.split(/\s+/).length : 0, 'word', 'words');
      edited.textContent = note.text || note.title ? ` · Edited ${fmtShort(note.updated)}` : '';
    };
    const refreshEmpty = () => body.classList.toggle('is-empty', !body.textContent.trim() && body.children.length <= 1);

    async function persistNote(leaving) {
      clearTimeout(timer);
      if (gone) return;
      const html = body.innerHTML;
      const title = titleInput.value.trim();
      const text = plainText(html);
      try {
        if (leaving && !title && !text) { // never keep an untouched, empty topic
          await removeNoteRecord(note.id);
          nbNotes.delete(note.id);
          return;
        }
        if (!dirty) return;
        dirty = false;
        Object.assign(note, { title, html, text, words: text ? text.split(' ').length : 0, updated: Date.now() });
        await dbPut('notes', note);
        nbNotes.set(note.id, note);
        status.textContent = 'Saved';
        renderTopics();
        renderSections();
        refreshFoot();
      } catch (err) {
        dirty = true;
        status.textContent = 'Not saved';
        toast(err && err.name === 'QuotaExceededError'
          ? 'Not saved: browser storage is full. Download a backup and remove some notes.'
          : 'Not saved. Check that your browser allows site storage.');
      }
    }
    const queueSave = () => {
      dirty = true;
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(() => persistNote(false), SAVE_DELAY);
    };
    savers.push(() => persistNote(true));

    const onInput = () => { refreshEmpty(); refreshFoot(); queueSave(); };
    const tb = noteToolbar(body, onInput);
    body.addEventListener('input', onInput);
    body.addEventListener('paste', e => { // text only, so outside styles don't leak in
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    titleInput.addEventListener('input', () => { fitTitle(); queueSave(); });
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });

    document.addEventListener('selectionchange', tb.refresh);
    window.addEventListener('resize', fitTitle);
    const flushSoon = () => { if (dirty) persistNote(false); };
    const onHide = () => { if (document.hidden) flushSoon(); };
    window.addEventListener('pagehide', flushSoon);
    document.addEventListener('visibilitychange', onHide);
    cleanups.push(() => {
      document.removeEventListener('selectionchange', tb.refresh);
      window.removeEventListener('resize', fitTitle);
      window.removeEventListener('pagehide', flushSoon);
      document.removeEventListener('visibilitychange', onHide);
    });

    async function deleteNote() {
      if (!window.confirm(`Delete “${note.title || 'Untitled topic'}”? This cannot be undone.`)) return;
      gone = true;
      await removeNoteRecord(note.id);
      nbNotes.delete(note.id);
      toast('Topic deleted');
      location.hash = nbHref(section.id);
    }

    const moveSel = nbSections.length > 1 ? h('select', { class: 'nb-move', 'aria-label': 'Move this topic to another section' },
      nbSections.map(s => h('option', { value: s.id, selected: s.id === section.id }, s.name || 'Untitled section'))) : null;
    if (moveSel) moveSel.addEventListener('change', async () => {
      const to = moveSel.value;
      dirty = true;
      await persistNote(false);
      note.section = to;
      try { await dbPut('notes', note); } catch { toast('Couldn’t move the topic.'); return; }
      toast(`Moved to “${nbSections.find(s => s.id === to)?.name || 'section'}”`);
      location.hash = nbHref(to, note.id);
    });

    refreshEmpty();
    refreshFoot();
    focusNote = () => { fitTitle(); if (focusWanted === 'title') titleInput.focus({ preventScroll: true }); };

    notePane = h('article', { class: 'nb-pane nb-note', 'aria-label': 'Topic' },
      h('div', { class: 'nb-note-top' },
        h('a', { class: 'nb-back', href: nbHref(section.id) }, h('span', { html: ICON.left }), section.name || 'Untitled section'),
        h('span', { class: 'nb-spacer' }),
        moveSel ? h('label', { class: 'nb-move-wrap' }, h('span', null, 'In'), moveSel) : null,
        status),
      titleInput, tb.bar,
      h('div', { class: 'pagewrap' }, body),
      h('div', { class: 'day-foot' }, h('span', null, wordCount, edited),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: deleteNote }, 'Delete this topic')));
  } else {
    notePane = h('div', { class: 'nb-pane nb-note nb-idle' },
      h('div', { class: 'nb-empty' },
        h('h2', null, section ? 'Pick a topic' : 'Your notebook'),
        h('p', null, section
          ? 'Choose a topic from the list, or add a new one with the New topic button.'
          : 'Organise what you know into sections, and each section into topics. Everything stays in this browser, like your journal.')));
  }

  activeEditor = {
    async flush() {
      cleanups.forEach(fn => fn());
      await Promise.all(savers.map(fn => fn()));
    },
  };

  /* --- page --- */
  const topicTotal = nbNotes.size;
  const head = h('div', { class: 'page-head' },
    h('div', null,
      h('h1', null, 'Notebook'),
      h('p', { class: 'page-sub' }, nbSections.length
        ? `${plural(nbSections.length, 'section', 'sections')} · ${plural(topicTotal, 'topic', 'topics')}`
        : 'Sections hold topics. Start by making a section.')));
  const grid = h('div', { class: 'nb', 'data-pane': pane }, sectionsPane, topicsPane, notePane);

  return {
    nodes: [head, grid],
    title: note ? (note.title || 'Untitled topic') : section ? section.name : 'Notebook',
    mount() {
      if (focusWanted === 'name') { const el = topicsPane.querySelector('.nb-name'); el?.focus({ preventScroll: true }); el?.select(); }
      else if (note) focusNote();
      else $main.focus({ preventScroll: true });
    },
  };
}

/* ---------- Sync (Cloudflare Pages Functions + KV) ---------- */
/* Each record syncs on its own, newest edit wins. Keys: e:<date>, s:<id>, n:<id>.
   If the /api isn't reachable (opened from a file, not set up yet) the app simply stays local. */

const $sync = document.getElementById('syncState');
const syncOn = /^https?:$/.test(location.protocol);
let syncing = false;
let syncAgain = false;
let applying = false; // true while writing pulled data, so it doesn't trigger another sync
let syncTimer;
let lastSync = 0;

function setSync(text, tone) {
  $sync.textContent = text;
  $sync.dataset.tone = tone || '';
}

function scheduleSync(delay = 8000) {
  if (!syncOn || applying || !db) return;
  if (syncing) { syncAgain = true; return; }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

async function api(path, opts) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (!res.ok) throw Object.assign(new Error('api'), { status: res.status });
  return res.json();
}

const itemUrl = key => `/api/item?key=${encodeURIComponent(key)}`;

async function pushItem(key, l) {
  let body;
  if (l.deleted) body = { deleted: true, updated: l.updated };
  else if (key[0] === 'e') {
    const e = await getEntry(key.slice(2));
    if (!e) return;
    body = { updated: e.updated, data: e };
  } else if (key[0] === 's') {
    const x = nbSections.find(v => v.id === key.slice(2));
    if (!x) return;
    body = { updated: x.updated || x.created || 0, data: x };
  } else {
    const x = nbNotes.get(key.slice(2));
    if (!x) return;
    body = { updated: x.updated, data: x };
  }
  try {
    await api(itemUrl(key), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    if (err.status !== 409) throw err; // 409: the server already has something newer; it comes down next time
  }
}

async function applyRemote(key, res) {
  const updated = Number(res.updated) || 0;
  const kind = key[0];
  const id = key.slice(2);
  if (res.deleted) {
    if (kind === 'e') {
      await dbWrite(['entries', 'meta', 'deleted'], tx => {
        tx.objectStore('entries').delete(id);
        tx.objectStore('meta').delete(id);
        tx.objectStore('deleted').put({ key, updated });
      });
      meta.delete(id);
    } else if (kind === 's') {
      await dbWrite(['sections', 'deleted'], tx => { tx.objectStore('sections').delete(id); tx.objectStore('deleted').put({ key, updated }); });
      const at = nbSections.findIndex(v => v.id === id);
      if (at !== -1) nbSections.splice(at, 1);
    } else {
      await dbWrite(['notes', 'deleted'], tx => { tx.objectStore('notes').delete(id); tx.objectStore('deleted').put({ key, updated }); });
      nbNotes.delete(id);
    }
    return;
  }
  const raw = res.data || {};
  if (kind === 'e') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(id) || raw.date !== id) return;
    const entry = {
      date: id,
      title: String(raw.title || '').slice(0, 120),
      mood: [1, 2, 3, 4, 5].includes(raw.mood) ? raw.mood : 0,
      html: cleanHTML(raw.html),
      trade: cleanTrade(raw.trade),
      updated,
    };
    const m = await buildMeta(entry);
    await putEntry(entry, m);
    meta.set(id, m);
  } else if (kind === 's') {
    if (!validId(id) || raw.id !== id) return;
    const sec = {
      id,
      name: String(raw.name || '').trim().slice(0, 60) || 'Untitled section',
      color: Number.isInteger(raw.color) ? Math.abs(raw.color) % NB_COLORS.length : 0,
      order: Number.isFinite(raw.order) ? raw.order : nbSections.length + 1,
      created: Number(raw.created) || updated,
      updated,
    };
    await dbPut('sections', sec);
    const at = nbSections.findIndex(v => v.id === id);
    if (at === -1) nbSections.push(sec); else nbSections[at] = sec;
    nbSections.sort((a, b) => a.order - b.order);
  } else {
    if (!validId(id) || raw.id !== id || !nbSections.some(v => v.id === raw.section)) return;
    const html = cleanHTML(raw.html);
    const text = plainText(html);
    const n = {
      id, section: raw.section, title: String(raw.title || '').slice(0, 120), html, text,
      words: text ? text.split(' ').length : 0, created: Number(raw.created) || updated, updated,
    };
    await dbPut('notes', n);
    nbNotes.set(id, n);
  }
}

async function syncNow() {
  if (!syncOn || syncing || !db || !navigator.onLine) return;
  syncing = true;
  syncAgain = false;
  clearTimeout(syncTimer);
  setSync('Syncing…');
  let pulled = 0;
  try {
    const remote = new Map((await api('/api/list')).map(r => [r.key, r]));

    const local = new Map();
    for (const m of meta.values()) local.set(`e:${m.date}`, { updated: m.updated || 0 });
    for (const x of nbSections) local.set(`s:${x.id}`, { updated: x.updated || x.created || 0 });
    for (const x of nbNotes.values()) local.set(`n:${x.id}`, { updated: x.updated || 0 });
    for (const t of await dbAll('deleted')) {
      const cur = local.get(t.key);
      if (!cur || t.updated >= cur.updated) local.set(t.key, { updated: t.updated, deleted: true });
    }

    // sections first, so topics always have somewhere to land
    const rank = k => (k[0] === 's' ? 0 : k[0] === 'n' ? 1 : 2);
    const keys = [...new Set([...remote.keys(), ...local.keys()])].sort((a, b) => rank(a) - rank(b));
    for (const key of keys) {
      const r = remote.get(key);
      const l = local.get(key);
      const ru = r ? r.updated : -1;
      const lu = l ? l.updated : -1;
      if (ru > lu) {
        const res = await api(itemUrl(key));
        applying = true;
        try { await applyRemote(key, res); } finally { applying = false; }
        pulled++;
      } else if (lu > ru) {
        await pushItem(key, l);
      }
    }
    lastSync = Date.now();
    setSync('Synced', 'ok');
    if (pulled) refreshAfterPull();
  } catch (err) {
    const msg = err.status === 503 ? 'Sync not set up'
      : err.status === 401 || err.status === 403 ? 'Sign in to sync'
      : 'Offline';
    setSync(msg, 'warn');
  } finally {
    syncing = false;
    if (syncAgain) scheduleSync(1500);
  }
}

function refreshAfterPull() {
  const a = document.activeElement;
  const editing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  if (editing || openDialog) toast('Newer changes were synced from another device. Reload to see them.');
  else render();
}

window.addEventListener('online', () => syncNow());
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastSync > 60000) syncNow(); });
setInterval(() => { if (!document.hidden && Date.now() - lastSync > 300000) syncNow(); }, 60000);

/* ---------- Backup ---------- */

async function exportAll() {
  const all = await getAllEntries();
  if (!all.length && !nbSections.length) { toast('Nothing to back up yet. Write an entry or add a notebook section first.'); return; }
  const notes = [...nbNotes.values()];
  const blob = new Blob([JSON.stringify({
    app: 'daybook', version: 2, exported: new Date().toISOString(), entries: all,
    notebook: { sections: nbSections, notes },
  })], { type: 'application/json' });
  const t = todayParts();
  const a = h('a', { href: URL.createObjectURL(blob), download: `daybook-backup-${keyOf(t.y, t.m, t.d)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Backup saved: ${plural(all.length, 'entry', 'entries')}, ${plural(notes.length, 'topic', 'topics')}`);
}

$importPicker.addEventListener('change', async () => {
  const file = $importPicker.files[0];
  $importPicker.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'daybook' || (!Array.isArray(data.entries) && !data.notebook)) throw new Error('shape');
    let count = 0;
    for (const raw of Array.isArray(data.entries) ? data.entries : []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) continue;
      const existing = await getEntry(raw.date);
      if (existing && existing.updated > (raw.updated || 0)) continue;
      const entry = {
        date: raw.date,
        title: String(raw.title || '').slice(0, 120),
        mood: [1, 2, 3, 4, 5].includes(raw.mood) ? raw.mood : 0,
        html: cleanHTML(raw.html),
        trade: cleanTrade(raw.trade),
        updated: Number(raw.updated) || Date.now(),
      };
      const m = await buildMeta(entry);
      await putEntry(entry, m);
      meta.set(entry.date, m);
      count++;
    }

    // notebook: sections already here are kept as they are; topics keep whichever copy is newer
    let topics = 0;
    const nb = data.notebook || {};
    const incoming = (Array.isArray(nb.sections) ? nb.sections : [])
      .filter(r => r && validId(r.id) && !nbSections.some(s => s.id === r.id))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    for (const raw of incoming) {
      const s = {
        id: raw.id,
        name: String(raw.name || '').trim().slice(0, 60) || 'Untitled section',
        color: Number.isInteger(raw.color) ? Math.abs(raw.color) % NB_COLORS.length : 0,
        order: nbSections.reduce((m, x) => Math.max(m, x.order), 0) + 1,
        created: Number(raw.created) || Date.now(),
        updated: Date.now(),
      };
      await dbPut('sections', s);
      nbSections.push(s);
    }
    for (const raw of Array.isArray(nb.notes) ? nb.notes : []) {
      if (!raw || !validId(raw.id) || !nbSections.some(s => s.id === raw.section)) continue;
      const existing = nbNotes.get(raw.id);
      if (existing && existing.updated >= (Number(raw.updated) || 0)) continue;
      const html = cleanHTML(raw.html);
      const text = plainText(html);
      const n = {
        id: raw.id, section: raw.section,
        title: String(raw.title || '').slice(0, 120),
        html, text, words: text ? text.split(' ').length : 0,
        created: Number(raw.created) || Date.now(),
        updated: Number(raw.updated) || Date.now(),
      };
      await dbPut('notes', n);
      nbNotes.set(n.id, n);
      topics++;
    }
    toast(`Restored ${plural(count, 'entry', 'entries')}, ${plural(topics, 'topic', 'topics')}`);
    render();
  } catch {
    toast("That file isn't a Daybook backup. Choose a .json file saved with “Download backup”.");
  }
});

/* ---------- Search box ---------- */

document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('q').value.trim();
  location.hash = q ? `#/search/${encodeURIComponent(q)}` : '#/search';
});

document.addEventListener('keydown', e => {
  const t = e.target;
  const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (e.key === '/' && !typing && !openDialog && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('q').focus();
  }
});

/* ---------- Theme ---------- */

document.getElementById('themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('daybook-theme', next); } catch {}
});

/* ---------- Start ---------- */

(async function init() {
  try {
    db = await openDB();
    for (const m of await getAllMeta()) meta.set(m.date, m);
    // entries saved by an earlier version have no searchable text yet
    if ([...meta.values()].some(m => m.text == null)) {
      for (const entry of await getAllEntries()) {
        const m = await buildMeta(entry);
        await putEntry(entry, m);
        meta.set(entry.date, m);
      }
    }
    nbSections.push(...(await dbAll('sections')).sort((a, b) => a.order - b.order));
    for (const n of await dbAll('notes')) nbNotes.set(n.id, n);
    navigator.storage?.persist?.();
  } catch {
    $main.replaceChildren(h('div', { class: 'empty-note' },
      h('h1', { style: 'font:500 2rem var(--serif);margin-bottom:12px' }, "Daybook can't store entries here"),
      h('p', null, 'Your browser is blocking site storage, which Daybook needs to keep your journal. Turn off private browsing or allow site data for this page, then reload.')));
    return;
  }
  window.addEventListener('hashchange', render);
  render();
  syncNow();
})();
