import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { get, run } from './db.js';
import { ROLES } from './constants.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL = 14 * 24 * 3600 * 1000;
export const SESSION_COOKIE = 'sid';
export const SESSION_MAX_AGE = SESSION_TTL / 1000;

/* ---------- گذرواژه ---------- */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [version, salt, hash] = String(stored).split('$');
  if (version !== 's1' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/* برای یکسان نگه داشتن زمان پاسخ وقتی ایمیل وجود ندارد */
export const DUMMY_HASH = await hashPassword('not-a-real-password');

/* ---------- نشست ---------- */
const sha = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  run('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)', sha(token), userId, csrf, Date.now() + SESSION_TTL);
  return { token, csrf };
}

export function loadSession(token) {
  if (!token) return null;
  const row = get(
    `SELECT s.token_hash, s.csrf, s.expires_at, u.id, u.email, u.name, u.phone, u.role, u.active
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha(token),
  );
  if (!row || row.expires_at < Date.now() || !row.active) return null;
  return {
    hash: row.token_hash,
    csrf: row.csrf,
    user: { id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role },
  };
}

export const destroySessionHash = (hash) => run('DELETE FROM sessions WHERE token_hash = ?', hash);

export function destroyUserSessions(userId, exceptHash = '') {
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, exceptHash);
}

export const pruneSessions = () => run('DELETE FROM sessions WHERE expires_at < ?', Date.now());

/* ---------- دسترسی ---------- */
export const permissionsOf = (user) => (user ? ROLES[user.role]?.permissions ?? [] : []);

export function can(user, permission) {
  if (!user) return false;
  const list = Array.isArray(permission) ? permission : [permission];
  const mine = permissionsOf(user);
  return list.some((p) => mine.includes(p));
}

export const isStaff = (user) => !!user && user.role !== 'customer';

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    roleLabel: ROLES[user.role]?.label ?? user.role,
    permissions: permissionsOf(user),
  };
}

/* ---------- محدودیت تعداد تلاش (در حافظه) ---------- */
const buckets = new Map();
export function allow(key, max, windowMs) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count += 1;
  return b.count <= max;
}
export const clearLimit = (key) => buckets.delete(key);
/* بدون افزایش شمارنده: آیا این کلید به سقف رسیده است؟ */
export function blocked(key, max) {
  const b = buckets.get(key);
  return !!b && b.reset > Date.now() && b.count >= max;
}
