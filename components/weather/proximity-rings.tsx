"use client"

import { MapPin, Merge, Navigation2, Shuffle, Split, Wind } from "lucide-react"
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
  /**
   * Live measurement spots placed at their true bearing + distance, labelled with the
   * wind/gust the Safety Model is reading there and tinted to the tier they reached.
   */
  sites?: RadarSite[]
}

export type RadarSite = {
  key: string
  label: string
  distanceKm: number
  /** Bearing from the user to the spot, degrees clockwise from north. */
  bearingDeg: number
  /** Direction the wind is blowing FROM at this spot, degrees. */
  directionDeg?: number
  windMs: number
  gustMs: number
  level: AlertLevel
  reason: string | null
}

const SITE_DOT: Record<AlertLevel, string> = {
  green: "bg-alert-green",
  yellow: "bg-alert-yellow",
  orange: "bg-alert-orange",
  red: "bg-alert-red",
}
const SITE_LABEL: Record<AlertLevel, string> = {
  green: "border-alert-green/50 text-alert-green",
  yellow: "border-alert-yellow/60 text-alert-yellow",
  orange: "border-alert-orange/60 text-alert-orange",
  red: "border-alert-red/60 text-alert-red",
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const compassOf = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

/** Ghaith AWS-wind style: whole km/h first, m/s alongside. */
const kmh = (ms: number) => Math.round(ms * 3.6)

/** Pixel radius on the scope for a distance, kept inside the outer ring. */
const toPx = (km: number, maxRadius: number) => (Math.min(km, maxRadius) / maxRadius) * (MAX_PX / 2 - 12)

function siteTitle(site: RadarSite) {
  const dir = site.directionDeg != null ? `${compassOf(site.directionDeg)} ` : ""
  return `${site.label} · ${site.distanceKm} km · wind ${dir}${kmh(site.windMs)} km/h (${site.windMs.toFixed(1)} m/s) · gust ${kmh(site.gustMs)} km/h (${site.gustMs.toFixed(1)} m/s) · ${site.level.toUpperCase()}${site.reason ? ` · ${site.reason}` : ""}`
}

type FlowKind = "diverging" | "converging" | "shear"
type FlowZone = {
  kind: FlowKind
  x: number
  y: number
  axisDeg: number
  distanceKm: number
  speedChangeMs: number
  turnDeg: number
}

const FLOW_MIN_MS = 1.5
const FLOW_MIN_TURN = 45

/**
 * Compares the wind vectors at the site and the far site along the line joining them.
 * Flows pulling apart along that line = diverging; pushing together = converging;
 * a large direction change without either = shear.
 */
function analyseFlow(sites: RadarSite[], maxRadius: number): FlowZone | null {
  const near = sites.find((s) => s.distanceKm === 0)
  const far = sites.find((s) => s.distanceKm > 0)
  if (!near || !far || near.directionDeg == null || far.directionDeg == null) return null

  const heading = (fromDeg: number, speed: number) => {
    const h = ((fromDeg + 180) * Math.PI) / 180
    return { x: Math.sin(h) * speed, y: Math.cos(h) * speed }
  }
  const axisRad = (far.bearingDeg * Math.PI) / 180
  const vn = heading(near.directionDeg, near.windMs)
  const vf = heading(far.directionDeg, far.windMs)
  const along = (vf.x - vn.x) * Math.sin(axisRad) + (vf.y - vn.y) * Math.cos(axisRad)
  const rawTurn = Math.abs((((far.directionDeg - near.directionDeg) % 360) + 540) % 360 - 180)

  const kind: FlowKind | null =
    along >= FLOW_MIN_MS ? "diverging" : along <= -FLOW_MIN_MS ? "converging" : rawTurn >= FLOW_MIN_TURN ? "shear" : null
  if (!kind) return null

  const midKm = far.distanceKm / 2
  const r = toPx(midKm, maxRadius)
  return {
    kind,
    x: Math.sin(axisRad) * r,
    y: -Math.cos(axisRad) * r,
    axisDeg: far.bearingDeg,
    distanceKm: Math.round(midKm),
    speedChangeMs: along,
    turnDeg: Math.round(rawTurn),
  }
}

const FLOW_STYLE: Record<FlowKind, { Icon: typeof Split; text: string; border: string; bg: string; title: string }> = {
  diverging: { Icon: Split, text: "text-accent", border: "border-accent/60", bg: "bg-accent/10", title: "Diverging winds" },
  converging: { Icon: Merge, text: "text-alert-orange", border: "border-alert-orange/60", bg: "bg-alert-orange/10", title: "Converging winds" },
  shear: { Icon: Shuffle, text: "text-alert-yellow", border: "border-alert-yellow/60", bg: "bg-alert-yellow/10", title: "Wind shear" },
}

function flowMeaning(zone: FlowZone) {
  const change = `${Math.abs(zone.speedChangeMs).toFixed(1)} m/s apart along the line · direction turns ${zone.turnDeg}°`
  if (zone.kind === "diverging")
    return `Air is spreading apart between the sites (${change}). Surface divergence usually means sinking air — skies tend to clear, but storm outflow can bring sudden gusts.`
  if (zone.kind === "converging")
    return `Air is piling together between the sites (${change}). Surface convergence lifts air — watch for cloud build-up, dust lifting or storm development heading to site.`
  return `Wind changes direction sharply between the sites (${change}). Shear zones bring gusty, shifting wind at the boundary.`
}

function FlowMarker({ zone }: { zone: FlowZone }) {
  const { Icon, text, border, bg, title } = FLOW_STYLE[zone.kind]
  return (
    <span
      className="absolute z-20"
      style={{ left: `calc(50% + ${zone.x}px)`, top: `calc(50% + ${zone.y}px)`, transform: "translate(-50%, -50%)" }}
      title={`${title} · ~${zone.distanceKm} km ${compassOf(zone.axisDeg)}`}
    >
      <span className={cn("absolute inset-0 animate-ping rounded-md border-2 opacity-50", border)} aria-hidden="true" />
      <span className={cn("relative grid h-7 w-7 place-items-center rounded-md border-2 bg-background", border, text)}>
        <Icon className="h-4 w-4" style={{ transform: `rotate(${zone.axisDeg}deg)` }} aria-hidden="true" />
        <span className="sr-only">{title}</span>
      </span>
    </span>
  )
}

function FlowCard({ zone }: { zone: FlowZone }) {
  const { Icon, text, border, bg, title } = FLOW_STYLE[zone.kind]
  return (
    <div className={cn("flex w-full gap-3 rounded-lg border px-3 py-2.5", border, bg)}>
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 bg-background", border, text)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-sm font-bold leading-tight", text)}>
          {title}
          <span className="ml-1.5 font-normal text-muted-foreground">
            · ~{zone.distanceKm} km {compassOf(zone.axisDeg)}
          </span>
        </span>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{flowMeaning(zone)}</p>
      </div>
    </div>
  )
}

