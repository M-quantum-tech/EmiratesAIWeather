"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { LocateFixed, RefreshCw, Search, X } from "lucide-react"
import { useWeather } from "@/components/weather/weather-provider"
import { formatLocation, type StationLocation, type Units } from "@/lib/weather"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function LocationBar() {
  const { location, units, isLocating, isValidating, select, setUnits, locate, refresh } = useWeather()
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
    <div className="sticky top-[57px] z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
        {/* Current location pill */}
        <span className="mr-1 flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 shrink-0 rounded-full bg-signal", isValidating && "station-pulse")}
          />
          <span className="truncate text-sm font-medium tracking-tight text-foreground">
            {location ? formatLocation(location) : "Locating…"}
          </span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <div ref={containerRef} className="relative">
            <label className="sr-only" htmlFor="global-search">
              Search for a city or town
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="global-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search city or town"
              autoComplete="off"
              className="h-9 w-48 rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-signal/60 focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
            />
            {open && debouncedQuery.trim().length > 1 ? (
              <div className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-xl">
                {searching ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Searching places…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No matching place found.</p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto">
                    {results.map((result) => (
                      <li key={`${result.id}-${result.latitude}`}>
                        <button
                          type="button"
                          onClick={() => {
                            select(result)
                            setQuery("")
                            setOpen(false)
                          }}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-secondary"
                        >
                          <span className="text-sm">{result.name}</span>
                          <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                            {[result.admin, result.country].filter(Boolean).join(", ")} · {result.latitude.toFixed(2)},{" "}
                            {result.longitude.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          {/* My location */}
          <button
            type="button"
            onClick={locate}
            disabled={isLocating}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <LocateFixed className={cn("h-4 w-4 text-signal", isLocating && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">{isLocating ? "Locating" : "My location"}</span>
          </button>

          {/* Units */}
          <div className="flex h-9 items-center rounded-md border border-input bg-card p-0.5">
            {(["metric", "imperial"] as Units[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setUnits(option)}
                aria-pressed={units === option}
                className={cn(
                  "h-8 rounded-[0.25rem] px-2.5 font-mono text-xs transition-colors",
                  units === option ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "metric" ? "°C" : "°F"}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh readings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-secondary"
          >
            <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
