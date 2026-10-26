/* ابزارهای مشترک فرانت‌اند: API، قالب‌بندی، نمادها، مودال، فرم و مارک‌داون ساده */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf = new Intl.NumberFormat('fa-IR');
const nf1 = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt = (n) => nf.format(Math.round(n ?? 0));
export const fmt1 = (n) => nf1.format(n ?? 0);
export const money = (n) => `${fmt(n)} <small>تومان</small>`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const faDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
export const faDateTime = (iso) => (iso ? new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const faDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fa-IR', { month: 'numeric', day: 'numeric' });
export const discountPct = (p) => (p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

const svg = (d, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cart: svg('<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>', 22),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>', 18),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', 18),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 22),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 20),
  truck: svg('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>', 22),
  shield: svg('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>', 22),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', 22),
  headset: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>', 22),
  check: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>', 18),
  tick: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 40),
  home: svg('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>', 19),
  box: svg('<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>', 19),
  tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', 19),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', 19),
  doc: svg('<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>', 19),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>', 19),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>', 19),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>', 19),
  pin: svg('<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>', 19),
  pulse: svg('<path d="M3 12h4l2.500-7 4 14 2.500-7H21"/>', 19),
  star: svg('<path d="m12 3 2.800 5.800 6.200.9-4.500 4.400 1 6.200L12 17.400 6.500 20.300l1-6.200L3 9.700l6.200-.9z"/>', 18),
  ticket: svg('<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 0 0 4v2h18v-2a2 2 0 0 0 0-4v0a2 2 0 0 0 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>', 19),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 19),
  out: svg('<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>', 19),
};

/* ---------- وضعیت ورود ---------- */
export const auth = { user: null, csrf: null };
export const can = (perm) => !!auth.user && auth.user.permissions.includes(perm);
export const isStaff = () => !!auth.user && auth.user.role !== 'customer';

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api(method, url, body) {
  const headers = {};
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (auth.csrf && method !== 'GET') headers['X-CSRF-Token'] = auth.csrf;
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'ارتباط با سرور برقرار نشد. اینترنت خود را بررسی کنید.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth.user) {
      auth.user = null;
      auth.csrf = null;
      document.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(res.status, data.error || 'خطای ناشناخته', data.fields);
  }
  if (data.csrf) auth.csrf = data.csrf;
  return data;
}
export const GET = (url) => api('GET', url);
export const POST = (url, body = {}) => api('POST', url, body);
export const PUT = (url, body = {}) => api('PUT', url, body);
export const DELETE = (url) => api('DELETE', url);

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function uploadImage(file) {
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'X-CSRF-Token': auth.csrf || '' },
    body: file,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'بارگذاری تصویر ناموفق بود.');
  return data.url;
}

/* ---------- تنظیمات عمومی سایت ---------- */
export const site = { settings: {}, pages: [], palette: [], statuses: {}, roles: {}, categories: [] };

/* ---------- پیام کوتاه ---------- */
let toastTimer;
export function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- نمایش تصویر محصول ---------- */
export const tintStyle = (tint) => `--a:${tint?.[0] ?? '#eee'};--b:${tint?.[1] ?? '#ddd'}`;
export const picture = (item) => (item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : `<span class="emoji" aria-hidden="true">${esc(item.emoji)}</span>`);

export function stars(rating) {
  const r = Math.round(rating || 0);
  return `<span class="stars" aria-label="${fmt(r)} از ۵">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`;
}

export const badge = (text, kind = 'gray') => `<span class="tag tag-${kind}">${esc(text)}</span>`;
const STATUS_KIND = { pending: 'amber', processing: 'blue', shipped: 'violet', delivered: 'green', cancelled: 'red', draft: 'gray', published: 'green', approved: 'green', rejected: 'red' };
export const statusTag = (status, label) => badge(label, STATUS_KIND[status] || 'gray');

