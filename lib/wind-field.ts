// Builds a live, hourly-stepped low-level wind field over the UAE/Gulf for a
// Windy-style wind map: a smooth wind-speed heatmap plus a uniform grid of
// direction arrows, animated through a 24-hour forecast with a time slider.
//
// We fetch a coarse lat/lon grid of hourly winds from Open-Meteo and convert
// meteorological speed/direction into U (eastward) / V (northward) components.
// Grids are stored row-major from the NORTH-WEST corner, scanning east then south.

// Grid bounds (degrees). North-west corner is (la1, lo1).
const LA1 = 29 // north
const LA2 = 20 // south
const LO1 = 49 // west
const LO2 = 60 // east
const DX = 1
const DY = 1
const NX = (LO2 - LO1) / DX + 1 // 12 columns
const NY = (LA1 - LA2) / DY + 1 // 10 rows
const HOURS = 24

export type WindGrid = {
  nx: number
  ny: number
  la1: number
  la2: number
  lo1: number
  lo2: number
  dx: number
  dy: number
  /** Wind speed (m/s), row-major from NW scanning east then south. */
  speed: number[]
  /** Eastward component (m/s). */
  u: number[]
  /** Northward component (m/s). */
  v: number[]
}

export type WindFrames = {
  /** Local ISO timestamps per frame, e.g. "2026-08-26T12:00". */
  times: string[]
  frames: WindGrid[]
}

export async function fetchWindFrames(signal?: AbortSignal): Promise<WindFrames | null> {
  // Coordinate lists in scan order: north→south, west→east.
  const lats: number[] = []
  const lons: number[] = []
  for (let la = LA1; la >= LA2; la -= DY) {
    for (let lo = LO1; lo <= LO2; lo += DX) {
      lats.push(la)
      lons.push(lo)
    }
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}` +
    `&longitude=${lons.join(",")}` +
    `&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&forecast_hours=${HOURS}&timezone=auto`

  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const json = await res.json()
  // Multi-location responses come back as an array; a single point as an object.
  const list = Array.isArray(json) ? json : [json]
  if (list.length < NX * NY) return null

  const times: string[] = list[0]?.hourly?.time ?? []
  const nFrames = Math.min(times.length, HOURS)
  if (nFrames === 0) return null

  const frames: WindGrid[] = []
  for (let h = 0; h < nFrames; h++) {
    const speed = new Array(NX * NY).fill(0)
    const u = new Array(NX * NY).fill(0)
    const v = new Array(NX * NY).fill(0)
    for (let i = 0; i < NX * NY; i++) {
      const hourly = list[i]?.hourly
      const sp = Number(hourly?.wind_speed_10m?.[h] ?? 0)
      const dir = Number(hourly?.wind_direction_10m?.[h] ?? 0)
      const rad = (dir * Math.PI) / 180
      speed[i] = sp
      // Meteorological direction is where the wind blows FROM, so negate.
      u[i] = -sp * Math.sin(rad)
      v[i] = -sp * Math.cos(rad)
    }
    frames.push({ nx: NX, ny: NY, la1: LA1, la2: LA2, lo1: LO1, lo2: LO2, dx: DX, dy: DY, speed, u, v })
  }

  return { times: times.slice(0, nFrames), frames }
}
