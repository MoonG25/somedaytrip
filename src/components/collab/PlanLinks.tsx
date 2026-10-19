'use client';
// 계획의 지도·참고 링크 (구글맵 리스트 공유 등). 누구나 열어 보고, 주인은 여기서 바로 붙이거나 지운다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Plan } from '@/lib/types';
import { defaultLabel, LINK_META, linkKind, normalizeUrl } from '@/lib/links';
import { updatePlan } from '@/app/actions';
import Modal from './Modal';
import { broadcast, toast } from './util';

const infoOf = (plan: Plan) => {
  const { id: _i, slug: _s, version: _v, createdAt: _c, updatedAt: _u, sample: _x, copiedFrom: _f, ...info } = plan;
  return info;
};

export default function PlanLinks({ plan, owner }: { plan: Plan; owner: boolean }) {
  const router = useRouter();
  const links = plan.links || [];
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (next: Plan['links'], msg: string) => {
    setBusy(true);
    const r = await updatePlan(plan.id, { ...infoOf(plan), links: next });
    setBusy(false);
    if (!r.ok) return toast(r.error, '!');
    broadcast(plan.id);
    router.refresh();
    toast(msg, '🗺️');
  };

  if (!links.length && !owner) return null;
  const norm = normalizeUrl(url);

  return (
    <div className="container">
      <div className="plan-links">
        <span className="pl-title mono">MAPS · 지도</span>
        {links.map((l, i) => {
          const k = linkKind(l.url);
          return (
            <span key={l.url} className={`pl-chip k-${k}`}>
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc">
                <span aria-hidden="true">{LINK_META[k].icon}</span>
                {l.label}
                <span className="pl-arrow" aria-hidden="true">↗</span>
              </a>
              {owner ? (
                <button
                  type="button"
                  aria-label={`${l.label} 링크 지우기`}
                  disabled={busy}
                  onClick={() => confirm(`'${l.label}' 링크를 지울까요?`) && save(links.filter((_, j) => j !== i), '링크를 지웠어요')}
                >
                  ✕
                </button>
              ) : null}
            </span>
          );
        })}
        {owner ? (
          <button type="button" className="pl-add" onClick={() => setOpen(true)}>
            {links.length ? '+ 링크 추가' : '+ 구글맵에 정리해 둔 리스트가 있나요? 링크를 붙여 두세요'}
          </button>
        ) : null}
      </div>
      <Modal open={open} title="지도 링크 붙이기" onClose={() => setOpen(false)}>
        <form
          className="item-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!norm) return toast('http:// 또는 https:// 로 시작하는 주소를 붙여 넣어 주세요', '!');
            if (links.some((l) => l.url === norm)) return toast('이미 붙인 링크예요', '·');
            await save([...links, { url: norm, label: label.trim() || defaultLabel(norm) }].slice(0, 10), '링크를 붙였어요');
            setUrl('');
            setLabel('');
            setOpen(false);
          }}
        >
          <p className="muted">구글맵에서 장소 리스트나 내 지도를 열고 <b>공유 → 링크 복사</b>한 주소를 붙여 넣으세요. 네이버·카카오맵, 블로그 글도 돼요.</p>
          <label className="lbl">
            주소
            <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" inputMode="url" autoFocus />
          </label>
          <label className="lbl">
            이름 <span className="faint">(선택)</span>
            <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={norm ? defaultLabel(norm) : '예: 교토 맛집 리스트'} maxLength={40} />
          </label>
          {norm ? (
            <p className="hint">
              {LINK_META[linkKind(norm)].icon} {LINK_META[linkKind(norm)].label === '링크' ? '일반 링크' : `${LINK_META[linkKind(norm)].label} 링크`}로 붙여요
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="submit" className="btn btn--solid" disabled={busy || !norm}>
              붙이기
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
