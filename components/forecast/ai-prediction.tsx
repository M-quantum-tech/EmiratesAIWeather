"use client"

import { useMemo, useState } from "react"
import { CloudRain, Sparkles, Thermometer, Wind } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import {
  buildDailyAlert,
  compass,
  formatWeekday,
  precipUnit,
  speedUnit,
  tempUnit,
  toMetersPerSecond,
  weatherEmoji,
  type AlertLevel,
  type DailyReading,
  type HourlyReading,
  type Units,
  type WeatherPayload,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

/** Best-in-class model network the EmiratesConsensus blend fuses per location. */
const MODEL_NETWORK = "ECMWF · DWD · NOAA · Météo-France · JMA · KMA · UK Met Office · BOM"

type Horizon = "24h" | "14d"
type MetricKey = "comfort" | "wind" | "sky"

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "24h", label: "24H" },
  { id: "14d", label: "14-Day" },
]

const METRICS: { id: MetricKey; label: string; short: string; icon: typeof Thermometer }[] = [
  { id: "comfort", label: "Temperature & comfort", short: "Comfort", icon: Thermometer },
  { id: "wind", label: "Wind & air", short: "Wind", icon: Wind },
  { id: "sky", label: "Sky & rainfall", short: "Rainfall", icon: CloudRain },
]

const ALERT_DOT: Record<AlertLevel, string> = {
  green: "bg-alert-green",
  yellow: "bg-alert-yellow",
  orange: "bg-alert-orange",
  red: "bg-alert-red",
}

type Series = {
  label: string
  color: string
  values: number[]
  format: (v: number) => string
}

type Stat = { label: string; value: string; sub: string }

type View = {
  n: number
  series: Series[]
  xLabels: string[]
  /** Index where the AI-projected (dashed) segment begins. */
  boundary: number
  /** Index of the live "now" marker, or -1. */
  nowIndex: number
  stats: Stat[]
  projectionNote: string
  tooltipHead: (i: number) => string
}

function dayLabel(date: string, index: number) {
  if (index === 0) return "Today"
  if (index === 1) return "Tmrw"
  return formatWeekday(date)
}

