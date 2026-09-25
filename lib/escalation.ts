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
  /** On-site detection — the ranges that confirm this tier is active here. */
  atSite: SiteConfig
  /** Distant early-warning detection — reaching these ranges escalates the tier. */
  farSite: SiteConfig
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

/**
 * Each tier is evaluated at two locations. "At site" is the on-site weather
 * station that confirms the tier is actually happening here; "far site" is the
 * ring of distant stations kept under observation — if a far-site reading climbs
 * into its range, the tier escalates to the next level. Wind direction is
 * deliberately not configured here: it is always read live from whichever site
 * currently reports the highest wind speed.
 */
export const SITE_KEYS = ["atSite", "farSite"] as const
export type SiteKey = (typeof SITE_KEYS)[number]

export const SITE_META: Record<SiteKey, { name: string; hint: string }> = {
  atSite: {
    name: "At site",
    hint: "On-site station — these ranges confirm this tier is active here.",
  },
  farSite: {
    name: "Far site",
    hint: "Distant stations under observation — a reading in these ranges escalates to the next tier.",
  },
}

/**
 * The driving parameters configured per site. Wind direction is intentionally
 * excluded — it follows whichever site reports the highest live wind speed.
 */
export const SITE_METRIC_KEYS = ["windMs", "gustMs", "rainMm", "cloudPct"] as const
export type SiteMetricKey = (typeof SITE_METRIC_KEYS)[number]

export const SITE_METRIC_META: Record<SiteMetricKey, { label: string; unit: string; max: number }> = {
  windMs: { label: "Wind speed", unit: "m/s", max: 120 },
  gustMs: { label: "Wind gust", unit: "m/s", max: 150 },
  rainMm: { label: "Rainfall", unit: "mm", max: 500 },
  cloudPct: { label: "Cloud cover", unit: "%", max: 100 },
}

/** One severity band for a metric. `max: null` means open-ended (∞). */
export type MetricRange = { min: number; max: number | null; label: string }

/** One site's detection config: KM band, per-metric severity ranges, and a feed. */
export type SiteConfig = {
  /** Detection band label, e.g. "0–20 km". */
  km: string
  windMs: MetricRange[]
  gustMs: MetricRange[]
  rainMm: MetricRange[]
  cloudPct: MetricRange[]
  /** Pasteable weather-station feed for this site (renders live when linked). */
  source: SourceLink
}

const DEFAULT_WIND_RANGES: MetricRange[] = [
  { min: 0, max: 10, label: "Low" },
  { min: 10, max: 15, label: "Moderate" },
  { min: 15, max: 20, label: "High" },
  { min: 20, max: null, label: "Severe" },
]
const DEFAULT_GUST_RANGES: MetricRange[] = [
  { min: 0, max: 14, label: "Low" },
  { min: 14, max: 20, label: "Moderate" },
  { min: 20, max: 28, label: "High" },
  { min: 28, max: null, label: "Severe" },
]
const DEFAULT_RAIN_RANGES: MetricRange[] = [
  { min: 0, max: 1, label: "Trace" },
  { min: 1, max: 10, label: "Light" },
  { min: 10, max: 30, label: "Moderate" },
  { min: 30, max: null, label: "Heavy" },
]
const DEFAULT_CLOUD_RANGES: MetricRange[] = [
  { min: 0, max: 25, label: "Clear" },
  { min: 25, max: 50, label: "Partly" },
  { min: 50, max: 75, label: "Cloudy" },
  { min: 75, max: 100, label: "Overcast" },
]

function defaultSite(km: string, source: SourceLink): SiteConfig {
  return {
    km,
    windMs: DEFAULT_WIND_RANGES.map((r) => ({ ...r })),
    gustMs: DEFAULT_GUST_RANGES.map((r) => ({ ...r })),
    rainMm: DEFAULT_RAIN_RANGES.map((r) => ({ ...r })),
    cloudPct: DEFAULT_CLOUD_RANGES.map((r) => ({ ...r })),
    source: { ...source },
  }
}

/** Build a fresh At-site / Far-site pair with the default NCM station feeds. */
function levelSites(): Record<SiteKey, SiteConfig> {
  return {
    atSite: defaultSite("0–20 km", {
      label: "NCM AWS Wind · at site",
      url: "https://ghaith.ncm.gov.ae/?lang=en#aws-wind",
    }),
    farSite: defaultSite("20–80 km", {
      label: "NCM COSMO-UAE Wind · far site",
      url: "https://ghaith.ncm.gov.ae/?lang=en#cosmo-uae-wind",
    }),
  }
}

