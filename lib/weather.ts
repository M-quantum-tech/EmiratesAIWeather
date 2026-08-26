export type Units = "metric" | "imperial"

export type StationLocation = {
  id: string
  name: string
  admin?: string
  country?: string
  countryCode?: string
  latitude: number
  longitude: number
  timezone?: string
}

export type CurrentReading = {
  time: string
  temperature: number
  apparentTemperature: number
  humidity: number
  dewPoint: number
  precipitation: number
  weatherCode: number
  cloudCover: number
  pressure: number
  windSpeed: number
  windGusts: number
  windDirection: number
  isDay: boolean
  uvIndex: number
  visibility: number
}

export type HourlyReading = {
  time: string
  temperature: number
  apparentTemperature: number
  precipitationProbability: number
  precipitation: number
  windSpeed: number
  windGusts: number
  windDirection: number
  humidity: number
  weatherCode: number
  isDay: boolean
}

export type DailyReading = {
  date: string
  weatherCode: number
  max: number
  min: number
  apparentMax: number
  apparentMin: number
  precipitationSum: number
  rainSum: number
  precipitationProbability: number
  precipitationHours: number
  windMax: number
  windGustMax: number
  windDirection: number
  humidityMean: number
  uvIndexMax: number
  sunrise: string
  sunset: string
}

export type AirQuality = {
  aqi: number | null
  pm2_5: number | null
  pm10: number | null
  ozone: number | null
  nitrogenDioxide: number | null
  sulphurDioxide: number | null
  carbonMonoxide: number | null
  pollen: number | null
}

export type WeatherPayload = {
  location: StationLocation
  timezone: string
  units: Units
  current: CurrentReading
  /** Always 24 entries, standardised to today's local 00:00 → 23:00. */
  hourly: HourlyReading[]
  /** Index within `hourly` (0–23) that matches the current local hour. */
  currentHourIndex: number
  /** One 24-entry (00:00 → 23:00) array per forecast day, aligned to `daily`. */
  hourlyByDay: HourlyReading[][]
  daily: DailyReading[]
  air: AirQuality | null
  fetchedAt: string
}

type Condition = { label: string; short: string; group: ConditionGroup }
export type ConditionGroup =
  | "clear"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm"

const WMO: Record<number, Condition> = {
  0: { label: "Clear sky", short: "Clear", group: "clear" },
  1: { label: "Mainly clear", short: "Mainly clear", group: "clear" },
  2: { label: "Partly cloudy", short: "Partly cloudy", group: "cloud" },
  3: { label: "Overcast", short: "Overcast", group: "cloud" },
  45: { label: "Fog", short: "Fog", group: "fog" },
  48: { label: "Depositing rime fog", short: "Rime fog", group: "fog" },
  51: { label: "Light drizzle", short: "Drizzle", group: "drizzle" },
  53: { label: "Moderate drizzle", short: "Drizzle", group: "drizzle" },
  55: { label: "Dense drizzle", short: "Drizzle", group: "drizzle" },
  56: { label: "Light freezing drizzle", short: "Freezing drizzle", group: "drizzle" },
  57: { label: "Dense freezing drizzle", short: "Freezing drizzle", group: "drizzle" },
  61: { label: "Slight rain", short: "Rain", group: "rain" },
  63: { label: "Moderate rain", short: "Rain", group: "rain" },
  65: { label: "Heavy rain", short: "Heavy rain", group: "rain" },
  66: { label: "Light freezing rain", short: "Freezing rain", group: "rain" },
  67: { label: "Heavy freezing rain", short: "Freezing rain", group: "rain" },
  71: { label: "Slight snowfall", short: "Snow", group: "snow" },
  73: { label: "Moderate snowfall", short: "Snow", group: "snow" },
  75: { label: "Heavy snowfall", short: "Heavy snow", group: "snow" },
  77: { label: "Snow grains", short: "Snow grains", group: "snow" },
  80: { label: "Slight rain showers", short: "Showers", group: "rain" },
  81: { label: "Moderate rain showers", short: "Showers", group: "rain" },
  82: { label: "Violent rain showers", short: "Heavy showers", group: "rain" },
  85: { label: "Slight snow showers", short: "Snow showers", group: "snow" },
  86: { label: "Heavy snow showers", short: "Snow showers", group: "snow" },
  95: { label: "Thunderstorm", short: "Thunderstorm", group: "storm" },
  96: { label: "Thunderstorm with hail", short: "Storm + hail", group: "storm" },
  99: { label: "Thunderstorm with heavy hail", short: "Storm + hail", group: "storm" },
}