function buildView(
  payload: WeatherPayload,
  units: Units,
  horizon: Horizon,
  metric: MetricKey,
  selectedDay: number,
): View | null {
  const isMetric = units === "metric"
  const spd = (v: number) => (isMetric ? toMetersPerSecond(v) : v)
  const t = (v: number) => `${Math.round(v)}${tempUnit(units)}`
  const s = (v: number) => `${v.toFixed(isMetric ? 1 : 0)} ${speedUnit(units)}`
  const pct = (v: number) => `${Math.round(v)}%`

  if (horizon === "24h") {
    const hours: HourlyReading[] = (payload.hourlyByDay?.[selectedDay] ?? payload.hourly ?? []).slice(0, 24)
    if (hours.length < 2) return null
    const n = hours.length
    const xLabels = hours.map((h, i) => (i % 3 === 0 ? h.time.slice(11, 13) : ""))
    const nowIndex = selectedDay === 0 ? payload.currentHourIndex : -1
    const boundary = nowIndex >= 0 ? nowIndex : n - 1
    const tooltipHead = (i: number) => {
      const raw = Number(hours[i].time.slice(11, 13))
      const hr = raw % 12 === 0 ? 12 : raw % 12
      return `${hr} ${raw < 12 ? "AM" : "PM"}${i === nowIndex ? " · live" : ""}`
    }

    if (metric === "comfort") {
      const temps = hours.map((h) => h.temperature)
      const feels = hours.map((h) => h.apparentTemperature)
      const hum = hours.map((h) => h.humidity)
      const cur = hours[Math.max(0, nowIndex)]
      const peak = Math.max(...temps)
      return {
        n,
        boundary,
        nowIndex,
        xLabels,
        tooltipHead,
        projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
        series: [
          { label: "Temp", color: "var(--signal)", values: temps, format: t },
          { label: "Feels", color: "var(--accent)", values: feels, format: t },
          { label: "Humidity", color: "var(--chart-3)", values: hum, format: pct },
        ],
        stats: [
          { label: "Temperature", value: t(cur.temperature), sub: `peak ${t(peak)}` },
          { label: "Feels like", value: t(cur.apparentTemperature), sub: `Δ ${Math.round(cur.apparentTemperature - cur.temperature)}°` },
          { label: "Humidity", value: pct(cur.humidity), sub: `${pct(Math.min(...hum))}–${pct(Math.max(...hum))}` },
        ],
      }
    }
    if (metric === "wind") {
      const wind = hours.map((h) => spd(h.windSpeed))
      const gust = hours.map((h) => spd(h.windGusts))
      const cur = hours[Math.max(0, nowIndex)]
      return {
        n,
        boundary,
        nowIndex,
        xLabels,
        tooltipHead,
        projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
        series: [
          { label: "Wind", color: "var(--signal)", values: wind, format: s },
          { label: "Gusts", color: "var(--accent)", values: gust, format: s },
        ],
        stats: [
          { label: "Wind", value: s(spd(cur.windSpeed)), sub: compass(cur.windDirection) },
          { label: "Gusts", value: s(spd(cur.windGusts)), sub: `peak ${s(Math.max(...gust))}` },
          { label: "Direction", value: compass(cur.windDirection), sub: `${Math.round(cur.windDirection)}°` },
        ],
      }
    }
    const prob = hours.map((h) => h.precipitationProbability)
    const hum = hours.map((h) => h.humidity)
    const total = hours.reduce((sum, h) => sum + h.precipitation, 0)
    const cur = hours[Math.max(0, nowIndex)]
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
      series: [
        { label: "Rain %", color: "var(--accent)", values: prob, format: pct },
        { label: "Humidity", color: "var(--signal)", values: hum, format: pct },
      ],
      stats: [
        { label: "Rain chance", value: pct(cur.precipitationProbability), sub: `peak ${pct(Math.max(...prob))}` },
        { label: "Precip total", value: `${total.toFixed(1)} ${precipUnit(units)}`, sub: "over the day" },
        { label: "Humidity", value: pct(cur.humidity), sub: `${pct(Math.min(...hum))}–${pct(Math.max(...hum))}` },
      ],
    }
  }

  // ---- 14-day extended AI outlook ----
  const daily: DailyReading[] = (payload.daily ?? []).slice(0, 14)
  if (daily.length < 2) return null
  const n = daily.length
  const xLabels = daily.map((d, i) => (i % 2 === 0 ? dayLabel(d.date, i) : ""))
  const nowIndex = 0
  const boundary = Math.min(6, n - 1) // days 0–6 near-term (solid), 7+ extended AI range (dashed)
  const tooltipHead = (i: number) => `${dayLabel(daily[i].date, i)}${i > boundary ? " · extended" : ""}`
  const projectionNote = "Solid = near-term · dashed = extended AI range (7–14 d)"

  if (metric === "comfort") {
    const max = daily.map((d) => d.max)
    const min = daily.map((d) => d.min)
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote,
      series: [
        { label: "High", color: "var(--signal)", values: max, format: t },
        { label: "Low", color: "var(--accent)", values: min, format: t },
      ],
      stats: [
        { label: "Warmest", value: t(Math.max(...max)), sub: dayLabel(daily[max.indexOf(Math.max(...max))].date, max.indexOf(Math.max(...max))) },
        { label: "Coolest", value: t(Math.min(...min)), sub: dayLabel(daily[min.indexOf(Math.min(...min))].date, min.indexOf(Math.min(...min))) },
        { label: "14-day mean", value: t(max.reduce((a, b) => a + b, 0) / n), sub: "daily high avg" },
      ],
    }
  }
  if (metric === "wind") {
    const wind = daily.map((d) => spd(d.windMax))
    const gust = daily.map((d) => spd(d.windGustMax))
    const gi = gust.indexOf(Math.max(...gust))
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote,
      series: [
        { label: "Wind max", color: "var(--signal)", values: wind, format: s },
        { label: "Gust max", color: "var(--accent)", values: gust, format: s },
      ],
      stats: [
        { label: "Peak gust", value: s(Math.max(...gust)), sub: dayLabel(daily[gi].date, gi) },
        { label: "Windiest", value: s(Math.max(...wind)), sub: "daily sustained" },
        { label: "Calmest", value: s(Math.min(...wind)), sub: "daily sustained" },
      ],
    }
  }
  const prob = daily.map((d) => d.precipitationProbability)
  const rain = daily.map((d) => d.precipitationSum)
  const wettest = rain.indexOf(Math.max(...rain))
  const wetDays = prob.filter((p) => p >= 40).length
  return {
    n,
    boundary,
    nowIndex,
    xLabels,
    tooltipHead,
    projectionNote,
    series: [
      { label: "Rain %", color: "var(--accent)", values: prob, format: pct },
      { label: "Humidity", color: "var(--signal)", values: daily.map((d) => d.humidityMean), format: pct },
    ],
    stats: [
      { label: "Wettest day", value: `${rain[wettest].toFixed(1)} ${precipUnit(units)}`, sub: dayLabel(daily[wettest].date, wettest) },
      { label: "Rain days", value: `${wetDays}`, sub: "≥ 40% chance" },
      { label: "Peak chance", value: pct(Math.max(...prob)), sub: "across 14 days" },
    ],
  }
}

