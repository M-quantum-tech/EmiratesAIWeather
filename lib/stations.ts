// UAE automatic weather station (AWS) network used to sample point observations
// from our cached wind/cloud/solar grid — mirroring NCM Ghaith's aws-wind and
// aws-solar-radiation station views. Values are sampled from our own Open-Meteo
// grid (bilinear), so there are no third-party permission/quota issues.

import type { WindGrid } from "@/lib/wind-field"

export type Station = { name: string; lat: number; lon: number }

/** Real UAE towns/AWS-style sites spread across all seven emirates + Al Dhafra. */
export const STATIONS: Station[] = [
  { name: "Abu Dhabi", lat: 24.45, lon: 54.37 },
  { name: "Dubai", lat: 25.2, lon: 55.27 },
  { name: "Sharjah", lat: 25.35, lon: 55.39 },
  { name: "Ajman", lat: 25.41, lon: 55.44 },
  { name: "Umm Al Quwain", lat: 25.56, lon: 55.55 },
  { name: "Ras Al Khaimah", lat: 25.79, lon: 55.94 },
  { name: "Fujairah", lat: 25.13, lon: 56.34 },
  { name: "Al Ain", lat: 24.21, lon: 55.75 },
  { name: "Khor Fakkan", lat: 25.34, lon: 56.35 },
  { name: "Dibba", lat: 25.62, lon: 56.27 },
  { name: "Masafi", lat: 25.3, lon: 56.16 },
  { name: "Hatta", lat: 24.8, lon: 56.13 },
  { name: "Sweihan", lat: 24.47, lon: 55.34 },
  { name: "Al Wathba", lat: 24.23, lon: 54.75 },
  { name: "Yas Island", lat: 24.49, lon: 54.6 },
  { name: "Jebel Ali", lat: 25.01, lon: 55.06 },
  { name: "Mirfa", lat: 24.11, lon: 53.48 },
  { name: "Ghayathi", lat: 23.84, lon: 52.81 },
  { name: "Ruwais", lat: 24.11, lon: 52.73 },
  { name: "Madinat Zayed", lat: 23.66, lon: 53.71 },
  { name: "Liwa", lat: 23.13, lon: 53.78 },
  { name: "Al Quaa", lat: 23.53, lon: 55.48 },
  { name: "Sila", lat: 24.03, lon: 51.6 },
  { name: "Sir Bani Yas", lat: 24.31, lon: 52.58 },
  { name: "Delma Island", lat: 24.5, lon: 52.3 },
  { name: "Al Dhafra", lat: 24.25, lon: 54.55 },
]

export type StationReading = {
  name: string
  lat: number
  lon: number
  /** Wind speed at 10 m (km/h). */
  windKmh: number
  /** Compass bearing (deg) the wind blows TOWARD. */
  flowDeg: number
  /** Direct normal irradiance (W/m²). */
  dni: number
}

/** Bilinear-sample a row-major (NW-origin) grid field at a lat/lon. */
function sampleField(grid: WindGrid, field: number[], lat: number, lon: number): number {
  const fx = (lon - grid.lo1) / grid.dx
  const fy = (grid.la1 - lat) / grid.dy
  const x0 = Math.max(0, Math.min(grid.nx - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(grid.ny - 1, Math.floor(fy)))
  const x1 = Math.min(grid.nx - 1, x0 + 1)
  const y1 = Math.min(grid.ny - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))
  const v00 = field[y0 * grid.nx + x0]
  const v10 = field[y0 * grid.nx + x1]
  const v01 = field[y1 * grid.nx + x0]
  const v11 = field[y1 * grid.nx + x1]
  const top = v00 + (v10 - v00) * tx
  const bot = v01 + (v11 - v01) * tx
  return top + (bot - top) * ty
}

/** Sample every station from one forecast frame's grid. */
export function stationReadings(grid: WindGrid): StationReading[] {
  return STATIONS.map((s) => {
    const u = sampleField(grid, grid.u, s.lat, s.lon)
    const v = sampleField(grid, grid.v, s.lat, s.lon)
    const speed = sampleField(grid, grid.speed, s.lat, s.lon)
    const dni = grid.dni ? sampleField(grid, grid.dni, s.lat, s.lon) : 0
    // u east, v north — bearing the wind flows TOWARD (compass, clockwise from N).
    const flowDeg = (Math.atan2(u, v) * 180) / Math.PI
    return {
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      windKmh: Math.max(0, Math.round(speed * 3.6)),
      flowDeg: (flowDeg + 360) % 360,
      dni: Math.max(0, Math.round(dni)),
    }
  })
}
