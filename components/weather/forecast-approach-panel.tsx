"use client"

import { CloudFog, Navigation2, ShieldCheck, TriangleAlert } from "lucide-react"
import type { AlertLevel, HourlyReading, Units } from "@/lib/weather"
import { ESCALATION_LEVELS, type BuzzerMetricKey, type TierThresholds } from "@/lib/escalation"
import { cn } from "@/lib/utils"

const HOURS_AHEAD = 6
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const FOG_CODES = new Set([45, 48])
const RANK: Record<AlertLevel, number> = { green: 0, yellow: 1, orange: 2, red: 3 }

const LEVEL_NAME: Record<AlertLevel, string> = {
  green: "Green · Tier 1",
  yellow: "Yellow · Tier 2",
  orange: "Orange · Tier 3",
  red: "Red · Tier 4",
}
const CELL: Record<AlertLevel, string> = {
  green: "bg-alert-green/10 text-foreground",
  yellow: "bg-alert-yellow/20 text-foreground ring-1 ring-inset ring-alert-yellow/60",
  orange: "bg-alert-orange/20 text-foreground ring-1 ring-inset ring-alert-orange/60",
  red: "bg-alert-red/25 text-foreground ring-1 ring-inset ring-alert-red/70",
}
const CHIP: Record<AlertLevel, string> = {
  green: "border-alert-green/50 bg-alert-green/10 text-alert-green",
  yellow: "border-alert-yellow/60 bg-alert-yellow/15 text-alert-yellow",
  orange: "border-alert-orange/60 bg-alert-orange/15 text-alert-orange",
  red: "border-alert-red/60 bg-alert-red/15 text-alert-red",
}

const METRICS: { key: BuzzerMetricKey; label: string; unit: string; digits: number }[] = [
  { key: "windMs", label: "Wind speed", unit: "m/s", digits: 1 },
  { key: "gustMs", label: "Wind gust", unit: "m/s", digits: 1 },
  { key: "rainMm", label: "Rain", unit: "mm", digits: 1 },
  { key: "cloudPct", label: "Cloud cover", unit: "%", digits: 0 },
]

type HourPoint = {
  label: string
  values: Record<BuzzerMetricKey, number>
  directionDeg: number
  fog: boolean
  level: AlertLevel
  driver: string | null
}

