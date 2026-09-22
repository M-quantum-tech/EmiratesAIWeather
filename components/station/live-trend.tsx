"use client"

import { useMemo, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import { formatClock, tempUnit, type HourlyReading, type WeatherPayload } from "@/lib/weather"
import { cn } from "@/lib/utils"

/** Geometry of the normalized multi-line plot (viewBox units). */
const W = 1000
const H = 300
const PAD_Y = 26

type SeriesKey = "temperature" | "apparentTemperature" | "humidity"

type SeriesDef = {
  key: SeriesKey
  label: string
  kind: "temp" | "pct"
  /** Distinct hue per line — charts legitimately need series-level colors. */
  color: string
}

const SERIES: SeriesDef[] = [
  { key: "temperature", label: "Temperature", kind: "temp", color: "oklch(0.78 0.13 220)" },
  { key: "apparentTemperature", label: "Feels like", kind: "temp", color: "oklch(0.72 0.19 350)" },
  { key: "humidity", label: "Humidity", kind: "pct", color: "oklch(0.68 0.17 285)" },
]

type MeasureTone = "good" | "info" | "warn" | "bad"

const TONE_CHIP: Record<MeasureTone, string> = {
  good: "border-alert-green/40 bg-alert-green/10 text-alert-green",
  info: "border-signal/40 bg-signal/10 text-signal",
  warn: "border-alert-orange/40 bg-alert-orange/10 text-alert-orange",
  bad: "border-alert-red/50 bg-alert-red/10 text-alert-red",
}

const TREND_CHIP: Record<"rising" | "easing" | "steady", string> = {
  rising: "border-alert-orange/40 bg-alert-orange/10 text-alert-orange",
  easing: "border-signal/40 bg-signal/10 text-signal",
  steady: "border-border bg-secondary text-muted-foreground",
}

/** Normalize a value into 0..1 over its own [min,max] span. */
function norm(value: number, min: number, max: number) {
  return (value - min) / (max - min || 1)
}

function fmt(value: number, kind: "temp" | "pct", units: WeatherPayload["units"]) {
  return kind === "temp" ? `${value.toFixed(1)} ${tempUnit(units)}` : `${Math.round(value)} %`
}

export function LiveTrend() {
  const { payload } = useWeather()
  if (!payload || payload.hourly.length < 3) return null
  return <LiveTrendChart data={payload} />
}

function LiveTrendChart({ data }: { data: WeatherPayload }) {
  const hours = data.hourly
  const now = Math.min(Math.max(data.currentHourIndex, 0), hours.length - 1)
  const [hover, setHover] = useState<number | null>(null)

  // Per-series geometry: coordinates + own 24h range for normalization.
  const model = useMemo(() => {
    const n = hours.length
    const step = W / (n - 1)
    return SERIES.map((s) => {
      const values = hours.map((h) => h[s.key] as number)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const coords = values.map((v, i) => ({
        x: i * step,
        y: PAD_Y + (1 - norm(v, min, max)) * (H - PAD_Y * 2),
      }))
      const toPath = (from: number, to: number) =>
        coords
          .slice(from, to + 1)
          .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ")
      // Projected extreme = point in the future window that moves furthest from "now".
      const current = values[now]
      let extremeIdx = now
      for (let i = now + 1; i < n; i++) {
        if (Math.abs(values[i] - current) > Math.abs(values[extremeIdx] - current)) extremeIdx = i
      }
      return { ...s, values, min, max, coords, current, extremeIdx, live: toPath(0, now), projected: toPath(now, n - 1) }
    })
  }, [hours, now])

  const cursor = hover ?? now
  const point = hours[cursor]
  const clock = formatClock(point.time)
  const isLive = cursor <= now
  const primary = model[1] // feels-like drives the narrative + trend pill

  // Comfort chip from the live feels-like reading.
  const feelsNow = model[1].current
  const chip: { tone: MeasureTone; label: string } =
    feelsNow >= 40
      ? { tone: "bad", label: "Heat stress" }
      : feelsNow >= 33
        ? { tone: "warn", label: "Warm" }
        : feelsNow <= 5
          ? { tone: "info", label: "Cold" }
          : { tone: "good", label: "Comfortable" }

  // Trend pill: slope of the primary series around the cursor.
  const prev = primary.values[Math.max(0, cursor - 1)]
  const slope = primary.values[cursor] - prev
  const trend: "rising" | "easing" | "steady" = slope > 0.3 ? "rising" : slope < -0.3 ? "easing" : "steady"
  const TrendIcon = trend === "rising" ? ArrowUpRight : trend === "easing" ? ArrowDownRight : Minus

  // Idle narrative describes the projection tail; scrub narrative reads the hovered hour.
  const tail = hours[hours.length - 1]
  const narrative =
    hover == null
      ? `Feels-like ${primary.values[hours.length - 1] >= primary.current ? "climbs" : "eases"} to ${primary.values[hours.length - 1].toFixed(0)}${tempUnit(data.units)} by ${formatClock(tail.time, false)}; humidity ${model[2].values[hours.length - 1] >= model[2].current ? "rises" : "falls"} to ${Math.round(model[2].values[hours.length - 1])}%.`
      : `${isLive ? "Observed" : "AI projection"} at ${clock} — ${SERIES.map((s, i) => fmt(model[i].values[cursor], s.kind, data.units)).join(" · ")}.`

  return (
    <Panel className="station-rise">
      <PanelHeader
        title="Live trend + AI projection"
        meta={`${SERIES.length} series · +${hours.length - 1 - now}h ahead`}
      />

      {/* Predictive-comment band — status chip + narrative + live trend pill, updates on scrub. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 label-caps",
            TONE_CHIP[chip.tone],
          )}
        >
          {chip.label}
        </span>
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/90">{narrative}</p>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 label-caps",
            TREND_CHIP[trend],
          )}
        >
          <TrendIcon className="h-3 w-3" aria-hidden="true" />
          {trend}
        </span>
      </div>

      {/* Metric cards — current reading + projected extreme with its hour offset from now. */}
      <div className="grid gap-px bg-border sm:grid-cols-3">
        {model.map((s) => {
          const active = hover != null
          const shownValue = active ? s.values[cursor] : s.current
          const delta = s.values[s.extremeIdx] - s.current
          const ahead = s.extremeIdx - now
          const Arrow = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus
          const arrowClass = delta > 0 ? "text-alert-orange" : delta < 0 ? "text-signal" : "text-muted-foreground"
          return (
            <div key={s.key} className="flex flex-col gap-1.5 bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="label-caps">{s.label}</span>
              </div>
              <p className="font-mono text-2xl leading-none tabular-nums text-foreground">
                {s.kind === "temp" ? shownValue.toFixed(1) : Math.round(shownValue)}
                <span className="ml-1 text-xs text-muted-foreground">{s.kind === "temp" ? tempUnit(data.units) : "%"}</span>
              </p>
              <p className={cn("flex items-center gap-1 font-mono text-xs tabular-nums", arrowClass)}>
                <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
                {s.kind === "temp" ? s.values[s.extremeIdx].toFixed(1) : Math.round(s.values[s.extremeIdx])}
                {s.kind === "temp" ? ` ${tempUnit(data.units)}` : " %"}
                <span className="text-muted-foreground">{ahead > 0 ? `at +${ahead}h` : "now"}</span>
              </p>
            </div>
          )
        })}
      </div>

      {/* Normalized multi-line chart: solid = observed, dashed = AI projection. */}
      <div className="relative px-2 pb-2 pt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-64 w-full overflow-visible touch-none"
          preserveAspectRatio="none"
          role="img"
          aria-label="Normalized 24-hour trend of temperature, feels-like and humidity with AI projection"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0
            setHover(Math.min(hours.length - 1, Math.max(0, Math.round(frac * (hours.length - 1)))))
          }}
          onPointerLeave={() => setHover(null)}
        >
          {/* Projection region shading (right of "now"). */}
          <rect
            x={model[0].coords[now].x}
            y={0}
            width={W - model[0].coords[now].x}
            height={H}
            fill="var(--color-muted-foreground)"
            opacity="0.05"
          />

          {model.map((s) => (
            <g key={s.key}>
              <path d={s.live} fill="none" stroke={s.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              <path
                d={s.projected}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeDasharray="6 5"
                opacity="0.85"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {/* Scrub cursor + per-series dots. */}
          <line
            x1={model[0].coords[cursor].x}
            y1={0}
            x2={model[0].coords[cursor].x}
            y2={H}
            stroke="var(--color-foreground)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
          {model.map((s) => (
            <circle
              key={s.key}
              cx={s.coords[cursor].x}
              cy={s.coords[cursor].y}
              r="4.5"
              fill="var(--color-card)"
              stroke={s.color}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Floating readout that rides the cursor. */}
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-md border border-border bg-popover/95 px-2.5 py-2 shadow-md backdrop-blur-sm"
          style={{ left: `${(model[0].coords[cursor].x / W) * 100}%` }}
        >
          <div className="mb-1 flex items-center gap-1.5 whitespace-nowrap font-mono text-[0.6875rem] font-semibold text-foreground">
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-alert-green" : "bg-muted-foreground")}
            />
            +{cursor}h · {isLive ? "live" : "forecast"} · {clock}
          </div>
          {SERIES.map((s, i) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 whitespace-nowrap font-mono text-[0.6875rem] tabular-nums"
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.label}:
              </span>
              <span className="font-semibold text-foreground">{fmt(model[i].values[cursor], s.kind, data.units)}</span>
            </div>
          ))}
        </div>

        {/* Hour axis. */}
        <div className="mt-1 flex justify-between px-1 font-mono text-[0.5625rem] text-muted-foreground">
          {hours.map((h, i) =>
            i % 3 === 0 || i === hours.length - 1 ? <span key={h.time}>{formatClock(h.time, false)}</span> : null,
          )}
        </div>
      </div>

      {/* Legend + provenance. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-0 w-4 border-t-2 border-dashed border-muted-foreground"
            />
            AI projection
          </span>
        </div>
        <span className="font-mono text-[0.625rem] text-muted-foreground">
          Open-Meteo · each line normalized to its own 24h range · updates every 5 min
        </span>
      </div>
    </Panel>
  )
}
