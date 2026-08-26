"use client"

import { useState } from "react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { WeatherIcon } from "@/components/station/weather-icon"
import { formatClock, precipUnit, speedUnit, tempUnit, type WeatherPayload } from "@/lib/weather"

const WIDTH = 720
const HEIGHT = 150
const PAD_Y = 22

export function HourlyTrend({ data }: { data: WeatherPayload }) {
  const [active, setActive] = useState<number | null>(null)
  const hours = data.hourly
  if (hours.length < 2) return null

  const temps = hours.map((hour) => hour.temperature)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = Math.max(max - min, 1)
  const step = WIDTH / (hours.length - 1)

  const point = (index: number) => ({
    x: index * step,
    y: PAD_Y + (1 - (hours[index].temperature - min) / span) * (HEIGHT - PAD_Y * 2),
  })

  const line = hours.map((_, index) => point(index))
  const path = line.map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
  const area = `${path} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`

  const shown = active ?? 0
  const focus = hours[shown]
  const focusTime = formatClock(focus.time)

  return (
    <Panel className="station-rise">
      <PanelHeader
        title="24-hour trend"
        meta={`${Math.round(min)}${tempUnit(data.units)} → ${Math.round(max)}${tempUnit(data.units)}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-3">
          <WeatherIcon code={focus.weatherCode} isDay={focus.isDay} className="h-6 w-6 text-signal" />
          <div className="font-mono text-sm tabular-nums">
            <span className="text-base">{Math.round(focus.temperature)}</span>
            {tempUnit(data.units)}
            <span className="text-muted-foreground"> · {focusTime}</span>
          </div>
        </div>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {focus.precipitationProbability}% precip · {focus.precipitation.toFixed(1)} {precipUnit(data.units)} ·{" "}
          {Math.round(focus.windSpeed)} {speedUnit(data.units)}
        </p>
      </div>

      <div className="px-2 pb-1 pt-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-40 w-full overflow-visible"
          preserveAspectRatio="none"
          role="img"
          aria-label="Temperature and precipitation probability for the next 24 hours"
        >
          <defs>
            <linearGradient id="temp-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {hours.map((hour, index) => {
            const barHeight = (hour.precipitationProbability / 100) * (HEIGHT - PAD_Y)
            return (
              <rect
                key={`bar-${hour.time}`}
                x={index * step - step * 0.32}
                y={HEIGHT - barHeight}
                width={step * 0.64}
                height={barHeight}
                fill="var(--accent)"
                opacity={active === index ? 0.75 : 0.32}
              />
            )
          })}

          <path d={area} fill="url(#temp-fill)" />
          <path d={path} fill="none" stroke="var(--signal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />

          {active !== null ? (
            <line
              x1={point(active).x}
              y1={0}
              x2={point(active).x}
              y2={HEIGHT}
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <circle cx={point(shown).x} cy={point(shown).y} r="4" fill="var(--signal)" vectorEffect="non-scaling-stroke" />

          {hours.map((hour, index) => (
            <rect
              key={`hit-${hour.time}`}
              x={index * step - step / 2}
              y={0}
              width={step}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              tabIndex={-1}
            />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-8 gap-1 border-t border-border px-3 py-2 font-mono text-[0.625rem] text-muted-foreground tabular-nums">
        {hours
          .filter((_, index) => index % 3 === 0)
          .map((hour) => (
            <span key={hour.time} className="text-center">
              {formatClock(hour.time, false)}
            </span>
          ))}
      </div>
    </Panel>
  )
}
