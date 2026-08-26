import type { NextRequest } from "next/server"
import type { AirQuality, Units, WeatherPayload } from "@/lib/weather"

const CURRENT = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "is_day",
  "uv_index",
  "visibility",
].join(",")

const HOURLY = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "relative_humidity_2m",
  "weather_code",
  "is_day",
].join(",")

const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "precipitation_sum",
  "rain_sum",
  "precipitation_probability_max",
  "precipitation_hours",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
  "relative_humidity_2m_mean",
  "uv_index_max",
  "sunrise",
  "sunset",
].join(",")

const AIR = ["us_aqi", "pm10", "pm2_5", "carbon_monoxide", "nitrogen_dioxide", "sulphur_dioxide", "ozone"].join(",")

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

// Free Open-Meteo forecast models. `best_match` blends the best available source.
const MODELS: Record<string, string> = {
  best_match: "best_match",
  ecmwf: "ecmwf_ifs025",
  icon: "icon_seamless",
  gfs: "gfs_seamless",
  meteofrance: "meteofrance_seamless",
  ukmo: "ukmo_seamless",
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const latitude = Number(params.get("lat"))
  const longitude = Number(params.get("lon"))
  const units: Units = params.get("units") === "imperial" ? "imperial" : "metric"
  const modelKey = params.get("model") ?? "best_match"
  const model = MODELS[modelKey] ?? "best_match"

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ error: "Valid lat and lon query parameters are required." }, { status: 400 })
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast")
  forecastUrl.searchParams.set("latitude", String(latitude))
  forecastUrl.searchParams.set("longitude", String(longitude))
  forecastUrl.searchParams.set("current", CURRENT)
  forecastUrl.searchParams.set("hourly", HOURLY)
  forecastUrl.searchParams.set("daily", DAILY)
  forecastUrl.searchParams.set("timezone", "auto")
  forecastUrl.searchParams.set("forecast_days", "7")
  // Single model → Open-Meteo keeps base variable names, so downstream parsing is unchanged.
  if (model !== "best_match") forecastUrl.searchParams.set("models", model)
  if (units === "imperial") {
    forecastUrl.searchParams.set("temperature_unit", "fahrenheit")
    forecastUrl.searchParams.set("wind_speed_unit", "mph")
    forecastUrl.searchParams.set("precipitation_unit", "inch")
  }

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality")
  airUrl.searchParams.set("latitude", String(latitude))
  airUrl.searchParams.set("longitude", String(longitude))
  airUrl.searchParams.set("current", AIR)
  airUrl.searchParams.set("timezone", "auto")

  try {
    const [forecastResponse, airResponse] = await Promise.all([
      fetch(forecastUrl, { next: { revalidate: 180 } }),
      fetch(airUrl, { next: { revalidate: 600 } }),
    ])

    if (!forecastResponse.ok) {
      console.log("[v0] forecast upstream failure:", forecastResponse.status)
      return Response.json({ error: "Weather service is unavailable right now." }, { status: 502 })
    }

    const forecast = await forecastResponse.json()
    const current = forecast.current ?? {}
    const hourlyRaw = forecast.hourly ?? {}
    const dailyRaw = forecast.daily ?? {}

    let air: AirQuality | null = null
    if (airResponse.ok) {
      const airData = await airResponse.json()
      const c = airData.current ?? {}
      air = {
        aqi: typeof c.us_aqi === "number" ? c.us_aqi : null,
        pm2_5: typeof c.pm2_5 === "number" ? c.pm2_5 : null,
        pm10: typeof c.pm10 === "number" ? c.pm10 : null,
        ozone: typeof c.ozone === "number" ? c.ozone : null,
        nitrogenDioxide: typeof c.nitrogen_dioxide === "number" ? c.nitrogen_dioxide : null,
        sulphurDioxide: typeof c.sulphur_dioxide === "number" ? c.sulphur_dioxide : null,
        carbonMonoxide: typeof c.carbon_monoxide === "number" ? c.carbon_monoxide : null,
        pollen: null,
      }
    }

    // Standardised window: hourly.time starts at local 00:00 (timezone=auto), so
    // every day is a clean 00:00 → 23:00 block and every map shares one 24h scale.
    const times: string[] = hourlyRaw.time ?? []
    const allHourly = times.map((time, index) => ({
      time,
      temperature: num(hourlyRaw.temperature_2m?.[index]),
      apparentTemperature: num(hourlyRaw.apparent_temperature?.[index]),
      precipitationProbability: num(hourlyRaw.precipitation_probability?.[index]),
      precipitation: num(hourlyRaw.precipitation?.[index]),
      windSpeed: num(hourlyRaw.wind_speed_10m?.[index]),
      windGusts: num(hourlyRaw.wind_gusts_10m?.[index]),
      windDirection: num(hourlyRaw.wind_direction_10m?.[index]),
      humidity: num(hourlyRaw.relative_humidity_2m?.[index]),
      weatherCode: num(hourlyRaw.weather_code?.[index]),
      isDay: num(hourlyRaw.is_day?.[index], 1) === 1,
    }))

    // Group hours by their local calendar date, then align one 24h block per forecast day.
    const byDate = new Map<string, typeof allHourly>()
    for (const h of allHourly) {
      const key = h.time.slice(0, 10)
      const bucket = byDate.get(key)
      if (bucket) bucket.push(h)
      else byDate.set(key, [h])
    }
    const dayKeys: string[] = dailyRaw.time ?? []
    const hourlyByDay = dayKeys.map((key) => (byDate.get(key) ?? []).slice(0, 24))

    const hourly = hourlyByDay[0]?.length === 24 ? hourlyByDay[0] : allHourly.slice(0, 24)

    // Which of the 24 hours is "now" (match date+hour of the current reading).
    const curHourKey = (current.time ?? "").slice(0, 13)
    let currentHourIndex = hourly.findIndex((h) => h.time.slice(0, 13) === curHourKey)
    if (currentHourIndex < 0) currentHourIndex = 0

    const daily = (dailyRaw.time ?? []).map((date: string, index: number) => ({
      date,
      weatherCode: num(dailyRaw.weather_code?.[index]),
      max: num(dailyRaw.temperature_2m_max?.[index]),
      min: num(dailyRaw.temperature_2m_min?.[index]),
      apparentMax: num(dailyRaw.apparent_temperature_max?.[index]),
      apparentMin: num(dailyRaw.apparent_temperature_min?.[index]),
      precipitationSum: num(dailyRaw.precipitation_sum?.[index]),
      rainSum: num(dailyRaw.rain_sum?.[index]),
      precipitationProbability: num(dailyRaw.precipitation_probability_max?.[index]),
      precipitationHours: num(dailyRaw.precipitation_hours?.[index]),
      windMax: num(dailyRaw.wind_speed_10m_max?.[index]),
      windGustMax: num(dailyRaw.wind_gusts_10m_max?.[index]),
      windDirection: num(dailyRaw.wind_direction_10m_dominant?.[index]),
      humidityMean: num(dailyRaw.relative_humidity_2m_mean?.[index]),
      uvIndexMax: num(dailyRaw.uv_index_max?.[index]),
      sunrise: dailyRaw.sunrise?.[index] ?? "",
      sunset: dailyRaw.sunset?.[index] ?? "",
    }))

    const payload: Omit<WeatherPayload, "location"> = {
      timezone: forecast.timezone ?? "UTC",
      units,
      current: {
        time: current.time ?? new Date().toISOString(),
        temperature: num(current.temperature_2m),
        apparentTemperature: num(current.apparent_temperature),
        humidity: num(current.relative_humidity_2m),
        dewPoint: num(current.dew_point_2m),
        precipitation: num(current.precipitation),
        weatherCode: num(current.weather_code),
        cloudCover: num(current.cloud_cover),
        pressure: num(current.pressure_msl),
        windSpeed: num(current.wind_speed_10m),
        windGusts: num(current.wind_gusts_10m),
        windDirection: num(current.wind_direction_10m),
        isDay: num(current.is_day, 1) === 1,
        uvIndex: num(current.uv_index),
        visibility: num(current.visibility),
      },
      hourly,
      currentHourIndex,
      hourlyByDay,
      daily,
      air,
      fetchedAt: new Date().toISOString(),
    }

    return Response.json(payload)
  } catch (error) {
    console.log("[v0] weather route error:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not reach the weather network." }, { status: 502 })
  }
}
