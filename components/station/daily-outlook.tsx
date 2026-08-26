import { Sunrise, Sunset } from "lucide-react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { WeatherIcon } from "@/components/station/weather-icon"
import { describeCode, formatClock, formatWeekday, precipUnit, tempUnit, type WeatherPayload } from "@/lib/weather"

export function DailyOutlook({ data }: { data: WeatherPayload }) {
  const days = data.daily
  if (!days.length) return null

  const weekMin = Math.min(...days.map((day) => day.min))
  const weekMax = Math.max(...days.map((day) => day.max))
  const weekSpan = Math.max(weekMax - weekMin, 1)
  const today = days[0]

  const time = (value: string) => formatClock(value)

  return (
    <Panel className="station-rise">
      <PanelHeader title="7-day outlook" meta={`${Math.round(weekMin)}° / ${Math.round(weekMax)}°`} />

      <ul className="divide-y divide-border">
        {days.map((day, index) => {
          const left = ((day.min - weekMin) / weekSpan) * 100
          const width = Math.max(((day.max - day.min) / weekSpan) * 100, 4)
          const label = index === 0 ? "Today" : formatWeekday(day.date)

          return (
            <li key={day.date} className="grid grid-cols-[3.25rem_1.75rem_1fr_5.5rem] items-center gap-3 px-4 py-3">
              <span className="label-caps text-foreground/80">{label}</span>
              <WeatherIcon code={day.weatherCode} className="h-5 w-5 text-muted-foreground" />
              <div className="flex flex-col gap-1.5">
                <div className="relative h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="absolute h-1.5 rounded-full bg-signal/80"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {describeCode(day.weatherCode).short}
                  {day.precipitationProbability > 0 ? ` · ${day.precipitationProbability}% precip` : ""}
                  {day.precipitationSum > 0 ? ` · ${day.precipitationSum.toFixed(1)} ${precipUnit(data.units)}` : ""}
                </span>
              </div>
              <span className="justify-self-end font-mono text-sm tabular-nums">
                <span className="text-muted-foreground">{Math.round(day.min)}°</span>
                <span className="mx-1 text-border">/</span>
                <span>{Math.round(day.max)}°</span>
              </span>
            </li>
          )
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground tabular-nums">
        <span className="flex items-center gap-2">
          <Sunrise className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          Sunrise {time(today.sunrise)}
        </span>
        <span className="flex items-center gap-2">
          <Sunset className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          Sunset {time(today.sunset)}
        </span>
        <span className="hidden sm:inline">
          Peak UV {today.uvIndexMax.toFixed(1)} · Gusts {Math.round(today.windGustMax)}
        </span>
        <span className="sr-only">
          All values shown in {tempUnit(data.units)} for timezone {data.timezone}
        </span>
      </footer>
    </Panel>
  )
}
