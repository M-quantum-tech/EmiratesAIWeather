"use client"

import { useMemo, useState } from "react"
import { CloudRain, Compass, Droplets, Gauge, Navigation, Thermometer, Umbrella, Waves } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { WeatherIcon } from "@/components/weather/weather-icon"
import { useWeather } from "@/components/weather/weather-provider"
import {
  compass,
  describeCode,
  formatWeekday,
  precipUnit,
  speedUnit,
  tempUnit,
  toMetersPerSecond,
  weatherEmoji,
  type Units,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

type Range = "day" | "week"

type Column = {
  key: string
  /** Short axis label, e.g. "07" or "Mon". */
  label: string
  /** Longer label for tooltips/aria, e.g. "07:00". */
  full: string
  isDay: boolean
  code: number
  emoji: string
  condition: string
  temp: number
  tempMin?: number
  feels: number
  precip: number
  precipProb: number
  humidity: number
  windSpeed: number
  windGust: number
  windDir: number
}

/** Temperature → colour ramp (input already in °C) for the heat ribbon. */
function tempColorC(tC: number) {
  const stops: [number, string][] = [
    [-10, "#818cf8"],
    [0, "#60a5fa"],
    [10, "#38bdf8"],
    [18, "#22d3ee"],
    [24, "#34d399"],
    [30, "#fbbf24"],
    [36, "#fb923c"],
    [42, "#ef4444"],
    [48, "#db2777"],
  ]
  if (tC <= stops[0][0]) return stops[0][1]
  if (tC >= stops[stops.length - 1][0]) return stops[stops.length - 1][1]
  for (let i = 1; i < stops.length; i++) {
    if (tC <= stops[i][0]) return stops[i][1]
  }
  return stops[stops.length - 1][1]
}

/** Humidity → cell background tint: drier reads yellow-green, more humid reads blue. */
function humidityTint(rh: number) {
  const clamped = Math.min(100, Math.max(0, rh))
  const hue = 90 + (clamped / 100) * 110 // 90 (yellow-green) dry → 200 (blue) humid
  return `oklch(0.62 0.11 ${hue} / 0.32)`
}

function buildColumns(
  payload: NonNullable<ReturnType<typeof useWeather>["payload"]>,
  units: Units,
  range: Range,
  selectedDay: number,
): Column[] {
  const isMetric = units === "metric"
  const speed = (v: number) => (isMetric ? toMetersPerSecond(v) : v)

  if (range === "day") {
    const dayHours = payload.hourlyByDay?.[selectedDay] ?? payload.hourly
    return dayHours.slice(0, 24).map((h, i) => {
      const cond = describeCode(h.weatherCode)
      return {
        key: `h${i}`,
        label: h.time.slice(11, 13),
        full: h.time.slice(11, 16),
        isDay: h.isDay,
        code: h.weatherCode,
        emoji: weatherEmoji(h.weatherCode, h.isDay),
        condition: cond.short,
        temp: h.temperature,
        feels: h.apparentTemperature,
        precip: h.precipitation,
        precipProb: h.precipitationProbability,
        humidity: h.humidity,
        windSpeed: speed(h.windSpeed),
        windGust: speed(h.windGusts),
        windDir: h.windDirection,
      }
    })
  }

  return payload.daily.slice(0, 7).map((d, i) => {
    const cond = describeCode(d.weatherCode)
    return {
      key: `d${i}`,
      label: formatWeekday(d.date),
      full: formatWeekday(d.date),
      isDay: true,
      code: d.weatherCode,
      emoji: weatherEmoji(d.weatherCode, true),
      condition: cond.short,
      temp: d.max,
      tempMin: d.min,
      feels: d.apparentMax,
      precip: d.precipitationSum,
      precipProb: d.precipitationProbability,
      humidity: d.humidityMean,
      windSpeed: speed(d.windMax),
      windGust: speed(d.windGustMax),
      windDir: d.windDirection,
    }
  })
}

export function DeepDiveMap() {
  const { payload, units, selectedDay } = useWeather()
  const [range, setRange] = useState<Range>("day")
  const [active, setActive] = useState<number | null>(null)

  const columns = useMemo(
    () => (payload ? buildColumns(payload, units, range, selectedDay) : []),
    [payload, units, range, selectedDay],
  )

  if (!payload || columns.length === 0) {
    return <Panel className="h-[32rem] animate-pulse" />
  }

  const isMetric = units === "metric"
  const toC = (t: number) => (isMetric ? t : ((t - 32) * 5) / 9)
  const n = columns.length
  // "Now" marker only makes sense on the current day's hourly view.
  const nowIdx = range === "day" && selectedDay === 0 ? payload.currentHourIndex : -1
  const selectedDate = payload.daily[selectedDay]?.date ?? ""
  const dayName = selectedDay === 0 ? "Today" : selectedDay === 1 ? "Tomorrow" : formatWeekday(selectedDate)

  // Ribbon geometry (shared 0..100 vertical space, small padding).
  const temps = columns.map((c) => c.temp)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  const span = hi - lo || 1
  const yFrac = (t: number) => {
    const padded = 0.16
    const norm = (t - lo) / span
    return 1 - (padded + norm * (1 - padded * 2))
  }
  const cx = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50)
  const ribbonPath = columns.map((c, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(2)},${(yFrac(c.temp) * 100).toFixed(2)}`).join(" ")
  const gradId = `heat-${range}`
  const noPrecip = columns.every((c) => c.precip <= 0)

  const rangeLabel = range === "day" ? "24-hour" : "7-day"

  return (
    <section aria-label="Graphical weather breakdown" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="flex items-center gap-2 label-caps">
            <Thermometer className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
            Meteogram · every parameter in one view
          </span>
          <h2 className="mt-1.5 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {range === "day" ? `${dayName} · hourly breakdown` : "7-day graphical breakdown"}
          </h2>
        </div>
        <div
          role="tablist"
          aria-label="Forecast range"
          className="inline-flex rounded-lg border border-border bg-card/60 p-1 text-sm font-medium"
        >
          {(["day", "week"] as Range[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => {
                setRange(r)
                setActive(null)
              }}
              className={cn(
                "rounded-md px-4 py-2 transition-colors",
                range === r ? "bg-signal text-signal-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "day" ? "Full day · 24h" : "Full week · 7d"}
            </button>
          ))}
        </div>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div style={{ minWidth: n > 12 ? `${n * 3.4 + 4}rem` : undefined }}>
            {/* Hour / day axis */}
            <MeteoRow>
              <RowLabel>{range === "day" ? "Time" : "Day"}</RowLabel>
              <Cells>
                {columns.map((c, i) => (
                  <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive}>
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums sm:text-sm",
                        i === nowIdx ? "font-bold text-signal" : "text-muted-foreground",
                      )}
                    >
                      {range === "day" ? c.label : c.label}
                    </span>
                  </Cell>
                ))}
              </Cells>
            </MeteoRow>

            {/* Weather-condition emoji */}
            <MeteoRow>
              <RowLabel>Sky</RowLabel>
              <Cells>
                {columns.map((c, i) => (
                  <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive}>
                    <span title={`${c.full} · ${c.condition}`}>
                      <WeatherIcon code={c.code} className="h-5 w-5 sm:h-6 sm:w-6" />
                      <span className="sr-only">{c.condition}</span>
                    </span>
                  </Cell>
                ))}
              </Cells>
            </MeteoRow>

            {/* Temperature heat band over a day/night sky — the signature element */}
            <div className="flex items-stretch border-b border-border">
              <RowLabel className="items-center">
                <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">{tempUnit(units)}</span>
              </RowLabel>
              <div className="relative h-[200px] flex-1 sm:h-[230px]">
                {/* Sky background per column (day = light blue, night = deep navy) */}
                <div className="absolute inset-0 flex">
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      className="flex-1"
                      style={{
                        background: c.isDay
                          ? "linear-gradient(to bottom, #bfe6fb, #e9f5fc)"
                          : "linear-gradient(to bottom, #0b1b30, #16304f)",
                      }}
                    />
                  ))}
                </div>
                {/* Heat ribbon */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full overflow-visible"
                  role="img"
                  aria-label={`${rangeLabel} temperature curve`}
                >
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                      {columns.map((c, i) => (
                        <stop
                          key={c.key}
                          offset={`${n > 1 ? (i / (n - 1)) * 100 : 50}%`}
                          stopColor={tempColorC(toC(c.temp))}
                        />
                      ))}
                    </linearGradient>
                    <filter id={`${gradId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {/* Soft glow underlay */}
                  <path
                    d={ribbonPath}
                    fill="none"
                    stroke={`url(#${gradId})`}
                    strokeWidth={22}
                    strokeOpacity={0.28}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    filter={`url(#${gradId}-glow)`}
                  />
                  {/* Main ribbon */}
                  <path
                    d={ribbonPath}
                    fill="none"
                    stroke={`url(#${gradId})`}
                    strokeWidth={18}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {/* Temperature labels riding the curve as pill chips */}
                <div className="absolute inset-0">
                  {columns.map((c, i) => (
                    <span
                      key={c.key}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                      style={{ left: `${cx(i)}%`, top: `${yFrac(c.temp) * 100}%` }}
                    >
                      <span
                        className="rounded-full px-1.5 py-0.5 font-mono text-xs font-bold leading-none tabular-nums text-white ring-1 ring-white/25 sm:text-sm"
                        style={{
                          background: tempColorC(toC(c.temp)),
                          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                        }}
                      >
                        {Math.round(c.temp)}°
                      </span>
                      {range === "week" && c.tempMin != null ? (
                        <span
                          className="mt-1 rounded-full bg-black/35 px-1.5 py-0.5 font-mono text-[0.625rem] font-medium leading-none tabular-nums text-white/85"
                        >
                          {Math.round(c.tempMin)}°
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
                {/* Now marker */}
                {nowIdx >= 0 ? (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-signal shadow-[0_0_8px_var(--color-signal)]"
                    style={{ left: `${cx(nowIdx)}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>

            {/* Precipitation amount (or "no precip" banner) */}
            <div className="flex items-stretch border-b border-border">
              <RowLabel className="items-center">
                <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">{precipUnit(units)}</span>
              </RowLabel>
              {noPrecip ? (
                <div className="flex flex-1 items-center justify-center py-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  No precipitation expected
                </div>
              ) : (
                <Cells>
                  {columns.map((c, i) => (
                    <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive}>
                      <span
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          c.precip > 0 ? "font-semibold text-accent" : "text-muted-foreground/50",
                        )}
                      >
                        {c.precip > 0 ? c.precip.toFixed(isMetric ? 1 : 2) : "·"}
                      </span>
                    </Cell>
                  ))}
                </Cells>
              )}
            </div>

            {/* Precipitation probability */}
            <MeteoRow>
              <RowLabel className="items-center">
                <Umbrella className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">%</span>
              </RowLabel>
              <Cells>
                {columns.map((c, i) => (
                  <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive}>
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        c.precipProb >= 50 ? "font-semibold text-accent" : "text-muted-foreground",
                      )}
                    >
                      {Math.round(c.precipProb)}
                    </span>
                  </Cell>
                ))}
              </Cells>
            </MeteoRow>

            {/* Feels-like temperature */}
            <MeteoRow>
              <RowLabel className="items-center">
                <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">feels</span>
              </RowLabel>
              <Cells>
                {columns.map((c, i) => (
                  <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive}>
                    <span
                      className="font-mono text-xs font-semibold tabular-nums"
                      style={{ color: tempColorC(toC(c.feels)) }}
                    >
                      {Math.round(c.feels)}°
                    </span>
                  </Cell>
                ))}
              </Cells>
            </MeteoRow>

            {/* Relative humidity with colour cells */}
            <div className="flex items-stretch border-b border-border">
              <RowLabel className="items-center">
                <Waves className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">RH%</span>
              </RowLabel>
              <div className="flex flex-1">
                {columns.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    className={cn(
                      "flex flex-1 items-center justify-center py-2.5",
                      i === nowIdx && "ring-1 ring-inset ring-signal",
                    )}
                    style={{ background: humidityTint(c.humidity) }}
                  >
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {Math.round(c.humidity)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Wind direction + speed */}
            <MeteoRow>
              <RowLabel className="items-center">
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">{speedUnit(units)}</span>
              </RowLabel>
              <Cells>
                {columns.map((c, i) => (
                  <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive}>
                    <span className="flex flex-col items-center gap-1">
                      <Navigation
                        aria-hidden="true"
                        className="h-3.5 w-3.5 fill-accent text-accent"
                        style={{ transform: `rotate(${c.windDir + 180}deg)` }}
                      />
                      <span className="sr-only">{`${Math.round(c.windDir)}° ${compass(c.windDir)}`}</span>
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {c.windSpeed.toFixed(isMetric ? 1 : 0)}
                      </span>
                    </span>
                  </Cell>
                ))}
              </Cells>
            </MeteoRow>

            {/* Wind gust */}
            <div className="flex items-stretch">
              <RowLabel className="items-center">
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[0.625rem]">gust</span>
              </RowLabel>
              <Cells>
                {columns.map((c, i) => (
                  <Cell key={c.key} i={i} active={active} nowIdx={nowIdx} setActive={setActive} last>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {c.windGust.toFixed(isMetric ? 1 : 0)}
                    </span>
                  </Cell>
                ))}
              </Cells>
            </div>
          </div>
        </div>

        {/* Footer key */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Droplets className="h-3 w-3" aria-hidden="true" />
            {range === "day" ? "00h → 23h · every hour" : "7-day outlook"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "linear-gradient(90deg,#38bdf8,#fbbf24,#ef4444,#db2777)" }} />
            cool → hot
          </span>
          {range === "day" ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-0.5 bg-signal" />
              now
            </span>
          ) : null}
          <span className="ml-auto normal-case tracking-normal">Open-Meteo · wind {speedUnit(units)}</span>
        </div>
      </Panel>
    </section>
  )
}

/* ---- small presentational helpers ---- */

function MeteoRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-stretch border-b border-border">{children}</div>
}

function RowLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex w-16 shrink-0 flex-col justify-center gap-0.5 border-r border-border bg-secondary/40 px-2 py-1 text-muted-foreground sm:w-20 [&_svg]:h-4 [&_svg]:w-4",
        className,
      )}
    >
      {children}
    </div>
  )
}

function Cells({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1">{children}</div>
}

function Cell({
  children,
  i,
  active,
  nowIdx,
  setActive,
  last,
}: {
  children: React.ReactNode
  i: number
  active: number | null
  nowIdx: number
  setActive: (i: number | null) => void
  last?: boolean
}) {
  return (
    <div
      onMouseEnter={() => setActive(i)}
      onMouseLeave={() => setActive(null)}
      className={cn(
        "flex flex-1 items-center justify-center py-2",
        !last && "",
        i === nowIdx && "bg-signal/10",
        active === i && "bg-foreground/[0.06]",
      )}
    >
      {children}
    </div>
  )
}
