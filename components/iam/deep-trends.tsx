"use client"

import { useMemo, useState } from "react"
import { useWeather } from "@/components/weather/weather-provider"
import { TrendChart, type TrendPoint } from "@/components/station/trend-chart"
import { TIER_CLASS, tierFor, toMm, toMs } from "@/components/iam/live-snapshot"
import { formatWeekday, type AlertLevel, type HourlyReading, type Units } from "@/lib/weather"
import { cn } from "@/lib/utils"

type MetricKey = "wind" | "gust" | "rain" | "cloud" | "temp" | "humidity"

const METRICS: { key: MetricKey; label: string; unit: string; color: string; digits: number }[] = [
  { key: "wind", label: "Wind speed", unit: "m/s", color: "var(--color-accent)", digits: 1 },
  { key: "gust", label: "Wind gust", unit: "m/s", color: "var(--color-signal)", digits: 1 },
  { key: "rain", label: "Rainfall", unit: "mm", color: "var(--color-chart-2)", digits: 1 },
  { key: "cloud", label: "Cloud cover", unit: "%", color: "var(--color-chart-3)", digits: 0 },
  { key: "temp", label: "Temperature", unit: "°", color: "var(--color-alert-orange)", digits: 1 },
  { key: "humidity", label: "Humidity", unit: "%", color: "var(--color-chart-2)", digits: 0 },
]

function value(h: HourlyReading, key: MetricKey, units: Units): number {
  switch (key) {
    case "wind":
      return toMs(h.windSpeed, units)
    case "gust":
      return toMs(h.windGusts, units)
    case "rain":
      return toMm(h.precipitation, units)
    case "cloud":
      return h.cloudCover
    case "temp":
      return h.temperature
    case "humidity":
      return h.humidity
  }
}

function stats(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, p95: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, p95 }
}

function hourLabel(time: string) {
  const d = new Date(time)
  return `${formatWeekday(time).slice(0, 3)} ${String(d.getHours()).padStart(2, "0")}:00`
}

const TIERS: AlertLevel[] = ["green", "yellow", "orange", "red"]

export function DeepTrends() {
  const { payload, isLoading, error } = useWeather()
  const [range, setRange] = useState<number | "all">("all")

  const units = payload?.units ?? "metric"
  const days = payload?.hourlyByDay ?? []

  const hours = useMemo(() => {
    if (range === "all") return days.flat()
    return days[range] ?? []
  }, [days, range])

  const tierHours = useMemo(() => {
    const counts: Record<AlertLevel, number> = { green: 0, yellow: 0, orange: 0, red: 0 }
    const peaks: { time: string; tier: AlertLevel; wind: number; rain: number }[] = []
    for (const h of hours) {
      const wind = toMs(h.windGusts, units)
      const rain = toMm(h.precipitation, units)
      const t = tierFor(wind, rain)
      counts[t]++
      if (t !== "green") peaks.push({ time: h.time, tier: t, wind, rain })
    }
    const rank = (t: AlertLevel) => TIERS.indexOf(t)
    peaks.sort((a, b) => rank(b.tier) - rank(a.tier) || b.wind - a.wind)
    return { counts, peaks: peaks.slice(0, 8) }
  }, [hours, units])

  if (error && !payload) {
    return <p className="rounded-xl border border-border bg-card p-6 text-sm text-destructive">{error.message}</p>
  }
  if (!payload || hours.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        {isLoading ? "Loading trend data…" : "No trend data available."}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Analysis window">
        <RangeButton active={range === "all"} onClick={() => setRange("all")}>
          All {days.length} days
        </RangeButton>
        {days.map((d, i) => (
          <RangeButton key={d[0]?.time ?? i} active={range === i} onClick={() => setRange(i)}>
            {d[0] ? formatWeekday(d[0].time) : `Day ${i + 1}`}
          </RangeButton>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <span className="label-caps">Hours in each escalation tier (gust / rainfall)</span>
          <div className="flex h-4 w-full overflow-hidden rounded-full border border-border bg-secondary">
            {TIERS.map((t) =>
              tierHours.counts[t] > 0 ? (
                <div
                  key={t}
                  style={{ width: `${(tierHours.counts[t] / hours.length) * 100}%`, background: `var(--color-alert-${t})` }}
                  title={`${t}: ${tierHours.counts[t]} h`}
                />
              ) : null,
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TIERS.map((t) => (
              <div key={t} className={cn("flex flex-col gap-0.5 rounded-lg border bg-background px-3 py-2", TIER_CLASS[t])}>
                <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em]">{t}</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums text-foreground">
                  {tierHours.counts[t]}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">h</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <span className="label-caps">Peak risk hours</span>
          {tierHours.peaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hours above green in this window.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {tierHours.peaks.map((p) => (
                <li key={p.time} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="font-mono text-muted-foreground">{hourLabel(p.time)}</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {p.wind.toFixed(1)} m/s · {p.rain.toFixed(1)} mm
                  </span>
                  <span className={cn("rounded border px-1.5 font-mono text-[0.625rem] uppercase", TIER_CLASS[p.tier])}>
                    {p.tier}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {METRICS.map((m) => {
          const points: TrendPoint[] = hours.map((h) => ({ label: hourLabel(h.time), value: value(h, m.key, units) }))
          const s = stats(points.map((p) => p.value))
          const unit = m.key === "temp" ? (units === "metric" ? "°C" : "°F") : m.unit
          return (
            <article key={m.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{m.label}</h2>
                <span className="label-caps">{unit}</span>
              </header>
              <TrendChart points={points} unit={unit} color={m.color} format={(v) => v.toFixed(m.digits)} height={130} />
              <dl className="grid grid-cols-4 gap-2 border-t border-border pt-3">
                {(["min", "mean", "p95", "max"] as const).map((k) => (
                  <div key={k} className="flex flex-col">
                    <dt className="label-caps">{k === "p95" ? "P95" : k}</dt>
                    <dd className="font-mono text-sm tabular-nums text-foreground">{s[k].toFixed(m.digits)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function RangeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-md border px-3 font-mono text-xs uppercase tracking-[0.12em] transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
