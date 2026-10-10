"use client"

import { useState } from "react"
import { BellRing, ChevronDown, RotateCcw } from "lucide-react"
import type { AlertLevel } from "@/lib/weather"
import type { SiteKey, SiteReadings } from "@/lib/escalation"
import { cn } from "@/lib/utils"

export type LiveAlarmTestValues = {
  readings: Record<SiteKey, SiteReadings>
  ncm: AlertLevel
}

const METRICS: { key: keyof SiteReadings; label: string; unit: string }[] = [
  { key: "windMs", label: "Wind speed", unit: "m/s" },
  { key: "gustMs", label: "Wind gust", unit: "m/s" },
  { key: "rainMm", label: "Rainfall", unit: "mm" },
  { key: "cloudPct", label: "Cloud cover", unit: "%" },
]

const SITES: { key: SiteKey; label: string }[] = [
  { key: "atSite", label: "At site" },
  { key: "farSite", label: "Far site" },
]

const NCM_LEVELS: AlertLevel[] = ["green", "yellow", "orange", "red"]

type Draft = Record<SiteKey, Record<keyof SiteReadings, string>>

function toDraft(readings: Record<SiteKey, SiteReadings>): Draft {
  const site = (r: SiteReadings) => ({
    windMs: String(Number(r.windMs.toFixed(1))),
    gustMs: String(Number(r.gustMs.toFixed(1))),
    rainMm: String(Number(r.rainMm.toFixed(1))),
    cloudPct: String(Math.round(r.cloudPct)),
  })
  return { atSite: site(readings.atSite), farSite: site(readings.farSite) }
}

function fromDraft(draft: Draft): Record<SiteKey, SiteReadings> {
  const num = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const site = (d: Draft[SiteKey]): SiteReadings => ({
    windMs: num(d.windMs),
    gustMs: num(d.gustMs),
    rainMm: num(d.rainMm),
    cloudPct: Math.min(100, num(d.cloudPct)),
  })
  return { atSite: site(draft.atSite), farSite: site(draft.farSite) }
}

/**
 * Live alarm test: pushes test values through the LIVE wiring (Wind Event Monitor,
 * escalation ranges at both sites, NCM / Al Bahar warning) so the real live buzzer,
 * including its 15 s auto-silence, can be checked. Reset returns to live readings.
 */
export function LiveAlarmTest({
  liveReadings,
  liveNcm,
  active,
  onTest,
  onReset,
  disabled,
}: {
  liveReadings: Record<SiteKey, SiteReadings>
  liveNcm: AlertLevel
  active: boolean
  onTest: (values: LiveAlarmTestValues) => void
  onReset: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(liveReadings))
  const [ncm, setNcm] = useState<AlertLevel>(liveNcm)

  const loadLive = () => {
    setDraft(toDraft(liveReadings))
    setNcm(liveNcm)
  }

  const handleReset = () => {
    onReset()
    loadLive()
  }

  return (
    <div className="border-b border-border bg-background/40">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={() => {
            if (!open && !active) loadLive()
            setOpen((v) => !v)
          }}
          aria-expanded={open}
          aria-controls="live-alarm-test-panel"
          className="inline-flex items-center gap-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-foreground hover:text-signal"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
          Live alarm test
        </button>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider",
            active ? "tier-blink border-accent/60 bg-accent/15 text-accent" : "border-border text-muted-foreground",
          )}
        >
          {active ? "Test values active" : "Live readings"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onTest({ readings: fromDraft(draft), ncm })}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-background transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            Test
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!active}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-foreground hover:bg-secondary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset to live
          </button>
        </span>
      </div>

      {open ? (
        <div id="live-alarm-test-panel" className="flex flex-col gap-3 px-4 pb-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {disabled
              ? "Turn the Simulator off to test the live alarm path."
              : "Enter test values, then press Test. They run through the live wiring (Wind Event Monitor, escalation ranges at both sites, NCM / Al Bahar warning) with the live 15 s buzzer. Reset to live returns to the real readings."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-xs">
              <thead>
                <tr className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 text-left font-medium">
                    Site
                  </th>
                  {METRICS.map((m) => (
                    <th key={m.key} scope="col" className="px-1 py-1 text-left font-medium">
                      {m.label} <span className="normal-case">({m.unit})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SITES.map((s) => (
                  <tr key={s.key}>
                    <th scope="row" className="py-1 pr-3 text-left font-mono text-[0.6875rem] font-semibold uppercase text-foreground">
                      {s.label}
                    </th>
                    {METRICS.map((m) => (
                      <td key={m.key} className="px-1 py-1">
                        <label className="sr-only" htmlFor={`lat-${s.key}-${m.key}`}>
                          {`${s.label} ${m.label} (${m.unit})`}
                        </label>
                        <input
                          id={`lat-${s.key}-${m.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.1"
                          value={draft[s.key][m.key]}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [s.key]: { ...d[s.key], [m.key]: e.target.value } }))
                          }
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm tabular-nums text-foreground focus:border-signal focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              NCM / Al Bahar warning
            </span>
            <div role="radiogroup" aria-label="NCM / Al Bahar test warning level" className="flex gap-1">
              {NCM_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={ncm === l}
                  onClick={() => setNcm(l)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider",
                    ncm === l ? "border-signal bg-signal/15 text-signal" : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadLive}
              className="ml-auto font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Load current live values
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