/** Built-in At-site / Far-site config per tier — fully editable in the console. */
export const DEFAULT_SITE_CONFIG: Record<AlertLevel, Record<SiteKey, SiteConfig>> = {
  green: levelSites(),
  yellow: levelSites(),
  orange: levelSites(),
  red: levelSites(),
}

/** Parse an unknown value into a clean MetricRange[] (falling back when empty). */
export function parseMetricRanges(value: unknown, fallback: MetricRange[], max: number): MetricRange[] {
  if (!Array.isArray(value)) return fallback.map((r) => ({ ...r }))
  const out: MetricRange[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const minN = Number(r.min)
    const min = Number.isFinite(minN) && minN >= 0 ? Math.min(Math.round(minN * 10) / 10, max) : 0
    let hi: number | null = null
    if (r.max !== null && r.max !== undefined && r.max !== "") {
      const maxN = Number(r.max)
      if (Number.isFinite(maxN) && maxN >= 0) hi = Math.min(Math.round(maxN * 10) / 10, max)
    }
    out.push({ min, max: hi, label: String(r.label ?? "").slice(0, 40) })
    if (out.length >= 10) break
  }
  return out.length ? out : fallback.map((r) => ({ ...r }))
}

/** Parse a per-site data source, allowing an intentionally empty (unassigned) feed. */
function parseSiteSource(value: unknown): SourceLink {
  if (!value || typeof value !== "object") return { label: "" }
  const r = value as Record<string, unknown>
  const label = String(r.label ?? "").slice(0, 80).trim()
  const url = sanitizeSourceUrl(r.url)
  if (!label && !url) return { label: "" }
  return { label: label || url!, ...(url ? { url } : {}) }
}

/** Parse an unknown value into a clean SiteConfig, falling back per field. */
export function parseSiteConfig(value: unknown, fallback: SiteConfig): SiteConfig {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    km: (String(r.km ?? "").slice(0, 40).trim() || fallback.km),
    windMs: parseMetricRanges(r.windMs, fallback.windMs, SITE_METRIC_META.windMs.max),
    gustMs: parseMetricRanges(r.gustMs, fallback.gustMs, SITE_METRIC_META.gustMs.max),
    rainMm: parseMetricRanges(r.rainMm, fallback.rainMm, SITE_METRIC_META.rainMm.max),
    cloudPct: parseMetricRanges(r.cloudPct, fallback.cloudPct, SITE_METRIC_META.cloudPct.max),
    source: r.source === undefined ? { ...fallback.source } : parseSiteSource(r.source),
  }
}

/** Live readings for one site, normalised to native SI units, compared against its ranges. */
export type SiteReadings = {
  windMs: number
  gustMs: number
  rainMm: number
  cloudPct: number
}

/** Danger metrics that can trip a site indicator (cloud cover is contextual, not a trigger). */
const SITE_TRIGGER_METRICS: { key: SiteMetricKey; label: string }[] = [
  { key: "windMs", label: "Wind" },
  { key: "gustMs", label: "Gust" },
  { key: "rainMm", label: "Rain" },
]

/**
 * Evaluate a site's configured ranges against a live reading. The site's condition is
 * "met" once any danger metric climbs into the top (most severe) configured band — this
 * is exactly what drives each tier's At-site / Near-site indicator from green to a red
 * blink, so the ladder buttons stay wired to the ranges edited in the Engineering Console.
 */
export function evaluateSite(
  config: SiteConfig,
  readings: SiteReadings,
): { met: boolean; reason: string | null } {
  for (const { key, label } of SITE_TRIGGER_METRICS) {
    const ranges = config[key]
    if (!ranges.length) continue
    const top = ranges[ranges.length - 1]
    const value = readings[key]
    if (Number.isFinite(value) && value >= top.min) {
      const unit = SITE_METRIC_META[key].unit
      const shown = Number.isInteger(value) ? String(value) : value.toFixed(1)
      return { met: true, reason: `${label} ${shown} ${unit} · ${top.label}` }
    }
  }
  return { met: false, reason: null }
}

/**
 * Per-level entry thresholds used to gate hysteresis, mirroring the live banner's
 * severity bands: gust/wind onset at 15 m/s (54 km/h) → yellow, 20 m/s (72 km/h)
 * → orange, 25 m/s (90 km/h) → red; rain (6 h accumulation) at 1 / 10 / 30 mm.
 * A held tier is only released once the reading falls below its entry minus the
 * tier's configured dead band, so noisy readings can't flap the alarm.
 */
export const LEVEL_WIND_ENTRY_MS: Record<AlertLevel, number> = { green: 0, yellow: 15, orange: 20, red: 25 }
export const LEVEL_RAIN_ENTRY_MM: Record<AlertLevel, number> = { green: 0, yellow: 1, orange: 10, red: 30 }

