"use client"

import { useId, useMemo, useState } from "react"
import { Building2, CloudSun, Gauge, Sun, TrendingUp } from "lucide-react"
import { useWeather } from "@/components/weather/weather-provider"
import type { HourlyReading } from "@/lib/weather"
import { cn } from "@/lib/utils"

const SOLAR_CONST = 1361 // W/m² solar constant
const rad = (x: number) => (x * Math.PI) / 180
const deg = (x: number) => (x * 180) / Math.PI

function dayOfYear(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((d.getTime() - start) / 86_400_000)
}

/** Solar elevation angle (degrees) for a latitude / day-of-year / local solar hour. */
function solarElevation(lat: number, doy: number, hour: number): number {
  const decl = 23.45 * Math.sin(rad((360 / 365) * (284 + doy)))
  const hourAngle = 15 * (hour - 12)
  const sinA =
    Math.sin(rad(lat)) * Math.sin(rad(decl)) +
    Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(hourAngle))
  return deg(Math.asin(Math.max(-1, Math.min(1, sinA))))
}

/** Clear-sky DNI (W/m²) via Kasten-Young air mass + Meinel, with a desert aerosol factor. */
function clearSkyDni(elev: number): number {
  if (elev <= 2) return 0
  const am = 1 / (Math.sin(rad(elev)) + 0.50572 * Math.pow(elev + 6.07995, -1.6364))
  const dni = SOLAR_CONST * Math.pow(0.7, Math.pow(am, 0.678))
  return dni * 0.92 // baseline Gulf haze / turbidity
}

/** Cloud fraction (0–1) inferred from WMO weather code, nudged by rain probability. */
function cloudFraction(code: number, precipProb: number): number {
  let base: number
  if (code === 0) base = 0.02
  else if (code === 1) base = 0.15
  else if (code === 2) base = 0.45
  else if (code === 3) base = 0.92
  else if (code === 45 || code === 48) base = 0.7
  else if (code >= 51 && code <= 67) base = 0.9
  else if (code >= 71 && code <= 77) base = 0.95
  else if (code >= 80 && code <= 82) base = 0.9
  else if (code >= 95) base = 0.98
  else base = 0.4
  const p = Math.max(0, Math.min(1, precipProb / 100))
  return Math.min(1, Math.max(base, 0.55 * base + 0.55 * p))
}

/** Attenuated (real) DNI after clouds + humidity haze. */
function attenuate(clear: number, cloud: number, rh: number): number {
  const cloudFactor = 1 - 0.85 * Math.pow(cloud, 1.8)
  const haze = 1 - 0.12 * (rh / 100)
  return Math.max(0, clear * cloudFactor * haze)
}

function rating(dailyKwh: number): { label: string; tone: string } {
  if (dailyKwh >= 8) return { label: "Excellent", tone: "text-alert-green" }
  if (dailyKwh >= 6) return { label: "Good", tone: "text-accent" }
  if (dailyKwh >= 4) return { label: "Fair", tone: "text-signal" }
  return { label: "Poor", tone: "text-destructive" }
}

const DNI_COLOR = "#f5b642"
const CLEAR_COLOR = "#94a3b8"

