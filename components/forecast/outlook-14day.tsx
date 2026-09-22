"use client"

import { useMemo } from "react"
import { Droplets, Sun, Wind } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { WeatherIcon } from "@/components/weather/weather-icon"
import { useWeather } from "@/components/weather/weather-provider"
import { compass, describeCode, formatWeekday, toMetersPerSecond, uvBand } from "@/lib/weather"
import { cn } from "@/lib/utils"

// SVG geometry for the temperature band. Width scales with the day count so the
// 14-day spread reads evenly; the viewBox lets it shrink responsively.
const VB_W = 980
const VB_H = 150
const PAD_Y = 26

/**
 * The forecast Open-Meteo returns for any given point is a per-location blend of the
 * world's best operational models. We surface that provenance so the outlook isn't a
 * black box — global models cover the full 14-day horizon everywhere, regional models
 * sharpen the near term where their domain applies.
 */
const MODEL_SOURCES = [
  { code: "ECMWF", name: "European Centre (IFS)", scope: "global" },
  { code: "DWD", name: "Deutscher Wetterdienst (ICON)", scope: "global" },
  { code: "NOAA", name: "US NOAA (GFS)", scope: "global" },
  { code: "Météo-France", name: "ARPEGE / AROME", scope: "global" },
  { code: "JMA", name: "Japan Meteorological Agency", scope: "global" },
  { code: "KMA", name: "Korea Meteorological Admin.", scope: "global" },
  { code: "UK Met Office", name: "UKMO seamless", scope: "global" },
  { code: "BOM", name: "Bureau of Meteorology (ACCESS-G)", scope: "global" },
  { code: "KNMI", name: "HARMONIE-AROME", scope: "regional" },
  { code: "DMI", name: "HARMONIE-AROME", scope: "regional" },
  { code: "MeteoSwiss", name: "ICON-CH", scope: "regional" },
] as const

