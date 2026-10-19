// 계획 쓰기 · 고치기 (moon.log pages/plan-edit.js에서 시작해 섬데트 흐름으로 다시 짰다)
//
// 흐름
//  01 어디로   여행 종류 → 목적지 검색(자동완성) → 이름. 나라·공항 코드는 자동으로 채우고 접어 둔다
//  02 언제     "날짜 정했어요" → 범위 달력(기간 자동) / "아직 몰라요" → 가기 좋은 달 + 며칠짜리
//  03 예산     할 일 목록처럼 항목을 더하고 지운다
//  04 가 볼 곳 (새로 쓸 때만) 자동완성 검색 + 지도에 찍기
//  05 준비할 것
//  06 소개     한 줄 소개(탑승권·계획 첫머리에 크게) + 더 하고 싶은 이야기 + 태그
//  07 공개·주인
import { esc, fmtWon, reducedMotion, isoDate, addDaysIso, daysBetween, seoulToday } from './util.js';
import { scene } from './art.js';
import { STATUS, flagOf, nights } from './plans-lib.js';
import { weatherAt } from './live.js';
import { ticketHTML } from './ticket.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from './leaflet.js';
import { toast } from './toast.js';
import { reverse, nameOf, enOf, geoPending, geoIdle, CURRENCY, SCENES, SCENE_KO, TIMES } from './geo.js';
import { iataFor } from './airports.js';

const SCOPES = {
  abroad: { icon: '✈️', ko: '해외', hint: '여권 챙겨서' },
  domestic: { icon: '🚄', ko: '국내', hint: '주말에 훌쩍' },
  local: { icon: '🏘️', ko: '동네', hint: '걸어서, 버스 몇 정거장' },
};
const BUDGET_SUGGEST = {
  abroad: ['항공', '숙소', '식비', '교통', '입장료', '쇼핑', '통신', '보험'],
  domestic: ['교통', '숙소', '식비', '입장료', '쇼핑', '렌터카'],
  local: ['식비', '카페', '교통', '입장료', '쇼핑'],
};
const BUDGET_ICON = [
  [/항공|비행|flight/i, '✈️'],
  [/숙소|호텔|료칸|게스트|에어비앤비|산장|캠핑/, '🛏️'],
  [/식|밥|맛집|먹/, '🍜'],
  [/카페|커피/, '☕'],
  [/교통|기차|버스|지하철|택시|페리|패스/, '🚆'],
  [/렌터카|주유|차/, '🚗'],
  [/입장|티켓|투어|관람/, '🎟️'],
  [/쇼핑|기념품|선물/, '🛍️'],
  [/통신|esim|유심|와이파이/i, '📶'],
  [/보험/, '🛡️'],
  [/비자/, '🛂'],
  [/액티비티|체험|스키|다이빙|서핑/, '🏄'],
];
const iconOf = (name) => BUDGET_ICON.find(([re]) => re.test(name))?.[1] || '✦';
const CHECK_SUGGEST = {
  abroad: ['항공권 예약', '숙소 예약', '여권 유효기간 확인', '여행자 보험', '환전', 'eSIM', '비자 확인', '현지 교통패스'],
  domestic: ['교통편 예약', '숙소 예약', '맛집 예약', '날씨 확인', '보조배터리'],
  local: ['동선 짜기', '맛집 예약', '돗자리', '보조배터리', '편한 신발', '날씨 확인'],
};
const QUICK_DAYS = [1, 2, 3, 4, 5, 7, 10];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export const blankPlan = () => ({
  title: '',
  place: '',
  placeEn: '',
  country: '',
  countryCode: '',
  iata: '',
  scope: 'abroad',
  status: 'dream',
  priority: 1,
  target: null,
  days: 4,
  months: [],
  tz: 'Asia/Seoul',
  currency: 'KRW',
  cover: { scene: 'mountain', time: 'dusk' },
  why: '',
  tags: [],
  intro: '',
  coords: null,
  stops: [],
  travelers: 1,
  budgetItems: [],
  budget: {},
  checklist: [],
  ownerName: '',
  visibility: 'link',
});

const lbl = (text, hint = '') => `<span class="lbl-text">${text}${hint ? ` <em>${hint}</em>` : ''}</span>`;

