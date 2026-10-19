export const CITIES: [string, string, string, number, number][];
export function findCities(q: string, limit?: number): { name: string; en: string; countryCode: string; country: string; city: string; lat: number; lng: number; kind: 'region'; source: 'list'; address: string }[];
