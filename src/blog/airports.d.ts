export function iataFor(...names: (string | undefined | null)[]): string;
export function airportsFor(...names: (string | undefined | null)[]): { code: string; name: string }[];
export const AIRPORT_NAME: Record<string, string>;
