import type { Place, PlanInput, Scope, When } from '../types';
import { store, StoreError } from '../lib/store';
import { me, saveOwnerToken, setMyName } from '../lib/identity';
import { strength } from '../lib/crypto';
import { esc, nightsLabel, SCOPES, today, toISO, whenLabel } from '../lib/util';
import { placeField } from '../ui/place-field';
import { stamp } from '../ui/art';
import { busy, toast } from '../ui/ui';
import { navigate } from '../router';

const EMOJIS = ['🧳', '🥐', '🌊', '⛰️', '🏙️', '🌸', '🍁', '❄️', '🍜', '☕', '🚲', '🏕️', '🎡', '🗼'];
const SEASONS = ['봄', '여름', '가을', '겨울', '벚꽃 필 때', '단풍 들 때', '아무 때나'];
const STRENGTH = ['너무 짧아요 (4자 이상)', '쓸 수는 있어요', '괜찮아요', '튼튼해요'];

export default function newPlan(root: HTMLElement) {
  const st = {
    scope: 'local' as Scope,
    place: null as Place | null,
    emoji: '🧳',
    mode: 'someday' as When['mode'],
    days: 1,
    season: '',
    start: today(),
    end: today(),
    hue: Math.floor(Math.random() * 360),
    previewId: Math.random().toString(36).slice(2),
  };

  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">새 계획</p>
      <h1>어디로, 언제쯤 가 볼까요?</h1>
    </section>
    <form class="new-grid" novalidate>
      <div class="new-form">
        <fieldset class="step">
          <legend><span class="step-no">1</span>어디로</legend>
          <div class="scope-cards">
            ${(Object.keys(SCOPES) as Scope[])
              .map(
                (s) => `<label class="scope-card">
                  <input type="radio" name="scope" value="${s}" ${s === st.scope ? 'checked' : ''} />
                  <span class="sc-ico">${SCOPES[s].icon}</span><b>${SCOPES[s].label}</b><small>${SCOPES[s].hint}</small>
                </label>`
              )
              .join('')}
          </div>
          <label class="field-label">중심이 되는 곳 <small>(선택 · 동네 이름, 도시, 역 이름 등)</small></label>
          <div data-place></div>
        </fieldset>

        <fieldset class="step">
          <legend><span class="step-no">2</span>언제</legend>
          <div class="seg" role="radiogroup">
            <label><input type="radio" name="mode" value="someday" checked /><span>🌙 언젠가</span></label>
            <label><input type="radio" name="mode" value="dates" /><span>📅 날짜 정했어요</span></label>
          </div>
          <div data-when="someday" class="when-box">
            <div class="stepper">
              <button type="button" class="icon-btn" data-days="-1" aria-label="하루 줄이기">−</button>
              <output data-days-out>${nightsLabel(1)}</output>
              <button type="button" class="icon-btn" data-days="1" aria-label="하루 늘리기">＋</button>
            </div>
            <div class="chips wrap">${SEASONS.map((s) => `<button type="button" class="chip" data-season="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          </div>
          <div data-when="dates" class="when-box" hidden>
            <label class="inline-field">가는 날 <input type="date" name="start" value="${st.start}" /></label>
            <label class="inline-field">오는 날 <input type="date" name="end" value="${st.end}" /></label>
          </div>
        </fieldset>

        <fieldset class="step">
          <legend><span class="step-no">3</span>이름 붙이기</legend>
          <div class="emoji-row">${EMOJIS.map((e) => `<button type="button" class="emoji-btn" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
          <input class="input lg" name="title" maxlength="40" placeholder="예: 망원동 한 바퀴" required />
          <textarea class="input" name="memo" rows="2" maxlength="300" placeholder="한 줄 소개 (선택) — 누구랑, 왜 가고 싶은지"></textarea>
        </fieldset>

        <fieldset class="step owner-step">
          <legend><span class="step-no">4</span>주인 정하기</legend>
          <div class="callout">
            <b>🔑 비밀번호를 아는 사람이 이 계획의 주인이에요.</b>
            <ul>
              <li>링크를 받은 사람은 누구나 일정을 <b>제안</b>할 수 있어요.</li>
              <li>제안 <b>수락·거절</b>, 직접 수정, 계획 삭제는 이 비밀번호로만 할 수 있어요.</li>
              <li>다른 기기나 브라우저에서도 비밀번호만 넣으면 주인으로 돌아와요.</li>
              <li><b>비밀번호는 되찾을 방법이 없어요.</b> 꼭 기억하거나 적어 두세요.</li>
            </ul>
          </div>
          <label class="field-label">주인 이름 <small>(친구들에게 보여요)</small></label>
          <input class="input" name="ownerName" maxlength="20" placeholder="예: 문" value="${esc(me()?.name ?? '')}" />
          <div class="pw-grid">
            <label class="field-label">비밀번호
              <span class="pw-wrap"><input class="input" type="password" name="pw" minlength="4" autocomplete="new-password" /><button type="button" class="link-btn" data-reveal>보기</button></span>
            </label>
            <label class="field-label">한 번 더
              <input class="input" type="password" name="pw2" autocomplete="new-password" />
            </label>
          </div>
          <div class="meter" data-meter><i></i><span></span></div>
          <label class="check"><input type="checkbox" name="remember" checked /> 이 브라우저에서 주인으로 기억하기 <small>(공용 PC라면 끄세요)</small></label>
        </fieldset>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn primary lg block" type="submit">계획 만들기</button>
      </div>

      <aside class="new-preview" aria-label="미리보기">
        <p class="eyebrow">미리보기</p>
        <div class="postcard big" data-preview></div>
      </aside>
    </form>`;

  const form = root.querySelector('form')!;
  const err = root.querySelector<HTMLElement>('.form-error')!;
  const pf = placeField(root.querySelector('[data-place]')!, {
    value: null,
    placeholder: '예: 망원동, 제주, 교토',
    onChange: (p) => {
      st.place = p;
      preview();
    },
  });

  const when = (): When =>
    st.mode === 'someday' ? { mode: 'someday', days: st.days, season: st.season || undefined } : { mode: 'dates', start: st.start, end: st.end < st.start ? st.start : st.end };

  const suggest = () => {
    const where = st.place?.name;
    if (!where) return st.scope === 'local' ? '우리 동네 한 바퀴' : st.scope === 'domestic' ? '주말에 훌쩍' : '언젠가 그 도시';
    if (st.scope === 'local') return `${where} 한 바퀴`;
    return st.mode === 'someday' ? `${where} ${nightsLabel(st.days)}` : `${where} 여행`;
  };

  const preview = () => {
    const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim();
    (form.elements.namedItem('title') as HTMLInputElement).placeholder = `예: ${suggest()}`;
    root.querySelector('[data-preview]')!.innerHTML = `
      <div class="pc-stamp">${stamp({ id: st.previewId, hue: st.hue, scope: st.scope, emoji: st.emoji })}<span class="pc-emoji">${st.emoji}</span></div>
      <div class="pc-body">
        <div class="pc-meta"><span class="tag">${SCOPES[st.scope].icon} ${SCOPES[st.scope].label}</span><span class="tag owner">👑 주인</span></div>
        <h3>${esc(title || suggest())}</h3>
        <p class="pc-when">${esc(whenLabel(when()))}</p>
        <p class="pc-foot">${st.place ? `📍 ${esc(st.place.name)}` : '어디든 좋아요'}</p>
      </div>`;
    root.querySelectorAll<HTMLElement>('[data-emoji]').forEach((b) => b.classList.toggle('is-on', b.dataset.emoji === st.emoji));
    root.querySelectorAll<HTMLElement>('[data-season]').forEach((b) => b.classList.toggle('is-on', b.dataset.season === st.season));
    root.querySelector('[data-days-out]')!.textContent = nightsLabel(st.days);
  };

  const meter = () => {
    const pw = (form.elements.namedItem('pw') as HTMLInputElement).value;
    const s = strength(pw);
    const m = root.querySelector<HTMLElement>('[data-meter]')!;
    m.dataset.s = String(pw ? s : -1);
    m.querySelector('span')!.textContent = pw ? STRENGTH[s] : '4자 이상. 친구들과 같이 쓰는 비밀번호는 피하세요';
  };

  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'scope') st.scope = t.value as Scope;
    if (t.name === 'mode') {
      st.mode = t.value as When['mode'];
      root.querySelectorAll<HTMLElement>('[data-when]').forEach((b) => (b.hidden = b.dataset.when !== st.mode));
    }
    if (t.name === 'start') {
      st.start = t.value || today();
      if (st.end < st.start) {
        st.end = st.start;
        (form.elements.namedItem('end') as HTMLInputElement).value = st.end;
      }
    }
    if (t.name === 'end') st.end = t.value || st.start;
    if (t.name === 'pw') meter();
    preview();
  });

  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const d = t.closest<HTMLElement>('[data-days]');
    if (d) st.days = Math.min(14, Math.max(1, st.days + Number(d.dataset.days)));
    const em = t.closest<HTMLElement>('[data-emoji]');
    if (em) st.emoji = em.dataset.emoji!;
    const se = t.closest<HTMLElement>('[data-season]');
    if (se) st.season = st.season === se.dataset.season ? '' : se.dataset.season!;
    if (t.closest('[data-reveal]')) {
      const pw = form.elements.namedItem('pw') as HTMLInputElement;
      pw.type = pw.type === 'password' ? 'text' : 'password';
      t.textContent = pw.type === 'password' ? '보기' : '숨기기';
    }
    if (d || em || se) preview();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value.trim();
    const pw = (form.elements.namedItem('pw') as HTMLInputElement).value;
    const fail = (msg: string, field?: string) => {
      err.hidden = false;
      err.textContent = msg;
      if (field) (form.elements.namedItem(field) as HTMLElement).focus();
    };
    if (!v('ownerName')) return fail('주인 이름을 적어 주세요', 'ownerName');
    if (pw.length < 4) return fail('비밀번호는 4자 이상이어야 해요', 'pw');
    if (pw !== (form.elements.namedItem('pw2') as HTMLInputElement).value) return fail('비밀번호 두 개가 서로 달라요', 'pw2');
    if (st.mode === 'dates' && st.start < toISO(new Date(Date.now() - 864e5 * 365 * 5))) return fail('날짜를 확인해 주세요', 'start');
    err.hidden = true;

    const input: PlanInput = {
      title: v('title') || suggest(),
      emoji: st.emoji,
      scope: st.scope,
      place: st.place,
      when: when(),
      memo: v('memo'),
      ownerName: v('ownerName'),
    };
    try {
      const { bundle, token } = await busy(form.querySelector('button[type=submit]'), () => store.create(input, pw));
      saveOwnerToken(bundle.plan.id, token, (form.elements.namedItem('remember') as HTMLInputElement).checked);
      if (!me()) setMyName(input.ownerName);
      navigate(`/p/${bundle.plan.id}?welcome=1`);
    } catch (e2) {
      fail(e2 instanceof StoreError ? e2.message : '만들지 못했어요. 다시 시도해 주세요');
      if (!(e2 instanceof StoreError)) toast(String(e2), 'err');
    }
  });

  preview();
  meter();
  return () => pf.destroy();
}
