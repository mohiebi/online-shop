import { get, run } from '../db.js';
import {
  hashPassword, verifyPassword, DUMMY_HASH, createSession, destroySessionHash,
  publicUser, allow, clearLimit, blocked,
} from '../auth.js';
import { fail, parse } from '../util.js';

const passwordRule = { type: 'string', required: true, raw: true, min: 8, max: 128, label: 'گذرواژه' };

export default function register(r) {
  r.get('/api/auth/me', ({ user, session }) => (user ? { user: publicUser(user), csrf: session.csrf } : { user: null, csrf: null }));

  r.post('/api/auth/register', async ({ body, ip, setSessionCookie }) => {
    if (!allow(`register:${ip}`, 10, 3600_000)) fail(429, 'تعداد ثبت‌نام از این شبکه بیش از حد مجاز است؛ بعداً تلاش کنید.');
    const data = parse(body, {
      name: { type: 'string', required: true, min: 3, max: 80, label: 'نام و نام خانوادگی' },
      email: { type: 'email', required: true, label: 'ایمیل' },
      phone: { type: 'phone', default: null, label: 'شماره موبایل' },
      password: passwordRule,
    });
    if (!/[A-Za-z؀-ۿ]/.test(data.password) || !/\d|[۰-۹]/.test(data.password)) {
      fail(422, 'گذرواژه باید ترکیبی از حروف و عدد باشد.', { password: 'گذرواژه باید ترکیبی از حروف و عدد باشد.' });
    }
    if (get('SELECT id FROM users WHERE email = ?', data.email)) {
      fail(422, 'این ایمیل قبلاً ثبت شده است.', { email: 'این ایمیل قبلاً ثبت شده است.' });
    }
    const { id } = run(
      "INSERT INTO users (email, name, phone, password_hash, role) VALUES (?, ?, ?, ?, 'customer')",
      data.email, data.name, data.phone, await hashPassword(data.password),
    );
    const { token, csrf } = createSession(id);
    setSessionCookie(token);
    const user = get('SELECT id, email, name, phone, role FROM users WHERE id = ?', id);
    return { user: publicUser(user), csrf };
  });

  r.post('/api/auth/login', async ({ body, ip, setSessionCookie }) => {
    const data = parse(body, {
      email: { type: 'email', required: true, label: 'ایمیل' },
      password: { type: 'string', required: true, raw: true, max: 128, label: 'گذرواژه' },
    });
    const key = `login:${ip}:${data.email}`;
    const ipKey = `login-ip:${ip}`;
    if (!allow(key, 8, 15 * 60_000) || blocked(ipKey, 40)) fail(429, 'تلاش‌های ناموفق زیاد بوده است؛ ۱۵ دقیقه بعد دوباره امتحان کنید.');
    const row = get('SELECT * FROM users WHERE email = ?', data.email);
    const valid = await verifyPassword(data.password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !valid) {
      allow(ipKey, 40, 15 * 60_000); // سقف کلی ناموفق‌ها از یک شبکه (حدس گذرواژه روی ایمیل‌های مختلف)
      fail(401, 'ایمیل یا گذرواژه نادرست است.');
    }
    if (!row.active) fail(403, 'حساب کاربری شما غیرفعال شده است.');
    clearLimit(key);
    run("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?", row.id);
    const { token, csrf } = createSession(row.id);
    setSessionCookie(token);
    return { user: publicUser(row), csrf };
  });

  r.post('/api/auth/logout', ({ session, clearSessionCookie }) => {
    destroySessionHash(session.hash);
    clearSessionCookie();
    return { ok: true };
  }, { auth: true });
}
