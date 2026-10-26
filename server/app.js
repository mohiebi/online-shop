import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, UPLOAD_DIR } from './db.js';
import { createRouter } from './router.js';
import { HttpError, parseCookies, serializeCookie, readJson } from './util.js';
import { loadSession, can, SESSION_COOKIE, SESSION_MAX_AGE, pruneSessions } from './auth.js';
import registerAuth from './routes/auth.js';
import registerPublic from './routes/public.js';
import registerAccount from './routes/account.js';
import registerAdminCatalog from './routes/admin-catalog.js';
import registerAdminContent from './routes/admin-content.js';
import registerAdminOrders from './routes/admin-orders.js';
import registerAdminSystem from './routes/admin-system.js';

const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

const CSRF_EXEMPT = new Set(['/api/auth/login', '/api/auth/register']);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const sameToken = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function createApp() {
  const router = createRouter();
  [registerAuth, registerPublic, registerAccount, registerAdminCatalog, registerAdminContent, registerAdminOrders, registerAdminSystem]
    .forEach((register) => register(router));

  const secureCookie = process.env.COOKIE_SECURE === '1' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0');
  const trustProxy = process.env.TRUST_PROXY === '1';

  async function handleApi(req, res, url) {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const found = router.match(method, url.pathname);
    if (!found) throw new HttpError(404, 'مسیر موردنظر پیدا نشد.');
    if (found.methodNotAllowed) throw new HttpError(405, 'این روش درخواست پشتیبانی نمی‌شود.');
    const { route, params } = found;
    const guard = route.guard;

    const session = loadSession(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
    const user = session?.user ?? null;
    if ((guard.auth || guard.perm) && !user) throw new HttpError(401, 'برای ادامه باید وارد حساب کاربری شوید.');
    if (guard.perm && !can(user, guard.perm)) throw new HttpError(403, 'شما به این بخش دسترسی ندارید.');

    const mutating = method !== 'GET';
    if (mutating) {
      const origin = req.headers.origin;
      if (origin) {
        let originHost = null;
        try { originHost = new URL(origin).host; } catch { /* مبدأ نامعتبر */ }
        if (originHost !== req.headers.host) throw new HttpError(403, 'درخواست از مبدأ نامعتبر ارسال شده است.');
      }
      if (session && !CSRF_EXEMPT.has(url.pathname) && !sameToken(req.headers['x-csrf-token'] ?? '', session.csrf)) {
        throw new HttpError(403, 'نشست شما منقضی یا نامعتبر است؛ صفحه را دوباره بارگذاری کنید.');
      }
    }

    const ctx = {
      req,
      res,
      params,
      query: Object.fromEntries(url.searchParams),
      body: mutating && !guard.raw ? await readJson(req) : undefined,
      user,
      session,
      ip: trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress,
      setSessionCookie: (token) => res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_MAX_AGE, secure: secureCookie })),
      clearSessionCookie: () => res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: secureCookie })),
    };
    sendJson(res, 200, (await route.handler(ctx)) ?? { ok: true });
  }

  function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
    if (rel.includes('\0') || rel.split('/').some((seg) => seg.startsWith('.'))) { res.writeHead(404); return res.end(); }

    const isUpload = rel.startsWith('/uploads/');
    const root = isUpload ? UPLOAD_DIR : PUBLIC_DIR;
    let target = path.join(root, isUpload ? rel.slice('/uploads/'.length) : rel);
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }

    let stat = fs.existsSync(target) ? fs.statSync(target) : null;
    if (stat?.isDirectory() && !isUpload) {
      target = path.join(target, 'index.html');
      stat = fs.existsSync(target) ? fs.statSync(target) : null;
    }
    if (!stat?.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('پیدا نشد'); }

    const type = MIME[path.extname(target).toLowerCase()];
    if (!type) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': isUpload ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'این روش درخواست پشتیبانی نمی‌شود.');
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, fields: err.fields });
      console.error(err);
      return sendJson(res, 500, { error: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
    }
  });

  const timer = setInterval(pruneSessions, 6 * 3600_000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return server;
}
