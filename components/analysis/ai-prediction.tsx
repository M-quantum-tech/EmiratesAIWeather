"use client"

import { useId, useMemo, useState } from "react"
import { CloudRain, Sparkles, Thermometer, TriangleAlert, Wind } from "lucide-react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import { speedUnit, tempUnit } from "@/lib/weather"
import type { HourlyReading, Units } from "@/lib/weather"
import { cn } from "@/lib/utils"

type NumKey =
  | "temperature"
  | "apparentTemperature"
  | "humidity"
  | "windSpeed"
  | "windGusts"
  | "windDirection"
  | "precipitation"
  | "precipitationProbability"
  | "weatherCode"

type SeriesDef = {
  key: NumKey
  label: string
  color: string
  unit: (u: Units) => string
  decimals: number
  emphasize?: boolean
}

type GroupDef = {
  id: string
  label: string
  short: string
  icon: typeof Thermometer
  series: SeriesDef[]
}

const GROUPS: GroupDef[] = [
  {
    id: "comfort",
    label: "Temperature & comfort",
    short: "Comfort",
    icon: Thermometer,
    series: [
      { key: "temperature", label: "Temperature", color: "#22d3ee", unit: tempUnit, decimals: 1 },
      { key: "apparentTemperature", label: "Feels like", color: "#e879f9", unit: tempUnit, decimals: 1 },
      { key: "humidity", label: "Humidity", color: "#818cf8", unit: () => "%", decimals: 0 },
    ],
  },
  {
    id: "wind",
    label: "Wind & air",
    short: "Wind",
    icon: Wind,
    series: [
      { key: "windGusts", label: "Wind gusts", color: "#a3e635", unit: speedUnit, decimals: 1, emphasize: true },
      { key: "windSpeed", label: "Wind speed", color: "#f472b6", unit: speedUnit, decimals: 1 },
      { key: "windDirection", label: "Wind direction", color: "#f5b642", unit: () => "°", decimals: 0 },
    ],
  },
  {
    id: "sky",
    label: "Sky & rainfall",
    short: "Sky",
    icon: CloudRain,
    series: [
      { key: "precipitationProbability", label: "Rain chance", color: "#38bdf8", unit: () => "%", decimals: 0 },
      { key: "precipitation", label: "Precipitation", color: "#34d399", unit: () => "mm", decimals: 1 },
      { key: "weatherCode", label: "Weather code", color: "#fb923c", unit: () => "", decimals: 0 },
    ],
  },
]

function gustThreshold(units: Units) {
  // Gale-force gust warning: ~40 km/h metric, ~25 mph imperial.
  return units === "imperial" ? 25 : 40
}

