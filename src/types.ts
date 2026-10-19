// 섬데트의 데이터 모양. 2단계에서 Supabase 테이블(plans, plan_items, proposals, plan_history)과 1:1로 맞춘다.

export type Scope = 'local' | 'domestic' | 'abroad';

export interface Place {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

/** 날짜를 정했거나, 아직 "언젠가"(며칠짜리 코스인지만 정함) */
export type When =
  | { mode: 'dates'; start: string; end: string }
  | { mode: 'someday'; days: number; season?: string };

export type Kind = 'see' | 'eat' | 'cafe' | 'shop' | 'move' | 'stay' | 'etc';

export interface Item {
  id: string;
  /** 1부터 시작하는 일차. null이면 "날짜 미정 후보" */
  day: number | null;
  time: string;
  title: string;
  kind: Kind;
  place: Place | null;
  memo: string;
  cost: number | null;
  order: number;
}

export type ItemField = Exclude<keyof Item, 'id'>;

export interface Plan {
  id: string;
  title: string;
  emoji: string;
  scope: Scope;
  place: Place | null;
  when: When;
  memo: string;
  ownerName: string;
  hue: number;
  /** 일정이 바뀔 때마다 1씩 오른다. 제안이 어느 시점을 보고 만들어졌는지 비교할 때 쓴다 */
  version: number;
  createdAt: number;
  updatedAt: number;
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
  /** 부분 수락에서 빠진 변경의 번호 */
  skipped?: number[];
}

export type HistoryKind = 'created' | 'direct' | 'meta' | 'proposed' | 'accepted' | 'partial' | 'rejected' | 'withdrawn';

export interface HistoryEntry {
  id: string;
  at: number;
  kind: HistoryKind;
  actor: string;
  summary: string;
  proposalNo?: number;
  version: number;
}

/** 화면이 받는 계획 묶음. 비밀번호 해시 같은 비밀 정보는 들어 있지 않다 */
export interface Bundle {
  plan: Plan;
  items: Item[];
  proposals: Proposal[];
  history: HistoryEntry[];
}

export interface PlanInput {
  title: string;
  emoji: string;
  scope: Scope;
  place: Place | null;
  when: When;
  memo: string;
  ownerName: string;
}

export interface Me {
  id: string;
  name: string;
}
