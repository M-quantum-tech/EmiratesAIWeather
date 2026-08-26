"use client"

import { Radio, TriangleAlert } from "lucide-react"
import { Advisories } from "@/components/station/advisories"
import { AirQualityPanel } from "@/components/station/air-quality"
import { CurrentConditions } from "@/components/station/current-conditions"
import { Panel } from "@/components/station/panel"
import { StationHeader } from "@/components/station/station-header"
import { Button } from "@/components/ui/button"
import { useWeather } from "@/components/weather/weather-provider"

export function StationDashboard() {
  const {
    location,
    tracked,
    units,
    isLoading,
    isValidating,
    isLocating,
    geoNote,
    error,
    payload,
    select,
    removeTracked,
    setUnits,
    locate,
    refresh,
  } = useWeather()

  return (
    <div className="flex w-full flex-col gap-6">
      <StationHeader
        location={location}
        tracked={tracked}
        units={units}
        isLoading={isLoading || isValidating}
        isLocating={isLocating}
        updatedAt={payload?.fetchedAt}
        onSelect={select}
        onRemoveTracked={removeTracked}
        onUnitsChange={setUnits}
        onLocate={locate}
        onRefresh={refresh}
      />

      {geoNote ? (
        <p className="flex items-start gap-2 rounded-md border border-signal/30 bg-signal/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
          {geoNote}
        </p>
      ) : null}

      {error && !payload ? (
        <Panel className="flex flex-col items-start gap-3 px-4 py-6">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry reading
          </Button>
        </Panel>
      ) : null}

      {!payload ? (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-6">
            <Panel className="h-64 animate-pulse" />
            <Panel className="h-72 animate-pulse" />
          </div>
          <div className="flex flex-col gap-6">
            <Panel className="h-80 animate-pulse" />
            <Panel className="h-56 animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-6">
            <CurrentConditions data={payload} />
          </div>
          <div className="flex flex-col gap-6">
            <Advisories data={payload} />
            <AirQualityPanel air={payload.air} />
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 font-mono text-[0.6875rem] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          Auto-polling every 5 minutes
          {payload ? ` · times in ${payload.timezone}` : ""}
        </span>
        <span>EmiratesAIWeather · a platform by M-Quantum-Tech · data via Open-Meteo</span>
      </footer>
    </div>
  )
}
