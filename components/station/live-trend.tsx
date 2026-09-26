"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowDownRight, ArrowUpRight, CloudRain, Eye, EyeOff, Minus, ShieldCheck, Sparkles, Sun, Sunrise, Thermometer, Wind, ZoomIn, ZoomOut } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import {
  buildDailyAlert,
  compass,
  dniBand,
  formatWeekday,
  precipUnit,
  speedUnit,
  tempUnit,
  toMetersPerSecond,
  weatherEmoji,
  type AlertLevel,
  type DailyReading,
  type HourlyReading,
  type SolarDay,
  type SolarPayload,
  type Units,
  type WeatherPayload,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

/** Best-in-class model network the EmiratesConsensus blend fuses per location. */
const MODEL_NETWORK = "ECMWF · DWD · NOAA · Météo-France · JMA · KMA · UK Met Office · BOM"

/**
 * Live wall clock pinned to the station timezone (NCM/UAE = Asia/Dubai), so the
 * "now" anchor on every trend matches the National Center of Meteorology clock.
 * Ticks every second and re-reads system time each tick — no drift.
 */
function NcmClock({ timezone }: { timezone?: string }) {
  const tz = timezone || "Asia/Dubai"
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!now) return null
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(now)
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-border bg-card/60 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground lg:inline-flex"
      title={`NCM-synced station time (${tz})`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" aria-hidden="true" />
      NCM {time}
    </span>
  )
}

type Horizon = "24h" | "14d"
type MetricKey = "comfort" | "wind" | "sky" | "dni"

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "24h", label: "24H" },
  { id: "14d", label: "14-Day" },
]

const METRICS: { id: MetricKey; label: string; short: string; icon: typeof Thermometer }[] = [
  { id: "comfort", label: "Temperature & comfort", short: "Comfort", icon: Thermometer },
  { id: "wind", label: "Wind & air", short: "Wind", icon: Wind },
  { id: "sky", label: "Sky & rainfall", short: "Rainfall", icon: CloudRain },
  { id: "dni", label: "Solar DNI", short: "Solar", icon: Sun },
]

/**
 * Live-trend line palette — soft, light tints tuned to read cleanly on the dark
 * chassis without the heavy, saturated look. Shared by every metric tab so the
 * legend, stat dots and scrub markers stay in sync.
 */
const TREND = {
  primary: "oklch(0.83 0.1 74)",
  secondary: "oklch(0.81 0.07 232)",
  humidity: "oklch(0.85 0.07 190)",
  dew: "oklch(0.82 0.09 150)",
  gust: "oklch(0.8 0.1 30)",
} as const

/** The four toggleable Solar DNI layers, matching the NCM series drawn on the chart. */
type DniLayerKey = "dni" | "transmittance" | "clouds" | "rain"
type DniLayers = Record<DniLayerKey, boolean>

/** Cyan transmittance overlay (dashed) + toggle chip on the Solar DNI tab. */
const TRANSMITTANCE = "oklch(0.82 0.14 200)"
/** Blue NCM #hail precipitation bars + toggle chip. */
const PRECIP_BLUE = "oklch(0.62 0.17 250)"

const DNI_TOGGLES: { key: DniLayerKey; label: string; color: string }[] = [
  { key: "dni", label: "DNI", color: TREND.primary },
  { key: "transmittance", label: "Transmittance", color: TRANSMITTANCE },
  { key: "clouds", label: "Clouds", color: "var(--muted-foreground)" },
  { key: "rain", label: "Rain", color: PRECIP_BLUE },
]

const ALERT_DOT: Record<AlertLevel, string> = {
  green: "bg-alert-green",
  yellow: "bg-alert-yellow",
  orange: "bg-alert-orange",
  red: "bg-alert-red",
}

type MeasureTone = "good" | "info" | "warn" | "bad"

const MEASURE_DOT: Record<MeasureTone, string> = {
  good: "bg-alert-green",
  info: "bg-signal",
  warn: "bg-alert-orange",
  bad: "bg-alert-red",
}

const MEASURE_CHIP: Record<MeasureTone, string> = {
  good: "border-alert-green/40 bg-alert-green/10 text-alert-green",
  info: "border-signal/40 bg-signal/10 text-signal",
  warn: "border-alert-orange/40 bg-alert-orange/10 text-alert-orange",
  bad: "border-alert-red/50 bg-alert-red/10 text-alert-red",
}

const MEASURE_TEXT: Record<MeasureTone, string> = {
  good: "text-alert-green",
  info: "text-signal",
  warn: "text-alert-orange",
  bad: "text-alert-red",
}

type Series = {
  label: string
  color: string
  values: number[]
  format: (v: number) => string
  /** When true, the line renders fully dotted — the Open-Meteo AI-prediction overlay. */
  dashed?: boolean
  /** Lines sharing a group id share one auto-scaled range, so same-unit series compare truthfully. */
  group?: string
  /** When "right", the line is scaled to the view's secondary (right-hand) axis instead of its own range. */
  axis?: "left" | "right"
  /** Ties the line to a visibility toggle so it can be shown/hidden from the Solar DNI panel. */
  toggleKey?: "dni" | "transmittance"
  }

type Stat = { label: string; value: string; sub: string }

/** A predicted extreme: what, how much, and when it lands. */
type Highlight = { label: string; value: string; when: string }

/** A recommended action derived from the predicted conditions. */
type Measure = { tone: MeasureTone; text: string }

type View = {
  n: number
  series: Series[]
  xLabels: string[]
  /** Index where the AI-projected (dashed) segment begins. */
  boundary: number
  /** Index of the live "now" marker, or -1. */
  nowIndex: number
  stats: Stat[]
  peak: Highlight
  trough: Highlight
  measures: Measure[]
  /** One-line trend narrative + status chip surfaced in the chart header. */
  headline: { status: string; tone: MeasureTone; comment: string }
  projectionNote: string
  tooltipHead: (i: number) => string
  /** Extra detail rows surfaced in the scrub tooltip (e.g. solar optics). */
  extra?: (i: number) => { label: string; value: string }[]
  /** Sunrise / sunset window chip shown in the header (solar views). */
  sunWindow?: { sunrise: string; sunset: string }
  /** Live AI comment for the scrubbed index, shown in the header during scroll. */
  scrubComment?: (i: number) => string
  /** Optional bar layer drawn behind the lines (e.g. on-site cloud cover %). */
  bars?: { label: string; color: string; values: number[]; format: (v: number) => string; max: number }
  /**
   * Optional right-hand secondary axis (e.g. 0–100% for sky transmittance + cloud
   * cover) so percentage layers get a proper labelled range beside the primary unit.
   */
  rightAxis?: { label: string; lo: number; hi: number; format: (v: number) => string }
  /**
   * Optional filled area layer drawn behind everything — NCM Ghaith trajectory
   * cloud-cover deck rendered as a soft gray/silver fill (0–100%).
   */
  cloudArea?: { label: string; color: string; values: number[]; format: (v: number) => string; max: number }
  /** Data-driven event callouts (peak DNI, cloud influx, rain, sunset) drawn over the chart. */
  annotations?: { i: number; label: string; sub: string; tone: MeasureTone; requires?: DniLayerKey }[]
  /** Rotated left/right axis titles rendered at the chart edges. */
  axisTitles?: { left: string; right: string }
}

/** Format an Open-Meteo local ISO timestamp (…THH:MM) to a friendly clock label. */
function isoClock(iso: string) {
  if (!iso || iso.length < 16) return "—"
  const hour = Number(iso.slice(11, 13))
  const minute = iso.slice(14, 16)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${minute} ${hour < 12 ? "AM" : "PM"}`
}

function dayLabel(date: string, index: number) {
  if (index === 0) return "Today"
  if (index === 1) return "Tmrw"
  return formatWeekday(date)
}

function clockLabel(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${hour < 12 ? "AM" : "PM"}`
}

/** Index of the max / min of an array. */
function argExtremes(values: number[]) {
  let hi = 0
  let lo = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[hi]) hi = i
    if (values[i] < values[lo]) lo = i
  }
  return { hi, lo }
}

/**
 * Deterministic AI nowcast overlay for the dotted prediction line. It tracks the
 * live NCM-mirrored series closely around "now" and diverges gently into the
 * forecast horizon (local momentum × a lead-time gain) — the same model-vs-AI
 * relationship the Solar DNI tab shows between its beam model and AI beam. The
 * base series is the real Open-Meteo forecast; this projects the AI correction.
 */
function aiProject(values: number[], nowIndex: number, opts?: { min?: number; max?: number }): number[] {
  const n = values.length
  const anchor = nowIndex >= 0 ? nowIndex : 0
  return values.map((v, i) => {
    const prev = values[Math.max(0, i - 1)]
    const next = values[Math.min(n - 1, i + 1)]
    const slope = (next - prev) / 2
    const lead = i - anchor
    const gain = lead <= 0 ? 0.04 : Math.min(0.4, lead * 0.035)
    let out = v + slope * gain
    if (opts?.min != null) out = Math.max(opts.min, out)
    if (opts?.max != null) out = Math.min(opts.max, out)
    return out
  })
}

