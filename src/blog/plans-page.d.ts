export function renderPlansPage(opts: { list: any[]; mine?: string[]; sort?: string; status?: string; open?: Record<string, number> }): string;
export function mountPlansPage(root: HTMLElement, opts: { list: any[]; mine?: string[]; navigate: (href: string) => void; open?: Record<string, number> }): () => void;
