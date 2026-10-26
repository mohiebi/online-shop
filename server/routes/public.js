import { get, all, run } from '../db.js';
import { PALETTE, ORDER_STATUSES, ROLES } from '../constants.js';
import { fail, parse, paging, pageMeta, normFa } from '../util.js';
import { getSettings, PRODUCT_SELECT, productOut, priceCart } from '../shop.js';

const SORTS = {
  popular: 'reviews DESC, p.id DESC',
  newest: 'p.id DESC',
  cheap: 'p.price ASC, p.id DESC',
  expensive: 'p.price DESC, p.id DESC',
  discount: 'CASE WHEN p.old_price > p.price THEN (p.old_price - p.price) * 1.0 / p.old_price ELSE 0 END DESC, p.id DESC',
};

const contentOut = (c) => ({
  id: c.id, type: c.type, slug: c.slug, title: c.title, excerpt: c.excerpt, body: c.body,
  cover: c.cover, publishedAt: c.published_at, updatedAt: c.updated_at, author: c.author_name ?? null,
});

export default function register(r) {
  r.get('/api/meta', () => ({
    palette: PALETTE,
    orderStatuses: ORDER_STATUSES,
    roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])),
  }));

  r.get('/api/settings/public', () => ({
    settings: getSettings(),
    pages: all("SELECT slug, title FROM contents WHERE type = 'page' AND status = 'published' AND show_in_menu = 1 ORDER BY id"),
  }));

  r.get('/api/categories', () => ({
    items: all(
      `SELECT c.id, c.title, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.published = 1) AS count
       FROM categories c ORDER BY c.sort_order, c.id`,
    ),
  }));

  r.get('/api/products', ({ query }) => {
    const pg = paging(query, 12);
    const where = ['p.published = 1'];
    const params = [];
    if (query.category) { where.push('p.category_id = ?'); params.push(Number(query.category) || 0); }
    if (query.featured === '1') where.push('p.featured = 1');
    const q = normFa(query.q).replace(/[%_]/g, '');
    if (q) {
      where.push("replace(replace(replace(p.title || ' ' || p.description, char(8204), ' '), 'ي', 'ی'), 'ك', 'ک') LIKE ?");
      params.push(`%${q}%`);
    }
    const order = SORTS[query.sort] ?? SORTS.popular;
    const total = get(`SELECT COUNT(*) AS n FROM products p WHERE ${where.join(' AND ')}`, ...params).n;
    const rows = all(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, pg.limit, pg.offset);
    return { items: rows.map(productOut), ...pageMeta(total, pg) };
  });

  r.get('/api/products/:id', ({ params }) => {
    const row = get(`${PRODUCT_SELECT} WHERE p.id = ? AND p.published = 1`, Number(params.id) || 0);
    if (!row) fail(404, 'این محصول پیدا نشد.');
    const related = all(
      `${PRODUCT_SELECT} WHERE p.published = 1 AND p.category_id = ? AND p.id != ? ORDER BY reviews DESC, p.id DESC LIMIT 4`,
      row.category_id, row.id,
    );
    return { product: productOut(row), related: related.map(productOut) };
  });

  r.get('/api/products/:id/reviews', ({ params, user }) => {
    const id = Number(params.id) || 0;
    const items = all(
      `SELECT r.id, r.rating, r.body, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? AND r.status = 'approved' ORDER BY r.id DESC LIMIT 50`,
      id,
    ).map((x) => ({ id: x.id, rating: x.rating, body: x.body, createdAt: x.created_at, author: x.name }));
    let mine = null;
    let canReview = false;
    if (user) {
      mine = get('SELECT rating, body, status FROM reviews WHERE product_id = ? AND user_id = ?', id, user.id) ?? null;
      canReview = !mine && !!get(
        `SELECT 1 AS ok FROM orders o JOIN order_items i ON i.order_id = o.id
         WHERE o.user_id = ? AND o.status = 'delivered' AND i.product_id = ? LIMIT 1`,
        user.id, id,
      );
    }
    return { items, mine, canReview };
  });

  r.post('/api/products/:id/reviews', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    if (!get('SELECT id FROM products WHERE id = ? AND published = 1', id)) fail(404, 'این محصول پیدا نشد.');
    const bought = get(
      `SELECT 1 AS ok FROM orders o JOIN order_items i ON i.order_id = o.id
       WHERE o.user_id = ? AND o.status = 'delivered' AND i.product_id = ? LIMIT 1`,
      user.id, id,
    );
    if (!bought) fail(403, 'فقط خریدارانِ این کالا (پس از تحویل سفارش) می‌توانند نظر ثبت کنند.');
    if (get('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', id, user.id)) fail(409, 'شما قبلاً برای این کالا نظر ثبت کرده‌اید.');
    const data = parse(body, {
      rating: { type: 'int', required: true, min: 1, max: 5, label: 'امتیاز' },
      body: { type: 'string', required: true, min: 3, max: 1000, label: 'متن نظر' },
    });
    run('INSERT INTO reviews (product_id, user_id, rating, body) VALUES (?, ?, ?, ?)', id, user.id, data.rating, data.body);
    return { ok: true, message: 'نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود.' };
  }, { auth: true });

  r.get('/api/content', ({ query }) => {
    const type = query.type === 'page' ? 'page' : 'post';
    const pg = paging(query, 9);
    const total = get("SELECT COUNT(*) AS n FROM contents WHERE type = ? AND status = 'published'", type).n;
    const rows = all(
      `SELECT c.*, u.name AS author_name FROM contents c LEFT JOIN users u ON u.id = c.author_id
       WHERE c.type = ? AND c.status = 'published' ORDER BY c.published_at DESC, c.id DESC LIMIT ? OFFSET ?`,
      type, pg.limit, pg.offset,
    );
    return { items: rows.map((c) => ({ ...contentOut(c), body: undefined })), ...pageMeta(total, pg) };
  });

  r.get('/api/content/:type/:slug', ({ params }) => {
    if (!['page', 'post'].includes(params.type)) fail(404, 'صفحه پیدا نشد.');
    const row = get(
      `SELECT c.*, u.name AS author_name FROM contents c LEFT JOIN users u ON u.id = c.author_id
       WHERE c.type = ? AND c.slug = ? AND c.status = 'published'`,
      params.type, params.slug,
    );
    if (!row) fail(404, 'این صفحه پیدا نشد.');
    return { content: contentOut(row) };
  });

  /* قیمت‌گذاری سبد توسط سرور؛ کلاینت فقط شناسه و تعداد می‌فرستد */
  r.post('/api/cart/quote', ({ body }) => {
    const items = Array.isArray(body?.items) ? body.items : [];
    const priced = priceCart(items, { coupon: body?.coupon, shipping: body?.shipping });
    return priced;
  });
}
