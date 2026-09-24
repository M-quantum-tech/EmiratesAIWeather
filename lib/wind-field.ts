// Builds a live, hourly-stepped low-level wind field over the UAE/Gulf for a
// Windy-style wind map: a smooth wind-speed heatmap plus a uniform grid of
// direction arrows, animated through a 24-hour forecast with a time slider.
//
// We fetch a coarse lat/lon grid of hourly winds from Open-Meteo and convert
// meteorological speed/direction into U (eastward) / V (northward) components.
// Grids are stored row-major from the NORTH-WEST corner, scanning east then south.

// Grid bounds (degrees). North-west corner is (la1, lo1). A 0.5° grid spanning the
// wider Gulf (eastern Saudi/Qatar/Bahrain → southern Iran → UAE → northern Oman)
// so the wind field fills a regional view like NCM's COSMO-UAE map, while staying
// fine enough to stay accurate when zoomed into the UAE.
const LA1 = 29 // north
const LA2 = 20 // south
const LO1 = 49 // west
const LO2 = 60 // east
const DX = 0.5
const DY = 0.5
const NX = (LO2 - LO1) / DX + 1 // 23 columns
const NY = (LA1 - LA2) / DY + 1 // 19 rows
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
  /** Total cloud cover (0–100 %), same grid — fetched in the same request. */
  cover: number[]
  /** Direct normal irradiance (W/m²), same grid — fetched in the same request. */
  dni?: number[]
}

export type WindFrames = {
  /** Local ISO timestamps per frame, e.g. "2026-08-26T12:00". */
  times: string[]
  frames: WindGrid[]
}

export async function fetchWindFrames(signal?: AbortSignal): Promise<WindFrames | null> {
  // Read the grid from our own cached server route rather than calling Open-Meteo
  // directly from the browser. One shared upstream request per revalidate window
  // keeps the heavy multi-location call clear of per-client rate limits (429s).
  const res = await fetch("/api/windfield", { signal })
  if (!res.ok) return null
  const json = (await res.json()) as WindFrames | { error: string }
  if (!json || "error" in json || !Array.isArray((json as WindFrames).frames)) return null
  const data = json as WindFrames
  if (data.frames.length === 0) return null
  return data
}