export function renderComposer({ mode = 'new', copiedCount = 0 }) {
  const editing = mode === 'edit';
  const noPlaces = mode !== 'new';
  const n = (i) => String(noPlaces && i >= 5 ? i - 1 : i).padStart(2, '0');
  return `
<section class="container page-head composer-head">
  <a href="/" class="back-link link-u">← 떠날 곳</a>
  <p class="eyebrow" data-reveal>${editing ? 'Edit plan · 계획 고치기' : mode === 'copy' ? 'Copy plan · 이 계획으로 시작하기' : 'New plan · 계획 쓰기'}</p>
  <h1 class="display" data-split>Plan a <em>trip</em></h1>
  <p class="lede" data-reveal>${
    editing
      ? '주인만 고칠 수 있어요. 가 볼 곳과 일정은 계획 화면에서 바로 고쳐요.'
      : '다 쓰면 링크가 생겨요. 링크를 받은 친구는 일정을 <b>제안</b>하고, 비밀번호를 아는 <b>주인</b>이 수락해요.'
  }</p>
</section>

<section class="container composer">
  <form class="composer-form" novalidate autocomplete="off">
    <fieldset class="cstep" data-step="where">
      <legend><span class="step-no mono">01</span>어디로?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="choice-cards three" role="radiogroup" aria-label="여행 종류">
        ${Object.entries(SCOPES)
          .map(([k, s]) => `<button type="button" role="radio" class="choice" data-scope="${k}"><span class="choice-ico">${s.icon}</span><b>${s.ko}</b><small>${s.hint}</small></button>`)
          .join('')}
      </div>
      <div class="field-block">
        ${lbl('목적지', '도시·동네·지역 이름')}
        <div class="ac" data-ac="dest">
          <label class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input name="q" placeholder="예: 삿포로, Lisbon, 망원동" aria-label="목적지 검색" role="combobox" aria-expanded="false" aria-autocomplete="list"></label>
          <ul class="ac-list" role="listbox" hidden></ul>
        </div>
        <div class="dest-card" hidden></div>
      </div>
      <label class="field-block">${lbl('여행 이름', '탑승권에 크게 찍혀요')}<input class="inp" name="title" placeholder="삿포로, 눈이 소리를 먹는 도시" maxlength="60"></label>
      <details class="adv">
        <summary><span>탑승권에 찍히는 정보</span><span class="adv-sum mono"></span></summary>
        <div class="grid2">
          <label class="field-block">${lbl('도시·동네', '한글')}<input class="inp" name="place" placeholder="삿포로" maxlength="40"></label>
          <label class="field-block">${lbl('영문 이름', '전광판')}<input class="inp" name="placeEn" placeholder="Sapporo" maxlength="40"></label>
          <label class="field-block">${lbl('나라')}<input class="inp" name="country" placeholder="일본" maxlength="40"></label>
          <label class="field-block">${lbl('국가 코드', '<span class="flag-preview"></span>')}<input class="inp mono" name="countryCode" maxlength="2" placeholder="JP"></label>
          <label class="field-block">${lbl('<span class="iata-label">공항 코드</span>')}<input class="inp mono" name="iata" maxlength="3" placeholder="CTS"></label>
        </div>
      </details>
      <div class="field-block">
        ${lbl('탑승권 그림')}
        <div class="scene-grid" role="radiogroup" aria-label="풍경"></div>
        <div class="chips time-chips" role="radiogroup" aria-label="시간대">${Object.entries(TIMES).map(([k, v]) => `<button type="button" class="chip" role="radio" data-time="${k}">${v}</button>`).join('')}</div>
      </div>
    </fieldset>

    <fieldset class="cstep" data-step="when">
      <legend><span class="step-no mono">02</span>언제?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="choice-cards two" role="radiogroup" aria-label="날짜">
        <button type="button" role="radio" class="choice" data-when="date"><span class="choice-ico">📅</span><b>날짜를 정했어요</b><small>달력에서 가는 날과 오는 날을 골라요</small></button>
        <button type="button" role="radio" class="choice" data-when="someday"><span class="choice-ico">🌙</span><b>아직 몰라요 · 언젠가</b><small>가기 좋은 달과 며칠짜리인지만 정해요</small></button>
      </div>
      <div class="when-pane" data-pane="date" hidden>
        <div class="cal" aria-label="여행 날짜 고르기"></div>
        <div class="cal-sum"></div>
        <div class="field-block">
          ${lbl('어디까지 준비했나요?')}
          <div class="segmented status-seg" role="radiogroup" aria-label="준비 상태">
            ${['planning', 'preparing', 'booked', ...(editing ? ['done'] : [])].map((k) => `<button type="button" role="radio" data-status="${k}">${STATUS[k].ko}</button>`).join('')}
            <span class="seg-indicator"></span>
          </div>
        </div>
      </div>
      <div class="when-pane" data-pane="someday" hidden>
        <div class="field-block">
          ${lbl('가기 좋은 달', '끌어서 여러 달 선택')}
          <div class="month-pick" role="group" aria-label="가기 좋은 달">${Array.from({ length: 12 }, (_, i) => `<button type="button" data-month="${i + 1}" aria-pressed="false">${i + 1}<small>월</small></button>`).join('')}</div>
        </div>
        <div class="field-block">
          ${lbl('며칠짜리 여행?')}
          <div class="days-pick">
            <div class="stepper"><button type="button" data-days="-1" aria-label="하루 줄이기">−</button><output name="daysOut">3박 4일</output><button type="button" data-days="1" aria-label="하루 늘리기">+</button></div>
            <div class="chips quick-days">${QUICK_DAYS.map((d) => `<button type="button" class="chip" data-quick="${d}">${nights(d)}</button>`).join('')}</div>
          </div>
        </div>
      </div>
    </fieldset>

    <fieldset class="cstep" data-step="how">
      <legend><span class="step-no mono">03</span>누구랑 · 얼마나?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="field-block">
        ${lbl('몇 명이서 가요?', '예산을 1인당·다 같이로 나눠 계산해요')}
        <div class="days-pick ppl-pick">
          <div class="stepper"><button type="button" data-ppl="-1" aria-label="한 명 줄이기">−</button><output name="pplOut">1명</output><button type="button" data-ppl="1" aria-label="한 명 늘리기">+</button></div>
          <div class="chips quick-ppl">${[1, 2, 3, 4, 6].map((n) => `<button type="button" class="chip" data-qppl="${n}">${n === 1 ? '혼자' : `${n}명`}</button>`).join('')}</div>
        </div>
      </div>
      <div class="budget">
        <div class="budget-head">
          <div><span class="eyebrow">합계 · 1인</span><b class="h-serif num" data-total>₩0</b></div>
          <div class="budget-group"><span class="eyebrow" data-group-label>전체</span><b class="num" data-group>₩0</b></div>
        </div>
        <p class="budget-per faint"></p>
        <div class="budget-bar" aria-hidden="true"></div>
        <ul class="budget-list" role="list"></ul>
        <div class="budget-add">
          <span class="ba-ico" aria-hidden="true">+</span>
          <input class="ba-name" name="bName" placeholder="항목 추가 (예: 항공)" maxlength="20" aria-label="새 예산 항목 이름">
          <button type="button" class="b-per" data-baper aria-pressed="false">1인당</button>
          <span class="money"><input class="ba-amt num" name="bAmt" inputmode="numeric" placeholder="0" aria-label="새 예산 금액"><span>원</span></span>
          <button type="button" class="btn btn--sm btn--solid" data-badd>추가</button>
        </div>
        <div class="chips budget-suggest"></div>
      </div>
    </fieldset>

    ${
      noPlaces
        ? mode === 'copy'
          ? `<p class="copy-note">원래 계획의 가 볼 곳 <b>${copiedCount}곳</b>과 일정은 그대로 복사돼요. 만든 뒤 계획 화면에서 고치면 돼요.</p>`
          : ''
        : `<fieldset class="cstep" data-step="places">
      <legend><span class="step-no mono">04</span>어디를 볼까?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="ac" data-ac="stop">
        <label class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input name="sq" placeholder="가 볼 곳 찾기 (예: 오타루 운하, 망원시장)" aria-label="장소 검색" role="combobox" aria-expanded="false" aria-autocomplete="list"></label>
        <ul class="ac-list" role="listbox" hidden></ul>
      </div>
      <div class="composer-map-wrap"><div class="composer-map" aria-label="지도를 눌러 장소 추가"></div><span class="map-hint">검색에 안 나오면 지도를 눌러 추가하세요</span></div>
      <ol class="stop-list" role="list"></ol>
      <p class="faint step-note">날짜별 일정과 시간은 만든 뒤 계획 화면에서 정해요. 지금 넣은 곳은 날짜에 고르게 나눠 둘게요.</p>
    </fieldset>`
    }

    <fieldset class="cstep" data-step="prep" id="prep">
      <legend><span class="step-no mono">${n(5)}</span>준비할 것<span class="step-done" aria-hidden="true">✓</span></legend>
      <ul class="todo-list check-edit" role="list"></ul>
      <div class="todo-add">
        <span class="ba-ico" aria-hidden="true">+</span>
        <input name="newCheck" placeholder="준비할 것 추가하고 Enter" maxlength="80" aria-label="준비할 것 추가">
      </div>
      <div class="chips suggest"></div>
    </fieldset>

    <fieldset class="cstep" data-step="why">
      <legend><span class="step-no mono">${n(6)}</span>소개<span class="step-done" aria-hidden="true">✓</span></legend>
      <label class="field-block">${lbl('한 줄 소개', '계획 첫머리에 큰 글씨로 나와요')}<input class="inp" name="why" placeholder="눈 쌓인 밤길을 걷다가 노천온천에 들어가고 싶다." maxlength="200"></label>
      <label class="field-block">${lbl('더 하고 싶은 이야기', '선택 · **굵게**, - 목록')}<textarea class="textarea" name="intro" rows="5" placeholder="누구랑, 왜, 어떤 여행이 되면 좋을지." maxlength="6000"></textarea></label>
      <div class="field-block">
        ${lbl('태그', 'Enter로 추가')}
        <div class="tag-input"><span class="tag-chips"></span><input name="tagIn" placeholder="겨울, 온천…" maxlength="20" aria-label="태그 추가"></div>
      </div>
    </fieldset>

    <fieldset class="cstep" data-step="share">
      <legend><span class="step-no mono">${n(7)}</span>${editing ? '공개 범위' : '공개 · 주인 정하기'}<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="choice-cards two vis-pick" role="radiogroup" aria-label="공개 범위">
        <button type="button" role="radio" class="choice" data-vis="link"><span class="choice-ico">🔗</span><b>링크 공개</b><small>링크를 받은 친구만 볼 수 있어요. 검색에는 안 나와요.</small></button>
        <button type="button" role="radio" class="choice" data-vis="public"><span class="choice-ico">🌍</span><b>전체 공개</b><small>누구나 볼 수 있고 Google·네이버 검색에도 나와요.</small></button>
      </div>
      <p class="faint step-note">어느 쪽이든 누구나 일정을 <b>제안</b>할 수 있지만, 반영은 <b>주인만</b> 할 수 있어요.</p>
      ${
        editing
          ? ''
          : `<div class="owner-box">
        <p class="owner-lede"><b>🔑 비밀번호를 아는 사람이 이 계획의 주인이에요.</b> 제안 수락·거절, 직접 수정, 삭제를 할 수 있어요. 다른 기기에서도 비밀번호만 넣으면 주인으로 돌아와요. <b>잊으면 되찾을 수 없어요.</b></p>
        <label class="field-block half">${lbl('주인 이름', '친구들에게 보여요')}<input class="inp" name="ownerName" maxlength="20" placeholder="예: 문" autocomplete="nickname"></label>
        <div class="grid2">
          <label class="field-block">${lbl('비밀번호', '4자 이상')}<input class="inp" type="password" name="pw" autocomplete="new-password"></label>
          <label class="field-block">${lbl('비밀번호 확인')}<input class="inp" type="password" name="pw2" autocomplete="new-password"></label>
        </div>
        <div class="pw-meter" data-s="-1"><i></i><span>친구들과 같이 쓰는 비밀번호는 피하세요</span></div>
        <label class="switch"><input type="checkbox" name="remember" checked><span class="switch-ui" aria-hidden="true"></span>이 브라우저에서 주인으로 기억하기 <span class="faint">(공용 PC라면 끄세요)</span></label>
      </div>`
      }
    </fieldset>
  </form>

  <aside class="composer-side">
    <div class="composer-sticky">
      <p class="eyebrow">Live preview</p>
      <div class="preview-ticket"></div>
      <ol class="step-progress" role="list" aria-label="작성 진행"></ol>
      <div class="composer-actions">
        <button type="button" class="btn btn--solid" data-save>${editing ? '고친 내용 저장' : '계획 만들기'}</button>
        ${editing ? '' : '<button type="button" class="link-u faint" data-clear>새로 쓰기</button>'}
      </div>
    </div>
  </aside>
</section>
<div class="composer-mbar"><span class="mbar-ticket mono"></span><button type="button" class="btn btn--solid btn--sm" data-save>${editing ? '저장' : '계획 만들기'}</button></div>`;
}

