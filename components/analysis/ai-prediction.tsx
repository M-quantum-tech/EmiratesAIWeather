"use client"

import { useId, useMemo, useState } from "react"
import { Droplets, Gauge, Sparkles, Thermometer, Wind } from "lucide-react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import { speedUnit, tempUnit } from "@/lib/weather"
import type { HourlyReading, Units } from "@/lib/weather"
import { cn } from "@/lib/utils"

const OBSERVED = "#38bdf8"
const PROJECTED = "#f5b642"

type ParamKey = "temperature" | "apparentTemperature" | "humidity" | "windSpeed" | "windGusts" | "precipitationProbability"

type ParamDef = {
  key: ParamKey
  label: string
  short: string
  icon: typeof Thermometer
  unit: (u: Units) => string
  decimals: number
}

const PARAMS: ParamDef[] = [
  { key: "temperature", label: "Temperature", short: "Temp", icon: Thermometer, unit: tempUnit, decimals: 0 },
  { key: "apparentTemperature", label: "Feels like", short: "Feels", icon: Thermometer, unit: tempUnit, decimals: 0 },
  { key: "humidity", label: "Humidity", short: "Humidity", icon: Droplets, unit: () => "%", decimals: 0 },
  { key: "windSpeed", label: "Wind speed", short: "Wind", icon: Wind, unit: speedUnit, decimals: 1 },
  { key: "windGusts", label: "Wind gusts", short: "Gusts", icon: Wind, unit: speedUnit, decimals: 1 },
  {
    key: "precipitationProbability",
    label: "Rain chance",
    short: "Rain %",
    icon: Gauge,
    unit: () => "%",
    decimals: 0,
  },
]

