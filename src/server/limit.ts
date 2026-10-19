// 아주 작은 횟수 제한 (서버 인스턴스 메모리). 서버리스라 인스턴스마다 따로 세지만, 한 사람의 연속 남용은 충분히 막는다
const buckets = new Map<string, number[]>();

export function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'local').trim();
}

/** windowMs 안에 max번까지. 넘으면 false */
export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.set(key, list);
    return false;
  }
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}
