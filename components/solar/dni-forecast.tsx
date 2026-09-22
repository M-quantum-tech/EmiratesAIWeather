"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Sun, Sparkles, Clock } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { TrendChart, type TrendPoint } from "@/components/station/trend-chart"
import { useWeather } from "@/components/weather/weather-provider"
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
  const { location } = useWeather()
  const [horizon, setHorizon] = useState<Horizon>(7)

  // Always request the 14-day window once, then slice client-side for the toggle —
  // avoids a second network round-trip when switching horizons.
  const key = location ? `/api/solar?lat=${location.latitude}&lon=${location.longitude}&days=14` : null
  const { data, error, isLoading } = useSWR<SolarPayload>(key, fetcher, {
    refreshInterval: 3 * 60 * 1000,
    keepPreviousData: true,
  })

  const days: SolarDay[] = useMemo(() => (data?.days ?? []).slice(0, horizon), [data, horizon])

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
          {([7, 14] as Horizon[]).map((h) => (
            <button
              key={h}
              type="button"
              role="tab"
              aria-selected={horizon === h}
              onClick={() => setHorizon(h)}
              className={cn(
                "rounded px-2.5 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-wider transition-colors",
                horizon === h
                  ? "bg-signal text-signal-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {h}-Day
            </button>
          ))}
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

          {/* Daily energy trend */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label-caps text-muted-foreground">Daily DNI energy yield</span>
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
                  return (
                    <tr key={d.date} className="border-t border-border/60 text-sm">
                      <td className="py-1.5 pr-2 font-medium text-foreground">{dayName(d.date, i)}</td>
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

          <p className="text-pretty text-[0.7rem] leading-relaxed text-muted-foreground">
            Direct Normal Irradiance (DNI) is the beam solar flux on a sun-tracking surface — the primary input for
            concentrating solar and panel-yield planning. Daily yield integrates the hourly DNI curve; values beyond ~7
            days carry increasing model uncertainty.
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
