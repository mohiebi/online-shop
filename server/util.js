import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export const fail = (status, message, fields) => { throw new HttpError(status, message, fields); };

export const latinDigits = (s) =>
  String(s ?? '').replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632);

/* یکسان‌سازی حروف عربی/فارسی و نیم‌فاصله برای جستجو */
export const normFa = (s) =>
  String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();

export function slugify(s) {
  return String(s ?? '').trim().toLowerCase()
    .replace(/[‌\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const nowIso = () => new Date().toISOString();

export function randomCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (secure) c += '; Secure';
  return c;
}

export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  let tooBig = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) tooBig = true;
    else chunks.push(chunk);
  }
  if (tooBig) fail(413, 'حجم درخواست بیش از حد مجاز است.');
  return Buffer.concat(chunks);
}

export async function readJson(req, limit = 1_000_000) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) fail(415, 'نوع محتوای درخواست باید JSON باشد.');
  try { return JSON.parse(buf.toString('utf8')); } catch { return fail(400, 'ساختار JSON نامعتبر است.'); }
}

/*
 * اعتبارسنجی ورودی بر اساس یک شِما.
 * فیلد خالی: اگر required باشد خطا، وگرنه اگر default دارد مقدارش گذاشته می‌شود.
 */
export function parse(input, schema) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  const errors = {};
  for (const [key, rule] of Object.entries(schema)) {
    const label = rule.label || key;
    let v = src[key];
    const blank = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (blank) {
      if (rule.required) errors[key] = `${label} الزامی است.`;
      else if ('default' in rule) out[key] = rule.default;
      continue;
    }
    switch (rule.type) {
      case 'int': {
        const n = typeof v === 'string' ? Number(latinDigits(v).replace(/[,٬\s]/g, '')) : v;
        if (!Number.isInteger(n)) { errors[key] = `${label} باید عدد صحیح باشد.`; break; }
        if (rule.min !== undefined && n < rule.min) { errors[key] = `${label} نباید کمتر از ${rule.min} باشد.`; break; }
        if (rule.max !== undefined && n > rule.max) { errors[key] = `${label} نباید بیشتر از ${rule.max} باشد.`; break; }
        out[key] = n;
        break;
      }
      case 'bool':
        out[key] = v === true || v === 1 || v === '1' || v === 'true';
        break;
      case 'enum':
        if (!rule.values.includes(v)) errors[key] = `${label} نامعتبر است.`;
        else out[key] = v;
        break;
      default: { // string | email | phone | path
        if (typeof v !== 'string') { errors[key] = `${label} نامعتبر است.`; break; }
        if (!rule.raw) v = v.trim();
        if (rule.digits) v = latinDigits(v).replace(/[\s-]/g, '');
        if (rule.type === 'email') {
          v = v.toLowerCase();
          if (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { errors[key] = 'ایمیل معتبر نیست.'; break; }
        }
        if (rule.type === 'phone') {
          v = latinDigits(v).replace(/[\s-]/g, '');
          if (!/^09\d{9}$/.test(v)) { errors[key] = 'شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹).'; break; }
        }
        if (rule.type === 'path' && !/^\/uploads\/[a-f0-9]{16,}\.(png|jpg|webp|gif)$/.test(v)) { errors[key] = `${label} نامعتبر است.`; break; }
        if (rule.min && v.length < rule.min) { errors[key] = `${label} باید حداقل ${rule.min} نویسه باشد.`; break; }
        if (rule.max && v.length > rule.max) { errors[key] = `${label} باید حداکثر ${rule.max} نویسه باشد.`; break; }
        if (rule.pattern && !rule.pattern.test(v)) { errors[key] = rule.msg || `${label} نامعتبر است.`; break; }
        out[key] = v;
      }
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'لطفاً خطاهای فرم را برطرف کنید.', errors);
  return out;
}

export function paging(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export const pageMeta = (total, { page, limit }) => ({ total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });

/* ساخت دستور UPDATE از کلیدهای مطمئن (از شِمای سرور می‌آیند، نه از کاربر) */
export function updateSql(table, data) {
  const keys = Object.keys(data);
  return { sql: `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, values: keys.map((k) => data[k]) };
}
export function insertSql(table, data) {
  const keys = Object.keys(data);
  return { sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, values: keys.map((k) => data[k]) };
}
