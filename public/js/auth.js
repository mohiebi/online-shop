/* صفحه‌های ورود و ثبت‌نام */
import {
  $, esc, auth, POST, site, showErrors, toast,
} from './core.js';

const safeNext = (next) => (next && /^#\/(?!\/)/.test(next) && !next.startsWith('#/login') && !next.startsWith('#/register') ? next : '#/panel');

function authShell(title, subtitle, body, footer) {
  return `<div class="page"><div class="container"><div class="auth-card">
    <div class="auth-brand" aria-hidden="true">🍒</div>
    <h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p>
    ${body}
    <p class="auth-switch">${footer}</p>
  </div></div></div>`;
}

const input = (name, label, attrs = '') => `<div class="field"><label for="a-${name}">${label}</label><input id="a-${name}" name="${name}" ${attrs} aria-describedby="e-${name}"><span class="err" id="e-${name}" role="alert"></span></div>`;

export function login({ main, route }) {
  if (auth.user) { location.hash = '#/panel'; return; }
  document.title = `ورود | ${site.settings.store_name}`;
  const next = route.query.next ?? '';
  main.innerHTML = authShell('ورود به حساب کاربری', 'برای ثبت سفارش و دیدن پنل خود وارد شوید.', `
    <form data-form="login" data-next="${esc(next)}" novalidate>
      ${input('email', 'ایمیل', 'type="email" autocomplete="username" dir="ltr" class="ltr" required')}
      ${input('password', 'گذرواژه', 'type="password" autocomplete="current-password" dir="ltr" class="ltr" required')}
      <p class="err form-err" id="e-form" role="alert"></p>
      <button class="btn btn-primary btn-lg btn-block" type="submit">ورود</button>
    </form>`, `حساب ندارید؟ <a href="#/register${next ? `?next=${encodeURIComponent(next)}` : ''}">ثبت‌نام کنید</a>`);
  $('#a-email').focus();
}

export function register({ main, route }) {
  if (auth.user) { location.hash = '#/panel'; return; }
  document.title = `ثبت‌نام | ${site.settings.store_name}`;
  const next = route.query.next ?? '';
  main.innerHTML = authShell('ساخت حساب کاربری', 'با ثبت‌نام می‌توانید سفارش‌هایتان را پیگیری کنید.', `
    <form data-form="register" data-next="${esc(next)}" novalidate>
      ${input('name', 'نام و نام خانوادگی', 'autocomplete="name" required')}
      ${input('email', 'ایمیل', 'type="email" autocomplete="email" dir="ltr" class="ltr" required')}
      ${input('phone', 'شماره موبایل <span class="opt">(اختیاری)</span>', 'type="tel" inputmode="tel" autocomplete="tel" dir="ltr" class="ltr" placeholder="09123456789"')}
      ${input('password', 'گذرواژه', 'type="password" autocomplete="new-password" dir="ltr" class="ltr" required minlength="8"')}
      <small class="hint">حداقل ۸ نویسه، ترکیبی از حروف و عدد.</small>
      <p class="err form-err" id="e-form" role="alert"></p>
      <button class="btn btn-primary btn-lg btn-block" type="submit">ثبت‌نام</button>
    </form>`, `حساب دارید؟ <a href="#/login${next ? `?next=${encodeURIComponent(next)}` : ''}">وارد شوید</a>`);
  $('#a-name').focus();
}

async function submit(form, path) {
  const btn = $('button[type=submit]', form);
  showErrors(form, {});
  $('#e-form', form).textContent = '';
  btn.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const r = await POST(path, data);
    auth.user = r.user;
    auth.csrf = r.csrf;
    document.dispatchEvent(new CustomEvent('auth:changed'));
    toast(path.endsWith('register') ? 'حساب شما ساخته شد. خوش آمدید!' : 'خوش آمدید!', 'ok');
    location.hash = safeNext(form.dataset.next);
  } catch (e) {
    if (e.fields) showErrors(form, e.fields);
    else $('#e-form', form).textContent = e.message;
  } finally { btn.disabled = false; }
}

export const forms = {
  login: (form) => submit(form, '/auth/login'),
  register: (form) => submit(form, '/auth/register'),
};
