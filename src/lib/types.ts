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

export interface Item {
  id: string;
  /** 1부터 시작하는 일차. null이면 "날짜 미정" */
  day: number | null;
  time: string;
  title: string;
  en: string;
  kind: Kind;
  place: Place | null;
  memo: string;
  cost: number | null;
  order: number;
}

export type ItemField = Exclude<keyof Item, 'id'>;

/** 주인이 작성 화면에서 고치는 계획 정보 */
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
  budget: Record<string, number>;
  checklist: [string, boolean][];
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

export type Op =
  | { type: 'add'; item: Item }
  | { type: 'update'; id: string; before: Partial<Item>; after: Partial<Item> }
  | { type: 'remove'; id: string; before: Item };

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
