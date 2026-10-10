import type { SiteKey, SiteReadings } from "@/lib/escalation"

/**
 * Ghaith mirror — the primary data source for the Escalation panel and the Wind
 * Event Monitor. ghaith.ncm.gov.ae exposes no public API and refuses server-side
 * connections, so values are mirrored INDIRECTLY: an operator (Engineering
 * Console) or a UAE-side relay pushes the readings shown on Ghaith #aws-wind
 * (at site) and #cosmo-uae-wind (far site) into the app. While a site's mirror is
 * fresh it overrides the model grid; once stale the grid takes over again.
 */

export const GHAITH_FEEDS: Record<SiteKey, { label: string; url: string }> = {
  atSite: { label: "Ghaith AWS wind", url: "https://ghaith.ncm.gov.ae/#aws-wind" },
  farSite: { label: "Ghaith COSMO-UAE wind", url: "https://ghaith.ncm.gov.ae/#cosmo-uae-wind" },
}

export const DEFAULT_MIRROR_TTL_MIN = 15

export type MirrorSite = SiteReadings & {
  observedAt: string
  via: "console" | "relay" | "public"
}

export type GhaithMirror = {
  ttlMin: number
  atSite: MirrorSite | null
  farSite: MirrorSite | null
}

export const EMPTY_MIRROR: GhaithMirror = { ttlMin: DEFAULT_MIRROR_TTL_MIN, atSite: null, farSite: null }

function num(v: unknown, max: number): number | null {
  const n = typeof v === "string" ? Number(v) : v
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) return null
  return Math.round(n * 100) / 100
}

export function parseMirrorSite(value: unknown, via: MirrorSite["via"]): MirrorSite | null {
  if (!value || typeof value !== "object") return null
  const r = value as Record<string, unknown>
  const windMs = num(r.windMs, 100)
  const gustMs = num(r.gustMs, 120)
  const rainMm = num(r.rainMm, 500)
  const cloudPct = num(r.cloudPct, 100)
  if (windMs == null || gustMs == null || rainMm == null || cloudPct == null) return null
  const t = typeof r.observedAt === "string" ? Date.parse(r.observedAt) : NaN
  const observedAt = Number.isFinite(t) && t <= Date.now() + 60_000 ? new Date(t).toISOString() : new Date().toISOString()
  return { windMs, gustMs, rainMm, cloudPct, observedAt, via: r.via === "relay" || r.via === "console" || r.via === "public" ? r.via : via }
}

export function parseMirror(value: unknown): GhaithMirror {
  if (!value || typeof value !== "object") return { ...EMPTY_MIRROR }
  const r = value as Record<string, unknown>
  const ttl = num(r.ttlMin, 1440)
  return {
    ttlMin: ttl && ttl >= 1 ? Math.round(ttl) : DEFAULT_MIRROR_TTL_MIN,
    atSite: parseMirrorSite(r.atSite, "console"),
    farSite: parseMirrorSite(r.farSite, "console"),
  }
}

export function isFresh(site: MirrorSite | null, ttlMin: number, now = Date.now()): site is MirrorSite {
  return !!site && now - Date.parse(site.observedAt) <= ttlMin * 60_000
}

/** Overlay fresh mirror readings onto grid readings — mirror is primary per site. */
export function applyMirror(
  grid: Record<SiteKey, SiteReadings>,
  mirror: GhaithMirror | null | undefined,
  now = Date.now(),
): { readings: Record<SiteKey, SiteReadings>; source: Record<SiteKey, "ghaith" | "grid"> } {
  const pick = (key: SiteKey) => {
    const m = mirror?.[key] ?? null
    if (mirror && isFresh(m, mirror.ttlMin, now)) {
      return { r: { windMs: m.windMs, gustMs: m.gustMs, rainMm: m.rainMm, cloudPct: m.cloudPct }, s: "ghaith" as const }
    }
    return { r: grid[key], s: "grid" as const }
  }
  const a = pick("atSite")
  const f = pick("farSite")
  return { readings: { atSite: a.r, farSite: f.r }, source: { atSite: a.s, farSite: f.s } }
}
