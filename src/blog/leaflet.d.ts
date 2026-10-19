export function loadLeaflet(): Promise<any>;
export function createMap(L: any, el: HTMLElement, opts?: Record<string, unknown>): any;
export function destroyMap(map: any): void;
export function pinIcon(L: any, opts?: { label?: string; active?: boolean; size?: number; kind?: string }): any;