export function describeCode(code: number): Condition {
  return WMO[code] ?? { label: "Unknown", short: "Unknown", group: "cloud" }
}

/** Weather-condition emoji from a WMO code, honouring day/night for clear/cloud. */
export function weatherEmoji(code: number, isDay = true) {
  switch (describeCode(code).group) {
    case "clear":
      return isDay ? "☀️" : "🌙"
    case "cloud":
      return isDay ? "⛅" : "☁️"
    case "fog":
      return "🌫️"
    case "drizzle":
      return "🌦️"
    case "rain":
      return "🌧️"
    case "snow":
      return "🌨️"
    case "storm":
      return "⛈️"
    default:
      return isDay ? "☀️" : "🌙"
  }
}

export function tempUnit(units: Units) {
  return units === "metric" ? "°C" : "°F"
}

export function speedUnit(units: Units) {
  return units === "metric" ? "km/h" : "mph"
}

export function precipUnit(units: Units) {
  return units === "metric" ? "mm" : "in"
}

export function distanceUnit(units: Units) {
  return units === "metric" ? "km" : "mi"
}

export function compass(deg: number) {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  return points[Math.round(deg / 22.5) % 16]
}

export function beaufort(speedKmh: number) {
  const table = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118]
  const index = table.findIndex((limit) => speedKmh < limit)
  return index === -1 ? 12 : index
}

export function aqiBand(aqi: number | null) {
  if (aqi === null) return { label: "No data", tone: "muted" as const, note: "Sensor offline" }
  if (aqi <= 50) return { label: "Good", tone: "good" as const, note: "Air quality is satisfactory" }
  if (aqi <= 100) return { label: "Moderate", tone: "moderate" as const, note: "Acceptable for most people" }
  if (aqi <= 150)
    return { label: "Unhealthy for sensitive", tone: "warn" as const, note: "Sensitive groups should limit exertion" }
  if (aqi <= 200) return { label: "Unhealthy", tone: "bad" as const, note: "Reduce prolonged outdoor activity" }
  if (aqi <= 300) return { label: "Very unhealthy", tone: "bad" as const, note: "Avoid outdoor exertion" }
  return { label: "Hazardous", tone: "bad" as const, note: "Stay indoors if possible" }
}

export function uvBand(uv: number) {
  if (uv < 3) return { label: "Low", tone: "good" as const }
  if (uv < 6) return { label: "Moderate", tone: "moderate" as const }
  if (uv < 8) return { label: "High", tone: "warn" as const }
  if (uv < 11) return { label: "Very high", tone: "bad" as const }
  return { label: "Extreme", tone: "bad" as const }
}

export type Advisory = {
  id: string
  level: "watch" | "advisory" | "warning"
  title: string
  detail: string
}

