export function blankPlan(): any;
export function renderComposer(opts: { mode?: 'new' | 'edit' | 'copy'; copiedCount?: number }): string;
export function mountComposer(root: HTMLElement, opts: { mode?: 'new' | 'edit' | 'copy'; initial?: any; onSubmit: (data: any, extra: any) => Promise<string | null> }): () => void;
