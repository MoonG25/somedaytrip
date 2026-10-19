// 계획 쓰기 · 고치기 (moon.log pages/plan-edit.js에서 옮김)
// 섬데트에서 더한 것: 여행 종류(해외·국내·동네), 07 공개 · 주인 정하기(비밀번호), 서버 저장
import { esc, fmtWon, reducedMotion, isoDate } from './util.js';
import { scene } from './art.js';
import { STATUS, flagOf, nights } from './plans-lib.js';
import { weatherAt } from './live.js';
import { ticketHTML } from './ticket.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from './leaflet.js';
import { toast } from './toast.js';
import { geocode, reverse, nameOf, enOf, geoPending, geoIdle, CURRENCY, SCENES, SCENE_KO, TIMES } from './geo.js';

const BUDGET_KEYS = ['항공', '숙소', '식비', '교통', '기타'];
const CHECK_SUGGEST = ['항공권 예약', '숙소 예약', '여권 유효기간 확인', '여행자 보험', '환전', 'eSIM', '비자 확인', '국제운전면허증', '현지 교통패스'];
const CHECK_SUGGEST_LOCAL = ['동선 짜기', '맛집 예약', '돗자리', '보조배터리', '편한 신발', '날씨 확인'];
const SCOPES = { abroad: '✈️ 해외', domestic: '🚄 국내', local: '🏘️ 동네' };

export const blankPlan = () => ({
  title: '',
  place: '',
  placeEn: '',
  country: '',
  countryCode: '',
  iata: '',
  scope: 'abroad',
  status: 'dream',
  priority: 9,
  target: null,
  days: 5,
  months: [],
  tz: 'Asia/Seoul',
  currency: 'KRW',
  cover: { scene: 'mountain', time: 'dusk' },
  why: '',
  tags: [],
  intro: '',
  coords: null,
  stops: [],
  budget: { 항공: 0, 숙소: 0, 식비: 0, 교통: 0, 기타: 0 },
  checklist: [],
  ownerName: '',
  visibility: 'link',
});

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
      : '다 쓰면 링크가 생겨요. 링크를 받은 친구는 일정을 <b>제안</b>하고, 비밀번호를 아는 <b>주인</b>이 수락해요. 해외여행이 아니어도, 동네 한 바퀴도 좋아요.'
  }</p>
</section>

