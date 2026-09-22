"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { CloudRain, Compass, Droplets, Gauge, Navigation, Sun, Thermometer } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { WeatherIcon } from "@/components/weather/weather-icon"
import { useWeather } from "@/components/weather/weather-provider"
import {
  compass,
  describeCode,
  formatClock,
  formatWeekday,
  precipUnit,
  speedUnit,
  tempUnit,
  toMetersPerSecond,
  type ConditionGroup,
  type HourlyReading,
  type SolarPayload,
  type Units,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

async function fetcher(url: string): Promise<SolarPayload> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Solar reading failed.")
  return response.json()
}

const CHART_W = 720

function avg(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Dominant sky condition across the day for the "Sky Condition" readout. */
const GROUP_LABEL: Record<ConditionGroup, string> = {
  clear: "Clear",
  cloud: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorms",
}

function dominantSky(hours: HourlyReading[]) {
  const counts = new Map<ConditionGroup, number>()
  let topGroup: ConditionGroup = "clear"
  let topCode = 0
  let topCount = 0
  for (const h of hours) {
    const group = describeCode(h.weatherCode).group
    const next = (counts.get(group) ?? 0) + 1
    counts.set(group, next)
    if (next > topCount) {
      topCount = next
      topGroup = group
      topCode = h.weatherCode
    }
  }
  return { group: topGroup, code: topCode, label: GROUP_LABEL[topGroup] }
}

/** Green-intensity tint for a wind cell, scaled by how strong the gust is. */
function windTint(norm: number) {
  const clamped = Math.min(1, Math.max(0, norm))
  return `oklch(0.72 0.17 150 / ${(0.08 + clamped * 0.52).toFixed(3)})`
}

function dayName(date: string, index: number) {
  if (index === 0) return "Today"
  if (index === 1) return "Tomorrow"
  return formatWeekday(date)
}

export function HourlyBreakdown() {
  const { payload, units, selectedDay, location } = useWeather()

  const solarKey = location ? `/api/solar?lat=${location.latitude}&lon=${location.longitude}&days=14` : null
  const { data: solar } = useSWR<SolarPayload>(solarKey, fetcher, {
    refreshInterval: 3 * 60 * 1000,
    keepPreviousData: true,
  })

  const hours = useMemo<HourlyReading[]>(
    () => (payload?.hourlyByDay?.[selectedDay] ?? payload?.hourly ?? []).slice(0, 24),
    [payload, selectedDay],
  )

  if (!payload || hours.length < 2) {
    return <Panel className="h-[40rem] animate-pulse p-0" />
  }

  const isMetric = units === "metric"
  const toDisplaySpeed = (v: number) => (isMetric ? toMetersPerSecond(v) : v)
  const selectedDate = payload.daily[selectedDay]?.date ?? ""
  const label = dayName(selectedDate, selectedDay)
  const nowIdx = selectedDay === 0 ? payload.currentHourIndex : -1
  const updated = formatClock(payload.fetchedAt.replace(/Z$/, ""))

  // -- Temperature + feels-like series --
  const temps = hours.map((h) => h.temperature)
  const feels = hours.map((h) => h.apparentTemperature)
  const lo = Math.min(...temps, ...feels)
  const hi = Math.max(...temps, ...feels)
  const span = hi - lo || 1
  const peakTemp = Math.max(...temps)
  const peakTempIdx = temps.indexOf(peakTemp)
  const feelsPeak = Math.max(...feels)

  const step = CHART_W / hours.length
  const tempH = 190
  const tempPad = 30
  const mapTemp = (t: number) => tempPad + (1 - (t - lo) / span) * (tempH - tempPad * 2)
  const feelsPath = hours
    .map((_, i) => `${i === 0 ? "M" : "L"}${((i + 0.5) * step).toFixed(1)} ${mapTemp(feels[i]).toFixed(1)}`)
    .join(" ")

  // -- Precipitation --
  const peakProb = Math.max(0, ...hours.map((h) => h.precipitationProbability))
  const totalPrecip = hours.reduce((sum, h) => sum + h.precipitation, 0)
  const precipMessage =
    peakProb < 10 && totalPrecip < 0.1
      ? "None expected"
      : peakProb >= 60 || totalPrecip >= 2
        ? "Likely — carry cover"
        : "Slight chance"

  // -- Humidity + sky --
  const humidityAvg = avg(hours.map((h) => h.humidity))
  const sky = dominantSky(hours)
  const humLo = Math.min(...hours.map((h) => h.humidity))
  const humHi = Math.max(...hours.map((h) => h.humidity))
  const humSpan = humHi - humLo || 1
  const humH = 60
  const humPath = hours
    .map((h, i) => `${i === 0 ? "M" : "L"}${((i + 0.5) * step).toFixed(1)} ${(8 + (1 - (h.humidity - humLo) / humSpan) * (humH - 16)).toFixed(1)}`)
    .join(" ")

  // -- DNI curve for the selected day --
  const solarDay = solar?.days?.[selectedDay]
  const dni = solarDay?.hourlyDni ?? new Array(24).fill(0)
  const dniPeak = Math.max(1, ...dni)
  const dniPeakVal = solarDay?.peakDni ?? Math.round(Math.max(0, ...dni))
  const dniPeakIdx = dni.indexOf(Math.max(...dni))
  const dniH = 150
  const dniPad = 16
  const mapDni = (v: number) => dniH - dniPad - (v / dniPeak) * (dniH - dniPad * 2)
  const dniLine = dni
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i + 0.5) * step).toFixed(1)} ${mapDni(v).toFixed(1)}`)
    .join(" ")
  const dniArea = `${dniLine} L${((dni.length - 0.5) * step).toFixed(1)} ${dniH} L${(0.5 * step).toFixed(1)} ${dniH} Z`
  const hasDni = dni.some((v) => v > 0)

  // -- Wind + gusts --
  const maxGust = Math.max(1, ...hours.map((h) => toDisplaySpeed(h.windGusts)))

  return (
    <section aria-label="24-hour forecast breakdown" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="flex items-center gap-2 label-caps">
            <Thermometer className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
            {location?.name ?? "Location"} · hour-by-hour
          </span>
          <h2 className="mt-1.5 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {label} · 24-hour forecast breakdown
          </h2>
        </div>
        <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          Last updated {updated}
        </span>
      </div>

      <Panel className="flex flex-col gap-5 p-4 sm:p-5">
        {/* Temperature and Feels-Like */}
        <section aria-label="Temperature and feels-like temperature">
          <SectionHead
            icon={<Thermometer className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Temperature & feels-like"
            meta={`Peaking at ${Math.round(peakTemp)}${tempUnit(units)}`}
          />
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[42rem]">
              <svg
                viewBox={`0 0 ${CHART_W} ${tempH}`}
                className="h-48 w-full overflow-visible"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Hourly temperature, peaking at ${Math.round(peakTemp)} degrees; feels-like peaking at ${Math.round(feelsPeak)} degrees`}
              >
                <defs>
                  <linearGradient id="hb-temp-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--alert-orange)" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="var(--alert-orange)" stopOpacity="0.35" />
                  </linearGradient>
                </defs>
                {hours.map((h, i) => {
                  const y = mapTemp(h.temperature)
                  return (
                    <rect
                      key={h.time}
                      x={(i + 0.5) * step - step * 0.3}
                      y={y}
                      width={step * 0.6}
                      height={tempH - y}
                      rx={2}
                      fill="url(#hb-temp-bar)"
                      opacity={i === peakTempIdx ? 1 : 0.85}
                    />
                  )
                })}
                {/* Feels-like line rides over the bars */}
                <path
                  d={feelsPath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {nowIdx >= 0 ? (
                  <line
                    x1={(nowIdx + 0.5) * step}
                    y1={0}
                    x2={(nowIdx + 0.5) * step}
                    y2={tempH}
                    stroke="var(--signal)"
                    strokeWidth="1.5"
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>
              <HourRow hours={hours} nowIdx={nowIdx} />
            </div>
          </div>
          <Legend
            items={[
              { swatch: "var(--alert-orange)", label: "Temperature" },
              { swatch: "var(--accent)", label: "Feels like", line: true },
            ]}
          />
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Precipitation */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-4">
            <SectionHead
              icon={<CloudRain className="h-3.5 w-3.5" aria-hidden="true" />}
              title="Precipitation"
              meta={`${totalPrecip.toFixed(1)} ${precipUnit(units)} total`}
            />
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-4xl font-bold tabular-nums text-foreground">{Math.round(peakProb)}%</span>
              <span className="text-sm text-muted-foreground">
                Peak chance
                <br />
                <span className="text-foreground">{precipMessage}</span>
              </span>
            </div>
            <div className="mt-1 flex items-end gap-px" aria-hidden="true">
              {hours.map((h) => (
                <span
                  key={h.time}
                  className="flex-1 rounded-t-sm bg-accent/70"
                  style={{ height: `${4 + (h.precipitationProbability / 100) * 34}px` }}
                  title={`${formatClock(h.time, false)} · ${Math.round(h.precipitationProbability)}%`}
                />
              ))}
            </div>
          </div>

          {/* Humidity and Sky */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-4">
            <SectionHead
              icon={<Droplets className="h-3.5 w-3.5" aria-hidden="true" />}
              title="Humidity & sky"
              meta={`Sky: ${sky.label}`}
            />
            <div className="flex items-center gap-3">
              <span className="font-mono text-4xl font-bold tabular-nums text-foreground">
                {Math.round(humidityAvg)}%
              </span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <WeatherIcon code={sky.code} className="h-7 w-7 text-signal" />
                <span>
                  Avg humidity
                  <br />
                  <span className="text-foreground">
                    {Math.round(humLo)}–{Math.round(humHi)}%
                  </span>
                </span>
              </span>
            </div>
            <svg
              viewBox={`0 0 ${CHART_W} ${humH}`}
              className="mt-1 h-14 w-full overflow-visible"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Relative humidity ranging ${Math.round(humLo)} to ${Math.round(humHi)} percent`}
            >
              <path
                d={humPath}
                fill="none"
                stroke="var(--signal)"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        {/* Full-day DNI */}
        <section aria-label="Full-day direct normal irradiance">
          <SectionHead
            icon={<Sun className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Full-day DNI · direct normal irradiance"
            meta={hasDni ? `Peak ${dniPeakVal} W/m²` : "No irradiance data"}
          />
          {hasDni ? (
            <div className="mt-2 overflow-x-auto">
              <div className="min-w-[42rem]">
                <svg
                  viewBox={`0 0 ${CHART_W} ${dniH}`}
                  className="h-36 w-full overflow-visible"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Direct normal irradiance across the day, peaking at ${dniPeakVal} watts per square metre`}
                >
                  <defs>
                    <linearGradient id="hb-dni-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={dniArea} fill="url(#hb-dni-fill)" />
                  <path
                    d={dniLine}
                    fill="none"
                    stroke="var(--signal)"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {dniPeakIdx >= 0 ? (
                    <circle
                      cx={(dniPeakIdx + 0.5) * step}
                      cy={mapDni(dni[dniPeakIdx])}
                      r="3.5"
                      fill="var(--signal)"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </svg>
                <HourRow hours={hours} nowIdx={nowIdx} />
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Irradiance model loading for this day…
            </p>
          )}
        </section>

        {/* Wind + gusts */}
        <section aria-label="Wind and gusts">
          <SectionHead
            icon={<Compass className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Wind & gusts"
            meta={`${speedUnit(units)} · direction of travel`}
          />
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[46rem]">
              {/* Gusts row */}
              <WindRow
                icon={<Gauge className="h-3 w-3" aria-hidden="true" />}
                caption="Gusts"
                hours={hours}
                nowIdx={nowIdx}
                valueOf={(h) => toDisplaySpeed(h.windGusts)}
                maxGust={maxGust}
                isMetric={isMetric}
              />
              {/* Wind row with direction arrows */}
              <WindRow
                icon={<Navigation className="h-3 w-3" aria-hidden="true" />}
                caption="Wind"
                hours={hours}
                nowIdx={nowIdx}
                valueOf={(h) => toDisplaySpeed(h.windSpeed)}
                maxGust={maxGust}
                isMetric={isMetric}
                showArrow
              />
              <HourRow hours={hours} nowIdx={nowIdx} />
            </div>
          </div>
        </section>
      </Panel>
    </section>
  )
}

/* ---------- presentational helpers ---------- */

function SectionHead({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-foreground/80 [&_svg]:text-signal">
        {icon}
        {title}
      </span>
      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">{meta}</span>
    </div>
  )
}

function HourRow({ hours, nowIdx }: { hours: HourlyReading[]; nowIdx: number }) {
  return (
    <div className="mt-1 flex">
      {hours.map((h, i) => (
        <span
          key={h.time}
          className={cn(
            "flex-1 text-center font-mono text-[0.5625rem] tabular-nums",
            i === nowIdx ? "font-bold text-signal" : "text-muted-foreground",
            i % 2 === 1 && "hidden sm:inline",
          )}
        >
          {h.time.slice(11, 13)}
        </span>
      ))}
    </div>
  )
}

function WindRow({
  icon,
  caption,
  hours,
  nowIdx,
  valueOf,
  maxGust,
  isMetric,
  showArrow = false,
}: {
  icon: React.ReactNode
  caption: string
  hours: HourlyReading[]
  nowIdx: number
  valueOf: (h: HourlyReading) => number
  maxGust: number
  isMetric: boolean
  showArrow?: boolean
}) {
  return (
    <div className="flex items-stretch">
      <span className="flex w-14 shrink-0 items-center gap-1 border-r border-border py-1.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground [&_svg]:h-3 [&_svg]:w-3">
        {icon}
        {caption}
      </span>
      <div className="flex flex-1">
        {hours.map((h, i) => {
          const value = valueOf(h)
          return (
            <div
              key={h.time}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5",
                i === nowIdx && "ring-1 ring-inset ring-signal",
              )}
              style={{ background: windTint(value / maxGust) }}
              title={`${h.time.slice(11, 16)} · ${value.toFixed(isMetric ? 1 : 0)} ${compass(h.windDirection)}`}
            >
              {showArrow ? (
                <Navigation
                  aria-hidden="true"
                  className="h-3 w-3 fill-foreground/80 text-foreground/80"
                  style={{ transform: `rotate(${h.windDirection + 180}deg)` }}
                />
              ) : null}
              <span className="font-mono text-[0.625rem] font-semibold tabular-nums text-foreground">
                {value.toFixed(isMetric ? 1 : 0)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend({ items }: { items: { swatch: string; label: string; line?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={cn("inline-block rounded-sm", item.line ? "h-0.5 w-4" : "h-2.5 w-2.5")}
            style={{ background: item.swatch }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
