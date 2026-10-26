/* نقطه‌ی شروع: بارگذاری اولیه، مسیریابی، هدر و پانوشت، و رویدادهای سراسری */
import {
  $, $$, esc, auth, site, toast, ICON, GET, POST, errorBox, debounce,
} from './core.js';
import {
  cart, addToCart, setQty, initCart, openCart, closeCart,
} from './cart.js';
import * as store from './store.js';
import * as authViews from './auth.js';
import * as panel from './panel.js';

let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  let segs;
  try { segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent); } catch { segs = ['404']; }
  return { raw, segs, query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

async function route() {
  const token = ++renderToken;
  const current = () => token === renderToken;
  const r = parseHash();
  const ctx = { main: $('#main'), route: r, current };
  closeCart();
  $$('.main-nav a').forEach((a) => (r.segs[0] === a.dataset.nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (r.segs[0] !== 'panel') window.scrollTo({ top: 0, behavior: 'instant' });

  const views = {
    undefined: store.home,
    shop: store.shop,
    product: store.product,
    blog: r.segs[1] ? store.post : store.blog,
    page: store.page,
    login: authViews.login,
    register: authViews.register,
    checkout: store.checkout,
    'order-done': store.orderDone,
    panel: panel.panel,
  };
  const view = views[r.segs[0]];
  try {
    if (!view) { ctx.main.innerHTML = store.notFoundView(); document.title = `صفحه پیدا نشد | ${site.settings.store_name}`; return; }
    await view(ctx);
  } catch (e) {
    if (current()) ctx.main.innerHTML = `<div class="page"><div class="container">${errorBox(e)}</div></div>`;
  }
}

/* ---------- هدر و پانوشت ---------- */
function renderAuthArea() {
  const el = $('#authArea');
  const u = auth.user;
  if (!u) {
    el.innerHTML = '<a class="btn btn-ghost btn-sm" href="#/login">ورود</a><a class="btn btn-primary btn-sm" href="#/register">ثبت‌نام</a>';
    return;
  }
  el.innerHTML = `<a class="user-chip" href="#/panel" aria-label="پنل کاربری ${esc(u.name)}">
    <span class="avatar" aria-hidden="true">${esc(u.name.trim()[0] ?? '؟')}</span>
    <span class="uname"><strong>${esc(u.name.split(' ')[0])}</strong><small>${esc(u.roleLabel)}</small></span></a>`;
}

function applySettings() {
  const s = site.settings;
  $('#brand').textContent = s.store_name;
  const bar = $('#announce');
  bar.hidden = !s.announcement;
  bar.textContent = s.announcement;
  const year = new Date().toLocaleDateString('fa-IR', { year: 'numeric' });
  const contact = [s.contact_phone && `📞 <bdi dir="ltr">${esc(s.contact_phone)}</bdi>`, s.contact_email && `✉️ <bdi dir="ltr">${esc(s.contact_email)}</bdi>`, s.contact_address && `📍 ${esc(s.contact_address)}`].filter(Boolean);
  $('#footer').innerHTML = `<div class="container footer-row">
    <div class="footer-about"><strong class="footer-brand">فروشگاه ${esc(s.store_name)}</strong><p>${esc(s.footer_text)}</p>${contact.length ? `<ul class="footer-contact">${contact.map((c) => `<li>${c}</li>`).join('')}</ul>` : ''}</div>
    <nav class="footer-links" aria-label="پیوندهای پایین صفحه"><a href="#/shop">فروشگاه</a><a href="#/blog">مجله</a>${site.pages.map((p) => `<a href="#/page/${encodeURIComponent(p.slug)}">${esc(p.title)}</a>`).join('')}</nav>
    <p class="copyright">© ${year} فروشگاه ${esc(s.store_name)}</p></div>`;
}

/* ---------- کنش‌ها و فرم‌های سراسری ---------- */
const actions = {
  ...store.actions,
  ...panel.actions,
  'open-cart': () => openCart(),
  'close-cart': () => closeCart(),
  'cart-step': (el) => setQty(el.dataset.id, (cart.items[el.dataset.id] || 0) + Number(el.dataset.delta)),
  'cart-remove': (el) => setQty(el.dataset.id, 0),
  reload: () => (site.palette.length ? route() : location.reload()),
  logout: async () => {
    try { await POST('/auth/logout'); } catch { /* حتی در خطا، وضعیت محلی پاک می‌شود */ }
    auth.user = null;
    auth.csrf = null;
    renderAuthArea();
    location.hash = '#/';
    toast('از حساب خود خارج شدید.');
  },
};
const forms = { ...store.forms, ...authViews.forms };

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-skip]')) { e.preventDefault(); $('#main').focus(); return; }
  if (e.target.closest('.drawer a[href^="#/"]')) closeCart();
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

document.addEventListener('change', (e) => {
  const key = e.target.dataset?.change;
  if (key && store.changes[key]) store.changes[key](e.target);
  if (e.target.name === 'shipping' && e.target.type === 'radio') store.radioChange('shipping', e.target.value);
});

document.addEventListener('submit', (e) => {
  const handler = forms[e.target.dataset?.form];
  if (handler) { e.preventDefault(); handler(e.target, e); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCart();
  if (e.key === 'Enter' && e.target.id === 'coupon') { e.preventDefault(); actions['coupon-apply'](); }
});

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (store.isShopActive()) store.setShopQuery(q);
  else location.hash = `#/shop${q ? `?q=${encodeURIComponent(q)}` : ''}`;
});
$('#q').addEventListener('input', debounce(() => {
  const q = $('#q').value.trim();
  if (store.isShopActive()) store.setShopQuery(q);
  else if (q.length >= 2) location.hash = `#/shop?q=${encodeURIComponent(q)}`;
}, 350));

document.addEventListener('auth:changed', renderAuthArea);
document.addEventListener('settings:changed', applySettings);
document.addEventListener('auth:expired', () => {
  renderAuthArea();
  toast('نشست شما منقضی شد؛ دوباره وارد شوید.', 'warn');
  const first = parseHash().segs[0];
  if (first === 'panel' || first === 'checkout') location.hash = `#/login?next=${encodeURIComponent(location.hash)}`;
});

window.addEventListener('hashchange', route);

/* ---------- شروع ---------- */
async function boot() {
  $('#searchBtn').innerHTML = ICON.search;
  $('#cartIcon').innerHTML = ICON.cart;
  $('#drawerClose').innerHTML = ICON.close;
  try {
    const [me, pub, meta, cats] = await Promise.all([GET('/auth/me'), GET('/settings/public'), GET('/meta'), GET('/categories')]);
    auth.user = me.user;
    auth.csrf = me.csrf;
    site.settings = pub.settings;
    site.pages = pub.pages;
    site.palette = meta.palette;
    site.statuses = meta.orderStatuses;
    site.roles = meta.roles;
    site.categories = cats.items;
  } catch (e) {
    $('#main').innerHTML = `<div class="page"><div class="container">${errorBox(e)}</div></div>`;
    return;
  }
  applySettings();
  renderAuthArea();
  initCart();
  await route();
}

boot();
