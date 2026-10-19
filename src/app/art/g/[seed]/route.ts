// 탑승권 위조방지 무늬 (마스크 그림)
import { guillocheSvg } from '@/blog/plans-lib.js';

export async function GET(_: Request, { params }: { params: Promise<{ seed: string }> }) {
  const { seed } = await params;
  const svg = guillocheSvg(decodeURIComponent(seed).replace(/\.svg$/, '').slice(0, 60));
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
