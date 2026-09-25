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
  ExternalLink,
  Gauge,
  MapPin,
  Navigation,
  Radar,
  Radio,
  ShieldCheck,
  Siren,
  SunDim,
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
  rainAttenuation,
  speedUnit,
  withAlertLevel,
  type AlertLevel,
  type ArrivalKey,
  type HazardKey,
  type WeatherPayload,
} from "@/lib/weather"
import { fetchWarningFrames, type EmirateWarning } from "@/lib/ncm-warnings"
import {
  applyLevelHysteresis,
  BUZZER_TONE,
  DEFAULT_CLOUD_SOURCE,
  DEFAULT_RULES,
  DEFAULT_WIND_MONITOR,
  DEFAULT_WIND_SOURCE,
  evaluateSite,
  type CloudSourceConfig,
  type EscalationRule,
  type SiteKey,
  type SiteReadings,
  type WindMonitorTier,
  type WindSourceConfig,
} from "@/lib/escalation"
import { ProximityRings } from "@/components/weather/proximity-rings"
import { WindDirectionRadar } from "@/components/weather/wind-direction-radar"
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

/** The two detection sites shown under every tier button, wired to each rule's ranges. */
const SITE_ROWS: { key: SiteKey; name: string }[] = [
  { key: "atSite", name: "At site" },
  { key: "farSite", name: "Near site" },
]

const HAZARD_ICON: Record<HazardKey, typeof Wind> = {
  gust: Gauge,
  wind: Wind,
  rain: CloudRain,
  precip: Droplets,
}

/** Neutral → escalating tones for the live parameter cells. */
type ParamTone = "neutral" | "info" | "warn" | "bad"
const PARAM_TONE: Record<ParamTone, string> = {
  neutral: "border-border/70 bg-background/40 text-foreground",
  info: "border-signal/40 bg-signal/5 text-signal",
  warn: "border-alert-yellow/40 bg-alert-yellow/10 text-alert-yellow",
  bad: "border-alert-orange/40 bg-alert-orange/10 text-alert-orange",
}

