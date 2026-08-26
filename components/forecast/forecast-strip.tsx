"use client"

import { useWeather } from "@/components/weather/weather-provider"
import { Panel } from "@/components/station/panel"
import {
  buildDailyAlert,
  compass,
  formatWeekday,
  tempUnit,
  toMetersPerSecond,
  weatherEmoji,
  type AlertLevel,
  type DailyReading,
  type Units,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

const SAFETY_META: Record<AlertLevel, { label: string; dot: string; chip: string }> = {
  green: { label: "SAFE", dot: "bg-alert-green", chip: "bg-alert-green/15 text-alert-green border-alert-green/40" },
  yellow: { label: "CAUTION", dot: "bg-alert-yellow", chip: "bg-alert-yellow/15 text-alert-yellow border-alert-yellow/40" },
  orange: { label: "SEVERE", dot: "bg-alert-orange", chip: "bg-alert-orange/15 text-alert-orange border-alert-orange/40" },
  red: { label: "DANGER", dot: "bg-alert-red", chip: "bg-alert-red/15 text-alert-red border-alert-red/50" },
}

function DaySafetyBadge({ day, units }: { day: DailyReading; units: Units }) {
  const { level } = buildDailyAlert(day, units)
  const meta = SAFETY_META[level]
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[0.5rem] font-bold uppercase tracking-wider",
        meta.chip,
        level === "red" && "alert-glow",
      )}
      title={`AI safety model: ${meta.label}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, level === "red" && "animate-pulse")} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

function daylightHours(sunrise: string, sunset: string) {
  const rise = new Date(sunrise).getTime()
  const set = new Date(sunset).getTime()
  if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return null
  return (set - rise) / 3_600_000
}

function dayLabel(date: string, index: number) {
  if (index === 0) return "Today"
  if (index === 1) return "Tomorrow"
  return formatWeekday(date)
}

function shortDate(date: string) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`)
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`
}

export function ForecastStrip() {
  const { payload, units, selectedDay, setSelectedDay } = useWeather()
  const daily = payload?.daily ?? []

  if (daily.length === 0) {
    return (
      <Panel className="p-0">
        <ForecastStripHeader />
        <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
          Loading forecast…
        </div>
      </Panel>
    )
  }

  return (
    <Panel className="p-0">
      <ForecastStripHeader />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-4 pb-1 pt-3">
        {daily.slice(0, 7).map((day: DailyReading, index) => {
          const active = index === selectedDay
          const light = daylightHours(day.sunrise, day.sunset)
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDay(index)}
              aria-pressed={active}
              aria-label={`Show hourly forecast for ${dayLabel(day.date, index)}`}
              className={cn(
                "flex min-w-[7.25rem] flex-1 flex-col items-center gap-2 rounded-xl border px-2.5 py-3 text-center transition-colors",
                active
                  ? "border-signal bg-signal/10 ring-1 ring-signal"
                  : "border-border bg-card/50 hover:border-signal/50 hover:bg-card",
              )}
            >
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "text-[0.7rem] font-semibold uppercase tracking-wide",
                    active ? "text-signal" : "text-foreground",
                  )}
                >
                  {dayLabel(day.date, index)}
                </span>
                <span className="font-mono text-[0.65rem] text-muted-foreground">{shortDate(day.date)}</span>
              </div>

              <span className="text-2xl leading-none" aria-hidden="true">
                {weatherEmoji(day.weatherCode, true)}
              </span>

              <div className="flex items-baseline gap-1.5">
                <span className="rounded-md bg-alert-orange/15 px-1.5 py-0.5 font-mono text-sm font-semibold text-alert-orange">
                  {Math.round(day.max)}°
                </span>
                <span className="font-mono text-xs text-muted-foreground">{Math.round(day.min)}°</span>
              </div>

              <DaySafetyBadge day={day} units={units} />

              <div className="flex flex-col items-center gap-0.5 text-[0.65rem] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block"
                    style={{ transform: `rotate(${day.windDirection + 180}deg)` }}
                    aria-hidden="true"
                  >
                    ↑
                  </span>
                  {units === "metric"
                    ? `${toMetersPerSecond(day.windMax).toFixed(0)} m/s`
                    : `${Math.round(day.windMax)} mph`}{" "}
                  {compass(day.windDirection)}
                </span>
                {light !== null ? (
                  <span aria-label={`${light.toFixed(0)} hours of daylight`}>
                    ☀ {light.toFixed(0)} h
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
      <p className="px-4 pb-3 pt-2 text-center text-[0.7rem] text-muted-foreground">
        Showing hourly detail for{" "}
        <span className="font-semibold text-foreground">
          {dayLabel(daily[selectedDay]?.date ?? "", selectedDay)}
        </span>{" "}
        · {tempUnit(units)}
      </p>
    </Panel>
  )
}

function ForecastStripHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <span className="flex items-center gap-2.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
        <h2 className="label-caps text-foreground/80">7-Day Forecast</h2>
      </span>
      <span className="label-caps text-muted-foreground">AI safety level per day · tap for hourly</span>
    </header>
  )
}
