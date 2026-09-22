"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowDownRight, ArrowUpRight, CloudRain, ShieldCheck, Sparkles, Sun, Thermometer, Wind } from "lucide-react"
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

type Series = {
  label: string
  color: string
  values: number[]
  format: (v: number) => string
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
  projectionNote: string
  tooltipHead: (i: number) => string
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
      const n = values.length
      const xLabels = values.map((_, i) => (i % 3 === 0 ? String(i).padStart(2, "0") : ""))
      const nowIndex = selectedDay === 0 ? payload.currentHourIndex : -1
      const boundary = nowIndex >= 0 ? nowIndex : n - 1
      const { hi } = argExtremes(values)
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
      return {
        n,
        boundary,
        nowIndex,
        xLabels,
        tooltipHead: (i) => `${clockLabel(i)}${i === nowIndex ? " · live" : ""}`,
        projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
        series: [{ label: "DNI", color: "var(--signal)", values, format: wm2 }],
        stats: [
          { label: "DNI now", value: wm2(cur), sub: band.label },
          { label: "Peak DNI", value: wm2(day.peakDni), sub: `at ${clockLabel(day.peakHour)}` },
          { label: "Day yield", value: kwh(day.dniEnergy), sub: `${day.sunHours} sun hrs` },
        ],
        peak: { label: "Peak irradiance", value: wm2(values[hi]), when: clockLabel(hi) },
        trough: { label: "Usable window", value: `${day.sunHours} h`, when: `${clockLabel(first)}–${clockLabel(last)}` },
        measures,
      }
    }

    const hours: HourlyReading[] = (payload.hourlyByDay?.[selectedDay] ?? payload.hourly ?? []).slice(0, 24)
    if (hours.length < 2) return null
    const n = hours.length
    const xLabels = hours.map((h, i) => (i % 3 === 0 ? h.time.slice(11, 13) : ""))
    const nowIndex = selectedDay === 0 ? payload.currentHourIndex : -1
    const boundary = nowIndex >= 0 ? nowIndex : n - 1
    const clockAt = (i: number) => clockLabel(Number(hours[i].time.slice(11, 13)))
    const tooltipHead = (i: number) => `${clockAt(i)}${i === nowIndex ? " · live" : ""}`

    if (metric === "comfort") {
      const temps = hours.map((h) => h.temperature)
      const feels = hours.map((h) => h.apparentTemperature)
      const hum = hours.map((h) => h.humidity)
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
        projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
        series: [
          { label: "Temp", color: "var(--signal)", values: temps, format: t },
          { label: "Feels", color: "var(--accent)", values: feels, format: t },
          { label: "Humidity", color: "var(--chart-3)", values: hum, format: pct },
        ],
        stats: [
          { label: "Temperature", value: t(cur.temperature), sub: `peak ${t(Math.max(...temps))}` },
          { label: "Feels like", value: t(cur.apparentTemperature), sub: `Δ ${Math.round(cur.apparentTemperature - cur.temperature)}°` },
          { label: "Humidity", value: pct(cur.humidity), sub: `${pct(Math.min(...hum))}–${pct(Math.max(...hum))}` },
        ],
        peak: { label: "Warmest (feels)", value: t(feels[hi]), when: clockAt(hi) },
        trough: { label: "Coolest (feels)", value: t(feels[lo]), when: clockAt(lo) },
        measures,
      }
    }
    if (metric === "wind") {
      const wind = hours.map((h) => spd(h.windSpeed))
      const gust = hours.map((h) => spd(h.windGusts))
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
        projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
        series: [
          { label: "Wind", color: "var(--signal)", values: wind, format: s },
          { label: "Gusts", color: "var(--accent)", values: gust, format: s },
        ],
        stats: [
          { label: "Wind", value: s(spd(cur.windSpeed)), sub: compass(cur.windDirection) },
          { label: "Gusts", value: s(spd(cur.windGusts)), sub: `peak ${s(Math.max(...gust))}` },
          { label: "Direction", value: compass(cur.windDirection), sub: `${Math.round(cur.windDirection)}°` },
        ],
        peak: { label: "Strongest gust", value: s(gust[hi]), when: clockAt(hi) },
        trough: { label: "Calmest hour", value: s(gust[lo]), when: clockAt(lo) },
        measures,
      }
    }
    const prob = hours.map((h) => h.precipitationProbability)
    const hum = hours.map((h) => h.humidity)
    const total = hours.reduce((sum, h) => sum + h.precipitation, 0)
    const cur = hours[Math.max(0, nowIndex)]
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
      projectionNote: nowIndex >= 0 ? "Solid = live · dashed = AI projection to midnight" : "AI-projected day",
      series: [
        { label: "Rain %", color: "var(--accent)", values: prob, format: pct },
        { label: "Humidity", color: "var(--signal)", values: hum, format: pct },
      ],
      stats: [
        { label: "Rain chance", value: pct(cur.precipitationProbability), sub: `peak ${pct(Math.max(...prob))}` },
        { label: "Precip total", value: `${total.toFixed(1)} ${precipUnit(units)}`, sub: "over the day" },
        { label: "Humidity", value: pct(cur.humidity), sub: `${pct(Math.min(...hum))}–${pct(Math.max(...hum))}` },
      ],
      peak: { label: "Peak rain chance", value: pct(prob[hi]), when: clockAt(hi) },
      trough: { label: "Driest hour", value: pct(prob[lo]), when: clockAt(lo) },
      measures,
    }
  }

  // ---- 14-day extended AI outlook ----
  const daily: DailyReading[] = (payload.daily ?? []).slice(0, 14)
  if (daily.length < 2) return null
  const n = daily.length
  const xLabels = daily.map((d, i) => (i % 2 === 0 ? dayLabel(d.date, i) : ""))
  const nowIndex = 0
  const boundary = Math.min(6, n - 1) // days 0–6 near-term (solid), 7+ extended AI range (dashed)
  const when14 = (i: number) => dayLabel(daily[i].date, i)
  const tooltipHead = (i: number) => `${dayLabel(daily[i].date, i)}${i > boundary ? " · extended" : ""}`
  const projectionNote = "Solid = near-term · dashed = extended AI range (7–14 d)"

  if (metric === "dni") {
    const days: SolarDay[] = (solar?.days ?? []).slice(0, n)
    if (days.length < 2) return null
    const m = days.length
    const yield_ = days.map((d) => d.dniEnergy)
    const ghi = days.map((d) => d.ghiEnergy)
    const { hi, lo } = argExtremes(yield_)
    const dniWhen = (i: number) => dayLabel(days[i].date, i)
    const peakDniMax = Math.max(...days.map((d) => d.peakDni))
    const avg = yield_.reduce((a, b) => a + b, 0) / m
    const excellent = yield_.filter((v) => v >= 7).length
    const measures: Measure[] = []
    measures.push({ tone: "good", text: `Best generation day is ${dniWhen(hi)} (${kwh(yield_[hi])}) — plan peak PV dispatch and pre-clean panels.` })
    if (excellent >= 5) measures.push({ tone: "good", text: `${excellent} of ${m} days rate excellent — sustained high solar resource for the fortnight.` })
    if (yield_[lo] < 5) measures.push({ tone: "warn", text: `Lowest yield on ${dniWhen(lo)} (${kwh(yield_[lo])}) — schedule storage top-ups or maintenance then.` })
    measures.push({ tone: "info", text: "Extended DNI (7–14 d) is AI-projected — treat later days as a planning guide, not a commitment." })
    return {
      n: m,
      boundary: Math.min(6, m - 1),
      nowIndex,
      xLabels: days.map((d, i) => (i % 2 === 0 ? dayLabel(d.date, i) : "")),
      tooltipHead: (i) => `${dayLabel(days[i].date, i)}${i > Math.min(6, m - 1) ? " · extended" : ""}`,
      projectionNote,
      series: [
        { label: "DNI yield", color: "var(--signal)", values: yield_, format: kwh },
        { label: "GHI yield", color: "var(--accent)", values: ghi, format: kwh },
      ],
      stats: [
        { label: "Avg yield · 14d", value: kwh(avg), sub: dniBand(avg).label },
        { label: "Peak DNI", value: wm2(peakDniMax), sub: "beam maximum" },
        { label: "Best day", value: dniWhen(hi), sub: kwh(yield_[hi]) },
      ],
      peak: { label: "Best yield", value: kwh(yield_[hi]), when: dniWhen(hi) },
      trough: { label: "Lowest yield", value: kwh(yield_[lo]), when: dniWhen(lo) },
      measures,
    }
  }

  if (metric === "comfort") {
    const max = daily.map((d) => d.max)
    const min = daily.map((d) => d.min)
    const { hi } = argExtremes(max)
    const { lo } = argExtremes(min)
    const hot = isMetric ? 40 : 104
    const cool = isMetric ? 15 : 59
    const measures: Measure[] = []
    if (max[hi] >= hot) measures.push({ tone: "warn", text: `Hottest day ${when14(hi)} at ${t(max[hi])} — front-load outdoor work to mornings that week.` })
    if (min[lo] <= cool) measures.push({ tone: "info", text: `Coolest night ${when14(lo)} at ${t(min[lo])} — plan a light layer for evenings.` })
    if (measures.length === 0) measures.push({ tone: "good", text: "Stable, comfortable spread across the fortnight." })
    measures.push({ tone: "info", text: "Days 7–14 are AI-projected — use for planning, confidence narrows nearer the date." })
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote,
      series: [
        { label: "High", color: "var(--signal)", values: max, format: t },
        { label: "Low", color: "var(--accent)", values: min, format: t },
      ],
      stats: [
        { label: "Warmest", value: t(max[hi]), sub: when14(hi) },
        { label: "Coolest", value: t(min[lo]), sub: when14(lo) },
        { label: "14-day mean", value: t(max.reduce((a, b) => a + b, 0) / n), sub: "daily high avg" },
      ],
      peak: { label: "Warmest day", value: t(max[hi]), when: when14(hi) },
      trough: { label: "Coolest night", value: t(min[lo]), when: when14(lo) },
      measures,
    }
  }
  if (metric === "wind") {
    const wind = daily.map((d) => spd(d.windMax))
    const gust = daily.map((d) => spd(d.windGustMax))
    const { hi, lo } = argExtremes(gust)
    const gustKmh = daily.map((d) => toKmh(d.windGustMax))
    const gMax = Math.max(...gustKmh)
    const measures: Measure[] = []
    if (gMax >= 75) measures.push({ tone: "bad", text: `Damaging gusts expected ${when14(hi)} — secure sites and reschedule crane or high-profile work.` })
    else if (gMax >= 50) measures.push({ tone: "warn", text: `Strong winds and blowing dust peak ${when14(hi)} — plan for reduced visibility and secure loose material.` })
    else measures.push({ tone: "good", text: "No high-wind days flagged across the fortnight." })
    measures.push({ tone: "info", text: "Days 7–14 are AI-projected — treat later wind peaks as indicative." })
    return {
      n,
      boundary,
      nowIndex,
      xLabels,
      tooltipHead,
      projectionNote,
      series: [
        { label: "Wind max", color: "var(--signal)", values: wind, format: s },
        { label: "Gust max", color: "var(--accent)", values: gust, format: s },
      ],
      stats: [
        { label: "Peak gust", value: s(gust[hi]), sub: when14(hi) },
        { label: "Windiest", value: s(Math.max(...wind)), sub: "daily sustained" },
        { label: "Calmest", value: s(Math.min(...wind)), sub: "daily sustained" },
      ],
      peak: { label: "Peak gust", value: s(gust[hi]), when: when14(hi) },
      trough: { label: "Calmest day", value: s(gust[lo]), when: when14(lo) },
      measures,
    }
  }
  const prob = daily.map((d) => d.precipitationProbability)
  const rain = daily.map((d) => d.precipitationSum)
  const { hi } = argExtremes(rain)
  const { lo } = argExtremes(prob)
  const wetDays = prob.filter((p) => p >= 40).length
  const measures: Measure[] = []
  if (rain[hi] > 0 && prob[hi] >= 50) measures.push({ tone: "warn", text: `Wettest day ${when14(hi)} (${rain[hi].toFixed(1)} ${precipUnit(units)}) — plan for wet-weather logistics and drainage checks.` })
  if (wetDays === 0) measures.push({ tone: "good", text: "Dry fortnight — no significant rain days flagged." })
  else measures.push({ tone: "info", text: `${wetDays} day(s) carry ≥ 40% rain chance — keep flexible outdoor scheduling.` })
  measures.push({ tone: "info", text: "Days 7–14 are AI-projected — rainfall confidence narrows nearer the date." })
  return {
    n,
    boundary,
    nowIndex,
    xLabels,
    tooltipHead,
    projectionNote,
    series: [
      { label: "Rain %", color: "var(--accent)", values: prob, format: pct },
      { label: "Humidity", color: "var(--signal)", values: daily.map((d) => d.humidityMean), format: pct },
    ],
    stats: [
      { label: "Wettest day", value: `${rain[hi].toFixed(1)} ${precipUnit(units)}`, sub: when14(hi) },
      { label: "Rain days", value: `${wetDays}`, sub: "≥ 40% chance" },
      { label: "Peak chance", value: pct(Math.max(...prob)), sub: "across 14 days" },
    ],
    peak: { label: "Wettest day", value: `${rain[hi].toFixed(1)} ${precipUnit(units)}`, when: when14(hi) },
    trough: { label: "Driest day", value: pct(prob[lo]), when: when14(lo) },
    measures,
  }
}