export function AiPrediction() {
  const { payload, isLoading } = useWeather()
  const gid = useId()
  const [param, setParam] = useState<ParamKey>("temperature")
  const [hover, setHover] = useState<number | null>(null)

  const units = payload?.units ?? "metric"
  const hours: HourlyReading[] = payload?.hourly ?? []
  const nowIdx = Math.min(Math.max(payload?.currentHourIndex ?? 0, 0), Math.max(hours.length - 1, 0))
  const def = PARAMS.find((p) => p.key === param) ?? PARAMS[0]
  const unitLabel = def.unit(units)

  const fmt = (v: number) => `${v.toFixed(def.decimals)}${unitLabel === "%" ? "" : ""}`

  const model = useMemo(() => {
    if (hours.length === 0) return null
    const values = hours.map((h) => Number(h[param] ?? 0))
    const labels = hours.map((h) => h.time.slice(11, 16))
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const span = hi - lo || 1
    const pad = span * 0.15
    const yMin = lo - pad
    const yMax = hi + pad
    const range = yMax - yMin || 1
    const n = values.length
    const W = 1000
    const H = 300
    const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
    const y = (v: number) => H - ((v - yMin) / range) * H
    const pts = values.map((v, i) => ({ x: x(i), y: y(v), v, label: labels[i], i }))

    const toPath = (slice: typeof pts) =>
      slice.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")

    const observed = pts.slice(0, nowIdx + 1)
    const projected = pts.slice(nowIdx)
    const obsArea = observed.length
      ? `${toPath(observed)} L${observed[observed.length - 1].x.toFixed(1)},${H} L${observed[0].x.toFixed(1)},${H} Z`
      : ""
    const projArea = projected.length
      ? `${toPath(projected)} L${projected[projected.length - 1].x.toFixed(1)},${H} L${projected[0].x.toFixed(1)},${H} Z`
      : ""

    // Gridlines: 4 horizontal bands with value labels.
    const ticks = Array.from({ length: 5 }, (_, i) => {
      const val = yMax - (range / 4) * i
      return { y: y(val), val }
    })

    const current = values[nowIdx] ?? values[0]
    const futureVals = values.slice(nowIdx)
    const peak = Math.max(...futureVals)
    const trough = Math.min(...futureVals)
    const peakIdx = nowIdx + futureVals.indexOf(peak)
    const troughIdx = nowIdx + futureVals.indexOf(trough)
    const endVal = values[values.length - 1]
    const delta = endVal - current

    return {
      pts,
      observed,
      projected,
      obsPath: toPath(observed),
      projPath: toPath(projected),
      obsArea,
      projArea,
      ticks,
      W,
      H,
      current,
      peak,
      trough,
      peakLabel: labels[peakIdx],
      troughLabel: labels[troughIdx],
      delta,
      nowX: x(nowIdx),
      labels,
      n,
    }
  }, [hours, param, nowIdx])

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
        {/* Parameter tabs */}
        <div role="tablist" aria-label="Prediction parameter" className="flex flex-wrap gap-1.5">
          {PARAMS.map((p) => {
            const Icon = p.icon
            const on = p.key === param
            return (
              <button
                key={p.key}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setParam(p.key)
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
                <span className="hidden sm:inline">{p.label}</span>
                <span className="sm:hidden">{p.short}</span>
              </button>
            )
          })}
        </div>

        {!model || isLoading ? (
          <div className="mt-4 flex h-[300px] animate-pulse items-center justify-center rounded-lg border border-border bg-secondary/30 text-sm text-muted-foreground">
            Building 24-hour projection…
          </div>
        ) : (
          <>
            {/* Stat strip */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Now" value={fmt(model.current)} unit={unitLabel} tone="observed" />
              <Stat
                label="Projected end"
                value={fmt(model.current + model.delta)}
                unit={unitLabel}
                delta={model.delta}
                decimals={def.decimals}
              />
              <Stat label={`Peak · ${model.peakLabel}`} value={fmt(model.peak)} unit={unitLabel} tone="projected" />
              <Stat label={`Low · ${model.troughLabel}`} value={fmt(model.trough)} unit={unitLabel} tone="projected" />
            </div>

            {/* Chart */}
            <figure className="mt-4">
              <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-b from-secondary/20 to-transparent">
                <div className="flex">
                  {/* Y axis labels */}
                  <div className="flex w-11 shrink-0 flex-col justify-between py-3 pr-1 text-right">
                    {model.ticks.map((t, i) => (
                      <span key={i} className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">
                        {t.val.toFixed(def.decimals)}
                      </span>
                    ))}
                  </div>

                  <div className="relative flex-1 py-3 pr-3">
                    <svg
                      viewBox={`0 0 ${model.W} ${model.H}`}
                      preserveAspectRatio="none"
                      className="h-[240px] w-full overflow-visible sm:h-[300px]"
                      role="img"
                      aria-label={`24-hour AI prediction for ${def.label}`}
                    >
                      <defs>
                        <linearGradient id={`${gid}-obs`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={OBSERVED} stopOpacity="0.28" />
                          <stop offset="100%" stopColor={OBSERVED} stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id={`${gid}-proj`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PROJECTED} stopOpacity="0.26" />
                          <stop offset="100%" stopColor={PROJECTED} stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal gridlines */}
                      {model.ticks.map((t, i) => (
                        <line
                          key={i}
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

                      {/* Projection shaded region background */}
                      <rect
                        x={model.nowX}
                        y={0}
                        width={model.W - model.nowX}
                        height={model.H}
                        fill={PROJECTED}
                        opacity={0.04}
                      />

                      {/* Areas */}
                      {model.obsArea ? <path d={model.obsArea} fill={`url(#${gid}-obs)`} /> : null}
                      {model.projArea ? <path d={model.projArea} fill={`url(#${gid}-proj)`} /> : null}

                      {/* Lines */}
                      <path
                        d={model.obsPath}
                        fill="none"
                        stroke={OBSERVED}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={model.projPath}
                        fill="none"
                        stroke={PROJECTED}
                        strokeWidth={2.5}
                        strokeDasharray="6 5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />

                      {/* NOW divider */}
                      <line
                        x1={model.nowX}
                        y1={0}
                        x2={model.nowX}
                        y2={model.H}
                        stroke={PROJECTED}
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        vectorEffect="non-scaling-stroke"
                      />

                      {/* Hover hit-areas + dot */}
                      {model.pts.map((p) => (
                        <g key={p.i}>
                          <rect
                            x={p.x - model.W / model.n / 2}
                            y={0}
                            width={model.W / model.n}
                            height={model.H}
                            fill="transparent"
                            onMouseEnter={() => setHover(p.i)}
                            onMouseLeave={() => setHover(null)}
                          />
                          {hover === p.i ? (
                            <>
                              <line
                                x1={p.x}
                                y1={0}
                                x2={p.x}
                                y2={model.H}
                                stroke="currentColor"
                                strokeWidth={1}
                                className="text-muted-foreground/40"
                                vectorEffect="non-scaling-stroke"
                              />
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={4}
                                fill={p.i <= nowIdx ? OBSERVED : PROJECTED}
                                stroke="var(--color-background)"
                                strokeWidth={2}
                                vectorEffect="non-scaling-stroke"
                              />
                            </>
                          ) : null}
                        </g>
                      ))}
                    </svg>

                    {/* NOW label */}
                    <span
                      className="pointer-events-none absolute top-1 -translate-x-1/2 rounded bg-signal px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase text-signal-foreground"
                      style={{ left: `${(model.nowX / model.W) * 100}%` }}
                    >
                      Now
                    </span>

                    {/* Hover tooltip */}
                    {hover != null ? (
                      <div
                        className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-center shadow-lg"
                        style={{
                          left: `${(model.pts[hover].x / model.W) * 100}%`,
                        }}
                      >
                        <p className="font-mono text-xs font-bold tabular-nums text-foreground">
                          {fmt(model.pts[hover].v)} {unitLabel}
                        </p>
                        <p className="font-mono text-[0.5625rem] text-muted-foreground">
                          {model.labels[hover]} · {hover <= nowIdx ? "observed" : "AI"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* X axis labels */}
                <div className="flex pl-11 pr-3 pb-2">
                  <div className="flex flex-1 justify-between font-mono text-[0.5625rem] tabular-nums text-muted-foreground">
                    {model.labels.map((l, i) =>
                      i % 3 === 0 || i === model.labels.length - 1 ? <span key={i}>{l}</span> : null,
                    )}
                  </div>
                </div>
              </div>

              <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full" style={{ background: OBSERVED }} />
                    Observed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-0 w-4 border-t-2 border-dashed"
                      style={{ borderColor: PROJECTED }}
                      aria-hidden="true"
                    />
                    AI projection
                  </span>
                </span>
                <span className="font-mono text-[0.625rem]">
                  Open-Meteo · normalized to local 00:00–23:00 · updates every 5 min
                </span>
              </figcaption>
            </figure>
          </>
        )}
      </div>
    </Panel>
  )
}

function Stat({
  label,
  value,
  unit,
  tone = "default",
  delta,
  decimals = 0,
}: {
  label: string
  value: string
  unit: string
  tone?: "default" | "observed" | "projected"
  delta?: number
  decimals?: number
}) {
  const dotColor = tone === "observed" ? OBSERVED : tone === "projected" ? PROJECTED : "var(--color-muted-foreground)"
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} aria-hidden="true" />
        <span className="label-caps truncate text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 font-mono text-xl font-semibold leading-none tabular-nums text-foreground">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
      {delta != null ? (
        <p
          className={cn(
            "mt-1 font-mono text-[0.625rem] tabular-nums",
            delta > 0 ? "text-accent" : delta < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(decimals)} {unit} over 24h
        </p>
      ) : null}
    </div>
  )
}
