/* پنل کاربری: هر نقش منو و صفحه‌های مخصوص خودش را می‌بیند؛ دسترسی واقعی را سرور اعمال می‌کند. */
import {
  $, $$, esc, fmt, money, faDate, faDateTime, faDay, auth, can, site, toast, ICON, GET, POST, PUT, DELETE, qs,
  tintStyle, picture, stars, statusTag, badge, modal, confirmBox, formHtml, readForm, showErrors, wireFormWidgets,
  pager, debounce, skeleton, errorBox,
} from './core.js';
import {
  timeline, orderItems, orderTotals, deliveryInfo, orderStatus,
} from './shared.js';

const ROLE_KIND = { admin: 'red', manager: 'violet', editor: 'blue', customer: 'gray' };
const FA_ACTION = { create: 'ایجاد', update: 'ویرایش', delete: 'حذف', status: 'تغییر وضعیت', approved: 'تأیید', rejected: 'رد', pending: 'بازگشت به انتظار', upload: 'بارگذاری', password: 'بازنشانی گذرواژه', seed: 'ساخت داده' };
const FA_ENTITY = { product: 'محصول', category: 'دسته‌بندی', coupon: 'کد تخفیف', review: 'نظر', page: 'صفحه', post: 'مقاله', order: 'سفارش', user: 'کاربر', settings: 'تنظیمات', media: 'تصویر', system: 'سیستم' };

/* ---------- منوی هر بخش و دسترسی لازم ---------- */
const SECTIONS = {
  dashboard: { label: 'داشبورد', icon: ICON.home, group: '' },
  'shop-orders': { label: 'سفارش‌های فروشگاه', icon: ICON.box, group: 'فروش', perm: 'orders.manage' },
  products: { label: 'محصولات', icon: ICON.tag, group: 'فروش', perm: 'products.manage' },
  categories: { label: 'دسته‌بندی‌ها', icon: ICON.list, group: 'فروش', perm: 'categories.manage' },
  coupons: { label: 'کدهای تخفیف', icon: ICON.ticket, group: 'فروش', perm: 'coupons.manage' },
  customers: { label: 'مشتریان', icon: ICON.users, group: 'فروش', perm: 'customers.view' },
  moderation: { label: 'نظرهای کاربران', icon: ICON.chat, group: 'فروش', perm: 'reviews.moderate' },
  content: { label: 'صفحه‌ها و مقاله‌ها', icon: ICON.doc, group: 'محتوا', perm: 'content.manage' },
  settings: { label: 'تنظیمات سایت', icon: ICON.gear, group: 'مدیریت', perm: ['content.manage', 'settings.manage'] },
  users: { label: 'کاربران و نقش‌ها', icon: ICON.lock, group: 'مدیریت', perm: 'users.manage' },
  audit: { label: 'گزارش فعالیت', icon: ICON.pulse, group: 'مدیریت', perm: 'audit.view' },
  orders: { label: 'سفارش‌های من', icon: ICON.box, group: 'حساب من' },
  addresses: { label: 'نشانی‌ها', icon: ICON.pin, group: 'حساب من' },
  reviews: { label: 'نظرهای من', icon: ICON.star, group: 'حساب من' },
  profile: { label: 'پروفایل و امنیت', icon: ICON.user, group: 'حساب من' },
};
const GROUP_ORDER = ['', 'فروش', 'محتوا', 'مدیریت', 'حساب من'];

const allowed = (def) => !def.perm || (Array.isArray(def.perm) ? def.perm : [def.perm]).some(can);

/* ---------- ابزارهای مشترک ---------- */
function wire(el, h = {}) {
  el.onclick = (e) => {
    const t = e.target.closest('[data-action]');
    if (t && el.contains(t) && h.click?.[t.dataset.action]) h.click[t.dataset.action](t, e);
    const p = e.target.closest('[data-page]');
    if (p && h.page && !p.disabled) h.page(Number(p.dataset.page));
    const tb = e.target.closest('[data-tab]');
    if (tb && h.tab && el.contains(tb)) {
      $$('.tab', el).forEach((b) => { b.classList.toggle('on', b === tb); b.setAttribute('aria-selected', String(b === tb)); });
      h.tab(tb.dataset.tab);
    }
  };
  el.onchange = (e) => h.change?.(e);
  el.oninput = (e) => h.input?.(e);
  el.onsubmit = (e) => { e.preventDefault(); h.submit?.(e.target, e); };
}

function table(cols, rows, empty = 'موردی برای نمایش نیست.') {
  if (!rows.length) return `<div class="empty compact"><p>${esc(empty)}</p></div>`;
  return `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) => `<th scope="col">${c.label}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td data-label="${esc(c.label)}" class="${c.class || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const head = (title, actions = '', sub = '') => `<div class="panel-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><div class="panel-actions">${actions}</div></div>`;
const iconBtn = (action, id, icon, label, extra = '') => `<button type="button" class="icon-btn" data-action="${action}" data-id="${id}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon}</button>`;
const tabs = (items, active, attr = 'data-tab') => `<div class="tabs" role="tablist">${items.map(([v, l]) => `<button type="button" role="tab" class="tab ${v === active ? 'on' : ''}" aria-selected="${v === active}" ${attr}="${v}">${esc(l)}</button>`).join('')}</div>`;
const stat = (label, value, sub, icon, kind = '') => `<div class="stat ${kind}"><span class="stat-ico">${icon}</span><div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div></div>`;
const searchBox = (value, placeholder) => `<input type="search" class="search-field" data-search value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">`;

function formModal({ title, fields, values = {}, submitLabel = 'ذخیره', wide = false, onSubmit }) {
  const m = modal({
    title, wide,
    body: `<form novalidate><div class="fields">${formHtml(fields, values)}</div><p class="err form-err" id="e-form" role="alert"></p>
      <div class="modal-actions"><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button><button type="button" class="btn btn-ghost" data-close>انصراف</button></div></form>`,
  });
  const form = $('form', m.el);
  wireFormWidgets(m.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    showErrors(form);
    $('#e-form', form).textContent = '';
    try { await onSubmit(readForm(form, fields)); m.close(); } catch (err) {
      if (err.fields) showErrors(form, err.fields);
      if (!err.fields || !Object.keys(err.fields).length) $('#e-form', form).textContent = err.message;
      else if (err.message) $('#e-form', form).textContent = '';
    } finally { btn.disabled = false; }
  });
  $('input:not([type=hidden]), select, textarea', form)?.focus();
  return m;
}

/* فرم تمام‌صفحه (محصول، محتوا) */
function pageForm({ body, fields, values, onSubmit, backHref, submitLabel = 'ذخیره' }) {
  body.innerHTML = `<form class="panel-form" novalidate><div class="fields">${formHtml(fields, values)}</div><p class="err form-err" id="e-form" role="alert"></p>
    <div class="form-actions"><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button><a class="btn btn-ghost" href="${backHref}">انصراف</a></div></form>`;
  const form = $('form', body);
  wireFormWidgets(body);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    showErrors(form);
    $('#e-form', form).textContent = '';
    try { await onSubmit(readForm(form, fields)); } catch (err) {
      if (err.fields) showErrors(form, err.fields);
      $('#e-form', form).textContent = err.fields ? 'لطفاً خطاهای مشخص‌شده را برطرف کنید.' : err.message;
      toast(err.message, 'bad');
    } finally { btn.disabled = false; }
  });
}

