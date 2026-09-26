"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { MapPin, Navigation, Sunrise, Sunset } from "lucide-react"
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

/* Palette mirrored from the reference "24-hour detailed weather trend" board. */
const DNI_COLOR = "#d8a94a" // brass / gold DNI line
const DNI_FILL = "#b98a2c" // olive-gold area under the DNI curve
const CLOUD_LINE = "#c7d2e0" // light silver cloud line
const CLOUD_FILL = "#8b97a8" // gray / silver cloud area
const GUST_COLOR = "#e0803a" // orange gust readout
const RAIN_COLOR = "#3b82f6" // blue rain bars + icons (distinct from the gray clouds)

/* Chart geometry (viewBox units — stretched to container width). */
const CHART_W = 960
const CHART_H = 260
const PAD_T = 22
const PAD_B = 16
const INNER_H = CHART_H - PAD_T - PAD_B
const STEP = CHART_W / 24
const xAt = (i: number) => (i + 0.5) * STEP

/* Shared left/right gutters so the chart and the data table line up column-for-column. */
const GUTTER_L = "w-16"
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
      {/* Brass ribbon banner — sunrise · location + date · sunset */}
      <div className="flex justify-center">
        <div
          className="flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-8 py-2.5 sm:px-12"
          style={{
            background: "linear-gradient(180deg,#f6dd96 0%,#e6be5f 45%,#cf9a3a 100%)",
            clipPath:
              "polygon(0 0, 100% 0, 100% 100%, 0 100%, 2.5% 50%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[#3a2708]">
            <Sunrise className="h-5 w-5 text-[#b5390f]" aria-hidden="true" />
            Sunrise {daily?.sunrise ? formatClock(daily.sunrise) : "—"}
          </span>
          <span className="flex items-center gap-2 text-sm font-bold text-[#241804]">
            <MapPin className="h-4 w-4 text-[#b5390f]" aria-hidden="true" />
            {location?.name ?? "Location"} · {dateLabel(selectedDate, selectedDay)}
          </span>
          <span className="flex items-center gap-2 text-sm font-semibold text-[#3a2708]">
            Sunset {daily?.sunset ? formatClock(daily.sunset) : "—"}
            <Sunset className="h-5 w-5 text-[#b5390f]" aria-hidden="true" />
          </span>
        </div>
      </div>

      <Panel className="flex flex-col gap-4 border-signal/20 bg-[#0f1826] p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-balance text-center text-2xl font-bold uppercase tracking-[0.15em] text-foreground sm:text-3xl">
            24-Hour Detailed Weather Trend
          </h2>
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            Last updated {updated}
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[60rem]">
            <div className="flex">
              {/* Legend + left axis (DNI) */}
              <div className={cn(GUTTER_L, "relative h-80 shrink-0")}>
                <div className="absolute left-0 top-1 flex flex-col gap-2 font-mono text-[0.625rem] uppercase leading-tight tracking-wide text-muted-foreground">
                  <LegendItem swatch={DNI_COLOR} label="DNI (W/m²)" line />
                  <LegendItem swatch={CLOUD_FILL} label="Clouds (%)" />
                  <LegendItem swatch={RAIN_COLOR} label="Rain" />
                  <span className="flex items-center gap-1">
                    <Navigation className="h-3 w-3 rotate-45 text-foreground" aria-hidden="true" />
                    Wind
                  </span>
                </div>
                {dniTicks.map((v, i) => (
                  <span
                    key={v}
                    className="absolute right-1 -translate-y-1/2 font-mono text-[0.6875rem] tabular-nums"
                    style={{ top: `${(gridY[i] / CHART_H) * 100}%`, color: DNI_COLOR }}
                  >
                    {v}
                  </span>
                ))}
              </div>

              {/* Chart body */}
              <div className="relative h-80 flex-1">
                <svg
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  className="h-80 w-full overflow-visible"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Direct normal irradiance peaking at ${dniPeakVal} watts per square metre with ${avgCloud}% average cloud cover`}
                >
                  <defs>
                    <linearGradient id="hb-dni" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={DNI_FILL} stopOpacity="0.55" />
                      <stop offset="100%" stopColor={DNI_FILL} stopOpacity="0.04" />
                    </linearGradient>
                    <linearGradient id="hb-cloud" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CLOUD_FILL} stopOpacity="0.6" />
                      <stop offset="100%" stopColor={CLOUD_FILL} stopOpacity="0.05" />
                    </linearGradient>
                  </defs>

                  {gridY.map((y, i) => (
                    <line
                      key={i}
                      x1={0}
                      y1={y}
                      x2={CHART_W}
                      y2={y}
                      stroke="rgba(148,163,184,0.14)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                  {/* Clouds — light-blue filled area behind */}
                  <path d={cloudArea} fill="url(#hb-cloud)" />
                  <path
                    d={cloudLine}
                    fill="none"
                    stroke={CLOUD_LINE}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />

                  {/* DNI — gold line in front */}
                  {hasDni ? (
                    <>
                      <path d={dniArea} fill="url(#hb-dni)" />
                      <path
                        d={dniAiLine}
                        fill="none"
                        stroke={DNI_COLOR}
                        strokeWidth="2"
                        strokeOpacity="0.65"
                        strokeDasharray="2 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={dniLine}
                        fill="none"
                        stroke={DNI_COLOR}
                        strokeWidth="2.75"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
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

                {/* Data-point dots + numeric value labels (HTML overlay so they aren't stretched) */}
                <div className="pointer-events-none absolute inset-0">
                  {/* Cloud dots + labels */}
                  {clouds.map((v, i) => (
                    <PointLabel
                      key={`c-${i}`}
                      leftPct={(xAt(i) / CHART_W) * 100}
                      topPct={(mapCloud(v) / CHART_H) * 100}
                      color={CLOUD_LINE}
                      value={Math.round(v)}
                    />
                  ))}
                  {/* DNI dots + labels (daytime only) */}
                  {hasDni
                    ? dni.map((v, i) =>
                        v > 0 ? (
                          <PointLabel
                            key={`d-${i}`}
                            leftPct={(xAt(i) / CHART_W) * 100}
                            topPct={(mapDni(v) / CHART_H) * 100}
                            color={DNI_COLOR}
                            value={Math.round(v)}
                            above
                          />
                        ) : null,
                      )
                    : null}
                </div>
              </div>

              {/* Right axis — clouds */}
              <div className={cn(GUTTER_R, "relative h-80 shrink-0")}>
                {cloudTicks.map((v, i) => (
                  <span
                    key={v}
                    className="absolute left-1 -translate-y-1/2 font-mono text-[0.6875rem] tabular-nums"
                    style={{ top: `${(gridY[i] / CHART_H) * 100}%`, color: CLOUD_LINE }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* Hour axis + data table (columns aligned to the chart body) */}
            <div className="mt-1 border-t border-[rgba(148,163,184,0.2)]">
              <TableRow label="" gutterR>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx}>
                    <span className="font-mono text-[0.8125rem] font-bold tabular-nums text-foreground">
                      {h.time.slice(11, 13)}
                    </span>
                  </Cell>
                ))}
              </TableRow>

              <TableRow label={`Wind Speed ${speedUnit(units)}`} gutterR>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx}>
                    <span className="font-mono text-[0.8125rem] tabular-nums text-foreground">
                      {toDisplaySpeed(h.windSpeed).toFixed(isMetric ? 1 : 0)}
                    </span>
                  </Cell>
                ))}
              </TableRow>

              <TableRow label={`Wind Direction`} gutterR>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx}>
                    <Navigation
                      aria-hidden="true"
                      className="h-4 w-4 fill-foreground/80 text-foreground/80"
                      style={{ transform: `rotate(${h.windDirection + 180}deg)` }}
                    />
                    <span className="font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                      {compass(h.windDirection)}
                    </span>
                  </Cell>
                ))}
              </TableRow>

              <TableRow label={`Wind Gust ${speedUnit(units)}`} gutterR>
                {hours.map((h, i) => {
                  const g = toDisplaySpeed(h.windGusts)
                  return (
                    <Cell key={h.time} active={i === nowIdx}>
                      <span
                        className="font-mono text-[0.8125rem] font-semibold tabular-nums"
                        style={{ color: g / maxGust > 0.5 ? GUST_COLOR : "rgba(224,128,58,0.75)" }}
                      >
                        {g.toFixed(isMetric ? 1 : 0)}
                      </span>
                    </Cell>
                  )
                })}
              </TableRow>

              <TableRow label={`Rain & Precipitation ${precipUnit(units)}`} gutterR tall>
                {hours.map((h, i) => (
                  <Cell key={h.time} active={i === nowIdx} className="justify-end gap-1 pb-1">
                    <span
                      className="w-full max-w-[70%] rounded-t-sm"
                      style={{
                        height: `${Math.max(2, (h.precipitation / maxPrecip) * 28)}px`,
                        background: RAIN_COLOR,
                      }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">
                      {h.precipitation > 0 ? h.precipitation.toFixed(2) : "0.00"}
                    </span>
                    <WeatherIcon code={h.weatherCode} className="h-4 w-4 text-[#3b82f6]" />
                  </Cell>
                ))}
              </TableRow>
            </div>
          </div>
        </div>
      </Panel>
    </section>
  )
}

/* ---------- presentational helpers ---------- */

function PointLabel({
  leftPct,
  topPct,
  color,
  value,
  above = false,
}: {
  leftPct: number
  topPct: number
  color: string
  value: number
  above?: boolean
}) {
  return (
    <>
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${leftPct}%`, top: `${topPct}%`, background: color }}
      />
      <span
        className="absolute -translate-x-1/2 font-mono text-[0.625rem] font-semibold tabular-nums"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, ${above ? "-160%" : "40%"})`,
          color,
        }}
      >
        {value}
      </span>
    </>
  )
}

function LegendItem({ swatch, label, line = false }: { swatch: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn("inline-block rounded-sm", line ? "h-0.5 w-3" : "h-2 w-2")}
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
    <div className="flex items-stretch border-b border-[rgba(148,163,184,0.14)] last:border-b-0">
      <span
        className={cn(
          GUTTER_L,
          "flex shrink-0 items-center border-r border-[rgba(148,163,184,0.2)] pr-1 text-right font-mono text-[0.625rem] uppercase leading-tight tracking-wide text-muted-foreground",
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