export function AiPrediction() {
  const { payload, units, selectedDay, setSelectedDay, location, isValidating } = useWeather()
  const [horizon, setHorizon] = useState<Horizon>("24h")
  const [metric, setMetric] = useState<MetricKey>("comfort")
  const [active, setActive] = useState<number | null>(null)

  const view = useMemo(
    () => (payload ? buildView(payload, units, horizon, metric, selectedDay) : null),
    [payload, units, horizon, metric, selectedDay],
  )

  const daily = payload?.daily ?? []
  const dayCount = horizon === "24h" ? Math.min(7, daily.length) : Math.min(14, daily.length)

  if (!payload || !view) {
    return <Panel className="h-[34rem] animate-pulse p-0" />
  }

  return (
    <Panel className="station-rise flex flex-col overflow-hidden p-0">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-signal/15 text-signal">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">AI Prediction</h2>
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {location?.name ?? "Location"} · EmiratesConsensus
            </p>
          </div>
          <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-signal sm:inline-flex">
            <span className={cn("h-1.5 w-1.5 rounded-full bg-signal", isValidating && "animate-pulse")} aria-hidden="true" />
            {isValidating ? "Syncing" : "Live"}
          </span>
        </div>

        {/* Horizon toggle — the optional extended predictive view */}
        <div
          role="tablist"
          aria-label="Prediction horizon"
          className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-0.5"
        >
          {HORIZONS.map((h) => {
            const on = horizon === h.id
            return (
              <button
                key={h.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => {
                  setHorizon(h.id)
                  setActive(null)
                }}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider transition-colors",
                  on ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {h.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Metric tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {METRICS.map((m) => {
          const Icon = m.icon
          const on = metric === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setMetric(m.id)
                setActive(null)
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "bg-secondary text-foreground ring-1 ring-signal/40"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", on ? "text-signal" : "text-muted-foreground")} aria-hidden="true" />
              <span className="hidden sm:inline">{m.label}</span>
              <span className="sm:hidden">{m.short}</span>
            </button>
          )
        })}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-px bg-border">
        {view.stats.map((stat) => (
          <div key={stat.label} className="bg-panel px-3 py-3 sm:px-4">
            <p className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">{stat.value}</p>
            <p className="mt-0.5 font-mono text-[0.625rem] tabular-nums text-muted-foreground">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <TrendChart view={view} active={active} onActive={setActive} />

      {/* Legend + projection note */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          {view.series.map((serie) => (
            <span key={serie.label} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-sm" style={{ background: serie.color }} />
              {serie.label}
            </span>
          ))}
        </div>
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          {view.projectionNote}
        </span>
      </div>

      {/* Day selector — drives the shared selected day for the hour-by-hour breakdown below */}
      <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-3">
        {daily.slice(0, dayCount).map((day, index) => {
          const on = index === selectedDay
          const { level } = buildDailyAlert(day, units)
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setSelectedDay(index)
                if (horizon === "24h") setActive(null)
              }}
              aria-pressed={on}
              aria-label={`Select ${dayLabel(day.date, index)}`}
              className={cn(
                "flex min-w-[3.75rem] flex-1 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition-colors",
                on
                  ? "border-signal bg-signal/10 ring-1 ring-signal"
                  : "border-border bg-card/40 hover:border-signal/40 hover:bg-card",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[0.625rem] font-semibold uppercase tracking-wide",
                  on ? "text-signal" : "text-foreground",
                )}
              >
                {dayLabel(day.date, index)}
              </span>
              <span className="text-base leading-none" aria-hidden="true">
                {weatherEmoji(day.weatherCode, true)}
              </span>
              <span className="font-mono text-[0.625rem] tabular-nums text-foreground">
                {Math.round(day.max)}°<span className="text-muted-foreground">/{Math.round(day.min)}°</span>
              </span>
              <span className={cn("h-1.5 w-1.5 rounded-full", ALERT_DOT[level])} title={`Safety: ${level}`} aria-hidden="true" />
            </button>
          )
        })}
      </div>

      <p className="border-t border-border px-4 py-2 text-center font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        Multi-model blend · {MODEL_NETWORK}
      </p>
    </Panel>
  )
}

/* ---------------- chart ---------------- */

const W = 760
const H = 220
const TOP = 26
const BOT = 28

function TrendChart({
  view,
  active,
  onActive,
}: {
  view: View
  active: number | null
  onActive: (i: number | null) => void
}) {
  const { n, series, xLabels, boundary, nowIndex } = view
  const px = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)

  // Normalise each series to its own range so multi-unit lines share one canvas.
  const normed = series.map((serie) => {
    const finite = serie.values.filter((v) => Number.isFinite(v))
    const min = Math.min(...finite)
    const max = Math.max(...finite)
    const span = max - min || 1
    return serie.values.map((v) => TOP + (1 - (v - min) / span) * (H - TOP - BOT))
  })

  const segment = (ys: number[], from: number, to: number) => {
    if (to <= from) return ""
    return ys
      .slice(from, to + 1)
      .map((y, k) => `${k === 0 ? "M" : "L"}${px(from + k).toFixed(1)} ${y.toFixed(1)}`)
      .join(" ")
  }

  const solidTo = Math.max(0, Math.min(boundary, n - 1))
  const primary = normed[0]
  const areaBase = `${segment(primary, 0, n - 1)} L${W} ${H} L0 ${H} Z`

  const activeIdx = active
  const tooltipLeft = activeIdx === null ? 0 : (activeIdx / (n - 1)) * 100

  return (
    <div className="relative px-2 pt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.map((s) => s.label).join(", ")} trend`}
      >
        <defs>
          <linearGradient id="ai-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            y1={TOP + f * (H - TOP - BOT)}
            x2={W}
            y2={TOP + f * (H - TOP - BOT)}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* soft area under the primary series */}
        <path d={areaBase} fill="url(#ai-area)" />

        {/* projected region shading */}
        {boundary < n - 1 ? (
          <rect
            x={px(boundary)}
            y={0}
            width={W - px(boundary)}
            height={H}
            fill="var(--foreground)"
            opacity="0.03"
          />
        ) : null}

        {/* each series: solid (near-term) + dashed (AI projection) */}
        {normed.map((ys, si) => (
          <g key={series[si].label}>
            <path
              d={segment(ys, 0, solidTo)}
              fill="none"
              stroke={series[si].color}
              strokeWidth={si === 0 ? 2.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={si === 0 ? 1 : 0.85}
              vectorEffect="non-scaling-stroke"
            />
            {boundary < n - 1 ? (
              <path
                d={segment(ys, solidTo, n - 1)}
                fill="none"
                stroke={series[si].color}
                strokeWidth={si === 0 ? 2.5 : 2}
                strokeDasharray="2 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={si === 0 ? 0.9 : 0.7}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </g>
        ))}

        {/* live "now" marker */}
        {nowIndex >= 0 ? (
          <line
            x1={px(nowIndex)}
            y1={0}
            x2={px(nowIndex)}
            y2={H}
            stroke="var(--signal)"
            strokeWidth="1.5"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* active scrub guide + dots */}
        {activeIdx !== null ? (
          <>
            <line
              x1={px(activeIdx)}
              y1={0}
              x2={px(activeIdx)}
              y2={H}
              stroke="var(--foreground)"
              strokeWidth="1"
              opacity="0.4"
              vectorEffect="non-scaling-stroke"
            />
            {normed.map((ys, si) => (
              <circle
                key={series[si].label}
                cx={px(activeIdx)}
                cy={ys[activeIdx]}
                r="3.5"
                fill="var(--background)"
                stroke={series[si].color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </>
        ) : null}

        {/* hit targets */}
        {Array.from({ length: n }).map((_, i) => (
          <rect
            key={i}
            x={px(i) - W / n / 2}
            y={0}
            width={W / n}
            height={H}
            fill="transparent"
            onMouseEnter={() => onActive(i)}
            onMouseMove={() => onActive(i)}
            onMouseLeave={() => onActive(null)}
          />
        ))}
      </svg>

      {/* x-axis labels */}
      <div className="mt-1 flex px-0">
        {xLabels.map((lbl, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 text-center font-mono text-[0.5625rem] tabular-nums",
              i === nowIndex ? "font-bold text-signal" : "text-muted-foreground",
            )}
          >
            {lbl}
          </span>
        ))}
      </div>

      {/* floating tooltip */}
      {activeIdx !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-xl backdrop-blur"
          style={{ left: `${Math.min(88, Math.max(12, tooltipLeft))}%` }}
        >
          <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-foreground">
            {view.tooltipHead(activeIdx)}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {series.map((serie) => (
              <span key={serie.label} className="flex items-center justify-between gap-3 font-mono text-[0.625rem] tabular-nums">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-0.5 w-3 rounded-sm" style={{ background: serie.color }} />
                  {serie.label}
                </span>
                <span className="font-semibold text-foreground">{serie.format(serie.values[activeIdx])}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
