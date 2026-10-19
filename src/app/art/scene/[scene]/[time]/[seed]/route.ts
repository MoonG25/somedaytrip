// 탑승권 스텁의 풍경 그림. 같은 주소면 늘 같은 그림이라 오래 캐시한다 (next.config.ts의 /art 헤더)
import { sceneSvg } from '@/blog/art.js';

export async function GET(_: Request, { params }: { params: Promise<{ scene: string; time: string; seed: string }> }) {
  const { scene, time, seed } = await params;
  const svg = sceneSvg(scene.slice(0, 20), time.slice(0, 20), decodeURIComponent(seed).replace(/\.svg$/, '').slice(0, 60));
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
