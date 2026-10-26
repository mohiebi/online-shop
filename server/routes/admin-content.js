/* CMS: صفحه‌ها، مقاله‌های وبلاگ و تنظیمات محتوای سایت */
import { get, all, run } from '../db.js';
import { SETTING_GROUPS } from '../constants.js';
import {
  fail, parse, paging, pageMeta, insertSql, updateSql, nowIso, slugify, normFa,
} from '../util.js';
import { can } from '../auth.js';
import { audit, getSettings, saveSetting } from '../shop.js';

const contentSchema = {
  title: { type: 'string', required: true, min: 2, max: 150, label: 'عنوان' },
  slug: { type: 'string', max: 100, default: '', pattern: /^[\p{L}\p{N}-]+$/u, msg: 'نامک فقط شامل حرف، عدد و خط تیره باشد.', label: 'نامک' },
  excerpt: { type: 'string', max: 300, default: '', label: 'خلاصه' },
  body: { type: 'string', max: 60000, default: '', label: 'متن' },
  cover: { type: 'path', default: null, label: 'تصویر شاخص' },
  status: { type: 'enum', values: ['draft', 'published'], default: 'draft', label: 'وضعیت' },
  show_in_menu: { type: 'bool', default: false },
};

const SETTING_RULES = {
  store_name: { type: 'string', required: true, max: 40, label: 'نام فروشگاه' },
  hero_badge: { type: 'string', max: 120, default: '', label: 'برچسب بالای تیتر' },
  hero_title: { type: 'string', required: true, max: 120, label: 'تیتر صفحه اصلی' },
  hero_subtitle: { type: 'string', max: 300, default: '', label: 'توضیح زیر تیتر' },
  announcement: { type: 'string', max: 200, default: '', label: 'نوار اعلان' },
  footer_text: { type: 'string', max: 300, default: '', label: 'متن پایین صفحه' },
  contact_phone: { type: 'string', max: 40, default: '', label: 'تلفن' },
  contact_email: { type: 'string', max: 120, default: '', label: 'ایمیل تماس' },
  contact_address: { type: 'string', max: 300, default: '', label: 'نشانی' },
  free_shipping_from: { type: 'int', required: true, min: 0, max: 1_000_000_000, label: 'حداقل خرید برای ارسال رایگان' },
  post_price: { type: 'int', required: true, min: 0, max: 100_000_000, label: 'هزینه پست' },
  express_price: { type: 'int', required: true, min: 0, max: 100_000_000, label: 'هزینه پیک' },
};

const groupOf = (key) => Object.entries(SETTING_GROUPS).find(([, g]) => g.keys.includes(key))?.[1];

