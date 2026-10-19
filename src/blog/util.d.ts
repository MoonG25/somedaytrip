export function esc(s: unknown): string;
export function clamp(v: number, a: number, b: number): number;
export function rafThrottle<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void;
export function seoulToday(): string;
export function seoulMonth(): number;
export function fmtWon(n: number): string;
export function fmtDot(iso: string): string;
export function reducedMotion(): boolean;
