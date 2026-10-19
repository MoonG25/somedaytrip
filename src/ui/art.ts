// 계획마다 다른 우표 그림. 같은 계획은 늘 같은 그림이 나오도록 id로 씨앗을 만든다.
import type { Plan } from '../types';

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function stamp(plan: Pick<Plan, 'id' | 'hue' | 'scope' | 'emoji'>) {
  const r = rng(plan.id);
  const h = plan.hue;
  const sky = `oklch(0.9 0.06 ${h})`;
  const sun = `oklch(0.78 0.16 ${(h + 50) % 360})`;
  const far = `oklch(0.72 0.1 ${(h + 160) % 360})`;
  const near = `oklch(0.52 0.12 ${(h + 190) % 360})`;
  const sx = 20 + r() * 60;
  const sy = 22 + r() * 18;

  let land = '';
  if (plan.scope === 'local') {
    // 동네: 지붕들
    let x = -4;
    while (x < 104) {
      const w = 12 + r() * 14;
      const ht = 18 + r() * 22;
      land += `<path d="M${x} 100V${100 - ht}l${w / 2} -${6 + r() * 6}l${w / 2} ${6 + r() * 6}V100Z" fill="${r() < 0.5 ? far : near}"/>`;
      if (r() < 0.6) land += `<rect x="${x + w / 2 - 2}" y="${100 - ht + 8}" width="4" height="5" fill="${sky}" opacity=".9"/>`;
      x += w + 1;
    }
  } else if (plan.scope === 'domestic') {
    // 국내: 산 능선 두 겹
    const ridge = (base: number, amp: number) => {
      let d = `M0 100V${base}`;
      for (let x = 0; x <= 100; x += 10) d += `L${x} ${base - r() * amp}`;
      return d + 'V100Z';
    };
    land = `<path d="${ridge(62, 22)}" fill="${far}"/><path d="${ridge(78, 16)}" fill="${near}"/>`;
  } else {
    // 해외: 바다와 비행기 자국
    let waves = '';
    for (let i = 0; i < 4; i++) waves += `<path d="M0 ${70 + i * 8}q12.5 -4 25 0t25 0t25 0t25 0V100H0Z" fill="${i % 2 ? near : far}" opacity="${0.75 + i * 0.08}"/>`;
    land = `${waves}<path d="M8 ${40 + r() * 10}q30 -${10 + r() * 10} 70 -${4 + r() * 8}" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/>`;
  }

  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="100" fill="${sky}"/>
    <circle cx="${sx}" cy="${sy}" r="${9 + r() * 6}" fill="${sun}"/>
    ${land}
  </svg>`;
}