type ParamCell = {
  label: string
  value: string
  unit?: string
  icon: typeof Wind
  tone: ParamTone
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
      // A shared master gain lets a tier layer several oscillators (fundamental,
      // detuned twin, sub-octave) into one bigger, klaxon-like note.
      const master = ctx.createGain()
      master.gain.setValueAtTime(0.0001, at)
      master.gain.exponentialRampToValueAtTime(tone.gain, at + 0.02)
      master.gain.setValueAtTime(tone.gain, at + dur * 0.7)
      master.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      master.connect(ctx.destination)

      const voice = (f: number, detune: number, level: number) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = tone.type
        osc.frequency.value = f
        if (detune) osc.detune.value = detune
        g.gain.value = level
        osc.connect(g).connect(master)
        osc.start(at)
        osc.stop(at + dur)
      }
      voice(freq, 0, 1)
      if (tone.detune) voice(freq, tone.detune, 0.9)
      if (tone.sub) voice(freq / 2, 0, 0.7)
    }
    const cycle = () => {
      const t = ctx.currentTime
      const hold = tone.hold ?? 0.2
      tone.pattern.forEach((freq, i) => beep(freq, t + i * tone.step, hold))
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
  // Escalation ladder — persisted overrides from the Engineering Console, defaults otherwise.
  const { data: rulesData } = useSWR<{ rules: EscalationRule[] }>("/api/escalation", farFetcher as never, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
  const rules = rulesData?.rules ?? DEFAULT_RULES
  // Wind Event Monitor thresholds — persisted overrides from the Engineering Console.
  const { data: windMonitorData } = useSWR<{ tiers: WindMonitorTier[] }>(
    "/api/wind-monitor",
    farFetcher as never,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )
  const windTiers = windMonitorData?.tiers ?? DEFAULT_WIND_MONITOR
  // Wind speed & gust source link — NCM COSMO-UAE by default, editable in the Engineering Console.
  const { data: windSourceData } = useSWR<{ source: WindSourceConfig }>(
    "/api/wind-source",
    farFetcher as never,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )
  const windSource = windSourceData?.source ?? DEFAULT_WIND_SOURCE
  // NCM cloud / satellite source — tracks intensifying convection, editable in the Engineering Console.
  const { data: cloudSourceData } = useSWR<{ source: CloudSourceConfig }>(
    "/api/cloud-source",
    farFetcher as never,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )
  const cloudSource = cloudSourceData?.source ?? DEFAULT_CLOUD_SOURCE
  const rawAlert = useMemo(() => (payload ? buildAlert(payload) : null), [payload])
  // Dead-band hysteresis: the displayed tier escalates immediately but only de-escalates
  // once every driving metric has fallen below the held tier's entry threshold minus its
  // configured dead band — so noisy readings can't flap the alarm between tiers.
  const [heldLevel, setHeldLevel] = useState<AlertLevel | null>(null)
  const heldRef = useRef<AlertLevel | null>(null)
  useEffect(() => {
    if (!rawAlert) return
    const raw = Object.fromEntries(rawAlert.hazards.map((h) => [h.key, h.raw])) as Record<string, number>
    const readings = {
      windMs: (raw.wind ?? 0) / 3.6,
      gustMs: (raw.gust ?? 0) / 3.6,
      rainMm: raw.rain ?? 0,
    }
    const next = applyLevelHysteresis(rawAlert.level, heldRef.current, readings, rules)
    if (next !== heldRef.current) {
      heldRef.current = next
      setHeldLevel(next)
    }
  }, [rawAlert, rules])
  const alert = useMemo(
    () => (rawAlert ? withAlertLevel(rawAlert, heldLevel ?? rawAlert.level) : null),
    [rawAlert, heldLevel],
  )
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
  const etaMinutes = windArrival?.etaMinutes ?? null
  // Live parameter grid — atmospheric channels plus derived radar/optical values.
  const paramCells: ParamCell[] = (() => {
    const cur = payload.current
    const hourNow = payload.hourly[payload.currentHourIndex] ?? payload.hourly[0]
    // Rain / precipitation rate normalised to mm/h for the physics helpers.
    const rainMmH = payload.units === "metric" ? cur.precipitation : cur.precipitation * 25.4
    const precipProb = hourNow?.precipitationProbability ?? 0
    // ITU-R P.838 rain attenuation (dB/km) through the current cell.
    const atten = rainAttenuation(rainMmH)
    // Kasten–Czeplak atmospheric transmittance (clearness index) from cloud cover.
    const transmittance = Math.round((1 - 0.75 * Math.pow(cur.cloudCover / 100, 3.4)) * 100)
    // Marshall–Palmer radar reflectivity: Z = 200·R^1.6, in dBZ.
    const reflectivity = rainMmH > 0 ? 10 * Math.log10(200 * Math.pow(rainMmH, 1.6)) : 0

    return [
      { label: "Rain", value: rainMmH.toFixed(1), unit: precipUnit(payload.units) + "/h", icon: CloudRain, tone: rainMmH > 0.2 ? "warn" : "neutral" },
      { label: "Clouds", value: `${Math.round(cur.cloudCover)}`, unit: "%", icon: Cloud, tone: cur.cloudCover > 70 ? "info" : "neutral" },
      { label: "Precipitation", value: `${Math.round(precipProb)}`, unit: "% prob", icon: Droplets, tone: precipProb > 50 ? "warn" : "neutral" },
      { label: "Wind speed", value: `${Math.round(cur.windSpeed)}`, unit: speedUnit(payload.units), icon: Wind, tone: cur.windSpeed > 40 ? "bad" : cur.windSpeed > 20 ? "warn" : "neutral" },
      { label: "Attenuation", value: atten.toFixed(2), unit: "dB/km", icon: Radio, tone: atten >= 1 ? "bad" : atten >= 0.1 ? "warn" : "neutral" },
      { label: "Transmittance", value: `${Math.max(0, transmittance)}`, unit: "%", icon: SunDim, tone: transmittance < 40 ? "warn" : "info" },
      { label: "Reflectivity", value: reflectivity > 0 ? reflectivity.toFixed(0) : "—", unit: reflectivity > 0 ? "dBZ" : undefined, icon: Radar, tone: reflectivity >= 40 ? "bad" : reflectivity >= 20 ? "warn" : "neutral" },
      { label: "Relative humidity", value: `${Math.round(cur.humidity)}`, unit: "%", icon: Droplets, tone: cur.humidity > 80 ? "info" : "neutral" },
    ]
  })()

  // Live evaluation of the escalation rules against real signals (Open-Meteo current
  // reading, the 50 km upwind sample, and the NCM Al Bahar warning) for the prediction table.
  const gustKmh = payload.units === "metric" ? onGust : onGust * 1.609
  const gustMs = gustKmh / 3.6
  // On-site wind speed and the 50 km upwind gust, both normalised to m/s for the radar readout.
  const toMs = (v: number) => (payload.units === "metric" ? v : v * 1.609) / 3.6
  const windMs = toMs(payload.current.windSpeed)
  const farGustMs = farGust != null ? toMs(farGust) : null
  // Live per-site readings (native SI units) fed into each tier's configured ranges. The
  // on-site station drives "At site"; the 50 km upwind sample drives "Near site". These are
  // what the escalation-rule ranges are evaluated against so the ladder indicators stay wired
  // to whatever thresholds are set in the Engineering Console.
  const toMm = (v: number) => (payload.units === "metric" ? v : v * 25.4)
  const siteReadings: Record<SiteKey, SiteReadings> = {
    atSite: {
      windMs,
      gustMs,
      rainMm: toMm(payload.current.precipitation),
      cloudPct: payload.current.cloudCover,
    },
    farSite: {
      windMs: farData ? toMs(farData.current.windSpeed) : 0,
      gustMs: farGustMs ?? 0,
      rainMm: farData ? toMm(farData.current.precipitation) : 0,
      cloudPct: farData?.current.cloudCover ?? 0,
    },
  }
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

          {/* Tier ladder — each button is wired to its escalation-rule ranges and carries
              At-site / Near-site indicators that blink red when live readings meet the tier. */}
          <div className="grid grid-cols-4 gap-2">
            {LADDER.map((rung, i) => {
              const active = i === activeIndex
              const rungStyles = LEVEL_STYLES[rung.level]
              const rule = rules.find((r) => r.level === rung.level)
              return (
                <div
                  key={rung.level}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${rung.label} tier${active ? " — active" : ""}`}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-all",
                    active
                      ? cn(rungStyles.chip, rungStyles.text, "tier-blink opacity-100 shadow-sm")
                      : "border-border bg-background/40 opacity-70 hover:opacity-90",
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

                  {/* At-site / Near-site detection — green when clear, red-blink when met */}
                  <div className="mt-1 w-full space-y-1 border-t border-border/50 pt-1.5">
                    {SITE_ROWS.map(({ key, name }) => {
                      const cfg = rule?.[key]
                      const ev = cfg
                        ? evaluateSite(cfg, siteReadings[key])
                        : { met: false, reason: null }
                      const src = cfg?.source
                      const label = key === "atSite" ? "AWS" : "COSMO"
                      const common = cn(
                        "flex w-full items-center gap-1 rounded px-1 py-0.5 transition-colors",
                        ev.met ? "bg-alert-red/15" : "hover:bg-background/60",
                      )
                      const inner = (
                        <>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              ev.met ? "bg-alert-red tier-blink" : "bg-alert-green",
                            )}
                            aria-hidden="true"
                          />
                          <span
                            className={cn(
                              "truncate font-mono text-[0.4375rem] uppercase tracking-wide",
                              ev.met ? "font-bold text-alert-red" : "text-muted-foreground",
                            )}
                          >
                            {name}
                          </span>
                          {src?.url ? (
                            <ExternalLink
                              className="ml-auto h-2 w-2 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          ) : null}
                        </>
                      )
                      const title = ev.met
                        ? `${name} · ${rung.label}: ${ev.reason}`
                        : `${name} · ${rung.label}: within limits${src?.label ? ` · ${src.label}` : ""}`
                      return src?.url ? (
                        <a
                          key={key}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={title}
                          aria-label={title}
                          className={common}
                        >
                          {inner}
                        </a>
                      ) : (
                        <div key={key} title={title} aria-label={title} className={common}>
                          {inner}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Proximity radar + wind-direction radar, side by side */}
        <div className="flex flex-col items-center justify-center gap-8 lg:justify-end xl:flex-row xl:items-start">
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
<WindDirectionRadar
  windMs={windMs}
  gustMs={gustMs}
  windDirection={payload.current.windDirection}
  lat={payload.location.latitude}
  lon={payload.location.longitude}
  sourceUrl={windSource.url}
  sourceLabel={windSource.label}
  />
        </div>
      </div>

      {/* Approach tracker — on-site vs far-site (50 km upwind) gust + distance legend */}
      <div className="border-t border-border/60 p-5 sm:p-7">
        {/* Live Wind Event Monitor — active tier driven by on-site sustained wind */}
        <WindEventMonitor windMs={windMs} tiers={windTiers} />

        <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {/* ON SITE (near) */}
          <div className="rounded-xl border border-signal/40 bg-signal/5 p-4">
            <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-widest text-signal">
              <MapPin className="h-3 w-3" aria-hidden="true" /> On site · near
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-4xl font-black tabular-nums text-foreground">{Math.round(gustKmh)}</span>
              <span className="text-sm text-muted-foreground">km/h gust</span>
            </div>
            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {(gustKmh / MS_TO_KMH).toFixed(1)} m/s · {compass(payload.current.windDirection)} wind
            </span>
            <WindSourceLink source={windSource} />
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
                {farGustMs == null ? "—" : Math.round(farGustMs * 3.6)}
              </span>
              <span className="text-sm text-muted-foreground">km/h gust</span>
            </div>
            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {farGustMs == null ? "Sampling · " : `${farGustMs.toFixed(1)} m/s · `}
              {compass(payload.current.windDirection)} origin
            </span>
            <WindSourceLink source={windSource} />
          </div>
        </div>

        {/* Escalation rules table — the fixed NCM-style ladder, active tier highlighted */}
        <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-1.5 label-caps text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Escalation rules · NCM + wind forecast + Open-Meteo
            </span>
            {cloudSource.url ? (
              <a
                href={cloudSource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
              >
                <Cloud className="h-2.5 w-2.5" aria-hidden="true" />
                {cloudSource.label}
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <table className="w-full border-collapse text-left">
            <tbody>
              {rules.map((rule) => (
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
                  <td className="px-3 py-2 text-xs leading-snug text-muted-foreground">
                    {rule.triggers}
                    <span className="mt-1 flex flex-wrap gap-1">
                      <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">
                        <Wind className="h-2.5 w-2.5" aria-hidden="true" />
                        ±{rule.deadbands.windMs} m/s
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">
                        <Gauge className="h-2.5 w-2.5" aria-hidden="true" />
                        gust ±{rule.deadbands.gustMs} m/s
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">
                        <Navigation className="h-2.5 w-2.5" aria-hidden="true" />
                        dir ±{rule.deadbands.directionDeg}°
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">
                        <CloudRain className="h-2.5 w-2.5" aria-hidden="true" />
                        rain ±{rule.deadbands.rainMm} mm
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-right align-top sm:table-cell">
                    <span className="flex flex-wrap justify-end gap-1">
                      {rule.sourceLinks.length > 0
                        ? rule.sourceLinks.map((src, i) =>
                            src.url ? (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
                              >
                                {src.label}
                                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                              </a>
                            ) : (
                              <span
                                key={i}
                                className="inline-flex items-center rounded border border-border/60 bg-background/40 px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground"
                              >
                                {src.label}
                              </span>
                            ),
                          )
                        : <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">{rule.sources}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live parameter grid feeding the model — atmospheric + radar/optical channels */}
      <div className="border-t border-border/60 px-4 pb-4 pt-3">
        <span className="flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3" aria-hidden="true" />
          Live parameters · {DANGER_RADIUS_KM} km scan
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {paramCells.map((p) => {
            const Icon = p.icon
            return (
              <div
                key={p.label}
                className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", PARAM_TONE[p.tone])}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[0.5625rem] uppercase tracking-wider opacity-80">
                    {p.label}
                  </span>
                  <span className="block text-sm font-bold tabular-nums">
                    {p.value}
                    {p.unit ? <span className="ml-0.5 text-[0.625rem] font-medium opacity-70">{p.unit}</span> : null}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const WIND_TIER_STYLES: Record<
  WindMonitorTier["level"],
  { chip: string; dot: string; text: string; bar: string; track: string }
> = {
  green: {
    chip: "border-alert-green/40 bg-alert-green/10 text-alert-green",
    dot: "bg-alert-green",
    text: "text-alert-green",
    bar: "bg-alert-green",
    track: "bg-alert-green/20",
  },
  yellow: {
    chip: "border-alert-yellow/40 bg-alert-yellow/10 text-alert-yellow",
    dot: "bg-alert-yellow",
    text: "text-alert-yellow",
    bar: "bg-alert-yellow",
    track: "bg-alert-yellow/20",
  },
  orange: {
    chip: "border-alert-orange/40 bg-alert-orange/10 text-alert-orange",
    dot: "bg-alert-orange",
    text: "text-alert-orange",
    bar: "bg-alert-orange",
    track: "bg-alert-orange/20",
  },
  red: {
    chip: "border-alert-red/40 bg-alert-red/10 text-alert-red",
    dot: "bg-alert-red",
    text: "text-alert-red",
    bar: "bg-alert-red",
    track: "bg-alert-red/20",
  },
}

/** m/s → km/h. Wind thresholds are stored in m/s; the UI shows both units. */
const MS_TO_KMH = 3.6
const fmtMs = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const fmtKmh = (v: number) => Math.round(v * MS_TO_KMH)
/** Capitalise an alert level key for display, e.g. "red" → "Red". */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Fixed 4-level station status lamps — always shown, highest active level blinks. */
const STATION_LEVELS: { level: keyof typeof WIND_TIER_STYLES; label: string; sub: string }[] = [
  { level: "green", label: "Green", sub: "Normal" },
  { level: "yellow", label: "Yellow", sub: "Watch" },
  { level: "orange", label: "Orange", sub: "Alert" },
  { level: "red", label: "Red", sub: "Severe" },
]

/** Small "connected source" chip that links wind speed & gust readouts to the configured NCM feed. */
function WindSourceLink({ source }: { source: WindSourceConfig }) {
  if (!source.url) return null
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
    >
      {source.label}
      <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
    </a>
  )
}

function WindEventMonitor({ windMs, tiers }: { windMs: number; tiers: WindMonitorTier[] }) {
  // Tiers are evaluated high→low; the highest threshold the live wind meets is active.
  const sorted = useMemo(
    () => [...tiers].sort((a, b) => b.minSpeed - a.minSpeed),
    [tiers],
  )
  const active = useMemo(
    () => sorted.find((t) => windMs >= t.minSpeed) ?? null,
    [sorted, windMs],
  )
  // Scale gauge to the highest configured threshold, with headroom.
  const ceiling = useMemo(() => {
    const max = sorted.length > 0 ? sorted[0].minSpeed : 16
    return Math.max(max * 1.15, windMs * 1.05, 1)
  }, [sorted, windMs])
  const fillPct = Math.min(100, Math.round((windMs / ceiling) * 100))
  const activeStyle = active ? WIND_TIER_STYLES[active.level] : null
  const currentLevel: keyof typeof WIND_TIER_STYLES = active?.level ?? "green"

  // Each tier owns the band from its own threshold up to the next-higher one, so the
  // dashboard shows an individual range (min→max) per box in both m/s and km/h.
  const boxes = sorted.map((t, i) => {
    const upper = i > 0 ? sorted[i - 1].minSpeed : null
    return { tier: t, lower: t.minSpeed, upper }
  })

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-background/60 to-card px-3 py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/10 text-accent">
            <Wind className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-foreground">Wind Event Monitor</span>
            <span className="label-caps text-muted-foreground">Live sustained wind · escalation ladder</span>
          </span>
        </span>
        {active ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider",
              activeStyle!.chip,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full tier-blink", activeStyle!.dot, activeStyle!.text)} aria-hidden="true" />
            {active.note}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-alert-green/40 bg-alert-green/10 px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider text-alert-green">
            <span className="h-1.5 w-1.5 rounded-full bg-alert-green" aria-hidden="true" />
            Below thresholds
          </span>
        )}
      </div>

      {/* Weather-station status lamps — green / yellow / orange / red; the live level blinks */}
      <div className="border-b border-border/60">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
          {STATION_LEVELS.map(({ level, label, sub }) => {
            const s = WIND_TIER_STYLES[level]
            const on = currentLevel === level
            return (
              <div
                key={level}
                className={cn("flex items-center gap-2.5 bg-card px-3 py-2.5 transition-colors", on ? s.chip : "")}
                aria-current={on ? "true" : undefined}
              >
                <span
                  className={cn(
                    "h-4 w-4 shrink-0 rounded-full border",
                    s.dot,
                    s.text,
                    on ? "tier-blink border-transparent" : "border-border/50 opacity-25",
                  )}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span
                    className={cn(
                      "font-mono text-[0.6875rem] font-bold uppercase tracking-wider",
                      on ? s.text : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                  <span className="font-mono text-[0.5625rem] uppercase tracking-wide text-muted-foreground">{sub}</span>
                </div>
                {on ? (
                  <span className={cn("ml-auto font-mono text-[0.5rem] font-bold uppercase tracking-wider", s.text)}>
                    Live
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Live on-site reading strip — dual-unit with tier-marker gauge */}
      <div
        className={cn(
          "flex flex-col gap-3 border-b border-border/60 bg-card p-4",
          activeStyle ? activeStyle.chip.replace(/text-\S+/, "") : "",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="label-caps text-muted-foreground">On-site sustained wind</span>
          {active ? (
            <span className={cn("font-mono text-[0.5625rem] font-bold uppercase tracking-wider", activeStyle!.text)}>
              {active.label}
            </span>
          ) : null}
        </div>
        <div className="flex items-end gap-3">
          <span className={cn("text-4xl font-bold tabular-nums leading-none", activeStyle?.text ?? "text-foreground")}>
            {Math.round(windMs * MS_TO_KMH)}
            <span className="ml-1 text-base font-medium text-muted-foreground">km/h · {fmtMs(windMs)} m/s</span>
          </span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-muted/60">
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500", activeStyle?.bar ?? "bg-alert-green")}
            style={{ width: `${fillPct}%` }}
          />
          {sorted.map((t) => {
            const pos = Math.min(100, (t.minSpeed / ceiling) * 100)
            return (
              <span
                key={t.id}
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-foreground/50"
                style={{ left: `${pos}%` }}
                title={`${t.label} · ${fmtKmh(t.minSpeed)} km/h`}
              />
            )
          })}
        </div>
      </div>

      {/* Escalation ladder — one row per configured tier, mirrors the engineering console table.
          Columns: Wind ≥ · Alert level · Severity label · Note. The live-active tier blinks. */}
      <div role="table" aria-label="Wind event escalation ladder">
        <div
          role="row"
          className="grid grid-cols-[1.1fr_1fr_1.2fr_1.1fr] gap-2 border-b border-border/60 bg-background/40 px-3 py-2"
        >
          <span role="columnheader" className="label-caps text-muted-foreground">Wind ≥</span>
          <span role="columnheader" className="label-caps text-muted-foreground">Alert level</span>
          <span role="columnheader" className="label-caps text-muted-foreground">Severity label</span>
          <span role="columnheader" className="label-caps text-muted-foreground">Note</span>
        </div>
        <div className="flex flex-col gap-px bg-border/60">
          {boxes.map(({ tier: t, lower, upper }) => {
            const s = WIND_TIER_STYLES[t.level]
            const isActive = active?.id === t.id
            const met = windMs >= t.minSpeed
            const kmhRange = upper == null ? `≥ ${fmtKmh(lower)}` : `${fmtKmh(lower)}–${fmtKmh(upper)}`
            const msRange = upper == null ? `≥ ${fmtMs(lower)}` : `${fmtMs(lower)}–${fmtMs(upper)}`
            return (
              <div
                role="row"
                key={t.id}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "grid grid-cols-[1.1fr_1fr_1.2fr_1.1fr] items-center gap-2 px-3 py-2.5 transition-colors",
                  isActive ? s.chip : met ? "bg-card" : "bg-card/60",
                )}
              >
                {/* Wind range — dual unit */}
                <span role="cell" className="flex flex-col leading-tight">
                  <span
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums",
                      isActive ? s.text : met ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {kmhRange} <span className="text-[0.5625rem] font-medium text-muted-foreground">km/h</span>
                  </span>
                  <span className="font-mono text-[0.5625rem] font-medium tabular-nums text-muted-foreground">
                    {msRange} m/s
                  </span>
                </span>
                {/* Alert level — coloured lamp + name */}
                <span role="cell" className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      met ? s.dot : "bg-muted-foreground/30",
                      met && s.text,
                      isActive && "tier-blink",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "font-mono text-[0.6875rem] font-bold uppercase tracking-wide",
                      isActive ? s.text : met ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {cap(t.level)}
                  </span>
                </span>
                {/* Severity label */}
                <span
                  role="cell"
                  className={cn(
                    "font-mono text-[0.6875rem] uppercase tracking-wide",
                    isActive ? s.text : "text-muted-foreground",
                  )}
                >
                  {t.label}
                </span>
                {/* Note (escalation level) + live tag */}
                <span role="cell" className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                    {t.note}
                  </span>
                  {isActive ? (
                    <span className={cn("shrink-0 font-mono text-[0.5rem] font-bold uppercase tracking-wider tier-blink", s.text)}>
                      Live
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
