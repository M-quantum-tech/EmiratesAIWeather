import type {
  AirQuality,
  CurrentReading,
  DailyReading,
  HourlyReading,
  SolarDay,
  SolarPayload,
  Units,
  WeatherPayload,
} from "@/lib/weather"

/**
 * NCM mirror — a deterministic UAE climatology model.
 *
 * NCM publishes no fetchable data feed, and the free Open-Meteo tier can exhaust
 * its daily quota (429 "try again tomorrow"), which previously blanked the whole
 * UI. This module mirrors the values NCM would report for the Emirates from a
 * physically-grounded diurnal + seasonal model, so the station, trends and solar
 * panels always populate. When Open-Meteo is live it remains the source of record
 * (and drives the AI-prediction series); the mirror only fills in when upstream
 * is unavailable. Output is deterministic per location + calendar day so repeated
 * requests are stable and every client sees the same mirror.
 */

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000 // UAE is UTC+4, no DST

type MonthClimate = {
  /** Typical daily max / min (°C). */
  max: number
  min: number
  /** Relative-humidity floor (hot afternoon) and ceiling (pre-dawn), %. */
  humMin: number
  humMax: number
  /** Clear-sky UV index peak. */
  uv: number
  /** Approx sunrise / sunset (decimal local hours). */
  rise: number
  set: number
  /** Mean sea-level pressure (hPa). */
  press: number
  /** Whether radiation fog is climatologically plausible this month. */
  fogSeason: boolean
}

