"use client"

import { useWeather } from "@/components/weather/weather-provider"
import { LEVEL_RAIN_ENTRY_MM, LEVEL_WIND_ENTRY_MS } from "@/lib/escalation"
import type { AlertLevel, Units } from "@/lib/weather"
import { cn } from "@/lib/utils"

const LEVELS: AlertLevel[] = ["red", "orange", "yellow", "green"]

export function toMs(v: number, units: Units) {
  return (units === "metric" ? v : v * 1.609) / 3.6
}
export function toMm(v: number, units: Units) {
  return units === "metric" ? v : v * 25.4
}

export function tierFor(windMs: number, rainMm: number): AlertLevel {
  for (const l of LEVELS) {
    if (l === "green") return "green"
    if (windMs >= LEVEL_WIND_ENTRY_MS[l] || rainMm >= LEVEL_RAIN_ENTRY_MM[l]) return l
  }
  return "green"
}

export const TIER_CLASS: Record<AlertLevel, string> = {
  green: "border-alert-green/50 text-alert-green",
  yellow: "border-alert-yellow/50 text-alert-yellow",
  orange: "border-alert-orange/50 text-alert-orange",
  red: "border-alert-red/50 text-alert-red",
}

export function LiveSnapshot() {
  const { payload, location, isLoading } = useWeather()
  const c = payload?.current
  const units = payload?.units ?? "metric"

  const wind = c ? toMs(c.windSpeed, units) : null
  const gust = c ? toMs(c.windGusts, units) : null
  const rain = c ? toMm(c.precipitation, units) : null
  const cloud = c ? c.cloudCover : null
  const tier = wind != null && rain != null ? tierFor(Math.max(wind, 0), rain) : null

  const cells = [
    { label: "Wind speed", value: wind, unit: "m/s", digits: 1 },
    { label: "Wind gust", value: gust, unit: "m/s", digits: 1 },
    { label: "Rainfall", value: rain, unit: "mm", digits: 1 },
    { label: "Cloud cover", value: cloud, unit: "%", digits: 0 },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-caps">Live site readings{location ? ` · ${location.name}` : ""}</span>
        {tier ? (
          <span className={cn("rounded-md border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.14em]", TIER_CLASS[tier])}>
            Tier · {tier}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
            <dt className="label-caps">{cell.label}</dt>
            <dd className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {cell.value == null ? (isLoading ? "…" : "—") : cell.value.toFixed(cell.digits)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{cell.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
