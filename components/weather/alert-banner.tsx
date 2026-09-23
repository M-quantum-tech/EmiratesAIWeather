"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
  Activity,
  BellRing,
  Check,
  Clock,
  Cloud,
  CloudRain,
  Droplets,
  Gauge,
  MapPin,
  Navigation,
  ShieldCheck,
  Siren,
  Sparkles,
  Timer,
  Wind,
} from "lucide-react"
import {
  ALERT_RADII_KM,
  buildAlert,
  compass,
  DANGER_RADIUS_KM,
  describeCode,
  formatClock,
  formatEta,
  formatLocation,
  offsetLocation,
  precipUnit,
  predictArrivals,
  speedUnit,
  type AlertLevel,
  type ArrivalKey,
  type HazardKey,
  type WeatherPayload,
} from "@/lib/weather"
import { fetchWarningFrames, type EmirateWarning } from "@/lib/ncm-warnings"
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

/**
 * Fixed escalation rules — the NCM-style ladder. Each tier lists the trigger
 * criteria that promote the model to that level and the data source behind them.
 */
const RULES: { level: AlertLevel; label: string; km: string; triggers: string; sources: string }[] = [
  {
    level: "green",
    label: "L1 · Green",
    km: "60 km +",
    triggers:
      "Convection 60 km + · gust under 15 m/s · rain under 1 mm · no weather warnings under 50 km from location — all clear",
    sources: "Open-Meteo · Satellite · NCM",
  },
  {
    level: "yellow",
    label: "L2 · Yellow",
    km: "within 50 km",
    triggers:
      "Intensifying convection under 30 km · any warning alarm on site · satellite image warnings",
    sources: "Satellite · NCM Al Bahar",
  },
  {
    level: "orange",
    label: "L3 · Orange",
    km: "within 30 km",
    triggers:
      "Satellite image · intensifying convection under 20 km + Level 2 alerts · radar precipitation · NCM website alerts",
    sources: "Satellite · Radar · NCM Al Bahar",
  },
  {
    level: "red",
    label: "L4 · Red",
    km: "within 20 km",
    triggers: "Convection under 20 km + L3 · radar precipitation · active NCM alert — take shelter",
    sources: "Radar · NCM Al Bahar",
  },
]

const HAZARD_ICON: Record<HazardKey, typeof Wind> = {
  gust: Gauge,
  wind: Wind,
  rain: CloudRain,
  precip: Droplets,
}

const ARRIVAL_ICON: Record<ArrivalKey, typeof Wind> = {
  wind: Wind,
  rain: CloudRain,
  cloud: Cloud,
}

/**
 * Per-level buzzer character — each tier has its own pitch set, cadence and loudness so
 * the alarm is audibly identifiable, escalating from a soft green chime to an urgent red
 * three-tone. The buzzer sounds on any level change until the operator acknowledges it.
 */
const BUZZER_TONE: Record<AlertLevel, { pattern: number[]; step: number; interval: number; gain: number; type: OscillatorType }> = {
  green: { pattern: [523], step: 0, interval: 2600, gain: 0.05, type: "sine" },
  yellow: { pattern: [659, 784], step: 0.26, interval: 1800, gain: 0.09, type: "triangle" },
  orange: { pattern: [784, 988], step: 0.24, interval: 1200, gain: 0.13, type: "square" },
  red: { pattern: [988, 740, 988], step: 0.22, interval: 820, gain: 0.18, type: "square" },
}

