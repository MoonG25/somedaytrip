'use client';
// 홈의 전광판·탑승권. 서버가 그린 공개 계획 HTML 위에 움직임을 붙이고,
// 이 브라우저의 "내 계획"을 불러와 앞쪽에 합친다.
import { useEffect, useMemo, useRef } from 'react';
import { renderPlansPage, mountPlansPage } from '@/blog/plans-page.js';
import { toView } from '@/blog/plans-lib.js';
import { enhance } from '@/blog/enhance.js';
import { myPlans } from '@/app/actions';
import { forgetPlan, readMine } from '@/lib/mine';

type View = ReturnType<typeof toView>;

export default function PlansExplorer({ initial }: { initial: View[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderPlansPage({ list: initial }), [initial]);

  useEffect(() => {
    const root = ref.current!;
    const navigate = (href: string) => window.__sdtNavigate?.(href);
    let off = mountPlansPage(root, { list: initial, navigate });
    let alive = true;
    const ids = readMine();
    if (ids.length) {
      myPlans(ids).then((rows) => {
        if (!alive) return;
        const found = new Set(rows.map((r) => r.bundle.plan.id));
        ids.filter((id) => !found.has(id)).forEach(forgetPlan);
        if (!rows.length) return;
        const mine = rows.map((r) => toView(r.bundle.plan, r.bundle.items));
        const mineIds = mine.map((p) => p.id);
        const list = [...mine, ...initial.filter((p) => !found.has(p.id))];
        off();
        root.innerHTML = renderPlansPage({ list, mine: mineIds });
        off = mountPlansPage(root, { list, mine: mineIds, navigate });
        enhance(root);
      });
    }
    return () => {
      alive = false;
      off();
    };
  }, [initial]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
