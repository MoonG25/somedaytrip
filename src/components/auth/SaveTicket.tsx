'use client';
// 탑승권 저장 = 가입 유도의 주 경로. 링크를 잃으면 다시 찾을 수 없다는 걸 정직하게 알려 주고, 그 자리에서 가입·로그인.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveTicket } from '@/app/actions';
import { readMine } from '@/lib/mine';
import Modal from '../collab/Modal';
import { toast } from '../collab/util';
import { LoginForm, SignupForm } from './AuthForms';

/** 가입·로그인 직후: 이 탑승권을 지갑에 넣고, 이 브라우저에 있던 다른 탑승권도 계정으로 옮긴다 */
export async function afterAuthSave(planId: string | null) {
  if (planId) await saveTicket(planId);
  await fetch('/api/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: readMine(), merge: true }) }).catch(() => {});
}

export function SaveTicketModal({ open, planId, title, presetNick, onClose }: { open: boolean; planId: string | null; title?: string; presetNick?: string; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<'signup' | 'login'>('signup');
  const done = async (nick: string) => {
    await afterAuthSave(planId);
    onClose();
    router.refresh();
    toast(planId ? `${nick}님의 지갑에 저장했어요. 이제 어느 기기에서든 열 수 있어요` : `${nick}님, 이 브라우저의 탑승권을 지갑에 옮겼어요`, '🎫');
  };
  return (
    <Modal open={open} title={planId ? '탑승권 저장' : '탑승권 지갑'} onClose={onClose}>
      <div className="save-ticket">
        <p className="st-lede">
          {title ? (
            <>
              <b>&lsquo;{title}&rsquo;</b> 탑승권은 지금 <b>이 브라우저에만</b> 있어요.
            </>
          ) : (
            <>
              탑승권이 지금 <b>이 브라우저에만</b> 있어요.
            </>
          )}{' '}
          기기를 바꾸거나 방문 기록을 지우면 링크 없이는 다시 찾을 수 없어요. 가입하면 어느 기기에서든 열 수 있어요.
        </p>
        {tab === 'signup' ? <SignupForm onDone={done} onSwitch={() => setTab('login')} presetNick={presetNick} /> : <LoginForm onDone={done} onSwitch={() => setTab('signup')} />}
      </div>
    </Modal>
  );
}
