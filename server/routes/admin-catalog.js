/* مدیریت محصولات، دسته‌بندی‌ها، کدهای تخفیف، نظرها و بارگذاری تصویر */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get, all, run, UPLOAD_DIR } from '../db.js';
import { PALETTE } from '../constants.js';
import {
  fail, parse, paging, pageMeta, readBody, insertSql, updateSql, nowIso, normFa,
} from '../util.js';
import { audit } from '../shop.js';

const specsToJson = (text) => {
  const pairs = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : [line, ''];
  }).filter(([k]) => k).slice(0, 30);
  return JSON.stringify(pairs);
};
const specsToText = (json) => {
  try { return JSON.parse(json).map(([k, v]) => `${k}: ${v}`).join('\n'); } catch { return ''; }
};

const productSchema = {
  title: { type: 'string', required: true, min: 2, max: 120, label: 'عنوان' },
  category_id: { type: 'int', required: true, label: 'دسته‌بندی' },
  price: { type: 'int', required: true, min: 0, max: 10_000_000_000, label: 'قیمت' },
  old_price: { type: 'int', min: 0, max: 10_000_000_000, default: null, label: 'قیمت قبل از تخفیف' },
  stock: { type: 'int', required: true, min: 0, max: 1_000_000, label: 'موجودی' },
  emoji: { type: 'string', max: 8, default: '🛍️', label: 'ایموجی' },
  tint: { type: 'int', min: 0, max: PALETTE.length - 1, default: 0, label: 'رنگ پس‌زمینه' },
  image: { type: 'path', default: null, label: 'تصویر' },
  description: { type: 'string', max: 5000, default: '', label: 'توضیحات' },
  specs: { type: 'string', max: 3000, default: '', label: 'مشخصات' },
  featured: { type: 'bool', default: false },
  published: { type: 'bool', default: true },
};

const adminProduct = (p) => ({
  id: p.id, title: p.title, category_id: p.category_id, category_title: p.category_title, price: p.price, old_price: p.old_price,
  stock: p.stock, emoji: p.emoji, tint: p.tint, image: p.image, description: p.description, specs: specsToText(p.specs),
  featured: !!p.featured, published: !!p.published, created_at: p.created_at, updated_at: p.updated_at,
});

function validateProduct(data) {
  if (!get('SELECT id FROM categories WHERE id = ?', data.category_id)) fail(422, 'دسته‌بندی نامعتبر است.', { category_id: 'دسته‌بندی نامعتبر است.' });
  if (data.old_price != null && data.old_price <= data.price) {
    fail(422, 'قیمت قبل از تخفیف باید بیشتر از قیمت فعلی باشد.', { old_price: 'قیمت قبل از تخفیف باید بیشتر از قیمت فعلی باشد.' });
  }
}

