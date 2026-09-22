"use client"

import { useMemo } from "react"
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  Clock,
  CloudRain,
  Droplets,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react"
import { Panel } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import {
  compass,
  describeCode,
  formatClock,
  formatWeekday,
  precipUnit,
  speedUnit,
  tempUnit,
  uvBand,
  type HourlyReading,
  type Units,
  type WeatherPayload,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

type Tone = "good" | "moderate" | "warn" | "bad"

const TONE: Record<Tone, { text: string; chip: string; dot: string; rail: string }> = {
  good: {
    text: "text-alert-green",
    chip: "border-alert-green/40 bg-alert-green/10 text-alert-green",
    dot: "bg-alert-green",
    rail: "bg-alert-green",
  },
  moderate: {
    text: "text-signal",
    chip: "border-signal/40 bg-signal/10 text-signal",
    dot: "bg-signal",
    rail: "bg-signal",
  },
  warn: {
    text: "text-alert-orange",
    chip: "border-alert-orange/40 bg-alert-orange/10 text-alert-orange",
    dot: "bg-alert-orange",
    rail: "bg-alert-orange",
  },
  bad: {
    text: "text-alert-red",
    chip: "border-alert-red/50 bg-alert-red/10 text-alert-red",
    dot: "bg-alert-red",
    rail: "bg-alert-red",
  },
}

type Row = { kind: "high" | "low" | "when"; label: string; time: string; value: string }
type Brief = {
  id: string
  domain: string
  icon: LucideIcon
  tone: Tone
  status: string
  comment: string
  rows: Row[]
  measure: string
}

/** Parse an Open-Meteo naive local timestamp to minutes-past-midnight (wall clock). */
function clockMinutes(value: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(value ?? "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function formatMinutes(mins: number): string {
  const h24 = Math.round(mins / 60) % 24
  const suffix = h24 < 12 ? "AM" : "PM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12} ${suffix}`
}

/** argmax / argmin over an hourly window by a selector. */
function extrema(hours: HourlyReading[], sel: (h: HourlyReading) => number) {
  let hi = hours[0]
  let lo = hours[0]
  for (const h of hours) {
    if (sel(h) > sel(hi)) hi = h
    if (sel(h) < sel(lo)) lo = h
  }
  return { hi, lo }
}

/**
 * Turns the live 24-hour curve and the 14-day model into plain-language, timed
 * advisories: what happens, when it peaks/bottoms, and the measure to take. Every
 * threshold is unit-aware and mirrors the safety model's bands.
 */
function buildBriefs(data: WeatherPayload): Brief[] {
  const { hourly, daily, units } = data
  const u = tempUnit(units)
  const hot = units === "metric" ? 33 : 91
  const gustStrong = units === "metric" ? 40 : 25
  const gustHigh = units === "metric" ? 60 : 37
  const briefs: Brief[] = []

  // 1 · Temperature — highest & lowest of the day, with the feels-like at the peak.
  const t = extrema(hourly, (h) => h.temperature)
  const apparentPeak = Math.max(...hourly.map((h) => h.apparentTemperature))
  const heatTone: Tone =
    apparentPeak >= hot + 6 ? "bad" : apparentPeak >= hot ? "warn" : apparentPeak >= hot - 6 ? "moderate" : "good"
  briefs.push({
    id: "temp",
    domain: "Ambient temperature",
    icon: Thermometer,
    tone: heatTone,
    status: heatTone === "good" ? "Comfortable" : heatTone === "moderate" ? "Warm" : "Heat stress",
    comment:
      heatTone === "good"
        ? "Pleasant through the day — no heat stress expected."
        : heatTone === "moderate"
          ? "Warms up around midday but stays manageable."
          : `Ambient temperature runs high — feels like ${Math.round(apparentPeak)}${u} at the peak.`,
    rows: [
      {
        kind: "high",
        label: "Hottest",
        time: formatClock(t.hi.time, false),
        value: `${Math.round(t.hi.temperature)}${u} · feels ${Math.round(t.hi.apparentTemperature)}${u}`,
      },
      {
        kind: "low",
        label: "Coolest",
        time: formatClock(t.lo.time, false),
        value: `${Math.round(t.lo.temperature)}${u}`,
      },
    ],
    measure:
      heatTone === "good"
        ? "Great window for outdoor plans — light clothing, stay hydrated on exertion."
        : heatTone === "moderate"
          ? `Best outdoors before ${formatClock(t.lo.time, false)}. Carry water and take shade breaks midday.`
          : `Avoid strenuous activity around ${formatClock(t.hi.time, false)}. Hydrate every 20 min, seek shade, check on vulnerable people.`,
  })

  // 2 · Rain & sky — onset and peak chance across the next 24 h.
  const onset = hourly.find((h) => h.precipitationProbability >= 40 || h.precipitation > 0.2)
  const wettest = extrema(hourly, (h) => h.precipitationProbability).hi
  const rainSum = hourly.reduce((s, h) => s + h.precipitation, 0)
  const maxProb = wettest.precipitationProbability
  const wet = Boolean(onset) || rainSum > 0.5
  const rainTone: Tone = maxProb >= 70 || rainSum >= 10 ? "warn" : wet ? "moderate" : "good"
  briefs.push({
    id: "rain",
    domain: "Rain & sky",
    icon: CloudRain,
    tone: rainTone,
    status: wet ? "Rain likely" : "Dry",
    comment: wet
      ? onset
        ? `Wet spell developing — showers from around ${formatClock(onset.time, false)}.`
        : "Passing showers possible through the day."
      : "Dry skies — no meaningful rain in the next 24 hours.",
    rows: wet
      ? [
          {
            kind: "when",
            label: "Onset",
            time: onset ? formatClock(onset.time, false) : "—",
            value: onset ? `${onset.precipitationProbability}% chance` : "—",
          },
          {
            kind: "high",
            label: "Peak chance",
            time: formatClock(wettest.time, false),
            value: `${maxProb}% · ${rainSum.toFixed(1)} ${precipUnit(units)} total`,
          },
        ]
      : [
          {
            kind: "when",
            label: "Peak chance",
            time: formatClock(wettest.time, false),
            value: `${maxProb}%`,
          },
        ],
    measure: wet
      ? `Carry rain cover${onset ? ` before ${formatClock(onset.time, false)}` : ""}, allow extra travel time, and avoid low-lying roads if it turns heavy.`
      : "No rain gear needed — safe to leave the umbrella at home.",
  })

  // 3 · Wind & gusts — peak gust and calmest hour.
  const g = extrema(hourly, (h) => h.windGusts)
  const gustPeak = g.hi.windGusts
  const windTone: Tone = gustPeak >= gustHigh ? "bad" : gustPeak >= gustStrong ? "warn" : gustPeak >= gustStrong * 0.6 ? "moderate" : "good"
  briefs.push({
    id: "wind",
    domain: "Wind & gusts",
    icon: Wind,
    tone: windTone,
    status: windTone === "good" ? "Light" : windTone === "moderate" ? "Breezy" : "Windy",
    comment:
      windTone === "good"
        ? "Calm air all day — no wind concerns."
        : `Peak gusts to ${Math.round(gustPeak)} ${speedUnit(units)} from the ${compass(g.hi.windDirection)} around ${formatClock(g.hi.time, false)}.`,
    rows: [
      {
        kind: "high",
        label: "Peak gust",
        time: formatClock(g.hi.time, false),
        value: `${Math.round(gustPeak)} ${speedUnit(units)} ${compass(g.hi.windDirection)}`,
      },
      {
        kind: "low",
        label: "Calmest",
        time: formatClock(g.lo.time, false),
        value: `${Math.round(g.lo.windGusts)} ${speedUnit(units)}`,
      },
    ],
    measure:
      windTone === "good"
        ? "Fine for drones, awnings and outdoor setups."
        : `Secure loose outdoor items ahead of ${formatClock(g.hi.time, false)}; take care with high-profile vehicles and rooftop work.`,
  })

  // 4 · Sun & UV — peak UV around solar noon, from the daily model + daylight window.
  const today = daily[0]
  const uvMax = today?.uvIndexMax ?? 0
  const band = uvBand(uvMax)
  const noonMin =
    today && clockMinutes(today.sunrise) != null && clockMinutes(today.sunset) != null
      ? (clockMinutes(today.sunrise)! + clockMinutes(today.sunset)!) / 2
      : 12 * 60
  const uvTone: Tone = band.tone
  briefs.push({
    id: "uv",
    domain: "Sun & UV",
    icon: Sun,
    tone: uvTone,
    status: band.label,
    comment:
      uvMax >= 6
        ? `Strong sun midday — UV index peaks at ${uvMax.toFixed(0)} (${band.label.toLowerCase()}).`
        : `Gentle sun today — UV index tops out at ${uvMax.toFixed(0)}.`,
    rows: [
      {
        kind: "high",
        label: "Peak UV",
        time: formatMinutes(noonMin),
        value: `Index ${uvMax.toFixed(0)} · ${band.label}`,
      },
      {
        kind: "when",
        label: "Daylight",
        time: today ? formatClock(today.sunrise, false) : "—",
        value: today ? `to ${formatClock(today.sunset, false)}` : "—",
      },
    ],
    measure:
      uvMax >= 6
        ? "Apply SPF 30+, wear sunglasses and a hat, and reapply around midday. Limit direct exposure 11 AM–3 PM."
        : "Minimal sun protection needed for short exposure.",
  })

  return briefs
}

type Highlight = { id: string; label: string; icon: LucideIcon; index: number; weekday: string; value: string; tone: Tone }

/** Standout days across the 14-day model — each jumps the synced breakdown to that day. */
function buildHighlights(data: WeatherPayload): Highlight[] {
  const { daily, units } = data
  const days = daily.slice(0, 14)
  if (days.length === 0) return []
  const u = tempUnit(units)
  const label = (i: number) => (i === 0 ? "Today" : formatWeekday(days[i].date))

  let hot = 0
  let cool = 0
  let windy = 0
  let wet = -1
  for (let i = 0; i < days.length; i++) {
    if (days[i].max > days[hot].max) hot = i
    if (days[i].min < days[cool].min) cool = i
    if (days[i].windGustMax > days[windy].windGustMax) windy = i
    if (days[i].precipitationProbability >= 40 && wet === -1) wet = i
  }

  const items: Highlight[] = [
    {
      id: "hot",
      label: "Hottest day",
      icon: Thermometer,
      index: hot,
      weekday: label(hot),
      value: `${Math.round(days[hot].max)}${u}`,
      tone: "warn",
    },
    {
      id: "cool",
      label: "Coolest day",
      icon: ArrowDown,
      index: cool,
      weekday: label(cool),
      value: `${Math.round(days[cool].min)}${u}`,
      tone: "good",
    },
    {
      id: "windy",
      label: "Windiest day",
      icon: Wind,
      index: windy,
      weekday: label(windy),
      value: `${Math.round(days[windy].windGustMax)} ${speedUnit(units)}`,
      tone: "moderate",
    },
  ]
  if (wet !== -1) {
    items.push({
      id: "wet",
      label: "Next wet day",
      icon: Droplets,
      index: wet,
      weekday: label(wet),
      value: `${days[wet].precipitationProbability}%`,
      tone: "moderate",
    })
  } else {
    items.push({
      id: "dry",
      label: "Rain outlook",
      icon: Sun,
      index: 0,
      weekday: "14 days",
      value: "Dry",
      tone: "good",
    })
  }
  return items
}

const ROW_ICON: Record<Row["kind"], LucideIcon> = { high: ArrowUp, low: ArrowDown, when: Clock }

export function AiBriefing() {
  const { payload, setSelectedDay, isLoading } = useWeather()

  const briefs = useMemo(() => (payload ? buildBriefs(payload) : []), [payload])
  const highlights = useMemo(() => (payload ? buildHighlights(payload) : []), [payload])

  function jumpToDay(index: number) {
    setSelectedDay(index)
    if (typeof document !== "undefined") {
      document.getElementById("hourly")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  if (isLoading && !payload) {
    return <div className="h-72 animate-pulse rounded-xl border border-border bg-panel" />
  }
  if (!payload) return null

  const { current, units } = payload
  const cond = describeCode(current.weatherCode)

  return (
    <Panel className="overflow-hidden p-0">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-signal/15 text-signal">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h2 className="label-caps text-foreground/80">AI Briefing</h2>
          <span className="hidden rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider text-signal sm:inline">
            Timed · what to do &amp; when
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-alert-green opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-alert-green" />
            </span>
            24 h + 14-day model
          </span>
        </span>
      </header>

      {/* Right-now line */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-secondary/20 px-4 py-3">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {Math.round(current.temperature)}
            {tempUnit(units)}
          </span>
          <span className="text-sm text-muted-foreground">
            feels {Math.round(current.apparentTemperature)}
            {tempUnit(units)}
          </span>
        </span>
        <span className="text-sm text-foreground/80">{cond.label}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Droplets className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {current.humidity}% humidity
        </span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wind className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          {Math.round(current.windSpeed)} {speedUnit(units)} {compass(current.windDirection)}
        </span>
        <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          Updated {formatClock(current.time)}
        </span>
      </div>

      {/* 14-day highlights — outlook strip in the header; each opens that day's breakdown */}
      {highlights.length > 0 ? (
        <div className="border-b border-border bg-card/30 px-4 py-3">
          <div className="mb-2.5 flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 text-signal" aria-hidden="true" />
            <span className="label-caps text-foreground/80">14-day highlights</span>
            <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground/60">
              · tap to open a day
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {highlights.map((h) => {
              const tone = TONE[h.tone]
              const Icon = h.icon
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => jumpToDay(h.index)}
                  aria-label={`${h.label}: ${h.weekday}, ${h.value}. Open this day's hourly breakdown.`}
                  className="group relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-signal/40 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                >
                  <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", tone.rail)} />
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md border", tone.chip)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
                      {h.label}
                    </span>
                    <span className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-sm font-semibold leading-none text-foreground">{h.weekday}</span>
                      <span className={cn("text-xs font-bold leading-none tabular-nums", tone.text)}>{h.value}</span>
                    </span>
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-signal"
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Timed advisory cards */}
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {briefs.map((b) => {
          const tone = TONE[b.tone]
          const Icon = b.icon
          return (
            <article key={b.id} className="relative flex flex-col gap-3 bg-card p-4">
              <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-0.5", tone.rail)} />
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", tone.text)} aria-hidden="true" />
                  <span className="label-caps text-muted-foreground">{b.domain}</span>
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider",
                    tone.chip,
                  )}
                >
                  <span className={cn("h-1 w-1 rounded-full", tone.dot)} aria-hidden="true" />
                  {b.status}
                </span>
              </div>

              <p className="text-pretty text-sm leading-relaxed text-foreground/90">{b.comment}</p>

              <dl className="flex flex-col gap-1.5">
                {b.rows.map((r) => {
                  const RowIcon = ROW_ICON[r.kind]
                  return (
                    <div key={r.label} className="flex items-center gap-2 text-xs">
                      <RowIcon
                        className={cn(
                          "h-3 w-3 shrink-0",
                          r.kind === "high" ? "text-signal" : r.kind === "low" ? "text-accent" : "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      />
                      <dt className="w-16 shrink-0 font-mono uppercase tracking-wider text-muted-foreground">{r.label}</dt>
                      <dd className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                        <span className="truncate tabular-nums text-foreground">{r.value}</span>
                        <span className="shrink-0 font-mono tabular-nums text-foreground/70">{r.time}</span>
                      </dd>
                    </div>
                  )
                })}
              </dl>

              <div className="mt-auto flex items-start gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-2">
                <span className="mt-px font-mono text-[0.5rem] uppercase tracking-wider text-signal">Measure</span>
                <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{b.measure}</p>
              </div>
            </article>
          )
        })}
      </div>

      {/* Model provenance */}
      <p className="border-t border-border px-4 py-3 text-[0.625rem] leading-relaxed text-muted-foreground">
        Advisories are derived live from the 24-hour curve and the 14-day multi-model blend (ECMWF, DWD, NOAA,
        Météo-France, JMA, KMA, UK Met Office, BOM). Times are local; values update every few minutes.
      </p>
    </Panel>
  )
}
