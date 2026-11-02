// 섬데트 데이터 모양. 계획 정보는 moon.log의 Plans 데이터를 그대로 따르고,
// "가 볼 곳"은 여러 사람이 제안·수락으로 고치는 일정(Item)으로 바꿨다.
// 2단계 Supabase 테이블(plans, plan_items, proposals, plan_history, plan_secrets)과 1:1.

export type Status = 'booked' | 'preparing' | 'planning' | 'dream' | 'done';
export type Scope = 'abroad' | 'domestic' | 'local';
export type Visibility = 'link' | 'public';
export type Kind = 'see' | 'eat' | 'cafe' | 'shop' | 'move' | 'stay' | 'etc';

export interface Place {
  name: string;
  en?: string;
  address?: string;
  lat: number;
  lng: number;
}

/** 일정 하나의 확정 정도. ''이면 표시 안 함 */
export type ItemTag = 'booked' | 'hope' | 'maybe' | '';

export interface Item {
  id: string;
  /** 1부터 시작하는 일차. null이면 "날짜 미정" */
  day: number | null;
  time: string;
  /** 끝나는 시각 "HH:MM" (선택, ''이면 없음). 예: 16:40–17:30, 13:07 → 15:26 */
  end?: string;
  /** 예약 완료 / 희망 / 선택 (선택, 예전 일정엔 없다) */
  tag?: ItemTag;
  /** cost의 통화 (ISO 코드, ''·없음 = 원화 KRW). 예: 'JPY' */
  cur?: string;
  title: string;
  en: string;
  kind: Kind;
  place: Place | null;
  memo: string;
  cost: number | null;
  order: number;
}

export type ItemField = Exclude<keyof Item, 'id'>;

/** 예산 항목: 1인당 금액(person)인지, 다 같이 내는 전체 금액(group)인지 */
export interface BudgetItem {
  name: string;
  amount: number;
  per: 'person' | 'group';
}

/** 기장이 작성 화면에서 고치는 계획 정보 */
export interface PlanInfo {
  title: string;
  place: string;
  placeEn: string;
  country: string;
  countryCode: string;
  iata: string;
  scope: Scope;
  status: Status;
  priority: number;
  target: string | null;
  days: number;
  months: number[];
  tz: string;
  currency: string;
  cover: { scene: string; time: string };
  why: string;
  tags: string[];
  intro: string;
  coords: [number, number] | null;
  /** 몇 명이서 가는지 */
  travelers: number;
  /** 입력한 그대로의 예산 항목 */
  budgetItems: BudgetItem[];
  /** 1인 기준 예산 (budgetItems에서 서버가 계산한다. 탑승권·"시간 났다!"·도넛이 쓴다) */
  budget: Record<string, number>;
  checklist: [string, boolean][];
  /** 지도·참고 링크 (구글맵 리스트 공유 등) */
  links: { label: string; url: string }[];
  /** 함께 들르는 도시 (여러 도시 여행. 목적지 place 말고 더) — 최대 6곳 */
  via?: { name: string; en?: string; coords?: [number, number] }[];
  ownerName: string;
  visibility: Visibility;
}

export interface Plan extends PlanInfo {
  id: string;
  /** 주소 뒤에 붙는 읽기 좋은 이름 (/p/<id>/<slug>) */
  slug: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  /** 예시 계획 */
  sample?: boolean;
  /** 이 계획을 복사해서 만들었으면 원본 id */
  copiedFrom?: string;
}

/** 제안 안의 변경 하나의 결정. 없으면 아직 대기 (예전 제안은 이 칸이 없다) */
export type OpState = 'accepted' | 'rejected' | 'withdrawn' | 'superseded';

export type Op = (
  | { type: 'add'; item: Item }
  | { type: 'update'; id: string; before: Partial<Item>; after: Partial<Item> }
  | { type: 'remove'; id: string; before: Item }
) & { state?: OpState };

export type ProposalStatus = 'open' | 'accepted' | 'partial' | 'rejected' | 'withdrawn';

export interface Proposal {
  id: string;
  no: number;
  authorId: string;
  authorName: string;
  title: string;
  message: string;
  baseVersion: number;
  ops: Op[];
  status: ProposalStatus;
  createdAt: number;
  decidedAt?: number;
  note?: string;
  skipped?: number[];
}

export type HistoryKind = 'created' | 'direct' | 'meta' | 'proposed' | 'accepted' | 'partial' | 'rejected' | 'withdrawn' | 'check';

export interface HistoryEntry {
  id: string;
  at: number;
  kind: HistoryKind;
  actor: string;
  summary: string;
  proposalNo?: number;
  version: number;
}

/** 화면이 받는 묶음 (비밀번호 해시·토큰 없음) */
export interface Bundle {
  plan: Plan;
  items: Item[];
  proposals: Proposal[];
  history: HistoryEntry[];
}