function buildView(
  payload: WeatherPayload,
  units: Units,
  horizon: Horizon,
  metric: MetricKey,
  selectedDay: number,
  solar: SolarPayload | undefined,
): View | null {
  const isMetric = units === "metric"
  const spd = (v: number) => (isMetric ? toMetersPerSecond(v) : v)
  const t = (v: number) => `${Math.round(v)}${tempUnit(units)}`
  const s = (v: number) => `${v.toFixed(isMetric ? 1 : 0)} ${speedUnit(units)}`
  const pct = (v: number) => `${Math.round(v)}%`
  const wm2 = (v: number) => `${Math.round(v)} W/m²`
  const kwh = (v: number) => `${v.toFixed(1)} kWh/m²`
  // Normalise gust magnitude to km/h so wind advisories are unit-independent.
  const toKmh = (v: number) => (isMetric ? v : v * 1.609)

  if (horizon === "24h") {
    // ---- Solar DNI: hour-by-hour beam irradiance for the selected day ----
    if (metric === "dni") {
      const day: SolarDay | undefined = solar?.days?.[selectedDay]
      if (!day) return null
      const values = day.hourlyDni.slice(0, 24)
      const aiValues = (day.hourlyDniAi ?? day.hourlyDni).slice(0, 24)
      const ghiValues = day.hourlyGhi.slice(0, 24)
      const trans = day.hourlyTransmittance.slice(0, 24)
      const refl = day.hourlyReflectivity.slice(0, 24)
      const atten = day.hourlyAttenuation.slice(0, 24)
      const n = values.length
      // NCM Ghaith mirror layers aligned hour-for-hour with the beam curve:
      //  • #trajectory cloud-cover deck  → soft gray/silver filled area (0–100%)
      //  • #hail precipitation           → blue bars anchored to the baseline
      const dniHours: HourlyReading[] = (payload.hourlyByDay?.[selectedDay] ?? payload.hourly ?? []).slice(0, 24)
      const cloudCover = dniHours.map((h) => h.cloudCover)
      const precip = dniHours.map((h) => (isMetric ? h.precipitation * 25.4 : h.precipitation))
      const precipMax = Math.max(...precip, isMetric ? 1 : 0.04)
      const precipFmt = (v: number) => (isMetric ? `${v.toFixed(1)} mm` : `${v.toFixed(2)} in`)
      const xLabels = values.map((_, i) => (i % 3 === 0 ? String(i).padStart(2, "0") : ""))
      const nowIndex = selectedDay === 0 ? payload.currentHourIndex : -1
      const boundary = nowIndex >= 0 ? nowIndex : n - 1
      const { hi } = argExtremes(values)
      const skyWord = (t: number) => (t >= 70 ? "clear sky" : t >= 45 ? "hazy sky" : t >= 20 ? "cloudy" : "overcast")
      const usable = values.map((v, i) => (v >= 120 ? i : -1)).filter((i) => i >= 0)
      const first = usable.length ? usable[0] : 0
      const last = usable.length ? usable[usable.length - 1] : 0
      const cur = values[Math.max(0, nowIndex)]
      const band = dniBand(day.dniEnergy)
      const measures: Measure[] = []
      if (day.peakDni >= 800) measures.push({ tone: "good", text: "Prime solar-generation window — maximise PV dispatch and keep panels clean for peak capture." })
      else if (day.peakDni < 400) measures.push({ tone: "warn", text: "Weak beam irradiance — reduced PV output; lean on storage or grid supply." })
      if (day.peakDni >= 700) measures.push({ tone: "info", text: `Very high midday UV around ${clockLabel(day.peakHour)} — use eye and skin protection outdoors.` })
      if (day.sunHours >= 11) measures.push({ tone: "good", text: `Long usable window (${day.sunHours} h) — schedule tracker cleaning and inspections at dawn or dusk.` })
      if (measures.length === 0) measures.push({ tone: "info", text: "Moderate irradiance — standard PV operation expected." })
      // Event callouts read straight from the NCM-mirror hourly feed for this day.
      const cloudPeak = argExtremes(cloudCover).hi
      const rainPeak = argExtremes(precip).hi
      const sunsetHour = day.sunset && day.sunset.length >= 13 ? Number(day.sunset.slice(11, 13)) : -1
      const annotations: NonNullable<View["annotations"]> = [
        { i: hi, label: `Peak DNI ${wm2(values[hi])}`, sub: clockLabel(hi), tone: "good", requires: "dni" },
      ]
      if (cloudCover[cloudPeak] >= 25)
        annotations.push({ i: cloudPeak, label: `Cloud influx ${Math.round(cloudCover[cloudPeak])}%`, sub: clockLabel(cloudPeak), tone: "info", requires: "clouds" })
      if (precip[rainPeak] > 0)
        annotations.push({ i: rainPeak, label: `Rain ${precipFmt(precip[rainPeak])}`, sub: clockLabel(rainPeak), tone: "warn", requires: "rain" })
      if (sunsetHour >= 0 && sunsetHour < 24)
        annotations.push({ i: sunsetHour, label: "Sunset · DNI drop", sub: clockLabel(sunsetHour), tone: "info", requires: "dni" })
      return {
        n,
        boundary,
        nowIndex,
        xLabels,
        tooltipHead: (i) => `${clockLabel(i)}${i === nowIndex ? " · live" : ""}`,
        projectionNote: nowIndex >= 0 ? "Solid = NCM mirror · dotted = Open-Meteo AI prediction" : "AI-projected day",
        series: [
          { label: "DNI · model", color: TREND.primary, values, format: wm2, group: "wm2", toggleKey: "dni" },
          { label: "Transmittance", color: TRANSMITTANCE, values: trans, format: (v) => `${Math.round(v)}%`, axis: "right", dashed: true, toggleKey: "transmittance" },
          { label: "AI beam", color: TREND.secondary, values: aiValues, format: wm2, dashed: true, group: "wm2", toggleKey: "dni" },
        ],
        rightAxis: { label: "%", lo: 0, hi: 100, format: (v) => `${Math.round(v)}%` },
        cloudArea: { label: "Clouds (NCM trajectory)", color: "var(--muted-foreground)", values: cloudCover, format: (v) => `${Math.round(v)}%`, max: 100 },
        bars: { label: "Precip (NCM hail)", color: PRECIP_BLUE, values: precip, format: precipFmt, max: precipMax },
        annotations,
        axisTitles: { left: "Solar energy · W/m² & %", right: `Cloud % · rain ${isMetric ? "mm" : "in"}` },
        sunWindow: { sunrise: day.sunrise, sunset: day.sunset },
        extra: (i) => [
          { label: "GHI (horizontal)", value: wm2(ghiValues[i]) },
          { label: "AI Δ vs model", value: `${aiValues[i] - values[i] >= 0 ? "+" : ""}${aiValues[i] - values[i]} W/m²` },
          { label: "Transmittance", value: `${trans[i]}%` },
          { label: "Reflectivity", value: `${refl[i]}%` },
          { label: "Attenuation", value: `${atten[i]} dB` },
        ],
        scrubComment: (i) => {
          const d = aiValues[i] - values[i]
          const bias = Math.abs(d) < 15 ? "matches the model" : d < 0 ? `${Math.abs(d)} W/m² below model (cloud/haze cutting beam)` : `${d} W/m² above model`
          return `${clockLabel(i)} — model ${wm2(values[i])}, AI beam ${wm2(aiValues[i])} · ${bias} · ${skyWord(trans[i])} (τ ${trans[i]}%, ${atten[i]} dB loss).`
        },
        stats: [
          { label: "DNI now", value: wm2(cur), sub: band.label },
          { label: "Peak DNI", value: wm2(day.peakDni), sub: `at ${clockLabel(day.peakHour)}` },
          { label: "Day yield", value: kwh(day.dniEnergy), sub: `${day.sunHours} sun hrs` },
        ],
        peak: { label: "Peak irradiance", value: wm2(values[hi]), when: clockLabel(hi) },
        trough: { label: "Usable window", value: `${day.sunHours} h`, when: `${clockLabel(first)}–${clockLabel(last)}` },
        headline: {
          status: day.peakDni >= 800 ? "Prime solar" : day.peakDni < 400 ? "Weak beam" : "Moderate sun",
          tone: day.peakDni >= 800 ? "good" : day.peakDni < 400 ? "warn" : "info",
          comment: `Beam irradiance peaks ${wm2(day.peakDni)} around ${clockLabel(day.peakHour)} — ${day.sunHours} usable sun hours (${band.label.toLowerCase()} day).`,
        },
        measures,
      }
    }

    const hours: HourlyReading[] = (payload.hourlyByDay?.[selectedDay] ?? payload.hourly ?? []).slice(0, 24)
    if (hours.length < 2) return null
    const n = hours.length
    // Every hour 00 → 23, matching an hour-by-hour breakdown axis.
    const xLabels = hours.map((h) => h.time.slice(11, 13))
    const nowIndex = selectedDay === 0 ? payload.currentHourIndex : -1
    const boundary = nowIndex >= 0 ? nowIndex : n - 1
    const clockAt = (i: number) => clockLabel(Number(hours[i].time.slice(11, 13)))
    const tooltipHead = (i: number) => `${clockAt(i)}${i === nowIndex ? " · live" : ""}`

    if (metric === "comfort") {
      const temps = hours.map((h) => h.temperature)
      const feels = hours.map((h) => h.apparentTemperature)
      const hum = hours.map((h) => h.humidity)
      const dew = hours.map((h) => h.dewPoint)
      const aiTemp = aiProject(temps, nowIndex)
      const cur = hours[Math.max(0, nowIndex)]
      const { hi, lo } = argExtremes(feels)
      const hot = isMetric ? 33 : 91
      const extreme = isMetric ? 42 : 108
      const cool = isMetric ? 12 : 54
      const measures: Measure[] = []
      if (feels[hi] >= extreme) measures.push({ tone: "bad", text: `Extreme heat peaking ${clockAt(hi)} — avoid outdoor exertion 11:00–16:00 and hydrate hourly.` })
      else if (feels[hi] >= hot) measures.push({ tone: "warn", text: `High heat around ${clockAt(hi)} — limit midday sun, wear sunscreen, carry water.` })
      if (Math.min(...temps) <= cool) measures.push({ tone: "info", text: "Cooler hours near dawn — keep a light layer for early mornings." })
      if (Math.max(...hum) >= 70 && feels[hi] >= hot) measures.push({ tone: "warn", text: "Humid heat elevates the feels-like index — reduce strenuous activity." })
      if (measures.length === 0) measures.push({ tone: "good", text: "Comfortable range — no heat or cold precautions needed." })
      return {
        n,
        boundary,
        nowIndex,
        xLabels,
        tooltipHead,
        projectionNote: nowIndex >= 0 ? "Solid = NCM mirror · dotted = Open-Meteo AI prediction" : "AI-projected day",
        series: [
          { label: "Temp", color: TREND.primary, values: temps, format: t },
          { label: "Dew point", color: TREND.dew, values: dew, format: t },
          { label: "Humidity", color: TREND.humidity, values: hum, format: pct },
          { label: "AI temp", color: TREND.secondary, values: aiTemp, format: t, dashed: true },
        ],
        extra: (i) => [
          { label: "Feels like", value: t(feels[i]) },
          { label: "Dew point", value: t(dew[i]) },
          { label: "AI temp", value: t(aiTemp[i]) },
          { label: "AI Δ vs NCM", value: `${aiTemp[i] - temps[i] >= 0 ? "+" : ""}${Math.round(aiTemp[i] - temps[i])}°` },
        ],
        stats: [
          { label: "Temperature", value: t(cur.temperature), sub: `peak ${t(Math.max(...temps))}` },
          { label: "Feels like", value: t(cur.apparentTemperature), sub: `Δ ${Math.round(cur.apparentTemperature - cur.temperature)}°` },
          { label: "Humidity", value: pct(cur.humidity), sub: `${pct(Math.min(...hum))}–${pct(Math.max(...hum))}` },
        ],
        scrubComment: (i) =>
          `${clockAt(i)} — NCM ${t(temps[i])}, AI ${t(aiTemp[i])} · dew ${t(dew[i])} · ${pct(hum[i])} humidity${feels[i] >= hot ? " — heat caution." : "."}`,
        peak: { label: "Warmest (feels)", value: t(feels[hi]), when: clockAt(hi) },
        trough: { label: "Coolest (feels)", value: t(feels[lo]), when: clockAt(lo) },
        headline: {
          status: feels[hi] >= extreme ? "Extreme heat" : feels[hi] >= hot ? "Heat stress" : "Comfortable",
          tone: feels[hi] >= extreme ? "bad" : feels[hi] >= hot ? "warn" : "good",
          comment: `Feels-like peaks ${t(feels[hi])} around ${clockAt(hi)}; easing to ${t(feels[lo])} by ${clockAt(lo)}.`,
        },
        measures,
      }
    }
    if (metric === "wind") {
      const wind = hours.map((h) => spd(h.windSpeed))
      const gust = hours.map((h) => spd(h.windGusts))
      const aiWind = aiProject(wind, nowIndex, { min: 0 })
      const cur = hours[Math.max(0, nowIndex)]
      const { hi, lo } = argExtremes(gust)
      const gustKmh = hours.map((h) => toKmh(h.windGusts))
      const gMax = Math.max(...gustKmh)
      const measures: Measure[] = []
      if (gMax >= 75) measures.push({ tone: "bad", text: `Damaging gusts near ${clockAt(hi)} — secure loose objects and avoid high-profile driving.` })
      else if (gMax >= 50) measures.push({ tone: "warn", text: `Strong winds and blowing dust likely around ${clockAt(hi)} — secure outdoor items, expect reduced visibility.` })
      else if (gMax >= 35) measures.push({ tone: "info", text: "Breezy spells — light objects may shift outdoors." })
      else measures.push({ tone: "good", text: "Light winds — calm conditions throughout." })
      return {
        n,
        boundary,
        nowIndex,
        xLabels,
        tooltipHead,
        projectionNote: nowIndex >= 0 ? "Solid = NCM mirror · dotted = Open-Meteo AI prediction" : "AI-projected day",
        series: [
          { label: "Wind", color: TREND.primary, values: wind, format: s },
          { label: "Gusts", color: TREND.gust, values: gust, format: s },
          { label: "AI wind", color: TREND.secondary, values: aiWind, format: s, dashed: true },
        ],
        extra: (i) => [
          { label: "Direction", value: `${compass(hours[i].windDirection)} · ${Math.round(hours[i].windDirection)}°` },
          { label: "AI wind", value: s(aiWind[i]) },
          {
            label: "AI Δ vs NCM",
            value: `${aiWind[i] - wind[i] >= 0 ? "+" : ""}${(aiWind[i] - wind[i]).toFixed(isMetric ? 1 : 0)} ${speedUnit(units)}`,
          },
        ],
        stats: [
          { label: "Wind", value: s(spd(cur.windSpeed)), sub: compass(cur.windDirection) },
          { label: "Gusts", value: s(spd(cur.windGusts)), sub: `peak ${s(Math.max(...gust))}` },
          { label: "Direction", value: compass(cur.windDirection), sub: `${Math.round(cur.windDirection)}°` },
        ],
        scrubComment: (i) =>
          `${clockAt(i)} — NCM wind ${s(wind[i])} (AI ${s(aiWind[i])}), gusting ${s(gust[i])} from ${compass(hours[i].windDirection)} ${Math.round(hours[i].windDirection)}°${gustKmh[i] >= 50 ? " — dust likely." : "."}`,
        peak: { label: "Strongest gust", value: s(gust[hi]), when: clockAt(hi) },
        trough: { label: "Calmest hour", value: s(gust[lo]), when: clockAt(lo) },
        headline: {
          status: gMax >= 75 ? "Damaging gusts" : gMax >= 50 ? "Windy" : gMax >= 35 ? "Breezy" : "Light air",
          tone: gMax >= 75 ? "bad" : gMax >= 50 ? "warn" : gMax >= 35 ? "info" : "good",
          comment: `Peak gusts ${s(gust[hi])} ${compass(hours[hi].windDirection)} around ${clockAt(hi)}; calmest ${s(gust[lo])} at ${clockAt(lo)}.`,
        },
        measures,
      }
    }
    const prob = hours.map((h) => h.precipitationProbability)
    const hum = hours.map((h) => h.humidity)
    const cloud = hours.map((h) => h.cloudCover)
    const aiRain = aiProject(prob, nowIndex, { min: 0, max: 100 })
    const total = hours.reduce((sum, h) => sum + h.precipitation, 0)
    const cur = hours[Math.max(0, nowIndex)]
    const cloudWord = (c: number) => (c >= 85 ? "overcast" : c >= 55 ? "cloudy" : c >= 25 ? "partly cloudy" : "clear")
    const { hi, lo } = argExtremes(prob)
    const heavy = isMetric ? 20 : 0.8
    const measures: Measure[] = []
    if (prob[hi] >= 70 && total >= heavy) measures.push({ tone: "bad", text: `Heavy rain likely around ${clockAt(hi)} — flash-flood risk in low areas; avoid wadis and underpasses.` })
    else if (prob[hi] >= 50) measures.push({ tone: "warn", text: `Showers likely near ${clockAt(hi)} — carry rain protection and allow extra travel time.` })
    else if (prob[hi] >= 25) measures.push({ tone: "info", text: "Isolated showers possible — keep an umbrella handy." })
    else measures.push({ tone: "good", text: "Dry outlook — no rainfall expected." })
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote: nowIndex >= 0 ? "Solid = NCM mirror · dotted = Open-Meteo AI prediction" : "AI-projected day",
      series: [
        { label: "Rain %", color: TREND.primary, values: prob, format: pct },
        { label: "Humidity", color: TREND.humidity, values: hum, format: pct },
        { label: "AI rain %", color: TREND.secondary, values: aiRain, format: pct, dashed: true },
      ],
      bars: { label: "Cloud cover", color: "var(--muted-foreground)", values: cloud, format: pct, max: 100 },
      stats: [
        { label: "Rain chance", value: pct(cur.precipitationProbability), sub: `peak ${pct(Math.max(...prob))}` },
        { label: "Cloud cover", value: pct(cur.cloudCover), sub: cloudWord(cur.cloudCover) },
        { label: "Humidity", value: pct(cur.humidity), sub: `${pct(Math.min(...hum))}–${pct(Math.max(...hum))}` },
      ],
      extra: (i) => [
        { label: "Cloud cover", value: `${pct(cloud[i])} · ${cloudWord(cloud[i])}` },
        { label: "AI rain %", value: pct(aiRain[i]) },
        { label: "Precip total", value: `${total.toFixed(1)} ${precipUnit(units)}` },
      ],
      scrubComment: (i) =>
        `${clockAt(i)} — ${cloudWord(cloud[i])} (${pct(cloud[i])} cloud) · NCM ${pct(prob[i])} rain (AI ${pct(aiRain[i])}) · ${pct(hum[i])} humidity${prob[i] >= 50 ? " — showers likely." : "."}`,
      peak: { label: "Peak rain chance", value: pct(prob[hi]), when: clockAt(hi) },
      trough: { label: "Driest hour", value: pct(prob[lo]), when: clockAt(lo) },
      headline: {
        status: prob[hi] >= 70 ? "Rain likely" : prob[hi] >= 50 ? "Showers" : prob[hi] >= 25 ? "Isolated showers" : "Dry",
        tone: prob[hi] >= 70 ? "bad" : prob[hi] >= 50 ? "warn" : prob[hi] >= 25 ? "info" : "good",
        comment:
          prob[hi] >= 25
            ? `Peak rain chance ${pct(prob[hi])} around ${clockAt(hi)}; ${total.toFixed(1)} ${precipUnit(units)} expected over the day.`
            : "Dry through the next 24 hours — no meaningful rain expected.",
      },
      measures,
    }
  }

  // ---- 14-day extended AI outlook — every model day broken into its 24 hourly steps ----
  const daily: DailyReading[] = (payload.daily ?? []).slice(0, 14)
  if (daily.length < 2) return null
  const dayN = daily.length
  // Flatten each day into 24 hourly points → one continuous fortnight curve
  // (14 days × 24 h). Days 0–6 are near-term (solid); 7–13 AI-projected (dashed).
  const flat: HourlyReading[] = (payload.hourlyByDay ?? []).slice(0, dayN).flatMap((d) => d.slice(0, 24))
  const useHourly = flat.length >= 2
  const n = useHourly ? flat.length : dayN
  const dayOf = (i: number) => Math.min(dayN - 1, Math.floor(i / 24))
  const hourOf = (i: number) => i % 24
  // Day name printed once per day (every 2nd day) so the 336-point axis stays readable.
  const xLabels = useHourly
    ? flat.map((_, i) => (hourOf(i) === 0 && Math.floor(i / 24) % 2 === 0 ? dayLabel(daily[Math.floor(i / 24)].date, Math.floor(i / 24)) : ""))
    : daily.map((d, i) => (i % 2 === 0 ? dayLabel(d.date, i) : ""))
  const nowIndex = useHourly ? (payload.currentHourIndex >= 0 ? payload.currentHourIndex : 0) : 0
  const boundary = useHourly ? Math.min(7, dayN) * 24 - 1 : Math.min(6, dayN - 1)
  const when14 = (i: number) =>
    useHourly ? `${dayLabel(daily[dayOf(i)].date, dayOf(i))} ${clockLabel(hourOf(i))}` : dayLabel(daily[i].date, i)
  const tooltipHead = (i: number) => `${when14(i)}${dayOf(i) >= 7 ? " · extended" : ""}`
  const projectionNote = "Solid = near-term · dashed = extended AI range (7–14 d) · each day 00–24 h"

  if (metric === "dni") {
    const sdays: SolarDay[] = (solar?.days ?? []).slice(0, dayN)
    if (sdays.length < 2) return null
    const m = sdays.length
    // 14 stitched daily bell curves — every day arranged hour-by-hour (00 → 24).
    const dni = sdays.flatMap((d) => d.hourlyDni.slice(0, 24))
    const ai = sdays.flatMap((d) => (d.hourlyDniAi ?? d.hourlyDni).slice(0, 24))
    const ghi = sdays.flatMap((d) => d.hourlyGhi.slice(0, 24))
    const nn = dni.length
    const dniDay = (i: number) => Math.min(m - 1, Math.floor(i / 24))
    const dniWhen = (i: number) => `${dayLabel(sdays[dniDay(i)].date, dniDay(i))} ${clockLabel(i % 24)}`
    const yield_ = sdays.map((d) => d.dniEnergy)
    const { hi, lo } = argExtremes(yield_)
    const bestDay = (i: number) => dayLabel(sdays[i].date, i)
    const peakDniMax = Math.max(...sdays.map((d) => d.peakDni))
    const avg = yield_.reduce((a, b) => a + b, 0) / m
    const excellent = yield_.filter((v) => v >= 7).length
    const dniBnd = Math.min(7, m) * 24 - 1
    const measures: Measure[] = []
    measures.push({ tone: "good", text: `Best generation day is ${bestDay(hi)} (${kwh(yield_[hi])}) — plan peak PV dispatch and pre-clean panels.` })
    if (excellent >= 5) measures.push({ tone: "good", text: `${excellent} of ${m} days rate excellent — sustained high solar resource for the fortnight.` })
    if (yield_[lo] < 5) measures.push({ tone: "warn", text: `Lowest yield on ${bestDay(lo)} (${kwh(yield_[lo])}) — schedule storage top-ups or maintenance then.` })
    measures.push({ tone: "info", text: "Extended DNI (7–14 d) is AI-projected — each day is shown hour-by-hour; treat later days as a planning guide." })
    return {
      n: nn,
      boundary: dniBnd,
      nowIndex,
      xLabels: dni.map((_, i) => (i % 24 === 0 && Math.floor(i / 24) % 2 === 0 ? dayLabel(sdays[i / 24].date, i / 24) : "")),
      tooltipHead: (i) => `${dniWhen(i)}${Math.floor(i / 24) >= 7 ? " · extended" : ""}`,
      projectionNote,
      series: [
        { label: "DNI · model", color: TREND.primary, values: dni, format: wm2 },
        { label: "AI beam", color: TREND.secondary, values: ai, format: wm2 },
      ],
      extra: (i) => [
        { label: "GHI (horizontal)", value: wm2(ghi[i]) },
        { label: "AI Δ vs model", value: `${ai[i] - dni[i] >= 0 ? "+" : ""}${ai[i] - dni[i]} W/m²` },
        { label: "Hour", value: dniWhen(i) },
      ],
      stats: [
        { label: "Avg yield · 14d", value: kwh(avg), sub: dniBand(avg).label },
        { label: "Peak DNI", value: wm2(peakDniMax), sub: "beam maximum" },
        { label: "Best day", value: bestDay(hi), sub: kwh(yield_[hi]) },
      ],
      peak: { label: "Best yield", value: kwh(yield_[hi]), when: bestDay(hi) },
      trough: { label: "Lowest yield", value: kwh(yield_[lo]), when: bestDay(lo) },
      headline: {
        status: "Solar outlook",
        tone: "info",
        comment: `Best yield ${kwh(yield_[hi])} on ${bestDay(hi)}; lowest ${kwh(yield_[lo])} on ${bestDay(lo)}. 14-day average ${kwh(avg)}, shown hour-by-hour.`,
      },
      measures,
    }
  }

  if (metric === "comfort") {
    const temps = flat.map((h) => h.temperature)
    const feels = flat.map((h) => h.apparentTemperature)
    const { hi } = argExtremes(feels)
    const { lo } = argExtremes(temps)
    const hot = isMetric ? 40 : 104
    const cool = isMetric ? 15 : 59
    const measures: Measure[] = []
    if (feels[hi] >= hot) measures.push({ tone: "warn", text: `Hottest hour ${when14(hi)} at ${t(feels[hi])} — front-load outdoor work to mornings that week.` })
    if (temps[lo] <= cool) measures.push({ tone: "info", text: `Coolest hour ${when14(lo)} at ${t(temps[lo])} — plan a light layer for evenings.` })
    if (measures.length === 0) measures.push({ tone: "good", text: "Stable, comfortable spread across the fortnight." })
    measures.push({ tone: "info", text: "Days 7–14 are AI-projected, shown hour-by-hour — confidence narrows nearer the date." })
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote,
      series: [
        { label: "Temp", color: TREND.primary, values: temps, format: t },
        { label: "Feels", color: TREND.secondary, values: feels, format: t },
      ],
      extra: (i) => [{ label: "Hour", value: when14(i) }],
      stats: [
        { label: "Warmest", value: t(feels[hi]), sub: when14(hi) },
        { label: "Coolest", value: t(temps[lo]), sub: when14(lo) },
        { label: "14-day mean", value: t(temps.reduce((a, b) => a + b, 0) / n), sub: "hourly avg" },
      ],
      peak: { label: "Warmest hour", value: t(feels[hi]), when: when14(hi) },
      trough: { label: "Coolest hour", value: t(temps[lo]), when: when14(lo) },
      headline: {
        status: feels[hi] >= hot ? "Hot spell" : "Stable",
        tone: feels[hi] >= hot ? "warn" : "good",
        comment: `Hottest ${t(feels[hi])} on ${when14(hi)}; coolest ${t(temps[lo])} on ${when14(lo)}.`,
      },
      measures,
    }
  }
  if (metric === "wind") {
    const wind = flat.map((h) => spd(h.windSpeed))
    const gust = flat.map((h) => spd(h.windGusts))
    const { hi, lo } = argExtremes(gust)
    const gustKmh = flat.map((h) => toKmh(h.windGusts))
    const gMax = Math.max(...gustKmh)
    const measures: Measure[] = []
    if (gMax >= 75) measures.push({ tone: "bad", text: `Damaging gusts expected ${when14(hi)} — secure sites and reschedule crane or high-profile work.` })
    else if (gMax >= 50) measures.push({ tone: "warn", text: `Strong winds and blowing dust peak ${when14(hi)} — plan for reduced visibility and secure loose material.` })
    else measures.push({ tone: "good", text: "No high-wind hours flagged across the fortnight." })
    measures.push({ tone: "info", text: "Days 7–14 are AI-projected, shown hour-by-hour — treat later wind peaks as indicative." })
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote,
      series: [
        { label: "Wind", color: TREND.primary, values: wind, format: s },
        { label: "Gust", color: TREND.secondary, values: gust, format: s },
      ],
      extra: (i) => [{ label: "Hour", value: when14(i) }],
      stats: [
        { label: "Peak gust", value: s(gust[hi]), sub: when14(hi) },
        { label: "Windiest", value: s(Math.max(...wind)), sub: "hourly sustained" },
        { label: "Calmest", value: s(Math.min(...wind)), sub: "hourly sustained" },
      ],
      peak: { label: "Peak gust", value: s(gust[hi]), when: when14(hi) },
      trough: { label: "Calmest hour", value: s(gust[lo]), when: when14(lo) },
      headline: {
        status: gMax >= 75 ? "Damaging gusts" : gMax >= 50 ? "Windy" : "Light",
        tone: gMax >= 75 ? "bad" : gMax >= 50 ? "warn" : "good",
        comment: `Peak gust ${s(gust[hi])} on ${when14(hi)}; calmest ${s(gust[lo])} on ${when14(lo)}.`,
      },
      measures,
    }
  }
  const prob = flat.map((h) => h.precipitationProbability)
  const hum = flat.map((h) => h.humidity)
  const cloud = flat.map((h) => h.cloudCover)
  const { hi } = argExtremes(prob)
  const { lo } = argExtremes(prob)
  const wetHours = prob.filter((p) => p >= 40).length
  const measures: Measure[] = []
  if (prob[hi] >= 50) measures.push({ tone: "warn", text: `Wettest window ${when14(hi)} (${pct(prob[hi])} chance) — plan for wet-weather logistics and drainage checks.` })
  if (wetHours === 0) measures.push({ tone: "good", text: "Dry fortnight — no significant rain hours flagged." })
  else measures.push({ tone: "info", text: `${wetHours} hour(s) carry ≥ 40% rain chance — keep flexible outdoor scheduling.` })
  measures.push({ tone: "info", text: "Days 7–14 are AI-projected, shown hour-by-hour — rainfall confidence narrows nearer the date." })
  return {
    n,
    boundary,
    nowIndex,
    xLabels,
    tooltipHead,
    projectionNote,
    series: [
      { label: "Rain %", color: TREND.secondary, values: prob, format: pct },
      { label: "Humidity", color: TREND.primary, values: hum, format: pct },
    ],
    bars: { label: "Cloud cover", color: "var(--muted-foreground)", values: cloud, format: pct, max: 100 },
    extra: (i) => [
      { label: "Cloud cover", value: pct(cloud[i]) },
      { label: "Hour", value: when14(i) },
    ],
    stats: [
      { label: "Peak rain chance", value: pct(Math.max(...prob)), sub: when14(hi) },
      { label: "Rain hours", value: `${wetHours}`, sub: "≥ 40% chance" },
      { label: "Avg cloud", value: pct(cloud.reduce((a, b) => a + b, 0) / n), sub: "fortnight mean" },
    ],
    peak: { label: "Wettest window", value: pct(prob[hi]), when: when14(hi) },
    trough: { label: "Driest hour", value: pct(prob[lo]), when: when14(lo) },
    headline: {
      status: wetHours === 0 ? "Dry fortnight" : `${wetHours} wet hour(s)`,
      tone: wetHours === 0 ? "good" : "info",
      comment:
        wetHours === 0
          ? "No significant rain hours flagged across the fortnight."
          : `${wetHours} hour(s) carry ≥ 40% rain chance; wettest ${when14(hi)} (${pct(prob[hi])}).`,
    },
    measures,
  }
}

