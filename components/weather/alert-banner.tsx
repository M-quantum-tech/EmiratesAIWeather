"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Activity, BellRing, BellOff, CloudRain, Droplets, Gauge, ShieldCheck, Siren, Wind } from "lucide-react"
import { buildAlert, DANGER_RADIUS_KM, formatClock, type AlertLevel, type HazardKey } from "@/lib/weather"
import { useWeather } from "@/components/weather/weather-provider"
import { cn } from "@/lib/utils"

const LEVEL_STYLES: Record<
  AlertLevel,
  { bar: string; text: string; chip: string; solid: string; glowShadow: string }
> = {
  green: {
    bar: "bg-alert-green/10 border-alert-green/40",
    text: "text-alert-green",
    chip: "bg-alert-green/15 text-alert-green border-alert-green/40",
    solid: "bg-alert-green",
    glowShadow: "",
  },
  yellow: {
    bar: "bg-alert-yellow/10 border-alert-yellow/40",
    text: "text-alert-yellow",
    chip: "bg-alert-yellow/15 text-alert-yellow border-alert-yellow/40",
    solid: "bg-alert-yellow",
    glowShadow: "",
  },
  orange: {
    bar: "bg-alert-orange/10 border-alert-orange/40",
    text: "text-alert-orange",
    chip: "bg-alert-orange/15 text-alert-orange border-alert-orange/40",
    solid: "bg-alert-orange",
    glowShadow: "",
  },
  red: {
    bar: "bg-alert-red/14 border-alert-red/50",
    text: "text-alert-red",
    chip: "bg-alert-red/15 text-alert-red border-alert-red/50",
    solid: "bg-alert-red",
    glowShadow: "alert-glow",
  },
}

const LADDER: { level: AlertLevel; label: string; solid: string }[] = [
  { level: "green", label: "SAFE", solid: "bg-alert-green" },
  { level: "yellow", label: "CAUTION", solid: "bg-alert-yellow" },
  { level: "orange", label: "SEVERE", solid: "bg-alert-orange" },
  { level: "red", label: "DANGER", solid: "bg-alert-red" },
]

const HAZARD_ICON: Record<HazardKey, typeof Wind> = {
  gust: Gauge,
  wind: Wind,
  rain: CloudRain,
  precip: Droplets,
}

/** Looping two-tone emergency buzzer via the Web Audio API (no asset needed). */
function useBuzzer(active: boolean, muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active || muted) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      return
    }
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AudioCtor) return
    if (!ctxRef.current) ctxRef.current = new AudioCtor()
    const ctx = ctxRef.current
    if (ctx.state === "suspended") ctx.resume().catch(() => {})

    const beep = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "square"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + dur)
    }
    const cycle = () => {
      const t = ctx.currentTime
      beep(880, t, 0.22)
      beep(660, t + 0.28, 0.22)
    }
    cycle()
    timerRef.current = setInterval(cycle, 1100)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [active, muted])

  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {})
    },
    [],
  )
}

export function AlertBanner() {
  const { payload, isValidating } = useWeather()
  const alert = useMemo(() => (payload ? buildAlert(payload) : null), [payload])
  const [muted, setMuted] = useState(false)

  const danger = alert?.danger ?? false
  useBuzzer(danger, muted)

  if (!payload || !alert) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-panel" />
  }

  const styles = LEVEL_STYLES[alert.level]
  const activeIndex = LADDER.findIndex((l) => l.level === alert.level)
  const rankedHazards = [...alert.hazards].sort((a, b) => {
    const order = { red: 3, orange: 2, yellow: 1, green: 0 } as const
    return order[b.level] - order[a.level]
  })

  return (
    <section aria-label="Advance AI safety model" className={cn("station-rise rounded-xl border", styles.bar)}>
      {/* Header ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-signal/15 text-signal">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-foreground">
            Advance AI Safety Model
          </h2>
          <span className="hidden rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-signal sm:inline">
            4-tier
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <span className={cn("relative flex h-2 w-2", isValidating && "animate-pulse")}>
              <span className="absolute inline-flex h-full w-full rounded-full bg-alert-green opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-alert-green" />
            </span>
            Live · updated {formatClock(payload.current.time)}
          </span>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            aria-label={muted ? "Unmute danger buzzer" : "Mute danger buzzer"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider transition-colors",
              danger
                ? "border-alert-red/50 bg-alert-red/15 text-alert-red hover:bg-alert-red/25"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {muted ? <BellOff className="h-3 w-3" aria-hidden="true" /> : <BellRing className="h-3 w-3" aria-hidden="true" />}
            {muted ? "Muted" : "Buzzer"}
          </button>
        </span>
      </div>

      {/* Red buzzer strip — only when danger detected within the radius */}
      {danger ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-alert-red/40 bg-alert-red/15 px-4 py-2 text-alert-red"
        >
          <Siren className={cn("h-4 w-4 shrink-0", !muted && "animate-pulse")} aria-hidden="true" />
          <span className="text-sm font-bold uppercase tracking-wide">Red Buzzer</span>
          <span className="text-xs font-medium">
            Severe conditions detected within {DANGER_RADIUS_KM} km — take shelter now.
          </span>
        </div>
      ) : null}

      {/* Big live status */}
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "grid h-24 w-24 shrink-0 place-items-center rounded-2xl border-2 text-5xl",
              styles.chip,
              styles.glowShadow,
            )}
            aria-hidden="true"
          >
            <span>{alert.emoji}</span>
          </div>
          <div className="min-w-0">
            <span className="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
              Current safety status
            </span>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-4xl font-black uppercase tracking-tight sm:text-5xl", styles.text)}>
                {alert.title}
              </span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-widest",
                  styles.chip,
                )}
              >
                {alert.code}
              </span>
            </div>
            <h3 className={cn("mt-1 text-balance text-base font-semibold tracking-tight", styles.text)}>
              {alert.headline}
            </h3>
            <p className="mt-0.5 text-pretty text-sm text-muted-foreground">{alert.detail}</p>
          </div>
        </div>

        {/* Severity meter + ladder */}
        <div className="flex flex-col gap-3 sm:ml-auto sm:min-w-[15rem] sm:items-end">
          <div className="flex w-full items-center gap-2 sm:justify-end">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Severity</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary sm:max-w-[10rem]">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-all", styles.solid)}
                style={{ width: `${alert.score}%` }}
              />
            </div>
            <span className={cn("font-mono text-xs font-bold tabular-nums", styles.text)}>{alert.score}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {LADDER.map((rung, i) => (
              <div key={rung.level} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "h-2.5 w-10 rounded-full transition-opacity",
                    rung.solid,
                    i === activeIndex ? "opacity-100" : "opacity-20",
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[0.5rem] font-bold uppercase tracking-wide",
                    i === activeIndex ? styles.text : "text-muted-foreground/60",
                  )}
                >
                  {rung.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live background hazard data feeding the model */}
      <div className="border-t border-border/60 px-4 pb-4 pt-3">
        <span className="flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3" aria-hidden="true" />
          Live background data · {DANGER_RADIUS_KM} km scan
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rankedHazards.map((h) => {
            const Icon = HAZARD_ICON[h.key]
            const hs = LEVEL_STYLES[h.level]
            return (
              <div
                key={h.key}
                className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", hs.chip)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[0.5625rem] uppercase tracking-wider opacity-80">
                    {h.label}
                  </span>
                  <span className="block text-sm font-bold tabular-nums">{h.value}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