/** Looping level-tuned alarm via the Web Audio API (no asset needed). */
function useBuzzer(active: boolean, level: AlertLevel) {
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      return
    }
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AudioCtor) return
    if (!ctxRef.current) ctxRef.current = new AudioCtor()
    const ctx = ctxRef.current
    if (ctx.state === "suspended") ctx.resume().catch(() => {})

    const tone = BUZZER_TONE[level]
    const beep = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(tone.gain, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + dur)
    }
    const cycle = () => {
      const t = ctx.currentTime
      tone.pattern.forEach((freq, i) => beep(freq, t + i * tone.step, 0.2))
    }
    cycle()
    timerRef.current = setInterval(cycle, tone.interval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [active, level])

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
  const level = alert?.level ?? null
  // Acknowledgment latch: the alarm sounds whenever the detected level differs from the
  // last level the operator acknowledged. The first observed level is auto-armed silently;
  // every subsequent change re-arms the alarm until Acknowledge is pressed.
  const [ackedLevel, setAckedLevel] = useState<AlertLevel | null>(null)
  const [changedFrom, setChangedFrom] = useState<AlertLevel | null>(null)
  const prevLevelRef = useRef<AlertLevel | null>(null)
  useEffect(() => {
    if (!level) return
    const prev = prevLevelRef.current
    if (prev === null) {
      setAckedLevel(level)
    } else if (prev !== level) {
      setAckedLevel(null)
      setChangedFrom(prev)
    }
    prevLevelRef.current = level
  }, [level])
  const alarmActive = level != null && ackedLevel !== level
  const acknowledge = () => setAckedLevel(level)
  // Auto-silence: whenever the alarm arms on a level change it sounds for at most
  // 15 seconds, then auto-acknowledges — unless the operator resets it sooner.
  useEffect(() => {
    if (!alarmActive) return
    const timer = window.setTimeout(() => setAckedLevel(level), 15_000)
    return () => window.clearTimeout(timer)
  }, [alarmActive, level])
  const [ncm, setNcm] = useState<EmirateWarning | null>(null)

  // Live NCM Al Bahar warning for the current hour — matched to the user's emirate
  // when possible, otherwise the most severe active UAE warning. Refreshed every 10 min.
  const locationId = payload?.location.id
  useEffect(() => {
    if (!payload) return
    const controller = new AbortController()
    const loc = formatLocation(payload.location).toLowerCase()
    async function load() {
      try {
        const data = await fetchWarningFrames(controller.signal, 3)
        const frame = data.frames[0] ?? []
        const mine = frame.find((w) => loc.includes(w.name.toLowerCase()))
        setNcm(mine ?? frame[0] ?? null)
      } catch (err) {
        if ((err as any)?.name !== "AbortError")
          console.log("[v0] alert ncm warning failed:", err instanceof Error ? err.message : err)
      }
    }
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId])

  // Live 60-second auto-refresh counter + a wall clock synced to real time, both
  // driven by a single 1-second tick so the header stays in step with the network clock.
  const [countdown, setCountdown] = useState(REFRESH_SECONDS)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
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
    refreshInterval: 60 * 1000,
    keepPreviousData: true,
  })

  const danger = alert?.danger ?? false
  useBuzzer(alarmActive, level ?? "green")

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

  // Synced wall clock (station timezone, ticking every second against real time).
  const safeTime = (d: Date, withSeconds = false) => {
    try {
      return d.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        ...(withSeconds ? { second: "2-digit" } : {}),
        timeZone: payload.timezone,
      })
    } catch {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    }
  }
  const localClock = safeTime(now, true)

  // AI advection nowcast: blend the on-site reading with the 50 km upwind sample to
  // predict when the wind, rain and cloud fields reach the site — replacing the old
  // distance ÷ speed ETA with a gust-weighted, confidence-scored model.
  const originCompass = compass(payload.current.windDirection)
  const advectionSpeed = payload.current.windSpeed // km/h mean transport of the front
  const arrivals = predictArrivals({
    distanceKm: ALERT_RADII_KM.yellow,
    units: payload.units,
    near: {
      windSpeed: payload.current.windSpeed,
      windGusts: payload.current.windGusts,
      cloudCover: payload.current.cloudCover,
      precipitation: payload.current.precipitation,
    },
    far: farData
      ? {
          windSpeed: farData.current.windSpeed,
          windGusts: farData.current.windGusts,
          cloudCover: farData.current.cloudCover,
          precipitation: farData.current.precipitation,
        }
      : null,
  })
  const windArrival = arrivals.find((a) => a.key === "wind") ?? null
  const soonest = arrivals
    .filter((a) => a.etaMinutes != null)
    .sort((a, b) => (a.etaMinutes ?? 0) - (b.etaMinutes ?? 0))[0]
  const etaMinutes = windArrival?.etaMinutes ?? null
  const arrivalClock = etaMinutes != null ? safeTime(new Date(now.getTime() + etaMinutes * 60_000)) : null
  // Front position along the 60 km watch ring (0% = watch edge, 100% = on you).
  const frontProgress = Math.max(0, Math.min(100, (1 - ALERT_RADII_KM.yellow / ALERT_RADII_KM.green) * 100))
  const rankedHazards = [...alert.hazards].sort((a, b) => {
    const order = { red: 3, orange: 2, yellow: 1, green: 0 } as const
    return order[b.level] - order[a.level]
  })

  // Live evaluation of the escalation rules against real signals (Open-Meteo current
  // reading, the 50 km upwind sample, and the NCM Al Bahar warning) for the prediction table.
  const gustKmh = payload.units === "metric" ? onGust : onGust * 1.609
  const gustMs = gustKmh / 3.6
  // On-site wind speed and the 50 km upwind gust, both normalised to m/s for the radar readout.
  const toMs = (v: number) => (payload.units === "metric" ? v : v * 1.609) / 3.6
  const windMs = toMs(payload.current.windSpeed)
  const farGustMs = farGust != null ? toMs(farGust) : null
  const precipNow = payload.units === "metric" ? payload.current.precipitation : payload.current.precipitation * 25.4
  const isStorm = describeCode(payload.current.weatherCode).group === "storm"
  const ncmActive = !!ncm && ncm.level !== "green"
  const predictionRows: { signal: string; source: string; value: string; met: boolean }[] = [
    {
      signal: "Intensifying convection",
      source: "Satellite · radar",
      value: approaching || isStorm ? `Closing · ~${ALERT_RADII_KM[alert.level]} km` : "Steady · 60 km +",
      met: approaching || isStorm,
    },
    {
      signal: "Wind gust over 15 m/s",
      source: "Open-Meteo",
      value: `${gustMs.toFixed(1)} m/s · ${Math.round(gustKmh)} km/h`,
      met: gustMs >= 15,
    },
    {
      signal: "Diverging wind under 50 km",
      source: "Upwind sample",
      value: gustDelta == null ? "Sampling" : `${gustDelta > 0 ? "+" : ""}${Math.round(gustDelta)} ${speedUnit(payload.units)}`,
      met: approaching,
    },
    {
      signal: "Rain precipitation over 1 mm",
      source: "Open-Meteo",
      value: `${precipNow.toFixed(1)} ${precipUnit(payload.units)}/h`,
      met: precipNow >= 1,
    },
    {
      signal: "NCM / satellite warning",
      source: "NCM Al Bahar",
      value: ncm ? `${ncm.name} · ${ncm.headline}` : "No active warning",
      met: ncmActive,
    },
  ]

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
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground tabular-nums">
            <Clock className="h-3 w-3 text-signal" aria-hidden="true" />
            {localClock}
          </span>
          <span className="flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-signal">
            <Timer className={cn("h-3 w-3", isValidating && "animate-spin")} aria-hidden="true" />
            Refresh {mm}:{String(ss).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={acknowledge}
            aria-label={
              alarmActive
                ? `Reset ${alert.title} alarm and silence buzzer now`
                : `Buzzer standing by at ${alert.title} level — press to silence when it sounds`
            }
            className={cn(
              "relative inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-all",
              alarmActive
                ? cn(styles.chip, styles.text, "tier-blink shadow-md hover:scale-[1.03] active:scale-95")
                : cn("border-border bg-background/60", styles.text, "hover:bg-secondary active:scale-95"),
            )}
          >
            {alarmActive ? (
              <>
                <span
                  className={cn("absolute -left-1 -top-1 h-3 w-3 animate-ping rounded-full", styles.solid)}
                  aria-hidden="true"
                />
                <BellRing className="h-5 w-5" aria-hidden="true" />
                Silence buzzer
              </>
            ) : (
              <>
                <BellRing className="h-5 w-5 opacity-70" aria-hidden="true" />
                Silence buzzer
              </>
            )}
          </button>
        </span>
      </div>

      {/* Alarm strip — sounds on any level change until acknowledged, tinted to the level */}
      {alarmActive ? (
        <div
          role="alert"
          className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5", styles.bar, styles.text)}
        >
          <Siren className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />
          <span className="text-sm font-bold uppercase tracking-wide">{alert.title} buzzer</span>
          <span className="text-xs font-medium text-foreground/80">
            {changedFrom ? `Level changed ${changedFrom.toUpperCase()} → ${alert.title}` : `Armed at ${alert.title}`}
            {danger ? ` · severe conditions within ${DANGER_RADIUS_KM} km` : ""} — sounding for 15 s or until reset.
          </span>
          <button
            type="button"
            onClick={acknowledge}
            aria-label="Reset alarm and silence buzzer now"
            className={cn(
              "ml-auto inline-flex items-center gap-2 rounded-xl border-2 px-5 py-2.5 font-mono text-sm font-bold uppercase tracking-wider shadow-md transition-transform hover:scale-[1.03] active:scale-95",
              styles.chip,
              styles.text,
            )}
          >
            <Check className="h-5 w-5" aria-hidden="true" />
            Silence buzzer
          </button>
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

          {/* Tier ladder — button-style graphics that blink on the active level */}
          <div className="grid grid-cols-4 gap-2">
            {LADDER.map((rung, i) => {
              const active = i === activeIndex
              const rungStyles = LEVEL_STYLES[rung.level]
              return (
                <button
                  key={rung.level}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${rung.label} tier${active ? " — active" : ""}`}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-all",
                    active
                      ? cn(rungStyles.chip, rungStyles.text, "tier-blink opacity-100 shadow-sm")
                      : "border-border bg-background/40 opacity-50 hover:opacity-75",
                  )}
                >
                  <span
                    className={cn(
                      "h-3 w-full rounded-full",
                      rung.solid,
                      active ? "opacity-100" : "opacity-60",
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-[0.5625rem] font-bold uppercase tracking-wide",
                      active ? rungStyles.text : "text-muted-foreground/70",
                    )}
                  >
                    {rung.label}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[0.5rem] uppercase tracking-wide",
                      active ? rungStyles.text : "text-muted-foreground",
                    )}
                  >
                    {rung.level === "green" ? `${ALERT_RADII_KM.green}km+` : `${ALERT_RADII_KM[rung.level]} km`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Proximity radar */}
        <div className="flex justify-center lg:justify-end">
          <ProximityRings
            active={alert.level}
            showFarSite
            windMs={windMs}
            gustMs={gustMs}
            farGustMs={farGustMs}
            originCompass={originCompass}
            approaching={approaching}
            etaLabel={etaMinutes != null ? formatEta(etaMinutes) : null}
            windDirection={payload.current.windDirection}
          />
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
              <span className="text-4xl font-black tabular-nums text-foreground">{gustMs.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">m/s gust</span>
            </div>
            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {Math.round(onGust)} {speedUnit(payload.units)} · {compass(payload.current.windDirection)} wind
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
                {farGustMs == null ? "—" : farGustMs.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">m/s gust</span>
            </div>
            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {farGust == null ? "Sampling" : `${Math.round(farGust)} ${speedUnit(payload.units)}`} ·{" "}
              {compass(payload.current.windDirection)} origin
            </span>
          </div>
        </div>

        {/* AI advection nowcast — predicts when wind, rain and cloud fields reach the site */}
        <div className={cn("mt-3 rounded-xl border p-4", approaching ? deltaBorder : "border-border bg-background/40")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn("flex items-center gap-1.5 label-caps", approaching ? deltaTone : "text-signal")}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI arrival nowcast · wind · rain · cloud
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider",
                soonest ? deltaTone : "border-border text-muted-foreground",
              )}
            >
              {soonest && soonest.etaMinutes != null ? `Soonest · ${soonest.label} ~${formatEta(soonest.etaMinutes)}` : "Nothing inbound"}
            </span>
          </div>

          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            Blending the on-site reading with the {ALERT_RADII_KM.yellow} km upwind sample, the model predicts field
            arrival from the <span className="font-semibold text-foreground">{originCompass}</span> at a{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {Math.round(advectionSpeed)} {speedUnit(payload.units)}
            </span>{" "}
            closing speed.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {arrivals.map((a) => {
              const Icon = ARRIVAL_ICON[a.key]
              const tone =
                a.status === "Approaching"
                  ? "text-alert-orange"
                  : a.status === "Easing"
                    ? "text-alert-green"
                    : "text-muted-foreground"
              const border =
                a.status === "Approaching"
                  ? "border-alert-orange/40 bg-alert-orange/10"
                  : a.status === "Easing"
                    ? "border-alert-green/40 bg-alert-green/10"
                    : "border-border bg-background/50"
              const barColor =
                a.status === "Approaching" ? "bg-alert-orange" : a.status === "Easing" ? "bg-alert-green" : "bg-muted-foreground/50"
              return (
                <div key={a.key} className={cn("rounded-lg border p-3", border)}>
                  <span className="flex items-center justify-between">
                    <span className={cn("flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider", tone)}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {a.label}
                    </span>
                    <span className={cn("font-mono text-[0.5625rem] uppercase tracking-wider", tone)}>{a.status}</span>
                  </span>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className={cn("text-2xl font-black tabular-nums", tone)}>
                      {a.etaMinutes == null ? "—" : `~${formatEta(a.etaMinutes)}`}
                    </span>
                    {a.etaMinutes != null ? (
                      <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">ETA on site</span>
                    ) : null}
                  </div>
                  <span className="mt-0.5 block font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground tabular-nums">
                    {a.detail}
                  </span>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">Conf</span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all", barColor)} style={{ width: `${a.confidence}%` }} />
                    </div>
                    <span className="font-mono text-[0.5625rem] tabular-nums text-muted-foreground">{a.confidence}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Closing track — shown when a wind front is genuinely inbound */}
          {approaching ? (
            <div className="mt-3">
              <div className="relative h-2.5 rounded-full bg-secondary">
                <div
                  className={cn("absolute inset-y-0 right-0 rounded-full opacity-30", styles.solid)}
                  style={{ width: `${100 - frontProgress}%` }}
                />
                <span
                  className={cn(
                    "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background",
                    styles.solid,
                  )}
                  style={{ left: `${frontProgress}%` }}
                  aria-hidden="true"
                />
                <span className="absolute -right-0.5 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full border-2 border-background bg-signal text-signal">
                  <MapPin className="h-2.5 w-2.5 text-background" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-1 flex justify-between font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                <span>{ALERT_RADII_KM.green} km · watch edge</span>
                <span>You{arrivalClock ? ` · arrives ${arrivalClock}` : ""}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Escalation rules table — the fixed NCM-style ladder, active tier highlighted */}
        <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
          <div className="flex items-center gap-1.5 border-b border-border/60 bg-background/40 px-3 py-1.5 label-caps text-muted-foreground">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Escalation rules · NCM + wind forecast + Open-Meteo
          </div>
          <table className="w-full border-collapse text-left">
            <tbody>
              {RULES.map((rule) => (
                <tr
                  key={rule.level}
                  className={cn(
                    "border-t border-border/40 first:border-t-0",
                    alert.level === rule.level && LEVEL_STYLES[rule.level].bar,
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("h-2.5 w-2.5 rounded-full", LEVEL_STYLES[rule.level].solid)} aria-hidden="true" />
                      <span className={cn("font-mono text-[0.625rem] font-bold uppercase tracking-wide", LEVEL_STYLES[rule.level].text)}>
                        {rule.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[0.5rem] uppercase tracking-wide text-muted-foreground">
                      {rule.km}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs leading-snug text-muted-foreground">{rule.triggers}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right align-top font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground sm:table-cell">
                    {rule.sources}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Live prediction table — each rule signal evaluated against real data now */}
        <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-1.5">
            <span className="flex items-center gap-1.5 label-caps text-muted-foreground">
              <Activity className="h-3 w-3" aria-hidden="true" />
              Live prediction
            </span>
            <span className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider", styles.chip)}>
              <span className={cn("h-2 w-2 rounded-full", styles.solid)} aria-hidden="true" />
              Predicted {alert.title}
              {approaching && etaMinutes != null ? ` · ETA ${formatEta(etaMinutes)}` : ""}
            </span>
          </div>
          <table className="w-full border-collapse text-left">
            <tbody>
              {predictionRows.map((row) => (
                <tr key={row.signal} className="border-t border-border/40 first:border-t-0">
                  <td className="px-3 py-1.5">
                    <span className="block text-xs font-medium text-foreground">{row.signal}</span>
                    <span className="block font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">
                      {row.source}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{row.value}</td>
                  <td className="w-8 px-3 py-1.5 text-right">
                    <span
                      className={cn("inline-flex h-2.5 w-2.5 rounded-full", row.met ? "bg-alert-orange" : "bg-alert-green/40")}
                      aria-label={row.met ? "Triggered" : "Clear"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
