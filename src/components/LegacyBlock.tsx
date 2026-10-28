'use client';
// 서버가 그린 moon.log 블록(탑승권·카운트다운·사실·체크리스트·적금 병·도넛)에 움직임을 붙인다.
// HTML이 바뀌면(새 데이터) 다시 붙인다.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { mountPlanPage } from '@/blog/plan-page.js';
import { editChecklist, setCheck } from '@/app/actions';
import type { ChecklistOp } from '@/server/repo';
import { broadcast, toast } from './collab/util';
import type { Plan } from '@/lib/types';

export default function LegacyBlock({ html, plan, owner = false }: { html: string; plan: Plan & { stops?: unknown[] }; owner?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    ref.current!.innerHTML = html; // 이전 이벤트가 남지 않게 새로 깐다
    const off = mountPlanPage(ref.current!, plan, {
      owner,
      navigate: (href: string) => router.push(href),
      onCheck: async (i: number, done: boolean, text?: string) => {
        const r = await setCheck(plan.id, i, done, text);
        if (!r.ok) {
          toast(r.error, '!');
          router.refresh();
        } else broadcast(plan.id);
        return r.ok;
      },
      onChecklist: async (op: ChecklistOp) => {
        const r = await editChecklist(plan.id, op);
        if (!r.ok) {
          toast(r.error, '!');
          return false;
        }
        broadcast(plan.id);
        router.refresh();
        return true;
      },
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, owner]);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
