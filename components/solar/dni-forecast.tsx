"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Sun, Sparkles, Clock, Lock } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { TrendChart, type TrendPoint } from "@/components/station/trend-chart"
import { useWeather } from "@/components/weather/weather-provider"
import { usePro } from "@/components/pro/use-pro"
import { UnlockPro } from "@/components/pro/unlock-pro"
import { dniBand, formatWeekday, type SolarDay, type SolarPayload } from "@/lib/weather"
import { cn } from "@/lib/utils"

type Horizon = 7 | 14

async function fetcher(url: string): Promise<SolarPayload> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? "Solar reading failed.")
  }
  return response.json()
}

const TONE_TEXT: Record<ReturnType<typeof dniBand>["tone"], string> = {
  good: "text-alert-green",
  moderate: "text-signal",
  warn: "text-alert-orange",
  bad: "text-alert-red",
}

function hourLabel(hour: number) {
  const suffix = hour < 12 ? "AM" : "PM"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${suffix}`
}

function dayName(date: string, index: number) {
  if (index === 0) return "Today"
  if (index === 1) return "Tmrw"
  return formatWeekday(date)
}

export function DniForecast() {
  const { location, selectedDay, setSelectedDay } = useWeather()
  const { isPro } = usePro()
  const [horizon, setHorizon] = useState<Horizon>(7)

  // Selecting a day here drives the 24-Hour Breakdown panel (both read the same
  // weather context). Only the free 7-day window maps to the hourly breakdown, so
  // rows beyond index 6 (the Pro 14-day extension) are display-only.
  function selectDay(index: number) {
    if (index > 6) return
    setSelectedDay(index)
    if (typeof document !== "undefined") {
      document.getElementById("hourly")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // The extended 14-day AI-prediction horizon is a Pro feature. Free users always
  // see the 7-day EmiratesConsensus model; picking 14-day reveals an unlock prompt.
  const locked = horizon === 14 && !isPro

  // Always request the 14-day window once, then slice client-side for the toggle —
  // avoids a second network round-trip when switching horizons.
  const key = location ? `/api/solar?lat=${location.latitude}&lon=${location.longitude}&days=14` : null
  const { data, error, isLoading } = useSWR<SolarPayload>(key, fetcher, {
    refreshInterval: 3 * 60 * 1000,
    keepPreviousData: true,
  })

  // Free/locked users are held to the 7-day model even after tapping 14-day.
  const effectiveHorizon = locked ? 7 : horizon
  const days: SolarDay[] = useMemo(
    () => (data?.days ?? []).slice(0, effectiveHorizon),
    [data, effectiveHorizon],
  )

  const stats = useMemo(() => {
    if (days.length === 0) return null
    const totalEnergy = days.reduce((sum, d) => sum + d.dniEnergy, 0)
    const avgEnergy = totalEnergy / days.length
    const best = days.reduce((top, d) => (d.dniEnergy > top.dniEnergy ? d : top), days[0])
    const peakDni = days.reduce((top, d) => Math.max(top, d.peakDni), 0)
    return { avgEnergy, best, peakDni }
  }, [days])

  const points: TrendPoint[] = useMemo(
    () => days.map((d, i) => ({ label: dayName(d.date, i), value: d.dniEnergy })),
    [days],
  )

  return (
    <Panel className="p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-signal/15 text-signal">
            <Sun className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h2 className="label-caps text-foreground/80">DNI Solar Forecast</h2>
          <span className="hidden rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-signal sm:inline">
            Direct normal irradiance
          </span>
        </span>
        <div
          role="tablist"
          aria-label="Forecast horizon"
          className="flex items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5"
        >
          {([7, 14] as Horizon[]).map((h) => {
            const proTab = h === 14 && !isPro
            return (
              <button
                key={h}
                type="button"
                role="tab"
                aria-selected={horizon === h}
                onClick={() => setHorizon(h)}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-wider transition-colors",
                  horizon === h
                    ? "bg-signal text-signal-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {proTab ? <Lock className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                {h}-Day
              </button>
            )
          })}
        </div>
      </header>

      {error && !data ? (
        <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-destructive">
          {error.message}
        </div>
      ) : isLoading && !data ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading irradiance model…
        </div>
      ) : days.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No solar data for this location.
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {/* Summary stat rail */}
          {stats ? (
            <div className="grid grid-cols-3 gap-2">
              <SolarStat
                icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                label={`Avg yield · ${horizon}d`}
                value={`${stats.avgEnergy.toFixed(1)}`}
                unit="kWh/m²/day"
                band={dniBand(stats.avgEnergy)}
              />
              <SolarStat
                icon={<Sun className="h-3.5 w-3.5" aria-hidden="true" />}
                label="Peak DNI"
                value={`${stats.peakDni}`}
                unit="W/m²"
              />
              <SolarStat
                icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                label="Best day"
                value={dayName(stats.best.date, days.indexOf(stats.best))}
                unit={`${stats.best.dniEnergy.toFixed(1)} kWh/m²`}
              />
            </div>
          ) : null}

          {/* Daily energy trend — one point per day, driven by the 7-day EmiratesConsensus model */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label-caps text-muted-foreground">
                Daily DNI energy yield · {effectiveHorizon}-day trend
              </span>
              <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                kWh/m²/day
              </span>
            </div>
            <TrendChart
              points={points}
              unit="kWh/m²"
              format={(v) => v.toFixed(1)}
              height={150}
              color="var(--color-signal)"
            />
          </div>

          {/* Per-day breakdown */}
          <div className="mb-1 flex items-center justify-between">
            <span className="label-caps text-muted-foreground">Per-day breakdown</span>
            <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
              Tap a day for hourly
            </span>
          </div>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <thead>
                <tr className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-1.5 pr-2 font-medium">Day</th>
                  <th className="pb-1.5 pr-2 font-medium">Yield</th>
                  <th className="pb-1.5 pr-2 font-medium">Peak DNI</th>
                  <th className="pb-1.5 pr-2 font-medium">Peak at</th>
                  <th className="pb-1.5 pr-2 font-medium">Sun hrs</th>
                  <th className="pb-1.5 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d, i) => {
                  const band = dniBand(d.dniEnergy)
                  const selectable = i <= 6
                  const active = selectable && i === selectedDay
                  return (
                    <tr
                      key={d.date}
                      onClick={selectable ? () => selectDay(i) : undefined}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "border-t border-border/60 text-sm transition-colors",
                        selectable && "cursor-pointer hover:bg-secondary/40",
                        active && "bg-signal/10",
                      )}
                    >
                      <td className="py-1.5 pr-2 font-medium text-foreground">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-3 w-0.5 rounded-full transition-colors",
                              active ? "bg-signal" : "bg-transparent",
                            )}
                          />
                          {dayName(d.date, i)}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-foreground">
                        {d.dniEnergy.toFixed(1)}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">{d.peakDni}</td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">
                        {hourLabel(d.peakHour)}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">{d.sunHours}</td>
                      <td className={cn("py-1.5 font-mono text-xs font-bold uppercase", TONE_TEXT[band.tone])}>
                        {band.label}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {locked ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-accent/40 bg-accent/5 px-6 py-6 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-accent">
                <Lock className="h-3 w-3" aria-hidden="true" />
                14-day AI prediction · Pro
              </span>
              <h3 className="text-balance text-sm font-semibold text-foreground">
                Extend the solar forecast to 14 days
              </h3>
              <p className="max-w-md text-pretty text-xs leading-relaxed text-muted-foreground">
                The free view shows the 7-day EmiratesConsensus model. Sign in and go Pro to unlock the extended
                14-day AI DNI prediction with day-by-day yield, peak irradiance and grade breakdowns.
              </p>
              <UnlockPro label="Sign in to unlock 14-day" />
            </div>
          ) : null}

          <p className="text-pretty text-[0.7rem] leading-relaxed text-muted-foreground">
            Direct Normal Irradiance (DNI) is the beam solar flux on a sun-tracking surface — the primary input for
            concentrating solar and panel-yield planning. Daily yield integrates the hourly DNI curve; the free 7-day
            window is driven by the EmiratesConsensus model, while the Pro 14-day horizon extends it with the AI
            prediction model.
          </p>
        </div>
      )}
    </Panel>
  )
}

function SolarStat({
  icon,
  label,
  value,
  unit,
  band,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  band?: ReturnType<typeof dniBand>
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className={cn("text-lg font-bold leading-none", band ? TONE_TEXT[band.tone] : "text-foreground")}>
        {value}
      </span>
      <span className="font-mono text-[0.5625rem] text-muted-foreground">{unit}</span>
    </div>
  )
}