export function Outlook14Day() {
  const { payload, units, selectedDay, setSelectedDay, isLoading } = useWeather()
  const days = payload?.daily?.slice(0, 14) ?? []

  // Selecting a day drives the merged DNI + 24-hour breakdown below, exactly like the
  // forecast strip, the DNI table, and the trend cursor — one shared selected day.
  function selectDay(index: number) {
    setSelectedDay(index)
    if (typeof document !== "undefined") {
      document.getElementById("hourly")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

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
          <h2 className="label-caps text-foreground/80">14-Day Outlook</h2>
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-accent">
            Free · 14 days
          </span>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Multi-model blend
          </span>
        </span>
      </header>

      {isLoading && days.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">Loading outlook…</div>
      ) : (
        <div className="flex flex-col">
          {/* Temperature band across all 14 days */}
          {geometry ? (
            <div className="border-b border-border px-2 pt-3">
              <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="h-40 w-full"
                role="img"
                aria-label="Fourteen day high and low temperature curve"
              >
                <defs>
                  <linearGradient id="outlook-band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                {/* Selected-day guide keeps the band in sync with the cells + breakdown below */}
                {geometry.maxPts[selectedDay] ? (
                  <line
                    x1={geometry.maxPts[selectedDay].x}
                    y1={PAD_Y - 14}
                    x2={geometry.maxPts[selectedDay].x}
                    y2={VB_H - PAD_Y + 14}
                    stroke="var(--color-signal)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.7"
                  />
                ) : null}
                <path d={geometry.band} fill="url(#outlook-band)" />
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
                    <circle cx={p.x} cy={p.y} r={i === selectedDay ? 4 : 2.5} fill="var(--color-signal)" />
                    <text
                      x={p.x}
                      y={p.y - 9}
                      textAnchor="middle"
                      className="fill-foreground font-mono"
                      style={{ fontSize: "12px", fontWeight: 600 }}
                    >
                      {Math.round(p.t)}°
                    </text>
                  </g>
                ))}
                {geometry.minPts.map((p, i) => (
                  <g key={`lo-${i}`}>
                    <circle cx={p.x} cy={p.y} r={i === selectedDay ? 4 : 2.5} fill="var(--color-accent)" />
                    <text
                      x={p.x}
                      y={p.y + 15}
                      textAnchor="middle"
                      className="fill-muted-foreground font-mono"
                      style={{ fontSize: "11px" }}
                    >
                      {Math.round(p.t)}°
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          ) : null}

          {/* Per-day cells — every day selectable and synced to the breakdown */}
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 md:grid-cols-7 xl:grid-cols-[repeat(14,minmax(0,1fr))]">
            {days.map((d, i) => {
              const uv = uvBand(d.uvIndexMax)
              const cond = describeCode(d.weatherCode)
              const isToday = i === 0
              const isSelected = i === selectedDay
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => selectDay(i)}
                  aria-pressed={isSelected}
                  aria-label={`${isToday ? "Today" : formatWeekday(d.date)}: high ${Math.round(d.max)} degrees, low ${Math.round(
                    d.min,
                  )} degrees, ${cond.label}. Show hourly breakdown.`}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 bg-card px-1.5 py-3 text-center transition-colors",
                    "hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal",
                    isToday && !isSelected && "bg-secondary/25",
                    isSelected && "bg-signal/10",
                  )}
                >
                  {isSelected ? (
                    <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-signal" />
                  ) : null}
                  <span
                    className={cn(
                      "font-mono text-[0.625rem] font-semibold uppercase tracking-wider",
                      isSelected ? "text-signal" : "text-foreground",
                    )}
                  >
                    {isToday ? "Today" : formatWeekday(d.date)}
                  </span>
                  <WeatherIcon code={d.weatherCode} className="h-6 w-6" />
                  <span className="sr-only">{cond.label}</span>

                  <span className="font-mono text-xs tabular-nums text-foreground">
                    {Math.round(d.max)}°<span className="text-muted-foreground">/{Math.round(d.min)}°</span>
                  </span>

                  <dl className="mt-0.5 flex w-full flex-col gap-1 text-[0.625rem]">
                    <div className="flex items-center justify-center gap-1">
                      <Droplets className="h-2.5 w-2.5 text-accent" aria-hidden="true" />
                      <span className="tabular-nums text-foreground">{d.precipitationProbability}%</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <Wind className="h-2.5 w-2.5 text-signal" aria-hidden="true" />
                      <span className="tabular-nums text-foreground">
                        {wind(d.windMax)}
                        <span className="text-muted-foreground"> {windUnit}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className="inline-block text-signal"
                        style={{ transform: `rotate(${d.windDirection}deg)`, fontSize: "9px", lineHeight: 1 }}
                      >
                        ↓
                      </span>
                      <span className="tabular-nums">{compass(d.windDirection)}</span>
                    </div>
                  </dl>

                  <span
                    className={cn(
                      "mt-0.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider",
                      uv.tone === "good" && "bg-accent/10 text-accent",
                      uv.tone === "moderate" && "bg-signal/10 text-signal",
                      uv.tone === "warn" && "bg-signal/15 text-signal",
                      uv.tone === "bad" && "bg-destructive/10 text-destructive",
                    )}
                  >
                    <Sun className="h-2.5 w-2.5" aria-hidden="true" />
                    UV {Math.round(d.uvIndexMax)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Model provenance — the best data sources blended into this outlook */}
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps text-muted-foreground">Best data sources · blended per location</span>
              <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                via Open-Meteo
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {MODEL_SOURCES.map((m) => (
                <li key={m.code}>
                  <span
                    title={`${m.name} · ${m.scope === "global" ? "global · full 14-day horizon" : "regional · near-term sharpening"}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider",
                      m.scope === "global"
                        ? "border-signal/30 bg-signal/5 text-foreground/80"
                        : "border-border bg-secondary/40 text-muted-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("h-1 w-1 rounded-full", m.scope === "global" ? "bg-signal" : "bg-muted-foreground")}
                    />
                    {m.code}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
              The outlook auto-selects the best-performing model for this exact location. Global centres (ECMWF, DWD,
              NOAA, Météo-France, JMA, KMA, UK Met Office, BOM) drive the full 14-day horizon; regional high-resolution
              models (KNMI, DMI, MeteoSwiss) sharpen the near term inside their domains. Tap any day to load its
              hour-by-hour breakdown.
            </p>
          </div>
        </div>
      )}
    </Panel>
  )
}