/** Derives local advisories from the observed + forecast values. */
export function buildAdvisories(data: WeatherPayload): Advisory[] {
  const out: Advisory[] = []
  const { current, daily, hourly, air, units } = data
  const hot = units === "metric" ? 33 : 91
  const freeze = units === "metric" ? 0 : 32
  const windAdvisory = units === "metric" ? 50 : 31
  const windWarning = units === "metric" ? 75 : 47
  const heavyRain = units === "metric" ? 20 : 0.8

  if (current.apparentTemperature >= hot) {
    out.push({
      id: "heat",
      level: "warning",
      title: "Heat stress",
      detail: `Feels like ${Math.round(current.apparentTemperature)}${tempUnit(units)}. Hydrate and limit midday exposure.`,
    })
  }
  if (current.temperature <= freeze) {
    out.push({
      id: "freeze",
      level: "advisory",
      title: "Freezing conditions",
      detail: `Air temperature at ${Math.round(current.temperature)}${tempUnit(units)}. Watch for ice on surfaces.`,
    })
  }
  if (current.windGusts >= windWarning) {
    out.push({
      id: "wind-warning",
      level: "warning",
      title: "Damaging wind gusts",
      detail: `Gusts to ${Math.round(current.windGusts)} ${speedUnit(units)} from the ${compass(current.windDirection)}.`,
    })
  } else if (current.windGusts >= windAdvisory) {
    out.push({
      id: "wind-advisory",
      level: "advisory",
      title: "Strong wind",
      detail: `Gusts to ${Math.round(current.windGusts)} ${speedUnit(units)}. Secure loose objects outdoors.`,
    })
  }
  const uvMax = daily[0]?.uvIndexMax ?? 0
  if (uvMax >= 8) {
    out.push({
      id: "uv",
      level: "advisory",
      title: "High UV index",
      detail: `Peak UV of ${uvMax.toFixed(1)} today (${uvBand(uvMax).label}). Sun protection recommended.`,
    })
  }
  const next12 = hourly.slice(0, 12)
  const rainSum = next12.reduce((total, hour) => total + hour.precipitation, 0)
  if (rainSum >= heavyRain) {
    out.push({
      id: "rain",
      level: "watch",
      title: "Heavy precipitation expected",
      detail: `${rainSum.toFixed(1)} ${precipUnit(units)} accumulating over the next 12 hours.`,
    })
  }
  const storm = next12.find((hour) => describeCode(hour.weatherCode).group === "storm")
  if (storm) {
    out.push({
      id: "storm",
      level: "warning",
      title: "Thunderstorm potential",
      detail: `Convective activity signalled around ${formatClock(storm.time, false)} local time.`,
    })
  }
  if (air?.aqi != null && air.aqi > 100) {
    out.push({
      id: "aqi",
      level: air.aqi > 150 ? "warning" : "advisory",
      title: `Air quality ${aqiBand(air.aqi).label.toLowerCase()}`,
      detail: `US AQI ${Math.round(air.aqi)} — ${aqiBand(air.aqi).note.toLowerCase()}.`,
    })
  }
  return out
}

/**
 * Open-Meteo returns naive local timestamps ("2026-08-26T06:34") that already sit
 * in the station's timezone, so they must be read as wall clock — never converted.
 */
export function formatClock(value: string, withMinutes = true) {
  const match = /T(\d{2}):(\d{2})/.exec(value ?? "")
  if (!match) return "—"
  const hour24 = Number(match[1])
  const minutes = match[2]
  const suffix = hour24 < 12 ? "AM" : "PM"
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return withMinutes ? `${hour12}:${minutes} ${suffix}` : `${hour12} ${suffix}`
}