export default function register(r) {
  const guard = { perm: 'content.manage' };

  r.get('/api/admin/content', ({ query }) => {
    const pg = paging(query, 15);
    const where = ['1 = 1'];
    const params = [];
    if (['page', 'post'].includes(query.type)) { where.push('c.type = ?'); params.push(query.type); }
    if (['draft', 'published'].includes(query.status)) { where.push('c.status = ?'); params.push(query.status); }
    const q = normFa(query.q).replace(/[%_]/g, '');
    if (q) { where.push("replace(c.title, char(8204), ' ') LIKE ?"); params.push(`%${q}%`); }
    const total = get(`SELECT COUNT(*) AS n FROM contents c WHERE ${where.join(' AND ')}`, ...params).n;
    const items = all(
      `SELECT c.id, c.type, c.slug, c.title, c.status, c.show_in_menu, c.updated_at, c.published_at, u.name AS author
       FROM contents c LEFT JOIN users u ON u.id = c.author_id
       WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC, c.id DESC LIMIT ? OFFSET ?`,
      ...params, pg.limit, pg.offset,
    ).map((c) => ({ ...c, show_in_menu: !!c.show_in_menu }));
    return { items, ...pageMeta(total, pg) };
  }, guard);

  r.get('/api/admin/content/:id', ({ params }) => {
    const row = get('SELECT * FROM contents WHERE id = ?', Number(params.id) || 0);
    if (!row) fail(404, 'محتوا پیدا نشد.');
    return { item: { ...row, show_in_menu: !!row.show_in_menu } };
  }, guard);

  function prepare(body, id, type) {
    const data = parse(body, contentSchema);
    const slug = data.slug || slugify(data.title);
    if (!slug) fail(422, 'برای ساخت نامک، یک نامک انگلیسی یا فارسی وارد کنید.', { slug: 'نامک را وارد کنید.' });
    const clash = get('SELECT id FROM contents WHERE type = ? AND slug = ? AND id != ?', type, slug, id ?? 0);
    if (clash) fail(422, 'این نامک قبلاً استفاده شده است.', { slug: 'این نامک قبلاً استفاده شده است.' });
    return { ...data, slug };
  }

  r.post('/api/admin/content', ({ body, user }) => {
    const type = body?.type;
    if (!['page', 'post'].includes(type)) fail(422, 'نوع محتوا نامعتبر است.', { type: 'نوع محتوا نامعتبر است.' });
    const data = prepare(body, null, type);
    const published = data.status === 'published';
    const { sql, values } = insertSql('contents', {
      ...data, type, author_id: user.id, show_in_menu: type === 'page' ? data.show_in_menu : false,
      published_at: published ? nowIso() : null,
    });
    const { id } = run(sql, ...values);
    audit(user, 'create', type, id, data.title);
    return { item: { id } };
  }, guard);

  r.put('/api/admin/content/:id', ({ params, body, user }) => {
    const id = Number(params.id) || 0;
    const current = get('SELECT * FROM contents WHERE id = ?', id);
    if (!current) fail(404, 'محتوا پیدا نشد.');
    const data = prepare(body, id, current.type);
    const publishedAt = data.status === 'published' ? (current.published_at ?? nowIso()) : current.published_at;
    const { sql, values } = updateSql('contents', {
      ...data, show_in_menu: current.type === 'page' ? data.show_in_menu : false,
      published_at: publishedAt, updated_at: nowIso(),
    });
    run(sql, ...values, id);
    audit(user, 'update', current.type, id, data.title);
    return { item: { id } };
  }, guard);

  r.delete('/api/admin/content/:id', ({ params, user }) => {
    const id = Number(params.id) || 0;
    const row = get('SELECT type, title FROM contents WHERE id = ?', id);
    if (!row) fail(404, 'محتوا پیدا نشد.');
    run('DELETE FROM contents WHERE id = ?', id);
    audit(user, 'delete', row.type, id, row.title);
    return { ok: true };
  }, guard);

  /* ---------- تنظیمات سایت؛ هر گروه دسترسی جدا دارد ---------- */
  r.get('/api/admin/settings', ({ user }) => {
    const editable = Object.entries(SETTING_GROUPS)
      .filter(([, g]) => can(user, g.permission))
      .flatMap(([, g]) => g.keys);
    return { settings: getSettings(), editable, groups: Object.fromEntries(Object.entries(SETTING_GROUPS).map(([k, g]) => [k, g.keys])) };
  }, { perm: ['content.manage', 'settings.manage'] });

  r.put('/api/admin/settings', ({ body, user }) => {
    const input = body && typeof body === 'object' ? body : {};
    const keys = Object.keys(input).filter((k) => Object.hasOwn(SETTING_RULES, k));
    if (!keys.length) fail(422, 'تنظیمی برای ذخیره ارسال نشده است.');
    for (const key of keys) {
      const group = groupOf(key);
      if (!group || !can(user, group.permission)) fail(403, 'شما اجازه ویرایش بعضی از این تنظیمات را ندارید.');
    }
    const data = parse(input, Object.fromEntries(keys.map((k) => [k, SETTING_RULES[k]])));
    for (const [key, value] of Object.entries(data)) saveSetting(key, value);
    audit(user, 'update', 'settings', null, keys.join(', '));
    return { settings: getSettings() };
  }, { perm: ['content.manage', 'settings.manage'] });
}
