"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import { ExternalLink, MapPin, MousePointerClick, RotateCcw, Ruler, Search } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"
import { compass, describeCode, precipUnit, tempUnit, toMetersPerSecond, weatherEmoji, type Units } from "@/lib/weather"
import { cn } from "@/lib/utils"

type Point = { lat: number; lon: number }
type Mode = "pick" | "measure"

// Every free Open-Meteo model is fetched and overlaid together in one popup.
const MODELS = [
  { id: "best_match", label: "Best", color: "#f5b642" },
  { id: "ecmwf", label: "ECMWF", color: "#38bdf8" },
  { id: "icon", label: "ICON", color: "#34d399" },
  { id: "gfs", label: "GFS", color: "#f472b6" },
  { id: "meteofrance", label: "M-France", color: "#a78bfa" },
] as const
type ModelId = (typeof MODELS)[number]["id"]

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

type ModelResult = { id: ModelId | "consensus"; label: string; color: string; hours: any[] }

// EmiratesConsensus: our own blended model = hourly mean of ECMWF + ICON + GFS.
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

/**
 * Multi-model 24-hour meteogram — DOUBLE size with proper X (time) and Y (temperature)
 * axes, gridlines and a clean plot boundary: colorful temperature ribbon + rain % bars
 * + per-model curves + consensus + now marker.
 */