/** Numbered dot on the scope; full readings live in the legend below so nothing overflows. */
function SiteMarker({ site, index, maxRadius }: { site: RadarSite; index: number; maxRadius: number }) {
  // Keep the dot inside the scope even when the site sits on the outer ring.
  const r = toPx(site.distanceKm, maxRadius)
  const rad = (site.bearingDeg * Math.PI) / 180
  const x = Math.sin(rad) * r
  const y = -Math.cos(rad) * r
  const alerting = site.level !== "green"
  const isCentre = site.distanceKm === 0
  return (
    <span
      className="absolute z-20 grid place-items-center"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: isCentre ? "translate(14px, -26px)" : "translate(-50%, -50%)",
      }}
      title={siteTitle(site)}
    >
      {alerting ? (
        <span className={cn("absolute inline-flex h-6 w-6 animate-ping rounded-full opacity-60", SITE_DOT[site.level])} />
      ) : null}
      {site.directionDeg != null ? (
        <Navigation2
          aria-hidden="true"
          className="absolute h-3.5 w-3.5 fill-foreground text-foreground"
          style={{ transform: `rotate(${(site.directionDeg + 180) % 360}deg) translateY(-19px)` }}
        />
      ) : null}
      <span
        className={cn(
          "relative grid h-6 w-6 place-items-center rounded-full font-mono text-xs font-bold text-background ring-2 ring-background",
          SITE_DOT[site.level],
        )}
      >
        {index + 1}
      </span>
    </span>
  )
}

