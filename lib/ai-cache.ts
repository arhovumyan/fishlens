interface AICacheEntry {
  value: string;
  timestamp: number;
}

const AI_TTL = 60 * 60 * 1000; // 60 minutes
const AI_MAX_ENTRIES = 200;
const cache = new Map<string, AICacheEntry>();

export function aiCacheKey(...parts: string[]): string {
  return parts.join("::");
}

export function getAICache(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > AI_TTL) {
    cache.delete(key);
    return null;
  }
  console.log(`[ai-cache] hit: ${key.slice(0, 80)}`);
  return entry.value;
}

export function setAICache(key: string, value: string): void {
  if (cache.size >= AI_MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, timestamp: Date.now() });
}
