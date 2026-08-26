"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { LocateFixed, MapPin, RefreshCw, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatLocation, type StationLocation, type Units } from "@/lib/weather"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

type Props = {
  location: StationLocation | null
  tracked: StationLocation[]
  units: Units
  isLoading: boolean
  isLocating: boolean
  updatedAt?: string
  onSelect: (location: StationLocation) => void
  onRemoveTracked: (id: string) => void
  onUnitsChange: (units: Units) => void
  onLocate: () => void
  onRefresh: () => void
}

export function StationHeader({
  location,
  tracked,
  units,
  isLoading,
  isLocating,
  updatedAt,
  onSelect,
  onRemoveTracked,
  onUnitsChange,
  onLocate,
  onRefresh,
}: Props) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebounced(query)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading: searching } = useSWR<{ results: StationLocation[] }>(
    debouncedQuery.trim().length > 1 ? `/api/geocode?q=${encodeURIComponent(debouncedQuery.trim())}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const results = data?.results ?? []

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full bg-signal", isLoading ? "station-pulse" : "")}
            />
            <span className="label-caps">Live monitoring station</span>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight text-balance sm:text-3xl">
            <MapPin className="h-5 w-5 shrink-0 text-signal" aria-hidden="true" />
            {location ? formatLocation(location) : "Awaiting position"}
          </h1>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {location
              ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
              : "Allow location access or search for a place"}
            {updatedAt
              ? ` · synced ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={containerRef} className="relative">
            <label className="sr-only" htmlFor="station-search">
              Search for a city
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="station-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search city or town"
              autoComplete="off"
              className="h-9 w-56 rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-signal/60 focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
            />
            {open && debouncedQuery.trim().length > 1 ? (
              <div className="absolute right-0 top-11 z-20 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-xl">
                {searching ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Searching stations…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No matching place found.</p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto">
                    {results.map((result) => (
                      <li key={`${result.id}-${result.latitude}`}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(result)
                            setQuery("")
                            setOpen(false)
                          }}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-secondary"
                        >
                          <span className="text-sm">{result.name}</span>
                          <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                            {[result.admin, result.country].filter(Boolean).join(", ")} ·{" "}
                            {result.latitude.toFixed(2)}, {result.longitude.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <Button variant="outline" size="sm" onClick={onLocate} disabled={isLocating} className="h-9 gap-2">
            <LocateFixed className={cn("h-4 w-4", isLocating && "animate-spin")} aria-hidden="true" />
            {isLocating ? "Locating" : "My location"}
          </Button>

          <div className="flex h-9 items-center rounded-md border border-input bg-card p-0.5">
            {(["metric", "imperial"] as Units[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onUnitsChange(option)}
                aria-pressed={units === option}
                className={cn(
                  "h-8 rounded-[0.25rem] px-2.5 font-mono text-xs transition-colors",
                  units === option
                    ? "bg-signal text-signal-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "metric" ? "°C" : "°F"}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            aria-label="Refresh readings"
            className="h-9 w-9"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {tracked.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps">Tracking</span>
          {tracked.map((item) => {
            const isActive = location?.latitude === item.latitude && location?.longitude === item.longitude
            return (
              <span
                key={`${item.id}-${item.latitude}`}
                className={cn(
                  "group flex items-center gap-1 rounded-full border px-1 py-0.5 pl-2.5 text-xs transition-colors",
                  isActive ? "border-signal/60 bg-signal/10 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                <button type="button" onClick={() => onSelect(item)} className="py-0.5">
                  {item.name}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveTracked(item.id)}
                  aria-label={`Stop tracking ${item.name}`}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
    </header>
  )
}
