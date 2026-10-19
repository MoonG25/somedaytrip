'use client';
// 제안 검토: 기장은 수락·거절(겹치면 겹치지 않는 것만 수락), 제안한 사람은 철회
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { decide, login, withdraw } from '@/app/actions';
import { broadcast, toast } from './util';

export default function DecidePanel({ planId, no, owner, mine, open, total, conflicts, ownerName, status }: { planId: string; no: number; owner: boolean; mine: boolean; open: boolean; total: number; conflicts: number; ownerName: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [showLogin, setShowLogin] = useState(false);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, icon: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast(r.error || '처리하지 못했어요', '!');
    broadcast(planId);
    toast(msg, icon);
    router.refresh();
  };

  if (!open)
    return (
      <div className="decide">
        <p className="muted">{status} 제안이에요.</p>
      </div>
    );

  if (owner)
    return (
      <div className="decide">
        <h3>검토하기</h3>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="한마디 남기기 (선택). 거절할 땐 이유를 적어 주면 좋아요" />
        {conflicts ? (
          conflicts < total ? (
            <>
              <button
                type="button"
                className="btn btn--solid"
                disabled={busy}
                onClick={() => confirm(`겹치는 변경 ${conflicts}개는 빼고 나머지만 반영할까요?`) && act(() => decide(planId, no, 'accept', note, true), '겹치지 않는 변경만 반영했어요', '◐')}
              >
                겹치지 않는 {total - conflicts}개만 수락
              </button>
              <p className="hint">겹치는 변경은 지금 계획을 그대로 둬요.</p>
            </>
          ) : (
            <p className="hint">모든 변경이 지금 계획과 겹쳐서 수락할 수 없어요. 거절하고 다시 제안해 달라고 하세요.</p>
          )
        ) : (
          <button type="button" className="btn btn--solid" disabled={busy} onClick={() => act(() => decide(planId, no, 'accept', note), '수락했어요. 계획에 반영됐어요', '✓')}>
            ✓ 수락하고 반영
          </button>
        )}
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => confirm('이 제안을 거절할까요?') && act(() => decide(planId, no, 'reject', note), '거절했어요', '✕')}>
          ✕ 거절
        </button>
      </div>
    );

  return (
    <div className="decide">
      <p className="muted">
        기장(<b>{ownerName}</b>)이 검토하면 결과가 여기에 보여요.
      </p>
      {mine ? (
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => confirm('이 제안을 거둘까요?') && act(() => withdraw(planId, no), '철회했어요', '↩')}>
          ↩ 제안 철회
        </button>
      ) : null}
      {showLogin ? (
        <form
          className="item-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await login(planId, pw, true);
            if (!r.ok) return toast(r.error, '!');
            toast('기장으로 인증됐어요', '🧑‍✈️');
            router.refresh();
          }}
        >
          <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="기장 비밀번호" autoFocus autoComplete="current-password" />
          <button type="submit" className="btn btn--sm btn--solid">
            인증하고 검토
          </button>
        </form>
      ) : (
        <button type="button" className="link-u faint" onClick={() => setShowLogin(true)}>
          기장이신가요? 인증하고 검토 →
        </button>
      )}
    </div>
  );
}