export function formatWeekday(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`)
  return date.toLocaleDateString([], { weekday: "short", timeZone: "UTC" })
}

export function formatLocation(location: StationLocation) {
  return [location.name, location.admin, location.countryCode ?? location.country].filter(Boolean).join(", ")
}

/** Convert km/h to m/s (Open-Meteo returns metric wind in km/h). */
export function toMetersPerSecond(kmh: number) {
  return kmh / 3.6
}

/**
 * Rain attenuation estimate (specific attenuation, dB/km) using the ITU-R P.838
 * power law γ = k·R^α, evaluated at a representative Ku-band frequency (~12 GHz,
 * horizontal polarisation: k≈0.0188, α≈1.217). R is rain rate in mm/h. This is the
 * signal fade satellite/microwave links experience through the current rain cell.
 */
export function rainAttenuation(rainRateMmPerHour: number) {
  const R = Math.max(0, rainRateMmPerHour)
  if (R === 0) return 0
  const k = 0.0188
  const alpha = 1.217
  return k * Math.pow(R, alpha)
}

export function attenuationBand(dbPerKm: number) {
  if (dbPerKm < 0.1) return { label: "Negligible", tone: "good" as const }
  if (dbPerKm < 1) return { label: "Low fade", tone: "moderate" as const }
  if (dbPerKm < 3) return { label: "Moderate fade", tone: "warn" as const }
  return { label: "Severe fade", tone: "bad" as const }
}

export type AlertLevel = "green" | "yellow" | "orange" | "red"

/** Proximity radius (km) the danger buzzer scans for severe conditions. */
export const DANGER_RADIUS_KM = 30

export type HazardKey = "wind" | "gust" | "rain" | "precip"

export type Hazard = {
  key: HazardKey
  label: string
  /** Formatted value with unit, e.g. "68 km/h". */
  value: string
  /** Raw magnitude used for ranking. */
  raw: number
  level: AlertLevel
}

export type WeatherAlert = {
  level: AlertLevel
  code: string
  /** Standing-guy emoji reflecting posture at this alert level. */
  emoji: string
  title: string
  headline: string
  detail: string
  advice: string
  /** 0-100 severity score used for the meter. */
  score: number
  /** Live background hazards (wind / gust / rain / precipitation) with their own levels. */
  hazards: Hazard[]
  /** True when severe conditions are detected within DANGER_RADIUS_KM → trips the red buzzer. */
  danger: boolean
}

const ALERT_META: Record<AlertLevel, { code: string; emoji: string; title: string }> = {
  green: { code: "GREEN", emoji: "🧍", title: "SAFE" },
  yellow: { code: "YELLOW", emoji: "🧍‍♂️", title: "CAUTION" },
  orange: { code: "ORANGE", emoji: "🏃", title: "SEVERE" },
  red: { code: "RED", emoji: "🏃‍♂️💨", title: "DANGER" },
}

/**
 * Four-level weather alert model. Combines the strongest derived advisory with raw
 * severity signals (gusts, rain, heat, storms, air quality) into a single level:
 * green = safe, yellow/orange = escalating warnings, red = take shelter.
 */
export function buildAlert(data: WeatherPayload): WeatherAlert {
  const { current, hourly, air, units } = data
  const gust = units === "metric" ? current.windGusts : current.windGusts * 1.609
  const feels = units === "metric" ? current.apparentTemperature : ((current.apparentTemperature - 32) * 5) / 9
  const next6 = hourly.slice(0, 6)
  const rain6 = next6.reduce((sum, h) => sum + h.precipitation, 0) * (units === "metric" ? 1 : 25.4)
  const storm = next6.some((h) => describeCode(h.weatherCode).group === "storm")
  const aqi = air?.aqi ?? 0

  let score = 0
  // Wind gusts (km/h)
  if (gust >= 90) score += 55
  else if (gust >= 65) score += 38
  else if (gust >= 45) score += 20
  else if (gust >= 30) score += 8
  // Rain accumulation next 6h (mm)
  if (rain6 >= 30) score += 45
  else if (rain6 >= 15) score += 28
  else if (rain6 >= 5) score += 14
  else if (rain6 >= 1) score += 5
  // Apparent heat/cold (°C)
  if (feels >= 45 || feels <= -10) score += 35
  else if (feels >= 40 || feels <= -5) score += 22
  else if (feels >= 35 || feels <= 0) score += 10
  // Thunderstorm in the near term
  if (storm) score += 30
  // Air quality
  if (aqi > 200) score += 30
  else if (aqi > 150) score += 18
  else if (aqi > 100) score += 8

  score = Math.min(100, Math.round(score))

  let level: AlertLevel = "green"
  if (score >= 70) level = "red"
  else if (score >= 45) level = "orange"
  else if (score >= 20) level = "yellow"

  // Live background-data hazards (values shown in native units) with their own severity.
  const wind = units === "metric" ? current.windSpeed : current.windSpeed * 1.609
  const precipNow = units === "metric" ? current.precipitation : current.precipitation * 25.4
  const bandWind = (v: number): AlertLevel => (v >= 65 ? "red" : v >= 45 ? "orange" : v >= 30 ? "yellow" : "green")
  const bandRain = (v: number): AlertLevel => (v >= 30 ? "red" : v >= 15 ? "orange" : v >= 5 ? "yellow" : "green")
  const bandPrecip = (v: number): AlertLevel => (v >= 7.6 ? "red" : v >= 2.5 ? "orange" : v >= 0.5 ? "yellow" : "green")

  const hazards: Hazard[] = [
    {
      key: "gust",
      label: "Wind gust",
      value: `${Math.round(current.windGusts)} ${speedUnit(units)}`,
      raw: gust,
      level: bandWind(gust),
    },
    {
      key: "wind",
      label: "Wind",
      value: `${Math.round(current.windSpeed)} ${speedUnit(units)}`,
      raw: wind,
      level: bandWind(wind),
    },
    {
      key: "rain",
      label: "Rain (6h)",
      value: `${rain6.toFixed(1)} ${precipUnit(units)}`,
      raw: rain6,
      level: bandRain(rain6),
    },
    {
      key: "precip",
      label: "Precip now",
      value: `${precipNow.toFixed(1)} ${precipUnit(units)}/h`,
      raw: precipNow,
      level: bandPrecip(precipNow),
    },
  ]

  // Red buzzer trips when any single background hazard is red-severe or storms are imminent
  // within the local danger radius — the combined level alone can lag a fast-moving cell.
  const danger = level === "red" || storm || hazards.some((h) => h.level === "red")

  const meta = ALERT_META[level]
  const copy: Record<AlertLevel, { headline: string; detail: string; advice: string }> = {
    green: {
      headline: "All clear — conditions are calm and safe",
      detail: "The AI model detects no significant hazards across wind, rain, heat or air quality within 30 km.",
      advice: "Enjoy the outdoors — a great window for any activity.",
    },
    yellow: {
      headline: "Caution — stay weather-aware",
      detail: "Minor hazards developing nearby. Keep an eye on changing wind, rain or air-quality trends.",
      advice: "Carry a layer or umbrella and check back before heading out.",
    },
    orange: {
      headline: "Severe — prepare and take precautions",
      detail: "Notable hazards likely within 30 km — strong gusts, heavy rain, extreme feels-like, or poor air.",
      advice: "Postpone exposed activities, secure loose items, and stay near shelter.",
    },
    red: {
      headline: "Danger — take shelter immediately",
      detail: "Severe hazards detected within 30 km. Travel and outdoor exposure are risky right now.",
      advice: "Stay indoors, avoid travel, and follow official emergency guidance.",
    },
  }

  return {
    level,
    code: meta.code,
    emoji: meta.emoji,
    title: meta.title,
    score,
    hazards,
    danger,
    ...copy[level],
  }
}

/**
 * Compact per-day safety level for the 7-day strip. Uses each day's max gust, rain
 * total and thunderstorm code — the same thresholds as the live model, day-scaled.
 */
export function buildDailyAlert(day: DailyReading, units: Units): { level: AlertLevel; score: number } {
  const gust = units === "metric" ? day.windGustMax : day.windGustMax * 1.609
  const rain = units === "metric" ? day.precipitationSum : day.precipitationSum * 25.4
  const feels = units === "metric" ? day.apparentMax : ((day.apparentMax - 32) * 5) / 9
  const storm = describeCode(day.weatherCode).group === "storm"

  let score = 0
  if (gust >= 90) score += 55
  else if (gust >= 65) score += 38
  else if (gust >= 45) score += 20
  else if (gust >= 30) score += 8
  if (rain >= 40) score += 45
  else if (rain >= 20) score += 28
  else if (rain >= 8) score += 14
  else if (rain >= 2) score += 5
  if (feels >= 45) score += 30
  else if (feels >= 40) score += 18
  else if (feels >= 35) score += 8
  if (storm) score += 30
  score = Math.min(100, Math.round(score))

  let level: AlertLevel = "green"
  if (score >= 70) level = "red"
  else if (score >= 45) level = "orange"
  else if (score >= 20) level = "yellow"
  return { level, score }
}
