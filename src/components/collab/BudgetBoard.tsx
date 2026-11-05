'use client';
// 예상 경비: 계획 화면에서 바로 더하고 고치고 지운다 (기장). 승객은 보기만.
// 고치면 잠깐 뒤 저장한다. 1인당 ↔ 다 같이를 바꾸면 금액도 바로 바꿔 계산한다 (다 같이 40만 · 2명 → 1인당 20만).
// 저장은 늘 원화. 해외 계획은 현지 통화로도 적을 수 있다 (환율로 바꿔 저장).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BudgetItem, Plan } from '@/lib/types';
import { setBudget } from '@/app/actions';
import { BUDGET_SUGGEST } from '@/lib/suggest';
import { broadcast, toast } from './util';
import { curOf, fmtMoney } from '@/lib/money';
import { krwPer } from '@/blog/live.js';

// 숙소·렌터카는 보통 다 같이 낸다
const GROUP_DEFAULT = /숙소|호텔|료칸|에어비앤비|게스트|렌터카|주유|캠핑/;
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const UNIT: Record<string, string> = { JPY: '엔', USD: '달러', EUR: '유로', GBP: '파운드', CNY: '위안', TWD: '대만 달러', HKD: '홍콩 달러', THB: '바트', VND: '동', SGD: '싱가포르 달러', AUD: '호주 달러', CAD: '캐나다 달러', PHP: '페소', MYR: '링깃', IDR: '루피아', CHF: '프랑', NZD: '뉴질랜드 달러' };
const unitOf = (cur: string) => UNIT[cur] || cur;
// 소수점 없이 쓰는 통화
const WHOLE = new Set(['JPY', 'VND', 'IDR', 'TWD', 'KRW']);
const COLORS = 5;

/** "1엔 ≈ 9.3원" · 1단위가 1원도 안 되면 "100동 ≈ 5원" */
function rateLabel(cur: string, rate: number) {
  let unit = 1;
  while (unit * rate < 1 && unit < 1e6) unit *= 10;
  const krw = unit * rate;
  const n = krw < 10 ? krw.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : Math.round(krw).toLocaleString('ko-KR');
  return `${unit.toLocaleString('ko-KR')}${unitOf(cur)} ≈ ${n}원`;
}

/** 적은 글자 → 숫자 (원화가 아닌 통화는 소수 2자리까지) */
function parseNum(text: string, cur: string) {
  const clean = text.replace(/[^\d.]/g, '');
  const n = Number(WHOLE.has(cur) ? clean.replace(/\..*$/, '') : clean) || 0;
  return Math.min(1e10, Math.round(n * 100) / 100);
}

/** 적는 중인 글자에 쉼표를 다시 찍는다 (소수점은 적는 그대로) */
function typed(raw: string, cur: string) {
  const [int, dec] = raw.replace(/[^\d.]/g, '').split('.');
  return int ? Number(int).toLocaleString('ko-KR') + (dec != null && !WHOLE.has(cur) ? `.${dec.slice(0, 2)}` : '') : '';
}

const sameRows = (a: BudgetItem[], b: BudgetItem[]) => a.length === b.length && a.every((x, i) => x.name === b[i].name && x.amount === b[i].amount && x.per === b[i].per);

