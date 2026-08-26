"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import useSWR from "swr"
import type { StationLocation, Units, WeatherPayload } from "@/lib/weather"

const FALLBACK: StationLocation = {
  id: "fallback-dubai",
  name: "Dubai",
  admin: "Dubai",
  country: "United Arab Emirates",
  countryCode: "AE",
  latitude: 25.2048,
  longitude: 55.2708,
}

const REFRESH_MS = 5 * 60 * 1000

async function fetcher(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? "Reading failed.")
  }
  return response.json()
}

type WeatherContextValue = {
  location: StationLocation | null
  tracked: StationLocation[]
  units: Units
  isLocating: boolean
  isLoading: boolean
  isValidating: boolean
  geoNote: string | null
  error: Error | null
  payload: WeatherPayload | null
  /** Index (0–6) of the forecast day the hourly views should render. */
  selectedDay: number
  setSelectedDay: (day: number) => void
  select: (next: StationLocation) => void
  removeTracked: (id: string) => void
  setUnits: (units: Units) => void
  locate: () => void
  refresh: () => void
}

const WeatherContext = createContext<WeatherContextValue | null>(null)

export function WeatherProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<StationLocation | null>(null)
  const [tracked, setTracked] = useState<StationLocation[]>([])
  const [units, setUnits] = useState<Units>("metric")
  const [selectedDay, setSelectedDay] = useState(0)
  const [isLocating, setIsLocating] = useState(true)
  const [geoNote, setGeoNote] = useState<string | null>(null)

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setIsLocating(false)
      setGeoNote("This browser does not expose location access. Search for a place instead.")
      setLocation((current) => current ?? FALLBACK)
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const response = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`)
          const body = await response.json()
          const resolved: StationLocation = body.location ?? {
            id: `${latitude},${longitude}`,
            name: "Current position",
            latitude,
            longitude,
          }
          setLocation(resolved)
          setTracked((list) => (list.some((item) => item.id === resolved.id) ? list : [resolved, ...list].slice(0, 6)))
          setGeoNote(null)
        } catch (error) {
          console.log("[v0] reverse geocode failed:", error instanceof Error ? error.message : error)
          setLocation({ id: `${latitude},${longitude}`, name: "Current position", latitude, longitude })
        } finally {
          setIsLocating(false)
        }
      },
      (error) => {
        console.log("[v0] geolocation denied:", error.message)
        setIsLocating(false)
        setLocation((current) => current ?? FALLBACK)
        setGeoNote("Location access is blocked, so a sample station is shown. Search for your city to switch.")
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }, [])

  useEffect(() => {
    locate()
  }, [locate])

  const key = location ? `/api/weather?lat=${location.latitude}&lon=${location.longitude}&units=${units}` : null
  const { data, error, isLoading, isValidating, mutate } = useSWR<Omit<WeatherPayload, "location">>(key, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    revalidateOnFocus: true,
  })

  const payload: WeatherPayload | null = useMemo(
    () => (data && location ? { ...data, location } : null),
    [data, location],
  )

  const select = useCallback((next: StationLocation) => {
    setLocation(next)
    setSelectedDay(0)
    setGeoNote(null)
    setTracked((list) => (list.some((item) => item.id === next.id) ? list : [next, ...list].slice(0, 6)))
  }, [])

  const removeTracked = useCallback((id: string) => {
    setTracked((list) => list.filter((item) => item.id !== id))
  }, [])

  const value: WeatherContextValue = {
    location,
    tracked,
    units,
    isLocating,
    isLoading,
    isValidating,
    geoNote,
    error: (error as Error) ?? null,
    payload,
    selectedDay,
    setSelectedDay,
    select,
    removeTracked,
    setUnits,
    locate,
    refresh: () => mutate(),
  }

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
}

export function useWeather() {
  const ctx = useContext(WeatherContext)
  if (!ctx) throw new Error("useWeather must be used within a WeatherProvider")
  return ctx
}
