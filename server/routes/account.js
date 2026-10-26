/* همه‌ی مسیرهای «پنل کاربری» و ثبت سفارش؛ فقط برای کاربر واردشده و فقط روی داده‌های خودش */
import { get, all, run, tx, dyn } from '../db.js';
import { PALETTE } from '../constants.js';
import { fail, parse, paging, pageMeta, randomCode, normFa } from '../util.js';
import {
  hashPassword, verifyPassword, destroyUserSessions, publicUser,
} from '../auth.js';
import { priceCart, orderOut, orderDetail, restoreStock } from '../shop.js';

const addressSchema = {
  title: { type: 'string', required: true, max: 40, label: 'عنوان نشانی' },
  name: { type: 'string', required: true, min: 3, max: 80, label: 'نام تحویل‌گیرنده' },
  phone: { type: 'phone', required: true, label: 'شماره موبایل' },
  city: { type: 'string', required: true, min: 2, max: 60, label: 'شهر' },
  postal: { type: 'string', required: true, digits: true, pattern: /^\d{10}$/, msg: 'کد پستی باید ۱۰ رقم باشد.', label: 'کد پستی' },
  address: { type: 'string', required: true, min: 10, max: 400, label: 'نشانی' },
  is_default: { type: 'bool', default: false },
};

const addressOut = (a) => ({
  id: a.id, title: a.title, name: a.name, phone: a.phone, city: a.city, postal: a.postal, address: a.address, isDefault: !!a.is_default,
});

