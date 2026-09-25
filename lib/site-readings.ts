import type { Units } from "@/lib/weather"
import type { SiteKey, SiteReadings } from "@/lib/escalation"

/** The minimal current-reading shape needed to derive per-site readings. */
export type CurrentReading = {
  windSpeed: number
  windGusts: number
  precipitation: number
  cloudCover: number
}

const ZERO: SiteReadings = { windMs: 0, gustMs: 0, rainMm: 0, cloudPct: 0 }

/**
 * Single source of truth that turns an on-site current reading plus an optional
 * far-site (upwind) current reading into the native-SI per-site readings the
 * escalation ranges are evaluated against. Both the live Alert Banner ladder and
 * the Engineering Console feed their At-site / Far-site indicators through this
 * exact function, so a range edited in the console lights the same indicator in
 * both places from identical numbers.
 */
export function computeSiteReadings(
  units: Units,
  current: CurrentReading | null | undefined,
  far: CurrentReading | null | undefined,
): Record<SiteKey, SiteReadings> {
  const toMs = (v: number) => (units === "metric" ? v : v * 1.609) / 3.6
  const toMm = (v: number) => (units === "metric" ? v : v * 25.4)
  return {
    atSite: current
      ? {
          windMs: toMs(current.windSpeed),
          gustMs: toMs(current.windGusts),
          rainMm: toMm(current.precipitation),
          cloudPct: current.cloudCover,
        }
      : { ...ZERO },
    farSite: far
      ? {
          windMs: toMs(far.windSpeed),
          gustMs: toMs(far.windGusts),
          rainMm: toMm(far.precipitation),
          cloudPct: far.cloudCover,
        }
      : { ...ZERO },
  }
}
