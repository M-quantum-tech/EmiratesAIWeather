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

/**
 * Per-tier dead bands (hysteresis). A tier only engages once the live reading
 * exceeds its threshold by the dead band, and only releases once it drops back
 * below by the same margin — this stops the alarm flapping on noisy readings.
 * Each band pairs with the tier's KM proximity range for intensifying clouds.
 */
export type TierDeadbands = {
  /** Wind speed dead band (m/s). */
  windMs: number
  /** Wind gust dead band (m/s). */
  gustMs: number
  /** Wind direction dead band (°). */
  directionDeg: number
  /** Rainfall dead band (mm). */
  rainMm: number
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
  /** Hysteresis dead bands that gate this tier, paired with its KM range. */
  deadbands: TierDeadbands
}

/** Built-in dead bands per tier — widen as severity climbs to avoid flapping. */
export const DEFAULT_DEADBANDS: Record<AlertLevel, TierDeadbands> = {
  green: { windMs: 1, gustMs: 2, directionDeg: 20, rainMm: 0.5 },
  yellow: { windMs: 1.5, gustMs: 2.5, directionDeg: 15, rainMm: 1 },
  orange: { windMs: 2, gustMs: 3, directionDeg: 10, rainMm: 2 },
  red: { windMs: 2.5, gustMs: 4, directionDeg: 8, rainMm: 3 },
}

/** Parse an unknown value into a clean TierDeadbands, falling back per level. */
export function parseDeadbands(value: unknown, level: AlertLevel): TierDeadbands {
  const d = DEFAULT_DEADBANDS[level]
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const num = (v: unknown, fallback: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : fallback
  }
  return {
    windMs: num(r.windMs, d.windMs, 60),
    gustMs: num(r.gustMs, d.gustMs, 80),
    directionDeg: num(r.directionDeg, d.directionDeg, 180),
    rainMm: num(r.rainMm, d.rainMm, 200),
  }
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
    deadbands: { ...DEFAULT_DEADBANDS.green },
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
    deadbands: { ...DEFAULT_DEADBANDS.yellow },
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
    deadbands: { ...DEFAULT_DEADBANDS.orange },
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
    deadbands: { ...DEFAULT_DEADBANDS.red },
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

/**
 * Configurable upstream feed behind the live Wind Speed & Wind Gust readouts.
 * Defaults to the NCM Ghaith COSMO-UAE 10 m surface-wind viewer so every wind
 * value on the dashboard links back to its official source, and the link is
 * editable in the Engineering Console without a deploy.
 */
export type WindSourceConfig = {
  /** Source name shown on the wind speed & gust readouts. */
  label: string
  /** Absolute http(s) link to the live wind viewer. */
  url: string
}

/** Default wind feed — NCM Ghaith COSMO-UAE surface wind. */
export const DEFAULT_WIND_SOURCE: WindSourceConfig = {
  label: "NCM COSMO-UAE Wind",
  url: "https://ghaith.ncm.gov.ae/?lang=en#cosmo-uae-wind",
}

/** Validate an unknown value into a clean WindSourceConfig (or null if invalid). */
export function parseWindSource(value: unknown): WindSourceConfig | null {
  if (!value || typeof value !== "object") return null
  const r = value as Record<string, unknown>
  const label = String(r.label ?? "").slice(0, 80).trim()
  const url = sanitizeSourceUrl(r.url)
  if (!label && !url) return null
  return { label: label || DEFAULT_WIND_SOURCE.label, url: url ?? DEFAULT_WIND_SOURCE.url }
}

/**
 * Configurable NCM cloud / satellite feed. Paste the NCM cloud viewer link that
 * tracks intensifying convection; every tier's KM proximity band is read against
 * this imagery. Editable in the Engineering Console without a deploy.
 */
export type CloudSourceConfig = {
  /** Source name shown on the cloud / satellite readout. */
  label: string
  /** Absolute http(s) link to the live NCM cloud / satellite viewer. */
  url: string
}

/** Default cloud feed — NCM Ghaith viewer showing live cloud / satellite layers. */
export const DEFAULT_CLOUD_SOURCE: CloudSourceConfig = {
  label: "NCM Cloud / Satellite",
  url: "https://ghaith.ncm.gov.ae/?lang=en",
}

/** Validate an unknown value into a clean CloudSourceConfig (or null if invalid). */
export function parseCloudSource(value: unknown): CloudSourceConfig | null {
  if (!value || typeof value !== "object") return null
  const r = value as Record<string, unknown>
  const label = String(r.label ?? "").slice(0, 80).trim()
  const url = sanitizeSourceUrl(r.url)
  if (!label && !url) return null
  return { label: label || DEFAULT_CLOUD_SOURCE.label, url: url ?? DEFAULT_CLOUD_SOURCE.url }
}

/**
 * The four Live Trend + AI Projection panels. Each can carry any number of
 * reference-source links that the Engineering Console assigns now or leaves
 * ready to fill in future — mirroring the escalation data-source pattern.
 */
export const TREND_METRIC_KEYS = ["comfort", "wind", "sky", "dni"] as const
export type TrendMetricKey = (typeof TREND_METRIC_KEYS)[number]

export const TREND_METRIC_LABELS: Record<TrendMetricKey, string> = {
  comfort: "Temperature & comfort",
  wind: "Wind & air",
  sky: "Sky & rainfall",
  dni: "Solar DNI",
}

/** One Live Trend panel and the reference feeds assigned behind it. */
export type TrendSourceGroup = {
  key: TrendMetricKey
  /** Display label for the panel (kept in sync from TREND_METRIC_LABELS). */
  label: string
  /** Reference-source links — each optionally carries a live http(s) link. */
  links: SourceLink[]
}

/** Default Live Trend source map — one empty group per panel, ready to assign. */
export const DEFAULT_TREND_SOURCES: TrendSourceGroup[] = TREND_METRIC_KEYS.map((key) => ({
  key,
  label: TREND_METRIC_LABELS[key],
  links: [],
}))

/** Validate an unknown value into a clean TrendSourceGroup[] (always all 4 panels). */
export function parseTrendSources(value: unknown): TrendSourceGroup[] | null {
  if (!Array.isArray(value)) return null
  const byKey = new Map<TrendMetricKey, TrendSourceGroup>()
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const key = r.key as TrendMetricKey
    if (!TREND_METRIC_KEYS.includes(key)) continue
    byKey.set(key, { key, label: TREND_METRIC_LABELS[key], links: parseSourceLinks(r.links) })
  }
  // Always return every panel in a stable order, filling gaps with empties.
  return TREND_METRIC_KEYS.map(
    (key) => byKey.get(key) ?? { key, label: TREND_METRIC_LABELS[key], links: [] },
  )
}

