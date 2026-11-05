// Leaflet을 여행 페이지에 처음 들어올 때만 불러온다 (동적 import).
// 타일은 키가 필요 없는 OpenStreetMap 기본 타일. 테마 색은 CSS 필터로 입힌다 (pages.css의 .leaflet-tile-pane).
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

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function createMap(L, el, opts = {}) {
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    worldCopyJump: false,
    zoomSnap: 0.25,
    ...opts,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

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