/** Live driving metrics compared against the entry thresholds (native SI units). */
export type HysteresisReadings = {
  /** Sustained wind (m/s). */
  windMs: number
  /** Wind gust (m/s). */
  gustMs: number
  /** Rain accumulation over the next 6 h (mm). */
  rainMm: number
}

/**
 * Apply dead-band hysteresis to a freshly-computed alert level.
 *  • Escalation (or no change) takes effect immediately — the alarm never waits to rise.
 *  • De-escalation is suppressed: the previously-held tier stays latched until every
 *    driving metric drops below that tier's entry threshold minus its dead band, then
 *    it releases one rung at a time (so a fast clear can still fall through several tiers).
 * Direction dead band is not a severity driver, so it governs directional-shift
 * significance elsewhere rather than gating the tier here.
 */
export function applyLevelHysteresis(
  raw: AlertLevel,
  held: AlertLevel | null,
  readings: HysteresisReadings,
  rules: EscalationRule[],
): AlertLevel {
  if (held == null) return raw
  const rank = (l: AlertLevel) => ESCALATION_LEVELS.indexOf(l)
  if (rank(raw) >= rank(held)) return raw
  let current = held
  while (rank(raw) < rank(current)) {
    const db = rules.find((r) => r.level === current)?.deadbands ?? DEFAULT_DEADBANDS[current]
    const windRelease = LEVEL_WIND_ENTRY_MS[current] - db.windMs
    const gustRelease = LEVEL_WIND_ENTRY_MS[current] - db.gustMs
    const rainRelease = LEVEL_RAIN_ENTRY_MM[current] - db.rainMm
    const stillHeld =
      readings.windMs > windRelease || readings.gustMs > gustRelease || readings.rainMm > rainRelease
    if (stillHeld) return current
    current = ESCALATION_LEVELS[rank(current) - 1]
  }
  return current
}

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
    atSite: DEFAULT_SITE_CONFIG.green.atSite,
    farSite: DEFAULT_SITE_CONFIG.green.farSite,
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
    atSite: DEFAULT_SITE_CONFIG.yellow.atSite,
    farSite: DEFAULT_SITE_CONFIG.yellow.farSite,
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
    atSite: DEFAULT_SITE_CONFIG.orange.atSite,
    farSite: DEFAULT_SITE_CONFIG.orange.farSite,
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
    atSite: DEFAULT_SITE_CONFIG.red.atSite,
    farSite: DEFAULT_SITE_CONFIG.red.farSite,
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

/**
 * Evaluate the live on-site sustained wind (m/s) against the Wind Event Monitor
 * ladder. Tiers are scanned strongest-first, so the active event is the highest
 * threshold the wind currently meets. A green (or absent) active tier means the
 * wind is below every alerting threshold — i.e. "if speed is less than the
 * escalation logic, it stays green" — so `met` is only true once the active
 * event is yellow or above. The live Alert Banner and the Engineering Console
 * both call this, so the wind trigger fires identically in both places.
 */
export function evaluateWindMonitor(
  windMs: number,
  tiers: WindMonitorTier[],
): { level: AlertLevel; met: boolean; tier: WindMonitorTier | null; reason: string | null } {
  const sorted = [...tiers].sort((a, b) => b.minSpeed - a.minSpeed)
  const active = Number.isFinite(windMs) ? sorted.find((t) => windMs >= t.minSpeed) ?? null : null
  const level: AlertLevel = active?.level ?? "green"
  const met = level !== "green"
  const shown = Number.isInteger(windMs) ? String(windMs) : windMs.toFixed(1)
  const reason = met && active ? `Wind ${shown} m/s ≥ ${active.minSpeed} m/s · ${active.note || cap(level)}` : null
  return { level, met, tier: active, reason }
}

/** Capitalise an alert level key for display, e.g. "red" → "Red". */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

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
    const siteDefaults = DEFAULT_SITE_CONFIG[level]
    byLevel.set(level, {
      level,
      label: String(r.label ?? "").slice(0, 80),
      km: String(r.km ?? "").slice(0, 60),
      triggers: String(r.triggers ?? "").slice(0, 600),
      sources,
      sourceLinks,
      deadbands: parseDeadbands(r.deadbands, level),
      atSite: parseSiteConfig(r.atSite, siteDefaults.atSite),
      farSite: parseSiteConfig(r.farSite, siteDefaults.farSite),
    })
  }
  // Always return in ladder order, filling any missing tier from defaults.
  const out = ESCALATION_LEVELS.map((lvl) => byLevel.get(lvl) ?? DEFAULT_RULES.find((d) => d.level === lvl)!)
  return out
}