/* پیش‌نمایش اقلام برای فهرست سفارش‌ها */
function withPreview(orders) {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const items = dyn(
    `SELECT order_id, title, emoji, tint, image, qty FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
    ...ids,
  );
  return orders.map((o) => {
    const mine = items.filter((i) => i.order_id === o.id);
    return {
      ...orderOut(o),
      itemCount: mine.reduce((s, i) => s + i.qty, 0),
      preview: mine.slice(0, 3).map((i) => ({ title: i.title, emoji: i.emoji, image: i.image, tint: PALETTE[i.tint] ?? PALETTE[0] })),
    };
  });
}

export default function register(r) {
  const guard = { auth: true };

  r.get('/api/account/summary', ({ user }) => {
    const stats = get(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total END), 0) AS spent,
              COALESCE(SUM(CASE WHEN status IN ('pending','processing','shipped') THEN 1 ELSE 0 END), 0) AS active
       FROM orders WHERE user_id = ?`,
      user.id,
    );
    const recent = all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 5', user.id);
    return {
      orders: stats.orders,
      spent: stats.spent,
      activeOrders: stats.active,
      addresses: get('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', user.id).n,
      reviews: get('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?', user.id).n,
      recentOrders: withPreview(recent),
    };
  }, guard);

  /* ---------- پروفایل و گذرواژه ---------- */
  r.put('/api/account/profile', ({ user, body }) => {
    const data = parse(body, {
      name: { type: 'string', required: true, min: 3, max: 80, label: 'نام و نام خانوادگی' },
      phone: { type: 'phone', default: null, label: 'شماره موبایل' },
    });
    run('UPDATE users SET name = ?, phone = ? WHERE id = ?', data.name, data.phone, user.id);
    return { user: publicUser({ ...user, ...data }) };
  }, guard);

  r.post('/api/account/password', async ({ user, session, body }) => {
    const data = parse(body, {
      current: { type: 'string', required: true, raw: true, max: 128, label: 'گذرواژه فعلی' },
      password: { type: 'string', required: true, raw: true, min: 8, max: 128, label: 'گذرواژه جدید' },
    });
    const row = get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!(await verifyPassword(data.current, row.password_hash))) {
      fail(422, 'گذرواژه فعلی درست نیست.', { current: 'گذرواژه فعلی درست نیست.' });
    }
    if (!/[A-Za-z؀-ۿ]/.test(data.password) || !/\d|[۰-۹]/.test(data.password)) {
      fail(422, 'گذرواژه باید ترکیبی از حروف و عدد باشد.', { password: 'گذرواژه باید ترکیبی از حروف و عدد باشد.' });
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(data.password), user.id);
    destroyUserSessions(user.id, session.hash); // سایر دستگاه‌ها خارج می‌شوند
    return { ok: true };
  }, guard);

  /* ---------- نشانی‌ها ---------- */
  r.get('/api/account/addresses', ({ user }) => ({
    items: all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', user.id).map(addressOut),
  }), guard);

  const ownAddress = (user, id) => get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', Number(id) || 0, user.id) ?? fail(404, 'نشانی پیدا نشد.');

  r.post('/api/account/addresses', ({ user, body }) => {
    const data = parse(body, addressSchema);
    if (get('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', user.id).n >= 10) fail(422, 'حداکثر ۱۰ نشانی می‌توانید ذخیره کنید.');
    const first = get('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', user.id).n === 0;
    const makeDefault = data.is_default || first;
    const id = tx(() => {
      if (makeDefault) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', user.id);
      return run(
        'INSERT INTO addresses (user_id, title, name, phone, city, postal, address, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        user.id, data.title, data.name, data.phone, data.city, data.postal, data.address, makeDefault ? 1 : 0,
      ).id;
    });
    return { item: addressOut(get('SELECT * FROM addresses WHERE id = ?', id)) };
  }, guard);

  r.put('/api/account/addresses/:id', ({ user, params, body }) => {
    const current = ownAddress(user, params.id);
    const data = parse(body, addressSchema);
    tx(() => {
      if (data.is_default) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', user.id);
      run(
        'UPDATE addresses SET title = ?, name = ?, phone = ?, city = ?, postal = ?, address = ?, is_default = ? WHERE id = ?',
        data.title, data.name, data.phone, data.city, data.postal, data.address, data.is_default || current.is_default ? 1 : 0, current.id,
      );
    });
    return { item: addressOut(get('SELECT * FROM addresses WHERE id = ?', current.id)) };
  }, guard);

  r.delete('/api/account/addresses/:id', ({ user, params }) => {
    const current = ownAddress(user, params.id);
    run('DELETE FROM addresses WHERE id = ?', current.id);
    if (current.is_default) {
      const next = get('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1', user.id);
      if (next) run('UPDATE addresses SET is_default = 1 WHERE id = ?', next.id);
    }
    return { ok: true };
  }, guard);

  /* ---------- سفارش‌ها ---------- */
  r.get('/api/account/orders', ({ user, query }) => {
    const pg = paging(query, 10);
    const total = get('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', user.id).n;
    const rows = all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', user.id, pg.limit, pg.offset);
    return { items: withPreview(rows), ...pageMeta(total, pg) };
  }, guard);

  const ownOrder = (user, code) => get('SELECT * FROM orders WHERE code = ? AND user_id = ?', String(code), user.id) ?? fail(404, 'سفارش پیدا نشد.');

  r.get('/api/account/orders/:code', ({ user, params }) => ({ order: orderDetail(ownOrder(user, params.code)) }), guard);

  r.post('/api/account/orders/:code/cancel', ({ user, params }) => {
    const order = ownOrder(user, params.code);
    if (order.status !== 'pending') fail(409, 'فقط سفارش‌های «در انتظار تأیید» قابل لغو هستند.');
    tx(() => {
      run("UPDATE orders SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?", order.id);
      run("INSERT INTO order_events (order_id, status, note, user_id) VALUES (?, 'cancelled', 'لغو سفارش توسط مشتری', ?)", order.id, user.id);
      restoreStock(order.id);
    });
    return { order: orderDetail(get('SELECT * FROM orders WHERE id = ?', order.id)) };
  }, guard);

  r.get('/api/account/reviews', ({ user }) => ({
    items: all(
      `SELECT r.id, r.rating, r.body, r.status, r.created_at, p.id AS product_id, p.title, p.emoji
       FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.user_id = ? ORDER BY r.id DESC`,
      user.id,
    ).map((x) => ({ id: x.id, rating: x.rating, body: x.body, status: x.status, createdAt: x.created_at, productId: x.product_id, productTitle: x.title, emoji: x.emoji })),
  }), guard);

  /* ---------- ثبت سفارش ---------- */
  r.post('/api/orders', ({ user, body }) => {
    const data = parse(body, {
      name: { type: 'string', required: true, min: 3, max: 80, label: 'نام و نام خانوادگی' },
      phone: { type: 'phone', required: true, label: 'شماره موبایل' },
      city: { type: 'string', required: true, min: 2, max: 60, label: 'شهر' },
      postal: { type: 'string', required: true, digits: true, pattern: /^\d{10}$/, msg: 'کد پستی باید ۱۰ رقم باشد.', label: 'کد پستی' },
      address: { type: 'string', required: true, min: 10, max: 400, label: 'نشانی' },
      note: { type: 'string', max: 300, default: '' },
      shipping: { type: 'enum', values: ['post', 'express'], required: true, label: 'روش ارسال' },
      coupon: { type: 'string', max: 40, default: null },
    });
    if (data.shipping === 'express' && !normFa(data.city).includes('تهران')) {
      fail(422, 'ارسال با پیک فقط برای تهران ممکن است.', { city: 'ارسال با پیک فقط برای تهران ممکن است؛ روش ارسال را تغییر دهید.' });
    }
    if (!Array.isArray(body.items) || !body.items.length) fail(422, 'سبد خرید شما خالی است.');

    const code = tx(() => {
      const priced = priceCart(body.items, { coupon: data.coupon, shipping: data.shipping });
      if (!priced.lines.length || priced.issues.length) {
        fail(409, 'موجودی بعضی کالاها تغییر کرده است. سبد خرید را بررسی کنید.', { issues: priced.issues });
      }
      if (priced.couponError) fail(422, priced.couponError, { coupon: priced.couponError });

      let orderCode;
      do { orderCode = `AL-${randomCode(7)}`; } while (get('SELECT id FROM orders WHERE code = ?', orderCode));
      const { id } = run(
        `INSERT INTO orders (code, user_id, subtotal, discount, shipping_cost, total, coupon_code, shipping_method, name, phone, city, postal, address, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderCode, user.id, priced.subtotal, priced.discount, priced.shipping, priced.total, priced.coupon?.code ?? null,
        priced.shippingMethod, data.name, data.phone, data.city, data.postal, data.address, data.note,
      );
      for (const { product, qty } of priced.lines) {
        const row = get('SELECT tint FROM products WHERE id = ?', product.id);
        run(
          'INSERT INTO order_items (order_id, product_id, title, price, qty, emoji, tint, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          id, product.id, product.title, product.price, qty, product.emoji, row.tint, product.image,
        );
        const upd = run('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', qty, product.id, qty);
        if (!upd.changes) fail(409, `موجودی «${product.title}» کافی نیست.`);
      }
      if (priced.coupon) run('UPDATE coupons SET used = used + 1 WHERE code = ?', priced.coupon.code);
      run("INSERT INTO order_events (order_id, status, note, user_id) VALUES (?, 'pending', 'سفارش ثبت شد', ?)", id, user.id);
      return orderCode;
    });
    return { order: orderDetail(get('SELECT * FROM orders WHERE code = ?', code)) };
  }, guard);
}
