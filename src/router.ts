// History API 라우터. 같은 사이트 링크를 가로채서 페이지를 다시 그린다.
export type Cleanup = void | (() => void);
export type Page = (root: HTMLElement, params: Record<string, string>, query: URLSearchParams) => Cleanup | Promise<Cleanup>;

interface Route {
  re: RegExp;
  keys: string[];
  load: () => Promise<{ default: Page }>;
}

const routes: Route[] = [];
let cleanup: Cleanup;
let root: HTMLElement;
let seq = 0;

export function route(path: string, load: Route['load']) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ re, keys, load });
}

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return render();
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  render();
}

async function render() {
  const my = ++seq;
  const path = location.pathname;
  const hit = routes.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m);
  const params: Record<string, string> = {};
  hit?.r.keys.forEach((k, i) => (params[k] = decodeURIComponent(hit.m![i + 1])));
  const mod = await (hit ?? { r: routes[routes.length - 1] }).r.load();
  if (my !== seq) return;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  root.innerHTML = '';
  root.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  cleanup = await mod.default(root, params, new URLSearchParams(location.search));
  document.dispatchEvent(new CustomEvent('routed'));
}

export function startRouter(el: HTMLElement) {
  root = el;
  addEventListener('popstate', render);
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest('a');
    if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin) return;
    e.preventDefault();
    navigate(a.pathname + a.search);
  });
  render();
}
