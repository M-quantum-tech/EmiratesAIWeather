// Builds a live low-level wind field over the UAE/Gulf for the animated
// COSMO-UAE-wind–style layer (rendered with leaflet-velocity).
//
// leaflet-velocity expects GRIB-like data: two records (U = eastward,
// V = northward wind) each with a header describing the grid and a flat
// data array ordered row-major from the NORTH-WEST corner, scanning east
// then south. We fetch a coarse grid of live winds from Open-Meteo and
// convert meteorological speed/direction into U/V components.

// Grid bounds (degrees). North-west corner is (la1, lo1).
const LA1 = 28 // north
const LA2 = 21 // south
const LO1 = 50 // west
const LO2 = 60 // east
const DX = 1
const DY = 1
const NX = (LO2 - LO1) / DX + 1 // 11 columns
const NY = (LA1 - LA2) / DY + 1 // 8 rows

export type VelocityData = Array<{ header: Record<string, unknown>; data: number[] }>

export async function fetchWindField(signal?: AbortSignal): Promise<VelocityData | null> {
  // Build coordinate lists in leaflet-velocity scan order: north→south, west→east.
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
    `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=UTC`

  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const json = await res.json()
  // Multi-location responses come back as an array; a single point comes back as an object.
  const list = Array.isArray(json) ? json : [json]
  if (list.length < NX * NY) return null

  const u: number[] = new Array(NX * NY).fill(0)
  const v: number[] = new Array(NX * NY).fill(0)
  for (let i = 0; i < NX * NY; i++) {
    const cur = list[i]?.current ?? {}
    const speed = Number(cur.wind_speed_10m ?? 0)
    const dirDeg = Number(cur.wind_direction_10m ?? 0)
    const rad = (dirDeg * Math.PI) / 180
    // Meteorological direction is where the wind blows FROM, so negate.
    u[i] = -speed * Math.sin(rad)
    v[i] = -speed * Math.cos(rad)
  }

  const refTime = new Date().toISOString()
  const baseHeader = {
    nx: NX,
    ny: NY,
    lo1: LO1,
    la1: LA1,
    lo2: LO2,
    la2: LA2,
    dx: DX,
    dy: DY,
    parameterCategory: 2,
    parameterUnit: "m.s-1",
    refTime,
  }

  return [
    { header: { ...baseHeader, parameterNumber: 2, parameterNumberName: "eastward_wind" }, data: u },
    { header: { ...baseHeader, parameterNumber: 3, parameterNumberName: "northward_wind" }, data: v },
  ]
}
