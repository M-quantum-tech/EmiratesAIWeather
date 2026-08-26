import type { ConditionGroup } from "@/lib/weather"

export type LocalAd = {
  id: string
  business: string
  category: string
  headline: string
  offer: string
  /** City this listing is scoped to. Matched loosely against the station name. */
  city: string
  url: string
  /** Weather groups this offer is most relevant to. Empty = always eligible. */
  weather?: ConditionGroup[]
  /** Show more strongly when it is hot / cold, in °C. */
  tempBias?: "hot" | "cold"
}

/**
 * Curated in-app local listings. This is a hand-maintained roster, not an ad
 * network, so every entry is a known local business. Sponsors are matched to
 * the viewed city and ranked by how well they fit the current conditions.
 */
export const LOCAL_ADS: LocalAd[] = [
  // San Francisco
  {
    id: "sf-fog-coffee",
    business: "Karl's Fog Roasters",
    category: "Coffee",
    headline: "Warm up on a gray morning",
    offer: "20% off any hot pour-over before 10am",
    city: "San Francisco",
    url: "https://example.com/karls-fog",
    weather: ["cloud", "fog", "drizzle", "rain"],
    tempBias: "cold",
  },
  {
    id: "sf-bike",
    business: "Presidio Cycle Rentals",
    category: "Outdoors",
    headline: "Ride the waterfront while it's clear",
    offer: "Half-day bike rental for $18",
    city: "San Francisco",
    url: "https://example.com/presidio-cycle",
    weather: ["clear", "cloud"],
  },
  {
    id: "sf-umbrella",
    business: "Market Street Outfitters",
    category: "Retail",
    headline: "Storm-ready gear",
    offer: "Buy any shell, get a compact umbrella free",
    city: "San Francisco",
    url: "https://example.com/market-outfitters",
    weather: ["rain", "drizzle", "storm"],
  },
  // New York
  {
    id: "ny-icecream",
    business: "Prospect Scoop Co.",
    category: "Food",
    headline: "Beat the heat in the park",
    offer: "$2 off any two scoops",
    city: "New York",
    url: "https://example.com/prospect-scoop",
    weather: ["clear"],
    tempBias: "hot",
  },
  {
    id: "ny-brunch",
    business: "Hell's Kitchen Brunch Club",
    category: "Food",
    headline: "Cozy indoor brunch",
    offer: "Bottomless coffee with any entrée",
    city: "New York",
    url: "https://example.com/hk-brunch",
    weather: ["rain", "snow", "cloudy"],
    tempBias: "cold",
  },
  // Reykjavik
  {
    id: "rk-thermal",
    business: "Laugar Thermal Baths",
    category: "Wellness",
    headline: "Warm geothermal soak",
    offer: "Evening pass 15% off",
    city: "Reykjav",
    url: "https://example.com/laugar-baths",
    weather: ["snow", "rain", "cloudy", "fog"],
    tempBias: "cold",
  },
  {
    id: "rk-aurora",
    business: "Nordur Aurora Tours",
    category: "Tours",
    headline: "Clear skies tonight",
    offer: "Northern lights minibus tour — book 2, get 10% off",
    city: "Reykjav",
    url: "https://example.com/nordur-aurora",
    weather: ["clear"],
  },
]

/**
 * Generic offers used when no curated listing matches the viewed city, so the
 * panel is never empty. They read as national sponsors rather than fake locals.
 */
export const FALLBACK_ADS: LocalAd[] = [
  {
    id: "generic-rain",
    business: "AllWeather Gear Co.",
    category: "Retail",
    headline: "Rain in the forecast",
    offer: "Free shipping on jackets over $60",
    city: "",
    url: "https://example.com/allweather",
    weather: ["rain", "drizzle", "thunderstorm", "snow"],
  },
  {
    id: "generic-sun",
    business: "SunShield Optics",
    category: "Retail",
    headline: "Bright day ahead",
    offer: "25% off polarized sunglasses",
    city: "",
    url: "https://example.com/sunshield",
    weather: ["clear"],
    tempBias: "hot",
  },
  {
    id: "generic-delivery",
    business: "DoorFront Delivery",
    category: "Food",
    headline: "Skip the trip",
    offer: "$0 delivery fee on your first 3 orders",
    city: "",
    url: "https://example.com/doorfront",
  },
]

export type RankedAd = LocalAd & { local: boolean }

function cityMatches(adCity: string, stationName: string) {
  if (!adCity) return false
  const a = adCity.toLowerCase()
  const b = stationName.toLowerCase()
  return b.includes(a) || a.includes(b)
}

/**
 * Rank curated ads for the viewed station. Local (city-matched) listings always
 * outrank fallbacks, then weather relevance and temperature bias break ties.
 */
export function rankLocalAds(
  stationName: string,
  group: ConditionGroup,
  temperatureC: number,
  limit = 3,
): RankedAd[] {
  const local = LOCAL_ADS.filter((ad) => cityMatches(ad.city, stationName)).map((ad) => ({ ...ad, local: true }))
  const fallback = FALLBACK_ADS.map((ad) => ({ ...ad, local: false }))

  const score = (ad: RankedAd) => {
    let value = ad.local ? 100 : 0
    if (ad.weather && ad.weather.includes(group)) value += 40
    else if (ad.weather && ad.weather.length > 0) value -= 15
    if (ad.tempBias === "hot" && temperatureC >= 24) value += 20
    if (ad.tempBias === "cold" && temperatureC <= 8) value += 20
    return value
  }

  const pool = local.length > 0 ? [...local, ...fallback] : fallback
  return pool
    .map((ad) => ({ ad, value: score(ad) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((entry) => entry.ad)
}