/* ---------- مارک‌داون ساده (ایمن: ابتدا همه چیز escape می‌شود) ---------- */
const safeLink = (u) => /^(https?:\/\/|\/uploads\/|#\/|mailto:)/.test(u);
const safeImg = (u) => /^(https:\/\/|\/uploads\/)/.test(u);

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => (safeImg(url) ? `<img src="${url}" alt="${alt}" loading="lazy">` : m))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      if (!safeLink(url)) return label;
      return /^https?:/.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<a href="${url}">${label}</a>`;
    });
}

export function md(source) {
  const lines = String(source ?? '').replace(/\r/g, '').split('\n');
  let html = '';
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) { flushPara(); flushList(); html += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`; continue; }
    if ((m = /^[-*]\s+(.+)$/.exec(line))) { flushPara(); if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = /^\d+[.)]\s+(.+)$/.exec(line))) { flushPara(); if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = /^>\s?(.+)$/.exec(line))) { flushPara(); flushList(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return html;
}

/* ---------- مودال و تأیید ---------- */
export function modal({ title, body, wide = false }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}">
    <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="بستن">${ICON.close}</button></header>
    <div class="modal-body">${body}</div></div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  return { el: dlg, body: $('.modal-body', dlg), close: () => dlg.close() };
}

export function confirmBox(message, { okLabel = 'تأیید', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title: 'تأیید عملیات',
      body: `<p class="confirm-text">${esc(message)}</p>
        <div class="modal-actions"><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button><button type="button" class="btn btn-ghost" data-close>انصراف</button></div>`,
    });
    let ok = false;
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-ok]')) { ok = true; m.close(); } });
    m.el.addEventListener('close', () => resolve(ok));
  });
}

/* ---------- فرم‌ساز ---------- */
export function fieldHtml(f, value, error) {
  const id = `f-${f.name}`;
  const v = value ?? '';
  const common = `id="${id}" name="${f.name}" ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} aria-describedby="e-${f.name}"`;
  let control;
  switch (f.type) {
    case 'textarea':
      control = `<textarea ${common} rows="${f.rows || 4}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}>${esc(v)}</textarea>`;
      break;
    case 'select':
      control = `<select ${common}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'checkbox':
      return `<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}<span class="err" id="e-${f.name}"></span></div>`;
    case 'image':
      control = `<div class="img-field">
        <div class="img-preview" data-preview>${v ? `<img src="${esc(v)}" alt="">` : '<span>بدون تصویر</span>'}</div>
        <div class="img-actions">
          <input type="hidden" name="${f.name}" value="${esc(v)}">
          <label class="btn btn-ghost btn-sm">انتخاب تصویر<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${f.name}" hidden></label>
          <button type="button" class="btn btn-ghost btn-sm" data-action="img-clear" data-name="${f.name}">حذف</button>
        </div></div>`;
      break;
    case 'tint':
      control = `<div class="swatches" role="radiogroup" aria-label="${esc(f.label)}">${site.palette.map((p, i) => `<label class="swatch"><input type="radio" name="${f.name}" value="${i}" ${Number(v) === i ? 'checked' : ''}><span style="${tintStyle(p)}"></span></label>`).join('')}</div>`;
      break;
    case 'markdown':
      control = `<div class="md-editor">
        <div class="md-toolbar" role="toolbar" aria-label="ابزار قالب‌بندی">
          <button type="button" data-md="## ">تیتر</button><button type="button" data-md="**">پررنگ</button>
          <button type="button" data-md="- ">فهرست</button><button type="button" data-md="link">پیوند</button>
          <button type="button" data-action="md-preview" class="md-toggle">پیش‌نمایش</button>
        </div>
        <textarea ${common} rows="${f.rows || 14}">${esc(v)}</textarea>
        <div class="prose md-preview" hidden></div></div>`;
      break;
    default: {
      /* فیلد عددی: متن با کیبورد عددی؛ تا کاربر بتواند ارقام فارسی هم بنویسد (سرور ارقام را یکسان می‌کند) */
      const numeric = f.type === 'number';
      const type = numeric ? 'text' : f.type || 'text';
      const ltr = numeric || f.dir === 'ltr';
      control = `<input ${common} type="${type}" ${numeric ? 'inputmode="numeric"' : ''} value="${esc(v)}" ${ltr ? 'dir="ltr" class="ltr"' : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
    }
  }
  return `<div class="field ${f.full ? 'full' : ''}">
    <label for="${id}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${control}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}<span class="err" id="e-${f.name}" role="alert">${esc(error || '')}</span></div>`;
}