export function SolarDni() {
  const { payload } = useWeather()
  const gid = useId()
  const [hover, setHover] = useState<number | null>(null)

  const model = useMemo(() => {
    const hours: HourlyReading[] = payload?.hourly ?? []
    if (hours.length === 0 || !payload) return null
    const lat = payload.location.latitude
    const doy = dayOfYear(hours[0].time.slice(0, 10))
    const nowIdx = Math.min(Math.max(payload.currentHourIndex ?? 0, 0), hours.length - 1)

    const rows = hours.map((h, i) => {
      const elev = solarElevation(lat, doy, i)
      const clear = clearSkyDni(elev)
      const cloud = cloudFraction(h.weatherCode, h.precipitationProbability)
      const dni = attenuate(clear, cloud, h.humidity)
      return { i, time: h.time.slice(11, 16), elev, clear, cloud, dni }
    })

    const maxClear = Math.max(1, ...rows.map((r) => r.clear))
    const now = rows[nowIdx]
    const future = rows.slice(nowIdx)
    const daylightFuture = future.filter((r) => r.clear > 0)
    const peak = daylightFuture.reduce((a, b) => (b.dni > a.dni ? b : a), daylightFuture[0] ?? now)

    const dailyDni = rows.reduce((s, r) => s + r.dni, 0) / 1000 // kWh/m²/day
    const dailyClear = rows.reduce((s, r) => s + r.clear, 0) / 1000
    const clearness = dailyClear > 0 ? dailyDni / dailyClear : 0
    const dayCloud = rows.filter((r) => r.clear > 0)
    const avgCloud = dayCloud.length ? dayCloud.reduce((s, r) => s + r.cloud, 0) / dayCloud.length : 0
    const attenNow = now.clear > 0 ? (1 - now.dni / now.clear) * 100 : 0
    // Modeled plant output now as % of nameplate (DNI vs 1000 W/m² STC × 0.82 perf. ratio).
    const siteOutput = Math.min(100, (now.dni / 1000) * 100 * 0.82)

    // Chart geometry (compact).
    const W = 1000
    const H = 200
    const xf = (i: number) => (rows.length > 1 ? (i / (rows.length - 1)) * W : W / 2)
    const yf = (v: number) => H - (v / maxClear) * H
    const dniPts = rows.map((r) => ({ x: xf(r.i), y: yf(r.dni), i: r.i }))
    const clearPts = rows.map((r) => ({ x: xf(r.i), y: yf(r.clear), i: r.i }))
    const toPath = (pts: { x: number; y: number }[]) =>
      pts.map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    // Attenuation gap (area between clear-sky envelope and real DNI).
    const gapArea = `${toPath(clearPts)} L${dniPts[dniPts.length - 1].x.toFixed(1)},${dniPts[
      dniPts.length - 1
    ].y.toFixed(1)} ${[...dniPts]
      .reverse()
      .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ")} Z`

    return {
      rows,
      nowIdx,
      now,
      peak,
      dailyDni,
      clearness,
      avgCloud,
      attenNow,
      siteOutput,
      maxClear,
      W,
      H,
      xf,
      dniObs: toPath(dniPts.slice(0, nowIdx + 1)),
      dniProj: toPath(dniPts.slice(nowIdx)),
      clearPath: toPath(clearPts),
      gapArea,
      dniPts,
    }
  }, [payload])

  if (!model) {
    return (
      <div className="flex h-[220px] animate-pulse items-center justify-center rounded-lg border border-border bg-secondary/30 text-sm text-muted-foreground">
        Modeling direct normal irradiance…
      </div>
    )
  }

  const active = hover ?? model.nowIdx
  const rate = rating(model.dailyDni)
  const cards = [
    {
      icon: Sun,
      label: "DNI · now",
      value: `${Math.round(model.now.dni)}`,
      unit: "W/m²",
      note: `clear-sky ${Math.round(model.now.clear)} W/m²`,
    },
    {
      icon: TrendingUp,
      label: "Predictive DNI",
      value: `${Math.round(model.peak.dni)}`,
      unit: "W/m²",
      note: `peak at ${model.peak.time} (+${model.peak.i - model.nowIdx}h)`,
    },
    {
      icon: Gauge,
      label: "Attenuation · now",
      value: `${Math.round(model.attenNow)}`,
      unit: "%",
      note: "lost to cloud + haze",
    },
    {
      icon: CloudSun,
      label: "Cloud prediction",
      value: `${Math.round(model.avgCloud * 100)}`,
      unit: "%",
      note: "avg daytime cloud cover",
    },
    {
      icon: Building2,
      label: "Impact on site",
      value: rate.label,
      unit: "",
      note: `${model.dailyDni.toFixed(1)} kWh/m²/day · ${Math.round(model.siteOutput)}% output`,
      tone: rate.tone,
    },
  ]

  return (
    <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/8 via-transparent to-signal/5 p-4">
      {/* Distinct header — solar model, not the 4-tier safety banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Sun className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="label-caps text-accent">AI Solar DNI model</p>
            <p className="text-xs text-muted-foreground">
              Direct normal irradiance · {payload?.location.name}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-accent">
          Predictive · solar geometry
        </span>
      </div>

      {/* Five aspect cards */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="label-caps truncate">{c.label}</span>
              </div>
              <p className={cn("mt-1 font-mono text-xl font-bold leading-none tabular-nums", c.tone ?? "text-foreground")}>
                {c.value}
                {c.unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span> : null}
              </p>
              <p className="mt-1 truncate text-[0.625rem] text-muted-foreground">{c.note}</p>
            </div>
          )
        })}
      </div>

      {/* DNI vs clear-sky chart — the gap is the predicted attenuation */}
      <figure className="mt-3">
        <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-b from-secondary/20 to-transparent">
          <svg
            viewBox={`0 0 ${model.W} ${model.H}`}
            preserveAspectRatio="none"
            className="h-[180px] w-full overflow-visible sm:h-[220px]"
            role="img"
            aria-label="Predicted direct normal irradiance versus clear-sky potential over 24 hours"
          >
            <defs>
              <linearGradient id={`${gid}-dni`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DNI_COLOR} stopOpacity={0.35} />
                <stop offset="100%" stopColor={DNI_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Attenuation gap (clear-sky minus real DNI) */}
            <path d={model.gapArea} fill={CLEAR_COLOR} opacity={0.12} />
            {/* DNI fill under the observed curve */}
            <path
              d={`${model.dniObs} L${model.xf(model.nowIdx).toFixed(1)},${model.H} L0,${model.H} Z`}
              fill={`url(#${gid}-dni)`}
              opacity={0.9}
            />

            {/* AI projection shading */}
            <rect
              x={model.xf(model.nowIdx)}
              y={0}
              width={model.W - model.xf(model.nowIdx)}
              height={model.H}
              fill={DNI_COLOR}
              opacity={0.05}
            />

            {/* Clear-sky envelope */}
            <path
              d={model.clearPath}
              fill="none"
              stroke={CLEAR_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
            {/* Real DNI: solid observed + dashed forecast */}
            <path
              d={model.dniObs}
              fill="none"
              stroke={DNI_COLOR}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={model.dniProj}
              fill="none"
              stroke={DNI_COLOR}
              strokeWidth={3}
              strokeDasharray="6 5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.9}
            />

            {/* Live cursor */}
            <line
              x1={model.dniPts[active].x}
              y1={0}
              x2={model.dniPts[active].x}
              y2={model.H}
              stroke="#4ade80"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={model.dniPts[active].x}
              cy={model.dniPts[active].y}
              r={4}
              fill={DNI_COLOR}
              stroke="var(--color-background)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />

            {/* Hover hit-areas */}
            {model.dniPts.map((p) => (
              <rect
                key={p.i}
                x={p.x - model.W / model.rows.length / 2}
                y={0}
                width={model.W / model.rows.length}
                height={model.H}
                fill="transparent"
                onMouseEnter={() => setHover(p.i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>

          {/* Cursor label */}
          <span
            className="pointer-events-none absolute top-1 -translate-x-1/2 rounded bg-[#4ade80] px-1.5 py-0.5 text-[0.5625rem] font-bold text-black"
            style={{ left: `${(model.dniPts[active].x / model.W) * 100}%` }}
          >
            +{active}h
          </span>

          {/* Tooltip */}
          <div
            className={cn(
              "pointer-events-none absolute top-6 min-w-[9rem] rounded-md border border-accent/50 bg-card/95 px-2.5 py-2 shadow-lg backdrop-blur",
              model.dniPts[active].x > model.W * 0.6 ? "-translate-x-full" : "translate-x-2",
            )}
            style={{ left: `${(model.dniPts[active].x / model.W) * 100}%` }}
          >
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden="true" />+{active}h ·{" "}
              {active <= model.nowIdx ? "live" : "AI forecast"} · {model.rows[active].time}
            </p>
            <ul className="space-y-0.5 font-mono text-[0.625rem]">
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: DNI_COLOR }} aria-hidden="true" />
                <span className="text-muted-foreground">DNI:</span>
                <span className="ml-auto font-semibold tabular-nums text-foreground">
                  {Math.round(model.rows[active].dni)} W/m²
                </span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CLEAR_COLOR }} aria-hidden="true" />
                <span className="text-muted-foreground">Clear-sky:</span>
                <span className="ml-auto font-semibold tabular-nums text-foreground">
                  {Math.round(model.rows[active].clear)} W/m²
                </span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                <span className="text-muted-foreground">Cloud:</span>
                <span className="ml-auto font-semibold tabular-nums text-foreground">
                  {Math.round(model.rows[active].cloud * 100)}%
                </span>
              </li>
            </ul>
          </div>

          {/* X axis */}
          <div className="flex px-3 pb-2">
            <div className="flex flex-1 justify-between font-mono text-[0.5625rem] tabular-nums text-muted-foreground">
              {model.rows.map((r) =>
                r.i % 3 === 0 || r.i === model.rows.length - 1 ? <span key={r.i}>{r.time}</span> : null,
              )}
            </div>
          </div>
        </div>

        <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: DNI_COLOR }} aria-hidden="true" /> Predicted DNI
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: CLEAR_COLOR }} aria-hidden="true" />{" "}
              Clear-sky potential
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm bg-muted-foreground/30" aria-hidden="true" /> Attenuation
            </span>
          </span>
          <span className="font-mono text-[0.625rem]">
            Solar geometry × Open-Meteo cloud/humidity · clearness {Math.round(model.clearness * 100)}%
          </span>
        </figcaption>
      </figure>
    </div>
  )
}