/** Shape of one buzzer tone profile. */
export type BuzzerTone = {
  pattern: number[]
  step: number
  interval: number
  gain: number
  type: OscillatorType
  /** Seconds each note is held (default 0.2). Longer = more of a sustained horn. */
  hold?: number
  /** Cents of detune on a layered second oscillator — adds a klaxon-like beat/grit. */
  detune?: number
  /** Add an octave-below layer for extra body and perceived loudness. */
  sub?: boolean
}

/**
 * Per-level buzzer character — each tier has its own pitch set, cadence and
 * loudness so the alarm is audibly identifiable, escalating from a soft green
 * chime to a loud red danger horn. Higher tiers use richer waveforms, detuned
 * layering and a sub-octave so they read as a big, urgent klaxon.
 */
export const BUZZER_TONE: Record<AlertLevel, BuzzerTone> = {
  green: { pattern: [523], step: 0, interval: 2600, gain: 0.08, type: "sine", hold: 0.22 },
  yellow: { pattern: [659, 784], step: 0.24, interval: 1500, gain: 0.16, type: "triangle", hold: 0.24 },
  orange: { pattern: [740, 932], step: 0.22, interval: 1000, gain: 0.24, type: "sawtooth", hold: 0.3, detune: 14, sub: true },
  red: { pattern: [466, 370, 466], step: 0.34, interval: 640, gain: 0.4, type: "sawtooth", hold: 0.42, detune: 22, sub: true },
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
      deadbands: parseDeadbands(r.deadbands, level),
    })
  }
  // Always return in ladder order, filling any missing tier from defaults.
  const out = ESCALATION_LEVELS.map((lvl) => byLevel.get(lvl) ?? DEFAULT_RULES.find((d) => d.level === lvl)!)
  return out
}