function multiModelSvg(
  results: ModelResult[],
  barHours: any[],
  nowIdx: number,
  units: Units,
  chartW = 640,
  chartH = 260,
) {
  // Doubled canvas (was 320x118) with room for a left Y-axis gutter + bottom X-axis.
  const W = chartW
  const H = chartH
  const padL = 40
  const padR = 12
  const padT = 30
  const padB = 40
  const plotL = padL
  const plotR = W - padR
  const plotT = padT
  const plotB = H - padB
  const plotW = plotR - plotL
  const plotH = plotB - plotT
  const n = 24
  const step = plotW / (n - 1)
  const tx = (i: number) => plotL + i * step
  const toC = (t: number) => (units === "metric" ? t : ((t - 32) * 5) / 9)
  const unit = tempUnit(units)

  const allTemps = results.flatMap((r) => r.hours.map((h) => h.temperature))
  if (allTemps.length < 2) return ""
  // Pad the temperature range a little so the ribbon never touches the frame.
  const rawMin = Math.min(...allTemps)
  const rawMax = Math.max(...allTemps)
  const pad = Math.max((rawMax - rawMin) * 0.12, 1)
  const tmin = rawMin - pad
  const tmax = rawMax + pad
  const tspan = Math.max(tmax - tmin, 1)
  const ty = (t: number) => plotT + (1 - (t - tmin) / tspan) * plotH

  // Headline series for the ribbon (consensus preferred, else best match, else first).
  const head =
    results.find((r) => r.id === "consensus") ??
    results.find((r) => r.id === "best_match") ??
    results[0]
  const headHours = head.hours.slice(0, 24)

  // ---- Axes ----------------------------------------------------------------
  // Y gridlines + temperature labels (5 evenly spaced ticks across the range).
  const yTicks = 4
  const yGrid = Array.from({ length: yTicks + 1 }, (_, k) => {
    const t = tmin + (tspan * k) / yTicks
    const y = ty(t).toFixed(1)
    return `<line x1="${plotL}" y1="${y}" x2="${plotR}" y2="${y}" stroke="var(--border)" stroke-width="0.8" opacity="0.5"/>
      <text x="${plotL - 6}" y="${(Number(y) + 3).toFixed(1)}" fill="var(--muted-foreground)" font-size="9" font-family="ui-monospace,monospace" text-anchor="end">${Math.round(t)}${unit}</text>`
  }).join("")

  // X gridlines every 3 hours.
  const xGrid = [0, 3, 6, 9, 12, 15, 18, 21]
    .map((i) => `<line x1="${tx(i).toFixed(1)}" y1="${plotT}" x2="${tx(i).toFixed(1)}" y2="${plotB}" stroke="var(--border)" stroke-width="0.8" opacity="0.32"/>`)
    .join("")

  // Plot boundary frame + emphasised baseline/left axis.
  const frame = `<rect x="${plotL}" y="${plotT}" width="${plotW}" height="${plotH}" fill="none" stroke="var(--border)" stroke-width="1"/>
    <line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="var(--muted-foreground)" stroke-width="1" opacity="0.7"/>
    <line x1="${plotL}" y1="${plotT}" x2="${plotL}" y2="${plotB}" stroke="var(--muted-foreground)" stroke-width="1" opacity="0.7"/>`

  // ---- Data ----------------------------------------------------------------
  // Horizontal temperature gradient: one stop per hour, colored by that hour's temp.
  const gradId = `ribbon-${Math.random().toString(36).slice(2, 8)}`
  const stops = headHours
    .map((h, i) => `<stop offset="${((i / (n - 1)) * 100).toFixed(1)}%" stop-color="${tempColorC(toC(h.temperature))}"/>`)
    .join("")
  const gradDef = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`

  // Filled band beneath the headline curve, painted with the temperature gradient.
  const ribbonLine = headHours.map((h, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(1)},${ty(h.temperature).toFixed(1)}`).join(" ")
  const ribbon = `<path d="${ribbonLine} L${plotR.toFixed(1)},${plotB} L${plotL.toFixed(1)},${plotB} Z" fill="url(#${gradId})" opacity="0.85"/>`

  // Rain-probability bars anchored to the baseline.
  const bars = barHours
    .slice(0, 24)
    .map((h, i) => {
      const bh = Math.max(0, (h.precipitationProbability ?? 0) / 100) * plotH * 0.6
      return bh > 0.5
        ? `<rect x="${(tx(i) - step * 0.28).toFixed(1)}" y="${(plotB - bh).toFixed(1)}" width="${(step * 0.56).toFixed(1)}" height="${bh.toFixed(1)}" fill="var(--accent)" opacity="0.45" rx="1"/>`
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
      return `<path d="${line}" fill="none" stroke="${isBlend ? "#ffffff" : r.color}" stroke-width="${isBlend ? 2.6 : 1.3}" opacity="${isBlend ? 1 : 0.6}" stroke-linejoin="round"/>`
    })
    .join("")

  // Per-hour temperature labels along the headline curve (every 3rd hour).
  const tempLabels = headHours
    .map((h, i) =>
      i % 3 === 0
        ? `<text x="${tx(i).toFixed(1)}" y="${(ty(h.temperature) - 6).toFixed(1)}" fill="var(--foreground)" font-size="10" font-weight="700" font-family="ui-monospace,monospace" text-anchor="middle">${Math.round(h.temperature)}&#176;</text>`
        : "",
    )
    .join("")

  // X-axis hour labels below the frame.
  const axis = [0, 3, 6, 9, 12, 15, 18, 21, 23]
    .map((i) => {
      const anchor = i === 0 ? "start" : i === 23 ? "end" : "middle"
      const label = barHours[i] ? barHours[i].time.slice(11, 13) : String(i).padStart(2, "0")
      return `<text x="${tx(i).toFixed(1)}" y="${plotB + 16}" fill="var(--muted-foreground)" font-size="9.5" font-family="ui-monospace,monospace" text-anchor="${anchor}">${label}h</text>`
    })
    .join("")

  // Axis titles.
  const titles = `<text x="${plotL - 30}" y="${plotT - 12}" fill="var(--muted-foreground)" font-size="9" font-family="ui-monospace,monospace">${unit}</text>
    <text x="${plotR}" y="${H - 6}" fill="var(--muted-foreground)" font-size="9" font-family="ui-monospace,monospace" text-anchor="end">hour of day</text>`

  const clamped = Math.min(Math.max(nowIdx, 0), n - 1)
  const nowX = tx(clamped)
  const now = `<line x1="${nowX.toFixed(1)}" y1="${plotT}" x2="${nowX.toFixed(1)}" y2="${plotB}" stroke="var(--signal)" stroke-width="1.4" stroke-dasharray="3 3"/>
    <circle cx="${nowX.toFixed(1)}" cy="${ty(headHours[clamped]?.temperature ?? tmin).toFixed(1)}" r="3.5" fill="var(--signal)"/>
    <text x="${nowX.toFixed(1)}" y="${plotT - 6}" fill="var(--signal)" font-size="9" font-weight="700" font-family="ui-monospace,monospace" text-anchor="middle">NOW</text>`

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">${gradDef}${yGrid}${xGrid}${ribbon}${bars}${curves}${frame}${now}${tempLabels}${axis}${titles}</svg>`
}

