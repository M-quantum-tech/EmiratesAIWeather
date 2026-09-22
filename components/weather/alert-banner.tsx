"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
  Activity,
  BellRing,
  BellOff,
  CloudRain,
  Droplets,
  Gauge,
  MapPin,
  Navigation,
  ShieldCheck,
  Siren,
  Timer,
  Wind,
} from "lucide-react"
import {
  ALERT_RADII_KM,
  buildAlert,
  compass,
  DANGER_RADIUS_KM,
  formatClock,
  offsetLocation,
  speedUnit,
  type AlertLevel,
  type HazardKey,
  type WeatherPayload,
} from "@/lib/weather"
import { ProximityRings } from "@/components/weather/proximity-rings"
import { useWeather } from "@/components/weather/weather-provider"
import { cn } from "@/lib/utils"

/** Header auto-refresh cadence (seconds) surfaced as a live countdown. */
const REFRESH_SECONDS = 60

async function farFetcher(url: string): Promise<Omit<WeatherPayload, "location">> {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Far-site reading failed.")
  return res.json()
}

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
  { level: "green", label: "GREEN", solid: "bg-alert-green" },
  { level: "yellow", label: "YELLOW", solid: "bg-alert-yellow" },
  { level: "orange", label: "ORANGE", solid: "bg-alert-orange" },
  { level: "red", label: "RED", solid: "bg-alert-red" },
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
  const { payload, isValidating, refresh } = useWeather()
  const alert = useMemo(() => (payload ? buildAlert(payload) : null), [payload])
  const [muted, setMuted] = useState(false)

  // Live 60-second auto-refresh counter shown in the header ribbon.
  const [countdown, setCountdown] = useState(REFRESH_SECONDS)
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          refresh()
          return REFRESH_SECONDS
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [refresh])

  // Far site: sample weather 50 km upwind (toward the wind's origin) so the model
  // previews approaching gusts before they reach the user's on-site location.
  const farPoint = useMemo(
    () =>
      payload
        ? offsetLocation(
            payload.location.latitude,
            payload.location.longitude,
            payload.current.windDirection,
            ALERT_RADII_KM.yellow,
          )
        : null,
    [payload],
  )
  const farKey =
    farPoint && payload
      ? `/api/weather?lat=${farPoint.lat.toFixed(3)}&lon=${farPoint.lon.toFixed(3)}&units=${payload.units}`
      : null
  const { data: farData } = useSWR(farKey, farFetcher, {
    refreshInterval: 3 * 60 * 1000,
    keepPreviousData: true,
  })

  const danger = alert?.danger ?? false
  useBuzzer(danger, muted)

  if (!payload || !alert) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-panel" />
  }

  const styles = LEVEL_STYLES[alert.level]
  const activeIndex = LADDER.findIndex((l) => l.level === alert.level)

  // On-site vs far-site (50 km upwind) wind-gust comparison.
  const onGust = payload.current.windGusts
  const farGust = farData?.current.windGusts ?? null
  const gustDelta = farGust != null ? farGust - onGust : null
  const approaching = gustDelta != null && gustDelta > 3
  const easing = gustDelta != null && gustDelta < -3
  const deltaTone = approaching ? "text-alert-orange" : easing ? "text-alert-green" : "text-muted-foreground"
  const deltaBorder = approaching
    ? "border-alert-orange/40 bg-alert-orange/10"
    : easing
      ? "border-alert-green/40 bg-alert-green/10"
      : "border-border bg-background/50"
  const deltaWord = gustDelta == null ? "Sampling" : approaching ? "Intensifying" : easing ? "Easing" : "Steady"
  const mm = Math.floor(countdown / 60)
  const ss = countdown % 60
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
          <span className="flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-signal">
            <Timer className={cn("h-3 w-3", isValidating && "animate-spin")} aria-hidden="true" />
            Refresh {mm}:{String(ss).padStart(2, "0")}
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

      {/* Big live status + proximity radar */}
      <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <div
              className={cn(
                "grid h-28 w-28 shrink-0 place-items-center rounded-2xl border-2 text-6xl sm:h-32 sm:w-32 sm:text-7xl",
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
                <span className={cn("text-5xl font-black uppercase tracking-tight sm:text-6xl", styles.text)}>
                  {alert.title}
                </span>
              </div>
              <h3 className={cn("mt-1.5 text-balance text-lg font-semibold tracking-tight sm:text-xl", styles.text)}>
                {alert.headline}
              </h3>
              <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">{alert.detail}</p>
            </div>
          </div>

          {/* Severity meter */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Severity</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-all", styles.solid)}
                style={{ width: `${alert.score}%` }}
              />
            </div>
            <span className={cn("font-mono text-sm font-bold tabular-nums", styles.text)}>{alert.score}</span>
          </div>

          {/* Tier ladder with proximity radii */}
          <div className="grid grid-cols-4 gap-2">
            {LADDER.map((rung, i) => (
              <div
                key={rung.level}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-opacity",
                  i === activeIndex ? cn(LEVEL_STYLES[rung.level].chip, "opacity-100") : "border-border opacity-50",
                )}
              >
                <span className={cn("h-2.5 w-full rounded-full", rung.solid)} />
                <span
                  className={cn(
                    "font-mono text-[0.5625rem] font-bold uppercase tracking-wide",
                    i === activeIndex ? LEVEL_STYLES[rung.level].text : "text-muted-foreground/70",
                  )}
                >
                  {rung.label}
                </span>
                <span className="font-mono text-[0.5rem] uppercase tracking-wide text-muted-foreground">
                  {rung.level === "green" ? `${ALERT_RADII_KM.green}km+` : `${ALERT_RADII_KM[rung.level]} km`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Proximity radar */}
        <div className="flex justify-center lg:justify-end">
          <ProximityRings active={alert.level} showFarSite />
        </div>
      </div>

      {/* Approach tracker — on-site vs far-site (50 km upwind) gust + distance legend */}
      <div className="border-t border-border/60 p-5 sm:p-7">
        <span className="flex items-center gap-1.5 label-caps text-muted-foreground">
          <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
          Approach tracker · wind gust on site vs 50 km upwind
        </span>

        <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {/* ON SITE (near) */}
          <div className="rounded-xl border border-signal/40 bg-signal/5 p-4">
            <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-widest text-signal">
              <MapPin className="h-3 w-3" aria-hidden="true" /> On site · near
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-4xl font-black tabular-nums text-foreground">{Math.round(onGust)}</span>
              <span className="text-sm text-muted-foreground">{speedUnit(payload.units)} gust</span>
            </div>
            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              Your location · {compass(payload.current.windDirection)} wind
            </span>
          </div>

          {/* delta */}
          <div className="flex flex-row items-center justify-center gap-2 sm:flex-col">
            <span className={cn("grid h-11 w-11 place-items-center rounded-full border", deltaBorder)}>
              <Wind className={cn("h-5 w-5", deltaTone)} aria-hidden="true" />
            </span>
            <div className="flex flex-col items-center leading-tight">
              <span className={cn("font-mono text-sm font-bold tabular-nums", deltaTone)}>
                {gustDelta == null ? "—" : `${gustDelta > 0 ? "+" : ""}${Math.round(gustDelta)}`}
              </span>
              <span className={cn("font-mono text-[0.5625rem] uppercase tracking-wider", deltaTone)}>{deltaWord}</span>
            </div>
          </div>

          {/* FAR SITE (50 km) */}
          <div className={cn("rounded-xl border p-4", deltaBorder)}>
            <span className={cn("flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-widest", deltaTone)}>
              <Navigation className="h-3 w-3" aria-hidden="true" /> Far site · 50 km away
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-4xl font-black tabular-nums text-foreground">
                {farGust == null ? "—" : Math.round(farGust)}
              </span>
              <span className="text-sm text-muted-foreground">{speedUnit(payload.units)} gust</span>
            </div>
            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              Upwind sample · {compass(payload.current.windDirection)} origin
            </span>
          </div>
        </div>

        <p className="mt-3 text-pretty text-sm text-muted-foreground">
          The AI samples wind, gust, rain and precipitation 50 km upwind and maps how close they are to you.
          When the far-site gust runs stronger than on-site, hazardous wind is intensifying toward your
          location — the tighter the ring a hazard reaches, the higher the alert.
        </p>

        <ul className="mt-3 grid gap-2 sm:grid-cols-4">
          {LADDER.map((rung) => (
            <li
              key={rung.level}
              className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm", LEVEL_STYLES[rung.level].chip)}
            >
              <span className={cn("h-3 w-3 shrink-0 rounded-full", rung.solid)} aria-hidden="true" />
              <span className="font-mono text-xs font-bold uppercase tracking-wide">{rung.label}</span>
              <span className="ml-auto font-mono text-xs tabular-nums opacity-90">
                {rung.level === "green" ? `${ALERT_RADII_KM.green} km +` : `within ${ALERT_RADII_KM[rung.level]} km`}
              </span>
            </li>
          ))}
        </ul>
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
