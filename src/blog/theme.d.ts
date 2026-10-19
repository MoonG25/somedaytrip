export const HUES: number[];
export function initTheme(): () => void;
export function toggleTheme(origin?: { x: number; y: number }): void;
export function setHue(h: number): void;
