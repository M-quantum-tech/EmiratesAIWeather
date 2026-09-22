import type { NextRequest } from "next/server"
import type { SolarDay, SolarPayload } from "@/lib/weather"

// Open-Meteo hourly irradiance fields. DNI is the beam component on a sun-tracking
// surface — the key input for concentrating solar and panel-yield planning.
const HOURLY = ["direct_normal_irradiance", "shortwave_radiation"].join(",")

/** Threshold (W/m²) above which DNI is considered usable for generation. */
const USABLE_DNI = 120

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const latitude = Number(params.get("lat"))
  const longitude = Number(params.get("lon"))
  // Support 7 or 14-day horizons; clamp to Open-Meteo's free-tier maximum of 16.
  const requestedDays = Number(params.get("days"))
  const forecastDays = Number.isFinite(requestedDays) ? Math.min(16, Math.max(1, requestedDays)) : 14

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ error: "Valid lat and lon query parameters are required." }, { status: 400 })
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast")
  url.searchParams.set("latitude", String(latitude))
  url.searchParams.set("longitude", String(longitude))
  url.searchParams.set("hourly", HOURLY)
  url.searchParams.set("timezone", "auto")
  url.searchParams.set("forecast_days", String(forecastDays))

  try {
    const response = await fetch(url, { next: { revalidate: 180 } })
    if (!response.ok) {
      console.log("[v0] solar upstream failure:", response.status)
      return Response.json({ error: "Solar service is unavailable right now." }, { status: 502 })
    }

    const data = await response.json()
    const hourly = data.hourly ?? {}
    const times: string[] = hourly.time ?? []
    const dni: number[] = hourly.direct_normal_irradiance ?? []
    const ghi: number[] = hourly.shortwave_radiation ?? []

    // Bucket hourly irradiance (W/m²) by local calendar date. Because each sample
    // represents one hour, W/m² summed over the day equals Wh/m²; /1000 → kWh/m²/day.
    type Bucket = {
      peakDni: number
      peakHour: number
      dniWh: number
      ghiWh: number
      sunHours: number
      /** DNI per local hour (0–23), for the full-day irradiance curve. */
      hourly: number[]
    }
    const byDate = new Map<string, Bucket>()
    const order: string[] = []

    times.forEach((time, index) => {
      const date = time.slice(0, 10)
      const hour = Number(time.slice(11, 13))
      const dniVal = num(dni[index])
      const ghiVal = num(ghi[index])
      let bucket = byDate.get(date)
      if (!bucket) {
        bucket = { peakDni: 0, peakHour: 0, dniWh: 0, ghiWh: 0, sunHours: 0, hourly: new Array(24).fill(0) }
        byDate.set(date, bucket)
        order.push(date)
      }
      if (dniVal > bucket.peakDni) {
        bucket.peakDni = dniVal
        bucket.peakHour = hour
      }
      if (hour >= 0 && hour < 24) bucket.hourly[hour] = dniVal
      bucket.dniWh += dniVal
      bucket.ghiWh += ghiVal
      if (dniVal >= USABLE_DNI) bucket.sunHours += 1
    })

    const days: SolarDay[] = order.map((date) => {
      const b = byDate.get(date)!
      return {
        date,
        peakDni: Math.round(b.peakDni),
        dniEnergy: Math.round((b.dniWh / 1000) * 100) / 100,
        ghiEnergy: Math.round((b.ghiWh / 1000) * 100) / 100,
        peakHour: b.peakHour,
        sunHours: b.sunHours,
        hourlyDni: b.hourly.map((v) => Math.round(v)),
      }
    })

    const payload: SolarPayload = {
      timezone: data.timezone ?? "UTC",
      latitude,
      longitude,
      days,
      fetchedAt: new Date().toISOString(),
    }

    return Response.json(payload)
  } catch (error) {
    console.log("[v0] solar route error:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not reach the solar irradiance network." }, { status: 502 })
  }
}
