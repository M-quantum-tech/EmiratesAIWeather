"use client"

import { MapPin, Navigation2, Wind } from "lucide-react"
import { ALERT_RADII_KM, type AlertLevel } from "@/lib/weather"
import { cn } from "@/lib/utils"

/** Outer → inner. Green is the widest ring (farthest), red the tightest (closest). */
const TIERS: { level: AlertLevel; label: string; ring: string; dot: string; text: string; glow: string }[] = [
  { level: "green", label: "GREEN", ring: "border-alert-green/55", dot: "bg-alert-green", text: "text-alert-green", glow: "var(--alert-green)" },
  { level: "yellow", label: "YELLOW", ring: "border-alert-yellow/55", dot: "bg-alert-yellow", text: "text-alert-yellow", glow: "var(--alert-yellow)" },
  { level: "orange", label: "ORANGE", ring: "border-alert-orange/60", dot: "bg-alert-orange", text: "text-alert-orange", glow: "var(--alert-orange)" },
  { level: "red", label: "RED", ring: "border-alert-red/70", dot: "bg-alert-red", text: "text-alert-red", glow: "var(--alert-red)" },
]

const MAX_PX = 288 // diameter of the outermost (green) ring
const RANK: Record<AlertLevel, number> = { green: 0, yellow: 1, orange: 2, red: 3 }

type ProximityProps = {
  active: AlertLevel
  showFarSite?: boolean
  /** Live on-site wind + gust and the 50 km upwind gust, all in m/s. */
  windMs?: number | null
  gustMs?: number | null
  farGustMs?: number | null
  /** Compass origin the hazard is arriving from (e.g. "NW"). */
  originCompass?: string
  /** Whether the upwind front is intensifying toward the user. */
  approaching?: boolean
  /** Human ETA label when a front is closing (e.g. "42 min"). */
  etaLabel?: string | null
  /** Wind direction in degrees (arrow points where wind is heading). */
  windDirection?: number
}

/**
 * Concentric proximity radar. Rings are distance bands from the user pin at the
 * centre; the active tier lights up and drops a pulsing hazard blip on its ring.
 * A dual-layer sweep (soft conic trail + bright leading edge) reads like a real
 * radar scope, and a live readout surfaces wind in m/s plus the AI front call.
 */
export function ProximityRings({
  active,
  showFarSite = false,
  windMs = null,
  gustMs = null,
  farGustMs = null,
  originCompass,
  approaching = false,
  etaLabel = null,
  windDirection = 0,
}: ProximityProps) {
  const maxRadius = ALERT_RADII_KM.green
  const yellowSize = (ALERT_RADII_KM.yellow / maxRadius) * MAX_PX
  const activeTier = TIERS.find((t) => t.level === active) ?? TIERS[0]

  return (
    <div className="flex w-full max-w-[20rem] flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: MAX_PX, height: MAX_PX }}>
        {/* deep scope backdrop */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--signal)_14%,transparent),transparent_72%)]"
        />
        {/* soft rotating sweep trail */}
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full [animation-duration:6s] [background:conic-gradient(from_0deg,transparent_0deg,color-mix(in_oklch,var(--signal)_22%,transparent)_48deg,transparent_90deg)]"
        />
        {/* bright leading edge, locked to the sweep */}
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full [animation-duration:6s] [background:conic-gradient(from_88deg,color-mix(in_oklch,var(--signal)_65%,transparent)_0deg,transparent_3deg)]"
        />
        {/* crosshair */}
        <div aria-hidden="true" className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-border/40" />
        <div aria-hidden="true" className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-border/40" />

        {TIERS.map((tier) => {
          const isActive = tier.level === active
          const isInsideActive = RANK[tier.level] >= RANK[active]
          const size = (ALERT_RADII_KM[tier.level] / maxRadius) * MAX_PX
          return (
            <div
              key={tier.level}
              className={cn(
                "absolute rounded-full border-[2.5px] transition-all",
                tier.ring,
                isActive ? "opacity-100" : isInsideActive ? "opacity-90" : "opacity-40",
                isActive && tier.level === "red" && "alert-glow",
              )}
              style={{
                width: size,
                height: size,
                boxShadow: isActive ? `0 0 18px -2px color-mix(in oklch, ${tier.glow} 55%, transparent)` : undefined,
              }}
            >
              {/* distance tick */}
              <span
                className={cn(
                  "absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-baseline gap-0.5 rounded-full bg-background px-1.5 font-mono text-xs font-bold tabular-nums",
                  isActive ? tier.text : "text-muted-foreground/70",
                )}
              >
                {ALERT_RADII_KM[tier.level]}
                <span className="text-[0.5rem] font-medium opacity-70">km</span>
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
              {farGustMs != null ? `${Math.round(farGustMs * 3.6)} km/h · ${farGustMs.toFixed(1)} m/s` : "Far 50km"}
            </span>
          </span>
        ) : null}

        {/* wind-origin arrow — points the way the front is heading (toward the pin) */}
        {approaching ? (
          <Navigation2
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-alert-orange"
            style={{ transform: `translate(-50%, -50%) rotate(${(windDirection + 180) % 360}deg) translateY(-${yellowSize / 2 - 6}px)` }}
          />
        ) : null}

        {/* user pin */}
        <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 border-signal/50 bg-background text-signal shadow">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Distance from your location (km)
      </span>

      {/* Live readout — wind in m/s + AI front call */}
      <div className="grid w-full grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            <Wind className="h-3 w-3" aria-hidden="true" /> Wind now
          </span>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
            {windMs != null ? Math.round(windMs * 3.6) : "—"}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              km/h{windMs != null ? ` · ${windMs.toFixed(1)} m/s` : ""}
            </span>
          </p>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Gust {gustMs != null ? `${Math.round(gustMs * 3.6)} km/h · ${gustMs.toFixed(1)} m/s` : "—"}
          </span>
        </div>
        <div
          className={cn(
            "rounded-lg border px-3 py-2",
            approaching ? "border-alert-orange/50 bg-alert-orange/5" : "border-alert-green/40 bg-alert-green/5",
          )}
        >
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider",
              approaching ? "text-alert-orange" : "text-alert-green",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", activeTier.dot, "animate-pulse")} aria-hidden="true" />
            AI front call
          </span>
          <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
            {approaching ? `Closing · ${ALERT_RADII_KM[active]} km` : "No front closing"}
          </p>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            {approaching
              ? `${etaLabel ? `ETA ~${etaLabel}` : "Tracking"}${originCompass ? ` · from ${originCompass}` : ""}`
              : `Steady${originCompass ? ` · ${originCompass}` : ""}`}
          </span>
        </div>
      </div>
    </div>
  )
}
