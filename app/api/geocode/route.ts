import type { NextRequest } from "next/server"
import type { StationLocation } from "@/lib/weather"

type OpenMeteoPlace = {
  id: number
  name: string
  latitude: number
  longitude: number
  country?: string
  country_code?: string
  admin1?: string
  timezone?: string
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const query = params.get("q")?.trim()
  const lat = Number(params.get("lat"))
  const lon = Number(params.get("lon"))

  try {
    // Reverse lookup for a device coordinate.
    if (!query && Number.isFinite(lat) && Number.isFinite(lon)) {
      const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client")
      url.searchParams.set("latitude", String(lat))
      url.searchParams.set("longitude", String(lon))
      url.searchParams.set("localityLanguage", "en")

      const fallback: StationLocation = {
        id: `${lat.toFixed(3)},${lon.toFixed(3)}`,
        name: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`,
        latitude: lat,
        longitude: lon,
      }

      const response = await fetch(url, { next: { revalidate: 86400 } })
      if (!response.ok) return Response.json({ location: fallback })

      const place = await response.json()
      const name = place.city || place.locality || place.principalSubdivision || fallback.name
      return Response.json({
        location: {
          id: `${lat.toFixed(3)},${lon.toFixed(3)}`,
          name,
          admin: place.principalSubdivision || undefined,
          country: place.countryName || undefined,
          countryCode: place.countryCode || undefined,
          latitude: lat,
          longitude: lon,
        } satisfies StationLocation,
      })
    }

    if (!query || query.length < 2) {
      return Response.json({ results: [] })
    }

    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", query)
    url.searchParams.set("count", "8")
    url.searchParams.set("language", "en")
    url.searchParams.set("format", "json")

    const response = await fetch(url, { next: { revalidate: 86400 } })
    if (!response.ok) {
      return Response.json({ results: [] })
    }
    const data = await response.json()
    const results: StationLocation[] = (data.results ?? []).map((place: OpenMeteoPlace) => ({
      id: String(place.id),
      name: place.name,
      admin: place.admin1,
      country: place.country,
      countryCode: place.country_code,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    }))

    return Response.json({ results })
  } catch (error) {
    console.log("[v0] geocode route error:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Location lookup failed." }, { status: 502 })
  }
}
