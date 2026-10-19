// Leaflet 지도. 타일은 OSM 기본 타일, 다크 모드 색은 CSS 필터로 입힌다.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Item, Place } from '../types';
import { dayColor, esc, KINDS } from '../lib/util';

const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function makeMap(el: HTMLElement, center: Place | null, zoom: number) {
  const map = L.map(el, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.5 });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(TILE, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  // 휠 줌은 지도를 누른 뒤에만 (페이지 스크롤을 가로채지 않게)
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  map.setView(center ? [center.lat, center.lng] : [37.5665, 126.978], center ? zoom : 11);
  return map;
}

export function pin(label: string, color: string, extra = '') {
  return L.divIcon({
    className: `pin ${extra}`,
    html: `<span style="--c:${color}"><b>${esc(label)}</b></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 35],
  });
}

/** 일정 핀과 일차별 동선을 그리는 층 */
export class ItemLayer {
  private group = L.layerGroup();
  private markers = new Map<string, L.Marker>();

  constructor(
    private map: L.Map,
    private onPick: (id: string) => void
  ) {
    this.group.addTo(map);
  }

  draw(rows: { item: Item; mark?: string | null; n: number }[], fit: boolean) {
    this.group.clearLayers();
    this.markers.clear();
    const byDay = new Map<number | null, L.LatLngExpression[]>();
    for (const { item, mark, n } of rows) {
      if (!item.place) continue;
      const ll: L.LatLngExpression = [item.place.lat, item.place.lng];
      const m = L.marker(ll, { icon: pin(item.day == null ? '?' : String(n), dayColor(item.day), mark ? `is-${mark}` : ''), riseOnHover: true })
        .bindTooltip(`${KINDS[item.kind].icon} ${esc(item.title)}`, { direction: 'top', offset: [0, -32] })
        .on('click', () => this.onPick(item.id));
      m.addTo(this.group);
      this.markers.set(item.id, m);
      if (item.day != null && mark !== 'remove') {
        if (!byDay.has(item.day)) byDay.set(item.day, []);
        byDay.get(item.day)!.push(ll);
      }
    }
    for (const [day, pts] of byDay) {
      if (pts.length > 1) L.polyline(pts, { color: dayColor(day), weight: 3, opacity: 0.7, dashArray: '2 8', lineCap: 'round' }).addTo(this.group);
    }
    if (fit && this.markers.size) {
      const b = L.latLngBounds([...this.markers.values()].map((m) => m.getLatLng()));
      this.map.fitBounds(b.pad(0.25), { maxZoom: 16, animate: false });
    }
  }

  focus(id: string) {
    const m = this.markers.get(id);
    if (!m) return false;
    this.map.flyTo(m.getLatLng(), Math.max(this.map.getZoom(), 15), { duration: 0.6 });
    m.openTooltip();
    return true;
  }
}

export { L };