function compass(deg: number) {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

function metricLevel(value: number, key: BuzzerMetricKey, thresholds: TierThresholds): AlertLevel {
  let level: AlertLevel = "green"
  for (const l of ESCALATION_LEVELS) {
    const entry = thresholds[l][key]
    if (l !== "green" && entry != null && value >= entry) level = l
  }
  return level
}

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Hour-by-hour forecast for the site, scored against the at-site escalation ranges.
 * Answers "is anything in the forecast heading for the site, and when does it arrive?"
 */
export function ForecastApproachPanel({
  hourly,
  startIndex,
  units,
  thresholds,
  visibilityM,
  originCompass,
  etaLabel,
}: {
  hourly: HourlyReading[]
  startIndex: number
  units: Units
  thresholds: TierThresholds
  visibilityM: number | null
  originCompass: string
  etaLabel: string | null
}) {
  const toMs = (v: number) => (units === "metric" ? v : v * 1.609) / 3.6
  const toMm = (v: number) => (units === "metric" ? v : v * 25.4)

  const points: HourPoint[] = hourly.slice(startIndex, startIndex + HOURS_AHEAD + 1).map((h, i) => {
    const values: Record<BuzzerMetricKey, number> = {
      windMs: toMs(h.windSpeed),
      gustMs: toMs(h.windGusts),
      rainMm: toMm(h.precipitation),
      cloudPct: h.cloudCover,
    }
    let level: AlertLevel = "green"
    let driver: string | null = null
    for (const m of METRICS) {
      const l = metricLevel(values[m.key], m.key, thresholds)
      if (RANK[l] > RANK[level]) {
        level = l
        driver = `${m.label} ${values[m.key].toFixed(m.digits)} ${m.unit} ≥ ${thresholds[l][m.key]} ${m.unit}`
      }
    }
    return {
      label: i === 0 ? "Now" : h.time.slice(11, 16),
      values,
      directionDeg: h.windDirection,
      fog: FOG_CODES.has(h.weatherCode),
      level,
      driver,
    }
  })

  if (!points.length) return null

  const firstHit = points.findIndex((p) => p.level !== "green")
  const worst = points.reduce<AlertLevel>((acc, p) => (RANK[p.level] > RANK[acc] ? p.level : acc), "green")
  const fogHour = points.findIndex((p) => p.fog)
  const baseDir = points[0].directionDeg
  const shiftHour = points.findIndex((p) => angleDiff(p.directionDeg, baseDir) >= 45)
  const fogNow = visibilityM != null && visibilityM < 1000
  const mistNow = visibilityM != null && visibilityM >= 1000 && visibilityM < 5000

  return (
    <section aria-labelledby="forecast-approach-title" className="rounded-xl border border-border/70 bg-background/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="forecast-approach-title" className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">
            Forecast heading to site · next {HOURS_AHEAD} h
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Each hour is checked against the at-site escalation ranges. Weather is arriving from the{" "}
            <span className="font-semibold text-foreground">{originCompass}</span>
            {etaLabel ? (
              <>
                {" "}— upwind front ETA <span className="font-semibold text-foreground">{etaLabel}</span>
              </>
            ) : null}
            .
          </p>
        </div>
        <span className={cn("rounded-md border px-2 py-1 font-mono text-xs font-bold uppercase tracking-wide", CHIP[worst])}>
          Worst ahead · {LEVEL_NAME[worst]}
        </span>
      </div>

      {/* Verdict */}
      <div
        className={cn(
          "mt-4 flex items-start gap-3 rounded-lg border p-3",
          firstHit === -1 ? CHIP.green : CHIP[points[firstHit].level],
        )}
      >
        {firstHit === -1 ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base font-semibold leading-snug text-foreground text-balance">
            {firstHit === -1
              ? `Site stays safe for the next ${HOURS_AHEAD} hours`
              : firstHit === 0
                ? `${LEVEL_NAME[points[0].level]} conditions at the site now`
                : `${LEVEL_NAME[points[firstHit].level]} reaches the site at ${points[firstHit].label} (in ${firstHit} h)`}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {firstHit === -1
              ? "No forecast wind, gust, rain or cloud value reaches a Yellow entry limit."
              : `Cause: ${points[firstHit].driver}`}
          </p>
        </div>
      </div>

      {/* Hour-by-hour grid */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-left">
          <caption className="sr-only">Forecast values per hour, coloured by escalation tier</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Metric
              </th>
              <th scope="col" className="px-2 py-1 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Yellow ≥
              </th>
              {points.map((p) => (
                <th
                  key={p.label}
                  scope="col"
                  className="px-2 py-1 text-center font-mono text-xs font-bold uppercase tracking-wider text-foreground"
                >
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key}>
                <th scope="row" className="whitespace-nowrap px-2 py-1 text-sm font-semibold text-foreground">
                  {m.label}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{m.unit}</span>
                </th>
                <td className="px-2 py-1 font-mono text-sm tabular-nums text-muted-foreground">
                  {thresholds.yellow[m.key] ?? "—"}
                </td>
                {points.map((p) => {
                  const l = metricLevel(p.values[m.key], m.key, thresholds)
                  return (
                    <td
                      key={p.label}
                      className={cn("rounded-md px-2 py-2 text-center font-mono text-base font-bold tabular-nums", CELL[l])}
                      title={`${m.label} ${p.values[m.key].toFixed(m.digits)} ${m.unit} · ${LEVEL_NAME[l]}`}
                    >
                      {p.values[m.key].toFixed(m.digits)}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-sm font-semibold text-foreground">
                Wind from
              </th>
              <td className="px-2 py-1 font-mono text-sm text-muted-foreground">±45° shift</td>
              {points.map((p) => {
                const shifted = angleDiff(p.directionDeg, baseDir) >= 45
                return (
                  <td
                    key={p.label}
                    className={cn(
                      "rounded-md px-2 py-2 text-center",
                      shifted ? CELL.yellow : "bg-muted/40 text-foreground",
                    )}
                    title={`Wind from ${compass(p.directionDeg)} (${Math.round(p.directionDeg)}°)`}
                  >
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-bold">
                      <Navigation2
                        className="h-3.5 w-3.5"
                        style={{ transform: `rotate(${(p.directionDeg + 180) % 360}deg)` }}
                        aria-hidden="true"
                      />
                      {compass(p.directionDeg)}
                    </span>
                  </td>
                )
              })}
            </tr>
            <tr>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-sm font-semibold text-foreground">
                Fog
              </th>
              <td className="px-2 py-1 font-mono text-sm text-muted-foreground">Advisory</td>
              {points.map((p) => (
                <td
                  key={p.label}
                  className={cn(
                    "rounded-md px-2 py-2 text-center font-mono text-sm font-bold",
                    p.fog ? CELL.yellow : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {p.fog ? "Fog" : "Clear"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Advisory notes */}
      <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-relaxed text-muted-foreground">
        <li className="flex items-start gap-2">
          <CloudFog className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Visibility now{" "}
            <span className="font-semibold text-foreground">
              {visibilityM != null ? `${(visibilityM / 1000).toFixed(1)} km` : "—"}
            </span>
            {fogNow ? " — fog on site" : mistNow ? " — mist / haze on site" : " — clear"}
            {fogHour > 0 ? `; fog forecast from ${points[fogHour].label}` : ""}. Fog is advisory and does not sound the buzzer.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Navigation2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {shiftHour > 0
              ? `Wind direction swings to ${compass(points[shiftHour].directionDeg)} by ${points[shiftHour].label} (≥ 45° from now).`
              : `Wind direction holds from ${compass(baseDir)} through the next ${HOURS_AHEAD} hours.`}
          </span>
        </li>
      </ul>
    </section>
  )
}
