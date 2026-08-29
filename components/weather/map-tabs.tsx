"use client"

import { useState } from "react"
import { Map as MapIcon, Satellite } from "lucide-react"
import { cn } from "@/lib/utils"
import { NcmSources } from "@/components/weather/ncm-sources"
import { MeasureMap } from "@/components/weather/measure-map"

type MapTab = "live" | "measure"

const TABS: { id: MapTab; label: string; hint: string; icon: typeof MapIcon }[] = [
  { id: "live", label: "Live Wind, Radar & Warnings", hint: "NCM Al Bahar loops", icon: Satellite },
  { id: "measure", label: "Measure & Forecast", hint: "Pick a point · compare models", icon: MapIcon },
]

export function MapTabs() {
  const [tab, setTab] = useState<MapTab>("live")

  return (
    <div className="flex flex-col gap-4">
      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="Weather maps"
        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 sm:flex-row sm:items-center"
      >
        {TABS.map(({ id, label, hint, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "group flex flex-1 items-center gap-3 rounded-md px-4 py-3 text-left transition-colors",
                active
                  ? "bg-signal/15 text-foreground ring-1 ring-signal/40"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-5 w-5 shrink-0", active ? "text-signal" : "text-muted-foreground")}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Active map — mounted fresh per tab so Leaflet sizes correctly */}
      <div role="tabpanel">{tab === "live" ? <NcmSources /> : <MeasureMap />}</div>
    </div>
  )
}
