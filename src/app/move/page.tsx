'use client';
// 옮기기 링크(/move#id.id.id)를 열면 계획들을 이 기기의 "내 계획"에 넣고 홈으로
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readMine, rememberPlan } from '@/lib/mine';
import { toast } from '@/components/collab/util';

export default function Move() {
  const router = useRouter();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const ids = decodeURIComponent(location.hash.slice(1))
      .split('.')
      .filter((x) => /^[a-z0-9-]{3,40}$/.test(x))
      .slice(0, 100);
    const before = new Set(readMine());
    ids.reverse().forEach(rememberPlan);
    const added = ids.filter((x) => !before.has(x)).length;
    setN(added);
    // 주소창에서 목록을 지운다
    history.replaceState(null, '', '/move');
    toast(ids.length ? `계획 ${ids.length}개를 내 계획에 넣었어요` : '옮길 계획이 없어요', '📲');
    const t = setTimeout(() => router.replace('/'), 900);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <section className="container page-head">
      <p className="eyebrow">Move devices</p>
      <h1 className="display">
        Moving <em>in.</em>
      </h1>
      <p className="lede">{n == null ? '내 계획을 옮기는 중…' : '옮겼어요. 떠날 곳으로 가는 중…'}</p>
    </section>
  );
}
