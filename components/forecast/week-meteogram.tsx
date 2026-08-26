"use client"

import { useMemo } from "react"
import { Droplets, Gauge, Sun, Wind } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { WeatherIcon } from "@/components/weather/weather-icon"
import { useWeather } from "@/components/weather/weather-provider"
import {
  compass,
  describeCode,
  formatWeekday,
  precipUnit,
  tempUnit,
  toMetersPerSecond,
  uvBand,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

// SVG geometry for the temperature band (7 evenly spaced day columns).
const VB_W = 700
const VB_H = 150
const PAD_Y = 26

export function WeekMeteogram() {
  const { payload, units, isLoading } = useWeather()
  const days = payload?.daily?.slice(0, 7) ?? []

  const geometry = useMemo(() => {
    if (days.length === 0) return null
    const highs = days.map((d) => d.max)
    const lows = days.map((d) => d.min)
    const hi = Math.max(...highs)
    const lo = Math.min(...lows)
    const span = hi - lo || 1
    const colW = VB_W / days.length
    const toX = (i: number) => colW * i + colW / 2
    const toY = (t: number) => PAD_Y + (1 - (t - lo) / span) * (VB_H - PAD_Y * 2)

    const maxPts = days.map((d, i) => ({ x: toX(i), y: toY(d.max), t: d.max }))
    const minPts = days.map((d, i) => ({ x: toX(i), y: toY(d.min), t: d.min }))
    const line = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    const band = `${line(maxPts)} L${minPts[minPts.length - 1].x.toFixed(1)},${minPts[minPts.length - 1].y.toFixed(1)} ${minPts
      .slice()
      .reverse()
      .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ")} Z`
    return { maxPts, minPts, maxLine: line(maxPts), minLine: line(minPts), band, colW }
  }, [days])

  const wind = (kmhOrMph: number) =>
    units === "metric" ? `${toMetersPerSecond(kmhOrMph).toFixed(1)}` : `${Math.round(kmhOrMph)}`
  const windUnit = units === "metric" ? "m/s" : "mph"

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
          <h2 className="label-caps text-foreground/80">7-Day Forecast Meteogram</h2>
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-accent">
            Free · Full week
          </span>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            ECMWF model
          </span>
        </span>
      </header>

      {isLoading && days.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">Loading forecast…</div>
      ) : (
        <div className="flex flex-col">
          {/* Temperature band */}
          {geometry ? (
            <div className="border-b border-border px-2 pt-3">
              <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="h-40 w-full"
                role="img"
                aria-label="Seven day high and low temperature curve"
              >
                <defs>
                  <linearGradient id="mgram-band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <path d={geometry.band} fill="url(#mgram-band)" />
                <path
                  d={geometry.maxLine}
                  fill="none"
                  stroke="var(--color-signal)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d={geometry.minLine}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="1 4"
                />
                {geometry.maxPts.map((p, i) => (
                  <g key={`hi-${i}`}>
                    <circle cx={p.x} cy={p.y} r="3" fill="var(--color-signal)" />
                    <text
                      x={p.x}
                      y={p.y - 9}
                      textAnchor="middle"
                      className="fill-foreground font-mono"
                      style={{ fontSize: "13px", fontWeight: 600 }}
                    >
                      {Math.round(p.t)}°
                    </text>
                  </g>
                ))}
                {geometry.minPts.map((p, i) => (
                  <g key={`lo-${i}`}>
                    <circle cx={p.x} cy={p.y} r="3" fill="var(--color-accent)" />
                    <text
                      x={p.x}
                      y={p.y + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono"
                      style={{ fontSize: "12px" }}
                    >
                      {Math.round(p.t)}°
                    </text>
                  </g>
                ))}
              </svg>
              <div className="flex items-center justify-center gap-4 pb-1.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-signal" /> High {tempUnit(units)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-accent" /> Low {tempUnit(units)}
                </span>
              </div>
            </div>
          ) : null}

          {/* Per-day parameter columns */}
          <div className="grid grid-cols-3 gap-px bg-border sm:grid-cols-4 md:grid-cols-7">
            {days.map((d, i) => {
              const uv = uvBand(d.uvIndexMax)
              const cond = describeCode(d.weatherCode)
              const isToday = i === 0
              return (
                <div
                  key={d.date}
                  className={cn(
                    "flex flex-col items-center gap-2 bg-card px-2 py-3 text-center",
                    isToday && "bg-secondary/40",
                  )}
                >
                  <span className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-foreground">
                    {isToday ? "Today" : formatWeekday(d.date)}
                  </span>
                  <WeatherIcon code={d.weatherCode} className="h-7 w-7" />
                  <span className="sr-only">{cond.label}</span>

                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {Math.round(d.max)}°<span className="text-muted-foreground">/{Math.round(d.min)}°</span>
                  </span>
                  <span className="font-mono text-[0.5625rem] text-muted-foreground">
                    Feels {Math.round(d.apparentMax)}°
                  </span>

                  <dl className="mt-1 flex w-full flex-col gap-1.5 text-[0.625rem]">
                    <Row icon={<Droplets className="h-3 w-3 text-accent" />} label="Rain">
                      <span className="tabular-nums text-foreground">{d.precipitationProbability}%</span>
                    </Row>
                    <Row icon={<Gauge className="h-3 w-3 text-accent" />} label="Amt">
                      <span className="tabular-nums text-foreground">
                        {d.precipitationSum.toFixed(d.precipitationSum >= 10 ? 0 : 1)}
                        <span className="text-muted-foreground"> {precipUnit(units)}</span>
                      </span>
                    </Row>
                    <Row icon={<Wind className="h-3 w-3 text-signal" />} label="Wind">
                      <span className="tabular-nums text-foreground">
                        {wind(d.windMax)}
                        <span className="text-muted-foreground"> {windUnit}</span>
                      </span>
                    </Row>
                    <Row
                      icon={
                        <span
                          aria-hidden="true"
                          className="inline-block text-signal"
                          style={{ transform: `rotate(${d.windDirection}deg)`, fontSize: "10px", lineHeight: 1 }}
                        >
                          ↓
                        </span>
                      }
                      label="Gust"
                    >
                      <span className="tabular-nums text-foreground">
                        {wind(d.windGustMax)}
                        <span className="text-muted-foreground"> {compass(d.windDirection)}</span>
                      </span>
                    </Row>
                    <Row icon={<Droplets className="h-3 w-3 text-muted-foreground" />} label="Hum">
                      <span className="tabular-nums text-foreground">{Math.round(d.humidityMean)}%</span>
                    </Row>
                  </dl>

                  <span
                    className={cn(
                      "mt-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider",
                      uv.tone === "good" && "bg-accent/10 text-accent",
                      uv.tone === "moderate" && "bg-signal/10 text-signal",
                      uv.tone === "warn" && "bg-signal/15 text-signal",
                      uv.tone === "bad" && "bg-destructive/10 text-destructive",
                    )}
                  >
                    <Sun className="h-2.5 w-2.5" aria-hidden="true" />
                    UV {Math.round(d.uvIndexMax)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </span>
      {children}
    </div>
  )
}
