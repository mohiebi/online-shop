/* صفحه‌های فروشگاه: خانه، محصولات، جزئیات محصول، وبلاگ، صفحه‌های ثابت، پرداخت */
import {
  $, $$, esc, fmt, fmt1, money, faDate, GET, POST, qs, auth, site, toast, ICON, tintStyle, picture,
  stars, md, skeleton, errorBox, showErrors,
} from './core.js';
import { productCard, orderItems, orderTotals, deliveryInfo, SHIPPING_LABEL } from './shared.js';
import {
  cart, cartCount, cartPayload, refreshQuote, addToCart, clearCart,
} from './cart.js';

const emptyState = (icon, title, text = '', action = '') => `<div class="empty"><div class="big">${icon}</div><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const notFoundView = (msg = 'صفحه موردنظر پیدا نشد') => `<div class="page"><div class="container">${emptyState('🧭', msg, '', '<a class="btn btn-primary" href="#/">بازگشت به فروشگاه</a>')}</div></div>`;

const setTitle = (t) => { document.title = t ? `${t} | ${site.settings.store_name}` : `فروشگاه ${site.settings.store_name} | خرید آنلاین`; };

/* ======================= خانه ======================= */
export async function home({ main, current }) {
  main.innerHTML = skeleton(3);
  let featured; let posts;
  try {
    [featured, posts] = await Promise.all([GET('/products?featured=1&limit=8'), GET('/content?type=post&limit=3')]);
  } catch (e) { main.innerHTML = errorBox(e); return; }
  if (!current()) return;
  const s = site.settings;
  const [lead, ...rest] = s.hero_title.split('،');
  const heroTitle = rest.length ? `${esc(lead)}،<br><em>${esc(rest.join('،').trim())}</em>` : esc(s.hero_title);
  const art = featured.items.slice(0, 4);
  setTitle('');
  main.innerHTML = `
    <section class="hero"><div class="container">
      <div class="hero-box">
        <div>
          ${s.hero_badge ? `<span class="pill">${esc(s.hero_badge)}</span>` : ''}
          <h1>${heroTitle}</h1>
          <p class="lead">${esc(s.hero_subtitle)}</p>
          <div class="hero-actions"><a class="btn btn-primary btn-lg" href="#/shop">مشاهده محصولات</a></div>
        </div>
        <div class="hero-art" aria-hidden="true">
          ${art.map((p, i) => `<div class="art-tile art-${i + 1}" style="${tintStyle(p.tint)}">${picture(p)}</div>`).join('')}
        </div>
      </div>
      <div class="features">
        <div class="feature"><span class="ico">${ICON.truck}</span><div><strong>ارسال سریع</strong><span class="sub">تحویل همان روز در تهران</span></div></div>
        <div class="feature"><span class="ico">${ICON.shield}</span><div><strong>ضمانت اصالت</strong><span class="sub">کالای اصل و سالم</span></div></div>
        <div class="feature"><span class="ico">${ICON.undo}</span><div><strong>بازگشت ۷ روزه</strong><span class="sub">بدون دردسر و بدون سؤال</span></div></div>
        <div class="feature"><span class="ico">${ICON.headset}</span><div><strong>پشتیبانی هر روزه</strong><span class="sub">پاسخ‌گویی تا ۱۰ شب</span></div></div>
      </div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head"><h2>دسته‌بندی‌ها</h2></div>
      <div class="cat-row">
        ${site.categories.map((c) => `<a class="cat-tile" href="#/shop?category=${c.id}"><strong>${esc(c.title)}</strong><span>${fmt(c.count)} کالا</span></a>`).join('')}
      </div>
    </div></section>

    <section class="section tight"><div class="container">
      <div class="section-head"><h2>منتخب فروشگاه</h2><a class="more" href="#/shop">همه محصولات ←</a></div>
      <div class="grid">${featured.items.map(productCard).join('')}</div>
    </div></section>

    ${posts.items.length ? `<section class="section tight"><div class="container">
      <div class="section-head"><h2>از مجله</h2><a class="more" href="#/blog">همه مقاله‌ها ←</a></div>
      <div class="post-grid">${posts.items.map(postCard).join('')}</div>
    </div></section>` : ''}`;
}

/* ======================= فهرست محصولات ======================= */
const SORT_OPTIONS = [['popular', 'محبوب‌ترین'], ['newest', 'جدیدترین'], ['cheap', 'ارزان‌ترین'], ['expensive', 'گران‌ترین'], ['discount', 'بیشترین تخفیف']];
let shopState = null;

export async function shop({ main, route, current }) {
  shopState = {
    category: route.query.category || 'all',
    sort: route.query.sort || 'popular',
    q: route.query.q ?? '',
    page: Number(route.query.page) || 1,
  };
  setTitle('محصولات');
  $('#q').value = shopState.q;
  main.innerHTML = `
    <div class="page"><div class="container">
      <h1 class="page-title">همه محصولات</h1>
      <div class="toolbar">
        <div class="chips" role="group" aria-label="دسته‌بندی">
          ${[{ id: 'all', title: 'همه' }, ...site.categories].map((c) => `<button type="button" class="chip" data-action="shop-cat" data-cat="${c.id}" aria-pressed="${String(c.id) === shopState.category}">${esc(c.title)}</button>`).join('')}
        </div>
        <label class="sort"><span>مرتب‌سازی:</span>
          <select id="sort" data-change="shop-sort">${SORT_OPTIONS.map(([v, l]) => `<option value="${v}" ${shopState.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
      </div>
      <p class="result-count" id="count" aria-live="polite"></p>
      <div id="gridBox">${skeleton(3)}</div>
      <div id="pagerBox"></div>
    </div></div>`;
  await loadShop(current);
}

async function loadShop(current = () => true) {
  const st = shopState;
  const box = $('#gridBox');
  if (!box) return;
  history.replaceState(null, '', `#/shop${qs({ category: st.category, sort: st.sort === 'popular' ? '' : st.sort, q: st.q, page: st.page > 1 ? st.page : '' })}`);
  $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === String(st.category))));
  try {
    const data = await GET(`/products${qs({ category: st.category, sort: st.sort, q: st.q, page: st.page, limit: 12 })}`);
    if (!current() || shopState !== st) return;
    $('#count').textContent = `${fmt(data.total)} کالا${st.q ? ` برای «${st.q}»` : ''}`;
    box.innerHTML = data.items.length
      ? `<div class="grid">${data.items.map(productCard).join('')}</div>`
      : emptyState('🔍', 'کالایی پیدا نشد', 'عبارت دیگری را امتحان کنید یا فیلترها را بردارید.', '<button type="button" class="btn btn-ghost" data-action="shop-reset">پاک کردن فیلترها</button>');
    const pg = $('#pagerBox');
    pg.innerHTML = data.pages > 1 ? pagerHtml(data) : '';
  } catch (e) { box.innerHTML = errorBox(e); }
}

