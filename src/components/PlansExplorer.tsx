'use client';
// 홈의 전광판·탑승권. 서버가 그린 공개 계획 HTML 위에 움직임을 붙이고,
// 이 브라우저의 "내 계획"을 불러와 앞쪽에 합친다.
import { useEffect, useMemo, useRef } from 'react';
import { renderPlansPage, mountPlansPage } from '@/blog/plans-page.js';
import { toView } from '@/blog/plans-lib.js';
import { enhance } from '@/blog/enhance.js';
import { myPlans } from '@/app/actions';
import { readMine, writeMine } from '@/lib/mine';

type View = ReturnType<typeof toView>;

export default function PlansExplorer({ initial }: { initial: View[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderPlansPage({ list: initial }), [initial]);

  useEffect(() => {
    const root = ref.current!;
    root.innerHTML = html; // 이전 이벤트가 남지 않게 새로 깐다
    const navigate = (href: string) => window.__sdtNavigate?.(href);
    let off = mountPlansPage(root, { list: initial, navigate });
    let alive = true;
    // 브라우저 목록이 비어 있어도 묻는다: 서버 쿠키 백업에서 되살릴 수 있다
    myPlans(readMine()).then(
      (rows) => {
        if (!alive) return;
        const found = new Set(rows.map((r) => r.bundle.plan.id));
        writeMine(rows.map((r) => r.bundle.plan.id));
        if (!rows.length) return;
        const mine = rows.map((r) => toView(r.bundle.plan, r.bundle.items));
        const mineIds = mine.map((p) => p.id);
        // 주인인 계획의 검토 대기 제안 수 (탑승권에 배지)
        const open = Object.fromEntries(rows.filter((r) => r.owner && r.open).map((r) => [r.bundle.plan.id, r.open]));
        const list = [...mine, ...initial.filter((p) => !found.has(p.id))];
        off();
        root.innerHTML = renderPlansPage({ list, mine: mineIds, open });
        off = mountPlansPage(root, { list, mine: mineIds, navigate, open });
        enhance(root);
      },
      () => {}
    );
    return () => {
      alive = false;
      off();
    };
  }, [initial]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
