"use client"

import { Navigation2, Wind } from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_PX = 288 // diameter of the outer ring — matches the proximity radar

/** Wind-speed bands in m/s, outer (calm) → the colour lit for the live reading. */
const BANDS: { max: number; label: string; ring: string; dot: string; text: string; glow: string }[] = [
  { max: 4, label: "CALM", ring: "border-alert-green/55", dot: "bg-alert-green", text: "text-alert-green", glow: "var(--alert-green)" },
  { max: 8, label: "MODERATE", ring: "border-alert-yellow/55", dot: "bg-alert-yellow", text: "text-alert-yellow", glow: "var(--alert-yellow)" },
  { max: 14, label: "FRESH", ring: "border-alert-orange/60", dot: "bg-alert-orange", text: "text-alert-orange", glow: "var(--alert-orange)" },
  { max: Number.POSITIVE_INFINITY, label: "STRONG", ring: "border-alert-red/70", dot: "bg-alert-red", text: "text-alert-red", glow: "var(--alert-red)" },
]

/** Range rings as fractions of the outer radius, with the m/s tick each represents. */
const RANGE_RINGS = [
  { frac: 1, ms: 14 },
  { frac: 0.66, ms: 8 },
  { frac: 0.34, ms: 4 },
]

const COMPASS = [
  { label: "N", top: "2%", left: "50%" },
  { label: "E", top: "50%", left: "98%" },
  { label: "S", top: "98%", left: "50%" },
  { label: "W", top: "50%", left: "2%" },
]

function bandFor(ms: number) {
  return BANDS.find((b) => ms < b.max) ?? BANDS[BANDS.length - 1]
}

/** Meteorological compass origin (16-point) from a "from" bearing in degrees. */
function compass16(deg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  return dirs[Math.round(((deg % 360) / 22.5)) % 16]
}

type WindDirectionRadarProps = {
  /** On-site sustained wind (m/s) and gust (m/s). */
  windMs?: number | null
  gustMs?: number | null
  /** Meteorological wind direction in degrees — the bearing the wind blows FROM. */
  windDirection?: number
}

/**
 * Compass wind radar. Shares the proximity radar's scope styling (rotating sweep,
 * crosshair, range rings) but reads wind vector instead of hazard distance: the
 * flow arrow points downwind, the origin blip sits on the "from" bearing, and the
 * lit ring reflects the live speed band.
 */
export function WindDirectionRadar({ windMs = null, gustMs = null, windDirection = 0 }: WindDirectionRadarProps) {
  const speed = windMs ?? 0
  const band = bandFor(speed)
  const fromDeg = ((windDirection % 360) + 360) % 360
  const flowDeg = (fromDeg + 180) % 360 // direction the wind is heading toward
  // Vector length scales with speed, capped at the outer ring.
  const vectorPx = Math.max(28, Math.min(MAX_PX / 2 - 14, (speed / 16) * (MAX_PX / 2 - 14)))
  // Origin blip sits on the range ring matching the live speed band.
  const originRadius = (MAX_PX / 2) * (band === BANDS[0] ? 0.34 : band === BANDS[1] ? 0.66 : 1)
  const originX = Math.sin((fromDeg * Math.PI) / 180) * originRadius
  const originY = -Math.cos((fromDeg * Math.PI) / 180) * originRadius

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
        {/* bright leading edge */}
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full [animation-duration:6s] [background:conic-gradient(from_88deg,color-mix(in_oklch,var(--signal)_65%,transparent)_0deg,transparent_3deg)]"
        />
        {/* crosshair */}
        <div aria-hidden="true" className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-border/40" />
        <div aria-hidden="true" className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-border/40" />

        {/* range rings */}
        {RANGE_RINGS.map((ring) => {
          const size = MAX_PX * ring.frac
          const isOuter = ring.frac === 1
          return (
            <div
              key={ring.frac}
              className={cn("absolute rounded-full border-[2.5px]", isOuter ? band.ring : "border-border/50")}
              style={{
                width: size,
                height: size,
                boxShadow: isOuter ? `0 0 18px -2px color-mix(in oklch, ${band.glow} 55%, transparent)` : undefined,
              }}
            >
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background px-1 font-mono text-[0.5rem] font-bold tabular-nums text-muted-foreground/70">
                {ring.ms}
              </span>
            </div>
          )
        })}

        {/* compass rose labels */}
        {COMPASS.map((c) => (
          <span
            key={c.label}
            aria-hidden="true"
            className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[0.625rem] font-bold text-muted-foreground"
            style={{ top: c.top, left: c.left }}
          >
            {c.label}
          </span>
        ))}

        {/* wind flow vector — points the way the wind is heading */}
        <div
          aria-hidden="true"
          className={cn("absolute bottom-1/2 left-1/2 w-[3px] rounded-full", band.dot)}
          style={{
            height: vectorPx,
            transformOrigin: "50% 100%",
            transform: `translateX(-50%) rotate(${flowDeg}deg)`,
          }}
        />
        {/* flow arrowhead */}
        <Navigation2
          aria-hidden="true"
          className={cn("absolute left-1/2 top-1/2 z-10 h-5 w-5", band.text)}
          style={{ transform: `translate(-50%, -50%) rotate(${flowDeg}deg) translateY(-${vectorPx}px)` }}
        />

        {/* origin blip on the speed-band ring */}
        <span
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2"
          style={{ transform: `translate(calc(-50% + ${originX}px), calc(-50% + ${originY}px))` }}
        >
          <span className={cn("absolute inline-flex h-3.5 w-3.5 animate-ping rounded-full opacity-75", band.dot)} />
          <span className={cn("relative inline-flex h-3.5 w-3.5 rounded-full", band.dot)} />
        </span>

        {/* centre hub */}
        <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 border-signal/50 bg-background text-signal shadow">
          <Wind className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Wind direction &amp; speed</span>

      {/* Live readout — origin + speed band */}
      <div className="grid w-full grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            <Navigation2 className="h-3 w-3" aria-hidden="true" /> From
          </span>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
            {compass16(fromDeg)}
            <span className="ml-1 text-xs font-medium text-muted-foreground">{Math.round(fromDeg)}&deg;</span>
          </p>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Gust {gustMs != null ? `${Math.round(gustMs * 3.6)} km/h` : "—"}
          </span>
        </div>
        <div className={cn("rounded-lg border px-3 py-2", band.text.replace("text-", "border-") + "/40")}>
          <span className={cn("flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider", band.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", band.dot, "animate-pulse")} aria-hidden="true" />
            {band.label}
          </span>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
            {Math.round(speed * 3.6)}
            <span className="ml-1 text-xs font-medium text-muted-foreground">km/h</span>
          </p>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Sustained wind
          </span>
        </div>
      </div>
    </div>
  )
}
