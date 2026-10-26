import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

/* دیتابیس درون‌حافظه و پوشه‌ی موقت برای آپلودها؛ قبل از import کردن سرور */
process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'albaloo-test-'));
delete process.env.NODE_ENV;

const { createApp } = await import('../server/app.js');
const { seedIfEmpty, DEMO_ACCOUNTS } = await import('../server/seed.js');

let server;
let base;

class Client {
  constructor() { this.cookie = ''; this.csrf = null; }

  async req(method, url, body, extra = {}) {
    const headers = { ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && !('x-csrf-token' in headers)) headers['x-csrf-token'] = this.csrf;
    let payload;
    if (body !== undefined && !(body instanceof Uint8Array)) {
      headers['content-type'] ??= 'application/json';
      payload = JSON.stringify(body);
    } else payload = body;
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* غیر JSON */ }
    if (data?.csrf) this.csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }

  get(url) { return this.req('GET', url); }
  post(url, body = {}) { return this.req('POST', url, body); }
  put(url, body = {}) { return this.req('PUT', url, body); }
  del(url) { return this.req('DELETE', url); }

  async login(email, password) {
    const r = await this.post('/api/auth/login', { email, password });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
    return r;
  }
}

const account = (role) => DEMO_ACCOUNTS.find((a) => a.role === role);
async function loginAs(role) {
  const c = new Client();
  await c.login(account(role).email, account(role).password);
  return c;
}

