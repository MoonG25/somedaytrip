// 계획 화면에서 쓰는 모달들: 일정 편집, 주인 인증, 공유, 닉네임, 계획 정보, 비밀번호 변경
import QRCode from 'qrcode';
import type { Item, Kind, Me, Plan, PlanInput, Scope, When } from '../types';
import { store, StoreError } from '../lib/store';
import { saveOwnerToken, setMyName, setViewAsGuest } from '../lib/identity';
import { strength } from '../lib/crypto';
import { dayCount, dayLabel, esc, KINDS, nightsLabel, SCOPES, uid } from '../lib/util';
import type { Near } from '../lib/geo';
import { placeField } from './place-field';
import { busy, modal, toast } from './ui';

const nearOf = (plan: Plan): Near | null => (plan.place ? { lat: plan.place.lat, lng: plan.place.lng, span: plan.scope === 'local' ? 0.04 : 0.6 } : null);

/** 일정 추가·수정. 저장하면 완성된 Item을 돌려준다 (취소하면 null) */
export function itemModal(plan: Plan, opts: { item?: Item; day?: number | null; order: number; owner: boolean }): Promise<Item | null> {
  const it: Item = opts.item ?? { id: uid(8), day: opts.day ?? 1, time: '', title: '', kind: 'see', place: null, memo: '', cost: null, order: opts.order };
  const n = dayCount(plan.when);
  return new Promise((resolve) => {
    let result: Item | null = null;
    let pf: ReturnType<typeof placeField>;
    modal({
      title: opts.item ? '일정 고치기' : '일정 추가',
      wide: true,
      body: `
        <form class="item-form" novalidate>
          <input class="input lg" name="title" maxlength="60" placeholder="무엇을 할까요? 예: 시장 구경, 노을 보기" value="${esc(it.title)}" required />
          <div class="chips wrap kinds">${(Object.keys(KINDS) as Kind[])
            .map((k) => `<label class="chip"><input type="radio" name="kind" value="${k}" ${k === it.kind ? 'checked' : ''}/>${KINDS[k].icon} ${KINDS[k].label}</label>`)
            .join('')}</div>
          <div class="row2">
            <label class="field-label">날짜
              <select class="input" name="day">
                ${Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${it.day === i + 1 ? 'selected' : ''}>${esc(dayLabel(plan.when, i + 1))}</option>`).join('')}
                <option value="" ${it.day == null ? 'selected' : ''}>날짜 미정 (후보)</option>
              </select>
            </label>
            <label class="field-label">시간 <small>(선택)</small><input class="input" type="time" name="time" value="${esc(it.time)}" /></label>
          </div>
          <label class="field-label">장소 <small>(선택)</small></label>
          <div data-place></div>
          <div class="row2">
            <label class="field-label">예상 비용 <small>(원, 선택)</small><input class="input" type="number" name="cost" min="0" step="500" inputmode="numeric" value="${it.cost ?? ''}" /></label>
          </div>
          <label class="field-label">메모 <small>(선택)</small><textarea class="input" name="memo" rows="2" maxlength="300">${esc(it.memo)}</textarea></label>
          ${opts.owner ? '' : '<p class="hint">💡 바로 바뀌지 않고 <b>제안 바구니</b>에 담겨요. 다 고친 뒤 한 번에 제안하세요.</p>'}
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-cancel>취소</button>
            <button class="btn primary" type="submit">${opts.owner ? '저장' : '바구니에 담기'}</button>
          </div>
        </form>`,
      setup(el, close) {
        pf = placeField(el.querySelector('[data-place]')!, { value: it.place, near: nearOf(plan) });
        const form = el.querySelector('form')!;
        el.querySelector('[data-cancel]')!.addEventListener('click', close);
        (form.elements.namedItem('title') as HTMLInputElement).focus();
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const f = (k: string) => (form.elements.namedItem(k) as HTMLInputElement).value;
          const title = f('title').trim();
          if (!title) {
            (form.elements.namedItem('title') as HTMLInputElement).focus();
            return toast('무엇을 할지 적어 주세요', 'err');
          }
          const day = f('day') ? Number(f('day')) : null;
          result = {
            ...it,
            title,
            kind: (form.querySelector<HTMLInputElement>('input[name=kind]:checked')?.value ?? 'see') as Kind,
            day,
            time: f('time'),
            place: pf.get(),
            cost: f('cost') ? Math.max(0, Math.round(Number(f('cost')))) : null,
            memo: f('memo').trim(),
            // 날짜를 옮기면 그 날의 맨 뒤로
            order: opts.item && opts.item.day !== day ? opts.order : it.order,
          };
          close();
        });
        return () => pf.destroy();
      },
      onClose: () => resolve(result),
    });
  });
}

/** 주인 인증. 성공하면 true */
export function loginModal(plan: Plan): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    modal({
      title: '주인 인증',
      body: `
        <form class="stack" novalidate>
          <p class="lead">'${esc(plan.title)}'을 만들 때 정한 비밀번호를 넣어 주세요.</p>
          <input class="input lg" type="password" name="pw" autocomplete="current-password" placeholder="비밀번호" required />
          <label class="check"><input type="checkbox" name="remember" checked /> 이 브라우저에서 기억하기 <small>(공용 PC라면 끄세요)</small></label>
          <p class="form-error" role="alert" hidden></p>
          <p class="hint">비밀번호를 잊었다면 되찾을 수 없어요. 그래도 손님으로 제안은 계속할 수 있어요.</p>
          <div class="modal-actions"><button class="btn primary" type="submit">인증하기</button></div>
        </form>`,
      setup(el, close) {
        const form = el.querySelector('form')!;
        const pw = form.elements.namedItem('pw') as HTMLInputElement;
        const err = el.querySelector<HTMLElement>('.form-error')!;
        pw.focus();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const token = await busy(form.querySelector('button[type=submit]'), () => store.login(plan.id, pw.value));
            saveOwnerToken(plan.id, token, (form.elements.namedItem('remember') as HTMLInputElement).checked);
            setViewAsGuest(plan.id, false);
            ok = true;
            toast('주인으로 인증됐어요 👑', 'ok');
            close();
          } catch (e2) {
            err.hidden = false;
            err.textContent = e2 instanceof StoreError ? e2.message : '인증하지 못했어요';
            pw.select();
            el.querySelector('.modal-body')!.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 240 });
          }
        });
      },
      onClose: () => resolve(ok),
    });
  });
}

/** 손님 닉네임 묻기 */
export function nameModal(): Promise<Me | null> {
  return new Promise((resolve) => {
    let m: Me | null = null;
    modal({
      title: '어떻게 불러 드릴까요?',
      body: `
        <form class="stack" novalidate>
          <p class="lead">제안에 이름이 붙어요. 주인이 누가 낸 제안인지 알 수 있게요.</p>
          <input class="input lg" name="name" maxlength="20" placeholder="예: 준호" required />
          <div class="modal-actions"><button class="btn primary" type="submit">좋아요</button></div>
        </form>`,
      setup(el, close) {
        const form = el.querySelector('form')!;
        const input = form.elements.namedItem('name') as HTMLInputElement;
        input.focus();
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!input.value.trim()) return input.focus();
          m = setMyName(input.value);
          close();
        });
      },
      onClose: () => resolve(m),
    });
  });
}

export function shareModal(plan: Plan, welcome = false) {
  const url = `${location.origin}/p/${plan.id}`;
  modal({
    title: welcome ? '계획이 생겼어요 🎉' : '친구에게 공유',
    body: `
      ${welcome ? `<p class="lead">이제 링크를 친구에게 보내 보세요. 친구가 일정을 제안하면 <b>제안</b> 탭에 쌓이고, 주인인 내가 수락하거나 거절해요.</p>` : ''}
      <div class="share-grid">
        <canvas class="qr" width="168" height="168" aria-label="링크 QR 코드"></canvas>
        <div class="stack">
          <div class="copy-row"><input class="input" readonly value="${esc(url)}" /><button class="btn primary" data-copy>복사</button></div>
          ${'share' in navigator ? '<button class="btn ghost" data-share>📤 다른 앱으로 보내기</button>' : ''}
          <ul class="share-rules">
            <li>🔗 링크를 아는 사람은 누구나 일정을 <b>제안</b>할 수 있어요</li>
            <li>👑 반영은 비밀번호를 아는 <b>주인</b>만 할 수 있어요</li>
          </ul>
        </div>
      </div>
      ${welcome ? `<div class="callout warn"><b>🔑 비밀번호를 기억해 두세요.</b> 다른 기기에서 주인으로 돌아올 때 필요하고, 잊으면 되찾을 수 없어요.</div>` : ''}
      <p class="hint">지금은 1단계(서버 없음)라 이 브라우저 안에서만 열려요. 다른 탭에서 열면 친구 입장을 체험할 수 있어요.</p>`,
    setup(el) {
      QRCode.toCanvas(el.querySelector('canvas')!, url, { width: 168, margin: 1, color: { dark: '#1d1b16', light: '#ffffff' } }).catch(() => {});
      const input = el.querySelector<HTMLInputElement>('input')!;
      el.querySelector('[data-copy]')!.addEventListener('click', async (e) => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          input.select();
          document.execCommand('copy');
        }
        (e.target as HTMLElement).textContent = '복사됨 ✓';
        toast('링크를 복사했어요', 'ok');
      });
      el.querySelector('[data-share]')?.addEventListener('click', () => {
        navigator.share({ title: `${plan.emoji} ${plan.title}`, text: '같이 계획 짜자! 일정을 제안해 줘', url }).catch(() => {});
      });
    },
  });
}

export function metaModal(plan: Plan, token: string) {
  const w = plan.when;
  modal({
    title: '계획 정보 고치기',
    wide: true,
    body: `
      <form class="stack" novalidate>
        <div class="row2">
          <label class="field-label">이모지<input class="input" name="emoji" maxlength="4" value="${esc(plan.emoji)}" /></label>
          <label class="field-label grow">이름<input class="input" name="title" maxlength="40" value="${esc(plan.title)}" required /></label>
        </div>
        <label class="field-label">종류
          <select class="input" name="scope">${(Object.keys(SCOPES) as Scope[]).map((s) => `<option value="${s}" ${s === plan.scope ? 'selected' : ''}>${SCOPES[s].icon} ${SCOPES[s].label}</option>`).join('')}</select>
        </label>
        <label class="field-label">중심 장소</label>
        <div data-place></div>
        <div class="seg">
          <label><input type="radio" name="mode" value="someday" ${w.mode === 'someday' ? 'checked' : ''}/><span>🌙 언젠가</span></label>
          <label><input type="radio" name="mode" value="dates" ${w.mode === 'dates' ? 'checked' : ''}/><span>📅 날짜</span></label>
        </div>
        <div class="row2" data-when="someday" ${w.mode === 'someday' ? '' : 'hidden'}>
          <label class="field-label">며칠 코스<select class="input" name="days">${Array.from({ length: 14 }, (_, i) => `<option value="${i + 1}" ${w.mode === 'someday' && w.days === i + 1 ? 'selected' : ''}>${nightsLabel(i + 1)}</option>`).join('')}</select></label>
          <label class="field-label">언제쯤<input class="input" name="season" maxlength="20" value="${esc(w.mode === 'someday' ? (w.season ?? '') : '')}" placeholder="예: 벚꽃 필 때" /></label>
        </div>
        <div class="row2" data-when="dates" ${w.mode === 'dates' ? '' : 'hidden'}>
          <label class="field-label">가는 날<input class="input" type="date" name="start" value="${w.mode === 'dates' ? w.start : ''}" /></label>
          <label class="field-label">오는 날<input class="input" type="date" name="end" value="${w.mode === 'dates' ? w.end : ''}" /></label>
        </div>
        <label class="field-label">소개<textarea class="input" name="memo" rows="2" maxlength="300">${esc(plan.memo)}</textarea></label>
        <p class="hint">일수를 줄이면 넘치는 날의 일정은 '날짜 미정'으로 옮겨져요.</p>
        <div class="modal-actions"><button class="btn primary" type="submit">저장</button></div>
      </form>`,
    setup(el, close) {
      const pf = placeField(el.querySelector('[data-place]')!, { value: plan.place });
      const form = el.querySelector('form')!;
      form.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement;
        if (t.name === 'mode') el.querySelectorAll<HTMLElement>('[data-when]').forEach((b) => (b.hidden = b.dataset.when !== t.value));
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = (k: string) => (form.elements.namedItem(k) as HTMLInputElement).value.trim();
        const mode = (form.querySelector<HTMLInputElement>('input[name=mode]:checked')!.value) as When['mode'];
        let when: When;
        if (mode === 'dates') {
          if (!f('start')) return toast('가는 날을 골라 주세요', 'err');
          when = { mode, start: f('start'), end: f('end') && f('end') >= f('start') ? f('end') : f('start') };
        } else when = { mode, days: Number(f('days')), season: f('season') || undefined };
        const patch: Partial<PlanInput> = { title: f('title') || plan.title, emoji: f('emoji') || plan.emoji, scope: f('scope') as Scope, place: pf.get(), memo: f('memo'), when };
        try {
          await busy(form.querySelector('button[type=submit]'), () => store.updatePlan(plan.id, token, patch));
          toast('저장했어요', 'ok');
          close();
        } catch (e2) {
          toast(e2 instanceof StoreError ? e2.message : '저장하지 못했어요', 'err');
        }
      });
      return () => pf.destroy();
    },
  });
}

export function passwordModal(plan: Plan, token: string) {
  modal({
    title: '주인 비밀번호 바꾸기',
    body: `
      <form class="stack" novalidate>
        <label class="field-label">지금 비밀번호<input class="input" type="password" name="cur" autocomplete="current-password" /></label>
        <label class="field-label">새 비밀번호<input class="input" type="password" name="next" autocomplete="new-password" /></label>
        <label class="field-label">한 번 더<input class="input" type="password" name="next2" autocomplete="new-password" /></label>
        <div class="meter" data-meter><i></i><span></span></div>
        <p class="hint">바꾸면 다른 기기에 남아 있던 주인 인증은 모두 풀려요.</p>
        <p class="form-error" role="alert" hidden></p>
        <div class="modal-actions"><button class="btn primary" type="submit">바꾸기</button></div>
      </form>`,
    setup(el, close) {
      const form = el.querySelector('form')!;
      const err = el.querySelector<HTMLElement>('.form-error')!;
      const v = (k: string) => (form.elements.namedItem(k) as HTMLInputElement).value;
      form.addEventListener('input', () => {
        const m = el.querySelector<HTMLElement>('[data-meter]')!;
        m.dataset.s = v('next') ? String(strength(v('next'))) : '-1';
        m.querySelector('span')!.textContent = v('next') ? ['너무 짧아요', '쓸 수는 있어요', '괜찮아요', '튼튼해요'][strength(v('next'))] : '';
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fail = (m: string) => ((err.hidden = false), (err.textContent = m));
        if (v('next').length < 4) return fail('새 비밀번호는 4자 이상이어야 해요');
        if (v('next') !== v('next2')) return fail('새 비밀번호 두 개가 서로 달라요');
        try {
          await busy(form.querySelector('button[type=submit]'), () => store.changePassword(plan.id, token, v('cur'), v('next')));
          toast('비밀번호를 바꿨어요', 'ok');
          close();
        } catch (e2) {
          fail(e2 instanceof StoreError ? e2.message : '바꾸지 못했어요');
        }
      });
    },
  });
}