/* ======================= چارچوب پنل ======================= */
export async function panel(ctx) {
  const { main, route } = ctx;
  if (!auth.user) { location.hash = `#/login?next=${encodeURIComponent(`#/${route.raw}`)}`; return; }
  const [section = 'dashboard', ...rest] = route.segs.slice(1);
  const def = SECTIONS[section];
  document.title = `${def?.label ?? 'پنل'} | ${site.settings.store_name}`;

  let layout = $('.panel-layout', main);
  if (!layout || layout.dataset.user !== String(auth.user.id)) {
    main.innerHTML = layoutHtml();
    layout = $('.panel-layout', main);
  }
  $$('.side-link', layout).forEach((a) => a.classList.toggle('on', a.dataset.section === section));
  const body = $('#panelBody', layout);
  $('.side', layout).classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (!def) { body.innerHTML = `<div class="empty"><div class="big">🧭</div><h2>این بخش پیدا نشد</h2><a class="btn btn-primary" href="#/panel">بازگشت به داشبورد</a></div>`; return; }
  if (!allowed(def)) {
    body.innerHTML = `<div class="empty"><div class="big">🔒</div><h2>دسترسی ندارید</h2><p>نقش «${esc(auth.user.roleLabel)}» به این بخش دسترسی ندارد.</p><a class="btn btn-primary" href="#/panel">بازگشت به داشبورد</a></div>`;
    return;
  }
  body.onclick = body.onchange = body.oninput = body.onsubmit = null;
  body.innerHTML = skeleton(3);
  const sub = { ...ctx, body, arg: rest[0], rest };
  try { await VIEWS[section](sub); } catch (e) {
    if (ctx.current()) body.innerHTML = errorBox(e);
  }
}

function layoutHtml() {
  const u = auth.user;
  const groups = GROUP_ORDER.map((g) => ({ g, items: Object.entries(SECTIONS).filter(([, d]) => d.group === g && allowed(d)) })).filter((x) => x.items.length);
  const staff = u.role !== 'customer';
  return `<div class="page"><div class="container"><div class="panel-layout" data-user="${u.id}">
    <button type="button" class="btn btn-ghost side-toggle" data-action="side-toggle" aria-expanded="false">☰ منوی پنل</button>
    <aside class="side" aria-label="منوی پنل">
      <div class="side-user"><span class="avatar lg" aria-hidden="true">${esc(u.name.trim()[0] ?? '؟')}</span>
        <div><strong>${esc(u.name)}</strong>${badge(u.roleLabel, ROLE_KIND[u.role] || 'gray')}</div></div>
      <nav>
        ${groups.map(({ g, items }) => `${g && (staff || g !== 'حساب من') ? `<p class="side-group">${esc(g)}</p>` : ''}
          ${items.map(([id, d]) => `<a class="side-link" data-section="${id}" href="#/panel${id === 'dashboard' ? '' : `/${id}`}">${d.icon}<span>${esc(d.label)}</span></a>`).join('')}`).join('')}
      </nav>
      <div class="side-foot"><a class="side-link" href="#/">${ICON.home}<span>بازگشت به فروشگاه</span></a>
        <button type="button" class="side-link" data-action="logout">${ICON.out}<span>خروج از حساب</span></button></div>
    </aside>
    <section class="panel-body" id="panelBody" aria-live="polite"></section>
  </div></div></div>`;
}

/* ======================= داشبورد ======================= */
async function dashboard({ body, current }) {
  const u = auth.user;
  if (u.role === 'customer') return customerDashboard({ body, current });
  const d = await GET('/admin/dashboard');
  if (!current()) return;
  let html = head(`سلام ${u.name.split(' ')[0]} 👋`, '', `شما با نقش «${u.roleLabel}» وارد شده‌اید؛ این داشبورد مخصوص همین نقش است.`);
  if (d.sales) html += salesBlock(d.sales);
  if (d.content) html += contentBlock(d.content);
  if (d.admin) html += adminBlock(d.admin);
  body.innerHTML = html;
}

function salesBlock(s) {
  const max = Math.max(1, ...s.revenueByDay.map((x) => x.revenue));
  const sc = s.statusCounts;
  return `<h2 class="block-title">فروش</h2>
    <div class="stats">
      ${stat('سفارش‌های امروز', fmt(s.ordersToday), '', ICON.box)}
      ${stat('فروش ۳۰ روز اخیر', money(s.revenue30), '', ICON.pulse)}
      ${stat('در انتظار تأیید', fmt(sc.pending ?? 0), '<a href="#/panel/shop-orders">بررسی سفارش‌ها</a>', ICON.list, (sc.pending ?? 0) ? 'alert' : '')}
      ${stat('در حال آماده‌سازی', fmt(sc.processing ?? 0), '', ICON.truck)}
    </div>
    <div class="two-col">
      <div class="card-panel"><h3>فروش ۱۴ روز اخیر</h3>
        <div class="chart" role="img" aria-label="نمودار ستونی فروش روزانه در ۱۴ روز اخیر">
          ${s.revenueByDay.map((x) => `<div class="bar" title="${faDay(x.date)}: ${fmt(x.revenue)} تومان، ${fmt(x.orders)} سفارش"><span style="height:${Math.max(3, Math.round((x.revenue / max) * 100))}%"></span><small>${faDay(x.date)}</small></div>`).join('')}
        </div></div>
      <div class="card-panel"><h3>موجودی رو به اتمام</h3>
        ${s.lowStock.length ? `<ul class="plain-list">${s.lowStock.map((p) => `<li><span>${esc(p.emoji)} ${esc(p.title)}</span>${p.stock === 0 ? badge('ناموجود', 'red') : badge(`${fmt(p.stock)} عدد`, 'amber')}</li>`).join('')}</ul>` : '<p class="muted">همه‌ی کالاها موجودی کافی دارند.</p>'}
        ${can('products.manage') ? '<a class="more" href="#/panel/products?status=low">مدیریت موجودی ←</a>' : ''}</div>
    </div>
    <div class="card-panel"><h3>آخرین سفارش‌ها</h3>
      ${table([
    { label: 'کد', render: (o) => `<a href="#/panel/shop-orders/${o.id}"><bdi dir="ltr">${esc(o.code)}</bdi></a>` },
    { label: 'مشتری', render: (o) => esc(o.name) },
    { label: 'وضعیت', render: orderStatus },
    { label: 'مبلغ', render: (o) => money(o.total) },
    { label: 'تاریخ', render: (o) => faDateTime(o.createdAt) },
  ], s.recentOrders, 'هنوز سفارشی ثبت نشده است.')}</div>`;
}

function contentBlock(c) {
  return `<h2 class="block-title">محتوا</h2>
    <div class="stats">
      ${stat('مقاله‌های منتشرشده', fmt(c.counts.post.published), `${fmt(c.counts.post.draft)} پیش‌نویس`, ICON.doc)}
      ${stat('صفحه‌های منتشرشده', fmt(c.counts.page.published), `${fmt(c.counts.page.draft)} پیش‌نویس`, ICON.list)}
      ${stat('نظرهای در انتظار', fmt(c.pendingReviews), '<a href="#/panel/moderation">بررسی نظرها</a>', ICON.chat, c.pendingReviews ? 'alert' : '')}
    </div>
    <div class="card-panel"><h3>آخرین تغییرها</h3>
      ${table([
    { label: 'عنوان', render: (x) => `<a href="#/panel/content/${x.id}">${esc(x.title)}</a>` },
    { label: 'نوع', render: (x) => badge(FA_ENTITY[x.type], 'gray') },
    { label: 'وضعیت', render: (x) => statusTag(x.status, x.status === 'published' ? 'منتشرشده' : 'پیش‌نویس') },
    { label: 'آخرین ویرایش', render: (x) => faDateTime(x.updated_at) },
  ], c.recentContent)}
      <p><a class="btn btn-primary btn-sm" href="#/panel/content/new?type=post">＋ مقاله‌ی جدید</a> <a class="btn btn-ghost btn-sm" href="#/panel/content/new?type=page">＋ صفحه‌ی جدید</a></p></div>`;
}

function adminBlock(a) {
  return `<h2 class="block-title">مدیریت سیستم</h2>
    <div class="stats">
      ${stat('مدیران کل', fmt(a.usersByRole.admin), '', ICON.lock)}
      ${stat('مدیران فروش', fmt(a.usersByRole.manager), '', ICON.tag)}
      ${stat('ویرایشگران', fmt(a.usersByRole.editor), '', ICON.doc)}
      ${stat('مشتریان', fmt(a.usersByRole.customer), '<a href="#/panel/users">مدیریت کاربران</a>', ICON.users)}
    </div>
    <div class="card-panel"><h3>آخرین فعالیت‌ها</h3>
      ${table([
    { label: 'کاربر', render: (x) => esc(x.by_name ?? 'سیستم') },
    { label: 'عملیات', render: (x) => `${esc(FA_ACTION[x.action] ?? x.action)} ${esc(FA_ENTITY[x.entity] ?? x.entity)}` },
    { label: 'جزئیات', render: (x) => esc(x.detail) },
    { label: 'زمان', render: (x) => faDateTime(x.created_at) },
  ], a.recentActivity)}</div>`;
}

async function customerDashboard({ body, current }) {
  const s = await GET('/account/summary');
  if (!current()) return;
  body.innerHTML = `${head(`سلام ${auth.user.name.split(' ')[0]} 👋`, '', 'خلاصه‌ی فعالیت‌های شما در فروشگاه')}
    <div class="stats">
      ${stat('کل سفارش‌ها', fmt(s.orders), '<a href="#/panel/orders">مشاهده همه</a>', ICON.box)}
      ${stat('سفارش‌های در جریان', fmt(s.activeOrders), '', ICON.truck)}
      ${stat('مجموع خرید', money(s.spent), '', ICON.pulse)}
      ${stat('نشانی‌های ذخیره‌شده', fmt(s.addresses), '<a href="#/panel/addresses">مدیریت نشانی‌ها</a>', ICON.pin)}
    </div>
    <div class="card-panel"><h3>آخرین سفارش‌ها</h3>${ordersTable(s.recentOrders, 'هنوز سفارشی ثبت نکرده‌اید.')}
      ${s.orders ? '' : '<p><a class="btn btn-primary" href="#/shop">شروع خرید</a></p>'}</div>`;
}

/* ======================= پنل مشتری ======================= */
function ordersTable(items, empty) {
  return table([
    { label: 'کد سفارش', render: (o) => `<a href="#/panel/orders/${encodeURIComponent(o.code)}"><bdi dir="ltr">${esc(o.code)}</bdi></a>` },
    { label: 'اقلام', render: (o) => `<span class="thumbs">${o.preview.map((i) => `<span class="thumb sm" style="${tintStyle(i.tint)}" title="${esc(i.title)}">${picture(i)}</span>`).join('')}</span> ${fmt(o.itemCount)} عدد` },
    { label: 'وضعیت', render: orderStatus },
    { label: 'مبلغ', render: (o) => money(o.total) },
    { label: 'تاریخ', render: (o) => faDateTime(o.createdAt) },
  ], items, empty);
}

async function myOrders({ body, arg, current }) {
  if (arg) return myOrderDetail({ body, arg, current });
  const st = { page: 1 };
  const load = async () => {
    const d = await GET(`/account/orders?page=${st.page}`);
    if (!current()) return;
    body.innerHTML = `${head('سفارش‌های من')}<div class="card-panel">${ordersTable(d.items, 'هنوز سفارشی ثبت نکرده‌اید.')}${pager(d)}</div>`;
  };
  wire(body, { page: (n) => { st.page = n; load(); } });
  await load();
}

async function myOrderDetail({ body, arg, current }) {
  const code = decodeURIComponent(arg);
  const render = (o) => {
    body.innerHTML = `${head(`سفارش ${o.code}`, `<a class="btn btn-ghost btn-sm" href="#/panel/orders">← همه سفارش‌ها</a>`, `ثبت‌شده در ${faDateTime(o.createdAt)}`)}
      <div class="two-col wide-left">
        <div>
          <div class="card-panel"><h3>اقلام سفارش</h3>${orderItems(o)}${orderTotals(o)}</div>
          <div class="card-panel"><h3>اطلاعات تحویل</h3>${deliveryInfo(o)}</div>
        </div>
        <div>
          <div class="card-panel"><h3>وضعیت سفارش ${orderStatus(o)}</h3>${timeline(o.events)}
            ${o.status === 'pending' ? '<button type="button" class="btn btn-danger btn-block" data-action="cancel">لغو سفارش</button>' : ''}</div>
        </div></div>`;
  };
  const { order } = await GET(`/account/orders/${encodeURIComponent(code)}`);
  if (!current()) return;
  render(order);
  wire(body, {
    click: {
      cancel: async () => {
        if (!(await confirmBox('این سفارش لغو شود؟ این کار قابل بازگشت نیست.', { okLabel: 'لغو سفارش', danger: true }))) return;
        try { const r = await POST(`/account/orders/${encodeURIComponent(code)}/cancel`); render(r.order); toast('سفارش لغو شد.', 'ok'); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
}

const ADDRESS_FIELDS = [
  { name: 'title', label: 'عنوان نشانی', required: true, placeholder: 'مثلاً خانه' },
  { name: 'name', label: 'نام تحویل‌گیرنده', required: true },
  { name: 'phone', label: 'شماره موبایل', type: 'tel', dir: 'ltr', required: true, placeholder: '09123456789' },
  { name: 'city', label: 'شهر', required: true },
  { name: 'postal', label: 'کد پستی', dir: 'ltr', required: true, maxlength: 10 },
  { name: 'address', label: 'نشانی کامل', type: 'textarea', rows: 3, full: true, required: true },
  { name: 'is_default', label: 'به‌عنوان نشانی پیش‌فرض', type: 'checkbox', full: true },
];

async function addresses({ body, current }) {
  let items = [];
  const render = () => {
    body.innerHTML = `${head('نشانی‌های من', '<button type="button" class="btn btn-primary btn-sm" data-action="add">＋ نشانی جدید</button>')}
      ${items.length ? `<div class="addr-grid">${items.map((a) => `
        <article class="addr-card ${a.isDefault ? 'default' : ''}">
          <header><strong>${esc(a.title)}</strong>${a.isDefault ? badge('پیش‌فرض', 'green') : ''}</header>
          <p>${esc(a.name)} · <bdi dir="ltr">${esc(a.phone)}</bdi></p>
          <p>${esc(a.city)}، ${esc(a.address)}</p><p class="muted">کد پستی: <bdi dir="ltr">${esc(a.postal)}</bdi></p>
          <footer>${iconBtn('edit', a.id, ICON.edit, 'ویرایش نشانی')}${iconBtn('del', a.id, ICON.trash, 'حذف نشانی')}</footer>
        </article>`).join('')}</div>` : '<div class="card-panel"><div class="empty compact"><p>هنوز نشانی‌ای ذخیره نکرده‌اید.</p></div></div>'}`;
  };
  const reload = async () => { items = (await GET('/account/addresses')).items; render(); };
  const open = (a) => formModal({
    title: a ? 'ویرایش نشانی' : 'نشانی جدید', fields: ADDRESS_FIELDS, values: a ?? { name: auth.user.name, phone: auth.user.phone ?? '' },
    onSubmit: async (data) => { if (a) await PUT(`/account/addresses/${a.id}`, data); else await POST('/account/addresses', data); toast('نشانی ذخیره شد.', 'ok'); await reload(); },
  });
  wire(body, {
    click: {
      add: () => open(null),
      edit: (t) => open(items.find((x) => String(x.id) === t.dataset.id)),
      del: async (t) => {
        if (!(await confirmBox('این نشانی حذف شود؟', { okLabel: 'حذف', danger: true }))) return;
        try { await DELETE(`/account/addresses/${t.dataset.id}`); toast('نشانی حذف شد.', 'ok'); await reload(); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
  await reload();
  if (!current()) return;
}

async function myReviews({ body }) {
  const { items } = await GET('/account/reviews');
  const tag = { approved: ['منتشر شد', 'green'], pending: ['در انتظار تأیید', 'amber'], rejected: ['رد شد', 'red'] };
  body.innerHTML = `${head('نظرهای من', '', 'پس از تحویل سفارش، در صفحه‌ی هر کالا می‌توانید نظر بدهید.')}
    <div class="card-panel">${items.length ? items.map((r) => `
      <article class="review"><header><a href="#/product/${r.productId}"><strong>${esc(r.emoji)} ${esc(r.productTitle)}</strong></a>${stars(r.rating)}${badge(...tag[r.status])}<time>${faDate(r.createdAt)}</time></header><p>${esc(r.body)}</p></article>`).join('') : '<div class="empty compact"><p>هنوز نظری ثبت نکرده‌اید.</p></div>'}</div>`;
}

async function profile({ body }) {
  const u = auth.user;
  const fields = [
    { name: 'name', label: 'نام و نام خانوادگی', required: true, autocomplete: 'name' },
    { name: 'phone', label: 'شماره موبایل', type: 'tel', dir: 'ltr', placeholder: '09123456789' },
  ];
  const pw = [
    { name: 'current', label: 'گذرواژه فعلی', type: 'password', dir: 'ltr', required: true, autocomplete: 'current-password' },
    { name: 'password', label: 'گذرواژه جدید', type: 'password', dir: 'ltr', required: true, autocomplete: 'new-password', hint: 'حداقل ۸ نویسه، ترکیبی از حروف و عدد.' },
  ];
  body.innerHTML = `${head('پروفایل و امنیت')}
    <div class="two-col">
      <form class="card-panel" data-form="profile" novalidate><h3>اطلاعات حساب</h3>
        <div class="field"><label for="p-email">ایمیل</label><input id="p-email" value="${esc(u.email)}" dir="ltr" class="ltr" disabled><small class="hint">ایمیل قابل تغییر نیست.</small></div>
        <div class="field"><label>نقش</label><div>${badge(u.roleLabel, ROLE_KIND[u.role] || 'gray')}</div></div>
        ${formHtml(fields, u)}<p class="err form-err" id="e-form" role="alert"></p><button class="btn btn-primary" type="submit">ذخیره تغییرها</button></form>
      <form class="card-panel" data-form="password" novalidate><h3>تغییر گذرواژه</h3>${formHtml(pw)}
        <p class="hint">پس از تغییر، از سایر دستگاه‌ها خارج می‌شوید.</p><p class="err form-err" id="e-form" role="alert"></p><button class="btn btn-primary" type="submit">تغییر گذرواژه</button></form>
    </div>`;
  wire(body, {
    submit: async (form) => {
      const kind = form.dataset.form;
      const f = kind === 'profile' ? fields : pw;
      showErrors(form);
      $('#e-form', form).textContent = '';
      try {
        const data = readForm(form, f);
        if (kind === 'profile') {
          const r = await PUT('/account/profile', data);
          auth.user = { ...auth.user, ...r.user };
          document.dispatchEvent(new CustomEvent('auth:changed'));
          toast('اطلاعات حساب ذخیره شد.', 'ok');
        } else {
          await POST('/account/password', data);
          form.reset();
          toast('گذرواژه تغییر کرد.', 'ok');
        }
      } catch (e) { if (e.fields) showErrors(form, e.fields); else $('#e-form', form).textContent = e.message; }
    },
  });
}

/* ======================= محصولات ======================= */
async function products({ body, arg, route, current }) {
  if (arg) return productForm({ body, arg, current });
  const st = { page: 1, q: '', category: route.query.category ?? '', status: route.query.status ?? '' };
  const cats = (await GET('/admin/categories')).items;
  body.innerHTML = `${head('محصولات', '<a class="btn btn-primary btn-sm" href="#/panel/products/new">＋ محصول جدید</a>')}
    <div class="filters">
      ${searchBox('', 'جستجوی محصول…')}
      <select data-filter="category" aria-label="دسته‌بندی"><option value="">همه‌ی دسته‌ها</option>${cats.map((c) => `<option value="${c.id}" ${String(c.id) === st.category ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>
      <select data-filter="status" aria-label="وضعیت"><option value="">همه‌ی وضعیت‌ها</option>${[['published', 'منتشرشده'], ['draft', 'پیش‌نویس'], ['low', 'موجودی کم']].map(([v, l]) => `<option value="${v}" ${v === st.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div><div id="list">${skeleton(3)}</div>`;
  const load = async () => {
    const d = await GET(`/admin/products${qs({ q: st.q, category: st.category, status: st.status, page: st.page })}`);
    if (!current()) return;
    $('#list', body).innerHTML = `<div class="card-panel flush">${table([
      { label: 'محصول', render: (p) => `<span class="cell-prod"><span class="thumb sm" style="${tintStyle(site.palette[p.tint])}">${picture(p)}</span><a href="#/panel/products/${p.id}">${esc(p.title)}</a></span>` },
      { label: 'دسته', render: (p) => esc(p.category_title ?? '—') },
      { label: 'قیمت', render: (p) => money(p.price) },
      { label: 'موجودی', render: (p) => (p.stock === 0 ? badge('ناموجود', 'red') : p.stock <= 5 ? badge(`${fmt(p.stock)} عدد`, 'amber') : fmt(p.stock)) },
      { label: 'وضعیت', render: (p) => `${statusTag(p.published ? 'published' : 'draft', p.published ? 'منتشرشده' : 'پیش‌نویس')}${p.featured ? ' ' + badge('ویژه', 'violet') : ''}` },
      { label: '', class: 'actions', render: (p) => `<a class="icon-btn" href="#/panel/products/${p.id}" aria-label="ویرایش ${esc(p.title)}">${ICON.edit}</a>${iconBtn('del', p.id, ICON.trash, `حذف ${p.title}`)}` },
    ], d.items, 'محصولی پیدا نشد.')}</div>${pager(d)}`;
  };
  wire(body, {
    page: (n) => { st.page = n; load(); },
    input: debounce((e) => { if (e.target.matches('[data-search]')) { st.q = e.target.value; st.page = 1; load(); } }),
    change: (e) => { const k = e.target.dataset.filter; if (k) { st[k] = e.target.value; st.page = 1; load(); } },
    click: {
      del: async (t) => {
        if (!(await confirmBox('این محصول برای همیشه حذف شود؟ سفارش‌های قبلی تغییری نمی‌کنند.', { okLabel: 'حذف', danger: true }))) return;
        try { await DELETE(`/admin/products/${t.dataset.id}`); toast('محصول حذف شد.', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
  await load();
}

async function productForm({ body, arg, current }) {
  const isNew = arg === 'new';
  const [cats, item] = await Promise.all([GET('/admin/categories'), isNew ? null : GET(`/admin/products/${arg}`)]);
  if (!current()) return;
  const v = item?.item ?? { emoji: '🛍️', tint: 0, published: true, featured: false, stock: 0 };
  const fields = [
    { name: 'title', label: 'عنوان محصول', required: true, full: true },
    { name: 'category_id', label: 'دسته‌بندی', type: 'select', options: cats.items.map((c) => ({ value: c.id, label: c.title })), required: true },
    { name: 'stock', label: 'موجودی (عدد)', type: 'number', min: 0, required: true },
    { name: 'price', label: 'قیمت (تومان)', type: 'number', min: 0, required: true },
    { name: 'old_price', label: 'قیمت قبل از تخفیف (اختیاری)', type: 'number', min: 0, hint: 'اگر پر شود، درصد تخفیف نمایش داده می‌شود.' },
    { name: 'image', label: 'تصویر محصول', type: 'image', full: true },
    { name: 'emoji', label: 'ایموجی (وقتی تصویر ندارد)', maxlength: 8 },
    { name: 'tint', label: 'رنگ پس‌زمینه', type: 'tint' },
    { name: 'description', label: 'توضیحات', type: 'textarea', rows: 4, full: true },
    { name: 'specs', label: 'مشخصات فنی', type: 'textarea', rows: 5, full: true, hint: 'هر خط یک مشخصه، به شکل «نام: مقدار».' },
    { name: 'published', label: 'منتشر شود (در فروشگاه دیده شود)', type: 'checkbox' },
    { name: 'featured', label: 'محصول ویژه (نمایش در صفحه اصلی)', type: 'checkbox' },
  ];
  body.innerHTML = head(isNew ? 'محصول جدید' : 'ویرایش محصول', '<a class="btn btn-ghost btn-sm" href="#/panel/products">← فهرست محصولات</a>') + '<div class="card-panel" id="formBox"></div>';
  pageForm({
    body: $('#formBox', body), fields, values: v, backHref: '#/panel/products', submitLabel: isNew ? 'ایجاد محصول' : 'ذخیره تغییرها',
    onSubmit: async (data) => {
      if (isNew) await POST('/admin/products', data); else await PUT(`/admin/products/${arg}`, data);
      toast('محصول ذخیره شد.', 'ok');
      location.hash = '#/panel/products';
    },
  });
}

/* ======================= دسته‌بندی‌ها ======================= */
async function categories({ body, current }) {
  let items = [];
  const fields = [
    { name: 'title', label: 'عنوان', required: true },
    { name: 'sort_order', label: 'ترتیب نمایش', type: 'number', min: 0, hint: 'عدد کمتر، بالاتر نمایش داده می‌شود.' },
  ];
  const render = () => {
    body.innerHTML = `${head('دسته‌بندی‌ها', can('categories.manage') ? '<button type="button" class="btn btn-primary btn-sm" data-action="add">＋ دسته‌ی جدید</button>' : '')}
      <div class="card-panel flush">${table([
    { label: 'عنوان', render: (c) => esc(c.title) },
    { label: 'تعداد محصول', render: (c) => fmt(c.products) },
    { label: 'ترتیب', render: (c) => fmt(c.sort_order) },
    ...(can('categories.manage') ? [{ label: '', class: 'actions', render: (c) => iconBtn('edit', c.id, ICON.edit, `ویرایش ${c.title}`) + iconBtn('del', c.id, ICON.trash, `حذف ${c.title}`) }] : []),
  ], items)}</div>`;
  };
  const reload = async () => { items = (await GET('/admin/categories')).items; render(); };
  const open = (c) => formModal({
    title: c ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید', fields, values: c ?? { sort_order: items.length },
    onSubmit: async (data) => { if (c) await PUT(`/admin/categories/${c.id}`, data); else await POST('/admin/categories', data); toast('ذخیره شد.', 'ok'); await reload(); },
  });
  wire(body, {
    click: {
      add: () => open(null),
      edit: (t) => open(items.find((x) => String(x.id) === t.dataset.id)),
      del: async (t) => {
        if (!(await confirmBox('این دسته‌بندی حذف شود؟', { okLabel: 'حذف', danger: true }))) return;
        try { await DELETE(`/admin/categories/${t.dataset.id}`); toast('حذف شد.', 'ok'); await reload(); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
  await reload();
  if (!current()) return;
}

/* ======================= کدهای تخفیف ======================= */
async function coupons({ body }) {
  let items = [];
  const fields = [
    { name: 'code', label: 'کد (حروف انگلیسی و عدد)', dir: 'ltr', required: true, maxlength: 30 },
    { name: 'type', label: 'نوع تخفیف', type: 'select', options: [{ value: 'percent', label: 'درصدی' }, { value: 'fixed', label: 'مبلغ ثابت (تومان)' }], required: true },
    { name: 'value', label: 'مقدار تخفیف', type: 'number', min: 1, required: true },
    { name: 'min_total', label: 'حداقل مبلغ خرید (تومان)', type: 'number', min: 0 },
    { name: 'max_uses', label: 'سقف دفعات استفاده (۰ = نامحدود)', type: 'number', min: 0 },
    { name: 'expires_at', label: 'تاریخ انقضا (اختیاری)', type: 'date', dir: 'ltr' },
    { name: 'active', label: 'فعال باشد', type: 'checkbox', full: true },
  ];
  const render = () => {
    body.innerHTML = `${head('کدهای تخفیف', '<button type="button" class="btn btn-primary btn-sm" data-action="add">＋ کد جدید</button>')}
      <div class="card-panel flush">${table([
    { label: 'کد', render: (c) => `<bdi dir="ltr"><strong>${esc(c.code)}</strong></bdi>` },
    { label: 'تخفیف', render: (c) => (c.type === 'percent' ? `${fmt(c.value)}٪` : money(c.value)) },
    { label: 'حداقل خرید', render: (c) => (c.min_total ? money(c.min_total) : '—') },
    { label: 'استفاده', render: (c) => `${fmt(c.used)}${c.max_uses ? ` / ${fmt(c.max_uses)}` : ''}` },
    { label: 'انقضا', render: (c) => (c.expires_at ? faDate(c.expires_at) : '—') },
    { label: 'وضعیت', render: (c) => badge(c.active ? 'فعال' : 'غیرفعال', c.active ? 'green' : 'gray') },
    { label: '', class: 'actions', render: (c) => iconBtn('edit', c.id, ICON.edit, `ویرایش ${c.code}`) + iconBtn('del', c.id, ICON.trash, `حذف ${c.code}`) },
  ], items, 'هنوز کد تخفیفی نساخته‌اید.')}</div>`;
  };
  const reload = async () => { items = (await GET('/admin/coupons')).items; render(); };
  const open = (c) => formModal({
    title: c ? 'ویرایش کد تخفیف' : 'کد تخفیف جدید', fields, values: c ?? { type: 'percent', active: true, min_total: 0, max_uses: 0 },
    onSubmit: async (data) => { if (c) await PUT(`/admin/coupons/${c.id}`, data); else await POST('/admin/coupons', data); toast('ذخیره شد.', 'ok'); await reload(); },
  });
  wire(body, {
    click: {
      add: () => open(null),
      edit: (t) => open(items.find((x) => String(x.id) === t.dataset.id)),
      del: async (t) => {
        if (!(await confirmBox('این کد تخفیف حذف شود؟', { okLabel: 'حذف', danger: true }))) return;
        try { await DELETE(`/admin/coupons/${t.dataset.id}`); toast('حذف شد.', 'ok'); await reload(); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
  await reload();
}

/* ======================= سفارش‌های فروشگاه ======================= */
async function shopOrders({ body, arg, route, current }) {
  if (arg) return shopOrderDetail({ body, arg, current });
  const st = { page: 1, q: '', status: route.query.status ?? '' };
  const statusTabs = [['', 'همه'], ...Object.entries(site.statuses)];
  const draw = (d) => {
    $('#list', body).innerHTML = `<div class="card-panel flush">${table([
      { label: 'کد', render: (o) => `<a href="#/panel/shop-orders/${o.id}"><bdi dir="ltr">${esc(o.code)}</bdi></a>` },
      { label: 'مشتری', render: (o) => `${esc(o.name)}<br><small class="muted"><bdi dir="ltr">${esc(o.phone)}</bdi></small>` },
      { label: 'اقلام', render: (o) => fmt(o.itemCount) },
      { label: 'مبلغ', render: (o) => money(o.total) },
      { label: 'وضعیت', render: orderStatus },
      { label: 'تاریخ', render: (o) => faDateTime(o.createdAt) },
    ], d.items, 'سفارشی پیدا نشد.')}</div>${pager(d)}`;
  };
  const load = async () => {
    const d = await GET(`/admin/orders${qs({ q: st.q, status: st.status, page: st.page })}`);
    if (current()) draw(d);
  };
  body.innerHTML = `${head('سفارش‌های فروشگاه')}${tabs(statusTabs, st.status)}<div class="filters">${searchBox('', 'جستجو با کد سفارش، نام یا موبایل…')}</div><div id="list">${skeleton(3)}</div>`;
  wire(body, {
    page: (n) => { st.page = n; load(); },
    input: debounce((e) => { if (e.target.matches('[data-search]')) { st.q = e.target.value; st.page = 1; load(); } }),
    tab: (v) => { st.status = v; st.page = 1; load(); },
  });
  await load();
}

async function shopOrderDetail({ body, arg, current }) {
  const render = (r) => {
    const o = r.order;
    body.innerHTML = `${head(`سفارش ${o.code}`, '<a class="btn btn-ghost btn-sm" href="#/panel/shop-orders">← همه سفارش‌ها</a>', `ثبت‌شده در ${faDateTime(o.createdAt)}`)}
      <div class="two-col wide-left">
        <div>
          <div class="card-panel"><h3>اقلام سفارش</h3>${orderItems(o)}${orderTotals(o)}</div>
          <div class="card-panel"><h3>اطلاعات تحویل</h3>${deliveryInfo(o)}
            ${r.customer ? `<p class="muted small">حساب مشتری: ${esc(r.customer.name)} · <bdi dir="ltr">${esc(r.customer.email)}</bdi></p>` : ''}</div>
        </div>
        <div>
          <div class="card-panel"><h3>وضعیت ${orderStatus(o)}</h3>${timeline(o.events)}
            ${r.allowedStatuses.length ? `<form data-form="status" novalidate>
              <div class="field"><label for="st-status">تغییر وضعیت به</label><select id="st-status" name="status">${r.allowedStatuses.map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('')}</select></div>
              <div class="field"><label for="st-note">یادداشت (برای مشتری قابل مشاهده است)</label><input id="st-note" name="note" maxlength="300"></div>
              <p class="err form-err" id="e-form" role="alert"></p><button class="btn btn-primary btn-block" type="submit">ثبت تغییر وضعیت</button></form>` : '<p class="muted">این سفارش به وضعیت نهایی رسیده است.</p>'}</div>
        </div></div>`;
  };
  const r = await GET(`/admin/orders/${arg}`);
  if (!current()) return;
  render(r);
  wire(body, {
    submit: async (form) => {
      const data = readForm(form, [{ name: 'status' }, { name: 'note' }]);
      if (data.status === 'cancelled' && !(await confirmBox('با لغو سفارش، موجودی کالاها به انبار برمی‌گردد. ادامه می‌دهید؟', { okLabel: 'لغو سفارش', danger: true }))) return;
      try { render(await POST(`/admin/orders/${arg}/status`, data)); toast('وضعیت سفارش به‌روز شد.', 'ok'); } catch (e) { $('#e-form', form).textContent = e.message; }
    },
  });
}

/* ======================= مشتریان ======================= */
async function customers({ body, current }) {
  const st = { page: 1, q: '' };
  body.innerHTML = `${head('مشتریان', '', 'فهرست فقط‌خواندنی مشتریان ثبت‌نام‌شده')}<div class="filters">${searchBox('', 'جستجو با نام، ایمیل یا موبایل…')}</div><div id="list">${skeleton(3)}</div>`;
  const load = async () => {
    const d = await GET(`/admin/customers${qs({ q: st.q, page: st.page })}`);
    if (!current()) return;
    $('#list', body).innerHTML = `<div class="card-panel flush">${table([
      { label: 'نام', render: (c) => esc(c.name) },
      { label: 'ایمیل', render: (c) => `<bdi dir="ltr">${esc(c.email)}</bdi>` },
      { label: 'موبایل', render: (c) => (c.phone ? `<bdi dir="ltr">${esc(c.phone)}</bdi>` : '—') },
      { label: 'سفارش‌ها', render: (c) => fmt(c.orders) },
      { label: 'مجموع خرید', render: (c) => money(c.spent) },
      { label: 'عضویت', render: (c) => faDate(c.created_at) },
      { label: 'وضعیت', render: (c) => badge(c.active ? 'فعال' : 'غیرفعال', c.active ? 'green' : 'gray') },
    ], d.items, 'مشتری‌ای پیدا نشد.')}</div>${pager(d)}`;
  };
  wire(body, { page: (n) => { st.page = n; load(); }, input: debounce((e) => { if (e.target.matches('[data-search]')) { st.q = e.target.value; st.page = 1; load(); } }) });
  await load();
}

/* ======================= نظرها ======================= */
async function moderation({ body, current }) {
  const st = { page: 1, status: 'pending' };
  const tabItems = [['pending', 'در انتظار تأیید'], ['approved', 'منتشرشده'], ['rejected', 'ردشده']];
  body.innerHTML = `${head('نظرهای کاربران')}${tabs(tabItems, st.status)}<div id="list">${skeleton(2)}</div>`;
  const load = async () => {
    const d = await GET(`/admin/reviews${qs({ status: st.status, page: st.page })}`);
    if (!current()) return;
    $('#list', body).innerHTML = d.items.length ? `<div class="card-panel">${d.items.map((r) => `
      <article class="review"><header><a href="#/product/${r.product_id}"><strong>${esc(r.product_title)}</strong></a>${stars(r.rating)}<span>${esc(r.author)}</span><time>${faDateTime(r.created_at)}</time></header>
        <p>${esc(r.body)}</p>
        <div class="row-actions">
          ${r.status !== 'approved' ? `<button type="button" class="btn btn-primary btn-sm" data-action="set" data-id="${r.id}" data-status="approved">تأیید و انتشار</button>` : ''}
          ${r.status !== 'rejected' ? `<button type="button" class="btn btn-ghost btn-sm" data-action="set" data-id="${r.id}" data-status="rejected">رد</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm danger" data-action="del" data-id="${r.id}">حذف</button></div></article>`).join('')}</div>${pager(d)}`
      : '<div class="card-panel"><div class="empty compact"><p>نظری در این دسته نیست.</p></div></div>';
  };
  wire(body, {
    page: (n) => { st.page = n; load(); },
    tab: (v) => { st.status = v; st.page = 1; load(); },
    click: {
      set: async (t) => { try { await PUT(`/admin/reviews/${t.dataset.id}`, { status: t.dataset.status }); toast('انجام شد.', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } },
      del: async (t) => {
        if (!(await confirmBox('این نظر حذف شود؟', { okLabel: 'حذف', danger: true }))) return;
        try { await DELETE(`/admin/reviews/${t.dataset.id}`); toast('حذف شد.', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
  await load();
}

/* ======================= CMS: صفحه‌ها و مقاله‌ها ======================= */
async function content({ body, arg, route, current }) {
  if (arg) return contentForm({ body, arg, route, current });
  const st = { page: 1, q: '', type: route.query.type ?? '', status: '' };
  const typeTabs = [['', 'همه'], ['post', 'مقاله‌ها'], ['page', 'صفحه‌ها']];
  body.innerHTML = `${head('صفحه‌ها و مقاله‌ها', '<a class="btn btn-primary btn-sm" href="#/panel/content/new?type=post">＋ مقاله</a><a class="btn btn-ghost btn-sm" href="#/panel/content/new?type=page">＋ صفحه</a>')}
    ${tabs(typeTabs, st.type)}
    <div class="filters">${searchBox('', 'جستجوی عنوان…')}<select data-filter="status" aria-label="وضعیت"><option value="">همه‌ی وضعیت‌ها</option><option value="published">منتشرشده</option><option value="draft">پیش‌نویس</option></select></div>
    <div id="list">${skeleton(3)}</div>`;
  const load = async () => {
    const d = await GET(`/admin/content${qs({ type: st.type, status: st.status, q: st.q, page: st.page })}`);
    if (!current()) return;
    $('#list', body).innerHTML = `<div class="card-panel flush">${table([
      { label: 'عنوان', render: (c) => `<a href="#/panel/content/${c.id}">${esc(c.title)}</a>` },
      { label: 'نوع', render: (c) => badge(FA_ENTITY[c.type], c.type === 'page' ? 'blue' : 'violet') },
      { label: 'نامک', render: (c) => `<bdi dir="ltr" class="muted">${esc(c.slug)}</bdi>` },
      { label: 'وضعیت', render: (c) => statusTag(c.status, c.status === 'published' ? 'منتشرشده' : 'پیش‌نویس') },
      { label: 'نویسنده', render: (c) => esc(c.author ?? '—') },
      { label: 'ویرایش', render: (c) => faDateTime(c.updated_at) },
      { label: '', class: 'actions', render: (c) => `${c.status === 'published' ? `<a class="icon-btn" target="_blank" rel="noopener" href="#/${c.type === 'post' ? 'blog' : 'page'}/${encodeURIComponent(c.slug)}" aria-label="مشاهده در سایت">↗</a>` : ''}<a class="icon-btn" href="#/panel/content/${c.id}" aria-label="ویرایش ${esc(c.title)}">${ICON.edit}</a>${iconBtn('del', c.id, ICON.trash, `حذف ${c.title}`)}` },
    ], d.items, 'محتوایی پیدا نشد.')}</div>${pager(d)}`;
  };
  wire(body, {
    page: (n) => { st.page = n; load(); },
    input: debounce((e) => { if (e.target.matches('[data-search]')) { st.q = e.target.value; st.page = 1; load(); } }),
    change: (e) => { if (e.target.dataset.filter) { st.status = e.target.value; st.page = 1; load(); } },
    tab: (v) => { st.type = v; st.page = 1; load(); },
    click: {
      del: async (t) => {
        if (!(await confirmBox('این محتوا برای همیشه حذف شود؟', { okLabel: 'حذف', danger: true }))) return;
        try { await DELETE(`/admin/content/${t.dataset.id}`); toast('حذف شد.', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); }
      },
    },
  });
  await load();
}

async function contentForm({ body, arg, route, current }) {
  const isNew = arg === 'new';
  const existing = isNew ? null : (await GET(`/admin/content/${arg}`)).item;
  if (!current()) return;
  const type = existing?.type ?? (route.query.type === 'page' ? 'page' : 'post');
  const label = type === 'page' ? 'صفحه' : 'مقاله';
  const fields = [
    { name: 'title', label: 'عنوان', required: true, full: true },
    { name: 'slug', label: 'نامک (بخشی از نشانی)', dir: 'ltr', hint: 'اگر خالی بماند از عنوان ساخته می‌شود. فقط حرف، عدد و خط تیره.' },
    { name: 'status', label: 'وضعیت', type: 'select', options: [{ value: 'draft', label: 'پیش‌نویس' }, { value: 'published', label: 'منتشرشده' }] },
    { name: 'excerpt', label: 'خلاصه', type: 'textarea', rows: 2, full: true, maxlength: 300 },
    { name: 'cover', label: 'تصویر شاخص', type: 'image', full: true },
    { name: 'body', label: 'متن', type: 'markdown', full: true, hint: 'قالب‌بندی ساده: ## تیتر، **پررنگ**، - فهرست، [متن](نشانی)' },
    ...(type === 'page' ? [{ name: 'show_in_menu', label: 'پیوند این صفحه در پایین سایت نمایش داده شود', type: 'checkbox', full: true }] : []),
  ];
  body.innerHTML = head(isNew ? `${label} جدید` : `ویرایش ${label}`, '<a class="btn btn-ghost btn-sm" href="#/panel/content">← فهرست</a>') + '<div class="card-panel" id="formBox"></div>';
  pageForm({
    body: $('#formBox', body), fields, values: existing ?? { status: 'draft' }, backHref: '#/panel/content', submitLabel: isNew ? `ایجاد ${label}` : 'ذخیره تغییرها',
    onSubmit: async (data) => {
      if (isNew) await POST('/admin/content', { ...data, type }); else await PUT(`/admin/content/${arg}`, data);
      toast(`${label} ذخیره شد.`, 'ok');
      location.hash = '#/panel/content';
    },
  });
}

/* ======================= تنظیمات سایت ======================= */
const SETTING_FIELDS = {
  content: [
    { name: 'hero_badge', label: 'برچسب بالای تیتر صفحه اصلی' },
    { name: 'hero_title', label: 'تیتر صفحه اصلی', required: true, hint: 'اگر در تیتر «،» بگذارید، بخش بعد از آن پررنگ نمایش داده می‌شود.' },
    { name: 'hero_subtitle', label: 'توضیح زیر تیتر', type: 'textarea', rows: 2, full: true },
    { name: 'announcement', label: 'نوار اعلان بالای سایت', full: true, hint: 'خالی بگذارید تا نمایش داده نشود.' },
    { name: 'footer_text', label: 'متن پایین سایت', type: 'textarea', rows: 2, full: true },
    { name: 'contact_phone', label: 'تلفن تماس', dir: 'ltr' },
    { name: 'contact_email', label: 'ایمیل تماس', dir: 'ltr' },
    { name: 'contact_address', label: 'نشانی', full: true },
  ],
  store: [
    { name: 'store_name', label: 'نام فروشگاه', required: true },
    { name: 'free_shipping_from', label: 'حداقل خرید برای ارسال رایگان با پست (تومان)', type: 'number', min: 0, required: true },
    { name: 'post_price', label: 'هزینه‌ی پست پیشتاز (تومان)', type: 'number', min: 0, required: true },
    { name: 'express_price', label: 'هزینه‌ی پیک موتوری (تومان)', type: 'number', min: 0, required: true },
  ],
};
const SETTING_TITLES = { content: 'محتوای صفحه اصلی و پایین سایت', store: 'تنظیمات فروشگاه' };

async function settings({ body }) {
  const d = await GET('/admin/settings');
  const groups = Object.keys(SETTING_FIELDS).filter((g) => SETTING_FIELDS[g].some((f) => d.editable.includes(f.name)));
  body.innerHTML = `${head('تنظیمات سایت')}${groups.map((g) => `
    <form class="card-panel" data-form="${g}" novalidate><h3>${SETTING_TITLES[g]}</h3>
      <div class="fields">${formHtml(SETTING_FIELDS[g], d.settings)}</div><p class="err form-err" id="e-form" role="alert"></p>
      <button class="btn btn-primary" type="submit">ذخیره</button></form>`).join('')}`;
  wire(body, {
    submit: async (form) => {
      const g = form.dataset.form;
      showErrors(form);
      $('#e-form', form).textContent = '';
      try {
        const r = await PUT('/admin/settings', readForm(form, SETTING_FIELDS[g]));
        Object.assign(site.settings, r.settings);
        document.dispatchEvent(new CustomEvent('settings:changed'));
        toast('تنظیمات ذخیره شد.', 'ok');
      } catch (e) { if (e.fields) showErrors(form, e.fields); else $('#e-form', form).textContent = e.message; }
    },
  });
}

/* ======================= کاربران و نقش‌ها ======================= */
async function users({ body, current }) {
  const st = { page: 1, q: '', role: '' };
  const roles = Object.entries(site.roles).map(([value, label]) => ({ value, label }));
  const base = [
    { name: 'name', label: 'نام و نام خانوادگی', required: true },
    { name: 'phone', label: 'شماره موبایل', type: 'tel', dir: 'ltr', placeholder: '09123456789' },
    { name: 'role', label: 'نقش', type: 'select', options: roles, required: true, hint: 'تغییر نقش، بلافاصله کاربر را از همه‌ی دستگاه‌ها خارج می‌کند.' },
  ];
  body.innerHTML = `${head('کاربران و نقش‌ها', '<button type="button" class="btn btn-primary btn-sm" data-action="add">＋ کاربر جدید</button>')}
    <div class="filters">${searchBox('', 'جستجو با نام، ایمیل یا موبایل…')}
      <select data-filter="role" aria-label="نقش"><option value="">همه‌ی نقش‌ها</option>${roles.map((r) => `<option value="${r.value}">${esc(r.label)}</option>`).join('')}</select></div>
    <div id="list">${skeleton(3)}</div>`;
  let items = [];
  const load = async () => {
    const d = await GET(`/admin/users${qs({ q: st.q, role: st.role, page: st.page })}`);
    if (!current()) return;
    items = d.items;
    $('#list', body).innerHTML = `<div class="card-panel flush">${table([
      { label: 'نام', render: (u) => `${esc(u.name)}${u.id === auth.user.id ? ' <small class="muted">(شما)</small>' : ''}` },
      { label: 'ایمیل', render: (u) => `<bdi dir="ltr">${esc(u.email)}</bdi>` },
      { label: 'نقش', render: (u) => badge(u.roleLabel, ROLE_KIND[u.role] || 'gray') },
      { label: 'وضعیت', render: (u) => badge(u.active ? 'فعال' : 'غیرفعال', u.active ? 'green' : 'gray') },
      { label: 'آخرین ورود', render: (u) => (u.lastLoginAt ? faDateTime(u.lastLoginAt) : '—') },
      { label: '', class: 'actions', render: (u) => iconBtn('edit', u.id, ICON.edit, `ویرایش ${u.name}`) + iconBtn('pw', u.id, ICON.lock, `بازنشانی گذرواژه ${u.name}`) },
    ], items, 'کاربری پیدا نشد.')}</div>${pager(d)}`;
  };
  wire(body, {
    page: (n) => { st.page = n; load(); },
    input: debounce((e) => { if (e.target.matches('[data-search]')) { st.q = e.target.value; st.page = 1; load(); } }),
    change: (e) => { if (e.target.dataset.filter) { st.role = e.target.value; st.page = 1; load(); } },
    click: {
      add: () => formModal({
        title: 'کاربر جدید', values: { role: 'customer' },
        fields: [base[0], { name: 'email', label: 'ایمیل', type: 'email', dir: 'ltr', required: true }, base[1], base[2], { name: 'password', label: 'گذرواژه اولیه', type: 'password', dir: 'ltr', required: true, hint: 'حداقل ۸ نویسه، ترکیبی از حروف و عدد.' }],
        onSubmit: async (data) => { await POST('/admin/users', data); toast('کاربر ساخته شد.', 'ok'); await load(); },
      }),
      edit: (t) => {
        const u = items.find((x) => String(x.id) === t.dataset.id);
        const self = u.id === auth.user.id;
        formModal({
          title: `ویرایش ${u.name}`, values: u,
          fields: [base[0], base[1], { ...base[2], ...(self ? { hint: 'نقش خودتان را نمی‌توانید تغییر دهید.' } : {}) }, { name: 'active', label: 'حساب فعال باشد', type: 'checkbox', full: true }],
          onSubmit: async (data) => { await PUT(`/admin/users/${u.id}`, data); toast('کاربر به‌روز شد.', 'ok'); await load(); },
        });
      },
      pw: (t) => {
        const u = items.find((x) => String(x.id) === t.dataset.id);
        formModal({
          title: `بازنشانی گذرواژه‌ی ${u.name}`, submitLabel: 'تغییر گذرواژه',
          fields: [{ name: 'password', label: 'گذرواژه‌ی جدید', type: 'password', dir: 'ltr', required: true, hint: 'کاربر از همه‌ی دستگاه‌ها خارج می‌شود.' }],
          onSubmit: async (data) => { await POST(`/admin/users/${u.id}/password`, data); toast('گذرواژه تغییر کرد.', 'ok'); },
        });
      },
    },
  });
  await load();
}

/* ======================= گزارش فعالیت ======================= */
async function audit({ body, current }) {
  const st = { page: 1 };
  const load = async () => {
    const d = await GET(`/admin/audit?page=${st.page}`);
    if (!current()) return;
    body.innerHTML = `${head('گزارش فعالیت', '', 'ثبت تغییرهای مهم توسط کارکنان')}<div class="card-panel flush">${table([
      { label: 'زمان', render: (x) => faDateTime(x.created_at) },
      { label: 'کاربر', render: (x) => esc(x.by_name ?? 'سیستم') },
      { label: 'عملیات', render: (x) => `${esc(FA_ACTION[x.action] ?? x.action)} ${esc(FA_ENTITY[x.entity] ?? x.entity)}` },
      { label: 'جزئیات', render: (x) => esc(x.detail) },
    ], d.items)}</div>${pager(d)}`;
  };
  wire(body, { page: (n) => { st.page = n; load(); } });
  await load();
}

const VIEWS = {
  dashboard,
  orders: myOrders,
  addresses,
  reviews: myReviews,
  profile,
  'shop-orders': shopOrders,
  products,
  categories,
  coupons,
  customers,
  moderation,
  content,
  settings,
  users,
  audit,
};

export const actions = {
  'side-toggle': (el) => {
    const side = $('.side');
    const open = side.classList.toggle('open');
    el.setAttribute('aria-expanded', String(open));
  },
};