export default function BudgetBoard({ plan, owner }: { plan: Plan; owner: boolean }) {
  const router = useRouter();
  const fromPlan = () => (plan.budgetItems.length ? plan.budgetItems.map((b) => ({ ...b })) : Object.entries(plan.budget || {}).map(([name, amount]) => ({ name, amount, per: 'person' as const })));
  const [rows, setRows] = useState<BudgetItem[]>(fromPlan);
  const [ppl, setPpl] = useState(Math.max(1, plan.travelers || 1));
  const [state, setState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  // 적는 중인 칸의 글자 (현지 통화 소수점 등): "줄 번호" → 글자
  const [draft, setDraft] = useState<{ i: number; text: string } | null>(null);
  const [adding, setAdding] = useState('');
  const box = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ rows, ppl });
  latest.current = { rows, ppl };

  // 다른 곳에서 바뀐 예산(다른 기기·새로 고침)은 고치는 중이 아닐 때만 받아들인다
  useEffect(() => {
    if (state === 'dirty' || state === 'saving') return;
    if (box.current?.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT') return;
    const next = fromPlan();
    if (!sameRows(next, latest.current.rows)) setRows(next);
    setPpl(Math.max(1, plan.travelers || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.version, plan.updatedAt]);

  // 현지 통화
  const cur = curOf(plan.currency);
  const foreign = cur !== 'KRW';
  const [rate, setRate] = useState<number | null>(null);
  const [inLocal, setInLocal] = useState(false);
  useEffect(() => {
    if (!foreign) return;
    const ctrl = new AbortController();
    krwPer(cur, ctrl.signal)
      .then((r: number) => !ctrl.signal.aborted && Number.isFinite(r) && r > 0 && setRate(r))
      .catch(() => {});
    return () => ctrl.abort();
  }, [cur, foreign]);
  const local = inLocal && !!rate;
  const toLocal = (krw: number) => (rate ? (WHOLE.has(cur) ? Math.round(krw / rate) : Math.round((krw / rate) * 100) / 100) : krw);

  const save = async () => {
    const { rows: r, ppl: n } = latest.current;
    setState('saving');
    const res = await setBudget(
      plan.id,
      r.filter((b) => b.name.trim()).map((b) => ({ ...b, name: b.name.trim() })),
      n
    );
    if (!res.ok) {
      setState('dirty');
      toast(res.error, '!');
      return;
    }
    setState('saved');
    broadcast(plan.id);
    router.refresh();
  };
  /** 고친 뒤 잠깐 쉬면 저장 */
  const change = (next: BudgetItem[], n = ppl) => {
    setRows(next);
    setPpl(n);
    latest.current = { rows: next, ppl: n };
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // 저장하기 전에 떠나면 알린다
  useEffect(() => {
    if (state !== 'dirty' && state !== 'saving') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [state]);

  const set = (i: number, patch: Partial<BudgetItem>) => change(rows.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  /** 1인당 ↔ 다 같이: 금액도 바로 바꿔 계산 */
  const flip = (i: number) => {
    const b = rows[i];
    set(i, b.per === 'group' ? { per: 'person', amount: Math.round(b.amount / ppl) } : { per: 'group', amount: b.amount * ppl });
  };
  const add = (name: string) => {
    const n = name.trim().slice(0, 20);
    if (!n) return;
    if (rows.length >= 20) return toast('예산 항목은 20개까지예요', '!');
    change([...rows, { name: n, amount: 0, per: GROUP_DEFAULT.test(n) ? 'group' : 'person' }]);
    setAdding('');
    focusLast.current = true;
  };
  // 새 줄을 그린 뒤 그 줄의 금액 칸으로
  const focusLast = useRef(false);
  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    box.current?.querySelector<HTMLInputElement>('.bb-row:last-child .bb-amt input')?.focus();
  }, [rows.length]);
  const remove = (i: number) => change(rows.filter((_, k) => k !== i));

  const share = (b: BudgetItem) => (b.per === 'group' ? b.amount / ppl : b.amount);
  const per = rows.reduce((s, b) => s + share(b), 0);
  const all = rows.reduce((s, b) => s + (b.per === 'group' ? b.amount : b.amount * ppl), 0);
  const unused = (BUDGET_SUGGEST[plan.scope] || []).filter((n) => !rows.some((b) => b.name === n));
  const status = { idle: '', dirty: '고치는 중…', saving: '저장 중…', saved: '저장했어요' }[state];

  return (
    <section className="prep-budget bb" id="budget" ref={box} aria-label="예상 경비">
      <header className="sec-head">
        <div>
          <p className="eyebrow">예상 경비</p>
          <h2>
            <em>Budget</em>
          </h2>
        </div>
        {owner ? (
          <span className={`bb-status faint${state === 'saved' ? ' ok' : ''}`} aria-live="polite">
            {status}
          </span>
        ) : null}
      </header>

      <div className="bb-sum">
        <div>
          <span className="eyebrow">1인</span>
          <b className="num">{won(per)}</b>
        </div>
        {ppl > 1 ? (
          <div>
            <span className="eyebrow">{ppl}명 전체</span>
            <b className="num">{won(all)}</b>
          </div>
        ) : null}
        {owner ? (
          <div className="stepper bb-ppl" aria-label="인원">
            <button type="button" onClick={() => change(rows, Math.max(1, ppl - 1))} aria-label="한 명 줄이기" disabled={ppl <= 1}>
              −
            </button>
            <output>{ppl}명</output>
            <button type="button" onClick={() => change(rows, Math.min(50, ppl + 1))} aria-label="한 명 늘리기">
              +
            </button>
          </div>
        ) : null}
      </div>

      {per > 0 ? (
        <div className="bb-bar" aria-hidden="true">
          {rows.map((b, i) => (share(b) > 0 ? <i key={i} style={{ flex: share(b), background: `var(--c${(i % COLORS) + 1})` }} title={b.name} /> : null))}
        </div>
      ) : null}

      {owner && foreign && rate ? (
        <div className="bb-cur">
          <div className="seg-mini" role="radiogroup" aria-label="금액 단위">
            <button type="button" role="radio" aria-checked={!local} onClick={() => setInLocal(false)}>
              원화
            </button>
            <button type="button" role="radio" aria-checked={local} onClick={() => setInLocal(true)}>
              {unitOf(cur)}
            </button>
          </div>
          <small className="faint">{rateLabel(cur, rate)}</small>
        </div>
      ) : null}

      {rows.length ? (
        <ul className="bb-rows" role="list">
          {rows.map((b, i) => {
            const pct = per ? Math.round((share(b) / per) * 100) : 0;
            const shown = local ? toLocal(b.amount) : b.amount;
            const text = draft?.i === i ? draft.text : shown ? shown.toLocaleString('ko-KR') : '';
            return (
              <li key={i} className="bb-row" style={{ '--c': `var(--c${(i % COLORS) + 1})` } as React.CSSProperties}>
                <span className="bb-dot" aria-hidden="true" />
                {owner ? (
                  <input className="bb-name" value={b.name} maxLength={20} aria-label="항목 이름" placeholder="항목" onChange={(e) => set(i, { name: e.target.value })} />
                ) : (
                  <span className="bb-name">{b.name}</span>
                )}
                {ppl > 1 ? (
                  owner ? (
                    <button type="button" className="b-per" aria-pressed={b.per === 'group'} onClick={() => flip(i)} title="누르면 1인당 ↔ 다 같이로 바꾸고 금액도 맞춰 계산해요">
                      {b.per === 'group' ? '다 같이' : '1인당'}
                    </button>
                  ) : (
                    <span className="b-per is-static">{b.per === 'group' ? '다 같이' : '1인당'}</span>
                  )
                ) : (
                  <span />
                )}
                {owner ? (
                  <label className="bb-amt">
                    <input
                      className="num"
                      inputMode={local && !WHOLE.has(cur) ? 'decimal' : 'numeric'}
                      aria-label={`${b.name || '항목'} 금액 (${b.per === 'group' && ppl > 1 ? '다 같이' : '1인당'}, ${local ? unitOf(cur) : '원'})`}
                      value={text}
                      placeholder="0"
                      onFocus={() => setDraft({ i, text })}
                      onBlur={() => setDraft(null)}
                      onChange={(e) => {
                        const t = typed(e.target.value, local ? cur : 'KRW');
                        setDraft({ i, text: t });
                        const n = parseNum(t, local ? cur : 'KRW');
                        set(i, { amount: Math.min(1e10, Math.round(local && rate ? n * rate : n)) });
                      }}
                    />
                    <span>{local ? unitOf(cur) : '원'}</span>
                  </label>
                ) : (
                  <b className="bb-amt num">{won(b.amount)}</b>
                )}
                <small className="bb-note faint num">
                  {b.per === 'group' && ppl > 1 && b.amount ? `1인 ${won(b.amount / ppl)}` : local && b.amount ? won(b.amount) : ''}
                  {pct ? <span className="bb-pct"> {pct}%</span> : null}
                </small>
                {owner ? (
                  <button type="button" className="bb-del" aria-label={`${b.name || '항목'} 지우기`} onClick={() => remove(i)}>
                    ✕
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted bb-empty">{owner ? '아직 예산이 없어요. 아래에 항목을 더해 보세요.' : '아직 예산을 정하지 않았어요.'}</p>
      )}

      {owner ? (
        <>
          <form
            className="bb-add"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              add(adding);
            }}
          >
            <span className="ba-ico" aria-hidden="true">
              +
            </span>
            <input value={adding} maxLength={20} placeholder="예산 항목 추가 (예: 항공)" aria-label="예산 항목 추가" onChange={(e) => setAdding(e.target.value)} />
            <button type="submit" className="btn btn--sm">
              추가
            </button>
          </form>
          {unused.length ? (
            <div className="chips bb-sugg">
              {unused.map((n) => (
                <button key={n} type="button" className="chip" onClick={() => add(n)}>
                  + {n}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
