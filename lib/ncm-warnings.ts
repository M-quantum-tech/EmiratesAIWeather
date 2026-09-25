export type WarnLevel = "green" | "yellow" | "orange" | "red"

/** Where a warning came from — the official NCM bulletin, our Open-Meteo engine, or both. */
export type WarnSource = "NCM" | "Open-Meteo" | "NCM + Open-Meteo"

export type EmirateWarning = {
  /** Must match the `name` property in public/geo/uae-emirates.geojson. */
  name: string
  level: WarnLevel
  score: number
  gust: number
  precip: number
  hazards: string[]
  headline: string
  description: string
  from: string
  to: string
  source: WarnSource
}

/** One official NCM warning, mirrored from ncm.gov.ae/maps-warnings. */
export type NcmWarning = {
  id: string
  /** Short type shown on the card, e.g. "Fog". */
  type: string
  level: WarnLevel
  /** Affected emirates — names MUST match the geojson `name` property. */
  emirates: string[]
  headline: string
  description: string
  /** Asia/Dubai local wall-clock, e.g. "2026-09-25T23:00". */
  from: string
  to: string
}

/**
 * Official NCM warnings copied from https://www.ncm.gov.ae/maps-warnings?lang=en.
 *
 * NCM publishes NO machine-readable feed — every warnings endpoint returns 404
 * and the map data is locked to their own origin — so their current published
 * bulletin is mirrored here and COMBINED with the live Open-Meteo timeline.
 * Whenever NCM issues or updates a warning, edit this list (type, level,
 * affected emirates, description, from/to) and it will immediately play on the
 * map polygons and appear in the sidebar alongside the Open-Meteo warnings.
 */
export const NCM_WARNINGS: NcmWarning[] = [
  {
    id: "fog-2026-09-25",
    type: "Fog",
    level: "yellow",
    emirates: ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm al-Quwain", "Ras al-Khaimah"],
    headline: "Fog / low visibility",
    description:
      "A chance of fog formation with a deterioration in horizontal visibility, which may drop even further at times over some coastal and internal areas.",
    from: "2026-09-25T23:00",
    to: "2026-09-26T08:30",
  },
]

const SEVERITY: Record<WarnLevel, number> = { green: 0, yellow: 1, orange: 2, red: 3 }

function levelToScore(level: WarnLevel): number {
  return level === "red" ? 62 : level === "orange" ? 40 : level === "yellow" ? 14 : 0
}

/** Asia/Dubai is UTC+4 year-round (no DST). */
function dubaiMs(iso: string): number {
  return new Date(`${iso}:00+04:00`).getTime()
}

/** Format an Asia/Dubai ISO wall-clock ("2026-09-25T23:00") as "25/09 23:00". */
export function fmtNcmTime(iso: string): string {
  const [date, time = "00:00"] = iso.split("T")
  const [, month = "01", day = "01"] = date.split("-")
  return `${day}/${month} ${time.slice(0, 5)}`
}

// Representative point per emirate (matches the ADM1 polygon names).
const EMIRATES: { name: string; lat: number; lon: number }[] = [
  { name: "Abu Dhabi", lat: 24.28, lon: 54.55 },
  { name: "Dubai", lat: 25.2, lon: 55.27 },
  { name: "Sharjah", lat: 25.35, lon: 55.45 },
  { name: "Ajman", lat: 25.41, lon: 55.44 },
  { name: "Umm al-Quwain", lat: 25.56, lon: 55.55 },
  { name: "Ras al-Khaimah", lat: 25.79, lon: 55.95 },
  { name: "Fujairah", lat: 25.29, lon: 56.26 },
]

const THUNDER = new Set([95, 96, 99])
const CONVECTIVE = new Set([80, 81, 82, 95, 96, 99])
const FOG = new Set([45, 48])

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// NCM issues its fog "Be Aware" warning from forecast horizontal visibility, not
// from a weather symbol. Open-Meteo reports visibility in metres. These are the
// standard aviation/met fog thresholds NCM's alerts track.
const VIS_DENSE_FOG = 1000 // < 1 km: dense fog
const VIS_FOG = 2000 // < 2 km: fog
const VIS_MIST = 5000 // < 5 km: mist / reduced horizontal visibility

