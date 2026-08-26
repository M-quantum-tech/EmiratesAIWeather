import { Panel, PanelHeader } from "@/components/station/panel"
import { aqiBand, type AirQuality } from "@/lib/weather"
import { cn } from "@/lib/utils"

const POLLUTANT_LIMITS = {
  pm2_5: 35,
  pm10: 80,
  ozone: 120,
  nitrogenDioxide: 100,
} as const

function Pollutant({ label, value, limit }: { label: string; value: number | null; limit: number }) {
  const pct = value === null ? 0 : Math.min((value / limit) * 100, 100)
  const hot = pct > 66

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
          className={cn("h-1 rounded-full transition-all", hot ? "bg-destructive" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
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

  return (
    <Panel className="station-rise">
      <PanelHeader title="Air quality" meta="US AQI" />

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
        </div>
      </div>

      <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
        <Pollutant label="PM2.5" value={air?.pm2_5 ?? null} limit={POLLUTANT_LIMITS.pm2_5} />
        <Pollutant label="PM10" value={air?.pm10 ?? null} limit={POLLUTANT_LIMITS.pm10} />
        <Pollutant label="Ozone" value={air?.ozone ?? null} limit={POLLUTANT_LIMITS.ozone} />
        <Pollutant label="NO₂" value={air?.nitrogenDioxide ?? null} limit={POLLUTANT_LIMITS.nitrogenDioxide} />
      </div>
    </Panel>
  )
}
