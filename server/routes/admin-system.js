/* داشبورد نقش‌محور، مدیریت کاربران و گزارش فعالیت */
import { get, all, run, tx } from '../db.js';
import { ROLE_KEYS, ROLES } from '../constants.js';
import { fail, parse, paging, pageMeta, normFa, latinDigits } from '../util.js';
import { hashPassword, destroyUserSessions, can } from '../auth.js';
import { audit, orderOut } from '../shop.js';

const dayKey = (d) => d.toISOString().slice(0, 10);

function salesBlock() {
  const today = dayKey(new Date());
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86400_000)));
  const perDay = new Map(all(
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n, SUM(total) AS s FROM orders
     WHERE status != 'cancelled' AND created_at >= ? GROUP BY d`,
    `${days[0]}T00:00:00Z`,
  ).map((x) => [x.d, x]));
  return {
    ordersToday: get('SELECT COUNT(*) AS n FROM orders WHERE substr(created_at, 1, 10) = ?', today).n,
    revenue30: get("SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE status != 'cancelled' AND created_at >= ?", since30).s,
    statusCounts: Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').map((x) => [x.status, x.n])),
    revenueByDay: days.map((d) => ({ date: d, orders: perDay.get(d)?.n ?? 0, revenue: perDay.get(d)?.s ?? 0 })),
    lowStock: all('SELECT id, title, stock, emoji FROM products WHERE published = 1 AND stock <= 5 ORDER BY stock, id LIMIT 6'),
    recentOrders: all('SELECT * FROM orders ORDER BY id DESC LIMIT 6').map(orderOut),
  };
}

function contentBlock() {
  const counts = { page: { published: 0, draft: 0 }, post: { published: 0, draft: 0 } };
  for (const x of all('SELECT type, status, COUNT(*) AS n FROM contents GROUP BY type, status')) counts[x.type][x.status] = x.n;
  return {
    counts,
    pendingReviews: get("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").n,
    recentContent: all('SELECT id, type, title, status, updated_at FROM contents ORDER BY updated_at DESC, id DESC LIMIT 6'),
  };
}

function adminBlock() {
  return {
    usersByRole: Object.fromEntries(ROLE_KEYS.map((k) => [k, 0]).concat(all('SELECT role, COUNT(*) AS n FROM users GROUP BY role').map((x) => [x.role, x.n]))),
    products: get('SELECT COUNT(*) AS n FROM products').n,
    orders: get('SELECT COUNT(*) AS n FROM orders').n,
    recentActivity: all(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.name AS by_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 8`,
    ),
  };
}

const userOut = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, roleLabel: ROLES[u.role]?.label ?? u.role,
  active: !!u.active, createdAt: u.created_at, lastLoginAt: u.last_login_at,
});

const passwordRule = { type: 'string', required: true, raw: true, min: 8, max: 128, label: 'گذرواژه' };
const passwordStrong = (pw) => /[A-Za-z؀-ۿ]/.test(pw) && /\d|[۰-۹]/.test(pw);

const activeAdmins = () => get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n;