function SiteLegend({ sites }: { sites: RadarSite[] }) {
  return (
    <ul className="flex w-full flex-col gap-2" aria-label="Live measurement spots">
      {sites.map((s, i) => (
        <li
          key={s.key}
          className={cn(
            "flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2",
            SITE_LABEL[s.level].split(" ")[0],
            s.level !== "green" && "tier-blink",
          )}
          title={siteTitle(s)}
        >
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-sm font-bold text-background",
              SITE_DOT[s.level],
            )}
          >
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold leading-tight text-foreground">
              {s.label}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {s.distanceKm === 0 ? "· your location" : `· ${s.distanceKm} km ${compassOf(s.bearingDeg)}`}
              </span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 tabular-nums text-foreground">
              <span className="flex items-baseline gap-1 whitespace-nowrap">
                {s.directionDeg != null ? (
                  <Navigation2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 self-center fill-foreground"
                    style={{ transform: `rotate(${(s.directionDeg + 180) % 360}deg)` }}
                  />
                ) : null}
                {s.directionDeg != null ? (
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{compassOf(s.directionDeg)}</span>
                ) : null}
                <span className="text-lg font-bold leading-none">{kmh(s.windMs)}</span>
                <span className="text-xs text-muted-foreground">km/h</span>
                <span className="font-mono text-xs text-muted-foreground">({s.windMs.toFixed(1)} m/s)</span>
              </span>
              <span className="flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-xs text-muted-foreground">Gust</span>
                <span className="text-lg font-bold leading-none">{kmh(s.gustMs)}</span>
                <span className="text-xs text-muted-foreground">km/h</span>
                <span className="font-mono text-xs text-muted-foreground">({s.gustMs.toFixed(1)} m/s)</span>
              </span>
            </span>
            {s.reason ? <span className="text-xs leading-snug text-muted-foreground">{s.reason}</span> : null}
          </div>
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide",
              SITE_LABEL[s.level],
            )}
          >
            {s.level}
          </span>
        </li>
      ))}
    </ul>
  )
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
  sites,
}: ProximityProps) {
  const maxRadius = ALERT_RADII_KM.green
  const yellowSize = (ALERT_RADII_KM.yellow / maxRadius) * MAX_PX
  const activeTier = TIERS.find((t) => t.level === active) ?? TIERS[0]
  const flowZone = sites?.length ? analyseFlow(sites, maxRadius) : null

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
        {sites?.length
          ? sites.map((s, i) => <SiteMarker key={s.key} site={s} index={i} maxRadius={maxRadius} />)
          : null}
        {flowZone ? <FlowMarker zone={flowZone} /> : null}
        {showFarSite && !sites?.length ? (
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

      {sites?.length ? <SiteLegend sites={sites} /> : null}
      {flowZone ? (
        <FlowCard zone={flowZone} />
      ) : sites?.length ? (
        <p className="w-full text-pretty text-xs leading-relaxed text-muted-foreground">
          No diverging or converging wind between the sites — the flow is uniform.
        </p>
      ) : null}

      {/* Live readout — wind in m/s */}
      <div className="grid w-full grid-cols-1 gap-2">
        <div className="flex min-h-[4.75rem] flex-col justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            <Wind className="h-3 w-3" aria-hidden="true" /> Wind now
          </span>
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">
            {windMs != null ? Math.round(windMs * 3.6) : "—"}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              km/h{windMs != null ? ` · ${windMs.toFixed(1)} m/s` : ""}
            </span>
          </p>
          <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            Gust {gustMs != null ? `${Math.round(gustMs * 3.6)} km/h · ${gustMs.toFixed(1)} m/s` : "—"}
          </span>
        </div>
      </div>
    </div>
  )
}
