"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import {
  CloudRain,
  ExternalLink,
  Layers,
  MapPin,
  MousePointerClick,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  Search,
} from "lucide-react"
import { Panel } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import { compass, describeCode, precipUnit, tempUnit, toMetersPerSecond, weatherEmoji, type Units } from "@/lib/weather"
import { cn } from "@/lib/utils"
import { fetchWindFrames, type WindFrames } from "@/lib/wind-field"
import { createWindLayer } from "@/lib/wind-layer"

type Point = { lat: number; lon: number }
type Mode = "pick" | "measure"
type LoopFrame = { time: number; path: string }

// For the Measure & Forecast map we only show a single 24-hour forecast (Best match) to simplify the UI.
const MODELS = [
  { id: "best_match", label: "Forecast", color: "#f5b642" },
] as const
type ModelId = (typeof MODELS)[number]["id"]

// Map layer selector — only base map here (other overlays exist on the live NCM panel).
const LAYERS = [
  { id: "none", label: "Base map" },
] as const
type LayerId = (typeof LAYERS)[number]["id"]

// Overlay zoom support: allow overlays up to higher zoom for closer inspection.
// RainViewer frames are natively available at 512 tiles; use larger tileSize/zoomOffset so clouds/radar feel bigger.
const MAX_OVERLAY_ZOOM = 12

// Wind-speed legend (m/s) matching the Windy-style heatmap palette (calm → gale).
const WIND_SCALE = [
  { c: "#1a3a78", label: "Calm" },
  { c: "#1a96be", label: "" },
  { c: "#78c868", label: "Breeze" },
  { c: "#f0963c", label: "Strong" },
  { c: "#e4483a", label: "Gale" },
] as const

// Great-circle distance (Haversine) in kilometres.
function haversineKm(a: Point, b: Point) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return R * 2 * Math.asin(Math.sqrt(h))
}

// Initial bearing A -> B in degrees (0-360).
function bearingDeg(a: Point, b: Point) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon))
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

const MARKER_COLORS = { A: "#f5b642", B: "#38bdf8" }

function markerIcon(L: any, letter: "A" | "B") {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${MARKER_COLORS[letter]};color:#0b0f14;font:700 13px ui-monospace,monospace;box-shadow:0 0 0 3px rgba(0,0,0,0.35)">${letter}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function flagIcon(L: any) {
  // SVG flag marker for consistent styling (replaces emoji)
  const svg = `data:image/svg+xml;utf8,` + encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='28' height='36' viewBox='0 0 28 36'>
      <g fill='none' fill-rule='evenodd'>
        <path d='M4 34c0-6 0-24 0-24' stroke='#000' stroke-opacity='0.25' stroke-width='2' stroke-linecap='round' />
        <g transform='translate(6,4)'>
          <path d='M0 0c6-2 12-2 18 0v12c-6 2-12 2-18 0z' fill='%23f59e0b' stroke='%23333' stroke-width='0.5'/>
        </g>
      </g>
    </svg>
  `)
  return L.divIcon({
    className: "",
    html: `<img src='${svg}' style='transform:translateY(-6px);width:28px;height:36px'/>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  })
}

type ModelResult = { id: ModelId | "consensus"; label: string; color: string; hours: any[] }

// EmiratesConsensus: our own blended model = hourly mean of ECMWF + ICON + GFS.
// Rendered as the headline curve and used to score cross-model agreement.
const CONSENSUS_COLOR = "#ffffff"

// meteoblue-style temperature ribbon scale: cold blues → mild teal → hot magenta.
const TEMP_STOPS: Array<[number, string]> = [
  [-5, "#1e3a8a"],
  [5, "#2563eb"],
  [15, "#0891b2"],
  [22, "#16a34a"],
  [30, "#eab308"],
  [38, "#f97316"],
  [44, "#ef4444"],
  [50, "#db2777"],
]
function tempColorC(c: number): string {
  if (c <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1]
  if (c >= TEMP_STOPS[TEMP_STOPS.length - 1][0]) return TEMP_STOPS[TEMP_STOPS.length - 1][1]
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    const [a, ca] = TEMP_STOPS[i]
    const [b, cb] = TEMP_STOPS[i + 1]
    if (c >= a && c <= b) {
      const t = (c - a) / (b - a)
      const ha = ca.match(/\w\w/g)!.map((h) => parseInt(h, 16))
      const hb = cb.match(/\w\w/g)!.map((h) => parseInt(h, 16))
      const mix = ha.map((v, k) => Math.round(v + (hb[k] - v) * t))
      return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1]
}
function buildConsensus(results: ModelResult[]): ModelResult | null {
  const members = results.filter((r) => r.id === "ecmwf" || r.id === "icon" || r.id === "gfs")
  if (members.length < 2) return null
  const n = Math.min(24, ...members.map((m) => m.hours.length))
  const hours = Array.from({ length: n }, (_, i) => {
    const temps = members.map((m) => m.hours[i]?.temperature).filter((t) => typeof t === "number")
    const probs = members.map((m) => m.hours[i]?.precipitationProbability).filter((t) => typeof t === "number")
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)
    return {
      ...members[0].hours[i],
      temperature: avg(temps),
      precipitationProbability: avg(probs),
    }
  })
  return { id: "consensus", label: "Consensus", color: CONSENSUS_COLOR, hours }
}

/** Cross-model agreement at the current hour → predictability score for the report line. */
function agreementReport(results: ModelResult[], nowIdx: number, units: Units) {
  const members = results.filter((r) => r.id === "ecmwf" || r.id === "icon" || r.id === "gfs")
  if (members.length < 2) return null
  const i = Math.min(Math.max(nowIdx, 0), 23)
  const temps = members.map((m) => m.hours[i]?.temperature).filter((t) => typeof t === "number") as number[]
  if (temps.length < 2) return null
  const spread = Math.max(...temps) - Math.min(...temps)
  const level = spread <= 1.5 ? "Very high" : spread <= 3 ? "High" : spread <= 5 ? "Moderate" : "Low"
  return { spread, level, count: members.length, unit: tempUnit(units) }
}

