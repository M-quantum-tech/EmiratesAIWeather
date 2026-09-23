import type { NextRequest } from "next/server"
import type { SolarDay, SolarPayload } from "@/lib/weather"

// Open-Meteo hourly irradiance fields. DNI is the beam component on a sun-tracking
// surface; GHI (shortwave) is total on horizontal; diffuse is the scattered share;
// terrestrial_radiation is the clear-sky / extraterrestrial reference we compare
// against to derive transmittance, reflectivity and beam attenuation.
const HOURLY = [
  "direct_normal_irradiance",
  "shortwave_radiation",
  "diffuse_radiation",
  "terrestrial_radiation",
  // On-site influence factors the AI beam nowcast corrects for.
  "cloud_cover",
  "relative_humidity_2m",
].join(",")

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
  url.searchParams.set("daily", "sunrise,sunset")
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
    const diffuse: number[] = hourly.diffuse_radiation ?? []
    const terr: number[] = hourly.terrestrial_radiation ?? []
    const cloud: number[] = hourly.cloud_cover ?? []
    const rh: number[] = hourly.relative_humidity_2m ?? []

    // Sunrise / sunset keyed by local date (Open-Meteo daily arrays are aligned).
    const daily = data.daily ?? {}
    const dailyTimes: string[] = daily.time ?? []
    const sunriseArr: string[] = daily.sunrise ?? []
    const sunsetArr: string[] = daily.sunset ?? []
    const sunByDate = new Map<string, { sunrise: string; sunset: string }>()
    dailyTimes.forEach((d, i) => sunByDate.set(d, { sunrise: sunriseArr[i] ?? "", sunset: sunsetArr[i] ?? "" }))

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

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
      hourlyGhi: number[]
      /** Influence-corrected beam per hour, pre-smoothing (fed to the AI nowcast). */
      aiRaw: number[]
      /** Transmittance (Kt, %), reflectivity (diffuse fraction, %) and attenuation (dB) per hour. */
      trans: number[]
      refl: number[]
      atten: number[]
      /** Accumulators for the daytime mean of each derived metric. */
      transSum: number
      reflSum: number
      attenSum: number
      daylightHours: number
    }
    const byDate = new Map<string, Bucket>()
    const order: string[] = []

    times.forEach((time, index) => {
      const date = time.slice(0, 10)
      const hour = Number(time.slice(11, 13))
      const dniVal = num(dni[index])
      const ghiVal = num(ghi[index])
      const diffVal = num(diffuse[index])
      const terrVal = num(terr[index])
      let bucket = byDate.get(date)
      if (!bucket) {
        bucket = {
          peakDni: 0,
          peakHour: 0,
          dniWh: 0,
          ghiWh: 0,
          sunHours: 0,
          hourly: new Array(24).fill(0),
          hourlyGhi: new Array(24).fill(0),
          aiRaw: new Array(24).fill(0),
          trans: new Array(24).fill(0),
          refl: new Array(24).fill(0),
          atten: new Array(24).fill(0),
          transSum: 0,
          reflSum: 0,
          attenSum: 0,
          daylightHours: 0,
        }
        byDate.set(date, bucket)
        order.push(date)
      }
      if (dniVal > bucket.peakDni) {
        bucket.peakDni = dniVal
        bucket.peakHour = hour
      }

      // Derived optics — only meaningful while the sun is meaningfully above the horizon.
      const daylight = terrVal > 50
      const kt = daylight ? clamp01(ghiVal / terrVal) : 0 // clearness index (transmittance)
      const diffuseFraction = ghiVal > 5 ? clamp01(diffVal / ghiVal) : 0 // sky reflectivity proxy
      const attenDb = daylight && kt > 0.001 ? Math.min(40, -10 * Math.log10(kt)) : 0 // beam optical loss

      // AI beam nowcast — correct the model DNI for on-site influence factors.
      // Cloud cover cuts beam non-linearly; humidity haze scatters it slightly.
      const cloudVal = clamp01(num(cloud[index]) / 100)
      const rhVal = clamp01((num(rh[index]) - 45) / 55)
      const cloudFactor = 1 - 0.55 * Math.pow(cloudVal, 1.4)
      const hazeFactor = 1 - 0.12 * rhVal
      const aiBeam = daylight ? Math.max(0, dniVal * cloudFactor * hazeFactor) : 0

      if (hour >= 0 && hour < 24) {
        bucket.hourly[hour] = dniVal
        bucket.hourlyGhi[hour] = ghiVal
        bucket.aiRaw[hour] = aiBeam
        bucket.trans[hour] = kt * 100
        bucket.refl[hour] = diffuseFraction * 100
        bucket.atten[hour] = attenDb
      }
      if (daylight) {
        bucket.transSum += kt * 100
        bucket.reflSum += diffuseFraction * 100
        bucket.attenSum += attenDb
        bucket.daylightHours += 1
      }
      bucket.dniWh += dniVal
      bucket.ghiWh += ghiVal
      if (dniVal >= USABLE_DNI) bucket.sunHours += 1
    })

    const days: SolarDay[] = order.map((date) => {
      const b = byDate.get(date)!
      const dl = Math.max(1, b.daylightHours)
      const sun = sunByDate.get(date) ?? { sunrise: "", sunset: "" }
      return {
        date,
        peakDni: Math.round(b.peakDni),
        dniEnergy: Math.round((b.dniWh / 1000) * 100) / 100,
        ghiEnergy: Math.round((b.ghiWh / 1000) * 100) / 100,
        peakHour: b.peakHour,
        sunHours: b.sunHours,
        hourlyDni: b.hourly.map((v) => Math.round(v)),
        hourlyGhi: b.hourlyGhi.map((v) => Math.round(v)),
        // Temporal 3-point smoothing (0.25/0.5/0.25) — persistence-style nowcast.
        hourlyDniAi: b.aiRaw.map((v, i, arr) => {
          const prev = arr[i - 1] ?? v
          const next = arr[i + 1] ?? v
          return Math.round(prev * 0.25 + v * 0.5 + next * 0.25)
        }),
        hourlyTransmittance: b.trans.map((v) => Math.round(v)),
        hourlyReflectivity: b.refl.map((v) => Math.round(v)),
        hourlyAttenuation: b.atten.map((v) => Math.round(v * 10) / 10),
        clearness: Math.round(b.transSum / dl),
        reflectivity: Math.round(b.reflSum / dl),
        attenuation: Math.round((b.attenSum / dl) * 10) / 10,
        sunrise: sun.sunrise,
        sunset: sun.sunset,
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
