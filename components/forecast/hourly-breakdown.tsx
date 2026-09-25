"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { CloudRain, MapPin, Navigation, Sun, Sunrise, Sunset } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { WeatherIcon } from "@/components/weather/weather-icon"
import { useWeather } from "@/components/weather/weather-provider"
import {
  compass,
  formatClock,
  precipUnit,
  speedUnit,
  toMetersPerSecond,
  type HourlyReading,
  type SolarPayload,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

async function fetcher(url: string): Promise<SolarPayload> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Solar reading failed.")
  return response.json()
}

/* Chart geometry (viewBox units — stretched to container width). */
const CHART_W = 960
const CHART_H = 260
const PAD_T = 20
const PAD_B = 16
const INNER_H = CHART_H - PAD_T - PAD_B
const STEP = CHART_W / 24
const xAt = (i: number) => (i + 0.5) * STEP

/* Shared left/right gutters so the chart and the data table line up column-for-column. */
const GUTTER_L = "w-12"
const GUTTER_R = "w-10"

function dateLabel(date: string, index: number) {
  if (!date) return ""
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`)
  const formatted = d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  if (index === 0) return `Today · ${formatted}`
  if (index === 1) return `Tomorrow · ${formatted}`
  return formatted
}

export function HourlyBreakdown() {
  const { payload, units, selectedDay, location } = useWeather()

  const solarKey = location ? `/api/solar?lat=${location.latitude}&lon=${location.longitude}&days=14` : null
  const { data: solar } = useSWR<SolarPayload>(solarKey, fetcher, {
    refreshInterval: 3 * 60 * 1000,
    keepPreviousData: true,
  })

  const hours = useMemo<HourlyReading[]>(
    () => (payload?.hourlyByDay?.[selectedDay] ?? payload?.hourly ?? []).slice(0, 24),
    [payload, selectedDay],
  )

  if (!payload || hours.length < 2) {
    return <Panel className="h-[38rem] animate-pulse p-0" />
  }

  const isMetric = units === "metric"
  const toDisplaySpeed = (v: number) => (isMetric ? toMetersPerSecond(v) : v)
  const daily = payload.daily[selectedDay]
  const selectedDate = daily?.date ?? ""
  const nowIdx = selectedDay === 0 ? payload.currentHourIndex : -1

  // --- Solar / DNI series (live + AI projection) for the selected day ---
  const solarDay = solar?.days?.[selectedDay]
  const dni = solarDay?.hourlyDni ?? new Array(24).fill(0)
  const dniAi = solarDay?.hourlyDniAi ?? new Array(24).fill(0)
  const rawPeak = Math.max(1, ...dni, ...dniAi)
  const dniPeakVal = solarDay?.peakDni ?? Math.round(Math.max(0, ...dni))
  const dniMax = Math.max(1000, Math.ceil(rawPeak / 100) * 100)
  const peakIdx = dni.indexOf(Math.max(...dni))
  const hasDni = dni.some((v) => v > 0)

  // --- Cloud + rain series from the hourly readings ---
  const clouds = hours.map((h) => h.cloudCover)
  const peakProb = Math.max(0, ...hours.map((h) => h.precipitationProbability))
  const totalPrecip = hours.reduce((sum, h) => sum + h.precipitation, 0)
  const maxPrecip = Math.max(0.01, ...hours.map((h) => h.precipitation))
  const maxGust = Math.max(1, ...hours.map((h) => toDisplaySpeed(h.windGusts)))

  const mapDni = (v: number) => PAD_T + (1 - v / dniMax) * INNER_H
  const mapCloud = (v: number) => PAD_T + (1 - v / 100) * INNER_H

  const line = (values: number[], map: (v: number) => number) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${map(v).toFixed(1)}`).join(" ")
  const area = (values: number[], map: (v: number) => number) =>
    `${line(values, map)} L${xAt(values.length - 1).toFixed(1)} ${PAD_T + INNER_H} L${xAt(0).toFixed(1)} ${PAD_T + INNER_H} Z`

  const dniLine = line(dni, mapDni)
  const dniArea = area(dni, mapDni)
  const dniAiLine = line(dniAi, mapDni)
  const cloudLine = line(clouds, mapCloud)
  const cloudArea = area(clouds, mapCloud)

  // Axis ticks (shared 5-band grid).
  const dniTicks = Array.from({ length: 6 }, (_, i) => Math.round((dniMax / 5) * (5 - i)))
  const cloudTicks = [100, 80, 60, 40, 20, 0]
  const gridY = cloudTicks.map((c) => mapCloud(c))

  const updated = formatClock(payload.fetchedAt.replace(/Z$/, ""))
  const avgCloud = Math.round(clouds.reduce((s, v) => s + v, 0) / (clouds.length || 1))

  return (
    <section aria-label="24-hour detailed weather trend" className="flex flex-col gap-4">
      {/* Sunrise · location + date · sunset banner */}
      <Panel className="flex flex-wrap items-center justify-between gap-3 border-signal/30 bg-gradient-to-r from-signal/10 via-card to-alert-orange/10 px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground">
          <Sunrise className="h-5 w-5 text-alert-orange" aria-hidden="true" />
          Sunrise <span className="text-signal">{daily?.sunrise ? formatClock(daily.sunrise) : "—"}</span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-signal" aria-hidden="true" />
          {location?.name ?? "Location"} · {dateLabel(selectedDate, selectedDay)}
        </span>
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground">
          Sunset <span className="text-alert-orange">{daily?.sunset ? formatClock(daily.sunset) : "—"}</span>
          <Sunset className="h-5 w-5 text-alert-orange" aria-hidden="true" />
        </span>
      </Panel>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          24-hour detailed weather trend
        </h2>
        <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          Last updated {updated}
        </span>
      </div>

      <Panel className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <LegendItem swatch="var(--alert-orange)" label="DNI (W/m²)" line />
            <LegendItem swatch="var(--muted-foreground)" label="Clouds (%)" />
            <LegendItem swatch="var(--signal)" label="Rain" />
            <span className="flex items-center gap-1.5">
              <Navigation className="h-3 w-3 rotate-45 text-foreground" aria-hidden="true" />
              Wind
            </span>
          </div>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Solid = live · dashed = AI projection
          </span>
        </div>

        {/* Combined DNI + cloud chart */}
        <div className="overflow-x-auto">
          <div className="min-w-[60rem]">
            <div className="flex">
              {/* Left axis — DNI */}
              <div className={cn(GUTTER_L, "relative h-64 shrink-0")}>
                {dniTicks.map((v, i) => (
                  <span
                    key={v}
                    className="absolute right-1 -translate-y-1/2 font-mono text-[0.5625rem] tabular-nums text-alert-orange/80"
                    style={{ top: `${(gridY[i] / CHART_H) * 100}%` }}
                  >
                    {v}
                  </span>
                ))}
              </div>

              {/* Chart body */}
              <div className="relative h-64 flex-1">
                <svg
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  className="h-64 w-full overflow-visible"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Direct normal irradiance peaking at ${dniPeakVal} watts per square metre with ${avgCloud}% average cloud cover`}
                >
                  <defs>
                    <linearGradient id="hb-dni" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--alert-orange)" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="var(--alert-orange)" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="hb-cloud" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {gridY.map((y, i) => (
                    <line
                      key={i}
                      x1={0}
                      y1={y}
                      x2={CHART_W}
                      y2={y}
                      stroke="var(--border)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                  {/* Clouds behind */}
                  <path d={cloudArea} fill="url(#hb-cloud)" />
                  <path
                    d={cloudLine}
                    fill="none"
                    stroke="var(--muted-foreground)"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />

                  {/* DNI in front */}
                  {hasDni ? (
                    <>
                      <path d={dniArea} fill="url(#hb-dni)" />
                      <path
                        d={dniAiLine}
                        fill="none"
                        stroke="var(--alert-orange)"
                        strokeWidth="2"
                        strokeOpacity="0.7"
                        strokeDasharray="2 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={dniLine}
                        fill="none"
                        stroke="var(--alert-orange)"
                        strokeWidth="2.75"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {peakIdx >= 0 ? (
                        <circle cx={xAt(peakIdx)} cy={mapDni(dni[peakIdx])} r="3.5" fill="var(--alert-orange)" />
                      ) : null}
                    </>
                  ) : null}

                  {nowIdx >= 0 ? (
                    <line
                      x1={xAt(nowIdx)}
                      y1={PAD_T}
                      x2={xAt(nowIdx)}
                      y2={PAD_T + INNER_H}
                      stroke="var(--signal)"
                      strokeWidth="1.5"
                      strokeDasharray="3 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </svg>

                {/* Peak DNI value label (HTML overlay so it isn't stretched) */}
                {hasDni && peakIdx >= 0 ? (
                  <span
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-[150%] rounded bg-alert-orange/15 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold tabular-nums text-alert-orange"
                    style={{
                      left: `${(xAt(peakIdx) / CHART_W) * 100}%`,
                      top: `${(mapDni(dni[peakIdx]) / CHART_H) * 100}%`,
                    }}
                  >
                    {dniPeakVal} W/m²
                  </span>
                ) : null}
              </div>

              {/* Right axis — clouds */}
              <div className={cn(GUTTER_R, "relative h-64 shrink-0")}>
                {cloudTicks.map((v, i) => (
                  <span
                    key={v}
                    className="absolute left-1 -translate-y-1/2 font-mono text-[0.5625rem] tabular-nums text-muted-foreground"
                    style={{ top: `${(gridY[i] / CHART_H) * 100}%` }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* Hour axis + data table (columns aligned to the chart body) */}
            <div className="mt-1 border-t border-border">
              <TableRow label="Hour" gutterR>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx}>
                    <span className="font-mono text-[0.625rem] font-semibold tabular-nums">{h.time.slice(11, 13)}</span>
                  </Cell>
                ))}
              </TableRow>

              <TableRow label={`Wind ${speedUnit(units)}`} gutterR>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx}>
                    <span className="font-mono text-[0.6875rem] tabular-nums text-foreground">
                      {toDisplaySpeed(h.windSpeed).toFixed(isMetric ? 1 : 0)}
                    </span>
                  </Cell>
                ))}
              </TableRow>

              <TableRow label="Direction" gutterR>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx}>
                    <Navigation
                      aria-hidden="true"
                      className="h-3 w-3 fill-foreground/70 text-foreground/70"
                      style={{ transform: `rotate(${h.windDirection + 180}deg)` }}
                    />
                    <span className="font-mono text-[0.5rem] uppercase tracking-wide text-muted-foreground">
                      {compass(h.windDirection)}
                    </span>
                  </Cell>
                ))}
              </TableRow>

              <TableRow label={`Gust ${speedUnit(units)}`} gutterR>
                {hours.map((h, i) => {
                  const g = toDisplaySpeed(h.windGusts)
                  const strong = g / maxGust > 0.66
                  return (
                    <Cell key={h.time} active={i === nowIdx}>
                      <span
                        className={cn(
                          "font-mono text-[0.6875rem] font-semibold tabular-nums",
                          strong ? "text-alert-orange" : "text-foreground/80",
                        )}
                      >
                        {g.toFixed(isMetric ? 1 : 0)}
                      </span>
                    </Cell>
                  )
                })}
              </TableRow>

              <TableRow label={`Rain ${precipUnit(units)}`} gutterR tall>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx} className="justify-end gap-1 pb-1">
                    <span
                      className="w-full max-w-[70%] rounded-t-sm bg-signal/70"
                      style={{ height: `${Math.max(2, (h.precipitation / maxPrecip) * 22)}px` }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[0.5rem] tabular-nums text-muted-foreground">
                      {h.precipitation > 0 ? h.precipitation.toFixed(1) : "0"}
                    </span>
                    <WeatherIcon code={h.weatherCode} className="h-3.5 w-3.5 text-signal" />
                  </Cell>
                ))}
              </TableRow>
            </div>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          <Chip icon={<Sun className="h-3 w-3 text-alert-orange" aria-hidden="true" />} label={`Peak DNI ${hasDni ? `${dniPeakVal} W/m²` : "—"}`} />
          <Chip label={`Avg cloud ${avgCloud}%`} />
          <Chip icon={<CloudRain className="h-3 w-3 text-signal" aria-hidden="true" />} label={`Rain ${totalPrecip.toFixed(1)} ${precipUnit(units)} · ${Math.round(peakProb)}% peak`} />
        </div>
      </Panel>
    </section>
  )
}

/* ---------- presentational helpers ---------- */

function LegendItem({ swatch, label, line = false }: { swatch: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("inline-block rounded-sm", line ? "h-0.5 w-4" : "h-2.5 w-2.5")}
        style={{ background: swatch }}
      />
      {label}
    </span>
  )
}

function TableRow({
  label,
  children,
  gutterR = false,
  tall = false,
}: {
  label: string
  children: React.ReactNode
  gutterR?: boolean
  tall?: boolean
}) {
  return (
    <div className="flex items-stretch border-b border-border/60 last:border-b-0">
      <span
        className={cn(
          GUTTER_L,
          "flex shrink-0 items-center border-r border-border pr-1 font-mono text-[0.5rem] uppercase leading-tight tracking-wide text-muted-foreground",
          tall ? "py-1" : "py-1",
        )}
      >
        {label}
      </span>
      <div className="flex flex-1">{children}</div>
      {gutterR ? <span className={cn(GUTTER_R, "shrink-0")} /> : null}
    </div>
  )
}

function Cell({
  children,
  active = false,
  className,
}: {
  children: React.ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-1",
        active && "bg-signal/10 ring-1 ring-inset ring-signal/40",
        className,
      )}
    >
      {children}
    </div>
  )
}

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1">
      {icon}
      {label}
    </span>
  )
}
