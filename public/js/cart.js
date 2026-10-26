/* سبد خرید: فقط «شناسه و تعداد» در مرورگر می‌ماند؛ قیمت‌ها را همیشه سرور حساب می‌کند. */
import {
  $, esc, fmt, money, toast, POST, ICON, tintStyle, picture, skeleton,
} from './core.js';

const KEY = 'albaloo.cart';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const items = {};
    for (const [id, qty] of Object.entries(raw)) if (Number.isInteger(qty) && qty > 0 && qty < 100) items[id] = qty;
    return items;
  } catch { return {}; }
}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cart.items)); } catch { /* حالت خصوصی */ } };

export const cart = { items: load(), quote: null, loading: false };
export const cartCount = () => Object.values(cart.items).reduce((a, b) => a + b, 0);
export const cartPayload = () => Object.entries(cart.items).map(([id, qty]) => ({ id: Number(id), qty }));

let seq = 0;
export async function refreshQuote({ coupon, shipping } = {}) {
  const mine = ++seq;
  if (!cartCount()) { cart.quote = null; return null; }
  const quote = await POST('/cart/quote', { items: cartPayload(), coupon, shipping });
  if (mine !== seq) return cart.quote ?? quote;
  const next = {};
  for (const l of quote.lines) next[l.product.id] = l.qty;
  cart.items = next; // سرور مرجع است: کالاهای ناموجود حذف و تعدادها اصلاح می‌شوند
  persist();
  cart.quote = quote;
  return quote;
}

function badge() {
  const n = cartCount();
  const b = $('#cartBadge');
  b.textContent = fmt(n);
  b.hidden = n === 0;
  $('.cart-btn').setAttribute('aria-label', n ? `باز کردن سبد خرید، ${fmt(n)} کالا` : 'باز کردن سبد خرید');
}

function changed() {
  persist();
  badge();
  document.dispatchEvent(new CustomEvent('cart:change'));
}

export async function addToCart(id, qty = 1) {
  id = Number(id);
  const before = cart.items[id] || 0;
  cart.items[id] = Math.min(99, before + qty);
  changed();
  bump();
  try {
    const q = await refreshQuote();
    const issue = q?.issues.find((i) => i.id === id);
    if (issue?.type === 'adjusted') toast(`حداکثر موجودی این کالا ${fmt(issue.available)} عدد است.`, 'warn');
    else if (issue) toast('این کالا فعلاً موجود نیست.', 'warn');
    else toast('به سبد خرید اضافه شد.', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  changed();
  renderDrawer();
}

export async function setQty(id, qty) {
  id = Number(id);
  if (qty <= 0) delete cart.items[id]; else cart.items[id] = Math.min(99, qty);
  changed();
  renderDrawer();
  try { await refreshQuote(); } catch (e) { toast(e.message, 'bad'); }
  changed();
  renderDrawer();
}

export function clearCart() {
  cart.items = {};
  cart.quote = null;
  changed();
  renderDrawer();
}

function bump() {
  const b = $('#cartBadge');
  b.classList.remove('bump');
  void b.offsetWidth;
  b.classList.add('bump');
}

/* ---------- کشوی سبد ---------- */
export function renderDrawer() {
  const body = $('#drawerBody');
  const foot = $('#drawerFoot');
  const n = cartCount();
  $('#drawerTitle').textContent = n ? `سبد خرید (${fmt(n)})` : 'سبد خرید';
  if (!n) {
    body.innerHTML = `<div class="empty"><div class="big">🛒</div><h3>سبد خرید شما خالی است</h3><p>محصولی که دوست دارید را به سبد اضافه کنید.</p><a class="btn btn-primary" href="#/shop">مشاهده محصولات</a></div>`;
    foot.innerHTML = '';
    return;
  }
  const q = cart.quote;
  if (!q) { body.innerHTML = skeleton(2); foot.innerHTML = ''; return; }
  body.innerHTML = `<ul>${q.lines.map(({ product: p, qty }) => `
    <li class="line">
      <a class="line-media" href="#/product/${p.id}" style="${tintStyle(p.tint)}" aria-hidden="true" tabindex="-1">${picture(p)}</a>
      <div>
        <a class="line-title" href="#/product/${p.id}">${esc(p.title)}</a>
        <div class="line-price">${money(p.price)}</div>
        <div class="stepper sm" role="group" aria-label="تعداد ${esc(p.title)}">
          <button type="button" data-action="cart-step" data-id="${p.id}" data-delta="-1" aria-label="کم کردن">−</button>
          <output>${fmt(qty)}</output>
          <button type="button" data-action="cart-step" data-id="${p.id}" data-delta="1" aria-label="زیاد کردن" ${qty >= p.stock ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <button type="button" class="icon-btn" data-action="cart-remove" data-id="${p.id}" aria-label="حذف ${esc(p.title)} از سبد">${ICON.trash}</button>
    </li>`).join('')}</ul>`;
  foot.innerHTML = `
    <div class="sum-row"><span>جمع کالاها</span><strong>${money(q.subtotal)}</strong></div>
    <a class="btn btn-primary btn-block btn-lg" href="#/checkout">ادامه و ثبت سفارش</a>
    <button type="button" class="btn btn-ghost btn-block" data-action="close-cart">ادامه خرید</button>`;
}

let lastFocus = null;
export async function openCart() {
  const d = $('#cartDrawer');
  const o = $('#overlay');
  lastFocus = document.activeElement;
  d.removeAttribute('inert');
  o.hidden = false;
  requestAnimationFrame(() => { d.classList.add('open'); o.classList.add('show'); });
  document.body.style.overflow = 'hidden';
  $('#drawerClose').focus();
  renderDrawer();
  if (cartCount()) {
    try { await refreshQuote(); } catch (e) { toast(e.message, 'bad'); }
    changed();
    renderDrawer();
  }
}

export function closeCart() {
  const d = $('#cartDrawer');
  if (!d.classList.contains('open')) return;
  d.classList.remove('open');
  $('#overlay').classList.remove('show');
  d.setAttribute('inert', '');
  document.body.style.overflow = '';
  setTimeout(() => { if (!d.classList.contains('open')) $('#overlay').hidden = true; }, 300);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

export function initCart() {
  badge();
  renderDrawer();
}