function legendHtml(results: ModelResult[]) {
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">${results
    .map(
      (r) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;font:600 10px ui-monospace,monospace;color:var(--muted-foreground)"><span style="display:inline-block;width:12px;height:3px;background:${r.color}"></span>${r.label}</span>`,
    )
    .join("")}</div>`
}

/** Full popup card HTML: header (best match) + emoji strip + multi-model meteogram + legend + summary. */
export function buildSpotPopupHtml(
  point: Point,
  best: any,
  rawResults: ModelResult[],
  units: Units,
  chartW = 640,
  chartH = 260,
) {
  const hours: any[] = best.hourly ?? []
  const cur = best.current ?? {}
  const nowIdx = typeof best.currentHourIndex === "number" ? best.currentHourIndex : 0
  // Append our EmiratesConsensus blend (drawn last so it sits on top) + agreement report.
  const consensus = buildConsensus(rawResults)
  const results = consensus ? [...rawResults, consensus] : rawResults
  const report = agreementReport(rawResults, nowIdx, units)
  const reportHtml = report
    ? `<div style="margin-top:7px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:var(--secondary);font:600 11px ui-sans-serif,system-ui;color:var(--foreground);line-height:1.45">
        <span style="color:#fff">EmiratesConsensus</span> blends ECMWF + ICON + GFS. ${report.count} models agree within
        <span style="color:var(--signal)">${report.spread.toFixed(1)}${report.unit}</span> now &rarr; <span style="color:var(--signal)">${report.level}</span> predictability.
      </div>`
    : ""
  const cond = describeCode(cur.weatherCode ?? 0)
  const headEmoji = weatherEmoji(cur.weatherCode ?? 0, cur.isDay ?? true)
  const temps = hours.map((h) => h.temperature)
  const tmax = temps.length ? Math.round(Math.max(...temps)) : 0
  const tmin = temps.length ? Math.round(Math.min(...temps)) : 0
  const wind =
    units === "metric"
      ? `${toMetersPerSecond(cur.windSpeed ?? 0).toFixed(1)} m/s`
      : `${Math.round(cur.windSpeed ?? 0)} mph`
  const emojiRow = [0, 4, 8, 12, 16, 20, 23]
    .map((i) =>
      hours[i]
        ? `<span title="${hours[i].time.slice(11, 16)}">${weatherEmoji(hours[i].weatherCode, hours[i].isDay)}</span>`
        : "<span></span>",
    )
    .join("")
  return `<div style="width:${chartW}px;max-width:100%;font-family:ui-sans-serif,system-ui;color:var(--foreground)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      <span style="font-size:34px;line-height:1">${headEmoji}</span>
      <div style="line-height:1.15">
        <div style="font-size:30px;font-weight:700">${Math.round(cur.temperature ?? 0)}${tempUnit(units)}</div>
        <div style="font-size:13px;color:var(--muted-foreground)">${cond.label}</div>
      </div>
      <div style="margin-left:auto;text-align:right;font:600 11px ui-monospace,monospace;color:var(--muted-foreground)">${point.lat.toFixed(3)}&#176;N<br/>${point.lon.toFixed(3)}&#176;E</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:20px;margin:0 10px 4px">${emojiRow}</div>
    ${multiModelSvg(results, hours, nowIdx, units, chartW, chartH)}
    ${legendHtml(results)}
    <div style="display:flex;gap:16px;flex-wrap:wrap;font:600 12px ui-monospace,monospace;color:var(--muted-foreground);margin-top:7px">
      <span>&#128168; ${wind}</span>
      <span>&#128167; ${Math.round(cur.humidity ?? 0)}%</span>
      <span>&#127777;&#65039; ${tmax}${tempUnit(units)} / ${tmin}${tempUnit(units)}</span>
      <span>&#127783;&#65039; ${(cur.precipitation ?? 0).toFixed(units === "metric" ? 1 : 2)} ${precipUnit(units)}</span>
    </div>
    ${reportHtml}
    <div style="font:10px ui-monospace,monospace;color:var(--muted-foreground);margin-top:6px">All models + consensus &middot; 00h &rarr; 23h &middot; bars = rain %</div>
  </div>`
}

export const LOADING_HTML = `<div style="width:300px;padding:10px 6px;font:12px ui-monospace,monospace;color:var(--muted-foreground)">Comparing all forecast models&hellip;</div>`
export const ERROR_HTML = `<div style="width:300px;padding:10px 6px;font:12px ui-monospace,monospace;color:var(--muted-foreground)">Forecast unavailable for this spot.</div>`

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

  const [points, setPoints] = useState<Point[]>([])
  const [mode, setMode] = useState<Mode>("pick")
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchNote, setSearchNote] = useState<string | null>(null)

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
        const marker = L.marker([p.lat, p.lon], { icon: markerIcon(L, i === 0 ? "A" : "B") }).addTo(map)
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
      marker.bindPopup(LOADING_HTML, { className: "spot-popup", minWidth: 660, maxWidth: 680, autoPan: true }).openPopup()
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
        marker.setPopupContent(buildSpotPopupHtml(point, best, results, units))
      } catch (err) {
        console.log("[v0] spot forecast failed:", err instanceof Error ? err.message : err)
        marker.setPopupContent(ERROR_HTML)
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
      })
      // Keyless dark basemap (Esri World Dark Gray) + a matching reference label layer.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16 },
      ).addTo(map)
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, opacity: 0.9 },
      ).addTo(map)
      map.on("click", (e: any) => {
        const next: Point = { lat: e.latlng.lat, lon: e.latlng.lng }
        // Pick mode: single pin replaced each click. Measure mode: accumulate up to two.
        const updated =
          modeRef.current === "pick"
            ? [next]
            : pointsRef.current.length >= 2
              ? [next]
              : [...pointsRef.current, next]
        pointsRef.current = updated
        setPoints(updated)
        draw(updated)
        const marker = markersRef.current[markersRef.current.length - 1]
        showSpotRef.current(marker, next)
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
  const last = points[points.length - 1]
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
              className="inline-flex items-center rounded-md bg-signal px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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
          Popup compares all models
        </span>
        <a
          href={albaharHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
        >
          Al Bahar · NCM
          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
        </a>
      </div>

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

      <div
        ref={containerRef}
        className="h-[72vh] min-h-[560px] w-full bg-panel"
        role="application"
        aria-label="Interactive map: pick any spot for an all-model 24-hour meteogram, or measure distance between two spots"
      />

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
        <Stat label="Selected point" value={last ? `${last.lat.toFixed(2)}°, ${last.lon.toFixed(2)}°` : "—"}>
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {last ? "tap the pin for its all-model forecast" : mode === "pick" ? "pick a spot for its meteogram" : "measuring route"}
          </span>
        </Stat>
      </div>

      <div className="border-t border-border px-4 py-2 font-mono text-[0.5625rem] text-muted-foreground">
        All-model spot meteograms via Open-Meteo (ECMWF · ICON · GFS · Météo-France) · basemap © Esri / OSM · UAE: NCM Al
        Bahar. Rain radar &amp; clouds/IR live in the map above.
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