async function solarFetcher(url: string): Promise<SolarPayload> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Solar reading failed.")
  return response.json()
}

export function AiPrediction() {
  const { payload, units, selectedDay, setSelectedDay, location, isValidating } = useWeather()
  const [horizon, setHorizon] = useState<Horizon>("24h")
  const [metric, setMetric] = useState<MetricKey>("comfort")
  const [active, setActive] = useState<number | null>(null)

  // Beam-irradiance model powers the Solar DNI tab — fetched once for 14 days,
  // then sliced client-side so it also feeds the 14-day horizon.
  const solarKey = location ? `/api/solar?lat=${location.latitude}&lon=${location.longitude}&days=14` : null
  const { data: solar } = useSWR<SolarPayload>(solarKey, solarFetcher, {
    refreshInterval: 3 * 60 * 1000,
    keepPreviousData: true,
  })

  const view = useMemo(
    () => (payload ? buildView(payload, units, horizon, metric, selectedDay, solar) : null),
    [payload, units, horizon, metric, selectedDay, solar],
  )

  const daily = payload?.daily ?? []
  const dayCount = horizon === "24h" ? Math.min(7, daily.length) : Math.min(14, daily.length)
  const dniLoading = metric === "dni" && !solar

  if (!payload) {
    return <Panel className="h-[38rem] animate-pulse p-0" />
  }

  return (
    <Panel className="station-rise flex flex-col overflow-hidden p-0">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-signal/15 text-signal">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">AI Prediction</h2>
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {location?.name ?? "Location"} · EmiratesConsensus
            </p>
          </div>
          <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-signal sm:inline-flex">
            <span className={cn("h-1.5 w-1.5 rounded-full bg-signal", isValidating && "animate-pulse")} aria-hidden="true" />
            {isValidating ? "Syncing" : "Live"}
          </span>
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
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          {dniLoading ? "Loading irradiance model…" : "No prediction data for this location."}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-px bg-border">
            {view.stats.map((stat) => (
              <div key={stat.label} className="bg-panel px-3 py-3 sm:px-4">
                <p className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">{stat.value}</p>
                <p className="mt-0.5 font-mono text-[0.625rem] tabular-nums text-muted-foreground">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Trend chart */}
          <TrendChart view={view} active={active} onActive={setActive} />

          {/* Legend + projection note */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
              {view.series.map((serie) => (
                <span key={serie.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded-sm" style={{ background: serie.color }} />
                  {serie.label}
                </span>
              ))}
            </div>
            <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
              {view.projectionNote}
            </span>
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

          {/* Day selector — drives the shared selected day for the hour-by-hour breakdown below */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-3">
            {daily.slice(0, dayCount).map((day, index) => {
              const on = index === selectedDay
              const { level } = buildDailyAlert(day, units)
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    setSelectedDay(index)
                    if (horizon === "24h") setActive(null)
                  }}
                  aria-pressed={on}
                  aria-label={`Select ${dayLabel(day.date, index)}`}
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
                  <span className={cn("h-1.5 w-1.5 rounded-full", ALERT_DOT[level])} title={`Safety: ${level}`} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </>
      )}

      <p className="border-t border-border px-4 py-2 text-center font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        Multi-model blend · {MODEL_NETWORK}
      </p>
    </Panel>
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

const W = 760
const H = 220
const TOP = 26
const BOT = 28

function TrendChart({
  view,
  active,
  onActive,
}: {
  view: View
  active: number | null
  onActive: (i: number | null) => void
}) {
  const { n, series, xLabels, boundary, nowIndex } = view
  const px = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)

  // Normalise each series to its own range so multi-unit lines share one canvas.
  const normed = series.map((serie) => {
    const finite = serie.values.filter((v) => Number.isFinite(v))
    const min = Math.min(...finite)
    const max = Math.max(...finite)
    const span = max - min || 1
    return serie.values.map((v) => TOP + (1 - (v - min) / span) * (H - TOP - BOT))
  })

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
        className="h-56 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.map((s) => s.label).join(", ")} trend`}
      >
        <defs>
          <linearGradient id="ai-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            y1={TOP + f * (H - TOP - BOT)}
            x2={W}
            y2={TOP + f * (H - TOP - BOT)}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* soft area under the primary series */}
        <path d={areaBase} fill="url(#ai-area)" />

        {/* projected region shading */}
        {boundary < n - 1 ? (
          <rect
            x={px(boundary)}
            y={0}
            width={W - px(boundary)}
            height={H}
            fill="var(--foreground)"
            opacity="0.03"
          />
        ) : null}

        {/* each series: solid (near-term) + dashed (AI projection) */}
        {normed.map((ys, si) => (
          <g key={series[si].label}>
            <path
              d={segment(ys, 0, solidTo)}
              fill="none"
              stroke={series[si].color}
              strokeWidth={si === 0 ? 2.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={si === 0 ? 1 : 0.85}
              vectorEffect="non-scaling-stroke"
            />
            {boundary < n - 1 ? (
              <path
                d={segment(ys, solidTo, n - 1)}
                fill="none"
                stroke={series[si].color}
                strokeWidth={si === 0 ? 2.5 : 2}
                strokeDasharray="2 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={si === 0 ? 0.9 : 0.7}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </g>
        ))}

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
              y1={0}
              x2={px(activeIdx)}
              y2={H}
              stroke="var(--foreground)"
              strokeWidth="1"
              opacity="0.4"
              vectorEffect="non-scaling-stroke"
            />
            {normed.map((ys, si) => (
              <circle
                key={series[si].label}
                cx={px(activeIdx)}
                cy={ys[activeIdx]}
                r="3.5"
                fill="var(--background)"
                stroke={series[si].color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
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

      {/* floating tooltip */}
      {activeIdx !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-xl backdrop-blur"
          style={{ left: `${Math.min(88, Math.max(12, tooltipLeft))}%` }}
        >
          <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-foreground">
            {view.tooltipHead(activeIdx)}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {series.map((serie) => (
              <span key={serie.label} className="flex items-center justify-between gap-3 font-mono text-[0.625rem] tabular-nums">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-0.5 w-3 rounded-sm" style={{ background: serie.color }} />
                  {serie.label}
                </span>
                <span className="font-semibold text-foreground">{serie.format(serie.values[activeIdx])}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
