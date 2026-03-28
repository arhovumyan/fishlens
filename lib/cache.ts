interface CacheEntry {
  value: unknown;
  timestamp: number;
}

const TTL = 15 * 60 * 1000; // 15 minutes
const MAX_ENTRIES = 50;
const cache = new Map<string, CacheEntry>();

export function getCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(key: string, value: unknown): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    // Evict oldest entry (first inserted in Map iteration order)
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, timestamp: Date.now() });
}
