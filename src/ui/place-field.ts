// 장소 고르기: 검색하거나, 지도에서 직접 찍는다 (이름 없는 골목, 공원 벤치 같은 동네 장소용)
import type { Place } from '../types';
import { reverse, searchPlaces, type Near } from '../lib/geo';
import { debounce, esc } from '../lib/util';
import { L, makeMap, pin } from './map';

interface Opts {
  value: Place | null;
  near?: Near | null;
  placeholder?: string;
  onChange?: (p: Place | null) => void;
}

export function placeField(root: HTMLElement, opts: Opts) {
  let value = opts.value;
  let ctrl: AbortController | null = null;
  let map: L.Map | null = null;
  let marker: L.Marker | null = null;

  root.classList.add('place-field');
  root.innerHTML = `
    <div class="place-chosen" hidden></div>
    <div class="place-search">
      <input type="search" placeholder="${esc(opts.placeholder ?? '장소 이름이나 주소로 검색')}" autocomplete="off" />
      <ul class="place-results" role="listbox" hidden></ul>
    </div>
    <button type="button" class="link-btn" data-pickmap>🗺️ 지도에서 직접 찍기</button>
    <div class="pick-map" hidden></div>`;
  const chosen = root.querySelector<HTMLElement>('.place-chosen')!;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const list = root.querySelector<HTMLUListElement>('.place-results')!;
  const mapEl = root.querySelector<HTMLElement>('.pick-map')!;
  let results: Place[] = [];

  const paint = () => {
    chosen.hidden = !value;
    if (value) {
      chosen.innerHTML = `<span class="pc-ico">📍</span><span><b>${esc(value.name)}</b>${value.address ? `<small>${esc(value.address)}</small>` : ''}</span>
        <button type="button" class="icon-btn" data-clear aria-label="장소 지우기">✕</button>`;
    }
    if (map && value) {
      const ll: L.LatLngExpression = [value.lat, value.lng];
      marker ? marker.setLatLng(ll) : (marker = L.marker(ll, { icon: pin('★', 'var(--accent)') }).addTo(map));
      map.setView(ll, Math.max(map.getZoom(), 15));
    }
  };

  const set = (p: Place | null) => {
    value = p;
    paint();
    opts.onChange?.(p);
  };

  const run = debounce(async (q: string) => {
    ctrl?.abort();
    ctrl = new AbortController();
    if (q.trim().length < 2) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    list.innerHTML = `<li class="muted">찾는 중…</li>`;
    try {
      results = await searchPlaces(q, opts.near, ctrl.signal);
      list.innerHTML = results.length
        ? results.map((p, i) => `<li role="option" data-i="${i}" tabindex="-1"><b>${esc(p.name)}</b><small>${esc(p.address ?? '')}</small></li>`).join('')
        : `<li class="muted">결과가 없어요. 지도에서 직접 찍어 보세요</li>`;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') list.innerHTML = `<li class="muted">검색이 안 돼요. 잠시 뒤 다시 해 주세요</li>`;
    }
  }, 450);

  input.addEventListener('input', () => run(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[0] && !list.hidden) pick(0);
    }
    if (e.key === 'ArrowDown') (list.querySelector('li[data-i]') as HTMLElement | null)?.focus();
  });
  list.addEventListener('keydown', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (!li) return;
    if (e.key === 'ArrowDown') (li.nextElementSibling as HTMLElement | null)?.focus();
    if (e.key === 'ArrowUp') ((li.previousElementSibling as HTMLElement | null) ?? input).focus();
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(+li.dataset.i!);
    }
  });
  const pick = (i: number) => {
    set(results[i]);
    input.value = '';
    list.hidden = true;
  };
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
    if (li) pick(+li.dataset.i!);
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-clear]')) set(null);
    if (t.closest('[data-pickmap]')) {
      mapEl.hidden = !mapEl.hidden;
      if (!mapEl.hidden && !map) {
        const c = value ?? (opts.near ? { name: '', lat: opts.near.lat, lng: opts.near.lng } : null);
        map = makeMap(mapEl, c, 15);
        map.scrollWheelZoom.enable();
        map.on('click', async (ev: L.LeafletMouseEvent) => {
          const { lat, lng } = ev.latlng;
          set({ name: '고르는 중…', lat, lng });
          set(await reverse(lat, lng));
        });
        paint();
      }
      if (map) setTimeout(() => map!.invalidateSize(), 0);
    }
  });

  paint();
  return {
    get: () => value,
    destroy: () => {
      ctrl?.abort();
      map?.remove();
    },
  };
}