const MAGIC = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8',
  webp: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export default function register(r) {
  /* ---------- محصولات ---------- */
  const products = { perm: 'products.manage' };

  r.get('/api/admin/products', ({ query }) => {
    const pg = paging(query, 15);
    const where = ['1 = 1'];
    const params = [];
    const q = normFa(query.q).replace(/[%_]/g, '');
    if (q) { where.push("replace(p.title, char(8204), ' ') LIKE ?"); params.push(`%${q}%`); }
    if (query.category) { where.push('p.category_id = ?'); params.push(Number(query.category) || 0); }
    if (query.status === 'published') where.push('p.published = 1');
    if (query.status === 'draft') where.push('p.published = 0');
    if (query.status === 'low') where.push('p.stock <= 5');
    const total = get(`SELECT COUNT(*) AS n FROM products p WHERE ${where.join(' AND ')}`, ...params).n;
    const rows = all(
      `SELECT p.*, c.title AS category_title FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
      ...params, pg.limit, pg.offset,
    );
    return { items: rows.map(adminProduct), ...pageMeta(total, pg) };
  }, products);

  r.get('/api/admin/products/:id', ({ params }) => {
    const row = get('SELECT p.*, c.title AS category_title FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', Number(params.id) || 0);
    if (!row) fail(404, 'محصول پیدا نشد.');
    return { item: adminProduct(row) };
  }, products);

  r.post('/api/admin/products', ({ body, user }) => {
    const data = parse(body, productSchema);
    validateProduct(data);
    const { sql, values } = insertSql('products', { ...data, specs: specsToJson(data.specs) });
    const { id } = run(sql, ...values);
    audit(user, 'create', 'product', id, data.title);
    return { item: { id } };
  }, products);

  r.put('/api/admin/products/:id', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    if (!get('SELECT id FROM products WHERE id = ?', id)) fail(404, 'محصول پیدا نشد.');
    const data = parse(body, productSchema);
    validateProduct(data);
    const { sql, values } = updateSql('products', { ...data, specs: specsToJson(data.specs), updated_at: nowIso() });
    run(sql, ...values, id);
    audit(user, 'update', 'product', id, data.title);
    return { item: { id } };
  }, products);

  r.delete('/api/admin/products/:id', ({ params, user }) => {
    const id = Number(params.id) || 0;
    const row = get('SELECT title FROM products WHERE id = ?', id);
    if (!row) fail(404, 'محصول پیدا نشد.');
    run('DELETE FROM products WHERE id = ?', id);
    audit(user, 'delete', 'product', id, row.title);
    return { ok: true };
  }, products);

  /* ---------- دسته‌بندی‌ها ---------- */
  const categories = { perm: 'categories.manage' };
  const categorySchema = {
    title: { type: 'string', required: true, min: 2, max: 60, label: 'عنوان' },
    sort_order: { type: 'int', min: 0, max: 1000, default: 0, label: 'ترتیب نمایش' },
  };

  r.get('/api/admin/categories', () => ({
    items: all(
      `SELECT c.id, c.title, c.sort_order, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products
       FROM categories c ORDER BY c.sort_order, c.id`,
    ),
  }), { perm: ['categories.manage', 'products.manage'] });

  r.get('/api/admin/categories/:id', ({ params }) => {
    const row = get('SELECT id, title, sort_order FROM categories WHERE id = ?', Number(params.id) || 0);
    if (!row) fail(404, 'دسته‌بندی پیدا نشد.');
    return { item: row };
  }, categories);

  r.post('/api/admin/categories', ({ body, user }) => {
    const data = parse(body, categorySchema);
    const { id } = run('INSERT INTO categories (title, sort_order) VALUES (?, ?)', data.title, data.sort_order);
    audit(user, 'create', 'category', id, data.title);
    return { item: { id } };
  }, categories);

  r.put('/api/admin/categories/:id', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    if (!get('SELECT id FROM categories WHERE id = ?', id)) fail(404, 'دسته‌بندی پیدا نشد.');
    const data = parse(body, categorySchema);
    run('UPDATE categories SET title = ?, sort_order = ? WHERE id = ?', data.title, data.sort_order, id);
    audit(user, 'update', 'category', id, data.title);
    return { item: { id } };
  }, categories);

  r.delete('/api/admin/categories/:id', ({ params, user }) => {
    const id = Number(params.id) || 0;
    const row = get('SELECT title FROM categories WHERE id = ?', id);
    if (!row) fail(404, 'دسته‌بندی پیدا نشد.');
    if (get('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', id).n) fail(409, 'این دسته‌بندی محصول دارد؛ ابتدا محصولاتش را جابه‌جا یا حذف کنید.');
    run('DELETE FROM categories WHERE id = ?', id);
    audit(user, 'delete', 'category', id, row.title);
    return { ok: true };
  }, categories);

  /* ---------- کدهای تخفیف ---------- */
  const coupons = { perm: 'coupons.manage' };
  const couponSchema = {
    code: { type: 'string', required: true, min: 3, max: 30, pattern: /^[A-Za-z0-9_-]+$/, msg: 'کد فقط می‌تواند شامل حروف انگلیسی، عدد، - و _ باشد.', label: 'کد' },
    type: { type: 'enum', values: ['percent', 'fixed'], required: true, label: 'نوع تخفیف' },
    value: { type: 'int', required: true, min: 1, max: 10_000_000_000, label: 'مقدار تخفیف' },
    min_total: { type: 'int', min: 0, max: 10_000_000_000, default: 0, label: 'حداقل مبلغ خرید' },
    max_uses: { type: 'int', min: 0, max: 1_000_000, default: 0, label: 'سقف استفاده' },
    expires_at: { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/, msg: 'تاریخ انقضا نامعتبر است.', default: null, label: 'تاریخ انقضا' },
    active: { type: 'bool', default: true },
  };
  const couponOut = (c) => ({ ...c, active: !!c.active, expires_at: c.expires_at ? c.expires_at.slice(0, 10) : null });
  const couponPrepare = (data) => {
    if (data.type === 'percent' && data.value > 100) fail(422, 'درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.', { value: 'درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.' });
    return { ...data, code: data.code.toUpperCase(), expires_at: data.expires_at ? `${data.expires_at}T23:59:59.999Z` : null };
  };

  r.get('/api/admin/coupons', () => ({ items: all('SELECT * FROM coupons ORDER BY id DESC').map(couponOut) }), coupons);
  r.get('/api/admin/coupons/:id', ({ params }) => {
    const row = get('SELECT * FROM coupons WHERE id = ?', Number(params.id) || 0);
    if (!row) fail(404, 'کد تخفیف پیدا نشد.');
    return { item: couponOut(row) };
  }, coupons);

  r.post('/api/admin/coupons', ({ body, user }) => {
    const data = couponPrepare(parse(body, couponSchema));
    if (get('SELECT id FROM coupons WHERE code = ?', data.code)) fail(422, 'این کد قبلاً ثبت شده است.', { code: 'این کد قبلاً ثبت شده است.' });
    const { sql, values } = insertSql('coupons', data);
    const { id } = run(sql, ...values);
    audit(user, 'create', 'coupon', id, data.code);
    return { item: { id } };
  }, coupons);

  r.put('/api/admin/coupons/:id', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    if (!get('SELECT id FROM coupons WHERE id = ?', id)) fail(404, 'کد تخفیف پیدا نشد.');
    const data = couponPrepare(parse(body, couponSchema));
    if (get('SELECT id FROM coupons WHERE code = ? AND id != ?', data.code, id)) fail(422, 'این کد قبلاً ثبت شده است.', { code: 'این کد قبلاً ثبت شده است.' });
    const { sql, values } = updateSql('coupons', data);
    run(sql, ...values, id);
    audit(user, 'update', 'coupon', id, data.code);
    return { item: { id } };
  }, coupons);

  r.delete('/api/admin/coupons/:id', ({ params, user }) => {
    const id = Number(params.id) || 0;
    const row = get('SELECT code FROM coupons WHERE id = ?', id);
    if (!row) fail(404, 'کد تخفیف پیدا نشد.');
    run('DELETE FROM coupons WHERE id = ?', id);
    audit(user, 'delete', 'coupon', id, row.code);
    return { ok: true };
  }, coupons);

  /* ---------- مدیریت نظرها ---------- */
  const reviews = { perm: 'reviews.moderate' };

  r.get('/api/admin/reviews', ({ query }) => {
    const pg = paging(query, 15);
    const status = ['pending', 'approved', 'rejected'].includes(query.status) ? query.status : null;
    const where = status ? 'WHERE r.status = ?' : '';
    const params = status ? [status] : [];
    const total = get(`SELECT COUNT(*) AS n FROM reviews r ${where}`, ...params).n;
    const rows = all(
      `SELECT r.id, r.rating, r.body, r.status, r.created_at, p.id AS product_id, p.title AS product_title, u.name AS author
       FROM reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id
       ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      ...params, pg.limit, pg.offset,
    );
    return { items: rows, ...pageMeta(total, pg) };
  }, reviews);

  r.put('/api/admin/reviews/:id', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    if (!get('SELECT id FROM reviews WHERE id = ?', id)) fail(404, 'نظر پیدا نشد.');
    const data = parse(body, { status: { type: 'enum', values: ['approved', 'rejected', 'pending'], required: true, label: 'وضعیت' } });
    run('UPDATE reviews SET status = ? WHERE id = ?', data.status, id);
    audit(user, data.status, 'review', id);
    return { ok: true };
  }, reviews);

  r.delete('/api/admin/reviews/:id', ({ params, user }) => {
    const id = Number(params.id) || 0;
    if (!run('DELETE FROM reviews WHERE id = ?', id).changes) fail(404, 'نظر پیدا نشد.');
    audit(user, 'delete', 'review', id);
    return { ok: true };
  }, reviews);

  /* ---------- بارگذاری تصویر ---------- */
  r.post('/api/admin/upload', async ({ req, user }) => {
    const ext = EXT[(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!ext) fail(415, 'فقط تصویرهای PNG، JPG، WEBP و GIF پذیرفته می‌شوند.');
    const buf = await readBody(req, 3 * 1024 * 1024);
    if (!MAGIC[ext](buf)) fail(422, 'فایل ارسال‌شده یک تصویر معتبر نیست.');
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    audit(user, 'upload', 'media', null, name);
    return { url: `/uploads/${name}` };
  }, { perm: ['products.manage', 'content.manage', 'media.upload'], raw: true });
}
