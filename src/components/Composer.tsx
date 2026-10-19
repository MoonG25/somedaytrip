'use client';
// 계획 쓰기 · 고치기 · 복사. moon.log 작성기 HTML 위에 움직임을 붙이고, 저장은 서버 액션으로.
import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { renderComposer, mountComposer } from '@/blog/composer.js';
import { createPlan, updatePlan } from '@/app/actions';
import { rememberPlan } from '@/lib/mine';
import type { Item, PlanInfo } from '@/lib/types';

type Stop = { name: string; en?: string; coords: [number, number]; note?: string };

/** 작성기에서 넣은 장소 → 일정 (날짜에 고르게 나눠 둔다) */
function stopsToItems(stops: Stop[], days: number): Item[] {
  return stops.map((s, i) => ({
    id: Math.random().toString(36).slice(2, 10),
    day: Math.min(days, Math.floor((i * days) / Math.max(stops.length, 1)) + 1),
    time: '',
    title: s.name,
    en: s.en || '',
    kind: 'see',
    place: { name: s.name, en: s.en || undefined, lat: s.coords[0], lng: s.coords[1] },
    memo: s.note || '',
    cost: null,
    order: i,
  }));
}

export default function Composer({ mode, initial, planId, copiedCount = 0 }: { mode: 'new' | 'edit' | 'copy'; initial?: Partial<PlanInfo> | null; planId?: string; copiedCount?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const html = useMemo(() => renderComposer({ mode, copiedCount }), [mode, copiedCount]);
  useEffect(() => {
    return mountComposer(ref.current!, {
      mode,
      initial,
      onSubmit: async ({ info, stops }: { info: PlanInfo; stops: Stop[] }, extra: { password?: string; remember?: boolean }) => {
        if (mode === 'edit') {
          const r = await updatePlan(planId!, info);
          if (!r.ok) return r.error;
          router.push(`/p/${planId}/${r.data.slug}`);
          router.refresh();
          return null;
        }
        const r = await createPlan({ info, items: stopsToItems(stops || [], info.days), password: extra.password || '', remember: !!extra.remember, copyFrom: mode === 'copy' ? planId : undefined });
        if (!r.ok) return r.error;
        rememberPlan(r.data.id);
        router.push(`/p/${r.data.id}/${r.data.slug}?welcome=1`);
        return null;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