export default function register(r) {
  r.get('/api/admin/dashboard', ({ user }) => {
    const out = {};
    if (can(user, 'dashboard.sales')) out.sales = salesBlock();
    if (can(user, 'dashboard.content')) out.content = contentBlock();
    if (can(user, 'dashboard.admin')) out.admin = adminBlock();
    return out;
  }, { perm: ['dashboard.sales', 'dashboard.content', 'dashboard.admin'] });

  r.get('/api/admin/audit', ({ query }) => {
    const pg = paging(query, 20);
    const total = get('SELECT COUNT(*) AS n FROM audit_log').n;
    const items = all(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.name AS by_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      pg.limit, pg.offset,
    );
    return { items, ...pageMeta(total, pg) };
  }, { perm: 'audit.view' });

  /* ---------- کاربران و نقش‌ها (فقط مدیرکل) ---------- */
  const users = { perm: 'users.manage' };

  r.get('/api/admin/users', ({ query }) => {
    const pg = paging(query, 15);
    const where = ['1 = 1'];
    const params = [];
    if (ROLE_KEYS.includes(query.role)) { where.push('role = ?'); params.push(query.role); }
    const q = normFa(query.q).replace(/[%_]/g, '');
    if (q) { where.push("(email LIKE ? OR replace(name, char(8204), ' ') LIKE ? OR phone LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${latinDigits(q)}%`); }
    const total = get(`SELECT COUNT(*) AS n FROM users WHERE ${where.join(' AND ')}`, ...params).n;
    const items = all(`SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, pg.limit, pg.offset);
    return { items: items.map(userOut), ...pageMeta(total, pg) };
  }, users);

  r.get('/api/admin/users/:id', ({ params }) => {
    const row = get('SELECT * FROM users WHERE id = ?', Number(params.id) || 0);
    if (!row) fail(404, 'کاربر پیدا نشد.');
    return { item: userOut(row) };
  }, users);

  r.post('/api/admin/users', async ({ body, user }) => {
    const data = parse(body, {
      name: { type: 'string', required: true, min: 3, max: 80, label: 'نام' },
      email: { type: 'email', required: true, label: 'ایمیل' },
      phone: { type: 'phone', default: null, label: 'موبایل' },
      role: { type: 'enum', values: ROLE_KEYS, required: true, label: 'نقش' },
      password: passwordRule,
    });
    if (!passwordStrong(data.password)) fail(422, 'گذرواژه باید ترکیبی از حروف و عدد باشد.', { password: 'گذرواژه باید ترکیبی از حروف و عدد باشد.' });
    if (get('SELECT id FROM users WHERE email = ?', data.email)) fail(422, 'این ایمیل قبلاً ثبت شده است.', { email: 'این ایمیل قبلاً ثبت شده است.' });
    const { id } = run(
      'INSERT INTO users (email, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      data.email, data.name, data.phone, await hashPassword(data.password), data.role,
    );
    audit(user, 'create', 'user', id, `${data.email} (${data.role})`);
    return { item: { id } };
  }, users);

  r.put('/api/admin/users/:id', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    const target = get('SELECT * FROM users WHERE id = ?', id);
    if (!target) fail(404, 'کاربر پیدا نشد.');
    const data = parse(body, {
      name: { type: 'string', required: true, min: 3, max: 80, label: 'نام' },
      phone: { type: 'phone', default: null, label: 'موبایل' },
      role: { type: 'enum', values: ROLE_KEYS, required: true, label: 'نقش' },
      active: { type: 'bool', default: true },
    });
    if (id === user.id && (data.role !== target.role || !data.active)) {
      fail(409, 'نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید.');
    }
    tx(() => {
      run('UPDATE users SET name = ?, phone = ?, role = ?, active = ? WHERE id = ?', data.name, data.phone, data.role, data.active, id);
      if (target.role === 'admin' && target.active && activeAdmins() < 1) fail(409, 'حداقل یک مدیرکل فعال باید وجود داشته باشد.');
    });
    if (data.role !== target.role || !data.active) destroyUserSessions(id); // دسترسی‌های قبلی بلافاصله باطل می‌شود
    audit(user, 'update', 'user', id, `${target.email}: ${target.role} → ${data.role}${data.active ? '' : ' (غیرفعال)'}`);
    return { item: userOut(get('SELECT * FROM users WHERE id = ?', id)) };
  }, users);

  r.post('/api/admin/users/:id/password', async ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    const target = get('SELECT email FROM users WHERE id = ?', id);
    if (!target) fail(404, 'کاربر پیدا نشد.');
    const data = parse(body, { password: passwordRule });
    if (!passwordStrong(data.password)) fail(422, 'گذرواژه باید ترکیبی از حروف و عدد باشد.', { password: 'گذرواژه باید ترکیبی از حروف و عدد باشد.' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(data.password), id);
    destroyUserSessions(id);
    audit(user, 'password', 'user', id, target.email);
    return { ok: true };
  }, users);
}
