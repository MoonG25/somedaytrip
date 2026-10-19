export function renderPlansPage(opts: { list: any[]; mine?: string[]; sort?: string; status?: string }): string;
export function mountPlansPage(root: HTMLElement, opts: { list: any[]; mine?: string[]; navigate: (href: string) => void }): () => void;
