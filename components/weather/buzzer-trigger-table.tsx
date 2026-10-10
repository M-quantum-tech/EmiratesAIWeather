"use client"

import { Fragment } from "react"
import {
  BUZZER_METRIC_KEYS,
  ESCALATION_LEVELS,
  SITE_KEYS,
  tierOverlaps,
  type BuzzerMetricKey,
  type EscalationRule,
  type SiteKey,
  type TierThresholds,
} from "@/lib/escalation"
import type { AlertLevel } from "@/lib/weather"
import { cn } from "@/lib/utils"

const TIER_META: Record<AlertLevel, { name: string; dot: string; text: string; fill: string; ring: string }> = {
  green: { name: "Green", dot: "bg-alert-green", text: "text-alert-green", fill: "bg-alert-green/10", ring: "ring-alert-green/60" },
  yellow: { name: "Yellow", dot: "bg-alert-yellow", text: "text-alert-yellow", fill: "bg-alert-yellow/10", ring: "ring-alert-yellow/60" },
  orange: { name: "Orange", dot: "bg-alert-orange", text: "text-alert-orange", fill: "bg-alert-orange/15", ring: "ring-alert-orange/60" },
  red: { name: "Red", dot: "bg-alert-red", text: "text-alert-red", fill: "bg-alert-red/15", ring: "ring-alert-red/60" },
}

