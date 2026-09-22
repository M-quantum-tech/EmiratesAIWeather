"use client"

import { MapPin } from "lucide-react"
import { ALERT_RADII_KM, type AlertLevel } from "@/lib/weather"
import { cn } from "@/lib/utils"

/** Outer → inner. Green is the widest ring (farthest), red the tightest (closest). */
const TIERS: { level: AlertLevel; label: string; ring: string; dot: string; text: string }[] = [
  { level: "green", label: "GREEN", ring: "border-alert-green/60", dot: "bg-alert-green", text: "text-alert-green" },
  { level: "yellow", label: "YELLOW", ring: "border-alert-yellow/60", dot: "bg-alert-yellow", text: "text-alert-yellow" },
  { level: "orange", label: "ORANGE", ring: "border-alert-orange/60", dot: "bg-alert-orange", text: "text-alert-orange" },
  { level: "red", label: "RED", ring: "border-alert-red/70", dot: "bg-alert-red", text: "text-alert-red" },
]

const MAX_PX = 300 // diameter of the outermost (green) ring
const RANK: Record<AlertLevel, number> = { green: 0, yellow: 1, orange: 2, red: 3 }

/**
 * Concentric proximity radar. Each ring is a distance band from the user pin in
 * the centre; the active tier lights up and drops a pulsing hazard blip on its
 * ring, visualising how close the current hazard is to the user's location.
 */
export function ProximityRings({ active, showFarSite = false }: { active: AlertLevel; showFarSite?: boolean }) {
  const maxRadius = ALERT_RADII_KM.green
  const yellowSize = (ALERT_RADII_KM.yellow / maxRadius) * MAX_PX

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: MAX_PX, height: MAX_PX }}>
        {/* radial backdrop */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,theme(colors.signal/16%),transparent_70%)]"
        />
        {/* rotating radar sweep */}
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full [animation-duration:7s] bg-[conic-gradient(from_0deg,transparent_0deg,theme(colors.signal/24%)_26deg,transparent_58deg)]"
        />
        {/* crosshair */}
        <div aria-hidden="true" className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border/50" />
        <div aria-hidden="true" className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border/50" />
        {TIERS.map((tier) => {
          const isActive = tier.level === active
          const isInsideActive = RANK[tier.level] >= RANK[active]
          const size = (ALERT_RADII_KM[tier.level] / maxRadius) * MAX_PX
          // Position a hazard blip on the active ring (top of the circle).
          return (
            <div
              key={tier.level}
              className={cn(
                "absolute rounded-full border-[3px] transition-all",
                tier.ring,
                isActive ? "opacity-100" : isInsideActive ? "opacity-95" : "opacity-45",
                isActive && tier.level === "red" && "alert-glow",
              )}
              style={{ width: size, height: size }}
            >
              {/* distance tick */}
              <span
                className={cn(
                  "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background px-1.5 font-mono text-xs font-bold tabular-nums",
                  isActive ? tier.text : "text-muted-foreground/70",
                )}
              >
                {ALERT_RADII_KM[tier.level]}
              </span>
              {isActive ? (
                <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 translate-y-1/2">
                  <span className={cn("absolute inline-flex h-4 w-4 animate-ping rounded-full opacity-75", tier.dot)} />
                  <span className={cn("relative inline-flex h-4 w-4 rounded-full", tier.dot)} />
                </span>
              ) : null}
            </div>
          )
        })}

        {/* far-site hazard sample on the 50 km (yellow) ring */}
        {showFarSite ? (
          <span
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ top: "50%", left: `calc(50% + ${yellowSize / 2}px)` }}
          >
            <span className="relative flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert-yellow opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-alert-yellow" />
            </span>
            <span className="mt-1 rounded bg-background px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-alert-yellow">
              Far 50km
            </span>
          </span>
        ) : null}

        {/* user pin */}
        <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 border-signal/50 bg-background text-signal shadow">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Distance from your location (km)
      </span>
    </div>
  )
}
