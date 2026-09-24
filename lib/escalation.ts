import type { AlertLevel } from "@/lib/weather"

/** One tier of the NCM-style escalation ladder. */
export type EscalationRule = {
  level: AlertLevel
  /** Short tier label, e.g. "L2 · Yellow". */
  label: string
  /** Proximity band, e.g. "within 50 km". */
  km: string
  /** Trigger criteria that promote the model to this tier. */
  triggers: string
  /** Data sources behind the tier. */
  sources: string
}

export const ESCALATION_LEVELS: AlertLevel[] = ["green", "yellow", "orange", "red"]

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
  },
  {
    level: "yellow",
    label: "L2 · Yellow",
    km: "within 50 km",
    triggers: "Intensifying convection under 30 km · any warning alarm on site · satellite image warnings",
    sources: "Satellite · NCM Al Bahar",
  },
  {
    level: "orange",
    label: "L3 · Orange",
    km: "within 30 km",
    triggers:
      "Satellite image · intensifying convection under 20 km + Level 2 alerts · radar precipitation · NCM website alerts",
    sources: "Satellite · Radar · NCM Al Bahar",
  },
  {
    level: "red",
    label: "L4 · Red",
    km: "within 20 km",
    triggers: "Convection under 20 km + L3 · radar precipitation · active NCM alert — take shelter",
    sources: "Radar · NCM Al Bahar",
  },
]

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
    byLevel.set(level, {
      level,
      label: String(r.label ?? "").slice(0, 80),
      km: String(r.km ?? "").slice(0, 60),
      triggers: String(r.triggers ?? "").slice(0, 600),
      sources: String(r.sources ?? "").slice(0, 200),
    })
  }
  // Always return in ladder order, filling any missing tier from defaults.
  const out = ESCALATION_LEVELS.map((lvl) => byLevel.get(lvl) ?? DEFAULT_RULES.find((d) => d.level === lvl)!)
  return out
}