const METRIC_INFO: Record<BuzzerMetricKey, { name: string; unit: string }> = {
  windMs: { name: "Wind speed", unit: "m/s" },
  gustMs: { name: "Wind gust", unit: "m/s" },
  rainMm: { name: "Rainfall", unit: "mm" },
  cloudPct: { name: "Cloud cover", unit: "%" },
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * Read-only view of what sounds the auto buzzer, derived from the Escalation rules.
 * Shared by the Engineering Console and the weather station.
 */
export function BuzzerTriggerTable({
  thresholds,
  rules,
  activeLevel,
  title = "Auto buzzer trigger table · read only",
  caption = "Mirrors the Escalation rules — any one value ≥ entry buzzes (OR) · releases below entry − dead band",
  className,
}: {
  thresholds: Record<SiteKey, TierThresholds>
  rules: EscalationRule[]
  activeLevel?: AlertLevel
  title?: string
  caption?: string
  className?: string
}) {
  const overlaps = tierOverlaps(rules)

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background/40", className)}>
      <div className="flex flex-col gap-1 border-b border-border/60 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <span className="label-caps text-foreground">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{caption}</span>
      </div>
      {overlaps.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1 border-b border-alert-orange/40 bg-alert-orange/10 px-3 py-2.5">
          <span className="font-mono text-xs font-bold uppercase tracking-wide text-alert-orange">
            Range conflict — lower tier starts at or above a higher tier
          </span>
          <ul className="flex flex-col gap-0.5 text-xs leading-relaxed text-foreground">
            {overlaps.map((o) => (
              <li key={`${o.siteKey}-${o.metric}-${o.lower}-${o.higher}`}>
                {o.siteKey === "atSite" ? "At site" : "Far site"} · {METRIC_INFO[o.metric].name}:{" "}
                {TIER_META[o.lower].name} {fmtNum(o.lowerEntry)} ≥ {TIER_META[o.higher].name} {fmtNum(o.higherEntry)}{" "}
                <span className="text-muted-foreground">— this reading escalates straight to {TIER_META[o.higher].name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th
                scope="col"
                rowSpan={2}
                className="sticky left-0 z-10 border-r border-border/60 bg-muted px-3 py-2 font-mono font-medium uppercase tracking-wide text-muted-foreground"
              >
                Tier
              </th>
              {BUZZER_METRIC_KEYS.map((key) => (
                <th
                  key={key}
                  scope="colgroup"
                  colSpan={3}
                  className="border-r border-border/60 px-3 pt-2 pb-1 text-center font-mono font-semibold uppercase tracking-wide text-foreground last:border-r-0"
                >
                  {METRIC_INFO[key].name}
                  <span className="ml-1 font-normal normal-case text-muted-foreground">({METRIC_INFO[key].unit})</span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-border/60 bg-muted/40 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {BUZZER_METRIC_KEYS.map((key) => (
                <Fragment key={key}>
                  <th scope="col" className="px-2 pb-2 text-center font-medium">At site</th>
                  <th scope="col" className="px-2 pb-2 text-center font-medium">Far site</th>
                  <th scope="col" className="border-r border-border/60 px-2 pb-2 text-center font-medium last:border-r-0">
                    Dead band
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {ESCALATION_LEVELS.map((level) => {
              const meta = TIER_META[level]
              const isGreen = level === "green"
              const isActive = activeLevel === level
              const db = rules.find((r) => r.level === level)?.deadbands
              const yellowDb = rules.find((r) => r.level === "yellow")?.deadbands
              return (
                <tr
                  key={level}
                  aria-current={isActive ? "true" : undefined}
                  className={cn("border-b border-border/40 last:border-b-0", meta.fill, isActive && cn("ring-2 ring-inset", meta.ring))}
                >
                  <th scope="row" className="sticky left-0 z-10 border-r border-border/60 bg-card px-3 py-2.5 align-middle">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
                      <span className={cn("font-mono text-xs font-bold uppercase tracking-wide", meta.text)}>{meta.name}</span>
                      {isActive ? (
                        <span className={cn("rounded px-1 font-mono text-[9px] font-bold uppercase tracking-wider", meta.fill, meta.text)}>
                          Now
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                      {isGreen ? "All clear · buzzer silent" : "Buzzer sounds"}
                    </span>
                  </th>
                  {BUZZER_METRIC_KEYS.map((key) => {
                    const band = db?.[key] ?? 0
                    return (
                      <Fragment key={key}>
                        {SITE_KEYS.map((siteKey) => {
                          if (isGreen) {
                            const yEntry = thresholds[siteKey].yellow[key]
                            const clears = yEntry == null ? null : Math.max(0, yEntry - (yellowDb?.[key] ?? 0))
                            return (
                              <td key={siteKey} className="px-2 py-2.5 text-center align-middle font-mono tabular-nums">
                                {yEntry == null || clears == null ? (
                                  <span className="text-muted-foreground/60">—</span>
                                ) : (
                                  <span className="flex flex-col items-center leading-tight">
                                    <span className="text-foreground">{"< "}{fmtNum(yEntry)}</span>
                                    <span className="text-[10px] text-muted-foreground">clears ≤ {fmtNum(clears)}</span>
                                  </span>
                                )}
                              </td>
                            )
                          }
                          const t = thresholds[siteKey][level][key]
                          return (
                            <td key={siteKey} className="px-2 py-2 text-center align-middle">
                              <span className="flex flex-col items-center gap-0.5">
                                <span
                                  className={cn(
                                    "whitespace-nowrap font-mono text-sm font-semibold tabular-nums",
                                    t == null ? "text-muted-foreground/60" : "text-foreground",
                                  )}
                                >
                                  {t == null ? "off" : `≥ ${fmtNum(t)}`}
                                </span>
                                <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
                                  {t == null ? "not driving" : `rel < ${fmtNum(Math.max(0, t - band))}`}
                                </span>
                              </span>
                            </td>
                          )
                        })}
                        <td className="border-r border-border/60 px-2 py-2 text-center align-middle last:border-r-0">
                          {isGreen ? (
                            <span className="font-mono text-muted-foreground/60">—</span>
                          ) : (
                            <span className="flex flex-col items-center gap-0.5">
                              <span className="font-mono text-sm tabular-nums text-foreground">{fmtNum(band)}</span>
                              <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">± both sites</span>
                            </span>
                          )}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
