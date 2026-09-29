/**
 * Persistent media cache keyed by `attachment.id` (docs/adr/0013). The
 * browser's HTTP cache never hits for our media — every message fetch signs
 * a new presigned URL (docs/adr/0007), so the URL is a different cache key
 * each time. Cache Storage under a synthetic, URL-independent key fixes that.
 *
 * LRU-bounded by `CACHE_BUDGET_BYTES` via a small `{id → size, lastUsed}`
 * index in localStorage. Every call degrades to "not cached" when Cache
 * Storage or localStorage is unavailable (private mode, plain http, tests).
 */

const CACHE_NAME = "gl-media-v1";
const INDEX_KEY = "gl-media-index";
const CACHE_BUDGET_BYTES = 300 * 1024 * 1024;
const MAX_CACHEABLE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CACHEABLE_AV_BYTES = 5 * 1024 * 1024;

type CacheIndex = Record<string, { size: number; lastUsed: number }>;

function cacheKey(id: string): string {
  return `https://media.local/${id}`;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function readIndex(): CacheIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as CacheIndex) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: CacheIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Quota/blocked storage — the cache still works, only LRU bookkeeping is lost.
  }
}

/** Images up to 20 MB, audio/video up to 5 MB — a large video always
 * streams instead of being pinned in the cache. */
export function isCacheableMedia(mime: string, size: number): boolean {
  if (mime.startsWith("image/")) return size <= MAX_CACHEABLE_IMAGE_BYTES;
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return size <= MAX_CACHEABLE_AV_BYTES;
  return false;
}

export async function getCachedMedia(id: string): Promise<Blob | null> {
  const cache = await openCache();
  if (!cache) return null;
  try {
    const response = await cache.match(cacheKey(id));
    if (!response) return null;
    const index = readIndex();
    const entry = index[id];
    if (entry) {
      entry.lastUsed = Date.now();
      writeIndex(index);
    }
    return await response.blob();
  } catch {
    return null;
  }
}

export async function putCachedMedia(id: string, blob: Blob): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(
      cacheKey(id),
      new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }),
    );
  } catch {
    return;
  }

  const index = readIndex();
  index[id] = { size: blob.size, lastUsed: Date.now() };
  let total = Object.values(index).reduce((sum, entry) => sum + entry.size, 0);
  const evicted = new Set<string>();
  const oldestFirst = Object.entries(index).sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
  for (const [evictId, entry] of oldestFirst) {
    if (total <= CACHE_BUDGET_BYTES) break;
    if (evictId === id) continue;
    await cache.delete(cacheKey(evictId)).catch(() => false);
    total -= entry.size;
    evicted.add(evictId);
  }
  writeIndex(Object.fromEntries(Object.entries(index).filter(([key]) => !evicted.has(key))));
}
