export type WarnLevel = "green" | "yellow" | "orange" | "red"

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

function classify(gust: number, precip: number, code: number): { level: WarnLevel; score: number } {
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
  if (FOG.has(code)) score += 12
  score = Math.min(100, Math.round(score))
  let level: WarnLevel = "green"
  if (score >= 62) level = "red"
  else if (score >= 40) level = "orange"
  else if (score >= 14) level = "yellow"
  return { level, score }
}

function describe(gust: number, precip: number, code: number): { hazards: string[]; headline: string; description: string } {
  const hazards: string[] = []
  const windy = gust >= 40
  const rainy = precip > 0 || CONVECTIVE.has(code)
  const foggy = FOG.has(code)

  if (rainy) hazards.push(THUNDER.has(code) ? "Thunder rain" : "Rain")
  if (CONVECTIVE.has(code)) hazards.push("Cumulonimbus clouds")
  if (windy) hazards.push("Dust or Sand", "Wind")
  if (foggy) hazards.push("Fog / low visibility")

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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_gusts_10m,wind_speed_10m,precipitation,weather_code&wind_speed_unit=kmh&timezone=Asia%2FDubai&forecast_days=2`
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
      const { level, score } = classify(gust, precip, code)
      if (level === "green") return
      const { hazards, headline, description } = describe(gust, precip, code)
      frame.push({ name: e.name, level, score, gust, precip, hazards, headline, description, from: fromStr, to: toStr })
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