export function AiPrediction() {
  const { payload, isLoading } = useWeather()
  const gid = useId()
  const [groupId, setGroupId] = useState<string>("comfort")
  const [hover, setHover] = useState<number | null>(null)

  const units = payload?.units ?? "metric"
  const hours: HourlyReading[] = payload?.hourly ?? []
  const nowIdx = Math.min(Math.max(payload?.currentHourIndex ?? 0, 0), Math.max(hours.length - 1, 0))
  const group = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0]

  const model = useMemo(() => {
    if (hours.length === 0) return null
    const n = hours.length
    const labels = hours.map((h) => h.time.slice(11, 16))
    const W = 1000
    const H = 300
    const xf = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)

    const series = group.series.map((s) => {
      const vals = hours.map((h) => Number(h[s.key] ?? 0))
      const lo = Math.min(...vals)
      const hi = Math.max(...vals)
      const span = hi - lo || 1
      const yf = (v: number) => H - ((v - lo) / span) * H
      const pts = vals.map((v, i) => ({ x: xf(i), y: yf(v), v, i }))
      const toPath = (slice: typeof pts) =>
        slice.map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
      const obs = pts.slice(0, nowIdx + 1)
      const proj = pts.slice(nowIdx)
      const now = vals[nowIdx] ?? vals[0]
      const future = vals.slice(nowIdx)
      const peak = Math.max(...future)
      const trough = Math.min(...future)
      const peakI = nowIdx + future.indexOf(peak)
      // Largest deviation from "now" across the forecast horizon.
      const dev = future.map((v) => Math.abs(v - now))
      const exRel = dev.indexOf(Math.max(...dev))
      const extreme = future[exRel]
      const extremeOffset = exRel
      return {
        ...s,
        vals,
        pts,
        obsPath: toPath(obs),
        projPath: toPath(proj),
        now,
        peak,
        trough,
        peakOffset: peakI - nowIdx,
        extreme,
        extremeOffset,
      }
    })

    const ticks = [0, 25, 50, 75, 100].map((pct) => ({ y: H - (pct / 100) * H, pct }))

    return { series, labels, W, H, nowX: xf(nowIdx), n, ticks }
  }, [hours, group, nowIdx])

  const active = hover ?? nowIdx
  const gust = model?.series.find((s) => s.key === "windGusts")
  const gustHigh = gust ? gust.peak >= gustThreshold(units) : false

  return (
    <Panel>
      <PanelHeader
        title="AI Prediction · 24-hour trend"
        meta={payload ? `${payload.location.name} · EmiratesConsensus` : "loading"}
        action={
          <span className="hidden items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-signal sm:inline-flex">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            AI model
          </span>
        }
      />

      <div className="p-4">
        {/* Group tabs */}
        <div role="tablist" aria-label="Prediction group" className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => {
            const Icon = g.icon
            const on = g.id === groupId
            return (
              <button
                key={g.id}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setGroupId(g.id)
                  setHover(null)
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  on
                    ? "border-signal bg-signal text-signal-foreground shadow"
                    : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{g.label}</span>
                <span className="sm:hidden">{g.short}</span>
              </button>
            )
          })}
        </div>

        {!model || isLoading ? (
          <div className="mt-4 flex h-[320px] animate-pulse items-center justify-center rounded-lg border border-border bg-secondary/30 text-sm text-muted-foreground">
            Building 24-hour projection…
          </div>
        ) : (
          <>
            {/* High wind-gust prediction callout (wind group) */}
            {group.id === "wind" && gust ? (
              <div
                className={cn(
                  "mt-4 flex items-center gap-3 rounded-lg border px-3.5 py-2.5",
                  gustHigh
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-accent/40 bg-accent/10 text-accent",
                )}
              >
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">
                  {gustHigh ? "High wind-gust warning — " : "Peak gust forecast — "}
                  <span className="font-mono font-semibold">
                    {gust.peak.toFixed(gust.decimals)} {gust.unit(units)}
                  </span>{" "}
                  expected at <span className="font-mono font-semibold">+{gust.peakOffset}h</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({model.labels[Math.min(nowIdx + gust.peakOffset, model.n - 1)]})
                  </span>
                </p>
              </div>
            ) : null}

            {/* Per-series stat strip */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {model.series.map((s) => (
                <div
                  key={s.key}
                  className={cn(
                    "rounded-lg border bg-card/60 px-3 py-2.5",
                    s.emphasize ? "border-2" : "border-border",
                  )}
                  style={s.emphasize ? { borderColor: s.color } : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                    <span className="label-caps truncate text-muted-foreground">{s.label}</span>
                  </div>
                  <p className="mt-1 font-mono text-xl font-semibold leading-none tabular-nums text-foreground">
                    {s.now.toFixed(s.decimals)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{s.unit(units)}</span>
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-[0.625rem] tabular-nums",
                      s.extreme >= s.now ? "text-accent" : "text-destructive",
                    )}
                  >
                    {s.extreme >= s.now ? "▲" : "▼"} {s.extreme.toFixed(s.decimals)} {s.unit(units)} at +
                    {s.extremeOffset}h
                  </p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <figure className="mt-4">
              <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-b from-secondary/20 to-transparent">
                <div className="flex">
                  {/* Y axis (normalized %) — top is 100% (max), bottom is 0% (min) */}
                  <div className="flex w-10 shrink-0 flex-col justify-between py-3 pr-1 text-right">
                    {[...model.ticks].reverse().map((t) => (
                      <span key={t.pct} className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">
                        {t.pct}%
                      </span>
                    ))}
                  </div>

                  <div className="relative flex-1 py-3 pr-3">
                    <svg
                      viewBox={`0 0 ${model.W} ${model.H}`}
                      preserveAspectRatio="none"
                      className="h-[260px] w-full overflow-visible sm:h-[320px]"
                      role="img"
                      aria-label={`24-hour AI prediction — ${group.label}`}
                    >
                      {/* Horizontal gridlines */}
                      {model.ticks.map((t) => (
                        <line
                          key={t.pct}
                          x1={0}
                          y1={t.y}
                          x2={model.W}
                          y2={t.y}
                          stroke="currentColor"
                          strokeWidth={1}
                          className="text-border"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}

                      {/* Shaded AI-projection region */}
                      <rect
                        x={model.nowX}
                        y={0}
                        width={model.W - model.nowX}
                        height={model.H}
                        fill="#f5b642"
                        opacity={0.05}
                      />

                      {/* Series lines: solid observed + dashed projection */}
                      {model.series.map((s) => (
                        <g key={s.key}>
                          <path
                            d={s.obsPath}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={s.emphasize ? 3.5 : 2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            opacity={0.95}
                          />
                          <path
                            d={s.projPath}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={s.emphasize ? 3.5 : 2}
                            strokeDasharray="6 5"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            opacity={0.9}
                          />
                        </g>
                      ))}

                      {/* Live "+Nh" cursor */}
                      <line
                        x1={model.series[0].pts[active].x}
                        y1={0}
                        x2={model.series[0].pts[active].x}
                        y2={model.H}
                        stroke="#4ade80"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        vectorEffect="non-scaling-stroke"
                      />

                      {/* Dots on each series at the active hour */}
                      {model.series.map((s) => (
                        <circle
                          key={`dot-${s.key}`}
                          cx={s.pts[active].x}
                          cy={s.pts[active].y}
                          r={4}
                          fill={s.color}
                          stroke="var(--color-background)"
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}

                      {/* Hover hit-areas */}
                      {model.series[0].pts.map((p) => (
                        <rect
                          key={p.i}
                          x={p.x - model.W / model.n / 2}
                          y={0}
                          width={model.W / model.n}
                          height={model.H}
                          fill="transparent"
                          onMouseEnter={() => setHover(p.i)}
                          onMouseLeave={() => setHover(null)}
                        />
                      ))}
                    </svg>

                    {/* "+Nh" cursor label */}
                    <span
                      className="pointer-events-none absolute top-1 -translate-x-1/2 rounded bg-[#4ade80] px-1.5 py-0.5 text-[0.5625rem] font-bold text-black"
                      style={{ left: `${(model.series[0].pts[active].x / model.W) * 100}%` }}
                    >
                      +{active}h
                    </span>

                    {/* Multi-series tooltip */}
                    <div
                      className={cn(
                        "pointer-events-none absolute top-6 min-w-[10rem] rounded-md border border-signal/50 bg-card/95 px-2.5 py-2 shadow-lg backdrop-blur",
                        model.series[0].pts[active].x > model.W * 0.6
                          ? "-translate-x-full"
                          : "translate-x-2",
                      )}
                      style={{ left: `${(model.series[0].pts[active].x / model.W) * 100}%` }}
                    >
                      <p className="mb-1 flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold text-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden="true" />+{active}h ·{" "}
                        {active <= nowIdx ? "live" : "AI forecast"} · {model.labels[active]}
                      </p>
                      <ul className="space-y-0.5">
                        {model.series.map((s) => (
                          <li key={s.key} className="flex items-center gap-1.5 font-mono text-[0.625rem]">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: s.color }}
                              aria-hidden="true"
                            />
                            <span className="text-muted-foreground">{s.label}:</span>
                            <span className="ml-auto font-semibold tabular-nums text-foreground">
                              {s.vals[active].toFixed(s.decimals)} {s.unit(units)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* X axis labels */}
                <div className="flex pl-10 pr-3 pb-2">
                  <div className="flex flex-1 justify-between font-mono text-[0.5625rem] tabular-nums text-muted-foreground">
                    {model.labels.map((l, i) =>
                      i % 3 === 0 || i === model.labels.length - 1 ? <span key={i}>{l}</span> : null,
                    )}
                  </div>
                </div>
              </div>

              {/* Legend + footnote */}
              <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {model.series.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <span className="h-2 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                      {s.label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-0 w-4 border-t-2 border-dashed border-muted-foreground"
                      aria-hidden="true"
                    />
                    AI projection
                  </span>
                </span>
                <span className="font-mono text-[0.625rem]">
                  Open-Meteo · each line normalized to its own 24h range · updates every 5 min
                </span>
              </figcaption>
            </figure>
          </>
        )}
      </div>
    </Panel>
  )
}