function pagerHtml({ page, pages }) {
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  const parts = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) parts.push('<span class="dots">…</span>');
    parts.push(`<button type="button" class="pg ${n === page ? 'on' : ''}" data-action="shop-page" data-page="${n}">${fmt(n)}</button>`);
  });
  return `<nav class="pager" aria-label="صفحه‌بندی">${parts.join('')}</nav>`;
}

export const isShopActive = () => !!$('#gridBox');
export function setShopQuery(q) {
  if (!shopState) return;
  shopState.q = q;
  shopState.page = 1;
  loadShop();
}

/* ======================= جزئیات محصول ======================= */
export async function product({ main, route, current }) {
  main.innerHTML = `<div class="page"><div class="container">${skeleton(2)}</div></div>`;
  let data;
  try { data = await GET(`/products/${encodeURIComponent(route.segs[1])}`); } catch (e) {
    if (current()) main.innerHTML = notFoundView(e.status === 404 ? 'این محصول پیدا نشد' : e.message);
    return;
  }
  if (!current()) return;
  const p = data.product;
  const off = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const stock = p.stock < 1 ? '<span class="stock out">ناموجود</span>'
    : p.stock <= 5 ? `<span class="stock low">تنها ${fmt(p.stock)} عدد در انبار مانده</span>` : '<span class="stock in">موجود در انبار</span>';
  setTitle(p.title);
  main.innerHTML = `
    <div class="page"><div class="container">
      <nav class="crumbs" aria-label="مسیر صفحه">
        <a href="#/">خانه</a><span aria-hidden="true">›</span>
        <a href="#/shop${p.category ? `?category=${p.category.id}` : ''}">${esc(p.category?.title ?? 'محصولات')}</a><span aria-hidden="true">›</span>
        <span aria-current="page">${esc(p.title)}</span>
      </nav>
      <div class="pdp">
        <div class="pdp-media" style="${tintStyle(p.tint)}">${picture(p)}</div>
        <div class="pdp-info">
          <span class="cat">${esc(p.category?.title ?? '')}</span>
          <h1>${esc(p.title)}</h1>
          <div class="rating">${p.reviews ? `${stars(p.rating)}<span>${fmt1(p.rating)}</span><span>(${fmt(p.reviews)} نظر)</span>` : '<span>هنوز نظری ثبت نشده</span>'}</div>
          <div class="pdp-price">
            <strong>${money(p.price)}</strong>
            ${off ? `<del>${fmt(p.oldPrice)}</del><span class="off">${fmt(off)}٪ تخفیف</span>` : ''}
          </div>
          ${stock}
          <p class="pdp-desc">${esc(p.description)}</p>
          ${p.stock > 0 ? `
          <div class="buy-row">
            <div class="stepper" role="group" aria-label="تعداد">
              <button type="button" data-action="pstep" data-delta="-1" aria-label="کم کردن">−</button>
              <output id="pqty" data-v="1" data-max="${p.stock}" aria-live="polite">${fmt(1)}</output>
              <button type="button" data-action="pstep" data-delta="1" aria-label="زیاد کردن">+</button>
            </div>
            <button type="button" class="btn btn-primary btn-lg" data-action="padd" data-id="${p.id}">افزودن به سبد</button>
            <button type="button" class="btn btn-ghost btn-lg" data-action="pbuy" data-id="${p.id}">خرید سریع</button>
          </div>` : ''}
          ${p.specs.length ? `<table class="specs"><caption class="sr-only">مشخصات فنی</caption><tbody>
            ${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
          </tbody></table>` : ''}
          <div class="perks"><span>${ICON.check} ضمانت اصالت کالا</span><span>${ICON.check} بازگشت ۷ روزه</span><span>${ICON.check} پرداخت در محل</span></div>
        </div>
      </div>
      <section class="reviews" aria-labelledby="revTitle"><h2 id="revTitle">نظر خریداران</h2><div id="reviewBox">${skeleton(1)}</div></section>
      ${data.related.length ? `<section class="related"><h2>محصولات مرتبط</h2><div class="grid">${data.related.map(productCard).join('')}</div></section>` : ''}
    </div></div>`;
  loadReviews(p.id, current);
}

async function loadReviews(id, current) {
  const box = $('#reviewBox');
  try {
    const data = await GET(`/products/${id}/reviews`);
    if (!current() || !box.isConnected) return;
    let form = '';
    if (!auth.user) form = `<p class="note">برای ثبت نظر، ابتدا <a href="#/login?next=${encodeURIComponent(`#/product/${id}`)}">وارد حساب کاربری</a> شوید.</p>`;
    else if (data.mine) form = `<p class="note">${data.mine.status === 'approved' ? 'نظر شما منتشر شده است.' : data.mine.status === 'pending' ? 'نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود.' : 'نظر شما تأیید نشد.'}</p>`;
    else if (data.canReview) {
      form = `<form class="review-form" data-form="review" data-id="${id}" novalidate>
        <h3>نظر شما</h3>
        <div class="field"><label for="rv-rating">امتیاز</label>
          <select id="rv-rating" name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)} (${fmt(n)} از ۵)</option>`).join('')}</select></div>
        <div class="field"><label for="rv-body">متن نظر</label><textarea id="rv-body" name="body" rows="3" maxlength="1000"></textarea><span class="err" id="e-body" role="alert"></span></div>
        <button class="btn btn-primary" type="submit">ثبت نظر</button></form>`;
    } else form = '<p class="note">فقط خریدارانِ این کالا (پس از تحویل سفارش) می‌توانند نظر ثبت کنند.</p>';
    box.innerHTML = `${data.items.length ? data.items.map((r) => `
      <article class="review"><header><strong>${esc(r.author)}</strong>${stars(r.rating)}<time>${faDate(r.createdAt)}</time></header><p>${esc(r.body)}</p></article>`).join('') : '<p class="muted">هنوز نظری برای این کالا ثبت نشده است.</p>'}${form}`;
  } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

/* ======================= وبلاگ و صفحه‌های ثابت ======================= */
function postCard(p) {
  return `<a class="post-card" href="#/blog/${encodeURIComponent(p.slug)}">
    <div class="post-cover" ${p.cover ? '' : 'data-empty'}>${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : '<span aria-hidden="true">📝</span>'}</div>
    <div class="post-body"><time>${faDate(p.publishedAt)}</time><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div></a>`;
}

export async function blog({ main, route, current }) {
  setTitle('مجله');
  main.innerHTML = `<div class="page"><div class="container"><h1 class="page-title">مجله</h1>${skeleton(3)}</div></div>`;
  try {
    const page = Number(route.query.page) || 1;
    const data = await GET(`/content?type=post&limit=9&page=${page}`);
    if (!current()) return;
    main.innerHTML = `<div class="page"><div class="container"><h1 class="page-title">مجله</h1>
      ${data.items.length ? `<div class="post-grid">${data.items.map(postCard).join('')}</div>` : emptyState('📝', 'هنوز مقاله‌ای منتشر نشده است')}
      ${data.pages > 1 ? `<nav class="pager">${Array.from({ length: data.pages }, (_, i) => `<a class="pg ${i + 1 === page ? 'on' : ''}" href="#/blog?page=${i + 1}">${fmt(i + 1)}</a>`).join('')}</nav>` : ''}</div></div>`;
  } catch (e) { main.innerHTML = errorBox(e); }
}

async function contentPage(type, slug, { main, current }) {
  main.innerHTML = `<div class="page"><div class="container narrow">${skeleton(2)}</div></div>`;
  try {
    const { content: c } = await GET(`/content/${type}/${encodeURIComponent(slug)}`);
    if (!current()) return;
    setTitle(c.title);
    main.innerHTML = `<div class="page"><div class="container narrow"><article>
      <nav class="crumbs" aria-label="مسیر صفحه"><a href="#/">خانه</a><span aria-hidden="true">›</span>${type === 'post' ? '<a href="#/blog">مجله</a><span aria-hidden="true">›</span>' : ''}<span aria-current="page">${esc(c.title)}</span></nav>
      <h1 class="page-title">${esc(c.title)}</h1>
      ${type === 'post' ? `<p class="post-meta">${faDate(c.publishedAt)}${c.author ? ` · ${esc(c.author)}` : ''}</p>` : ''}
      ${c.cover ? `<img class="post-hero" src="${esc(c.cover)}" alt="">` : ''}
      <div class="prose">${md(c.body)}</div></article></div></div>`;
  } catch (e) {
    if (current()) main.innerHTML = notFoundView(e.status === 404 ? 'این صفحه پیدا نشد' : e.message);
  }
}
export const post = (ctx) => contentPage('post', ctx.route.segs[1], ctx);
export const page = (ctx) => contentPage('page', ctx.route.segs[1], ctx);

/* ======================= پرداخت (ثبت سفارش) ======================= */
const co = { shipping: 'post', coupon: null, addresses: [] };

export async function checkout({ main, current }) {
  setTitle('ثبت سفارش');
  if (!auth.user) { location.hash = `#/login?next=${encodeURIComponent('#/checkout')}`; return; }
  if (!cartCount()) {
    main.innerHTML = `<div class="page"><div class="container">${emptyState('🛒', 'سبد خرید شما خالی است', 'برای ثبت سفارش، ابتدا چند کالا به سبد اضافه کنید.', '<a class="btn btn-primary" href="#/shop">مشاهده محصولات</a>')}</div></div>`;
    return;
  }
  main.innerHTML = `<div class="page"><div class="container">${skeleton(3)}</div></div>`;
  co.coupon = null;
  co.shipping = 'post';
  try {
    const [addr] = await Promise.all([GET('/account/addresses'), refreshQuote({ shipping: co.shipping })]);
    if (!current()) return;
    co.addresses = addr.items;
  } catch (e) { main.innerHTML = errorBox(e); return; }
  if (!cartCount()) { checkout({ main, current }); return; }
  const def = co.addresses.find((a) => a.isDefault) ?? null;
  const v = def ?? { name: auth.user.name, phone: auth.user.phone ?? '', city: '', postal: '', address: '' };
  const f = (name, label, value, attrs = '') => `<div class="field"><label for="c-${name}">${label}</label><input id="c-${name}" name="${name}" value="${esc(value)}" ${attrs} aria-describedby="e-${name}"><span class="err" id="e-${name}" role="alert"></span></div>`;
  const s = site.settings;
  main.innerHTML = `
    <div class="page"><div class="container">
      <h1 class="page-title">ثبت سفارش</h1>
      <div class="checkout">
        <form id="checkoutForm" data-form="checkout" novalidate>
          <div class="panel">
            <h2>اطلاعات تحویل‌گیرنده</h2>
            ${co.addresses.length ? `<div class="field full"><label for="addrPick">نشانی‌های ذخیره‌شده</label>
              <select id="addrPick" data-change="addr-pick">${co.addresses.map((a) => `<option value="${a.id}" ${def?.id === a.id ? 'selected' : ''}>${esc(a.title)} — ${esc(a.city)}</option>`).join('')}<option value="">نشانی جدید…</option></select></div>` : ''}
            <div class="fields">
              ${f('name', 'نام و نام خانوادگی', v.name, 'autocomplete="name"')}
              ${f('phone', 'شماره موبایل', v.phone, 'type="tel" inputmode="tel" autocomplete="tel" dir="ltr" class="ltr" placeholder="09123456789"')}
              ${f('city', 'شهر', v.city, 'autocomplete="address-level2"')}
              ${f('postal', 'کد پستی', v.postal, 'inputmode="numeric" maxlength="10" autocomplete="postal-code" dir="ltr" class="ltr" placeholder="۱۰ رقم"')}
              <div class="field full"><label for="c-address">نشانی کامل</label><textarea id="c-address" name="address" rows="3" autocomplete="street-address" aria-describedby="e-address">${esc(v.address)}</textarea><span class="err" id="e-address" role="alert"></span></div>
              <div class="field full"><label for="c-note">توضیحات سفارش <span class="opt">(اختیاری)</span></label><textarea id="c-note" name="note" rows="2"></textarea></div>
            </div>
          </div>
          <div class="panel">
            <h2>روش ارسال</h2>
            <label class="ship-opt"><input type="radio" name="shipping" value="post" checked><span class="grow"><strong>${SHIPPING_LABEL.post}</strong><span class="sub">۳ تا ۵ روز کاری، سراسر کشور</span></span><span class="cost" data-ship-cost="post"></span></label>
            <label class="ship-opt"><input type="radio" name="shipping" value="express"><span class="grow"><strong>${SHIPPING_LABEL.express}</strong><span class="sub">تحویل همان روز، فقط تهران</span></span><span class="cost">${fmt(s.express_price)} تومان</span></label>
            <span class="err" id="e-shipping" role="alert"></span>
          </div>
          <div class="panel"><h2>روش پرداخت</h2><div class="pay-note">${ICON.check}<span>پرداخت هنگام تحویل سفارش، به‌صورت نقدی یا با کارت‌خوان پیک انجام می‌شود.</span></div></div>
        </form>
        <aside class="summary panel" aria-labelledby="sumTitle">
          <h2 id="sumTitle">خلاصه سفارش</h2>
          <div class="sum-lines" id="sumLines"></div>
          <div class="coupon-form"><input id="coupon" type="text" placeholder="کد تخفیف" autocomplete="off" aria-label="کد تخفیف" aria-describedby="couponMsg"><button type="button" class="btn btn-ghost" data-action="coupon-apply">اعمال</button></div>
          <div class="coupon-msg" id="couponMsg" aria-live="polite"></div>
          <dl class="totals" id="sumTotals"></dl>
          <button type="submit" form="checkoutForm" class="btn btn-primary btn-lg btn-block" id="placeBtn">ثبت نهایی سفارش</button>
        </aside>
      </div>
    </div></div>`;
  renderSummary();
}

function renderSummary() {
  const q = cart.quote;
  if (!q || !$('#sumLines')) return;
  const s = site.settings;
  $('#sumLines').innerHTML = q.lines.map(({ product: p, qty }) => `
    <div class="sum-line"><span class="thumb" style="${tintStyle(p.tint)}" aria-hidden="true">${picture(p)}</span>
    <span class="t">${esc(p.title)}<span>${fmt(qty)} عدد</span></span><span class="p">${fmt(p.price * qty)}</span></div>`).join('');
  $('#sumTotals').innerHTML = `
    <div><dt>جمع کالاها</dt><dd>${money(q.subtotal + q.saved)}</dd></div>
    ${q.saved ? `<div class="saved"><dt>سود شما از تخفیف‌ها</dt><dd>${money(q.saved)}−</dd></div>` : ''}
    ${q.discount ? `<div class="saved"><dt>کد تخفیف</dt><dd>${money(q.discount)}−</dd></div>` : ''}
    <div><dt>هزینه ارسال</dt><dd>${q.shipping === 0 ? '<span class="free">رایگان</span>' : money(q.shipping)}</dd></div>
    <div class="grand"><dt>مبلغ قابل پرداخت</dt><dd>${money(q.total)}</dd></div>`;
  const postCost = q.subtotal - q.discount >= s.free_shipping_from ? 0 : s.post_price;
  const el = $('[data-ship-cost="post"]');
  if (el) el.textContent = postCost === 0 ? 'رایگان' : `${fmt(postCost)} تومان`;
  const msg = $('#couponMsg');
  if (co.coupon && q.coupon) {
    msg.className = 'coupon-msg ok';
    msg.innerHTML = `کد «<bdi dir="ltr">${esc(q.coupon.code)}</bdi>» اعمال شد. <button type="button" class="link-btn" data-action="coupon-remove">حذف</button>`;
  }
}

async function requote() {
  try {
    const q = await refreshQuote({ coupon: co.coupon, shipping: co.shipping });
    if (!q) { location.hash = '#/checkout'; return; }
    renderSummary();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------- صفحه‌ی تأیید سفارش ---------- */
export async function orderDone({ main, route, current }) {
  setTitle('سفارش ثبت شد');
  if (!auth.user) { location.hash = '#/login'; return; }
  main.innerHTML = `<div class="page"><div class="container narrow">${skeleton(2)}</div></div>`;
  try {
    const { order: o } = await GET(`/account/orders/${encodeURIComponent(route.segs[1])}`);
    if (!current()) return;
    main.innerHTML = `<div class="page"><div class="container"><div class="done">
      <div class="tick">${ICON.tick}</div>
      <h1>سفارش شما ثبت شد</h1>
      <p class="muted">ممنون از خریدتان، ${esc(o.name)} عزیز. برای هماهنگی ارسال با شما تماس می‌گیریم.</p>
      <div class="code"><bdi dir="ltr">${esc(o.code)}</bdi></div>
      <p class="muted small">کد پیگیری سفارش</p>
      <div class="panel"><h2>اقلام سفارش</h2>${orderItems(o)}${orderTotals(o)}</div>
      <div class="panel"><h2>اطلاعات تحویل</h2>${deliveryInfo(o)}</div>
      <p class="done-actions"><a class="btn btn-primary btn-lg" href="#/panel/orders/${encodeURIComponent(o.code)}">پیگیری سفارش</a><a class="btn btn-ghost btn-lg" href="#/shop">ادامه خرید</a></p>
    </div></div></div>`;
  } catch (e) { main.innerHTML = notFoundView(e.status === 404 ? 'سفارش پیدا نشد' : e.message); }
}

/* ======================= کنش‌ها و فرم‌ها ======================= */
export const actions = {
  add: (el) => addToCart(el.dataset.id),
  'shop-cat': (el) => { shopState.category = el.dataset.cat; shopState.page = 1; loadShop(); },
  'shop-page': (el) => { shopState.page = Number(el.dataset.page); loadShop(); $('.page-title')?.scrollIntoView({ behavior: 'smooth' }); },
  'shop-reset': () => { Object.assign(shopState, { category: 'all', q: '', page: 1 }); $('#q').value = ''; loadShop(); },
  pstep: (el) => {
    const out = $('#pqty');
    const next = Math.max(1, Math.min(Number(out.dataset.max), Number(out.dataset.v) + Number(el.dataset.delta)));
    out.dataset.v = next;
    out.textContent = fmt(next);
  },
  padd: (el) => addToCart(el.dataset.id, Number($('#pqty').dataset.v)),
  pbuy: async (el) => {
    await addToCart(el.dataset.id, Number($('#pqty').dataset.v));
    if (cart.items[el.dataset.id]) location.hash = '#/checkout';
  },
  'coupon-apply': async () => {
    const input = $('#coupon');
    const code = input.value.trim().toUpperCase();
    const msg = $('#couponMsg');
    if (!code) { msg.className = 'coupon-msg bad'; msg.textContent = 'کد تخفیف را وارد کنید.'; return; }
    try {
      const q = await refreshQuote({ coupon: code, shipping: co.shipping });
      if (q.couponError) {
        msg.className = 'coupon-msg bad';
        msg.textContent = q.couponError;
        await refreshQuote({ coupon: co.coupon, shipping: co.shipping });
      } else { co.coupon = code; input.value = ''; msg.className = 'coupon-msg'; }
      renderSummary();
    } catch (e) { toast(e.message, 'bad'); }
  },
  'coupon-remove': async () => { co.coupon = null; $('#couponMsg').className = 'coupon-msg'; $('#couponMsg').textContent = ''; await requote(); },
};

export const changes = {
  'shop-sort': (el) => { shopState.sort = el.value; shopState.page = 1; loadShop(); },
  'addr-pick': (el) => {
    const a = co.addresses.find((x) => String(x.id) === el.value);
    const form = $('#checkoutForm');
    for (const k of ['name', 'phone', 'city', 'postal', 'address']) form.elements[k].value = a ? a[k] : '';
  },
};

export const radioChange = async (name, value) => {
  if (name === 'shipping') { co.shipping = value; await requote(); }
};

export const forms = {
  async review(form) {
    const err = $('#e-body', form);
    err.textContent = '';
    try {
      const r = await POST(`/products/${form.dataset.id}/reviews`, { rating: form.elements.rating.value, body: form.elements.body.value });
      toast(r.message, 'ok');
      form.replaceWith(Object.assign(document.createElement('p'), { className: 'note', textContent: r.message }));
    } catch (e) { err.textContent = e.fields?.body || e.message; }
  },
  async checkout(form) {
    const btn = $('#placeBtn');
    const data = Object.fromEntries(new FormData(form).entries());
    showErrors(form, {});
    btn.disabled = true;
    try {
      const r = await POST('/orders', { ...data, shipping: co.shipping, coupon: co.coupon, items: cartPayload() });
      clearCart();
      location.hash = `#/order-done/${encodeURIComponent(r.order.code)}`;
    } catch (e) {
      if (e.fields?.issues) { toast(e.message, 'warn'); await requote(); }
      else if (e.fields) { showErrors(form, e.fields); if (e.fields.coupon) toast(e.fields.coupon, 'warn'); else toast(e.message, 'bad'); }
      else toast(e.message, 'bad');
    } finally { btn.disabled = false; }
  },
};
