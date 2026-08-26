import { Cloud, Droplets, Eye, Gauge, Sun, Thermometer } from "lucide-react"
import { Panel, PanelHeader, Readout } from "@/components/station/panel"
import { WeatherIcon } from "@/components/station/weather-icon"
import {
  beaufort,
  compass,
  describeCode,
  distanceUnit,
  formatClock,
  speedUnit,
  tempUnit,
  uvBand,
  type WeatherPayload,
} from "@/lib/weather"

function WindDial({ direction, speed, gusts, units }: { direction: number; speed: number; gusts: number; units: string }) {
  const ticks = Array.from({ length: 24 }, (_, index) => index * 15)

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Wind from the ${compass(direction)}`}>
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" className="text-border" strokeWidth="1" />
          {ticks.map((angle) => {
            const major = angle % 90 === 0
            const radius = major ? 38 : 42
            const radians = ((angle - 90) * Math.PI) / 180
            return (
              <line
                key={angle}
                x1={50 + Math.cos(radians) * 45}
                y1={50 + Math.sin(radians) * 45}
                x2={50 + Math.cos(radians) * radius}
                y2={50 + Math.sin(radians) * radius}
                stroke="currentColor"
                className={major ? "text-muted-foreground" : "text-border"}
                strokeWidth={major ? 1.4 : 1}
              />
            )
          })}
          <g
            style={{ transform: `rotate(${direction}deg)`, transformOrigin: "50px 50px", transition: "transform 700ms ease" }}
          >
            <path d="M50 16 L57 52 L50 47 L43 52 Z" fill="currentColor" className="text-signal" />
            <line x1="50" y1="47" x2="50" y2="82" stroke="currentColor" className="text-muted-foreground" strokeWidth="1.5" />
          </g>
          <circle cx="50" cy="50" r="3" fill="currentColor" className="text-foreground" />
        </svg>
        <span className="label-caps absolute inset-x-0 -top-1 text-center text-[0.5625rem]">N</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="label-caps">Wind</span>
        <p className="font-mono text-2xl leading-none tabular-nums">
          {Math.round(speed)}
          <span className="ml-1 text-xs text-muted-foreground">{units}</span>
        </p>
        <p className="font-mono text-sm text-muted-foreground tabular-nums">
          From {compass(direction)} · {Math.round(direction)}°
        </p>
        <p className="text-xs text-muted-foreground">
          Gusting {Math.round(gusts)} {units} · Force {beaufort(units === "mph" ? gusts * 1.609 : gusts)}
        </p>
      </div>
    </div>
  )
}

export function CurrentConditions({ data }: { data: WeatherPayload }) {
  const { current, units, daily } = data
  const condition = describeCode(current.weatherCode)
  const today = daily[0]
  const uv = uvBand(current.uvIndex)
  const observed = formatClock(current.time)

  return (
    <Panel className="station-rise overflow-hidden">
      <PanelHeader title="Live observation" meta={`Observed ${observed}`} />

      <div className="grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.15fr_auto] lg:items-center">
        <div className="flex flex-wrap items-center gap-6">
          <WeatherIcon
            code={current.weatherCode}
            isDay={current.isDay}
            className="h-16 w-16 text-signal"
            strokeWidth={1.2}
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-start font-mono tabular-nums">
              <span className="text-[4.5rem] font-light leading-[0.85] tracking-tight sm:text-[5.5rem]">
                {Math.round(current.temperature)}
              </span>
              <span className="mt-2 text-2xl text-muted-foreground">{tempUnit(units)}</span>
            </div>
            <p className="text-lg text-pretty text-foreground">{condition.label}</p>
            <p className="font-mono text-sm text-muted-foreground tabular-nums">
              Feels {Math.round(current.apparentTemperature)}
              {tempUnit(units)}
              {today ? (
                <>
                  {" · "}H {Math.round(today.max)}° {" / "} L {Math.round(today.min)}°
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <WindDial
            direction={current.windDirection}
            speed={current.windSpeed}
            gusts={current.windGusts}
            units={speedUnit(units)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-border border-t border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <Readout
          label="Humidity"
          value={`${Math.round(current.humidity)}`}
          unit="%"
          icon={<Droplets className="h-3.5 w-3.5" />}
        />
        <Readout
          label="Dew point"
          value={`${Math.round(current.dewPoint)}`}
          unit={tempUnit(units)}
          icon={<Thermometer className="h-3.5 w-3.5" />}
        />
        <Readout
          label="Pressure"
          value={`${Math.round(current.pressure)}`}
          unit="hPa"
          icon={<Gauge className="h-3.5 w-3.5" />}
        />
        <Readout
          label="Visibility"
          value={
            units === "metric"
              ? `${(current.visibility / 1000).toFixed(1)}`
              : `${(current.visibility / 1609).toFixed(1)}`
          }
          unit={distanceUnit(units)}
          icon={<Eye className="h-3.5 w-3.5" />}
        />
        <Readout
          label="Cloud cover"
          value={`${Math.round(current.cloudCover)}`}
          unit="%"
          icon={<Cloud className="h-3.5 w-3.5" />}
        />
        <Readout
          label="UV index"
          value={current.uvIndex.toFixed(1)}
          detail={uv.label}
          tone={uv.tone}
          icon={<Sun className="h-3.5 w-3.5" />}
        />
      </div>
    </Panel>
  )
}
