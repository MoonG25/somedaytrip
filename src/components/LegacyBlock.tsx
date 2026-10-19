'use client';
// 서버가 그린 moon.log 블록(탑승권·카운트다운·사실·체크리스트·적금 병·도넛)에 움직임을 붙인다.
// HTML이 바뀌면(새 데이터) 다시 붙인다.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { mountPlanPage } from '@/blog/plan-page.js';
import { setCheck } from '@/app/actions';
import { toast } from './collab/util';
import type { Plan } from '@/lib/types';

export default function LegacyBlock({ html, plan, owner = false }: { html: string; plan: Plan & { stops?: unknown[] }; owner?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const off = mountPlanPage(ref.current!, plan, {
      owner,
      navigate: (href: string) => router.push(href),
      onCheck: async (i: number, done: boolean) => {
        const r = await setCheck(plan.id, i, done);
        if (!r.ok) toast(r.error, '!');
        return r.ok;
      },
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, owner]);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
