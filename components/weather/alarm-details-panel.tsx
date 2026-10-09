"use client"

import { Fragment } from "react"
import { CloudLightning, MapPin, Siren, Wind } from "lucide-react"
import type { AlertLevel, Hazard } from "@/lib/weather"
import type { AlertingLevel, MetricBreakdownRow } from "@/lib/escalation"
import { cn } from "@/lib/utils"

const LEVEL_TEXT: Record<AlertLevel, string> = {
  green: "text-alert-green",
  yellow: "text-alert-yellow",
  orange: "text-alert-orange",
  red: "text-alert-red",
}
const LEVEL_CHIP: Record<AlertLevel, string> = {
  green: "border-alert-green/40 bg-alert-green/10 text-alert-green",
  yellow: "border-alert-yellow/50 bg-alert-yellow/15 text-alert-yellow",
  orange: "border-alert-orange/50 bg-alert-orange/15 text-alert-orange",
  red: "border-alert-red/50 bg-alert-red/15 text-alert-red",
}
const ALERTING: AlertingLevel[] = ["yellow", "orange", "red"]

export type AlarmSite = {
  key: string
  name: string
  distanceKm: number
  compass: string | null
  sourceLabel: string
  tier: AlertLevel
  rows: MetricBreakdownRow[]
}

export type AlarmDriver = {
  id: string
  label: string
  level: AlertLevel
  reason: string
}

type Props = {
  finalLevel: AlertLevel
  alarmActive: boolean
  simulator: boolean
  drivers: AlarmDriver[]
  sites: AlarmSite[]
  forecastHazards: Hazard[]
  windMonitor: { level: AlertLevel; reason: string | null; windMs: number }
}

const fmt = (v: number) => (Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : "—")
const cap = (l: AlertLevel) => l.charAt(0).toUpperCase() + l.slice(1)

function LevelChip({ level, blink = false }: { level: AlertLevel; blink?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wider",
        LEVEL_CHIP[level],
        blink && level !== "green" && "tier-blink",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {level}
    </span>
  )
}

/**
 * Alarm Details — explains exactly why the Safety Model sits at its tier: every driver
 * (forecast, at-site ranges, far-site ranges, Wind Event Monitor) and each metric's live
 * value against the Yellow / Orange / Red entry values configured in the Engineering Console.
 */
export function AlarmDetailsPanel({
  finalLevel,
  alarmActive,
  simulator,
  drivers,
  sites,
  forecastHazards,
  windMonitor,
}: Props) {
  const triggering = drivers.filter((d) => d.level !== "green")

  return (
    <section
      id="alarm-details"
      aria-labelledby="alarm-details-title"
      className="scroll-mt-24 border-t border-border/60 p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn("grid h-7 w-7 place-items-center rounded-md border", LEVEL_CHIP[finalLevel])}>
            <Siren className={cn("h-4 w-4", alarmActive && "animate-pulse")} aria-hidden="true" />
          </span>
          <div>
            <h3 id="alarm-details-title" className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">
              Alarm details · why it triggered
            </h3>
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {simulator ? "Simulator readings" : "Live readings"} · entry values from the escalation ranges
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Safety model</span>
          <LevelChip level={finalLevel} blink={alarmActive} />
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wider",
              alarmActive ? LEVEL_CHIP[finalLevel] : "border-border text-muted-foreground",
            )}
          >
            Buzzer {alarmActive ? "sounding" : "standby"}
          </span>
        </span>
      </div>

      {/* Driver summary — the worst driver sets the tier */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {drivers.map((d) => (
          <div
            key={d.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border px-3 py-2.5",
              d.level !== "green" ? LEVEL_CHIP[d.level] : "border-border bg-background/40",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-foreground">
                {d.label}
              </span>
              <LevelChip level={d.level} />
            </span>
            <span className="text-pretty text-xs leading-relaxed text-foreground/80">{d.reason}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
        {triggering.length
          ? `Triggered by ${triggering.map((d) => d.label).join(" + ")}. The highest driver sets the Safety Model tier.`
          : "No driver is above Green — the Safety Model and buzzer are standing by."}
      </p>

      {/* Per-metric breakdown table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <caption className="sr-only">Live readings against each tier&apos;s entry value, per site</caption>
          <thead>
            <tr className="border-b border-border bg-secondary/50 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-semibold">Metric</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Live value</th>
              {ALERTING.map((l) => (
                <th key={l} scope="col" className={cn("px-3 py-2 text-right font-semibold", LEVEL_TEXT[l])}>
                  {cap(l)} ≥
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-semibold">Reached</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <Fragment key={site.key}>
                <tr className="border-b border-border bg-background/60">
                  <th scope="rowgroup" colSpan={6} className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <MapPin className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                        {site.name}
                      </span>
                      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                        {site.distanceKm === 0
                          ? "0 km · your location"
                          : `${site.distanceKm} km${site.compass ? ` ${site.compass} (upwind)` : ""}`}
                        {" · "}
                        {site.sourceLabel}
                      </span>
                      <span className="ml-auto">
                        <LevelChip level={site.tier} blink={alarmActive} />
                      </span>
                    </span>
                  </th>
                </tr>
                {site.rows.map((row) => {
                  const hit = row.reached !== "green"
                  return (
                    <tr
                      key={row.key}
                      className={cn("border-b border-border/60 last:border-b-0", hit && "bg-secondary/40")}
                    >
                      <th scope="row" className="px-3 py-2 font-medium text-foreground">
                        {row.label}
                      </th>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono font-bold tabular-nums",
                          hit ? LEVEL_TEXT[row.reached] : "text-foreground",
                        )}
                      >
                        {fmt(row.value)} <span className="text-xs font-medium text-muted-foreground">{row.unit}</span>
                      </td>
                      {ALERTING.map((l) => {
                        const entry = row.entries[l]
                        const met = entry != null && Number.isFinite(row.value) && row.value >= entry
                        return (
                          <td
                            key={l}
                            className={cn(
                              "px-3 py-2 text-right font-mono tabular-nums",
                              met ? cn("font-bold", LEVEL_TEXT[l]) : "text-muted-foreground",
                            )}
                          >
                            {entry != null ? fmt(entry) : "—"}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2">
                        <LevelChip level={row.reached} />
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Forecast hazards + Wind Event Monitor */}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <CloudLightning className="h-3.5 w-3.5" aria-hidden="true" /> Forecast hazards (model)
          </span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {forecastHazards.length ? (
              forecastHazards.map((h) => (
                <li key={h.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{h.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-foreground/80">{h.value}</span>
                    <LevelChip level={h.level} />
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No forecast hazards.</li>
            )}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <Wind className="h-3.5 w-3.5" aria-hidden="true" /> Wind Event Monitor (at-site sustained wind)
          </span>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-mono font-bold tabular-nums text-foreground">
              {fmt(windMonitor.windMs)} m/s
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                · {Math.round(windMonitor.windMs * 3.6)} km/h
              </span>
            </span>
            <LevelChip level={windMonitor.level} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {windMonitor.reason ?? "Below every Wind Event Monitor threshold — it only reads sustained wind, not gust, rain or cloud."}
          </p>
        </div>
      </div>
    </section>
  )
}
