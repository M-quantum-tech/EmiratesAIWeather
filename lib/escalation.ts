import type { AlertLevel } from "@/lib/weather"

/**
 * A single data source behind a tier. When `url` is a valid http(s) link the
 * front end renders it as a clickable, connected source chip; otherwise it is
 * shown as a plain label.
 */
export type SourceLink = {
  label: string
  url?: string
}

/** One tier of the NCM-style escalation ladder. */
export type EscalationRule = {
  level: AlertLevel
  /** Short tier label, e.g. "L2 · Yellow". */
  label: string
  /** Proximity band, e.g. "within 50 km". */
  km: string
  /** Trigger criteria that promote the model to this tier. */
  triggers: string
  /** Legacy plain-text data-source summary (kept for backward compatibility). */
  sources: string
  /** Structured data sources — each optionally carries a link to render live. */
  sourceLinks: SourceLink[]
}

export const ESCALATION_LEVELS: AlertLevel[] = ["green", "yellow", "orange", "red"]

/** Accept only safe, absolute http(s) links for a rendered data source. */
export function sanitizeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const u = new URL(trimmed)
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString()
  } catch {
    return undefined
  }
  return undefined
}

/** Parse an unknown value into a clean SourceLink[]. */
export function parseSourceLinks(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) return []
  const out: SourceLink[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const label = String(r.label ?? "").slice(0, 80).trim()
    const url = sanitizeSourceUrl(r.url)
    if (!label && !url) continue
    out.push({ label: label || url!, ...(url ? { url } : {}) })
    if (out.length >= 12) break
  }
  return out
}

/** Derive the legacy summary string from structured source links. */
export function sourcesSummary(links: SourceLink[]): string {
  return links.map((l) => l.label).join(" · ")
}

/**
 * Built-in escalation ladder. The Engineering Console can override these and
 * persist them; the live alert banner reads the effective set from /api/escalation.
 */
export const DEFAULT_RULES: EscalationRule[] = [
  {
    level: "green",
    label: "L1 · Green",
    km: "60 km +",
    triggers:
      "Convection 60 km + · gust under 15 m/s · rain under 1 mm · no weather warnings under 50 km from location — all clear",
    sources: "Open-Meteo · Satellite · NCM",
    sourceLinks: [
      { label: "Open-Meteo", url: "https://open-meteo.com" },
      { label: "Satellite" },
      { label: "NCM", url: "https://www.ncm.gov.ae/?lang=en" },
    ],
  },
  {
    level: "yellow",
    label: "L2 · Yellow",
    km: "within 50 km",
    triggers: "Intensifying convection under 30 km · any warning alarm on site · satellite image warnings",
    sources: "Satellite · NCM Al Bahar",
    sourceLinks: [
      { label: "Satellite" },
      { label: "NCM Al Bahar", url: "https://www.ncm.gov.ae/albahar?lang=en" },
    ],
  },
  {
    level: "orange",
    label: "L3 · Orange",
    km: "within 30 km",
    triggers:
      "Satellite image · intensifying convection under 20 km + Level 2 alerts · radar precipitation · NCM website alerts",
    sources: "Satellite · Radar · NCM Al Bahar",
    sourceLinks: [
      { label: "Satellite" },
      { label: "Radar" },
      { label: "NCM Al Bahar", url: "https://www.ncm.gov.ae/albahar?lang=en" },
    ],
  },
  {
    level: "red",
    label: "L4 · Red",
    km: "within 20 km",
    triggers: "Convection under 20 km + L3 · radar precipitation · active NCM alert — take shelter",
    sources: "Radar · NCM Al Bahar",
    sourceLinks: [
      { label: "Radar" },
      { label: "NCM Al Bahar", url: "https://www.ncm.gov.ae/albahar?lang=en" },
    ],
  },
]

/**
 * One tier of the Wind Event Monitor. When the live on-site wind (m/s) meets or
 * exceeds `minSpeed`, this tier becomes the active wind event. Tiers are
 * editable in the Engineering Console so thresholds can change without a deploy.
 */