const strength = (pw) => {
  if (pw.length < 4) return 0;
  let kinds = 0;
  if (/[a-z]/.test(pw)) kinds++;
  if (/[A-Z]/.test(pw)) kinds++;
  if (/\d/.test(pw)) kinds++;
  if (/[^a-zA-Z\d]/.test(pw)) kinds++;
  if (pw.length >= 10 && kinds >= 2) return 3;
  if (pw.length >= 7 && kinds >= 2) return 2;
  return 1;
};
const STRENGTH = ['너무 짧아요 (4자 이상)', '쓸 수는 있어요', '괜찮아요', '튼튼해요'];

/** 380000 → "38만 원" */
const manwon = (n) => {
  if (!n) return '';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  if (!man) return `${n.toLocaleString('ko-KR')}원`;
  return `${man.toLocaleString('ko-KR')}만${rest ? ` ${rest.toLocaleString('ko-KR')}` : ''} 원`;
};
const parseMoney = (s) => Math.min(1e10, Number(String(s).replace(/[^\d]/g, '')) || 0);
const fmtMoney = (n) => (n ? n.toLocaleString('ko-KR') : '');

/** 장소 검색 (서버가 카카오·Photon·OSM을 합쳐 준다) */
async function searchPlaces(q, { mode, near, signal }) {
  const u = new URLSearchParams({ q, mode });
  if (near) {
    u.set('lat', String(near[0]));
    u.set('lng', String(near[1]));
  }
  const r = await fetch(`/api/places?${u}`, { signal });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).hits;
}

/** 자동완성: 입력하는 동안 결과를 띄우고 ↑↓ Enter로 고른다 */
function autocomplete(box, { mode, near, onPick }) {
  const input = box.querySelector('input');
  const list = box.querySelector('.ac-list');
  let hits = [];
  let at = -1;
  let ctrl;
  let t;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const paint = (msg) => {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (msg) return void (list.innerHTML = `<li class="ac-msg">${msg}</li>`);
    list.innerHTML = hits
      .map(
        (h, i) =>
          `<li role="option" aria-selected="${i === at}" data-i="${i}"><span class="ac-ico">${h.kind === 'region' ? '🗺️' : '📍'}</span><span class="ac-txt"><b>${esc(h.name)}</b>${h.en && h.en !== h.name ? ` <span class="serif faint">${esc(h.en)}</span>` : ''}<small>${esc([h.address, h.countryCode && h.countryCode !== 'KR' ? flagOf(h.countryCode) : ''].filter(Boolean).join(' · '))}</small></span></li>`
      )
      .join('');
  };
  const run = async () => {
    const q = input.value.trim();
    ctrl?.abort();
    if (q.length < 2) return close();
    ctrl = new AbortController();
    paint('찾는 중…');
    try {
      hits = await searchPlaces(q, { mode, near: near?.(), signal: ctrl.signal });
      at = hits.length ? 0 : -1;
      if (hits.length) paint();
      else paint(mode === 'dest' ? '결과가 없어요. 영문으로도 찾아보세요.' : '결과가 없어요. 지도를 눌러 직접 추가할 수 있어요.');
    } catch (e) {
      if (e.name !== 'AbortError') paint('검색하지 못했어요. 잠시 뒤 다시 해 주세요.');
    }
  };
  const pick = (i) => {
    const h = hits[i];
    if (!h) return;
    onPick(h);
    input.value = '';
    hits = [];
    close();
  };
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(run, 280);
  });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      e.preventDefault();
      at = (at + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits.length) pick(Math.max(0, at));
      else run();
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) pick(Number(li.dataset.i));
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('focus', () => hits.length && paint());
}

/** 범위 달력: 가는 날 → 오는 날. 넓으면 두 달, 좁으면 한 달.
    달이 바뀔 때만 다시 그리고, 고른 범위는 칸의 class만 바꾼다 (마우스를 움직일 때마다 다시 그리지 않게) */