before(async () => {
  await seedIfEmpty();
  server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

/* ---------- احراز هویت ---------- */
test('ثبت‌نام مشتری، ورود، خروج و تکراری نبودن ایمیل', async () => {
  const c = new Client();
  const bad = await c.post('/api/auth/register', { name: 'ع', email: 'x', password: '123' });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.fields.email && bad.data.fields.password && bad.data.fields.name);

  const weak = await c.post('/api/auth/register', { name: 'علی رضایی', email: 'ali@example.com', password: 'abcdefgh' });
  assert.equal(weak.status, 422);
  assert.ok(weak.data.fields.password);

  const ok = await c.post('/api/auth/register', { name: 'علی رضایی', email: 'ali@example.com', password: 'Passw0rd!x', phone: '۰۹۱۲۳۴۵۶۷۸۹' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'customer');
  assert.deepEqual(ok.data.user.permissions, []);

  const me = await c.get('/api/auth/me');
  assert.equal(me.data.user.email, 'ali@example.com');
  assert.equal(me.data.user.phone, '09123456789');

  const dup = await new Client().post('/api/auth/register', { name: 'علی دوم', email: 'ALI@example.com', password: 'Passw0rd!x' });
  assert.equal(dup.status, 422);
  assert.ok(dup.data.fields.email);

  const out = await c.post('/api/auth/logout');
  assert.equal(out.status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('ورود با گذرواژه غلط رد می‌شود و پیام کلی می‌دهد', async () => {
  const c = new Client();
  const r1 = await c.post('/api/auth/login', { email: 'customer@albaloo.test', password: 'wrong-pass-1' });
  const r2 = await c.post('/api/auth/login', { email: 'nobody@albaloo.test', password: 'wrong-pass-1' });
  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.equal(r1.data.error, r2.data.error);
});

test('محدودیت تعداد تلاش ورود', async () => {
  const c = new Client();
  let last;
  for (let i = 0; i < 10; i++) last = await c.post('/api/auth/login', { email: 'ratelimit@albaloo.test', password: 'wrong-pass-1' });
  assert.equal(last.status, 429);
});

test('درخواست تغییردهنده بدون توکن CSRF رد می‌شود', async () => {
  const c = await loginAs('customer');
  const r = await c.req('POST', '/api/account/addresses', {}, { 'x-csrf-token': 'bad' });
  assert.equal(r.status, 403);
  const form = await c.req('POST', '/api/account/password', 'a=b', { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
});

test('بدون ورود، مسیرهای محافظت‌شده ۴۰۱ می‌دهند', async () => {
  const c = new Client();
  for (const url of ['/api/account/summary', '/api/admin/dashboard', '/api/admin/products', '/api/admin/users']) {
    assert.equal((await c.get(url)).status, 401, url);
  }
});

/* ---------- نقش‌ها و دسترسی ---------- */
test('ماتریس دسترسی نقش‌ها به بخش‌های مدیریت', async () => {
  const matrix = {
    '/api/admin/products': { customer: 403, editor: 403, manager: 200, admin: 200 },
    '/api/admin/orders': { customer: 403, editor: 403, manager: 200, admin: 200 },
    '/api/admin/coupons': { customer: 403, editor: 403, manager: 200, admin: 200 },
    '/api/admin/customers': { customer: 403, editor: 403, manager: 200, admin: 200 },
    '/api/admin/content': { customer: 403, editor: 200, manager: 403, admin: 200 },
    '/api/admin/reviews': { customer: 403, editor: 200, manager: 200, admin: 200 },
    '/api/admin/users': { customer: 403, editor: 403, manager: 403, admin: 200 },
    '/api/admin/audit': { customer: 403, editor: 403, manager: 403, admin: 200 },
    '/api/admin/settings': { customer: 403, editor: 200, manager: 403, admin: 200 },
    '/api/admin/dashboard': { customer: 403, editor: 200, manager: 200, admin: 200 },
    '/api/account/summary': { customer: 200, editor: 200, manager: 200, admin: 200 },
  };
  for (const role of ['customer', 'editor', 'manager', 'admin']) {
    const c = await loginAs(role);
    for (const [url, expected] of Object.entries(matrix)) {
      assert.equal((await c.get(url)).status, expected[role], `${role} → ${url}`);
    }
  }
});

test('داشبورد هر نقش فقط بخش‌های مخصوص خودش را برمی‌گرداند', async () => {
  const keys = async (role) => Object.keys((await (await loginAs(role)).get('/api/admin/dashboard')).data).sort();
  assert.deepEqual(await keys('manager'), ['sales']);
  assert.deepEqual(await keys('editor'), ['content']);
  assert.deepEqual(await keys('admin'), ['admin', 'content', 'sales']);
});

test('تنظیمات: هر نقش فقط گروه مجاز خودش را ویرایش می‌کند', async () => {
  const editor = await loginAs('editor');
  const manager = await loginAs('manager');
  const admin = await loginAs('admin');

  assert.equal((await editor.put('/api/admin/settings', { announcement: 'تخفیف ویژه آخر هفته' })).status, 200);
  assert.equal((await editor.put('/api/admin/settings', { post_price: 1 })).status, 403);
  assert.equal((await manager.put('/api/admin/settings', { announcement: 'x' })).status, 403);
  assert.equal((await manager.put('/api/admin/settings', { post_price: 1 })).status, 403);

  assert.equal((await admin.put('/api/admin/settings', { post_price: 70000, announcement: '' })).status, 200);
  const pub = await new Client().get('/api/settings/public');
  assert.equal(pub.data.settings.post_price, 70000);
  assert.equal((await admin.put('/api/admin/settings', { post_price: 60000 })).status, 200);
});

test('مدیر فروش نمی‌تواند نقش کسی را تغییر دهد؛ مدیرکل می‌تواند و نشست آن کاربر باطل می‌شود', async () => {
  const manager = await loginAs('manager');
  const admin = await loginAs('admin');
  const target = (await admin.get('/api/admin/users?q=editor@')).data.items[0];

  assert.equal((await manager.put(`/api/admin/users/${target.id}`, { name: target.name, role: 'admin', active: true })).status, 403);

  const editor = await loginAs('editor');
  assert.equal((await editor.get('/api/admin/content')).status, 200);
  const changed = await admin.put(`/api/admin/users/${target.id}`, { name: target.name, role: 'customer', active: true });
  assert.equal(changed.status, 200);
  assert.equal((await editor.get('/api/admin/content')).status, 401); // نشست قبلی باطل شده

  await admin.put(`/api/admin/users/${target.id}`, { name: target.name, role: 'editor', active: true });
});

test('مدیرکل نمی‌تواند نقش یا وضعیت خودش را عوض کند', async () => {
  const admin = await loginAs('admin');
  const me = (await admin.get('/api/auth/me')).data.user;
  const r = await admin.put(`/api/admin/users/${me.id}`, { name: me.name, role: 'customer', active: true });
  assert.equal(r.status, 409);
  const r2 = await admin.put(`/api/admin/users/${me.id}`, { name: me.name, role: 'admin', active: false });
  assert.equal(r2.status, 409);
});

test('کاربر غیرفعال نمی‌تواند وارد شود', async () => {
  const admin = await loginAs('admin');
  const created = await admin.post('/api/admin/users', { name: 'کاربر موقت', email: 'temp@albaloo.test', role: 'customer', password: 'Temp12345' });
  assert.equal(created.status, 200);
  const id = created.data.item.id;
  assert.equal((await new Client().post('/api/auth/login', { email: 'temp@albaloo.test', password: 'Temp12345' })).status, 200);
  await admin.put(`/api/admin/users/${id}`, { name: 'کاربر موقت', role: 'customer', active: false });
  assert.equal((await new Client().post('/api/auth/login', { email: 'temp@albaloo.test', password: 'Temp12345' })).status, 403);
});

/* ---------- کاتالوگ و CMS ---------- */
test('فهرست عمومی محصولات: جستجوی فارسی با نیم‌فاصله، مرتب‌سازی و صفحه‌بندی', async () => {
  const c = new Client();
  const hit = await c.get(`/api/products?q=${encodeURIComponent('کوله پشتی')}`);
  assert.equal(hit.data.total, 1);
  const cheap = await c.get('/api/products?sort=cheap&limit=3');
  assert.equal(cheap.data.items.length, 3);
  assert.ok(cheap.data.items[0].price <= cheap.data.items[1].price);
  assert.equal(cheap.data.pages, Math.ceil(cheap.data.total / 3));
});

test('مدیر فروش محصول می‌سازد؛ محصول پیش‌نویس در فروشگاه دیده نمی‌شود', async () => {
  const m = await loginAs('manager');
  const cats = (await m.get('/api/admin/categories')).data.items;
  const invalid = await m.post('/api/admin/products', { title: 'x', category_id: cats[0].id, price: 100, stock: 1 });
  assert.equal(invalid.status, 422);
  assert.ok(invalid.data.fields.title);
  const badOld = await m.post('/api/admin/products', { title: 'محصول قیمت‌دار', category_id: cats[0].id, price: 100, old_price: 50, stock: 1 });
  assert.equal(badOld.status, 422);
  assert.ok(badOld.data.fields.old_price);

  const created = await m.post('/api/admin/products', {
    title: 'محصول آزمایشی', category_id: cats[0].id, price: 100000, stock: 3, published: false, specs: 'رنگ: قرمز\nوزن: ۱ کیلو',
  });
  assert.equal(created.status, 200);
  const id = created.data.item.id;
  assert.equal((await new Client().get(`/api/products/${id}`)).status, 404);

  const detail = await m.get(`/api/admin/products/${id}`);
  assert.equal(detail.data.item.specs, 'رنگ: قرمز\nوزن: ۱ کیلو');

  await m.put(`/api/admin/products/${id}`, { ...detail.data.item, published: true });
  const pub = await new Client().get(`/api/products/${id}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.data.product.specs, [['رنگ', 'قرمز'], ['وزن', '۱ کیلو']]);
  assert.equal((await m.del(`/api/admin/products/${id}`)).status, 200);
});

test('ویرایشگر محتوا: ساخت صفحه، نامک یکتا، انتشار و نمایش عمومی', async () => {
  const e = await loginAs('editor');
  const draft = await e.post('/api/admin/content', { type: 'post', title: 'مقاله آزمایشی', slug: 'test-post', body: '## سلام', status: 'draft' });
  assert.equal(draft.status, 200);
  assert.equal((await new Client().get('/api/content/post/test-post')).status, 404);

  const clash = await e.post('/api/admin/content', { type: 'post', title: 'دیگری', slug: 'test-post' });
  assert.equal(clash.status, 422);
  assert.ok(clash.data.fields.slug);

  const id = draft.data.item.id;
  const item = (await e.get(`/api/admin/content/${id}`)).data.item;
  assert.equal((await e.put(`/api/admin/content/${id}`, { ...item, status: 'published' })).status, 200);
  const pub = await new Client().get('/api/content/post/test-post');
  assert.equal(pub.status, 200);
  assert.equal(pub.data.content.title, 'مقاله آزمایشی');
  assert.equal((await e.del(`/api/admin/content/${id}`)).status, 200);
});

test('بارگذاری تصویر: فقط تصویر واقعی، فقط کاربران مجاز', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001a5f645400000000049454e44ae426082', 'hex');
  const e = await loginAs('editor');
  const ok = await e.req('POST', '/api/admin/upload', new Uint8Array(png), { 'content-type': 'image/png' });
  assert.equal(ok.status, 200);
  assert.match(ok.data.url, /^\/uploads\/[a-f0-9]{24}\.png$/);
  const served = await fetch(base + ok.data.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');

  const fake = await e.req('POST', '/api/admin/upload', new Uint8Array(Buffer.from('<script>alert(1)</script>')), { 'content-type': 'image/png' });
  assert.equal(fake.status, 422);
  const svg = await e.req('POST', '/api/admin/upload', new Uint8Array(Buffer.from('<svg/>')), { 'content-type': 'image/svg+xml' });
  assert.equal(svg.status, 415);
  const cust = await loginAs('customer');
  assert.equal((await cust.req('POST', '/api/admin/upload', new Uint8Array(png), { 'content-type': 'image/png' })).status, 403);
});

test('مسیر خارج از پوشه عمومی قابل دسترسی نیست', async () => {
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/.env', '/uploads/../../package.json']) {
    const res = await fetch(base + p);
    assert.ok([400, 403, 404].includes(res.status), `${p} → ${res.status}`);
  }
});

/* ---------- خرید ---------- */
const orderBody = (items, extra = {}) => ({
  items, name: 'سارا محمدی', phone: '۰۹۱۲۳۴۵۶۷۸۹', city: 'تهران', postal: '۱۲۳۴۵۶۷۸۹۰',
  address: 'خیابان ولیعصر، پلاک ۱۲', shipping: 'post', ...extra,
});

test('سبد خرید سمت سرور قیمت‌گذاری می‌شود و موجودی را محدود می‌کند', async () => {
  const c = new Client();
  const all = (await c.get('/api/products?limit=50')).data.items;
  const speaker = all.find((p) => p.title.includes('اسپیکر'));
  const mug = all.find((p) => p.title.includes('ماگ'));
  const q = (await c.post('/api/cart/quote', { items: [{ id: mug.id, qty: 2 }, { id: speaker.id, qty: 1 }, { id: 9999, qty: 1 }, { id: mug.id, qty: -5 }], coupon: 'albaloo10' })).data;
  assert.equal(q.lines.length, 1);
  assert.equal(q.subtotal, mug.price * 2);
  assert.equal(q.discount, Math.round(mug.price * 2 * 0.1));
  assert.equal(q.shipping, 60000);
  assert.equal(q.total, q.subtotal - q.discount + q.shipping);
  assert.deepEqual(q.issues.map((i) => i.type).sort(), ['out', 'unavailable']);
  const bad = (await c.post('/api/cart/quote', { items: [{ id: mug.id, qty: 1 }], coupon: 'NOPE' })).data;
  assert.ok(bad.couponError);
});

test('ثبت سفارش: ورود، اعتبارسنجی، کد تخفیف، موجودی، دسترسی مالک و لغو', async () => {
  assert.equal((await new Client().post('/api/orders', orderBody([{ id: 1, qty: 1 }]))).status, 401);
  const c = await loginAs('customer');
  const badForm = await c.post('/api/orders', orderBody([{ id: 8, qty: 1 }], { phone: '123', postal: '12' }));
  assert.equal(badForm.status, 422);
  assert.ok(badForm.data.fields.phone && badForm.data.fields.postal);
  const express = await c.post('/api/orders', orderBody([{ id: 8, qty: 1 }], { shipping: 'express', city: 'شیراز' }));
  assert.equal(express.status, 422);
  assert.ok(express.data.fields.city);

  const before = (await c.get('/api/products/8')).data.product.stock;

  const small = await c.post('/api/orders', orderBody([{ id: 8, qty: 1 }], { coupon: 'WELCOME' }));
  assert.equal(small.status, 422);
  assert.ok(small.data.fields.coupon);

  const res = await c.post('/api/orders', orderBody([{ id: 8, qty: 3 }], { coupon: 'WELCOME' }));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const order = res.data.order;
  assert.equal(order.status, 'pending');
  assert.equal(order.subtotal, 720000);
  assert.equal(order.discount, 100000);
  assert.equal(order.shippingCost, 60000);
  assert.equal(order.total, 680000);
  assert.equal((await c.get('/api/products/8')).data.product.stock, before - 3);

  // مشتری دیگر نباید سفارش را ببیند
  const other = new Client();
  await other.login('reza@albaloo.test', DEMO_ACCOUNTS[3].password);
  assert.equal((await other.get(`/api/account/orders/${order.code}`)).status, 404);
  assert.equal((await other.post(`/api/account/orders/${order.code}/cancel`)).status, 404);

  const cancel = await c.post(`/api/account/orders/${order.code}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.order.status, 'cancelled');
  assert.equal((await c.get('/api/products/8')).data.product.stock, before);
  assert.equal((await c.post(`/api/account/orders/${order.code}/cancel`)).status, 409);
});

test('مدیر فروش وضعیت سفارش را فقط در مسیر مجاز تغییر می‌دهد', async () => {
  const c = await loginAs('customer');
  const m = await loginAs('manager');
  const placed = (await c.post('/api/orders', orderBody([{ id: 12, qty: 1 }]))).data.order;

  assert.equal((await m.post(`/api/admin/orders/${placed.id}/status`, { status: 'delivered' })).status, 409);
  assert.equal((await m.post(`/api/admin/orders/${placed.id}/status`, { status: 'processing', note: 'در حال بسته‌بندی' })).status, 200);
  assert.equal((await c.post(`/api/account/orders/${placed.code}/cancel`)).status, 409); // دیگر در انتظار نیست
  assert.equal((await m.post(`/api/admin/orders/${placed.id}/status`, { status: 'shipped' })).status, 200);
  const done = await m.post(`/api/admin/orders/${placed.id}/status`, { status: 'delivered' });
  assert.equal(done.status, 200);
  assert.deepEqual(done.data.allowedStatuses, []);

  const detail = (await c.get(`/api/account/orders/${placed.code}`)).data.order;
  assert.deepEqual(detail.events.map((e) => e.status), ['pending', 'processing', 'shipped', 'delivered']);

  // مشتری فقط پس از تحویل می‌تواند نظر بدهد
  const rev = await c.post('/api/products/12/reviews', { rating: 5, body: 'عالی بود' });
  assert.equal(rev.status, 200);
  assert.equal((await c.post('/api/products/12/reviews', { rating: 4, body: 'دوباره' })).status, 409);
  const notBought = await c.post('/api/products/7/reviews', { rating: 5, body: 'نخریده‌ام' });
  assert.equal(notBought.status, 403);
});

test('همزمانی: دو سفارش همزمان بیش از موجودی نمی‌فروشند', async () => {
  const admin = await loginAs('admin');
  const cats = (await admin.get('/api/admin/categories')).data.items;
  const p = (await admin.post('/api/admin/products', { title: 'کالای کم‌موجودی', category_id: cats[0].id, price: 1000, stock: 1 })).data.item;
  const a = await loginAs('customer');
  const b = new Client();
  await b.login('reza@albaloo.test', DEMO_ACCOUNTS[3].password);
  const results = await Promise.all([a.post('/api/orders', orderBody([{ id: p.id, qty: 1 }])), b.post('/api/orders', orderBody([{ id: p.id, qty: 1 }]))]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await admin.get(`/api/admin/products/${p.id}`)).data.item.stock, 0);
});

test('پنل مشتری: نشانی‌ها، پروفایل و تغییر گذرواژه', async () => {
  const c = new Client();
  await c.post('/api/auth/register', { name: 'نیما صادقی', email: 'nima@example.com', password: 'Nima12345' });
  const addr = { title: 'محل کار', name: 'نیما صادقی', phone: '09121112222', city: 'اصفهان', postal: '8174567890', address: 'خیابان چهارباغ، پلاک ۲۰' };
  const a1 = await c.post('/api/account/addresses', addr);
  assert.equal(a1.status, 200);
  assert.equal(a1.data.item.isDefault, true); // اولین نشانی پیش‌فرض می‌شود
  const a2 = await c.post('/api/account/addresses', { ...addr, title: 'خانه', is_default: true });
  const list = (await c.get('/api/account/addresses')).data.items;
  assert.equal(list.find((x) => x.id === a2.data.item.id).isDefault, true);
  assert.equal(list.filter((x) => x.isDefault).length, 1);

  assert.equal((await c.put('/api/account/profile', { name: 'نیما صادقی‌زاده', phone: '09120000000' })).data.user.name, 'نیما صادقی‌زاده');

  const wrong = await c.post('/api/account/password', { current: 'bad-current', password: 'NewPass123' });
  assert.equal(wrong.status, 422);
  assert.equal((await c.post('/api/account/password', { current: 'Nima12345', password: 'NewPass123' })).status, 200);
  assert.equal((await new Client().post('/api/auth/login', { email: 'nima@example.com', password: 'Nima12345' })).status, 401);
  assert.equal((await new Client().post('/api/auth/login', { email: 'nima@example.com', password: 'NewPass123' })).status, 200);

  // کاربر دیگر به نشانی او دسترسی ندارد
  const other = await loginAs('customer');
  assert.equal((await other.del(`/api/account/addresses/${a1.data.item.id}`)).status, 404);
});
