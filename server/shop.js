/* منطق مشترک فروشگاه: تنظیمات، قیمت‌گذاری سبد، کد تخفیف، سریال‌سازی */
import { get, all, run, dyn } from './db.js';
import { PALETTE, DEFAULT_SETTINGS, ORDER_STATUSES } from './constants.js';
import { nowIso } from './util.js';

const faNum = new Intl.NumberFormat('fa-IR');

/* ---------- تنظیمات ---------- */
export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of all('SELECT key, value FROM settings')) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    try { out[row.key] = JSON.parse(row.value); } catch { /* مقدار خراب: پیش‌فرض می‌ماند */ }
  }
  return out;
}

export function saveSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export const audit = (user, action, entity, entityId, detail = '') =>
  run('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)', user?.id ?? null, action, entity, entityId ?? null, detail);

/* ---------- محصول ---------- */
export const PRODUCT_SELECT = `
  SELECT p.*, c.title AS category_title,
    (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = p.id AND status = 'approved') AS rating,
    (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') AS reviews
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const safeJson = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };

export function productOut(p) {
  return {
    id: p.id,
    title: p.title,
    category: p.category_id ? { id: p.category_id, title: p.category_title } : null,
    price: p.price,
    oldPrice: p.old_price,
    stock: p.stock,
    emoji: p.emoji,
    tint: PALETTE[p.tint] ?? PALETTE[0],
    image: p.image,
    description: p.description,
    specs: safeJson(p.specs, []),
    featured: !!p.featured,
    rating: p.rating,
    reviews: p.reviews,
  };
}

/* ---------- کد تخفیف ---------- */
export function validateCoupon(code, subtotal) {
  const c = get('SELECT * FROM coupons WHERE code = ?', code);
  if (!c || !c.active) return { error: 'این کد تخفیف معتبر نیست.' };
  if (c.expires_at && c.expires_at < nowIso()) return { error: 'مهلت استفاده از این کد تخفیف تمام شده است.' };
  if (c.max_uses > 0 && c.used >= c.max_uses) return { error: 'ظرفیت استفاده از این کد تخفیف تمام شده است.' };
  if (subtotal < c.min_total) return { error: `این کد برای خریدهای بالای ${faNum.format(c.min_total)} تومان است.` };
  const discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
  return { coupon: c, discount };
}

/* ---------- قیمت‌گذاری سبد؛ همیشه سمت سرور ---------- */
export function priceCart(rawItems, { coupon: couponCode, shipping: method } = {}) {
  const settings = getSettings();
  const merged = new Map();
  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1) continue;
    merged.set(id, Math.min(99, (merged.get(id) || 0) + qty));
    if (merged.size >= 50) break;
  }
  const ids = [...merged.keys()];
  const rows = ids.length
    ? dyn(`${PRODUCT_SELECT} WHERE p.published = 1 AND p.id IN (${ids.map(() => '?').join(',')})`, ...ids)
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const lines = [];
  const issues = [];
  for (const [id, wanted] of merged) {
    const row = byId.get(id);
    if (!row) { issues.push({ id, type: 'unavailable' }); continue; }
    if (row.stock < 1) { issues.push({ id, type: 'out', title: row.title }); continue; }
    let qty = wanted;
    if (qty > row.stock) { qty = row.stock; issues.push({ id, type: 'adjusted', title: row.title, available: row.stock }); }
    lines.push({ product: productOut(row), qty });
  }

  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const saved = lines.reduce((s, l) => s + (l.product.oldPrice > l.product.price ? (l.product.oldPrice - l.product.price) * l.qty : 0), 0);

  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (couponCode && lines.length) {
    const r = validateCoupon(String(couponCode).trim(), subtotal);
    if (r.error) couponError = r.error;
    else { discount = r.discount; coupon = { code: r.coupon.code, type: r.coupon.type, value: r.coupon.value }; }
  }

  const shippingMethod = method === 'express' ? 'express' : 'post';
  const after = subtotal - discount;
  let shipping = 0;
  if (lines.length) {
    shipping = shippingMethod === 'express' ? settings.express_price : (after >= settings.free_shipping_from ? 0 : settings.post_price);
  }
  return { lines, issues, subtotal, saved, discount, coupon, couponError, shippingMethod, shipping, total: after + shipping };
}

/* ---------- سفارش ---------- */
export function orderOut(o) {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    statusLabel: ORDER_STATUSES[o.status] ?? o.status,
    subtotal: o.subtotal,
    discount: o.discount,
    shippingCost: o.shipping_cost,
    total: o.total,
    couponCode: o.coupon_code,
    shippingMethod: o.shipping_method,
    name: o.name,
    phone: o.phone,
    city: o.city,
    postal: o.postal,
    address: o.address,
    note: o.note,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    userId: o.user_id,
  };
}

export function orderDetail(o) {
  const items = all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', o.id).map((i) => ({
    id: i.id,
    productId: i.product_id,
    title: i.title,
    price: i.price,
    qty: i.qty,
    emoji: i.emoji,
    tint: PALETTE[i.tint] ?? PALETTE[0],
    image: i.image,
  }));
  const events = all(
    `SELECT e.status, e.note, e.created_at, u.name AS by_name
     FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = ? ORDER BY e.id`,
    o.id,
  ).map((e) => ({ status: e.status, statusLabel: ORDER_STATUSES[e.status] ?? e.status, note: e.note, createdAt: e.created_at, by: e.by_name }));
  return { ...orderOut(o), items, events };
}

export function restoreStock(orderId) {
  for (const i of all('SELECT product_id, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL', orderId)) {
    run('UPDATE products SET stock = stock + ? WHERE id = ?', i.qty, i.product_id);
  }
}