/** True when the hour meets NCM's fog criteria (by symbol or by visibility). */
function isFoggy(code: number, visibility: number): boolean {
  return FOG.has(code) || (Number.isFinite(visibility) && visibility > 0 && visibility < VIS_MIST)
}

function classify(gust: number, precip: number, code: number, visibility: number): { level: WarnLevel; score: number } {
  let score = 0
  if (gust >= 90) score += 60
  else if (gust >= 65) score += 42
  else if (gust >= 45) score += 24
  else if (gust >= 40) score += 14
  if (precip >= 15) score += 45
  else if (precip >= 5) score += 28
  else if (precip >= 1) score += 14
  else if (precip > 0) score += 6
  if (THUNDER.has(code)) score += 30
  else if (CONVECTIVE.has(code)) score += 16
  if (FOG.has(code)) score += 20
  score = Math.min(100, Math.round(score))
  // Fog / low visibility is a standalone NCM "Be Aware" (yellow) category and
  // must surface even when wind and rain are calm — matching the NCM fog alert.
  // Scale the floor by how low the forecast horizontal visibility drops.
  if (isFoggy(code, visibility)) {
    const vis = Number.isFinite(visibility) && visibility > 0 ? visibility : VIS_FOG
    const foFloor = vis < VIS_DENSE_FOG ? 26 : vis < VIS_FOG ? 20 : 16
    score = Math.max(score, foFloor)
  }
  let level: WarnLevel = "green"
  if (score >= 62) level = "red"
  else if (score >= 40) level = "orange"
  else if (score >= 14) level = "yellow"
  return { level, score }
}

function describe(
  gust: number,
  precip: number,
  code: number,
  visibility: number,
): { hazards: string[]; headline: string; description: string } {
  const hazards: string[] = []
  const windy = gust >= 40
  const rainy = precip > 0 || CONVECTIVE.has(code)
  const foggy = isFoggy(code, visibility)
  const denseFog = foggy && Number.isFinite(visibility) && visibility > 0 && visibility < VIS_DENSE_FOG

  if (rainy) hazards.push(THUNDER.has(code) ? "Thunder rain" : "Rain")
  if (CONVECTIVE.has(code)) hazards.push("Cumulonimbus clouds")
  if (windy) hazards.push("Dust or Sand", "Wind")
  if (foggy) hazards.push(denseFog ? "Dense fog / very low visibility" : "Fog / low visibility")

  let description = "Fair weather with no significant hazards expected."
  if (rainy && windy)
    description = `A chance of convective cloud formation associated with rainfall and fresh to strong winds exceeding ${Math.round(
      gust,
    )} km/h causing blowing dust and sand.`
  else if (rainy)
    description = THUNDER.has(code)
      ? "Convective cumulonimbus clouds bringing thundery showers with a risk of hail and gusty downdrafts."
      : "Convective cloud development bringing scattered showers over some areas."
  else if (windy)
    description = `Fresh to strong ${
      gust >= 65 ? "gale-force " : ""
    }winds exceeding ${Math.round(gust)} km/h over exposed and open areas, causing blowing dust, sand and reduced horizontal visibility.`
  else if (foggy)
    description = "Fog or mist forming overnight and early morning, reducing horizontal visibility over some areas."

  const headline = hazards.length ? hazards.join(", ") : "No active warning"
  return { hazards, headline, description }
}

export type WarningFrames = {
  /** One entry per hour: the emirates under warning at that hour (sorted by severity). */
  frames: EmirateWarning[][]
  /** Local ISO time (Asia/Dubai) for each frame, e.g. "2026-08-26T13:00". */
  times: string[]
  /** When the forecast was fetched (ms epoch). */
  issued: number
}

/**
 * Fetch the real Open-Meteo hourly forecast for the 7 emirates and build a
 * per-hour warning timeline (next `hours` hours). No fabricated data — an hour
 * with no hazards simply yields an empty frame. Designed to be played back like
 * the NCM Al Bahar animated warnings map.
 */
