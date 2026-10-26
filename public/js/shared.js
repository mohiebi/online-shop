/* قطعه‌های نمایشی مشترک بین فروشگاه و پنل: سفارش، خط زمانی، کارت محصول */
import {
  esc, fmt, fmt1, money, faDateTime, tintStyle, picture, statusTag, stars, discountPct, site, ICON,
} from './core.js';

export const SHIPPING_LABEL = { post: 'پست پیشتاز', express: 'پیک موتوری' };

export function productCard(p) {
  const off = discountPct(p);
  const out = p.stock < 1;
  return `
    <article class="card">
      <a class="media" href="#/product/${p.id}" style="${tintStyle(p.tint)}" aria-label="${esc(p.title)}">
        ${picture(p)}
        ${out ? '<span class="badge out">ناموجود</span>' : off ? `<span class="badge">${fmt(off)}٪ تخفیف</span>` : ''}
      </a>
      <div class="card-body">
        <span class="cat">${esc(p.category?.title ?? '')}</span>
        <h3><a href="#/product/${p.id}">${esc(p.title)}</a></h3>
        <div class="rating">${p.reviews ? `${stars(p.rating)}<span>${fmt1(p.rating)}</span><span>(${fmt(p.reviews)} نظر)</span>` : '<span>هنوز نظری ثبت نشده</span>'}</div>
        <div class="price-row">
          <div class="prices">
            ${p.oldPrice > p.price && !out ? `<del>${fmt(p.oldPrice)}</del>` : ''}
            ${out ? '<strong class="na">ناموجود</strong>' : `<strong>${money(p.price)}</strong>`}
          </div>
          <button type="button" class="add-btn" data-action="add" data-id="${p.id}" aria-label="افزودن ${esc(p.title)} به سبد" ${out ? 'disabled' : ''}>${ICON.plus}</button>
        </div>
      </div>
    </article>`;
}

export function timeline(events) {
  return `<ol class="timeline">${events.map((e, i) => `
    <li class="${i === events.length - 1 ? 'current' : ''}">
      <span class="dot"></span>
      <div><strong>${esc(e.statusLabel)}</strong>${e.note ? `<p>${esc(e.note)}</p>` : ''}<time>${faDateTime(e.createdAt)}${e.by ? ` · ${esc(e.by)}` : ''}</time></div>
    </li>`).join('')}</ol>`;
}

export function orderItems(order) {
  return order.items.map((i) => `
    <div class="sum-line">
      <span class="thumb" style="${tintStyle(i.tint)}" aria-hidden="true">${picture(i)}</span>
      <span class="t">${i.productId ? `<a href="#/product/${i.productId}">${esc(i.title)}</a>` : esc(i.title)}<span>${fmt(i.qty)} عدد × ${fmt(i.price)}</span></span>
      <span class="p">${fmt(i.price * i.qty)}</span>
    </div>`).join('');
}

export function orderTotals(o) {
  return `<dl class="totals">
    <div><dt>جمع کالاها</dt><dd>${money(o.subtotal)}</dd></div>
    ${o.discount ? `<div class="saved"><dt>کد تخفیف ${o.couponCode ? `(<bdi dir="ltr">${esc(o.couponCode)}</bdi>)` : ''}</dt><dd>${money(o.discount)}−</dd></div>` : ''}
    <div><dt>هزینه ارسال (${SHIPPING_LABEL[o.shippingMethod] ?? ''})</dt><dd>${o.shippingCost ? money(o.shippingCost) : '<span class="free">رایگان</span>'}</dd></div>
    <div class="grand"><dt>مبلغ قابل پرداخت هنگام تحویل</dt><dd>${money(o.total)}</dd></div>
  </dl>`;
}

export function deliveryInfo(o) {
  return `<dl class="meta">
    <dt>تحویل‌گیرنده</dt><dd>${esc(o.name)}</dd>
    <dt>موبایل</dt><dd><bdi dir="ltr">${esc(o.phone)}</bdi></dd>
    <dt>نشانی</dt><dd>${esc(o.city)}، ${esc(o.address)}</dd>
    <dt>کد پستی</dt><dd><bdi dir="ltr">${esc(o.postal)}</bdi></dd>
    ${o.note ? `<dt>توضیحات</dt><dd>${esc(o.note)}</dd>` : ''}
    <dt>زمان ثبت</dt><dd>${faDateTime(o.createdAt)}</dd>
  </dl>`;
}

export const orderStatus = (o) => statusTag(o.status, o.statusLabel ?? site.statuses[o.status] ?? o.status);
