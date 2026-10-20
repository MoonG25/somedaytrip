export function blankPlan(): any;
export function renderComposer(opts: { mode?: 'new' | 'edit' | 'copy'; copiedCount?: number; account?: { nick: string } | null }): string;
export function mountComposer(
  root: HTMLElement,
  opts: { mode?: 'new' | 'edit' | 'copy'; initial?: any; account?: { nick: string } | null; onSubmit: (data: any, extra: any) => Promise<string | null> }
): () => void;
