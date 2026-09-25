import { Panel, PanelHeader } from "@/components/station/panel"
import { aqiBand, type AirQuality } from "@/lib/weather"
import { cn } from "@/lib/utils"

/** WHO / US-EPA-aligned 24h reference ceilings (µg/m³) used to scale each bar. */
const POLLUTANTS = [
  { key: "pm2_5", label: "PM2.5", limit: 35, note: "Fine particulates" },
  { key: "pm10", label: "PM10", limit: 80, note: "Coarse dust" },
  {
    key: "ozone",
    label: "Ozone",
    limit: 120,
    note: (
      <>
        Ground-level O<sub>3</sub>
      </>
    ),
  },
  {
    key: "nitrogenDioxide",
    label: (
      <>
        NO<sub>2</sub>
      </>
    ),
    limit: 100,
    note: "Traffic / combustion",
  },
  {
    key: "sulphurDioxide",
    label: (
      <>
        SO<sub>2</sub>
      </>
    ),
    limit: 40,
    note: "Industrial",
  },
  { key: "carbonMonoxide", label: "CO", limit: 4000, note: "Combustion" },
] as const

function pollutantBand(pct: number) {
  if (pct <= 33) return { label: "Good", tone: "accent" as const }
  if (pct <= 66) return { label: "Moderate", tone: "signal" as const }
  if (pct <= 100) return { label: "Elevated", tone: "signal" as const }
  return { label: "Unhealthy", tone: "destructive" as const }
}

const BAR_TONE = {
  accent: "bg-accent",
  signal: "bg-signal",
  destructive: "bg-destructive",
} as const

const TEXT_TONE = {
  accent: "text-accent",
  signal: "text-signal",
  destructive: "text-destructive",
} as const

function Pollutant({
  label,
  note,
  value,
  limit,
}: {
  label: React.ReactNode
  note: React.ReactNode
  value: number | null
  limit: number
}) {
  const rawPct = value === null ? 0 : (value / limit) * 100
  const pct = Math.min(rawPct, 100)
  const band = pollutantBand(rawPct)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-caps">{label}</span>
        <span className="font-mono text-xs tabular-nums">
          {value === null ? "—" : value.toFixed(1)}
          <span className="ml-1 text-muted-foreground">µg/m³</span>
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted">
        <div
          className={cn("h-1 rounded-full transition-all", BAR_TONE[band.tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.625rem] text-muted-foreground">{note}</span>
        <span className={cn("text-[0.625rem] font-medium", value === null ? "text-muted-foreground" : TEXT_TONE[band.tone])}>
          {value === null ? "no data" : band.label}
        </span>
      </div>
    </div>
  )
}

export function AirQualityPanel({ air }: { air: AirQuality | null }) {
  const band = aqiBand(air?.aqi ?? null)
  const aqi = air?.aqi ?? null
  const arc = aqi === null ? 0 : Math.min(aqi / 300, 1)
  const circumference = 2 * Math.PI * 42

  const toneClass = {
    good: "text-accent",
    moderate: "text-signal",
    warn: "text-signal",
    bad: "text-destructive",
    muted: "text-muted-foreground",
  }[band.tone]

  // Dominant pollutant = the one closest to / over its reference ceiling.
  const dominant = POLLUTANTS.map((p) => {
    const value = air?.[p.key] ?? null
    return { ...p, value, ratio: value === null ? -1 : value / p.limit }
  })
    .filter((p) => p.ratio >= 0)
    .sort((a, b) => b.ratio - a.ratio)[0]

  return (
    <Panel className="station-rise">
      <PanelHeader title="Air quality" meta="NCM · US AQI" />

      <div className="flex items-center gap-5 px-4 py-5">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="7" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              className={toneClass}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - arc)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl leading-none tabular-nums">{aqi === null ? "—" : Math.round(aqi)}</span>
            <span className="label-caps text-[0.5625rem]">AQI</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className={cn("text-base font-medium text-pretty", toneClass)}>{band.label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{band.note}</p>
          {dominant && (
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              Lead pollutant:{" "}
              <span className="font-medium text-foreground">{dominant.label}</span>
              {dominant.value !== null && (
                <span className="font-mono tabular-nums"> · {dominant.value.toFixed(1)} µg/m³</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-4 border-t border-border px-4 py-4 sm:grid-cols-2">
        {POLLUTANTS.map((p) => (
          <Pollutant key={p.key} label={p.label} note={p.note} value={air?.[p.key] ?? null} limit={p.limit} />
        ))}
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
          Source: NCM air-quality network, harmonized to the US EPA AQI scale. Bars scale each pollutant against WHO
          24-hour reference limits.
        </p>
      </div>
    </Panel>
  )
}