/** Multi-model 24-hour meteogram: colorful temperature ribbon + rain bars + per-model curves + now marker. */
function multiModelSvg(results: ModelResult[], barHours: any[], nowIdx: number, units: Units, W = 320, H = 118, highlightIdx?: number) {
  // Larger top padding to make room for the peak marker/label
  const top = 28
  const bottom = 32
  const n = 24
  const step = W / (n - 1)
  const tx = (i: number) => i * step
  const toC = (t: number) => (units === "metric" ? t : ((t - 32) * 5) / 9)

  const allTemps = results.flatMap((r) => r.hours.map((h) => h.temperature))
  if (allTemps.length < 2) return ""
  const tmin = Math.min(...allTemps)
  const tmax = Math.max(...allTemps)
  const tspan = Math.max(tmax - tmin, 1)
  const ty = (t: number) => top + (1 - (t - tmin) / tspan) * (H - top - bottom)

  // Headline series for the ribbon (consensus preferred, else best match, else first).
  const head =
    results.find((r) => r.id === "consensus") ??
    results.find((r) => r.id === "best_match") ??
    results[0]
  const headHours = head.hours.slice(0, 24)

  // compute peak index if not provided
  const computedPeak = headHours.reduce((acc, h, i) => ({ idx: acc.idx, val: acc.val }), { idx: -1, val: -Infinity } as any)
  let peakIdx = typeof highlightIdx === 'number' && highlightIdx >= 0 ? highlightIdx : headHours.findIndex((h) => h.temperature === tmax)
  if (peakIdx < 0) peakIdx = 0

  // Horizontal temperature gradient: one stop per hour, colored by that hour's temp.
  const gradId = `ribbon-${Math.random().toString(36).slice(2, 8)}`
  const stops = headHours
    .map((h, i) => `<stop offset="${((i / (n - 1)) * 100).toFixed(1)}%" stop-color="${tempColorC(toC(h.temperature))}"/>`)
    .join("")
  const gradDef = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`

  // Filled band beneath the headline curve, painted with the temperature gradient.
  const baseY = H - bottom
  const ribbonLine = headHours.map((h, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(1)},${ty(h.temperature).toFixed(1)}`).join(" ")
  const ribbon = `<path d="${ribbonLine} L${W},${baseY} L0,${baseY} Z" fill="url(#${gradId})" opacity="0.95"/>`

  // Per-hour temperature labels along the top of the ribbon (every 3rd hour to avoid clutter).
  const tempLabels = headHours
    .map((h, i) =>
      i % 3 === 0
        ? `<text x="${tx(i).toFixed(1)}" y="${(ty(h.temperature) - 6).toFixed(1)}" fill="#fff" font-size="8" font-weight="700" font-family="ui-monospace,monospace" text-anchor="middle">${Math.round(h.temperature)}&#176;</text>`
        : "",
    )
    .join("")

  const bars = barHours
    .slice(0, 24)
    .map((h, i) => {
      const bh = Math.max(0, (h.precipitationProbability ?? 0) / 100) * (H - top - bottom) * 0.6
      return bh > 0.5
        ? `<rect x="${(tx(i) - step * 0.28).toFixed(1)}" y="${(baseY - bh).toFixed(1)}" width="${(step * 0.56).toFixed(1)}" height="${bh.toFixed(1)}" fill="#ffcc66" opacity="0.22" rx="0.5"/>`
        : ""
    })
    .join("")

  const curves = results
    .map((r) => {
      const line = r.hours
        .slice(0, 24)
        .map((h, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(1)},${ty(h.temperature).toFixed(1)}`)
        .join(" ")
      const isBlend = r.id === head.id
      return `<path d="${line}" fill="none" stroke="${isBlend ? "#fff" : r.color}" stroke-width="${isBlend ? 2 : 0.9}" opacity="${isBlend ? 1 : 0.55}" stroke-linejoin="round"/>`
    })
    .join("")

  const axis = [0, 3, 6, 9, 12, 15, 18, 21, 23]
    .map((i) => {
      const anchor = i === 0 ? "start" : i === 23 ? "end" : "middle"
      const label = barHours[i] ? barHours[i].time.slice(11, 13) : String(i).padStart(2, "0")
      return `<text x="${tx(i).toFixed(1)}" y="${H - 8}" fill="#9aa3ad" font-size="8" font-family="ui-monospace,monospace" text-anchor="${anchor}">${label}h</text>`
    })
    .join("")

  const clamped = Math.min(Math.max(nowIdx, 0), n - 1)
  const nowX = tx(clamped)
  const now = `<line x1="${nowX.toFixed(1)}" y1="${top - 6}" x2="${nowX.toFixed(1)}" y2="${baseY}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.9"/><circle cx="${nowX.toFixed(1)}" cy="${ty(headHours[clamped]?.temperature ?? tmin).toFixed(1)}" r="3" fill="#f59e0b"/>`

  // Peak marker (dashed vertical at peakIdx with small badge)
  const peakX = tx(peakIdx)
  const peakY = ty(headHours[peakIdx]?.temperature ?? tmin)
  const peakLine = `<line x1="${peakX.toFixed(1)}" y1="${top - 6}" x2="${peakX.toFixed(1)}" y2="${baseY}" stroke="#ffd1a2" stroke-width="1" stroke-dasharray="4 3" opacity="0.85"/>`
  const peakBadge = `<circle cx="${peakX.toFixed(1)}" cy="${(peakY - 6).toFixed(1)}" r="4" fill="#ffd166" stroke="#222" stroke-width="0.8"/>`
  const peakLabel = `<text x="${peakX.toFixed(1)}" y="${(peakY - 10).toFixed(1)}" fill="#fff" font-size="9" font-weight="700" font-family="ui-monospace,monospace" text-anchor="middle">${Math.round(headHours[peakIdx]?.temperature ?? 0)}&#176;</text>`

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">${gradDef}${ribbon}${bars}${curves}${peakLine}${peakBadge}${peakLabel}${now}${tempLabels}${axis}</svg>`
}

