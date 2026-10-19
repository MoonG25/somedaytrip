// 상태 확인 + Supabase 깨우기. Vercel Cron이 하루 한 번 부른다 (Free 프로젝트는 7일 동안 요청이 없으면 멈춘다)
import { NextResponse } from 'next/server';
import { repo } from '@/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const t0 = Date.now();
  try {
    const n = (await repo().listPublic(1)).length;
    return NextResponse.json({ ok: true, db: n >= 0, ms: Date.now() - t0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