export type WindMonitorTier = {
  id: string
  /** On-site sustained wind threshold in m/s (activates at ≥ this value). */
  minSpeed: number
  /** Alert level this wind event maps to (drives colour + banner tier). */
  level: AlertLevel
  /** Severity label, e.g. "High · High · High". */
  label: string
  /** Operator note, e.g. "Level 3 alert". */
  note: string
}

/** Default Wind Event Monitor ladder — mirrors the NCM high-wind escalation. */
export const DEFAULT_WIND_MONITOR: WindMonitorTier[] = [
  { id: "hhh-16", minSpeed: 16, level: "orange", label: "High · High · High", note: "Level 3 alert" },
  { id: "hhh-14", minSpeed: 14, level: "orange", label: "High · High · High", note: "Level 3 alert" },
  { id: "hh-12", minSpeed: 12, level: "yellow", label: "High · High", note: "Level 2 warning alert" },
]

/** Validate an unknown value into a clean WindMonitorTier[] (or null if invalid). */
export function parseWindMonitor(value: unknown): WindMonitorTier[] | null {
  if (!Array.isArray(value)) return null
  const out: WindMonitorTier[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const minSpeed = Number(r.minSpeed)
    if (!Number.isFinite(minSpeed) || minSpeed < 0 || minSpeed > 120) continue
    const level = r.level as AlertLevel
    if (!ESCALATION_LEVELS.includes(level)) continue
    out.push({
      id: String(r.id ?? `tier-${out.length}`).slice(0, 40) || `tier-${out.length}`,
      minSpeed: Math.round(minSpeed * 10) / 10,
      level,
      label: String(r.label ?? "").slice(0, 60),
      note: String(r.note ?? "").slice(0, 80),
    })
    if (out.length >= 8) break
  }
  if (out.length === 0) return null
  // Strongest threshold first so the front end can pick the first match.
  return out.sort((a, b) => b.minSpeed - a.minSpeed)
}

/** Shape of one buzzer tone profile. */
export type BuzzerTone = {
  pattern: number[]
  step: number
  interval: number
  gain: number
  type: OscillatorType
}

/**
 * Per-level buzzer character — each tier has its own pitch set, cadence and
 * loudness so the alarm is audibly identifiable, escalating from a soft green
 * chime to an urgent red three-tone.
 */
export const BUZZER_TONE: Record<AlertLevel, BuzzerTone> = {
  green: { pattern: [523], step: 0, interval: 2600, gain: 0.05, type: "sine" },
  yellow: { pattern: [659, 784], step: 0.26, interval: 1800, gain: 0.09, type: "triangle" },
  orange: { pattern: [784, 988], step: 0.24, interval: 1200, gain: 0.13, type: "square" },
  red: { pattern: [988, 740, 988], step: 0.22, interval: 820, gain: 0.18, type: "square" },
}

/** Validate an unknown value into a clean EscalationRule[] (or null if invalid). */
export function parseRules(value: unknown): EscalationRule[] | null {
  if (!Array.isArray(value)) return null
  const byLevel = new Map<AlertLevel, EscalationRule>()
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const level = r.level as AlertLevel
    if (!ESCALATION_LEVELS.includes(level)) continue
    const sourceLinks = parseSourceLinks(r.sourceLinks)
    const sources = sourceLinks.length ? sourcesSummary(sourceLinks) : String(r.sources ?? "").slice(0, 200)
    byLevel.set(level, {
      level,
      label: String(r.label ?? "").slice(0, 80),
      km: String(r.km ?? "").slice(0, 60),
      triggers: String(r.triggers ?? "").slice(0, 600),
      sources,
      sourceLinks,
    })
  }
  // Always return in ladder order, filling any missing tier from defaults.
  const out = ESCALATION_LEVELS.map((lvl) => byLevel.get(lvl) ?? DEFAULT_RULES.find((d) => d.level === lvl)!)
  return out
}