/**
 * Small multi-parameter trend chart (0-24h) showing humidity, wind speed, wind gust, precipitation probability, and wind direction markers.
 * Hours must be an array of 24 hourly objects with fields: temperature, precipitationProbability, windSpeed, windGust, windDirection, relativeHumidity/humidity.
 */
function multiParamSvg(hours: any[], units: Units, W = 640, H = 84) {
  if (!hours || hours.length === 0) return ""
  const n = Math.min(24, hours.length)
  const step = W / (n - 1)
  const tx = (i: number) => i * step

  const vals = {
    rh: hours.slice(0, n).map((h: any) => (h.relativeHumidity ?? h.humidity ?? h.rh ?? 0)),
    wind: hours.slice(0, n).map((h: any) => h.windSpeed ?? h.windspeed ?? h.wind ?? 0),
    gust: hours.slice(0, n).map((h: any) => h.windGust ?? h.wind_gust ?? h.gust ?? 0),
    pop: hours.slice(0, n).map((h: any) => h.precipitationProbability ?? h.pop ?? h.precipProbability ?? 0),
    dir: hours.slice(0, n).map((h: any) => h.windDirection ?? h.wind_dir ?? 0),
  }

  const scale = (arr: number[], minOverride?: number, maxOverride?: number) => {
    const min = typeof minOverride === 'number' ? minOverride : Math.min(...arr)
    const max = typeof maxOverride === 'number' ? maxOverride : Math.max(...arr)
    const span = Math.max(max - min, 1)
    return { min, max, span, y: (v: number) => 6 + (1 - (v - min) / span) * (H - 18) }
  }

  const rhS = scale(vals.rh, 0, 100)
  const windS = scale(vals.wind, 0, Math.max(1, Math.ceil(Math.max(...vals.wind))))
  const gustS = scale(vals.gust, 0, Math.max(1, Math.ceil(Math.max(...vals.gust))))
  const popS = scale(vals.pop, 0, 100)

  const pathFor = (arr: number[], s: any) => arr.map((v: number, i: number) => `${i === 0 ? 'M' : 'L'}${tx(i).toFixed(1)},${s.y(v).toFixed(1)}`).join(' ')

  const rhPath = `<path d="${pathFor(vals.rh, rhS)}" fill="none" stroke="#3b82f6" stroke-width="1.2" opacity="0.95"/>`
  const windPath = `<path d="${pathFor(vals.wind, windS)}" fill="none" stroke="#06b6d4" stroke-width="1.2" opacity="0.95"/>`
  const gustPath = `<path d="${pathFor(vals.gust, gustS)}" fill="none" stroke="#f97316" stroke-width="1.2" opacity="0.95" stroke-dasharray="3 2"/>`
  const popPath = `<path d="${pathFor(vals.pop, popS)}" fill="none" stroke="#8b5cf6" stroke-width="1.2" opacity="0.7"/>`

  // Wind direction markers: small rotated triangles above the line
  const dirMarkers = vals.dir
    .map((d: number, i: number) => {
      const x = tx(i)
      const y = 6
      const size = 6
      const points = `${x},${y} ${x - size},${y + size * 1.5} ${x + size},${y + size * 1.5}`
      return `<g transform="translate(0,0) rotate(${d}, ${x}, ${y})"><polygon points="${points}" fill="#fff" opacity="0.9"/></g>`
    })
    .join('')

  const legend = `
    <g font-family="ui-monospace,monospace" font-size="10">
      <rect x="0" y="${H - 14}" width="${W}" height="14" fill="transparent" />
      <g transform="translate(6,${H - 11})">
        <circle cx="6" cy="0" r="5" fill="#3b82f6"/> <text x="14" y="2" fill="#cbd5e1">Humidity</text>
        <circle cx="110" cy="0" r="5" fill="#06b6d4"/> <text x="118" y="2" fill="#cbd5e1">Wind</text>
        <circle cx="200" cy="0" r="5" fill="#f97316"/> <text x="208" y="2" fill="#cbd5e1">Gust</text>
        <circle cx="288" cy="0" r="5" fill="#8b5cf6"/> <text x="296" y="2" fill="#cbd5e1">Precip %</text>
      </g>
    </g>`

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">${rhPath}${windPath}${gustPath}${popPath}${dirMarkers}${legend}</svg>`
}