<section class="container composer">
  <form class="composer-form" novalidate autocomplete="off">
    <fieldset class="cstep" data-step="where">
      <legend><span class="step-no mono">01</span>어디로?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="segmented scope-seg" role="radiogroup" aria-label="여행 종류">
        ${Object.entries(SCOPES).map(([k, v]) => `<button type="button" role="radio" data-scope="${k}">${v}</button>`).join('')}
        <span class="seg-indicator"></span>
      </div>
      <p class="faint scope-hint"></p>
      <div class="geo-search">
        <label class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input name="q" placeholder="도시·동네 이름으로 찾기 (예: 삿포로, Lisbon, 망원동)" aria-label="목적지 검색"></label>
        <button type="button" class="btn btn--sm" data-find="dest">찾기</button>
      </div>
      <ul class="geo-results" data-results="dest" role="listbox" hidden></ul>
      <div class="grid2">
        <label class="lbl">여행 이름<input class="inp" name="title" placeholder="삿포로, 눈이 소리를 먹는 도시" required maxlength="60"></label>
        <label class="lbl">도시·동네 (한글)<input class="inp" name="place" placeholder="삿포로" required maxlength="40"></label>
        <label class="lbl">영문 이름 (전광판)<input class="inp" name="placeEn" placeholder="Sapporo" maxlength="40"></label>
        <label class="lbl">나라<input class="inp" name="country" placeholder="일본" maxlength="40"></label>
        <label class="lbl">국가 코드 <span class="flag-preview"></span><input class="inp mono" name="countryCode" maxlength="2" placeholder="JP"></label>
        <label class="lbl"><span class="iata-label">공항 코드</span><input class="inp mono" name="iata" maxlength="3" placeholder="CTS"></label>
      </div>
      <div class="scene-pick">
        <p class="lbl-title">탑승권 그림</p>
        <div class="scene-grid" role="radiogroup" aria-label="풍경"></div>
        <div class="chips time-chips" role="radiogroup" aria-label="시간대">${Object.entries(TIMES).map(([k, v]) => `<button type="button" class="chip" role="radio" data-time="${k}">${v}</button>`).join('')}</div>
      </div>
    </fieldset>

    <fieldset class="cstep" data-step="when">
      <legend><span class="step-no mono">02</span>언제?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="segmented status-seg" role="radiogroup" aria-label="상태">
        ${Object.entries(STATUS)
          .filter(([k]) => editing || k !== 'done')
          .reverse()
          .map(([k, s]) => `<button type="button" role="radio" data-status="${k}">${s.ko}</button>`)
          .join('')}
        <span class="seg-indicator"></span>
      </div>
      <div class="when-row">
        <label class="switch"><input type="checkbox" name="hasDate"><span class="switch-ui" aria-hidden="true"></span>출발일을 정했어요</label>
        <input class="inp date-inp" type="date" name="target" aria-label="출발일" disabled>
      </div>
      <p class="lbl-title">가기 좋은 달 <span class="faint">(끌어서 여러 달 선택)</span></p>
      <div class="month-pick" role="group" aria-label="가기 좋은 달">${Array.from({ length: 12 }, (_, i) => `<button type="button" data-month="${i + 1}" aria-pressed="false">${i + 1}<small>월</small></button>`).join('')}</div>
    </fieldset>

    <fieldset class="cstep" data-step="how">
      <legend><span class="step-no mono">03</span>얼마나?<span class="step-done" aria-hidden="true">✓</span></legend>
      <label class="range-row"><span class="lbl-title">기간</span><output name="daysOut">4박 5일</output><input type="range" name="days" min="1" max="30" value="5"></label>
      <div class="budget-grid">
        ${BUDGET_KEYS.map((k) => `<label class="lbl">${k}<span class="won"><input class="inp num" type="number" min="0" step="10000" name="b-${k}" placeholder="0"><span>원</span></span></label>`).join('')}
        <div class="budget-total"><span class="lbl-title">합계 · 1인</span><b class="h-serif num" data-total>₩0</b></div>
      </div>
      <label class="lbl short">우선순위 (탑승구 번호)<input class="inp mono" type="number" min="1" max="99" name="priority"></label>
    </fieldset>

    ${
      noPlaces
        ? mode === 'copy'
          ? `<p class="copy-note">원래 계획의 가 볼 곳 <b>${copiedCount}곳</b>과 일정은 그대로 복사돼요. 만든 뒤 계획 화면에서 고치면 돼요.</p>`
          : ''
        : `<fieldset class="cstep" data-step="places">
      <legend><span class="step-no mono">04</span>어디를 볼까?<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="geo-search">
        <label class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input name="sq" placeholder="가 볼 곳 찾기 (예: 오타루 운하, 망원시장)" aria-label="장소 검색"></label>
        <button type="button" class="btn btn--sm" data-find="stop">추가</button>
      </div>
      <ul class="geo-results" data-results="stop" role="listbox" hidden></ul>
      <div class="composer-map-wrap"><div class="composer-map" aria-label="지도를 눌러 장소 추가"></div><span class="map-hint">지도를 눌러도 추가돼요</span></div>
      <ol class="stop-list" role="list"></ol>
      <p class="faint">날짜별 일정과 시간은 만든 뒤 계획 화면에서 정해요. 지금 넣은 곳은 날짜에 고르게 나눠 둘게요.</p>
    </fieldset>`
    }

    <fieldset class="cstep" data-step="prep" id="prep">
      <legend><span class="step-no mono">${n(5)}</span>준비할 것<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="chips suggest"></div>
      <label class="field add-check"><input name="newCheck" placeholder="직접 추가하고 Enter" aria-label="준비할 것 추가"></label>
      <ul class="check-edit" role="list"></ul>
    </fieldset>

    <fieldset class="cstep" data-step="why">
      <legend><span class="step-no mono">${n(6)}</span>왜 가고 싶어?<span class="step-done" aria-hidden="true">✓</span></legend>
      <label class="lbl">한 줄로<input class="inp" name="why" placeholder="눈 쌓인 밤길을 걷다가 노천온천에 들어가고 싶다." maxlength="200"></label>
      <label class="lbl">더 길게 (마크다운)<textarea class="textarea" name="intro" rows="5" placeholder="**굵게**, - 목록도 돼요." maxlength="6000"></textarea></label>
      <label class="lbl">태그 (쉼표로 구분)<input class="inp" name="tags" placeholder="겨울, 온천, 눈"></label>
    </fieldset>

    <fieldset class="cstep" data-step="share">
      <legend><span class="step-no mono">${n(7)}</span>${editing ? '공개 범위' : '공개 · 주인 정하기'}<span class="step-done" aria-hidden="true">✓</span></legend>
      <div class="vis-pick" role="radiogroup" aria-label="공개 범위">
        <button type="button" role="radio" data-vis="link"><b>🔗 링크 공개</b><span>링크를 받은 친구만 볼 수 있어요. 검색에는 안 나와요.</span></button>
        <button type="button" role="radio" data-vis="public"><b>🌍 전체 공개</b><span>누구나 볼 수 있고 Google·네이버 검색에도 나와요.</span></button>
      </div>
      <p class="faint vis-note">어느 쪽이든 누구나 일정을 <b>제안</b>할 수 있지만, 반영은 <b>주인만</b> 할 수 있어요.</p>
      ${
        editing
          ? ''
          : `<div class="owner-box">
        <p class="owner-lede"><b>🔑 비밀번호를 아는 사람이 이 계획의 주인이에요.</b> 제안 수락·거절, 직접 수정, 삭제를 할 수 있어요. 다른 기기에서도 비밀번호만 넣으면 주인으로 돌아와요. <b>잊으면 되찾을 수 없어요.</b></p>
        <div class="grid2">
          <label class="lbl">주인 이름 <span class="faint">(친구들에게 보여요)</span><input class="inp" name="ownerName" maxlength="20" placeholder="예: 문"></label>
          <span></span>
          <label class="lbl">비밀번호 <span class="faint">(4자 이상)</span><input class="inp" type="password" name="pw" autocomplete="new-password"></label>
          <label class="lbl">한 번 더<input class="inp" type="password" name="pw2" autocomplete="new-password"></label>
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
</section>`;
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

/**
 * @param {{ mode: 'new'|'edit'|'copy', initial?: object, onSubmit: (data, extra) => Promise<string|null> }} opts
 *   onSubmit은 실패하면 오류 메시지를, 성공하면 null을 돌려준다
 */
export function mountComposer(root, { mode = 'new', initial = null, onSubmit }) {
  const cleanups = [];
  const editing = mode === 'edit';
  const form = root.querySelector('.composer-form');
  const WIP = mode === 'new' ? 'sdt:composer:new' : null;
  const wip = (() => {
    try {
      return WIP ? JSON.parse(localStorage.getItem(WIP) || 'null') : null;
    } catch {
      return null;
    }
  })();
  let d = { ...blankPlan(), ...(initial || wip || {}) };
  d.budget = { ...blankPlan().budget, ...(d.budget || {}) };
  if (!d.ownerName) {
    try {
      d.ownerName = localStorage.getItem('sdt:name') || '';
    } catch {}
  }
  const saveWip = () => {
    if (!WIP) return;
    try {
      localStorage.setItem(WIP, JSON.stringify(d));
    } catch {}
  };

  /* ---------- 폼 ↔ 상태 ---------- */
  const fill = () => {
    ['title', 'place', 'placeEn', 'country', 'countryCode', 'iata', 'why', 'intro'].forEach((k) => (form[k].value = d[k] || ''));
    form.tags.value = (d.tags || []).join(', ');
    form.days.value = d.days;
    form.priority.value = d.priority;
    form.hasDate.checked = !!d.target;
    form.target.disabled = !d.target;
    form.target.value = d.target || '';
    BUDGET_KEYS.forEach((k) => (form[`b-${k}`].value = d.budget[k] || ''));
    if (form.ownerName) form.ownerName.value = d.ownerName || '';
  };
  const read = () => {
    ['title', 'place', 'placeEn', 'country', 'why', 'intro'].forEach((k) => (d[k] = form[k].value.trim()));
    d.countryCode = form.countryCode.value.trim().toUpperCase();
    d.iata = form.iata.value.trim().toUpperCase();
    d.tags = form.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
    d.days = Number(form.days.value);
    d.priority = Number(form.priority.value) || d.priority;
    d.target = form.hasDate.checked && form.target.value ? form.target.value : null;
    BUDGET_KEYS.forEach((k) => (d.budget[k] = Number(form[`b-${k}`].value) || 0));
    if (CURRENCY[d.countryCode]) d.currency = CURRENCY[d.countryCode];
    if (form.ownerName) d.ownerName = form.ownerName.value.trim();
  };

  const preview = root.querySelector('.preview-ticket');
  const progress = root.querySelector('.step-progress');
  const STEPS = [
    ['where', '어디로', () => d.title && d.place && (d.coords || d.stops.length || d.scope === 'local')],
    ['when', '언제', () => d.months.length > 0 || !!d.target],
    ['how', '얼마나', () => Object.values(d.budget).some((v) => v > 0)],
    ...(mode !== 'new' ? [] : [['places', '어디를', () => d.stops.length > 0]]),
    ['prep', '준비', () => d.checklist.length > 0],
    ['why', '왜', () => !!d.why],
    ['share', editing ? '공개' : '주인', () => editing || (d.ownerName && form.pw.value.length >= 4 && form.pw.value === form.pw2.value)],
  ];
  let queued = false;
  const update = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const p = { ...d, id: 'preview-' + mode, href: '', title: d.title || '새 여행 계획', place: d.place || '어딘가', months: d.months.length ? d.months : [] };
      preview.innerHTML = ticketHTML(p, { preview: true });
      preview.querySelector('.ticket')?.classList.add('is-in');
      root.querySelector('[data-total]').textContent = fmtWon(Object.values(d.budget).reduce((s, v) => s + v, 0));
      form.daysOut.value = nights(d.days);
      root.querySelector('.flag-preview').textContent = d.countryCode.length === 2 ? flagOf(d.countryCode) : '';
      progress.innerHTML = STEPS.map(([k, label, ok]) => `<li class="${ok() ? 'done' : ''}"><a href="#" data-goto="${k}">${label}</a></li>`).join('');
      STEPS.forEach(([k, , ok]) => form.querySelector(`[data-step="${k}"]`)?.classList.toggle('done', !!ok()));
      saveWip();
    });
  };
  form.addEventListener('input', (e) => {
    if (['q', 'sq', 'newCheck'].includes(e.target.name)) return;
    if (e.target.name === 'pw') {
      const m = root.querySelector('.pw-meter');
      const s = strength(form.pw.value);
      m.dataset.s = form.pw.value ? s : -1;
      m.querySelector('span').textContent = form.pw.value ? STRENGTH[s] : '친구들과 같이 쓰는 비밀번호는 피하세요';
    }
    read();
    update();
  });
  form.hasDate.addEventListener('change', () => {
    form.target.disabled = !form.hasDate.checked;
    if (form.hasDate.checked && !form.target.value) {
      const t = new Date();
      t.setDate(t.getDate() + 90);
      form.target.value = isoDate(t);
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

  /* ---------- 세그먼트 (상태 · 여행 종류) ---------- */
  const segSync = (seg, attr, value) => {
    const ind = seg.querySelector('.seg-indicator');
    seg.querySelectorAll(`[data-${attr}]`).forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset[attr] === value));
      b.setAttribute('aria-selected', String(b.dataset[attr] === value));
    });
    const on = seg.querySelector(`[data-${attr}="${value}"]`);
    if (on) {
      ind.style.width = `${on.offsetWidth}px`;
      ind.style.transform = `translateX(${on.offsetLeft}px)`;
    }
  };
  const statusSeg = root.querySelector('.status-seg');
  const scopeSeg = root.querySelector('.scope-seg');
  const SCOPE_HINT = {
    abroad: '여권 챙겨서. 공항 코드를 넣으면 탑승권과 전광판에 나와요.',
    domestic: '주말에 훌쩍. 기차역·공항 코드는 넣어도 되고 비워도 돼요.',
    local: '걸어서, 자전거로, 버스 몇 정거장. 동네 한 바퀴도 훌륭한 여행이에요.',
  };
  const syncScope = () => {
    segSync(scopeSeg, 'scope', d.scope);
    root.querySelector('.scope-hint').textContent = SCOPE_HINT[d.scope];
    root.querySelector('.iata-label').textContent = d.scope === 'abroad' ? '공항 코드' : '코드 (선택)';
    drawSuggest();
  };
  statusSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    d.status = b.dataset.status;
    segSync(statusSeg, 'status', d.status);
    update();
  });
  scopeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    d.scope = b.dataset.scope;
    if (d.scope === 'local' && d.days > 2 && !d.title) {
      d.days = 1;
      form.days.value = 1;
    }
    syncScope();
    update();
  });

  /* ---------- 공개 범위 ---------- */
  const visPick = root.querySelector('.vis-pick');
  const syncVis = () => visPick.querySelectorAll('[data-vis]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.vis === d.visibility)));
  visPick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vis]');
    if (!b) return;
    d.visibility = b.dataset.vis;
    syncVis();
    update();
  });

  /* ---------- 달: 끌어서 여러 개 ---------- */
  const monthsEl = root.querySelector('.month-pick');
  const syncMonths = () => monthsEl.querySelectorAll('[data-month]').forEach((b) => b.setAttribute('aria-pressed', String(d.months.includes(Number(b.dataset.month)))));
  let paint = null;
  const toggleMonth = (b, m0) => {
    const m = Number(b.dataset.month);
    const has = d.months.includes(m);
    if (m0 === 'add' && !has) d.months.push(m);
    if (m0 === 'remove' && has) d.months = d.months.filter((x) => x !== m);
    d.months.sort((a, z) => a - z);
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

  /* ---------- 풍경 선택 ---------- */
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

  /* ---------- 지도 + 장소 (새로 쓸 때만) ---------- */
  let L;
  let map;
  let routeLine;
  let stopMarkers = [];
  let destMarker;
  let alive = true;
  const stopList = root.querySelector('.stop-list');
  const drawMap = (fit) => {
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
  };
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
        <button type="button" class="icon-btn" data-remove aria-label="삭제">✕</button>
      </li>`
      )
      .join('');
  };
  const addStop = (stop, focus) => {
    d.stops.push(stop);
    if (!d.coords) d.coords = stop.coords;
    if (d.tz === 'Asia/Seoul' && d.countryCode !== 'KR')
      weatherAt(stop.coords)
        .then((w) => {
          if (alive && w.timezone) d.tz = w.timezone;
        })
        .catch(() => {});
    drawStops();
    drawMap(true);
    update();
    const li = stopList.lastElementChild;
    if (li && !reducedMotion()) li.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (focus) li?.querySelector('[data-field="name"]').select();
  };
  if (stopList) {
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
        addStop({ name: `장소 ${d.stops.length + 1}`, en: '', coords, note: '' }, false);
        const stop = d.stops[d.stops.length - 1];
        try {
          const g = await reverse(coords);
          if (!alive || !d.stops.includes(stop) || !/^장소 \d+$/.test(stop.name)) return;
          stop.name = nameOf(g);
          stop.en = enOf(g);
          const input = stopList.children[d.stops.indexOf(stop)]?.querySelector('[data-field="name"]');
          if (input && document.activeElement !== input) input.value = stop.name;
          const cc = g.address?.country_code?.toUpperCase();
          if (cc && !form.countryCode.value) {
            form.countryCode.value = cc;
            if (!form.country.value) form.country.value = g.address.country || '';
            read();
          }
          update();
        } catch {}
      });
    })();
  }
  cleanups.push(() => {
    alive = false;
    destroyMap(map);
  });

  /* ---------- 지명 검색 ---------- */
  const search = async (kind) => {
    const input = kind === 'dest' ? form.q : form.sq;
    const q = input.value.trim();
    const list = root.querySelector(`[data-results="${kind}"]`);
    if (!q) return input.focus();
    list.hidden = false;
    list.innerHTML = '<li class="geo-loading">찾는 중…</li>';
    try {
      const res = await geocode(q);
      if (!res.length) {
        list.innerHTML = '<li class="geo-loading">결과가 없어요. 영문으로도 찾아보세요.</li>';
        return;
      }
      list.innerHTML = res.map((g, i) => `<li><button type="button" role="option" data-i="${i}"><b>${esc(nameOf(g))}</b><span>${esc(g.display_name)}</span></button></li>`).join('');
      list.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const g = res[Number(b.dataset.i)];
        const coords = [+(+g.lat).toFixed(5), +(+g.lon).toFixed(5)];
        list.hidden = true;
        input.value = '';
        if (kind === 'dest') {
          const cc = (g.address?.country_code || '').toUpperCase();
          form.place.value = nameOf(g);
          form.placeEn.value = enOf(g);
          form.country.value = g.address?.country || '';
          form.countryCode.value = cc;
          // 한국 안이면 국내로 (동네를 고른 상태면 그대로)
          if (cc === 'KR' && d.scope === 'abroad') {
            d.scope = 'domestic';
            syncScope();
          }
          if (!form.iata.value && d.scope === 'abroad') form.iata.value = (enOf(g) || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
          if (!form.title.value) form.title.value = d.scope === 'local' ? `${nameOf(g)} 한 바퀴` : `${nameOf(g)}, `;
          d.coords = coords;
          read();
          drawMap(true);
          update();
          weatherAt(coords)
            .then((w) => {
              d.tz = w.timezone || d.tz;
              update();
            })
            .catch(() => {});
          form.title.focus();
          form.title.setSelectionRange(form.title.value.length, form.title.value.length);
        } else {
          addStop({ name: nameOf(g), en: enOf(g), coords, note: '' }, false);
        }
      };
    } catch {
      list.innerHTML = '<li class="geo-loading">검색하지 못했어요. 잠시 뒤 다시 해 주세요.</li>';
    }
  };
  root.querySelectorAll('[data-find]').forEach((b) => b.addEventListener('click', () => search(b.dataset.find)));
  form.q.addEventListener('keydown', (e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), search('dest')));
  form.sq?.addEventListener('keydown', (e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), search('stop')));

  /* ---------- 체크리스트 ---------- */
  const checkEl = root.querySelector('.check-edit');
  const suggestEl = root.querySelector('.suggest');
  function drawSuggest() {
    const list = d.scope === 'local' ? CHECK_SUGGEST_LOCAL : CHECK_SUGGEST;
    suggestEl.innerHTML = list.filter((c) => !d.checklist.some(([t]) => t === c)).map((c) => `<button type="button" class="chip" data-suggest="${esc(c)}">+ ${esc(c)}</button>`).join('');
  }
  const drawChecks = () => {
    checkEl.innerHTML = d.checklist.map(([t], k) => `<li><span>${esc(t)}</span><button type="button" class="icon-btn" data-rm="${k}" aria-label="${esc(t)} 삭제">✕</button></li>`).join('');
    drawSuggest();
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

  /* ---------- 저장 ---------- */
  const fail = (msg, field) => {
    toast(msg, '!');
    const el = field && form[field];
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return false;
  };
  const validate = () => {
    read();
    if (!d.title) return fail('여행 이름을 적어 주세요', 'title');
    if (!d.place) return fail('도시나 동네 이름을 적어 주세요', 'place');
    if (!editing) {
      if (!d.ownerName) return fail('주인 이름을 적어 주세요', 'ownerName');
      if (form.pw.value.length < 4) return fail('비밀번호는 4자 이상이어야 해요', 'pw');
      if (form.pw.value !== form.pw2.value) return fail('비밀번호 두 개가 서로 달라요', 'pw2');
    }
    return true;
  };
  const saveBtn = root.querySelector('[data-save]');
  saveBtn.addEventListener('click', async () => {
    if (!validate()) return;
    if (geoPending()) {
      saveBtn.disabled = true;
      await Promise.race([geoIdle(), new Promise((r) => setTimeout(r, 4000))]);
      if (!alive) return;
    }
    saveBtn.disabled = true;
    const { stops, ...info } = d;
    const err = await onSubmit({ info, stops }, editing ? {} : { password: form.pw.value, remember: form.remember.checked });
    if (!alive) return;
    saveBtn.disabled = false;
    if (err) return toast(err, '!');
    if (WIP) {
      try {
        localStorage.removeItem(WIP);
        localStorage.setItem('sdt:name', d.ownerName);
      } catch {}
    }
  });
  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    if (!confirm('지금 쓰던 내용을 비우고 새로 쓸까요?')) return;
    d = blankPlan();
    try {
      localStorage.removeItem(WIP);
    } catch {}
    fill();
    syncAll();
  });

  const syncAll = () => {
    segSync(statusSeg, 'status', d.status);
    syncScope();
    syncVis();
    syncMonths();
    drawScenes();
    drawStops();
    drawChecks();
    drawMap(true);
    update();
  };
  fill();
  requestAnimationFrame(syncAll);
  document.fonts?.ready.then(() => {
    segSync(statusSeg, 'status', d.status);
    segSync(scopeSeg, 'scope', d.scope);
  });

  return () => cleanups.forEach((fn) => fn());
}
