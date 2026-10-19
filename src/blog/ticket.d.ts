export function ddayLabel(p: any): { big: string; small: string };
export function ticketHTML(p: any, opts?: { big?: boolean; fit?: any; mine?: boolean; preview?: boolean; open?: number }): string;
export function monthsStrip(months?: number[], opts?: { big?: boolean }): string;
export function readyRing(pct: number, size?: number): string;
export function bindTickets(root: HTMLElement, navigate: (href: string) => void): () => void;
export function donut(budget: Record<string, number>): string;
export function bindDonut(root: ParentNode): void;
