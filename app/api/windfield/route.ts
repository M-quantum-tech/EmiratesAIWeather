import type { WindFrames, WindGrid } from "@/lib/wind-field"

// Server-side, cached builder for the UAE/Gulf wind + total-cloud grid used by the
// Radar & Satellite map. Fetching Open-Meteo here (instead of from every browser)
// means one shared upstream request per revalidate window, so the heavy
// multi-location call never trips per-client rate limits (429s) and there are no
// CORS/quota surprises on the client.

const LA1 = 29 // north
const LA2 = 20 // south
const LO1 = 49 // west
const LO2 = 60 // east
const DX = 0.5
const DY = 0.5
const NX = (LO2 - LO1) / DX + 1 // 23 columns
const NY = (LA1 - LA2) / DY + 1 // 19 rows
const HOURS = 24

export const revalidate = 600

export async function GET(request: Request) {
  // "live" = next 24 hourly steps; "7day" = 7-day outlook sampled every 3 h
  // (56 frames) so the timeline stays smooth without a huge payload.
  const range = new URL(request.url).searchParams.get("range") === "7day" ? "7day" : "live"
  const step = range === "7day" ? 3 : 1

  const lats: number[] = []
  const lons: number[] = []
  for (let la = LA1; la >= LA2; la -= DY) {
    for (let lo = LO1; lo <= LO2; lo += DX) {
      lats.push(la)
      lons.push(lo)
    }
  }

  const horizon = range === "7day" ? "&forecast_days=7" : `&forecast_hours=${HOURS}`
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}` +
    `&longitude=${lons.join(",")}` +
    `&hourly=wind_speed_10m,wind_direction_10m,cloud_cover,direct_normal_irradiance&wind_speed_unit=ms${horizon}&timezone=auto`

  try {
    const res = await fetch(url, { next: { revalidate: 600 } })
    if (!res.ok) {
      console.log("[v0] windfield upstream failure:", res.status)
      return Response.json({ error: "Wind field service is unavailable right now." }, { status: 502 })
    }
    const json = await res.json()
    const list = Array.isArray(json) ? json : [json]
    if (list.length < NX * NY) {
      return Response.json({ error: "Unexpected wind field response." }, { status: 502 })
    }

    const allTimes: string[] = list[0]?.hourly?.time ?? []
    if (allTimes.length === 0) {
      return Response.json({ error: "No wind field data available." }, { status: 502 })
    }

    // Sampled hour indices: every hour for "live", every 3rd hour for "7day".
    const hourIdx: number[] = []
    for (let h = 0; h < allTimes.length; h += step) hourIdx.push(h)
    const times = hourIdx.map((h) => allTimes[h])

    const frames: WindGrid[] = []
    for (const h of hourIdx) {
      const speed = new Array(NX * NY).fill(0)
      const u = new Array(NX * NY).fill(0)
      const v = new Array(NX * NY).fill(0)
      const cover = new Array(NX * NY).fill(0)
      const dni = new Array(NX * NY).fill(0)
      for (let i = 0; i < NX * NY; i++) {
        const hourly = list[i]?.hourly
        const sp = Number(hourly?.wind_speed_10m?.[h] ?? 0)
        const dir = Number(hourly?.wind_direction_10m?.[h] ?? 0)
        const rad = (dir * Math.PI) / 180
        speed[i] = sp
        // Meteorological direction is where the wind blows FROM, so negate.
        u[i] = -sp * Math.sin(rad)
        v[i] = -sp * Math.cos(rad)
        cover[i] = Math.max(0, Math.min(100, Number(hourly?.cloud_cover?.[h] ?? 0)))
        dni[i] = Math.max(0, Number(hourly?.direct_normal_irradiance?.[h] ?? 0))
      }
      frames.push({ nx: NX, ny: NY, la1: LA1, la2: LA2, lo1: LO1, lo2: LO2, dx: DX, dy: DY, speed, u, v, cover, dni })
    }

    const payload: WindFrames = { times, frames }
    return Response.json(payload)
  } catch (error) {
    console.log("[v0] windfield route error:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not reach the wind field network." }, { status: 502 })
  }
}
