// In-memory stale cache + rate-limit-aware fetch for Open-Meteo routes.
//
// The free Open-Meteo tier throttles bursts with HTTP 429. The app polls several
// endpoints every minute across multiple stations, so a transient 429 used to
// blank the entire UI. These helpers (1) retry a 429 once after a short backoff,
// and (2) keep the last good payload per cache key so a still-throttled request
// serves recent data (flagged `stale`) instead of a hard error.

type CacheEntry<T> = { payload: T; at: number }

const STORE = new Map<string, CacheEntry<unknown>>()

// How long a cached payload may still be served after upstream starts failing.
const STALE_TTL_MS = 30 * 60 * 1000

export function readStale<T>(key: string): { payload: T; ageMs: number } | null {
  const entry = STORE.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  const ageMs = Date.now() - entry.at
  if (ageMs > STALE_TTL_MS) return null
  return { payload: entry.payload, ageMs }
}

export function writeStale<T>(key: string, payload: T): void {
  STORE.set(key, { payload, at: Date.now() })
}

/**
 * Fetch that tolerates Open-Meteo's 429 throttling: on a 429 it waits briefly and
 * retries once. Any other status (or success) is returned as-is to the caller.
 */
export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<Response> {
  const first = await fetch(input, init)
  if (first.status !== 429) return first
  await new Promise((resolve) => setTimeout(resolve, 750))
  return fetch(input, init)
}
