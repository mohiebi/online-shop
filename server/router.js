/* مسیریاب ساده: مسیر الگو با :param، و «نگهبان» برای احراز هویت و دسترسی */

export function createRouter() {
  const list = [];
  const add = (method) => (path, handler, guard = {}) => {
    const keys = [];
    const source = path.replace(/:([a-zA-Z]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; });
    list.push({ method, rx: new RegExp(`^${source}$`), keys, handler, guard });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    delete: add('DELETE'),
    /* نتیجه: { route, params } یا { methodNotAllowed: true } یا null */
    match(method, pathname) {
      let pathMatched = false;
      for (const route of list) {
        const m = route.rx.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params = {};
        route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}
