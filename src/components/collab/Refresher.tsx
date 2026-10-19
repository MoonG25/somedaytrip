'use client';
// 다른 탭에서 이 계획이 바뀌면 화면을 새로 받는다 (1단계 실시간)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Refresher({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('sdt');
      bc.onmessage = (e) => e.data?.id === id && router.refresh();
    } catch {}
    return () => bc?.close();
  }, [id, router]);
  return null;
}
