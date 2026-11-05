// Leaflet을 여행 페이지에 처음 들어올 때만 불러온다 (동적 import).
// 바탕 지도는 키가 필요 없는 무료 타일 (OpenStreetMap 컬러 기본 · 지형 · 위성).
let L;

export async function loadLeaflet() {
  if (L) return L;
  if (!document.querySelector('link[data-leaflet]')) {
    const link = Object.assign(document.createElement('link'), {
      rel: 'stylesheet',
      href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    });
    link.dataset.leaflet = '';
    document.head.append(link);
  }
  // 번들러가 이 주소를 묶으려 하지 않게 한다 (브라우저가 CDN에서 직접 불러온다)
  L = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.esm.js');
  return L;
}

// 바탕 지도 (모두 키 없이 무료). 고른 것은 이 브라우저에 기억한다
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
export const BASES = {
  // OpenStreetMap 기본 (컬러). CARTO Voyager는 이제 키를 요구해서 쓰지 않는다
  base: {
    label: '일반',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM,
    maxZoom: 19,
  },
  // OpenTopoMap: 등고선·지형 (산간 여행)
  topo: {
    label: '지형',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: `${OSM} · SRTM | &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)`,
    subdomains: 'abc',
    maxZoom: 17,
  },
  // Esri World Imagery: 위성 사진
  sat: {
    label: '위성',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
};
const BASE_KEY = 'sdt:mapbase';
const savedBase = () => {
  try {
    const v = localStorage.getItem(BASE_KEY);
    return v && BASES[v] ? v : 'base';
  } catch {
    return 'base';
  }
};

function baseLayer(L, key) {
  const b = BASES[key] || BASES.base;
  return L.tileLayer(b.url, { attribution: b.attribution, subdomains: b.subdomains || 'abc', maxZoom: b.maxZoom });
}

/** 지도 오른쪽 위 "일반 · 지형 · 위성" 전환 */
function baseSwitch(L, map, start, onPick) {
  const Ctl = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create('div', 'map-base');
      box.setAttribute('role', 'radiogroup');
      box.setAttribute('aria-label', '지도 종류');
      const paint = (cur) => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.base === cur)));
      for (const [k, b] of Object.entries(BASES)) {
        const btn = L.DomUtil.create('button', '', box);
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.dataset.base = k;
        btn.textContent = b.label;
      }
      paint(start);
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.on(box, 'click', (e) => {
        const k = e.target.closest?.('[data-base]')?.dataset.base;
        if (!k) return;
        paint(k);
        onPick(k);
      });
      return box;
    },
  });
  new Ctl({ position: 'topright' }).addTo(map);
}

export function createMap(L, el, opts = {}) {
  const { baseSwitch: withSwitch = false, ...rest } = opts;
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    worldCopyJump: false,
    zoomSnap: 0.25,
    ...rest,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  let key = savedBase();
  let tiles = baseLayer(L, key).addTo(map);
  el.dataset.base = key;
  if (withSwitch)
    baseSwitch(L, map, key, (k) => {
      if (k === key) return;
      key = k;
      try {
        localStorage.setItem(BASE_KEY, k);
      } catch {}
      map.removeLayer(tiles);
      tiles = baseLayer(L, k).addTo(map);
      el.dataset.base = k;
      tiles.bringToBack();
      // 지형 지도는 17단계까지라 그보다 가까우면 맞춰 준다
      if (map.getZoom() > BASES[k].maxZoom) map.setZoom(BASES[k].maxZoom);
    });

  // 휠 줌은 지도를 클릭한 뒤에만 (페이지 스크롤을 가로채지 않도록)
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  pinchZoom(map, el);

  return map;
}

/**
 * 트랙패드 핀치(두 손가락 벌리기·오므리기)는 클릭하지 않아도 바로 지도를 확대·축소한다.
 * 크롬·엣지·파이어폭스는 핀치를 ctrl+휠로, 사파리는 gesture 이벤트로 보낸다. 페이지 확대로 새지 않게 막는다.
 */
function pinchZoom(map, el) {
  let want = null;
  let idle = 0;
  const zoomTo = (e, z) => map.setZoomAround(map.mouseEventToContainerPoint(e), Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z)), { animate: false });
  el.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey || map.scrollWheelZoom.enabled()) return;
      e.preventDefault();
      // 한 번의 움직임은 작아서 확대 단계(zoomSnap)에 묻힌다: 손을 떼기 전까지 모아서 적용
      want = (want ?? map.getZoom()) - e.deltaY * 0.012;
      clearTimeout(idle);
      idle = setTimeout(() => (want = null), 250);
      zoomTo(e, want);
    },
    { passive: false }
  );
  let start = 0;
  el.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    start = map.getZoom();
  });
  el.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    zoomTo(e, start + Math.log2(e.scale || 1));
  });
  el.addEventListener('gestureend', (e) => e.preventDefault());
}

export function destroyMap(map) {
  if (!map) return;
  // 날아가는(flyTo) 애니메이션 도중에 지도를 없애면 Leaflet 내부에서 오류가 날 수 있어 먼저 멈춘다
  try {
    map.stop();
    map.off();
    map.remove();
  } catch {
    /* 이미 정리된 지도 */
  }
}

export function pinIcon(L, { label = '', active = false, size = 30, kind = '' } = {}) {
  return L.divIcon({
    className: `pin ${active ? 'is-active' : ''} ${kind}`,
    html: `<span class="pin-pulse"></span><span class="pin-dot">${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