function calendar(root, { start, end, onChange }) {
  const today = seoulToday();
  let view = (start || today).slice(0, 7);
  let a = start;
  let b = end;
  let hover = null;
  let two = null;
  const monthAdd = (ym, k) => {
    const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const month = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const len = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span></span>');
    for (let d = 1; d <= len; d++) {
      const iso = `${ym}-${String(d).padStart(2, '0')}`;
      const dow = (first + d - 1) % 7;
      const cls = [iso < today ? 'past' : '', iso === today ? 'today' : '', dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${cls}" data-d="${iso}" ${iso < today ? 'disabled' : ''} aria-label="${m}월 ${d}일"><span>${d}</span></button>`);
    }
    return `<div class="cal-month"><p class="cal-title"><b class="h-serif">${m}</b><span>월</span> <small class="mono">${y}</small></p>
      <div class="cal-dow">${DOW.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div></div>`;
  };
  const paint = () => {
    const endIso = b || (a && hover && hover > a ? hover : null);
    root.querySelectorAll('[data-d]').forEach((el) => {
      const iso = el.dataset.d;
      el.classList.toggle('start', iso === a);
      el.classList.toggle('end', !!endIso && iso === endIso && endIso !== a);
      el.classList.toggle('in', !!(a && endIso && iso > a && iso < endIso));
      el.classList.toggle('has-end', !!(a && endIso && iso === a && endIso !== a));
      el.setAttribute('aria-pressed', String(iso === a || iso === endIso));
    });
  };
  const draw = () => {
    two = root.clientWidth >= 620;
    root.innerHTML = `
      <div class="cal-nav"><button type="button" class="icon-btn" data-nav="-1" aria-label="이전 달">←</button><button type="button" class="link-u faint" data-nav="0">오늘</button><button type="button" class="icon-btn" data-nav="1" aria-label="다음 달">→</button></div>
      <div class="cal-months">${month(view)}${two ? month(monthAdd(view, 1)) : ''}</div>`;
    paint();
  };
  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const k = Number(nav.dataset.nav);
      view = k === 0 ? today.slice(0, 7) : monthAdd(view, k);
      return draw();
    }
    const d = e.target.closest('[data-d]')?.dataset.d;
    if (!d) return;
    // 처음 누르면 가는 날, 두 번째는 오는 날. 가는 날보다 앞을 누르면 가는 날을 다시 고른다
    if (!a || (a && b) || d < a) {
      a = d;
      b = null;
    } else b = d;
    hover = null;
    paint();
    onChange(a, b || a, !b);
  });
  root.addEventListener('pointerover', (e) => {
    const d = e.target.closest('[data-d]')?.dataset.d;
    if (a && !b && d && d !== hover) {
      hover = d;
      paint();
    }
  });
  const ro = new ResizeObserver(() => (root.clientWidth >= 620) !== two && draw());
  ro.observe(root);
  draw();
  return {
    set(s, en) {
      a = s;
      b = en;
      if (s) view = s.slice(0, 7);
      draw();
    },
    destroy: () => ro.disconnect(),
  };
}

const fmtDay = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
};

/**
 * @param {{ mode: 'new'|'edit'|'copy', initial?: object, onSubmit: (data, extra) => Promise<string|null> }} opts
 *   onSubmit은 실패하면 오류 메시지를, 성공하면 null을 돌려준다
 */
