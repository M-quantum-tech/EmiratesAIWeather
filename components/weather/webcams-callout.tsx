"use client"

import { Camera, Circle, ArrowRight } from "lucide-react"
import { useWeather } from "@/components/weather/weather-provider"

export function WebcamsCallout() {
  const { location } = useWeather()
  const place = location?.name ?? "your area"

  return (
    <a
      href="#webcams"
      className="group flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 transition-colors hover:border-signal/50 hover:bg-card"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-signal/40 bg-signal/10">
        <Camera className="h-4 w-4 text-signal" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-2 label-caps">
          Cloud &amp; sky cams
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] uppercase text-alert-red">
            <Circle className="h-1.5 w-1.5 fill-current station-pulse" aria-hidden="true" />
            live
          </span>
        </span>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          Access local weather webcams playing live from open UAE sources near {place}, when available.
        </p>
      </div>

      <span className="flex shrink-0 items-center gap-1 font-mono text-[0.625rem] uppercase tracking-wide text-signal transition-transform group-hover:translate-x-0.5">
        Watch
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </a>
  )
}
