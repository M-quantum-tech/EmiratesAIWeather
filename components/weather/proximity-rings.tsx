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

const MAX_PX = 232 // diameter of the outermost (green) ring
const RANK: Record<AlertLevel, number> = { green: 0, yellow: 1, orange: 2, red: 3 }

/**
 * Concentric proximity radar. Each ring is a distance band from the user pin in
 * the centre; the active tier lights up and drops a pulsing hazard blip on its
 * ring, visualising how close the current hazard is to the user's location.
 */
export function ProximityRings({ active }: { active: AlertLevel }) {
  const maxRadius = ALERT_RADII_KM.green

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: MAX_PX, height: MAX_PX }}>
        {/* sweep backdrop */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,theme(colors.signal/12%),transparent_70%)]"
        />
        {TIERS.map((tier) => {
          const isActive = tier.level === active
          const isInsideActive = RANK[tier.level] >= RANK[active]
          const size = (ALERT_RADII_KM[tier.level] / maxRadius) * MAX_PX
          // Position a hazard blip on the active ring (top of the circle).
          return (
            <div
              key={tier.level}
              className={cn(
                "absolute rounded-full border-2 transition-all",
                tier.ring,
                isActive ? "opacity-100" : isInsideActive ? "opacity-90" : "opacity-30",
                isActive && tier.level === "red" && "alert-glow",
              )}
              style={{ width: size, height: size }}
            >
              {/* distance tick */}
              <span
                className={cn(
                  "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background px-1 font-mono text-[0.5rem] font-bold tabular-nums",
                  isActive ? tier.text : "text-muted-foreground/70",
                )}
              >
                {ALERT_RADII_KM[tier.level]}
              </span>
              {isActive ? (
                <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 translate-y-1/2">
                  <span className={cn("absolute inline-flex h-3 w-3 animate-ping rounded-full opacity-75", tier.dot)} />
                  <span className={cn("relative inline-flex h-3 w-3 rounded-full", tier.dot)} />
                </span>
              ) : null}
            </div>
          )
        })}

        {/* user pin */}
        <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-signal/50 bg-background text-signal shadow">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        Distance from your location (km)
      </span>
    </div>
  )
}