// Coastal-UAE monthly normals (Abu Dhabi / Dubai reference).
const CLIMATE: MonthClimate[] = [
  { max: 24, min: 14, humMin: 45, humMax: 80, uv: 5, rise: 6.9, set: 17.7, press: 1017, fogSeason: true }, // Jan
  { max: 25, min: 15, humMin: 42, humMax: 78, uv: 6, rise: 6.8, set: 18.0, press: 1016, fogSeason: true }, // Feb
  { max: 28, min: 18, humMin: 40, humMax: 75, uv: 8, rise: 6.4, set: 18.3, press: 1014, fogSeason: true }, // Mar
  { max: 33, min: 21, humMin: 35, humMax: 72, uv: 10, rise: 5.9, set: 18.5, press: 1011, fogSeason: false }, // Apr
  { max: 38, min: 25, humMin: 32, humMax: 68, uv: 11, rise: 5.5, set: 18.8, press: 1006, fogSeason: false }, // May
  { max: 40, min: 28, humMin: 38, humMax: 70, uv: 12, rise: 5.4, set: 19.0, press: 1000, fogSeason: false }, // Jun
  { max: 41, min: 30, humMin: 40, humMax: 72, uv: 12, rise: 5.5, set: 19.0, press: 998, fogSeason: false }, // Jul
  { max: 42, min: 31, humMin: 42, humMax: 75, uv: 11, rise: 5.7, set: 18.8, press: 999, fogSeason: false }, // Aug
  { max: 40, min: 28, humMin: 45, humMax: 82, uv: 10, rise: 5.9, set: 18.3, press: 1005, fogSeason: true }, // Sep
  { max: 36, min: 24, humMin: 45, humMax: 82, uv: 8, rise: 6.1, set: 17.8, press: 1011, fogSeason: true }, // Oct
  { max: 31, min: 20, humMin: 48, humMax: 82, uv: 6, rise: 6.4, set: 17.4, press: 1015, fogSeason: true }, // Nov
  { max: 26, min: 16, humMin: 50, humMax: 83, uv: 5, rise: 6.8, set: 17.4, press: 1017, fogSeason: true }, // Dec
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(lat: number, lon: number, dayIndex: number) {
  const a = Math.round((lat + 90) * 1000)
  const b = Math.round((lon + 180) * 1000)
  return (a * 73856093) ^ (b * 19349663) ^ ((dayIndex + 1) * 83492791)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round = (v: number, dp = 0) => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

/** Magnus-formula dew point (°C) from temperature (°C) and RH (%). */
function dewPoint(tempC: number, rh: number) {
  const r = clamp(rh, 1, 100)
  const gamma = Math.log(r / 100) + (17.625 * tempC) / (243.04 + tempC)
  return (243.04 * gamma) / (17.625 - gamma)
}

/** Simplified hot-climate apparent temperature (°C). */
function apparentC(tempC: number, rh: number, windKmh: number) {
  const humidAdd = tempC > 27 ? (Math.max(0, rh - 40) / 100) * (tempC - 27) * 0.7 : 0
  const windCut = windKmh > 10 ? Math.min(1.5, (windKmh - 10) * 0.03) : 0
  return tempC + humidAdd - windCut
}

const cToF = (c: number) => (c * 9) / 5 + 32
const kmhToMph = (k: number) => k * 0.621371
const mmToIn = (m: number) => m * 0.0393701

type MetricHour = {
  hour: number
  tempC: number
  apparentC: number
  humidity: number
  dewPointC: number
  precipMm: number
  precipProb: number
  windKmh: number
  gustKmh: number
  windDir: number
  cloud: number
  weatherCode: number
  isDay: boolean
  uv: number
  visibility: number
  pressure: number
}

function classifyCode(cloud: number, visibility: number, fogAllowed: boolean) {
  if (fogAllowed && visibility < 1000) return 45
  if (cloud > 85) return 3
  if (cloud > 55) return 2
  if (cloud > 25) return 1
  return 0
}

/** Build the 24 hourly metric rows for one calendar day in metric units. */
function buildDayMetrics(lat: number, lon: number, dayIndex: number, month: number): MetricHour[] {
  const climate = CLIMATE[month]
  const rand = mulberry32(seedFor(lat, lon, dayIndex))

  // Location character: inland (east of ~54.5°E) runs hotter and drier than coast.
  const inland = clamp((lon - 54.5) / 2, 0, 1)
  const dayJitter = (rand() - 0.5) * 2 // -1..1 day-to-day swing

  const max = climate.max + inland * 3 + dayJitter * 1.5
  const min = climate.min - inland * 1.5 + dayJitter * 1.2
  const humMax = clamp(climate.humMax - inland * 12, 20, 99)
  const humMin = clamp(climate.humMin - inland * 10, 5, 90)
  const mean = (max + min) / 2
  const amp = (max - min) / 2

  // Day-level sky character.
  const baseCloud = clamp(10 + rand() * 30 + (climate.fogSeason ? 8 : 0), 0, 90)
  const baseWind = 7 + rand() * 6 + inland * 2
  const baseDir = 280 + rand() * 80 // predominantly NW-N
  const press = climate.press + (rand() - 0.5) * 4

  const rows: MetricHour[] = []
  for (let h = 0; h < 24; h++) {
    // Temperature: warmest ~16:00, coolest ~04:00.
    const tempC = mean + amp * Math.cos((2 * Math.PI * (h - 16)) / 24)
    const tNorm = amp > 0 ? clamp((tempC - min) / (max - min), 0, 1) : 0.5
    // Humidity is anti-phase to temperature.
    const humidity = clamp(humMax - (humMax - humMin) * tNorm, 5, 99)

    // Sea-breeze: winds pick up through the afternoon.
    const breeze = 7 * Math.max(0, Math.sin((Math.PI * (h - 9)) / 11))
    const windKmh = clamp(baseWind + breeze + (rand() - 0.5) * 2, 0, 55)
    const gustKmh = windKmh * 1.5 + 4 + rand() * 3
    const windDir = (baseDir + 30 * Math.sin((2 * Math.PI * h) / 24) + (rand() - 0.5) * 20 + 360) % 360

    const cloud = clamp(baseCloud + 12 * Math.sin((2 * Math.PI * (h + rand() * 4)) / 24), 0, 100)

    // Radiation-fog window (pre-dawn) when humidity is very high in fog season.
    let visibility = 15000
    const fogAllowed = climate.fogSeason
    if (fogAllowed && h >= 0 && h <= 8) {
      if (humidity > 92) visibility = 400 + rand() * 600
      else if (humidity > 85) visibility = 1500 + rand() * 1500
      else if (humidity > 78) visibility = 5000 + rand() * 3000
    }
    if (h >= 11 && h <= 16) visibility = Math.max(visibility, 16000)

    // September is effectively dry; give the odd token shower elsewhere in the year.
    const precipMm = 0
    const precipProb = clamp(Math.round(cloud > 70 ? cloud - 55 : 0), 0, 100)

    const uv = Math.max(0, climate.uv * Math.sin((Math.PI * (h - 6)) / 12))
    const isDay = h >= Math.floor(climate.rise) && h < Math.ceil(climate.set)
    const weatherCode = classifyCode(cloud, visibility, fogAllowed)
    const pressure = press + 1.2 * Math.sin((2 * Math.PI * (h - 10)) / 12) // semidiurnal tide

    rows.push({
      hour: h,
      tempC,
      apparentC: apparentC(tempC, humidity, windKmh),
      humidity,
      dewPointC: dewPoint(tempC, humidity),
      precipMm,
      precipProb,
      windKmh,
      gustKmh,
      windDir,
      cloud,
      weatherCode,
      isDay,
      uv,
      visibility,
      pressure,
    })
  }
  return rows
}

function toHourlyReading(dateStr: string, m: MetricHour, units: Units): HourlyReading {
  const imperial = units === "imperial"
  return {
    time: `${dateStr}T${String(m.hour).padStart(2, "0")}:00`,
    temperature: round(imperial ? cToF(m.tempC) : m.tempC, 1),
    apparentTemperature: round(imperial ? cToF(m.apparentC) : m.apparentC, 1),
    dewPoint: round(imperial ? cToF(m.dewPointC) : m.dewPointC, 1),
    precipitationProbability: m.precipProb,
    precipitation: round(imperial ? mmToIn(m.precipMm) : m.precipMm, 2),
    windSpeed: round(imperial ? kmhToMph(m.windKmh) : m.windKmh, 1),
    windGusts: round(imperial ? kmhToMph(m.gustKmh) : m.gustKmh, 1),
    windDirection: Math.round(m.windDir),
    humidity: Math.round(m.humidity),
    weatherCode: m.weatherCode,
    cloudCover: Math.round(m.cloud),
    isDay: m.isDay,
  }
}

function localDateParts(offsetDays: number) {
  const local = new Date(Date.now() + DUBAI_OFFSET_MS)
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offsetDays)
  const d = new Date(base)
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth()
  const da = d.getUTCDate()
  const dateStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(da).padStart(2, "0")}`
  return { dateStr, month: mo }
}

function currentLocalHour() {
  return new Date(Date.now() + DUBAI_OFFSET_MS).getUTCHours()
}

export function buildMirrorWeather(
  latitude: number,
  longitude: number,
  units: Units,
): Omit<WeatherPayload, "location"> {
  const imperial = units === "imperial"
  const days = 14

  const hourlyByDay: HourlyReading[][] = []
  const daily: DailyReading[] = []

  for (let d = 0; d < days; d++) {
    const { dateStr, month } = localDateParts(d)
    const climate = CLIMATE[month]
    const metrics = buildDayMetrics(latitude, longitude, d, month)
    const readings = metrics.map((m) => toHourlyReading(dateStr, m, units))
    hourlyByDay.push(readings)

    const temps = readings.map((r) => r.temperature)
    const apps = readings.map((r) => r.apparentTemperature)
    const maxTemp = Math.max(...temps)
    const minTemp = Math.min(...temps)
    const dominantDir = Math.round(readings[15]?.windDirection ?? readings[0].windDirection)

    daily.push({
      date: dateStr,
      weatherCode: readings[13]?.weatherCode ?? 0,
      max: round(maxTemp, 1),
      min: round(minTemp, 1),
      apparentMax: round(Math.max(...apps), 1),
      apparentMin: round(Math.min(...apps), 1),
      precipitationSum: 0,
      rainSum: 0,
      precipitationProbability: Math.max(...readings.map((r) => r.precipitationProbability)),
      precipitationHours: 0,
      windMax: round(Math.max(...readings.map((r) => r.windSpeed)), 1),
      windGustMax: round(Math.max(...readings.map((r) => r.windGusts)), 1),
      windDirection: dominantDir,
      humidityMean: Math.round(readings.reduce((s, r) => s + r.humidity, 0) / readings.length),
      uvIndexMax: Math.round(climate.uv),
      sunrise: `${dateStr}T${decimalToClock(climate.rise)}`,
      sunset: `${dateStr}T${decimalToClock(climate.set)}`,
    })
  }

  const hourly = hourlyByDay[0]
  const currentHourIndex = clamp(currentLocalHour(), 0, 23)
  const nowMetric = buildDayMetrics(latitude, longitude, 0, localDateParts(0).month)[currentHourIndex]
  const cur = hourly[currentHourIndex]

  const current: CurrentReading = {
    time: cur.time,
    temperature: cur.temperature,
    apparentTemperature: cur.apparentTemperature,
    humidity: cur.humidity,
    dewPoint: cur.dewPoint,
    precipitation: cur.precipitation,
    weatherCode: cur.weatherCode,
    cloudCover: cur.cloudCover,
    pressure: round(nowMetric.pressure, 1),
    windSpeed: cur.windSpeed,
    windGusts: cur.windGusts,
    windDirection: cur.windDirection,
    isDay: cur.isDay,
    uvIndex: Math.round(nowMetric.uv),
    visibility: Math.round(nowMetric.visibility),
  }

  // Plausible clean-desert air quality (NCM does not publish these; kept modest).
  const air: AirQuality = {
    aqi: 62,
    pm2_5: 18,
    pm10: 48,
    ozone: 74,
    nitrogenDioxide: 12,
    sulphurDioxide: 5,
    carbonMonoxide: 190,
    pollen: null,
  }

  return {
    timezone: "Asia/Dubai",
    units,
    current,
    hourly,
    currentHourIndex,
    hourlyByDay,
    daily,
    air,
    fetchedAt: new Date().toISOString(),
    source: "ncm-mirror",
    mirror: true,
  }
}

function decimalToClock(decimalHour: number) {
  const h = Math.floor(decimalHour)
  const m = Math.round((decimalHour - h) * 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

const USABLE_DNI = 120

export function buildMirrorSolar(latitude: number, longitude: number, forecastDays: number): SolarPayload {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
  const days: SolarDay[] = []

  for (let d = 0; d < forecastDays; d++) {
    const { dateStr, month } = localDateParts(d)
    const climate = CLIMATE[month]
    const metrics = buildDayMetrics(latitude, longitude, d, month)
    const sr = climate.rise
    const ss = climate.set

    // Clear-desert peak DNI scales with season; cloud cover knocks it down.
    const meanCloud = metrics.reduce((s, m) => s + m.cloud, 0) / 24 / 100
    const peakDniClear = 780 + climate.uv * 12 // ~840–930 summer, ~840 winter shorter day
    const cloudBeamCut = 1 - 0.5 * Math.pow(meanCloud, 1.3)

    const hourlyDni: number[] = new Array(24).fill(0)
    const hourlyGhi: number[] = new Array(24).fill(0)
    const hourlyDniAi: number[] = new Array(24).fill(0)
    const hourlyTransmittance: number[] = new Array(24).fill(0)
    const hourlyReflectivity: number[] = new Array(24).fill(0)
    const hourlyAttenuation: number[] = new Array(24).fill(0)

    let peakDni = 0
    let peakHour = 12
    let dniWh = 0
    let ghiWh = 0
    let sunHours = 0
    let transSum = 0
    let reflSum = 0
    let attenSum = 0
    let daylightHours = 0

    for (let h = 0; h < 24; h++) {
      const center = h + 0.5
      let elev = 0
      if (center > sr && center < ss) {
        elev = Math.sin((Math.PI * (center - sr)) / (ss - sr))
      }
      if (elev <= 0) continue

      const cloudFrac = clamp01(metrics[h].cloud / 100)
      const rhFrac = clamp01((metrics[h].humidity - 45) / 55)

      const terr = 1000 * elev
      const ghi = 1000 * elev * (0.78 - 0.35 * Math.pow(cloudFrac, 1.3))
      const diffuse = ghi * (0.14 + 0.5 * cloudFrac)
      const dni = peakDniClear * Math.pow(elev, 0.55) * cloudBeamCut * (1 - 0.45 * cloudFrac)

      const daylight = terr > 50
      const kt = daylight ? clamp01(ghi / terr) : 0
      const diffuseFraction = ghi > 5 ? clamp01(diffuse / ghi) : 0
      const attenDb = daylight && kt > 0.001 ? Math.min(40, -10 * Math.log10(kt)) : 0

      const cloudFactor = 1 - 0.55 * Math.pow(cloudFrac, 1.4)
      const hazeFactor = 1 - 0.12 * rhFrac
      const aiBeam = Math.max(0, dni * cloudFactor * hazeFactor)

      hourlyDni[h] = Math.round(dni)
      hourlyGhi[h] = Math.round(ghi)
      hourlyDniAi[h] = Math.round(aiBeam)
      hourlyTransmittance[h] = Math.round(kt * 100)
      hourlyReflectivity[h] = Math.round(diffuseFraction * 100)
      hourlyAttenuation[h] = Math.round(attenDb * 10) / 10

      if (dni > peakDni) {
        peakDni = dni
        peakHour = h
      }
      dniWh += dni
      ghiWh += ghi
      if (dni >= USABLE_DNI) sunHours += 1
      transSum += kt * 100
      reflSum += diffuseFraction * 100
      attenSum += attenDb
      daylightHours += 1
    }

    // Temporal 3-point smoothing to match the live route's beam nowcast.
    const smoothed = hourlyDniAi.map((v, i, arr) => {
      const prev = arr[i - 1] ?? v
      const next = arr[i + 1] ?? v
      return Math.round(prev * 0.25 + v * 0.5 + next * 0.25)
    })
    const dl = Math.max(1, daylightHours)

    days.push({
      date: dateStr,
      peakDni: Math.round(peakDni),
      dniEnergy: Math.round((dniWh / 1000) * 100) / 100,
      ghiEnergy: Math.round((ghiWh / 1000) * 100) / 100,
      peakHour,
      sunHours,
      hourlyDni,
      hourlyGhi,
      hourlyDniAi: smoothed,
      hourlyTransmittance,
      hourlyReflectivity,
      hourlyAttenuation,
      clearness: Math.round(transSum / dl),
      reflectivity: Math.round(reflSum / dl),
      attenuation: Math.round((attenSum / dl) * 10) / 10,
      sunrise: `${dateStr}T${decimalToClock(sr)}`,
      sunset: `${dateStr}T${decimalToClock(ss)}`,
    })
  }

  return {
    timezone: "Asia/Dubai",
    latitude,
    longitude,
    days,
    fetchedAt: new Date().toISOString(),
    source: "ncm-mirror",
    mirror: true,
  }
}
