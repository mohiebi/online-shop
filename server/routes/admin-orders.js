/* مدیریت سفارش‌ها و فهرست مشتریان */
import { get, all, run, tx } from '../db.js';
import { ORDER_STATUSES, TRANSITIONS } from '../constants.js';
import { fail, parse, paging, pageMeta, nowIso, normFa, latinDigits } from '../util.js';
import {
  audit, orderOut, orderDetail, restoreStock,
} from '../shop.js';

export default function register(r) {
  const orders = { perm: 'orders.manage' };

  r.get('/api/admin/orders', ({ query }) => {
    const pg = paging(query, 15);
    const where = ['1 = 1'];
    const params = [];
    if (Object.hasOwn(ORDER_STATUSES, query.status)) { where.push('o.status = ?'); params.push(query.status); }
    const q = normFa(latinDigits(query.q)).replace(/[%_]/g, '');
    if (q) {
      where.push("(o.code LIKE ? OR o.phone LIKE ? OR replace(o.name, char(8204), ' ') LIKE ?)");
      params.push(`%${q.toUpperCase()}%`, `%${q}%`, `%${q}%`);
    }
    const total = get(`SELECT COUNT(*) AS n FROM orders o WHERE ${where.join(' AND ')}`, ...params).n;
    const rows = all(
      `SELECT o.*, (SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      ...params, pg.limit, pg.offset,
    );
    return { items: rows.map((o) => ({ ...orderOut(o), itemCount: o.item_count })), ...pageMeta(total, pg) };
  }, orders);

  r.get('/api/admin/orders/:id', ({ params }) => {
    const row = get('SELECT * FROM orders WHERE id = ?', Number(params.id) || 0);
    if (!row) fail(404, 'سفارش پیدا نشد.');
    const customer = row.user_id ? get('SELECT id, name, email, phone FROM users WHERE id = ?', row.user_id) ?? null : null;
    return { order: orderDetail(row), customer, allowedStatuses: TRANSITIONS[row.status].map((s) => ({ value: s, label: ORDER_STATUSES[s] })) };
  }, orders);

  r.post('/api/admin/orders/:id/status', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    const data = parse(body, {
      status: { type: 'enum', values: Object.keys(ORDER_STATUSES), required: true, label: 'وضعیت' },
      note: { type: 'string', max: 300, default: '', label: 'یادداشت' },
    });
    tx(() => {
      const row = get('SELECT * FROM orders WHERE id = ?', id);
      if (!row) fail(404, 'سفارش پیدا نشد.');
      if (!TRANSITIONS[row.status].includes(data.status)) {
        fail(409, `تغییر وضعیت از «${ORDER_STATUSES[row.status]}» به «${ORDER_STATUSES[data.status]}» مجاز نیست.`);
      }
      run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', data.status, nowIso(), id);
      run('INSERT INTO order_events (order_id, status, note, user_id) VALUES (?, ?, ?, ?)', id, data.status, data.note, user.id);
      if (data.status === 'cancelled') restoreStock(id);
      audit(user, 'status', 'order', id, `${row.code}: ${row.status} → ${data.status}`);
    });
    const row = get('SELECT * FROM orders WHERE id = ?', id);
    return { order: orderDetail(row), allowedStatuses: TRANSITIONS[row.status].map((s) => ({ value: s, label: ORDER_STATUSES[s] })) };
  }, orders);

  /* ---------- مشتریان (فقط‌خواندنی) ---------- */
  r.get('/api/admin/customers', ({ query }) => {
    const pg = paging(query, 15);
    const where = ["u.role = 'customer'"];
    const params = [];
    const q = normFa(query.q).replace(/[%_]/g, '');
    if (q) { where.push("(u.email LIKE ? OR replace(u.name, char(8204), ' ') LIKE ? OR u.phone LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${latinDigits(q)}%`); }
    const total = get(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, ...params).n;
    const items = all(
      `SELECT u.id, u.name, u.email, u.phone, u.active, u.created_at,
         (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS orders,
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = u.id AND status != 'cancelled') AS spent
       FROM users u WHERE ${where.join(' AND ')} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      ...params, pg.limit, pg.offset,
    ).map((c) => ({ ...c, active: !!c.active }));
    return { items, ...pageMeta(total, pg) };
  }, { perm: 'customers.view' });
}