export async function fetchWarningFrames(signal?: AbortSignal, hours = 24): Promise<WarningFrames> {
  const lat = EMIRATES.map((e) => e.lat).join(",")
  const lon = EMIRATES.map((e) => e.lon).join(",")
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_gusts_10m,wind_speed_10m,precipitation,weather_code,visibility&wind_speed_unit=kmh&timezone=Asia%2FDubai&forecast_days=2`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error("warnings fetch failed")
  const json = await res.json()
  const list: any[] = Array.isArray(json) ? json : [json]

  const timeAxis: string[] = list[0]?.hourly?.time ?? []
  const nowMs = Date.now()
  let start = timeAxis.findIndex((t) => new Date(t).getTime() >= nowMs - 60 * 60 * 1000)
  if (start < 0) start = 0
  const end = Math.min(timeAxis.length, start + hours)

  const frames: EmirateWarning[][] = []
  const times: string[] = []

  for (let j = start; j < end; j++) {
    const fromStr = fmt(new Date(timeAxis[j]))
    const toStr = fmt(new Date(timeAxis[Math.min(j + 1, timeAxis.length - 1)]))
    const frame: EmirateWarning[] = []
    EMIRATES.forEach((e, i) => {
      const h = list[i]?.hourly ?? {}
      const gust = Number(h.wind_gusts_10m?.[j] ?? h.wind_speed_10m?.[j] ?? 0)
      const precip = Number(h.precipitation?.[j] ?? 0)
      const code = Number(h.weather_code?.[j] ?? 0)
      const visibility = Number(h.visibility?.[j] ?? Number.NaN)
      const { level, score } = classify(gust, precip, code, visibility)
      if (level === "green") return
      const { hazards, headline, description } = describe(gust, precip, code, visibility)
      frame.push({
        name: e.name,
        level,
        score,
        gust,
        precip,
        hazards,
        headline,
        description,
        from: fromStr,
        to: toStr,
        source: "Open-Meteo",
      })
    })

    // Fold in the official NCM warnings active during this hour, combining them
    // with the Open-Meteo warnings so both feeds display on the same map.
    const hourMs = dubaiMs(timeAxis[j])
    NCM_WARNINGS.forEach((nw) => {
      if (hourMs < dubaiMs(nw.from) || hourMs >= dubaiMs(nw.to)) return
      nw.emirates.forEach((name) => {
        const existing = frame.find((f) => f.name === name)
        if (existing) {
          // Same emirate flagged by both feeds — keep the higher severity and mark both sources.
          if (SEVERITY[nw.level] > SEVERITY[existing.level]) {
            existing.level = nw.level
            existing.score = Math.max(existing.score, levelToScore(nw.level))
          }
          existing.source = "NCM + Open-Meteo"
          existing.hazards = Array.from(new Set([nw.headline, ...existing.hazards]))
          existing.description = `NCM: ${nw.description} · Open-Meteo: ${existing.description}`
        } else {
          frame.push({
            name,
            level: nw.level,
            score: levelToScore(nw.level),
            gust: 0,
            precip: 0,
            hazards: [nw.headline],
            headline: `${nw.type} — ${nw.headline}`,
            description: nw.description,
            from: fmtNcmTime(nw.from),
            to: fmtNcmTime(nw.to),
            source: "NCM",
          })
        }
      })
    })

    frame.sort((a, b) => b.score - a.score)
    frames.push(frame)
    times.push(timeAxis[j])
  }

  return { frames, times, issued: nowMs }
}

export const WARN_FILL: Record<WarnLevel, string> = {
  green: "#2c5d86",
  yellow: "#efe70c",
  orange: "#f5a623",
  red: "#e8442a",
}

export const WARN_LEGEND: { level: WarnLevel; label: string; note: string }[] = [
  { level: "yellow", label: "Be Aware", note: "Be on the lookout if you go for outdoor activities." },
  { level: "orange", label: "Be Prepared", note: "Hazardous weather forecast. Comply with advice from authorities." },
  { level: "red", label: "Take Action", note: "Hazardous weather of exceptional severity is forecast." },
]