export function mountComposer(root, { mode = 'new', initial = null, onSubmit }) {
  const cleanups = [];
  const editing = mode === 'edit';
  const form = root.querySelector('.composer-form');
  const WIP = mode === 'new' ? 'sdt:composer:v2' : null;
  const wip = (() => {
    try {
      return WIP ? JSON.parse(localStorage.getItem(WIP) || 'null') : null;
    } catch {
      return null;
    }
  })();
  let d = { ...blankPlan(), ...(initial || wip || {}) };
  if (!d.ownerName) {
    try {
      d.ownerName = localStorage.getItem('sdt:name') || '';
    } catch {}
  }
  let whenMode = d.target ? 'date' : initial || wip ? 'someday' : null;
  // 예산: 순서를 지키려고 화면에서는 목록으로 다룬다
  // DB(jsonb)는 키 순서를 바꾸므로, 자주 쓰는 항목 순서대로 다시 세운다
  const ORDER = ['항공', '숙소', '식비', '카페', '교통', '렌터카', '입장료', '쇼핑', '통신', '보험'];
  const rank = (n) => (ORDER.indexOf(n) < 0 ? 99 : ORDER.indexOf(n));
  // 항목마다 1인당(person) / 다 같이(group). 숙소·렌터카는 보통 다 같이 낸다
  const GROUP_DEFAULT = /숙소|호텔|료칸|에어비앤비|게스트|렌터카|주유|캠핑/;
  const perOf = (name) => (GROUP_DEFAULT.test(name) ? 'group' : 'person');
  let budget = (Array.isArray(d.budgetItems) && d.budgetItems.length
    ? d.budgetItems.map((b) => ({ name: b.name, amount: Number(b.amount) || 0, per: b.per === 'group' ? 'group' : 'person' }))
    : Object.entries(d.budget || {})
        .filter(([, v]) => Number(v) > 0)
        .map(([name, amount]) => ({ name, amount: Number(amount), per: 'person' }))
        .sort((x, y) => rank(x.name) - rank(y.name))
  );
  d.travelers = Math.max(1, Number(d.travelers) || 1);
  let newPer = 'person';
  const ppl = () => Math.max(1, d.travelers);
  /** 1인 몫 */
  const share = (b) => (b.per === 'group' ? Math.round(b.amount / ppl()) : b.amount);
  const perTotal = () => budget.reduce((s, b) => s + share(b), 0);
  const groupTotalOf = () => budget.reduce((s, b) => s + (b.per === 'group' ? b.amount : b.amount * ppl()), 0);
  const saveWip = () => {
    if (!WIP) return;
    try {
      syncBudget();
      localStorage.setItem(WIP, JSON.stringify(d));
    } catch {}
  };
  function syncBudget() {
    const items = budget.filter((b) => b.name.trim());
    d.budgetItems = items.map((b) => ({ name: b.name.trim(), amount: b.amount, per: b.per }));
    d.budget = {};
    for (const b of items) if (share(b) > 0) d.budget[b.name.trim()] = (d.budget[b.name.trim()] || 0) + share(b);
  }

  /* ---------- 폼 ↔ 상태 ---------- */
  const fill = () => {
    ['title', 'place', 'placeEn', 'country', 'countryCode', 'iata', 'why', 'intro'].forEach((k) => (form[k].value = d[k] || ''));
    if (form.ownerName) form.ownerName.value = d.ownerName || '';
  };
  const read = () => {
    ['title', 'place', 'placeEn', 'country', 'why', 'intro'].forEach((k) => (d[k] = form[k].value.trim()));
    d.countryCode = form.countryCode.value.trim().toUpperCase();
    d.iata = form.iata.value.trim().toUpperCase();
    if (CURRENCY[d.countryCode]) d.currency = CURRENCY[d.countryCode];
    if (form.ownerName) d.ownerName = form.ownerName.value.trim();
  };

  const preview = root.querySelector('.preview-ticket');
  const progress = root.querySelector('.step-progress');
  const STEPS = [
    ['where', '어디로', () => d.title && d.place],
    ['when', '언제', () => whenMode === 'date' ? !!d.target : whenMode === 'someday' && d.months.length > 0],
    ['how', '예산', () => budget.some((b) => b.amount > 0)],
    ...(mode !== 'new' ? [] : [['places', '가 볼 곳', () => d.stops.length > 0]]),
    ['prep', '준비', () => d.checklist.length > 0],
    ['why', '소개', () => !!d.why],
    ['share', editing ? '공개' : '주인', () => editing || (d.ownerName && form.pw.value.length >= 4 && form.pw.value === form.pw2.value)],
  ];
  let queued = false;
  const update = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncBudget();
      const p = { ...d, id: 'preview-' + mode, href: '', title: d.title || '새 여행 계획', place: d.place || '어딘가', months: d.months || [] };
      preview.innerHTML = ticketHTML(p, { preview: true });
      preview.querySelector('.ticket')?.classList.add('is-in');
      const total = perTotal();
      const group = groupTotalOf();
      root.querySelector('[data-total]').textContent = fmtWon(total);
      root.querySelector('[data-group]').textContent = fmtWon(group);
      root.querySelector('[data-group-label]').textContent = `전체 · ${ppl()}명`;
      root.querySelector('.budget-group').hidden = ppl() < 2;
      root.querySelector('.budget').classList.toggle('solo', ppl() < 2);
      form.pplOut.value = `${ppl()}명`;
      root.querySelectorAll('[data-qppl]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.qppl) === ppl())));
      root.querySelector('.budget-per').textContent = total
        ? `1인 ${manwon(total)}${d.days > 1 ? ` · 하루 약 ${manwon(Math.round(total / d.days / 1000) * 1000)}` : ''}${ppl() > 1 ? ` · ${ppl()}명 전체 ${manwon(group)}` : ''}`
        : '항목을 더하면 합계를 계산해요';
      root.querySelector('.flag-preview').textContent = d.countryCode.length === 2 ? flagOf(d.countryCode) : '';
      root.querySelector('.adv-sum').textContent = `SEL → ${d.iata || (d.scope === 'abroad' ? '???' : '—')}${d.countryCode ? ` · ${flagOf(d.countryCode)} ${d.country || d.countryCode}` : ''}`;
      form.daysOut.value = nights(d.days);
      root.querySelectorAll('[data-quick]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.quick) === d.days)));
      progress.innerHTML = STEPS.map(([k, label, ok]) => `<li class="${ok() ? 'done' : ''}"><a href="#" data-goto="${k}">${label}</a></li>`).join('');
      STEPS.forEach(([k, , ok]) => form.querySelector(`[data-step="${k}"]`)?.classList.toggle('done', !!ok()));
      root.querySelector('.mbar-ticket').textContent = `SEL → ${d.iata || d.placeEn?.slice(0, 3).toUpperCase() || '???'} · ${STEPS.filter(([, , ok]) => ok()).length}/${STEPS.length}`;
      saveWip();
    });
  };
  form.addEventListener('input', (e) => {
    if (['q', 'sq', 'newCheck', 'bName', 'bAmt', 'tagIn'].includes(e.target.name) || e.target.closest('.budget-list')) return;
    if (e.target.name === 'pw') {
      const m = root.querySelector('.pw-meter');
      const s = strength(form.pw.value);
      m.dataset.s = form.pw.value ? s : -1;
      m.querySelector('span').textContent = form.pw.value ? STRENGTH[s] : '친구들과 같이 쓰는 비밀번호는 피하세요';
    }
    read();
    update();
  });
  progress.addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    form.querySelector(`[data-step="${a.dataset.goto}"]`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- 01 여행 종류 · 목적지 ---------- */
  const SCOPE_IATA = { abroad: '공항 코드', domestic: '공항·역 코드 (선택)', local: '코드 (선택)' };
  const syncScope = () => {
    root.querySelectorAll('[data-scope]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.scope === d.scope)));
    root.querySelector('.iata-label').textContent = SCOPE_IATA[d.scope];
    drawSuggests();
  };
  root.querySelector('.choice-cards.three').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    d.scope = b.dataset.scope;
    syncScope();
    update();
  });
  const destCard = root.querySelector('.dest-card');
  const drawDest = () => {
    destCard.hidden = !d.place;
    if (!d.place) return;
    destCard.innerHTML = `<span class="dc-flag">${d.countryCode ? flagOf(d.countryCode) : SCOPES[d.scope].icon}</span>
      <span class="dc-txt"><b>${esc(d.place)}</b> ${d.placeEn ? `<span class="serif faint">${esc(d.placeEn)}</span>` : ''}<small>${esc([d.country, d.iata && `✈ ${d.iata}`, d.coords && `${d.coords[0].toFixed(2)}, ${d.coords[1].toFixed(2)}`].filter(Boolean).join(' · '))}</small></span>
      <button type="button" class="link-u faint" data-dest-clear>바꾸기</button>`;
  };
  destCard.addEventListener('click', (e) => {
    if (!e.target.closest('[data-dest-clear]')) return;
    d.place = '';
    d.placeEn = '';
    d.country = '';
    d.countryCode = '';
    d.iata = '';
    d.coords = null;
    fill();
    drawDest();
    update();
    form.q.focus();
  });
  const pickDest = (h) => {
    d.place = h.name;
    d.placeEn = h.en || (/^[\x00-\x7FÀ-ɏ\s'.-]+$/.test(h.name) ? h.name : d.placeEn) || '';
    d.country = h.country || '';
    d.countryCode = h.countryCode || '';
    d.coords = [+h.lat.toFixed(5), +h.lng.toFixed(5)];
    if (d.countryCode === 'KR' && d.scope === 'abroad') {
      d.scope = 'domestic';
      syncScope();
    } else if (d.countryCode && d.countryCode !== 'KR' && d.scope !== 'abroad') {
      d.scope = 'abroad';
      syncScope();
    }
    d.iata = iataFor(h.name, h.en, h.city, d.placeEn) || (d.scope === 'abroad' ? (d.placeEn || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() : '');
    if (CURRENCY[d.countryCode]) d.currency = CURRENCY[d.countryCode];
    if (!d.title) d.title = d.scope === 'local' ? `${h.name} 한 바퀴` : `${h.name}, `;
    fill();
    drawDest();
    drawMap(true);
    update();
    weatherAt(d.coords)
      .then((w) => {
        d.tz = w.timezone || d.tz;
        update();
      })
      .catch(() => {});
    form.title.focus();
    form.title.setSelectionRange(form.title.value.length, form.title.value.length);
  };
  autocomplete(root.querySelector('[data-ac="dest"]'), { mode: 'dest', onPick: pickDest });

  /* ---------- 풍경 ---------- */
  const sceneGrid = root.querySelector('.scene-grid');
  const drawScenes = () => {
    sceneGrid.innerHTML = SCENES.map(
      (s) => `<button type="button" role="radio" data-scene="${s}" aria-checked="${d.cover.scene === s}"><img src="${scene(s, d.cover.time, 'pick-' + s)}" alt=""><span>${SCENE_KO[s]}</span></button>`
    ).join('');
    root.querySelectorAll('[data-time]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.time === d.cover.time));
      b.setAttribute('aria-pressed', String(b.dataset.time === d.cover.time));
    });
  };
  sceneGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scene]');
    if (!b) return;
    d.cover = { ...d.cover, scene: b.dataset.scene };
    sceneGrid.querySelectorAll('[data-scene]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    update();
  });
  root.querySelector('.time-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-time]');
    if (!b) return;
    d.cover = { ...d.cover, time: b.dataset.time };
    drawScenes();
    update();
  });

  /* ---------- 02 언제 ---------- */
  const statusSeg = root.querySelector('.status-seg');
  const segSync = () => {
    const ind = statusSeg.querySelector('.seg-indicator');
    statusSeg.querySelectorAll('[data-status]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.status === d.status));
      b.setAttribute('aria-selected', String(b.dataset.status === d.status));
    });
    const on = statusSeg.querySelector(`[data-status="${d.status}"]`);
    ind.style.opacity = on ? '1' : '0';
    if (on) {
      ind.style.width = `${on.offsetWidth}px`;
      ind.style.transform = `translateX(${on.offsetLeft}px)`;
    }
  };
  statusSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    d.status = b.dataset.status;
    segSync();
    update();
  });
  const calSum = root.querySelector('.cal-sum');
  const drawCalSum = (picking) => {
    if (!d.target) return void (calSum.innerHTML = `<span class="faint">달력에서 <b>가는 날</b>을 눌러 주세요.</span>`);
    const end = addDaysIso(d.target, d.days - 1);
    calSum.innerHTML = `<span class="cs-day"><small class="mono">DEPART</small><b>${fmtDay(d.target)}</b></span><span class="cs-arrow" aria-hidden="true">→</span>
      <span class="cs-day"><small class="mono">RETURN</small><b>${picking ? '<span class="faint">오는 날을 눌러 주세요</span>' : fmtDay(end)}</b></span>
      <span class="cs-nights h-serif">${nights(d.days)}</span>`;
  };
  const cal = calendar(root.querySelector('.cal'), {
    start: d.target,
    end: d.target ? addDaysIso(d.target, d.days - 1) : null,
    onChange: (a, b, picking) => {
      d.target = a;
      d.days = Math.max(1, daysBetween(a, b));
      // 날짜가 있으면 "가기 좋은 달"은 그 달로
      const m1 = Number(a.slice(5, 7));
      const m2 = Number(b.slice(5, 7));
      d.months = m1 === m2 ? [m1] : [m1, m2];
      drawCalSum(picking);
      update();
    },
  });
  cleanups.push(cal.destroy);
  const setWhen = (m) => {
    whenMode = m;
    root.querySelectorAll('[data-when]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.when === m)));
    root.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== m));
    if (m === 'someday') {
      d.target = null;
      if (d.status !== 'done') d.status = 'dream';
      d.months = d.months.length > 2 || !initial ? d.months : d.months;
      syncMonths();
    } else {
      if (d.status === 'dream') d.status = 'planning';
      requestAnimationFrame(segSync);
      drawCalSum(false);
    }
    update();
  };
  root.querySelector('.choice-cards.two').addEventListener('click', (e) => {
    const b = e.target.closest('[data-when]');
    if (b) setWhen(b.dataset.when);
  });
  root.querySelector('.days-pick').addEventListener('click', (e) => {
    const s = e.target.closest('[data-days]');
    const q = e.target.closest('[data-quick]');
    if (s) d.days = Math.min(60, Math.max(1, d.days + Number(s.dataset.days)));
    if (q) d.days = Number(q.dataset.quick);
    if (s || q) update();
  });

  /* 달: 끌어서 여러 개 */
  const monthsEl = root.querySelector('.month-pick');
  const syncMonths = () => monthsEl.querySelectorAll('[data-month]').forEach((b) => b.setAttribute('aria-pressed', String(d.months.includes(Number(b.dataset.month)))));
  let paint = null;
  const toggleMonth = (b, m0) => {
    const m = Number(b.dataset.month);
    const has = d.months.includes(m);
    if (m0 === 'add' && !has) d.months = [...d.months, m];
    if (m0 === 'remove' && has) d.months = d.months.filter((x) => x !== m);
    d.months.sort((x, y) => x - y);
    syncMonths();
    update();
  };
  monthsEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-month]');
    if (!b) return;
    e.preventDefault();
    paint = d.months.includes(Number(b.dataset.month)) ? 'remove' : 'add';
    toggleMonth(b, paint);
    monthsEl.setPointerCapture(e.pointerId);
  });
  monthsEl.addEventListener('pointermove', (e) => {
    if (!paint) return;
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-month]');
    if (b && monthsEl.contains(b)) toggleMonth(b, paint);
  });
  const endPaint = () => (paint = null);
  monthsEl.addEventListener('pointerup', endPaint);
  monthsEl.addEventListener('pointercancel', endPaint);
  monthsEl.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-month]');
    if (b && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleMonth(b, d.months.includes(Number(b.dataset.month)) ? 'remove' : 'add');
    }
  });

  /* ---------- 03 예산 (할 일 목록처럼) ---------- */
  const bList = root.querySelector('.budget-list');
  const bBar = root.querySelector('.budget-bar');
  const perLabel = (per) => (per === 'group' ? '다 같이' : '1인당');
  /** 금액 옆 안내: 다 같이 내는 항목은 1인 몫도 보여 준다 */
  const manOf = (b) => (b.per === 'group' && ppl() > 1 && b.amount ? `1인 ${manwon(share(b))}` : manwon(b.amount));
  const paintShares = () => {
    const total = perTotal();
    bList.querySelectorAll('.b-row').forEach((row, i) => {
      const b = budget[i];
      if (!b) return;
      row.querySelector('.b-man').textContent = manOf(b);
      row.querySelector('.b-pct').textContent = total && share(b) ? Math.round((share(b) / total) * 100) + '%' : '';
    });
    bBar.innerHTML = total ? budget.map((b, i) => (share(b) ? `<i style="flex:${share(b)};background:var(--c${(i % 5) + 1})" title="${esc(b.name)}"></i>` : '')).join('') : '';
    bBar.hidden = !total;
  };
  const drawBudget = (focusIdx) => {
    bList.innerHTML = budget
      .map(
        (b, i) => `<li class="b-row" data-i="${i}" style="--c:var(--c${(i % 5) + 1})">
        <span class="b-ico" aria-hidden="true">${iconOf(b.name)}</span>
        <input class="b-name" value="${esc(b.name)}" maxlength="20" aria-label="항목 이름">
        <button type="button" class="b-per" data-per aria-pressed="${b.per === 'group'}" title="1인당 금액인지, 다 같이 내는 전체 금액인지">${perLabel(b.per)}</button>
        <span class="money"><input class="b-amt num" value="${fmtMoney(b.amount)}" inputmode="numeric" placeholder="0" aria-label="${esc(b.name)} 금액 (${perLabel(b.per)})"><span>원</span></span>
        <span class="b-man faint"></span>
        <span class="b-pct mono faint"></span>
        <button type="button" class="b-del" data-bdel aria-label="${esc(b.name)} 지우기">✕</button>
      </li>`
      )
      .join('');
    paintShares();
    drawSuggests();
    if (focusIdx != null) bList.querySelector(`[data-i="${focusIdx}"] .b-amt`)?.focus();
  };
  const addBudget = (name, amount = 0, focus = true) => {
    name = name.trim();
    if (!name) return;
    const ex = budget.findIndex((b) => b.name === name);
    if (ex >= 0) {
      if (amount) budget[ex].amount += amount;
      drawBudget(focus ? ex : null);
    } else {
      budget.push({ name, amount, per: perOf(name) });
      drawBudget(focus ? budget.length - 1 : null);
      if (!reducedMotion()) bList.lastElementChild?.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    update();
  };
  bList.addEventListener('input', (e) => {
    const li = e.target.closest('.b-row');
    if (!li) return;
    const b = budget[Number(li.dataset.i)];
    if (e.target.classList.contains('b-name')) {
      b.name = e.target.value;
      li.querySelector('.b-ico').textContent = iconOf(b.name);
    } else {
      // 쉼표를 붙여 다시 쓰되, 커서는 끝에 둔다
      b.amount = parseMoney(e.target.value);
      e.target.value = fmtMoney(b.amount);
      paintShares();
    }
    update();
  });
  bList.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('b-name')) {
      const li = e.target.closest('.b-row');
      if (li && !budget[Number(li.dataset.i)]?.name.trim()) {
        budget.splice(Number(li.dataset.i), 1);
        drawBudget();
        update();
      }
    }
  });
  bList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      form.bName.focus();
    }
  });
  bList.addEventListener('click', (e) => {
    const per = e.target.closest('[data-per]');
    if (per) {
      const b = budget[Number(per.closest('.b-row').dataset.i)];
      b.per = b.per === 'group' ? 'person' : 'group';
      per.textContent = perLabel(b.per);
      per.setAttribute('aria-pressed', String(b.per === 'group'));
      paintShares();
      update();
      return;
    }
    const del = e.target.closest('[data-bdel]');
    if (!del) return;
    const i = Number(del.closest('.b-row').dataset.i);
    const li = del.closest('.b-row');
    const done = () => {
      budget.splice(i, 1);
      drawBudget();
      update();
    };
    if (reducedMotion()) return done();
    li.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(12px)' }], { duration: 180 }).finished.then(done);
  });
  // 새 항목 칸의 1인당/다 같이: 이름을 치면 기본값을 맞춰 주고, 눌러서 바꿀 수 있다
  const baPer = root.querySelector('[data-baper]');
  const syncBaPer = () => {
    baPer.textContent = perLabel(newPer);
    baPer.setAttribute('aria-pressed', String(newPer === 'group'));
  };
  form.bName.addEventListener('input', () => {
    if (!baPer.dataset.touched) {
      newPer = perOf(form.bName.value);
      syncBaPer();
    }
  });
  baPer.addEventListener('click', () => {
    newPer = newPer === 'group' ? 'person' : 'group';
    baPer.dataset.touched = '1';
    syncBaPer();
  });
  const addFromInputs = () => {
    const name = form.bName.value.trim();
    if (!name) return form.bName.focus();
    const ex = budget.findIndex((b) => b.name === name);
    addBudget(name, parseMoney(form.bAmt.value), false);
    if (ex < 0) budget[budget.length - 1].per = newPer;
    drawBudget();
    newPer = 'person';
    delete baPer.dataset.touched;
    syncBaPer();
    form.bName.value = '';
    form.bAmt.value = '';
    form.bName.focus();
  };
  root.querySelector('[data-badd]').addEventListener('click', addFromInputs);
  form.bAmt.addEventListener('input', () => (form.bAmt.value = fmtMoney(parseMoney(form.bAmt.value))));
  for (const el of [form.bName, form.bAmt])
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        if (el === form.bName && form.bName.value.trim() && !form.bAmt.value) form.bAmt.focus();
        else addFromInputs();
      }
    });
  root.querySelector('.ppl-pick').addEventListener('click', (e) => {
    const s = e.target.closest('[data-ppl]');
    const q = e.target.closest('[data-qppl]');
    if (s) d.travelers = Math.min(50, Math.max(1, ppl() + Number(s.dataset.ppl)));
    if (q) d.travelers = Number(q.dataset.qppl);
    if (s || q) {
      paintShares();
      update();
    }
  });
  const bSuggest = root.querySelector('.budget-suggest');
  bSuggest.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bsug]');
    if (b) addBudget(b.dataset.bsug, 0, true);
  });

  /* ---------- 04 가 볼 곳 ---------- */
  let L;
  let map;
  let routeLine;
  let stopMarkers = [];
  let destMarker;
  let alive = true;
  const stopList = root.querySelector('.stop-list');
  function drawMap(fit) {
    if (!map) return;
    stopMarkers.forEach((m) => m.remove());
    stopMarkers = d.stops.map((s, k) =>
      L.marker(s.coords, { icon: pinIcon(L, { label: String(k + 1), kind: 'is-plan' }), draggable: true })
        .addTo(map)
        .on('dragend', (ev) => {
          const ll = ev.target.getLatLng();
          d.stops[k].coords = [+ll.lat.toFixed(5), +ll.lng.toFixed(5)];
          drawMap(false);
          update();
        })
    );
    routeLine.setLatLngs(d.stops.map((s) => s.coords));
    destMarker?.remove();
    if (d.coords && !d.stops.length) destMarker = L.marker(d.coords, { icon: pinIcon(L, { label: '✦', kind: 'is-plan' }) }).addTo(map);
    if (fit) {
      const pts = d.stops.length ? d.stops.map((s) => s.coords) : d.coords ? [d.coords] : null;
      if (pts?.length > 1) map.flyToBounds(pts, { padding: [40, 40], maxZoom: 14, duration: 0.8 });
      else if (pts) map.flyTo(pts[0], d.scope === 'local' ? 14 : 11, { duration: 0.8 });
    }
  }
  const drawStops = () => {
    if (!stopList) return;
    stopList.innerHTML = d.stops
      .map(
        (s, k) => `<li class="stop-row" data-k="${k}">
        <button type="button" class="drag-handle" aria-label="${k + 1}번 장소 순서 바꾸기 (끌기 또는 ↑↓)" data-cursor-hide>⋮⋮</button>
        <span class="route-no mono">${String(k + 1).padStart(2, '0')}</span>
        <div class="stop-fields">
          <input class="inp" data-field="name" value="${esc(s.name)}" aria-label="장소 이름">
          <input class="inp faint" data-field="note" value="${esc(s.note || '')}" placeholder="메모 (선택)" aria-label="메모">
        </div>
        <button type="button" class="b-del" data-remove aria-label="삭제">✕</button>
      </li>`
      )
      .join('');
  };
  const addStop = (stop) => {
    d.stops.push(stop);
    if (!d.coords) d.coords = stop.coords;
    drawStops();
    drawMap(true);
    update();
    const li = stopList.lastElementChild;
    if (li && !reducedMotion()) li.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.16,1,.3,1)' });
  };
  if (stopList) {
    autocomplete(root.querySelector('[data-ac="stop"]'), {
      mode: 'poi',
      near: () => d.coords,
      onPick: (h) => addStop({ name: h.name, en: h.en || '', coords: [+h.lat.toFixed(5), +h.lng.toFixed(5)], note: '' }),
    });
    stopList.addEventListener('input', (e) => {
      const li = e.target.closest('.stop-row');
      if (!li) return;
      d.stops[Number(li.dataset.k)][e.target.dataset.field] = e.target.value;
      update();
    });
    stopList.addEventListener('click', (e) => {
      const li = e.target.closest('.stop-row');
      if (li && e.target.closest('[data-remove]')) {
        d.stops.splice(Number(li.dataset.k), 1);
        drawStops();
        drawMap(false);
        update();
      }
    });
    let drag = null;
    stopList.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('.drag-handle');
      if (!h) return;
      const li = h.closest('.stop-row');
      drag = { li, y: e.clientY };
      li.classList.add('dragging');
      h.setPointerCapture(e.pointerId);
    });
    stopList.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { li } = drag;
      li.style.transform = `translateY(${e.clientY - drag.y}px)`;
      const prev = li.previousElementSibling;
      const next = li.nextElementSibling;
      const r = li.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const swap = (other, before) => {
        const or = other.getBoundingClientRect();
        if (before) stopList.insertBefore(li, other);
        else stopList.insertBefore(other, li);
        const nr = other.getBoundingClientRect();
        if (!reducedMotion()) other.animate([{ transform: `translateY(${or.top - nr.top}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
        drag.y += before ? -or.height - 8 : or.height + 8;
        li.style.transform = `translateY(${e.clientY - drag.y}px)`;
      };
      if (prev && mid < prev.getBoundingClientRect().top + prev.offsetHeight / 2) swap(prev, true);
      else if (next && mid > next.getBoundingClientRect().top + next.offsetHeight / 2) swap(next, false);
    });
    const endDrag = () => {
      if (!drag) return;
      drag.li.classList.remove('dragging');
      drag.li.style.transform = '';
      d.stops = [...stopList.children].map((li) => d.stops[Number(li.dataset.k)]);
      drag = null;
      drawStops();
      drawMap(false);
      update();
    };
    stopList.addEventListener('pointerup', endDrag);
    stopList.addEventListener('pointercancel', endDrag);
    stopList.addEventListener('keydown', (e) => {
      const h = e.target.closest('.drag-handle');
      if (!h || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const k = Number(h.closest('.stop-row').dataset.k);
      const j = k + (e.key === 'ArrowUp' ? -1 : 1);
      if (j < 0 || j >= d.stops.length) return;
      [d.stops[k], d.stops[j]] = [d.stops[j], d.stops[k]];
      drawStops();
      drawMap(false);
      update();
      stopList.children[j].querySelector('.drag-handle').focus();
    });

    (async () => {
      try {
        L = await loadLeaflet();
      } catch {
        return;
      }
      if (!alive) return;
      map = createMap(L, root.querySelector('.composer-map'), { minZoom: 1 });
      map.setView(d.coords || [30, 128], d.coords ? 10 : 2);
      routeLine = L.polyline([], { className: 'route-plan', weight: 2.5, interactive: false }).addTo(map);
      drawMap(true);
      map.on('click', async (ev) => {
        const coords = [+ev.latlng.lat.toFixed(5), +ev.latlng.lng.toFixed(5)];
        addStop({ name: `장소 ${d.stops.length + 1}`, en: '', coords, note: '' });
        const stop = d.stops[d.stops.length - 1];
        try {
          const g = await reverse(coords);
          if (!alive || !d.stops.includes(stop) || !/^장소 \d+$/.test(stop.name)) return;
          stop.name = nameOf(g);
          stop.en = enOf(g);
          const input = stopList.children[d.stops.indexOf(stop)]?.querySelector('[data-field="name"]');
          if (input && document.activeElement !== input) input.value = stop.name;
          update();
        } catch {}
      });
    })();
  }
  cleanups.push(() => {
    alive = false;
    destroyMap(map);
  });

  /* ---------- 05 준비할 것 ---------- */
  const checkEl = root.querySelector('.check-edit');
  const suggestEl = root.querySelector('.suggest');
  function drawSuggests() {
    const cs = CHECK_SUGGEST[d.scope] || CHECK_SUGGEST.abroad;
    suggestEl.innerHTML = cs.filter((c) => !d.checklist.some(([t]) => t === c)).map((c) => `<button type="button" class="chip chip-add" data-suggest="${esc(c)}">+ ${esc(c)}</button>`).join('');
    const bs = BUDGET_SUGGEST[d.scope] || BUDGET_SUGGEST.abroad;
    bSuggest.innerHTML = bs.filter((c) => !budget.some((b) => b.name === c)).map((c) => `<button type="button" class="chip chip-add" data-bsug="${esc(c)}">${iconOf(c)} ${esc(c)}</button>`).join('');
  }
  const drawChecks = () => {
    checkEl.innerHTML = d.checklist
      .map(([t, done], k) => `<li class="todo-row"><span class="todo-box${done ? ' on' : ''}" aria-hidden="true"></span><span class="todo-text">${esc(t)}</span><button type="button" class="b-del" data-rm="${k}" aria-label="${esc(t)} 삭제">✕</button></li>`)
      .join('');
    drawSuggests();
  };
  const addCheck = (t) => {
    t = t.trim();
    if (!t || d.checklist.some(([x]) => x === t)) return;
    d.checklist.push([t, false]);
    drawChecks();
    update();
  };
  suggestEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-suggest]');
    if (b) addCheck(b.dataset.suggest);
  });
  form.newCheck.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addCheck(form.newCheck.value);
      form.newCheck.value = '';
    }
  });
  checkEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    d.checklist.splice(Number(b.dataset.rm), 1);
    drawChecks();
    update();
  });

  /* ---------- 06 태그 ---------- */
  const tagChips = root.querySelector('.tag-chips');
  const drawTags = () => (tagChips.innerHTML = d.tags.map((t, i) => `<span class="tag-chip">#${esc(t)}<button type="button" data-tagdel="${i}" aria-label="${esc(t)} 태그 지우기">✕</button></span>`).join(''));
  const addTag = (raw) => {
    raw
      .split(/[,，#\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => !d.tags.includes(t) && d.tags.length < 10 && d.tags.push(t.slice(0, 20)));
    drawTags();
    update();
  };
  form.tagIn.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(form.tagIn.value);
      form.tagIn.value = '';
    } else if (e.key === 'Backspace' && !form.tagIn.value && d.tags.length) {
      d.tags.pop();
      drawTags();
      update();
    }
  });
  form.tagIn.addEventListener('blur', () => {
    if (form.tagIn.value.trim()) {
      addTag(form.tagIn.value);
      form.tagIn.value = '';
    }
  });
  tagChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tagdel]');
    if (!b) return;
    d.tags.splice(Number(b.dataset.tagdel), 1);
    drawTags();
    update();
  });
  root.querySelector('.tag-input').addEventListener('click', (e) => e.target === e.currentTarget && form.tagIn.focus());

  /* ---------- 07 공개 범위 ---------- */
  const visPick = root.querySelector('.vis-pick');
  const syncVis = () => visPick.querySelectorAll('[data-vis]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.vis === d.visibility)));
  visPick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vis]');
    if (!b) return;
    d.visibility = b.dataset.vis;
    syncVis();
    update();
  });

  /* ---------- 저장 ---------- */
  const fail = (msg, target) => {
    toast(msg, '!');
    const el = typeof target === 'string' ? form[target] || root.querySelector(target) : target;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus?.({ preventScroll: true });
    }
    return false;
  };
  const validate = () => {
    read();
    if (!d.place) return fail('목적지를 검색해서 골라 주세요', 'q');
    if (!d.title) return fail('여행 이름을 적어 주세요', 'title');
    if (!whenMode) return fail('날짜를 정했는지, 아직 모르는지 골라 주세요', '[data-step="when"]');
    if (whenMode === 'date' && !d.target) return fail('달력에서 가는 날을 골라 주세요', '.cal');
    if (!editing) {
      if (!d.ownerName) return fail('주인 이름을 적어 주세요', 'ownerName');
      if (form.pw.value.length < 4) return fail('비밀번호는 4자 이상이어야 해요', 'pw');
      if (form.pw.value !== form.pw2.value) return fail('비밀번호 두 개가 서로 달라요', 'pw2');
    }
    return true;
  };
  const saveBtns = root.querySelectorAll('[data-save]');
  const save = async () => {
    if (!validate()) return;
    saveBtns.forEach((b) => (b.disabled = true));
    if (geoPending()) await Promise.race([geoIdle(), new Promise((r) => setTimeout(r, 4000))]);
    if (!alive) return;
    syncBudget();
    const { stops, ...info } = d;
    if (whenMode === 'someday') info.target = null;
    if (!info.months.length && info.target) info.months = [Number(info.target.slice(5, 7))];
    const err = await onSubmit({ info, stops }, editing ? {} : { password: form.pw.value, remember: form.remember.checked });
    if (!alive) return;
    saveBtns.forEach((b) => (b.disabled = false));
    if (err) return toast(err, '!');
    if (WIP) {
      try {
        localStorage.removeItem(WIP);
        localStorage.setItem('sdt:name', d.ownerName);
      } catch {}
    }
  };
  saveBtns.forEach((b) => b.addEventListener('click', save));
  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    if (!confirm('지금 쓰던 내용을 비우고 새로 쓸까요?')) return;
    d = blankPlan();
    budget = [];
    whenMode = null;
    try {
      localStorage.removeItem(WIP);
    } catch {}
    fill();
    syncAll();
  });

  const syncAll = () => {
    syncScope();
    drawDest();
    syncVis();
    syncMonths();
    drawScenes();
    drawBudget();
    drawStops();
    drawChecks();
    drawTags();
    drawMap(true);
    cal.set(d.target, d.target ? addDaysIso(d.target, d.days - 1) : null);
    if (whenMode) setWhen(whenMode);
    else root.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = true));
    update();
  };
  fill();
  requestAnimationFrame(syncAll);
  document.fonts?.ready.then(() => whenMode === 'date' && segSync());

  return () => cleanups.forEach((fn) => fn());
}
