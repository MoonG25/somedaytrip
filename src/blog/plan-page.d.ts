export function renderPlanHero(p: any, opts: { owner?: boolean; nowMonth: number }): string;
export function renderPlanStory(p: any, opts: { nowMonth: number }): string;
export function renderPrep(p: any, opts: { owner?: boolean }): string;
export function mountPlanPage(root: HTMLElement, p: any, opts?: { owner?: boolean; onCheck?: (i: number, done: boolean) => Promise<boolean>; navigate?: (href: string) => void }): () => void;