export const formHtml = (fields, values = {}, errors = {}) => fields.map((f) => fieldHtml(f, values[f.name], errors[f.name])).join('');

export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'checkbox') out[f.name] = form.elements[f.name].checked;
    else if (f.type === 'tint') out[f.name] = form.querySelector(`input[name="${f.name}"]:checked`)?.value ?? '0';
    else out[f.name] = form.elements[f.name].value;
  }
  return out;
}

export function showErrors(form, errors = {}) {
  $$('.err', form).forEach((e) => { e.textContent = ''; });
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const el = $(`#e-${name}`, form);
    if (!el || typeof msg !== 'string') continue;
    el.textContent = msg;
    const input = form.elements[name];
    if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
  }
  first?.focus?.();
  return !!first;
}

/* رویدادهای عمومی فرم‌ها: آپلود تصویر، پاک کردن تصویر، ابزار مارک‌داون */
export function wireFormWidgets(root) {
  root.addEventListener('change', async (e) => {
    const input = e.target.closest('input[data-upload]');
    if (!input || !input.files[0]) return;
    const name = input.dataset.upload;
    const wrap = input.closest('.img-field');
    try {
      wrap.classList.add('busy');
      const url = await uploadImage(input.files[0]);
      $(`input[name="${name}"]`, wrap).value = url;
      $('[data-preview]', wrap).innerHTML = `<img src="${esc(url)}" alt="">`;
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      wrap.classList.remove('busy');
      input.value = '';
    }
  });
  root.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-action="img-clear"]');
    if (clear) {
      const wrap = clear.closest('.img-field');
      $(`input[name="${clear.dataset.name}"]`, wrap).value = '';
      $('[data-preview]', wrap).innerHTML = '<span>بدون تصویر</span>';
      return;
    }
    const mdBtn = e.target.closest('[data-md]');
    if (mdBtn) {
      const ta = $('textarea', mdBtn.closest('.md-editor'));
      const { selectionStart: s, selectionEnd: en, value } = ta;
      const sel = value.slice(s, en);
      const kind = mdBtn.dataset.md;
      let insert;
      if (kind === '**') insert = `**${sel || 'متن پررنگ'}**`;
      else if (kind === 'link') insert = `[${sel || 'متن پیوند'}](https://)`;
      else insert = `${kind}${sel || 'متن'}`;
      const lineStart = kind === '## ' || kind === '- ' ? (value.lastIndexOf('\n', s - 1) + 1 === s ? '' : '\n') : '';
      ta.setRangeText(lineStart + insert, s, en, 'end');
      ta.focus();
      return;
    }
    const toggle = e.target.closest('[data-action="md-preview"]');
    if (toggle) {
      const ed = toggle.closest('.md-editor');
      const prev = $('.md-preview', ed);
      const ta = $('textarea', ed);
      const showing = !prev.hidden;
      prev.hidden = showing;
      ta.hidden = !showing;
      toggle.textContent = showing ? 'پیش‌نمایش' : 'ویرایش';
      if (!showing) prev.innerHTML = md(ta.value) || '<p class="muted">چیزی برای نمایش نیست.</p>';
    }
  });
}

/* ---------- صفحه‌بندی ---------- */
export function pager(meta) {
  if (!meta || meta.pages <= 1) return '';
  const { page, pages } = meta;
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push('<span class="dots">…</span>');
    out.push(`<button type="button" class="pg ${n === page ? 'on' : ''}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${fmt(n)}</button>`);
  });
  return `<nav class="pager" aria-label="صفحه‌بندی">
    <button type="button" class="pg" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="صفحه قبل">‹</button>${out.join('')}
    <button type="button" class="pg" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="صفحه بعد">›</button></nav>`;
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const skeleton = (n = 3) => `<div class="skeleton-list" aria-busy="true" aria-label="در حال بارگذاری">${'<div class="sk"></div>'.repeat(n)}</div>`;
export const errorBox = (err) => `<div class="empty"><div class="big">⚠️</div><h2>${esc(err.message || 'خطایی رخ داد')}</h2><button type="button" class="btn btn-ghost" data-action="reload">تلاش دوباره</button></div>`;