function legendHtml(results: ModelResult[]) {
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${results
    .map(
      (r) =>
        `<span style="display:inline-flex;align-items:center;gap:3px;font:600 8px ui-monospace,monospace;color:var(--muted-foreground)"><span style="display:inline-block;width:9px;height:2px;background:${r.color}"></span>${r.label}</span>`,
    )
    .join("")}</div>`
}

/** Full popup card HTML: header (best match) + emoji strip + multi-model meteogram + legend + summary. */
function buildSpotPopupHtml(point: Point, best: any, rawResults: ModelResult[], units: Units, W = 640, H = 236) {
  // Single-model 24-hour popup with header and footer (0-24h analysis)
  const hours: any[] = best.hourly ?? []
  const cur = best.current ?? {}
  const nowIdx = typeof best.currentHourIndex === "number" ? best.currentHourIndex : 0

  const temps = hours.map((h) => h.temperature)
  const tmax = temps.length ? Math.round(Math.max(...temps)) : 0
  const tmin = temps.length ? Math.round(Math.min(...temps)) : 0
  const tmaxIdx = temps.indexOf(Math.max(...temps))
  const tminIdx = temps.indexOf(Math.min(...temps))
  const avgWind = hours.length ? (hours.reduce((s:any,h:any)=>s+(h.windSpeed??0),0)/hours.length) : 0
  const avgPrecip = hours.length ? Math.round(hours.reduce((s:any,h:any)=>(s+(h.precipitationProbability??0)),0)/hours.length) : 0

  const cond = describeCode(cur.weatherCode ?? 0)
  const headEmoji = weatherEmoji(cur.weatherCode ?? 0, cur.isDay ?? true)

  const results: ModelResult[] = rawResults
  const header = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;padding:10px;border-bottom:1px solid var(--border)">
      <div style="font-size:28px">${headEmoji}</div>
      <div style="line-height:1">
        <div style="font-size:20px;font-weight:700">${Math.round(cur.temperature ?? 0)}${tempUnit(units)}</div>
        <div style="font-size:12px;color:var(--muted-foreground)">${cond.label}</div>
      </div>
      <div style="margin-left:auto;text-align:right;font:600 11px ui-monospace,monospace;color:var(--muted-foreground)">${point.lat.toFixed(3)}°, ${point.lon.toFixed(3)}°</div>
    </div>`

  const footer = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:13px;display:flex;gap:12px;justify-content:space-between;color:var(--muted-foreground)">
    <div><strong>0–24h</strong>: Tmax ${tmax}${tempUnit(units)} at ${tmaxIdx>=0?hours[tmaxIdx].time.slice(11,16):'—'}</div>
    <div>Tmin ${tmin}${tempUnit(units)} at ${tminIdx>=0?hours[tminIdx].time.slice(11,16):'—'}</div>
    <div>Avg wind ${(units==='metric'?toMetersPerSecond(avgWind).toFixed(1):Math.round(avgWind))} ${units==='metric'?'m/s':'mph'}</div>
    <div>Avg rain ${avgPrecip}%</div>
  </div>`

  // Build the main content (use multiModelSvg but with single-series and larger size)
  const chart = multiModelSvg(results, hours, nowIdx, units, W, H)
  const params = multiParamSvg(hours, units, W, 88)

  return `<div style="width:${W}px;font-family:ui-sans-serif,system-ui;color:var(--foreground)">
    ${header}
    <div style="padding:8px">${chart}</div>
    <div style="padding:6px 8px;margin-top:6px;background:linear-gradient(180deg, rgba(255,255,255,0.02), transparent);border-top:1px solid rgba(255,255,255,0.03)">${params}</div>
    ${footer}
  </div>`
}

const LOADING_HTML = `<div style="width:660px;padding:8px 4px;font:11px ui-monospace,monospace;color:var(--muted-foreground)">Loading 24-hour forecast&hellip;</div>`
const ERROR_HTML = `<div style="width:660px;padding:8px 4px;font:11px ui-monospace,monospace;color:var(--muted-foreground)">Forecast unavailable for this spot.</div>`

export function MeasureMap() {
  const { location, units } = useWeather()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const lineRef = useRef<any>(null)
  const pointsRef = useRef<Point[]>([])
  const modeRef = useRef<Mode>("pick")
  const showSpotRef = useRef<(marker: any, point: Point) => void>(() => {})
  const overlayRef = useRef<any>(null)
  const framesRef = useRef<{ host: string; radar: LoopFrame[]; clouds: LoopFrame[] } | null>(null)
  const frameIdxRef = useRef(0)

  const [points, setPoints] = useState<Point[]>([])
  const [mode, setMode] = useState<Mode>("pick")
  const [layer, setLayer] = useState<LayerId>("none")
  const [frames, setFrames] = useState<LoopFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [zoomWarning, setZoomWarning] = useState(false)
  const [spotForecast, setSpotForecast] = useState<{ id: string; point: Point; best: any; results: ModelResult[] } | null>(null)
  const [pinnedSpots, setPinnedSpots] = useState<Array<{ id: string; point: Point; best: any; results: ModelResult[] }>>([])
  const [selectedPinnedId, setSelectedPinnedId] = useState<string | null>(null)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const fullMapContainerRef = useRef<HTMLDivElement | null>(null)
  const fullMapRef = useRef<any>(null)
  const fullMapWindLayerRef = useRef<any>(null)

  // Wind layer state
  const windLayerRef = useRef<any>(null)
  const [windData, setWindData] = useState<WindFrames | null>(null)
  const [windIdx, setWindIdx] = useState(0)
  const [windPlaying, setWindPlaying] = useState(true)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const clearOverlays = useCallback(() => {
    const map = mapRef.current
    markersRef.current.forEach((m) => map?.removeLayer(m))
    markersRef.current = []
    if (lineRef.current) {
      map?.removeLayer(lineRef.current)
      lineRef.current = null
    }
  }, [])

  const draw = useCallback(
    (pts: Point[]) => {
      const L = leafletRef.current
      const map = mapRef.current
      if (!L || !map) return
      clearOverlays()
      pts.forEach((p, i) => {
        const icon = modeRef.current === 'pick' ? flagIcon(L) : markerIcon(L, i === 0 ? "A" : "B")
        const marker = L.marker([p.lat, p.lon], { icon }).addTo(map)
        markersRef.current.push(marker)
      })
      if (pts.length === 2) {
        lineRef.current = L.polyline(
          [
            [pts[0].lat, pts[0].lon],
            [pts[1].lat, pts[1].lon],
          ],
          { color: "#f5b642", weight: 2, dashArray: "6 6", opacity: 0.9 },
        ).addTo(map)
        map.fitBounds(lineRef.current.getBounds(), { padding: [56, 56], maxZoom: 8 })
      }
    },
    [clearOverlays],
  )

  // Keep the spot-forecast opener in sync with selected units. Fetches EVERY model in parallel.
  useEffect(() => {
    showSpotRef.current = async (marker: any, point: Point) => {
      if (!marker) return
      setSpotForecast(null)
      // larger popup bounds for 24-hour expanded view
      marker.bindPopup(LOADING_HTML, { className: "spot-popup", minWidth: 660, maxWidth: 700, autoPan: true }).openPopup()
      try {
        const settled = await Promise.all(
          MODELS.map(async (m) => {
            try {
              const res = await fetch(`/api/weather?lat=${point.lat}&lon=${point.lon}&units=${units}&model=${m.id}`)
              if (!res.ok) return null
              const data = await res.json()
              return { meta: m, data }
            } catch {
              return null
            }
          }),
        )
        const ok = settled.filter((s): s is { meta: (typeof MODELS)[number]; data: any } => s != null && Array.isArray(s.data.hourly))
        if (ok.length === 0) {
          marker.setPopupContent(ERROR_HTML)
          return
        }
        const best = (ok.find((s) => s.meta.id === "best_match") ?? ok[0]).data
        const results: ModelResult[] = ok.map((s) => ({
          id: s.meta.id,
          label: s.meta.label,
          color: s.meta.color,
          hours: s.data.hourly,
        }))
        // Build a single-model 24h popup (double-sized)
        marker.setPopupContent(buildSpotPopupHtml(point, best, results, units, 640, 236))
        // Also set persistent spot forecast panel (used in pick mode)
        const id = `spot-${Date.now()}`
        const entry = { id, point, best, results }
        if (modeRef.current === 'pick') {
          setPinnedSpots((s) => [...s, entry])
          setSelectedPinnedId(id)
          setSpotForecast(entry)
        } else {
          setSpotForecast(entry)
        }
      } catch (err) {
        console.log("[v0] spot forecast failed:", err instanceof Error ? err.message : err)
        marker.setPopupContent(ERROR_HTML)
        setSpotForecast(null)
      }
    }
  }, [units])

  // Init map once.
  useEffect(() => {
    let cancelled = false
    async function init() {
      const L = (await import("leaflet")).default
      if (cancelled || !containerRef.current || mapRef.current) return
      leafletRef.current = L
      const map = L.map(containerRef.current, {
        center: [location?.latitude ?? 25.2, location?.longitude ?? 55.27],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
        // limit max zoom to avoid unsupported overlay zooms and visual jitter
        maxZoom: 12,
        minZoom: 4,
      })
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY
      let base = ""
      if (cartoKey) {
        base = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=" + cartoKey
      } else {
        // Use OpenStreetMap standard tiles when no Carto key is provided to avoid API key watermarks.
        base = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      }
      L.tileLayer(base, { maxZoom: 18, attribution: cartoKey ? '&copy; CARTO / OSM' : '&copy; OpenStreetMap contributors' }).addTo(map)

      // Hide radar/cloud overlays when user zooms beyond supported tile levels.
      map.on('zoomend', () => {
        try {
          const z = map.getZoom()
          if ((layer === 'radar' || layer === 'clouds') && z > MAX_OVERLAY_ZOOM) {
            if (overlayRef.current) {
              map.removeLayer(overlayRef.current)
              overlayRef.current = null
            }
            setZoomWarning(true)
          } else {
            setZoomWarning(false)
          }
        } catch {}
      })

      map.on("click", (e: any) => {
        const next: Point = { lat: e.latlng.lat, lon: e.latlng.lng }
        if (modeRef.current === 'pick') {
          // Add a persistent pin with flag icon and fetch its forecast
          const marker = L.marker([next.lat, next.lon], { icon: flagIcon(L) }).addTo(map)
          markersRef.current.push(marker)
          showSpotRef.current(marker, next)
        } else {
          // Measure mode: accumulate up to two markers and draw route
          const updated = pointsRef.current.length >= 2 ? [next] : [...pointsRef.current, next]
          pointsRef.current = updated
          setPoints(updated)
          draw(updated)
          const marker = markersRef.current[markersRef.current.length - 1]
          showSpotRef.current(marker, next)
        }
      })
      mapRef.current = map
    }
    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the full free RainViewer frame series (radar past+nowcast, IR satellite).
  useEffect(() => {
    let cancelled = false
    async function loadFrames() {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json")
        if (!res.ok) return
        const json = await res.json()
        const host = json.host ?? "https://tilecache.rainviewer.com"
        const radar: LoopFrame[] = [...(json.radar?.past ?? []), ...(json.radar?.nowcast ?? [])].map((f: any) => ({
          time: f.time,
          path: f.path,
        }))
        const clouds: LoopFrame[] = (json.satellite?.infrared ?? []).map((f: any) => ({ time: f.time, path: f.path }))
        if (!cancelled) framesRef.current = { host, radar, clouds }
      } catch (err) {
        console.log("[v0] rainviewer frames failed:", err instanceof Error ? err.message : err)
      }
    }
    loadFrames()
    return () => {
      cancelled = true
    }
  }, [])

  // When the active layer changes, load its frame series into the slider.
  useEffect(() => {
    const store = framesRef.current
    if (layer === "none" || !store) {
      setFrames([])
      return
    }
    const series = layer === "radar" ? store.radar : store.clouds
    setFrames(series)
    const last = Math.max(0, series.length - 1)
    frameIdxRef.current = last
    setFrameIdx(last)

    // If current map zoom is too high for overlays, warn user and do not attach overlay until they zoom out.
    try {
      const map = mapRef.current
      if (map && map.getZoom() > MAX_OVERLAY_ZOOM) {
        setZoomWarning(true)
        if (overlayRef.current) {
          map.removeLayer(overlayRef.current)
          overlayRef.current = null
        }
      } else {
        setZoomWarning(false)
      }
    } catch {}
  }, [layer])

  // Listen for time sync events from other panels and align frame index when possible
  useEffect(() => {
    function onSync(e: any) {
      try {
        const t = e?.detail?.time
        if (!t || frames.length === 0) return
        // find nearest index
        let best = 0
        let bestDiff = Infinity
        for (let i = 0; i < frames.length; i++) {
          const d = Math.abs(frames[i].time - t)
          if (d < bestDiff) {
            bestDiff = d
            best = i
          }
        }
        frameIdxRef.current = best
        setFrameIdx(best)
      } catch {}
    }
    window.addEventListener('maps:time-sync', onSync)
    return () => window.removeEventListener('maps:time-sync', onSync)
  }, [frames])

  // Paint the overlay for the currently-selected frame.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    const store = framesRef.current
    if (!L || !map) return
    if (layer === "none" || !store || frames.length === 0) {
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current)
        overlayRef.current = null
      }
      return
    }
    const frame = frames[Math.min(frameIdx, frames.length - 1)]
    if (!frame) return
    // Use 512 tiles and a zoomOffset so overlays appear larger at moderate zooms.
    const url =
      layer === "radar"
        ? `${store.host}${frame.path}/512/{z}/{x}/{y}/4/1_1.png`
        : `${store.host}${frame.path}/512/{z}/{x}/{y}/0/0_0.png`
    if (overlayRef.current) {
      overlayRef.current.setUrl(url)
    } else {
      overlayRef.current = L.tileLayer(url, {
        opacity: layer === "radar" ? 0.82 : 0.72, // stronger opacity for visibility
        maxZoom: MAX_OVERLAY_ZOOM,
        tileSize: 512,
        zoomOffset: -1,
        zIndex: 400,
      }).addTo(map)
    }

    // Broadcast the active time so other panels can sync their sliders.
    try {
      window.dispatchEvent(new CustomEvent('maps:time-sync', { detail: { source: 'measure', time: frame.time } }))
    } catch {}
  }, [layer, frames, frameIdx])

  // Clamp overlay creation to supported zoom levels. If user zooms too far, hide overlay and show tip.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (layer === 'none' || frames.length === 0) return
    const z = map.getZoom()
    if (z > MAX_OVERLAY_ZOOM) {
      // do not add overlay when zoomed in too far
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current)
        overlayRef.current = null
      }
      setZoomWarning(true)
      return
    }
    setZoomWarning(false)
    const store = framesRef.current
    if (!store) return
    const frame = frames[Math.min(frameIdx, frames.length - 1)]
    if (!frame) return
    // Use larger tiles for overlays so cloud graphics feel more prominent at higher zooms.
    const url =
      layer === "radar"
        ? `${store.host}${frame.path}/512/{z}/{x}/{y}/4/1_1.png`
        : `${store.host}${frame.path}/512/{z}/{x}/{y}/0/0_0.png`
    if (overlayRef.current) {
      overlayRef.current.setUrl(url)
    } else {
      overlayRef.current = L.tileLayer(url, {
        opacity: layer === "radar" ? 0.82 : 0.78,
        maxZoom: MAX_OVERLAY_ZOOM,
        tileSize: 512,
        zoomOffset: -1,
        zIndex: 400,
      }).addTo(map)
    }
  }, [layer, frames, frameIdx, MAX_OVERLAY_ZOOM])

  // Fullscreen map init when modal opens
  useEffect(() => {
    if (!fullscreenOpen) {
      if (fullMapRef.current) {
        try { fullMapRef.current.remove() } catch {}
        fullMapRef.current = null
      }
      return
    }
    const selected = pinnedSpots.find(s=>s.id===selectedPinnedId) ?? spotForecast
    if (!selected) return
    let cancelled = false
    async function initFull() {
      const L = (await import('leaflet')).default
      if (cancelled) return
      const container = fullMapContainerRef.current
      if (!container) return
      fullMapRef.current = L.map(container, { center: [selected.point.lat, selected.point.lon], zoom: 8, attributionControl: false })
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY
      const base = cartoKey ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${cartoKey}` : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      L.tileLayer(base, { maxZoom: 18, attribution: cartoKey ? '' : '&copy; OpenStreetMap contributors' }).addTo(fullMapRef.current)
      // add flag marker
      L.marker([selected.point.lat, selected.point.lon], { icon: flagIcon(L) }).addTo(fullMapRef.current)
      // add wind layer if available (use current wind frame)
      try {
        if (windData && windData.frames && windData.frames.length>0) {
          const grid = windData.frames[Math.min(windIdx, windData.frames.length-1)]
          fullMapWindLayerRef.current = createWindLayer(L, grid)
          fullMapWindLayerRef.current.addTo(fullMapRef.current)
        }
      } catch (err) { console.log('fullmap wind failed', err) }
    }
    initFull()
    return () => { cancelled = true; if (fullMapRef.current) try{ fullMapRef.current.remove() }catch{}; fullMapRef.current = null }
  }, [fullscreenOpen, selectedPinnedId, pinnedSpots, spotForecast, windData, windIdx])

  // Animate the frame slider when playing.
  useEffect(() => {
    if (layer === "none" || frames.length < 2 || !playing) return
    const id = setInterval(() => {
      frameIdxRef.current = (frameIdxRef.current + 1) % frames.length
      setFrameIdx(frameIdxRef.current)
    }, 750)
    return () => clearInterval(id)
  }, [layer, frames, playing])

  // Load and refresh the wind frames every 10 minutes (Open-Meteo grid series).
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await fetchWindFrames(controller.signal)
        if (data) {
          setWindData(data)
          setWindIdx(0)
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") console.log("[v0] wind field failed:", err instanceof Error ? err.message : err)
      }
    }
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  // Create / update the Leaflet wind canvas layer when active, swapping grids per frame.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return

    const grid = windData?.frames?.[Math.min(windIdx, (windData?.frames?.length ?? 1) - 1)]

    if (layer === "wind" && grid) {
      if (windLayerRef.current) {
        windLayerRef.current.setGrid(grid)
      } else {
        windLayerRef.current = createWindLayer(L, grid)
        windLayerRef.current.addTo(map)
      }
      // Arrow step adjustment
      // wind-layer uses fixed step; to vary density we recreate on speed change instead of mutating.
    } else if (windLayerRef.current) {
      map.removeLayer(windLayerRef.current)
      windLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, windData, windIdx])

  // Wind forecast animation timer (speed 1x/2x).
  useEffect(() => {
    if (layer !== "wind" || !windPlaying || !windData || windData.frames.length < 2) return
    const id = setInterval(() => setWindIdx((i) => (i + 1) % windData.frames.length), 900)
    return () => clearInterval(id)
  }, [layer, windPlaying, windData])

  // Free Open-Meteo geocoding search to jump the map to any place.
  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchNote(null)
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`)
      const data = await res.json()
      const hit = data?.results?.[0]
      if (!hit) {
        setSearchNote("No match found")
        return
      }
      const map = mapRef.current
      if (map) map.setView([hit.latitude, hit.longitude], 9)
      setSearchNote(`${hit.name}${hit.country ? `, ${hit.country}` : ""}`)
    } catch {
      setSearchNote("Search unavailable")
    } finally {
      setSearching(false)
    }
  }, [query])

  const reset = useCallback(() => {
    pointsRef.current = []
    setPoints([])
    clearOverlays()
    const map = mapRef.current
    if (map && location) map.setView([location.latitude, location.longitude], 6)
  }, [clearOverlays, location])

  const changeMode = useCallback(
    (next: Mode) => {
      setMode(next)
      modeRef.current = next
      // Switching modes clears the current selection so behaviour is predictable.
      pointsRef.current = []
      setPoints([])
      clearOverlays()
    },
    [clearOverlays],
  )

  const km = points.length === 2 ? haversineKm(points[0], points[1]) : 0
  const bearing = points.length === 2 ? bearingDeg(points[0], points[1]) : 0
  const albaharHref = `https://ghaith.ncm.gov.ae/?lang=en#cosmo-uae-wind`

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2">
          <Ruler className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <h2 className="label-caps text-foreground/80">Measure &amp; forecast map</h2>
        </span>
        <div className="flex flex-1 items-center justify-end gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              runSearch()
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-xs"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search location…"
                aria-label="Search for a location on the map"
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center rounded-md bg-signal px-3 py-1.5 font-mono text-sm uppercase tracking-wider text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {searching ? "…" : "Go"}
            </button>
          </form>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        </div>
      </header>

      {/* Mode selector: pick a single spot, or measure between two spots */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <span className="mr-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">Mode</span>
        <div role="tablist" aria-label="Map interaction mode" className="inline-flex rounded-md border border-border bg-card/60 p-0.5">
          <button
            role="tab"
            aria-selected={mode === "pick"}
            onClick={() => changeMode("pick")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider transition-colors",
              mode === "pick" ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MousePointerClick className="h-3 w-3" aria-hidden="true" />
            Pick point
          </button>
          <button
            role="tab"
            aria-selected={mode === "measure"}
            onClick={() => changeMode("measure")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider transition-colors",
              mode === "measure" ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Ruler className="h-3 w-3" aria-hidden="true" />
            Measure 2 points
          </button>
        </div>
        <span className="hidden font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground sm:inline">
          Popup shows a 24-hour forecast (Best model)
        </span>
      </div>

      {/* Free weather-layer overlays on the same map */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="mr-1 flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3 w-3" aria-hidden="true" />
          Layer
        </span>
        {LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLayer(l.id)}
            aria-pressed={layer === l.id}
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-sm uppercase tracking-wider transition-colors",
              layer === l.id
                ? "bg-signal text-signal-foreground"
                : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        ))}
        <a
          href={albaharHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-sm uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
        >
          Al Bahar · NCM
          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
        </a>
      </div>

      {/* Time slider for the active radar/cloud layer */}
      {layer !== "none" && frames.length > 0 ? (
        <div className="flex items-center gap-3 border-b border-border bg-card/60 px-3 py-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause loop" : "Play loop"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
          >
            {playing ? <Pause className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={Math.min(frameIdx, frames.length - 1)}
            onChange={(e) => {
              const i = Number(e.target.value)
              setPlaying(false)
              frameIdxRef.current = i
              setFrameIdx(i)
            }}
            aria-label="Scrub the radar time slider"
            className="h-1 flex-1 cursor-pointer accent-[var(--signal)]"
          />
          <span className="min-w-[92px] text-right font-mono text-[0.625rem] tabular-nums text-muted-foreground">
            {frames[Math.min(frameIdx, frames.length - 1)]
              ? new Date(frames[Math.min(frameIdx, frames.length - 1)].time * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}{" "}
            · {frameIdx + 1}/{frames.length}
          </span>
        </div>
      ) : null}

      {/* Wind controls and legend */}
      {layer === "wind" && windData && windData.frames.length > 0 ? (
        <div className="border-b border-border bg-card/60 px-3 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setWindPlaying((p) => !p)}
              aria-label={windPlaying ? "Pause wind" : "Play wind"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
            >
              {windPlaying ? <Pause className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
              {windPlaying ? "Pause" : "Play"}
            </button>

            <input
              type="range"
              min={0}
              max={windData.frames.length - 1}
              value={Math.min(windIdx, windData.frames.length - 1)}
              onChange={(e) => {
                const i = Number(e.target.value)
                setWindPlaying(false)
                setWindIdx(i)
              }}
              aria-label="Scrub the wind time slider"
              className="h-1 flex-1 cursor-pointer accent-[var(--signal)]"
            />

            <span className="min-w-[92px] text-right font-mono text-[0.625rem] tabular-nums text-muted-foreground">
              {windData.frames[Math.min(windIdx, windData.frames.length - 1)]
                ? new Date(windData.frames[Math.min(windIdx, windData.frames.length - 1)].time * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"} · {windIdx + 1}/{windData.frames.length}
            </span>

          </div>

          {/* Legend */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
              <span className="font-mono uppercase">Wind</span>
              <div className="ml-2 flex items-center gap-1">
                {WIND_SCALE.map((s) => (
                  <div key={s.c} title={s.label} style={{ background: s.c }} className="h-3 w-6 rounded-sm" />
                ))}
              </div>
            </div>
            <span className="ml-auto text-[0.625rem] text-muted-foreground">Arrows show wind direction; colours are wind speed (m/s)</span>
          </div>
        </div>
      ) : null}

      <div className="border-b border-border bg-secondary/40 px-4 py-2 font-mono text-[0.625rem] text-muted-foreground">
        {searchNote ? (
          <span className="mr-2 text-signal">Centered on {searchNote}.</span>
        ) : null}
        {mode === "pick"
          ? points.length === 0
            ? "Pick mode: click any spot to drop a pin and open its all-model 24-hour meteogram."
            : "Pin set — meteogram compares every model. Click another spot to move it."
          : points.length === 0
            ? "Measure mode: click to drop pin A, then pin B to measure distance & bearing. Each pin opens its forecast."
            : points.length === 1
              ? "Pin A set. Click another spot for pin B to measure the route."
              : "Route set. Click a pin to reopen its forecast, or click again to start over."}
      </div>

      {zoomWarning ? (
        <div className="w-full bg-yellow-500 text-black px-4 py-2 text-sm text-center">Zoom too far in — radar/cloud overlays are not available at this zoom level. Please zoom out to view them.</div>
      ) : null}
      <div
        ref={containerRef}
        className="h-[72vh] min-h-[560px] w-full bg-panel"
        role="application"
        aria-label="Interactive map: pick any spot for an all-model 24-hour meteogram, toggle free radar/cloud layers, or measure distance between two spots"
      />

      {/* Persistent pick-mode forecast panel (top-right) */}
      {mode === 'pick' && spotForecast ? (
        <div className="pointer-events-auto fixed right-4 top-20 z-50 w-80 max-w-[420px] rounded-md border border-border bg-card p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="label-caps text-xs text-muted-foreground">Point forecast (24h)</div>
              <div className="font-semibold">{spotForecast.best?.name ?? `${spotForecast.point.lat.toFixed(3)}, ${spotForecast.point.lon.toFixed(3)}`}</div>
            </div>
            <div className="flex gap-1">
              <button
                className="rounded px-2 py-1 text-xs hover:bg-secondary"
                onClick={() => {
                  // remove pin and clear panel
                  setSpotForecast(null)
                  pointsRef.current = []
                  setPoints([])
                  clearOverlays()
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="mt-2">
            {/* meteogram */}
              <div dangerouslySetInnerHTML={{ __html: multiModelSvg(spotForecast.results, spotForecast.best.hourly ?? [], typeof spotForecast.best.currentHourIndex === 'number' ? spotForecast.best.currentHourIndex : 0, units, 640, 236) }} />
              <div className="mt-2 text-xs text-muted-foreground">Model: {spotForecast.results[0]?.label ?? 'Forecast'}</div>
              {/* Hourly table */}
              <div className="mt-3 max-h-40 overflow-auto text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="pb-1">Time</th>
                      <th className="pb-1">T</th>
                      <th className="pb-1">Rain%</th>
                      <th className="pb-1">Wind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(spotForecast.best.hourly ?? []).slice(0,24).map((h:any,i:number)=> (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{h.time.slice(11,16)}</td>
                        <td className="py-1">{Math.round(h.temperature)}{tempUnit(units)}</td>
                        <td className="py-1">{Math.round(h.precipitationProbability ?? 0)}%</td>
                        <td className="py-1">{(units==='metric'?toMetersPerSecond(h.windSpeed ?? 0).toFixed(1):Math.round(h.windSpeed ?? 0))} {(units==='metric')?'m/s':'mph'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="rounded bg-signal px-3 py-1 text-xs text-signal-foreground" onClick={() => {
                  // download CSV for this spot
                  const rows = (spotForecast.best.hourly ?? []).slice(0,24).map((h:any)=>[
                    h.time, h.temperature, h.precipitationProbability ?? 0, h.windSpeed ?? 0, h.windDirection ?? 0
                  ])
                  const csv = ['time,temperature,precipitationProbability,windSpeed,windDirection', ...rows.map(r=>r.join(','))].join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `forecast-${spotForecast.point.lat.toFixed(3)}-${spotForecast.point.lon.toFixed(3)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
                }}>Download CSV</button>
                <button className="rounded border border-border px-3 py-1 text-xs" onClick={() => { setFullscreenOpen(true)}}>Open full-screen forecast</button>
              </div>
            </div>
          </div>
      ) : null}

      {/* Fullscreen forecast modal */}
      {fullscreenOpen && (selectedPinnedId || spotForecast) ? (
        <div className="fixed inset-0 z-60 flex items-stretch justify-center bg-black/60 p-6">
          <div className="relative w-full max-w-6xl h-full bg-panel rounded shadow-lg overflow-hidden">
            <div className="absolute right-3 top-3 z-50">
              <button className="rounded bg-red-600 px-3 py-1 text-white" onClick={() => setFullscreenOpen(false)}>Close</button>
            </div>
            <div className="grid grid-cols-2 h-full">
              <div className="p-4 overflow-auto">
                <div className="label-caps text-xs text-muted-foreground">24‑hour meteogram (full)</div>
                <div className="mt-2">
                  {(() => {
                    const sel = pinnedSpots.find(s=>s.id === selectedPinnedId) ?? spotForecast
                    if (!sel) return null
                    return <div dangerouslySetInnerHTML={{ __html: multiModelSvg(sel.results, sel.best.hourly ?? [], typeof sel.best.currentHourIndex === 'number' ? sel.best.currentHourIndex : 0, units) }} />
                  })()}
                </div>
              </div>
              <div className="relative">
                <div ref={fullMapContainerRef} className="h-full w-full" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Route metrics */}
      <div className="grid gap-px bg-border sm:grid-cols-3">
        <Stat label="Distance" value={points.length === 2 ? `${km.toFixed(1)} km` : "—"}>
          {points.length === 2 ? (
            <span className="font-mono text-[0.5625rem] text-muted-foreground">
              {(km * 0.621371).toFixed(1)} mi · {(km * 0.539957).toFixed(1)} nmi
            </span>
          ) : null}
        </Stat>
        <Stat label="Bearing" value={points.length === 2 ? `${Math.round(bearing)}°` : "—"}>
          {points.length === 2 ? (
            <span className="font-mono text-[0.5625rem] text-muted-foreground">heading {compass(bearing)}</span>
          ) : null}
        </Stat>
        <Stat label="Layer" value={LAYERS.find((l) => l.id === layer)?.label ?? "Base map"}>
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] text-muted-foreground">
            {layer === "none" ? (
              <>
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {mode === "pick" ? "pick a spot for its meteogram" : "measuring route"}
              </>
            ) : (
              <>
                <CloudRain className="h-3 w-3" aria-hidden="true" />
                live RainViewer overlay
              </>
            )}
          </span>
        </Stat>
      </div>

      <div className="border-t border-border px-4 py-2 font-mono text-[0.5625rem] text-muted-foreground">
        All-model spot meteograms via Open-Meteo (ECMWF · ICON · GFS · Météo-France) · free radar/cloud tiles © RainViewer
        · basemap © CARTO / OSM · UAE: NCM Al Bahar
      </div>
    </Panel>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="label-caps text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
      {children}
    </div>
  )
}