async function solarFetcher(url: string): Promise<SolarPayload> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Solar reading failed.")
  return response.json()
}

export function LiveTrend() {
  const { payload, units, selectedDay, setSelectedDay, location, isValidating } = useWeather()
  const [horizon, setHorizon] = useState<Horizon>("24h")
  const [metric, setMetric] = useState<MetricKey>("comfort")
  const [active, setActive] = useState<number | null>(null)
  const [dniLayers, setDniLayers] = useState<DniLayers>({ dni: true, transmittance: true, clouds: true, rain: true })

  // Beam-irradiance model powers the Solar DNI tab — fetched once for 14 days,
  // then sliced client-side so it also feeds the 14-day horizon.
  const solarKey = location ? `/api/solar?lat=${location.latitude}&lon=${location.longitude}&days=14` : null
  const { data: solar } = useSWR<SolarPayload>(solarKey, solarFetcher, {
    // Same 1-minute cadence as the weather + alert feeds so every panel updates together.
    refreshInterval: 60 * 1000,
    keepPreviousData: true,
  })

  const view = useMemo(
    () => (payload ? buildView(payload, units, horizon, metric, selectedDay, solar) : null),
    [payload, units, horizon, metric, selectedDay, solar],
  )

  const daily = payload?.daily ?? []
  // Both horizons expose all 14 model days: 24h picks one day as an hour-by-hour
  // breakdown, 14d plots the day-by-day trend.
  const dayCount = Math.min(14, daily.length)
  const dniLoading = metric === "dni" && !solar
  const unit = horizon === "14d" ? "d" : "h"

  if (!payload) {
    return <Panel className="h-[38rem] animate-pulse p-0" />
  }

  const aheadCount = view
    ? horizon === "14d"
      ? Math.max(0, dayCount - 1)
      : view.n - 1 - (view.nowIndex >= 0 ? view.nowIndex : 0)
    : 0

  return (
    <Panel className="station-rise flex flex-col overflow-hidden p-0">
      {/* Header — live-trend identity + horizon toggle */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-signal/15 text-signal">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Live Trend + AI Projection</h2>
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {location?.name ?? "Location"} · EmiratesConsensus
            </p>
          </div>
          <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-signal sm:inline-flex">
            <span className={cn("h-1.5 w-1.5 rounded-full bg-signal", isValidating && "animate-pulse")} aria-hidden="true" />
            {isValidating ? "Syncing" : "Live"}
          </span>
          {view && aheadCount > 0 ? (
            <span className="hidden font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground md:inline">
              {view.series.length} series · +{aheadCount}
              {unit} ahead
            </span>
          ) : null}
          <NcmClock timezone={payload?.timezone} />
        </div>

        {/* Horizon toggle — the optional extended predictive view */}
        <div
          role="tablist"
          aria-label="Prediction horizon"
          className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-0.5"
        >
          {HORIZONS.map((h) => {
            const on = horizon === h.id
            return (
              <button
                key={h.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => {
                  setHorizon(h.id)
                  setActive(null)
                }}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider transition-colors",
                  on ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {h.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Metric tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {METRICS.map((m) => {
          const Icon = m.icon
          const on = metric === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setMetric(m.id)
                setActive(null)
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "bg-secondary text-foreground ring-1 ring-signal/40"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", on ? "text-signal" : "text-muted-foreground")} aria-hidden="true" />
              <span className="hidden sm:inline">{m.label}</span>
              <span className="sm:hidden">{m.short}</span>
            </button>
          )
        })}
      </div>

      {dniLoading || !view ? (
        <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
          {dniLoading ? "Loading irradiance model…" : "No prediction data for this location."}
        </div>
      ) : (
        <>
          {/* Predictive-comment band — narrative + trend pill + upcoming-peak highlight */}
          <HeaderTrend view={view} active={active} horizon={horizon} />

          {/* Per-series metric cards — current reading + projected extreme with its offset from now */}
          <div
            className={cn(
              "grid gap-px bg-border",
              view.series.length === 4
                ? "grid-cols-2 sm:grid-cols-4"
                : view.series.length === 3
                  ? "grid-cols-3"
                  : "grid-cols-2",
            )}
          >
            {view.series.map((serie) => (
              <MetricCard key={serie.label} serie={serie} view={view} active={active} unit={unit} />
            ))}
          </div>

          {/* Visibility toggles — show/hide each Solar DNI layer (matches the four NCM series) */}
          {metric === "dni" ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 pt-3">
              <span className="mr-auto font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Visibility
              </span>
              {DNI_TOGGLES.map((tg) => {
                const on = dniLayers[tg.key]
                return (
                  <button
                    key={tg.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDniLayers((s) => ({ ...s, [tg.key]: !s[tg.key] }))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider transition-colors",
                      on
                        ? "border-signal/40 bg-card/60 text-foreground"
                        : "border-border/60 text-muted-foreground/60 hover:text-foreground",
                    )}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: tg.color, opacity: on ? 1 : 0.3 }}
                      aria-hidden="true"
                    />
                    {tg.label}
                    {on ? <Eye className="h-3 w-3" aria-hidden="true" /> : <EyeOff className="h-3 w-3" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          ) : null}

          {/* Trend chart — bigger, per-series normalised, solid live + dashed AI projection */}
          <TrendChart view={view} active={active} onActive={setActive} layers={metric === "dni" ? dniLayers : undefined} />

          {/* Legend + projection note */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
              {view.series.map((serie) => (
                <span key={serie.label} className="flex items-center gap-1.5">
                  {serie.dashed ? (
                    <span className="inline-block h-0 w-4 border-t-2 border-dotted" style={{ borderColor: serie.color }} />
                  ) : (
                    <span className="inline-block h-0.5 w-4 rounded-sm" style={{ background: serie.color }} />
                  )}
                  {serie.label}
                </span>
              ))}
              {view.cloudArea ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-sm" style={{ background: view.cloudArea.color, opacity: 0.35 }} />
                  {view.cloudArea.label}
                </span>
              ) : null}
              {view.bars ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: view.bars.color }} />
                  {view.bars.label}
                </span>
              ) : null}
              {view.series.some((serie) => serie.dashed) ? null : (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
                  AI projection
                </span>
              )}
            </div>
            <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
              {view.projectionNote}
              {view.rightAxis
                ? ` · left axis ${view.series.find((s) => s.axis !== "right")?.label ?? view.series[0].label} · right axis ${view.rightAxis.label}`
                : ` · Y-axis auto-scaled to ${view.series[0].label} · each line on its own range`}
            </span>
          </div>

          {/* Zoom control — sits right under the chart; click any day to open its 24H hour-by-hour breakdown */}
          <div className="border-t border-border bg-panel px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-signal">
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                {horizon === "14d" ? "Zoom to 24H — tap a day" : "24H zoom active — tap another day"}
              </span>
              {horizon === "24h" ? (
                <button
                  type="button"
                  onClick={() => {
                    setHorizon("14d")
                    setActive(null)
                  }}
                  className="flex items-center gap-1 rounded-md border border-border bg-card/60 px-2.5 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-signal/40 hover:text-foreground"
                >
                  <ZoomOut className="h-3 w-3" aria-hidden="true" />
                  Back to 14-day
                </button>
              ) : null}
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {daily.slice(0, dayCount).map((day, index) => {
                const on = index === selectedDay && horizon === "24h"
                const { level } = buildDailyAlert(day, units)
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => {
                      setSelectedDay(index)
                      setActive(null)
                      if (horizon === "14d") setHorizon("24h")
                    }}
                    title={`Zoom into ${dayLabel(day.date, index)} — 24H hour-by-hour`}
                    aria-pressed={on}
                    aria-label={`Zoom into ${dayLabel(day.date, index)} — 24 hour view`}
                    className={cn(
                      "flex min-w-[3.75rem] flex-1 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition-colors",
                      on
                        ? "border-signal bg-signal/10 ring-1 ring-signal"
                        : "border-border bg-card/40 hover:border-signal/40 hover:bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[0.625rem] font-semibold uppercase tracking-wide",
                        on ? "text-signal" : "text-foreground",
                      )}
                    >
                      {dayLabel(day.date, index)}
                    </span>
                    <span className="text-base leading-none" aria-hidden="true">
                      {weatherEmoji(day.weatherCode, true)}
                    </span>
                    <span className="font-mono text-[0.625rem] tabular-nums text-foreground">
                      {Math.round(day.max)}°<span className="text-muted-foreground">/{Math.round(day.min)}°</span>
                    </span>
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", ALERT_DOT[level])}
                      title={`Safety: ${level}`}
                      aria-hidden="true"
                    />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Predictive timing + measures to be taken */}
          <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
            <div className="bg-panel p-4">
              <p className="label-caps mb-3 text-muted-foreground">Predictive timing</p>
              <div className="grid grid-cols-2 gap-3">
                <TimingCard hl={view.peak} direction="up" />
                <TimingCard hl={view.trough} direction="down" />
              </div>
            </div>
            <div className="bg-panel p-4">
              <p className="label-caps mb-3 flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                Measures to be taken
              </p>
              <ul className="flex flex-col gap-2">
                {view.measures.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.8125rem] leading-snug text-foreground/90">
                    <span
                      className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", MEASURE_DOT[m.tone])}
                      aria-hidden="true"
                    />
                    <span className="text-pretty">{m.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </>
      )}

      <p className="border-t border-border px-4 py-2 text-center font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        Multi-model blend · {MODEL_NETWORK}
      </p>
    </Panel>
  )
}

/**
 * A single series card: current (or scrubbed) reading plus the AI-projected
 * extreme — the furthest the line moves from "now" — with its hour/day offset.
 */
function MetricCard({
  serie,
  view,
  active,
  unit,
}: {
  serie: Series
  view: View
  active: number | null
  unit: string
}) {
  const nowIdx = view.nowIndex >= 0 ? view.nowIndex : 0
  const cur = serie.values[nowIdx]
  const shown = active != null ? serie.values[active] : cur
  let exIdx = nowIdx
  for (let i = nowIdx + 1; i < view.n; i++) {
    if (Math.abs(serie.values[i] - cur) > Math.abs(serie.values[exIdx] - cur)) exIdx = i
  }
  const delta = serie.values[exIdx] - cur
  const ahead = exIdx - nowIdx
  const Arrow = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus
  const arrowClass = delta > 0 ? "text-alert-orange" : delta < 0 ? "text-signal" : "text-muted-foreground"
  return (
    <div className="flex flex-col gap-2 bg-panel px-4 py-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: serie.color, boxShadow: `0 0 8px ${serie.color}` }}
        />
        <span className="label-caps text-[0.6875rem]">{serie.label}</span>
      </div>
      <p className="font-mono text-4xl font-bold leading-none tabular-nums text-foreground">{serie.format(shown)}</p>
      <p className={cn("flex items-center gap-1 font-mono text-sm font-semibold tabular-nums", arrowClass)}>
        <Arrow className="h-4 w-4" aria-hidden="true" />
        {serie.format(serie.values[exIdx])}
        <span className="text-muted-foreground">
          {ahead > 0 ? `at +${unit === "d" ? Math.max(1, Math.round(ahead / 24)) : ahead}${unit}` : "now"}
        </span>
      </p>
    </div>
  )
}

/**
 * Header trend band — surfaces the metric's AI narrative, and while the cursor
 * scrubs the chart it swaps to a live read of the hovered point plus a
 * rising / easing / steady trend pill derived from the primary series.
 */
function HeaderTrend({ view, active, horizon }: { view: View; active: number | null; horizon: Horizon }) {
  const tone = MEASURE_CHIP[view.headline.tone]
  const primary = view.series[0]
  const unit = horizon === "14d" ? "d" : "h"

  // Upcoming peak — "when it's going to be high". Anchor to the metric's semantic
  // peak (matches the headline + timing card) by locating its label on the axis.
  const peakIdx = (() => {
    for (let i = 0; i < view.n; i++) {
      if (view.tooltipHead(i).split(" · ")[0] === view.peak.when) return i
    }
    return argExtremes(primary.values).hi
  })()
  const peakValue = view.peak.value
  const peakTime = view.peak.when
  // Countdown label relative to "now" — reads naturally in the chip.
  const peakLabel = (() => {
    if (horizon === "14d") {
      const d = Math.round((peakIdx - view.nowIndex) / 24)
      return d <= 0 ? "Peaks today" : `Peaks in ${d}d`
    }
    if (view.nowIndex < 0) return "Peak" // projected future day — no live "now" anchor
    const h = peakIdx - view.nowIndex
    return h > 0 ? `Peaks in ${h}h` : h === 0 ? "Peaks now" : "Peaked"
  })()

  const scrub =
    active === null
      ? null
      : (() => {
          const cur = primary.values[active]
          const prev = active > 0 ? primary.values[active - 1] : cur
          const delta = cur - prev
          const dir: "up" | "down" | "flat" = Math.abs(delta) < 1e-6 ? "flat" : delta > 0 ? "up" : "down"
          const peakRel =
            active === peakIdx ? "at peak" : active < peakIdx ? `peak in ${peakIdx - active}${unit}` : "past peak"
          return { head: view.tooltipHead(active).split(" · ")[0], dir, peakRel }
        })()

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary/20 px-4 py-3">
      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider",
          tone,
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", MEASURE_DOT[view.headline.tone])} aria-hidden="true" />
        {view.headline.status}
      </span>

      {scrub && active !== null ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">{scrub.head}</span>
            {view.series.map((serie) => (
              <span
                key={serie.label}
                className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground"
              >
                <span className="inline-block h-0.5 w-3 rounded-sm" style={{ background: serie.color }} aria-hidden="true" />
                <span className="font-semibold text-foreground">{serie.format(serie.values[active])}</span>
              </span>
            ))}
            <TrendPill dir={scrub.dir} />
            <span
              className={cn(
                "flex items-center gap-1 font-mono text-[0.625rem] uppercase tracking-wider",
                scrub.peakRel === "past peak" ? "text-muted-foreground" : MEASURE_TEXT[view.headline.tone],
              )}
            >
              {scrub.peakRel}
            </span>
          </div>
          {view.scrubComment ? (
            <p className="flex items-center gap-1.5 text-pretty text-xs leading-snug text-foreground/80">
              <Sparkles className="h-3 w-3 shrink-0 text-signal" aria-hidden="true" />
              {view.scrubComment(active)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="min-w-0 flex-1 text-pretty text-sm leading-snug text-foreground/90">{view.headline.comment}</p>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Sunrise / sunset window — solar views only */}
        {view.sunWindow ? (
          <span
            className="hidden items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1 sm:flex"
            title="Sunrise · sunset"
          >
            <Sunrise className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="flex flex-col leading-none">
              <span className="font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">Sun</span>
              <span className="mt-0.5 font-mono text-xs font-bold tabular-nums text-foreground">
                {isoClock(view.sunWindow.sunrise)}–{isoClock(view.sunWindow.sunset)}
              </span>
            </span>
          </span>
        ) : null}

        {/* Upcoming peak highlight — colour-coded to the metric's severity */}
        <span
          className={cn(
            "flex items-center gap-2 rounded-md border px-2.5 py-1",
            MEASURE_CHIP[view.headline.tone],
          )}
          title={`Predicted peak: ${peakValue} at ${peakTime} (${peakLabel})`}
        >
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex flex-col leading-none">
            <span className="font-mono text-[0.5rem] uppercase tracking-wider opacity-80">{peakLabel}</span>
            <span className="mt-0.5 font-mono text-xs font-bold tabular-nums">
              {peakValue} · {peakTime}
            </span>
          </span>
        </span>
      </div>
    </div>
  )
}

function TrendPill({ dir }: { dir: "up" | "down" | "flat" }) {
  const cfg =
    dir === "up"
      ? { Icon: ArrowUpRight, text: "Rising", cls: "text-signal" }
      : dir === "down"
        ? { Icon: ArrowDownRight, text: "Easing", cls: "text-accent" }
        : { Icon: Minus, text: "Steady", cls: "text-muted-foreground" }
  const { Icon } = cfg
  return (
    <span className={cn("flex items-center gap-1 font-mono text-[0.625rem] uppercase tracking-wider", cfg.cls)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.text}
    </span>
  )
}

function TimingCard({ hl, direction }: { hl: Highlight; direction: "up" | "down" }) {
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight
  const tone = direction === "up" ? "text-signal" : "text-accent"
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2.5">
      <p className="flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        <Icon className={cn("h-3 w-3", tone)} aria-hidden="true" />
        {hl.label}
      </p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">{hl.value}</p>
      <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">{hl.when}</p>
    </div>
  )
}

/* ---------------- chart ---------------- */

const W = 1000
const H = 360
const TOP = 30
const BOT = 34
  /** Left gutter (in viewBox units) reserved for the auto-scaled Y-axis labels. */
 const AXIS_PAD = 30

/** Compact numeric axis tick — units live in the legend/footer, so labels stay short and unclipped. */
function tickLabel(v: number): string {
  const r = Math.round(v)
  if (Math.abs(r) >= 1000) return `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}k`
  return String(r)
}

/** Round a raw interval up to a friendly 1 / 2 / 5 × 10ⁿ step for axis ticks. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

/**
 * Auto-scale a series to friendly rounded bounds with a little headroom, so each
 * line sits inside a clean, human-readable range instead of hugging the canvas edges.
 */
function niceBounds(values: number[]): { lo: number; hi: number } {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { lo: 0, hi: 1 }
  let min = Math.min(...finite)
  let max = Math.max(...finite)
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1
    return { lo: min - pad, hi: max + pad }
  }
  const step = niceStep((max - min) / 4)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  return { lo, hi: hi === lo ? lo + step : hi }
}

function TrendChart({
  view,
  active,
  onActive,
  layers,
}: {
  view: View
  active: number | null
  onActive: (i: number | null) => void
  layers?: DniLayers
}) {
  const { n, series, xLabels, boundary, nowIndex, bars, cloudArea, rightAxis } = view
  // Visibility toggles (Solar DNI tab only): scale math still uses every series so
  // axes stay put; only the drawn paths / layers are hidden when a toggle is off.
  const seriesVisible = (serie: Series) => !layers || !serie.toggleKey || layers[serie.toggleKey]
  const cloudVisible = !layers || layers.clouds
  const rainVisible = !layers || layers.rain
  const hasRight = !!rightAxis && series.some((s) => s.axis === "right")
  // Leave a matching gutter on the right when a secondary axis is shown.
  const plotL = AXIS_PAD
  const plotR = hasRight ? W - AXIS_PAD : W
  const plotW = plotR - plotL
  const px = (i: number) => (n <= 1 ? plotL : plotL + (i / (n - 1)) * plotW)
  // Half the gap between samples, used to size the cloud-cover bars.
  const barHalf = n <= 1 ? plotW / 2 : (plotW / (n - 1)) * 0.34

  // Resolve each series' scale. Lines sharing a `group` share one auto-scaled range
  // (so same-unit series — e.g. DNI model vs AI beam — compare truthfully), while
  // right-axis lines borrow the view's fixed secondary range. Everything else keeps
  // its own friendly rounded bounds so it fills the canvas cleanly.
  const groupBounds = new Map<string, { lo: number; hi: number }>()
  for (const g of new Set(series.filter((s) => s.group).map((s) => s.group as string))) {
    const vals = series.filter((s) => s.group === g).flatMap((s) => s.values)
    groupBounds.set(g, niceBounds(vals))
  }
  const bounds = series.map((serie) => {
    if (serie.axis === "right" && rightAxis) return { lo: rightAxis.lo, hi: rightAxis.hi }
    if (serie.group && groupBounds.has(serie.group)) return groupBounds.get(serie.group) as { lo: number; hi: number }
    return niceBounds(serie.values)
  })
  const normed = series.map((serie, si) => {
    const { lo, hi } = bounds[si]
    const span = hi - lo || 1
    return serie.values.map((v) => TOP + (1 - (v - lo) / span) * (H - TOP - BOT))
  })

  // Left Y-axis ticks — labelled in the primary (left-axis) series' own unit.
  const gridFracs = [0, 0.25, 0.5, 0.75, 1]
  const primaryLeft = series.findIndex((s) => s.axis !== "right")
  const primaryBounds = bounds[primaryLeft < 0 ? 0 : primaryLeft]
  const primaryFmt = series[primaryLeft < 0 ? 0 : primaryLeft].format
  const axisTicks = gridFracs.map((f) => ({
    f,
    y: TOP + f * (H - TOP - BOT),
    value: primaryBounds.hi - f * (primaryBounds.hi - primaryBounds.lo),
  }))
  // Right Y-axis ticks — the secondary percentage range (transmittance + cloud deck).
  const rightTicks = hasRight
    ? gridFracs.map((f) => ({
        f,
        y: TOP + f * (H - TOP - BOT),
        value: rightAxis!.hi - f * (rightAxis!.hi - rightAxis!.lo),
      }))
    : []

  const segment = (ys: number[], from: number, to: number) => {
    if (to <= from) return ""
    return ys
      .slice(from, to + 1)
      .map((y, k) => `${k === 0 ? "M" : "L"}${px(from + k).toFixed(1)} ${y.toFixed(1)}`)
      .join(" ")
  }

  const solidTo = Math.max(0, Math.min(boundary, n - 1))
  const primary = normed[0]
  const areaBase = `${segment(primary, 0, n - 1)} L${W} ${H} L0 ${H} Z`

  const activeIdx = active
  const tooltipLeft = activeIdx === null ? 0 : (activeIdx / (n - 1)) * 100

  return (
    <div className="relative px-2 pt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[20rem] w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.map((s) => s.label).join(", ")} trend`}
      >
        <defs>
          <linearGradient id="live-trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TREND.primary} stopOpacity="0.22" />
            <stop offset="100%" stopColor={TREND.primary} stopOpacity="0" />
          </linearGradient>
          {/* soft neon bloom so the bright lines read vividly against the dark chassis */}
          <filter id="live-trend-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* baseline grid — spans the plot area beside the Y-axis gutter */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={plotL}
            y1={TOP + f * (H - TOP - BOT)}
            x2={W}
            y2={TOP + f * (H - TOP - BOT)}
            stroke="var(--border)"
            strokeWidth="1"
            opacity={f === 0 || f === 1 ? 0.7 : 1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Left Y-axis tick labels — auto-scaled to the primary left-axis series' unit */}
        {axisTicks.map((tick) => (
          <text
            key={tick.f}
            x={plotL - 3}
            y={Math.min(H - 2, Math.max(9, tick.y + 3))}
            textAnchor="end"
            className="fill-muted-foreground font-mono"
            style={{ fontSize: "11px" }}
          >
            {tickLabel(tick.value)}
          </text>
        ))}

        {/* Right Y-axis tick labels — secondary percentage range (transmittance + cloud deck) */}
        {rightTicks.map((tick) => (
          <text
            key={`r-${tick.f}`}
            x={plotR + 3}
            y={Math.min(H - 2, Math.max(9, tick.y + 3))}
            textAnchor="start"
            className="fill-muted-foreground font-mono"
            style={{ fontSize: "11px" }}
          >
            {rightAxis!.format(tick.value)}
          </text>
        ))}

        {/* NCM Ghaith #trajectory cloud deck — soft gray/silver filled area, drawn behind everything */}
        {cloudArea && cloudVisible
          ? (() => {
              // Share the right-hand % axis when present so the cloud deck reads against
              // the same 0–100% scale as transmittance; otherwise fall back to its own max.
              const cloudHi = hasRight ? rightAxis!.hi : cloudArea.max
              const ys = cloudArea.values.map(
                (v) => H - BOT - (Math.min(Math.max(v, 0), cloudHi) / cloudHi) * (H - TOP - BOT),
              )
              if (ys.length < 2) return null
              const top = ys.map((y, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)} ${y.toFixed(1)}`).join(" ")
              const area = `${top} L${px(n - 1).toFixed(1)} ${(H - BOT).toFixed(1)} L${px(0).toFixed(1)} ${(H - BOT).toFixed(1)} Z`
              return (
                <>
                  <path d={area} fill={cloudArea.color} opacity={0.14} />
                  <path
                    d={top}
                    fill="none"
                    stroke={cloudArea.color}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )
            })()
          : null}

        {/* optional bar layer (e.g. on-site cloud cover %) drawn behind the lines */}
        {bars && rainVisible
          ? bars.values.map((v, i) => {
              if (!Number.isFinite(v) || v <= 0) return null
              const h = (Math.min(v, bars.max) / bars.max) * (H - TOP - BOT)
              return (
                <rect
                  key={`bar-${i}`}
                  x={(px(i) - barHalf).toFixed(1)}
                  y={(H - BOT - h).toFixed(1)}
                  width={(barHalf * 2).toFixed(1)}
                  height={h.toFixed(1)}
                  rx="1.5"
                  fill={bars.color}
                  opacity={0.16 + 0.14 * (Math.min(v, bars.max) / bars.max)}
                />
              )
            })
          : null}

        {/* soft area under the primary series */}
        {seriesVisible(series[0]) ? <path d={areaBase} fill="url(#live-trend-area)" /> : null}

        {/* projected region shading */}
        {boundary < n - 1 ? (
          <rect x={px(boundary)} y={0} width={W - px(boundary)} height={H} fill="var(--foreground)" opacity="0.03" />
        ) : null}

        {/* each series: solid NCM-mirror line, or a fully dotted Open-Meteo AI-prediction line */}
        {normed.map((ys, si) => {
          const serie = series[si]
          if (!seriesVisible(serie)) return null
          // Live (solid) reading renders bold; the AI-projected segment stays a thin dotted overlay.
          const solidWidth = si === 0 ? 3.5 : 2.5
          const projWidth = si === 0 ? 2 : 1.75
          if (serie.dashed) {
            return (
              <g key={serie.label} filter="url(#live-trend-glow)">
                <path
                  d={segment(ys, 0, n - 1)}
                  fill="none"
                  stroke={serie.color}
                  strokeWidth={projWidth}
                  strokeDasharray="1.5 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.9}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          }
          return (
            <g key={serie.label} filter="url(#live-trend-glow)">
              <path
                d={segment(ys, 0, solidTo)}
                fill="none"
                stroke={serie.color}
                strokeWidth={solidWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={1}
                vectorEffect="non-scaling-stroke"
              />
              {boundary < n - 1 ? (
                <path
                  d={segment(ys, solidTo, n - 1)}
                  fill="none"
                  stroke={serie.color}
                  strokeWidth={projWidth}
                  strokeDasharray="2 5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={si === 0 ? 0.95 : 0.85}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </g>
          )
        })}

        {/* live "now" marker */}
        {nowIndex >= 0 ? (
          <line
            x1={px(nowIndex)}
            y1={0}
            x2={px(nowIndex)}
            y2={H}
            stroke="var(--signal)"
            strokeWidth="1.5"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* active scrub guide + dots */}
        {activeIdx !== null ? (
          <>
            <line
              x1={px(activeIdx)}
              y1={TOP - 8}
              x2={px(activeIdx)}
              y2={H}
              stroke="var(--foreground)"
              strokeWidth="1"
              opacity="0.4"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={px(activeIdx)} cy={TOP - 8} r="2.5" fill="var(--foreground)" opacity="0.5" />
            {normed.map((ys, si) =>
              seriesVisible(series[si]) ? (
                <g key={series[si].label}>
                  <circle cx={px(activeIdx)} cy={ys[activeIdx]} r="7" fill={series[si].color} opacity="0.15" />
                  <circle
                    cx={px(activeIdx)}
                    cy={ys[activeIdx]}
                    r="3.5"
                    fill="var(--background)"
                    stroke={series[si].color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ) : null,
            )}
          </>
        ) : null}

        {/* hit targets */}
        {Array.from({ length: n }).map((_, i) => (
          <rect
            key={i}
            x={px(i) - W / n / 2}
            y={0}
            width={W / n}
            height={H}
            fill="transparent"
            onMouseEnter={() => onActive(i)}
            onMouseMove={() => onActive(i)}
            onMouseLeave={() => onActive(null)}
          />
        ))}
      </svg>

      {/* rotated axis titles at the chart edges */}
      {view.axisTitles ? (
        <>
          <span className="pointer-events-none absolute left-0 top-1/2 z-[5] -translate-y-1/2 -rotate-90 whitespace-nowrap font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground/70">
            {view.axisTitles.left}
          </span>
          <span className="pointer-events-none absolute right-0 top-1/2 z-[5] -translate-y-1/2 rotate-90 whitespace-nowrap font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground/70">
            {view.axisTitles.right}
          </span>
        </>
      ) : null}

      {/* data-driven event callouts (peak DNI, cloud influx, rain, sunset) */}
      {(view.annotations ?? [])
        .filter((a) => !layers || !a.requires || layers[a.requires])
        .map((a, k) => {
          const leftPct = Math.min(90, Math.max(6, (px(a.i) / W) * 100))
          return (
            <div
              key={`${a.label}-${k}`}
              className="pointer-events-none absolute z-[6] -translate-x-1/2"
              style={{ left: `${leftPct}%`, top: `${6 + (k % 3) * 30}px` }}
            >
              <div className="rounded-md border border-border bg-popover/90 px-2 py-0.5 text-center shadow-md backdrop-blur">
                <p className={cn("font-mono text-[0.5625rem] font-semibold uppercase leading-tight tracking-wider", MEASURE_TEXT[a.tone])}>
                  {a.label}
                </p>
                <p className="font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground">{a.sub}</p>
              </div>
            </div>
          )
        })}

      {/* x-axis labels */}
      <div className="mt-1 flex px-0">
        {xLabels.map((lbl, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 text-center font-mono text-[0.5625rem] tabular-nums",
              i === nowIndex ? "font-bold text-signal" : "text-muted-foreground",
            )}
          >
            {lbl}
          </span>
        ))}
      </div>

      {/* floating tooltip — aligns the scrubbed point with the trend's peak / trough */}
      {activeIdx !== null
        ? (() => {
            const headLabel = view.tooltipHead(activeIdx).split(" · ")[0]
            const status =
              activeIdx === nowIndex
                ? { label: "Live", text: "text-signal", dot: "bg-signal" }
                : activeIdx > boundary
                  ? { label: n > 24 ? "Extended" : "Projected", text: "text-accent", dot: "bg-accent" }
                  : { label: "Forecast", text: "text-muted-foreground", dot: "bg-muted-foreground" }
            const atPeak = headLabel === view.peak.when
            const atTrough = headLabel === view.trough.when
            return (
              <div
                className="pointer-events-none absolute top-2 z-10 w-max min-w-[9.5rem] -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-xl backdrop-blur"
                style={{ left: `${Math.min(84, Math.max(16, tooltipLeft))}%` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-foreground">
                    {headLabel}
                  </p>
                  <span className={cn("flex items-center gap-1 font-mono text-[0.5rem] uppercase tracking-wider", status.text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} aria-hidden="true" />
                    {status.label}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {series.filter(seriesVisible).map((serie) => (
                    <span
                      key={serie.label}
                      className="flex items-center justify-between gap-3 font-mono text-[0.625rem] tabular-nums"
                    >
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block h-0.5 w-3 rounded-sm" style={{ background: serie.color }} />
                        {serie.label}
                      </span>
                      <span className="font-semibold text-foreground">{serie.format(serie.values[activeIdx])}</span>
                    </span>
                  ))}
                </div>
                {view.extra ? (
                  <div className="mt-1.5 flex flex-col gap-0.5 border-t border-border pt-1.5">
                    {view.extra(activeIdx).map((row) => (
                      <span
                        key={row.label}
                        className="flex items-center justify-between gap-3 font-mono text-[0.625rem] tabular-nums"
                      >
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-semibold text-foreground">{row.value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-1.5 font-mono text-[0.5rem] uppercase tracking-wider">
                  <span className={cn("flex items-center gap-1", atPeak ? "text-signal" : "text-muted-foreground")}>
                    <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />
                    {view.peak.value} · {view.peak.when}
                  </span>
                  <span className={cn("flex items-center gap-1", atTrough ? "text-accent" : "text-muted-foreground")}>
                    <ArrowDownRight className="h-2.5 w-2.5" aria-hidden="true" />
                    {view.trough.value} · {view.trough.when}
                  </span>
                </div>
              </div>
            )
          })()
        : null}
    </div>
  )
}
