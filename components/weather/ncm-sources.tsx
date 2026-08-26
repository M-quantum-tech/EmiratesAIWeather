"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Pause,
  Play,
  Radar,
  Satellite,
  ShieldAlert,
  Wind,
} from "lucide-react"
import { Panel } from "@/components/station/panel"
import { fetchWindFrames, type WindFrames } from "@/lib/wind-field"
import { createWindLayer } from "@/lib/wind-layer"
import {
  fetchEmirateWarnings,
  sampleWarnings,
  WARN_FILL,
  WARN_LEGEND,
  type EmirateWarning,
  type WarnLevel,
} from "@/lib/ncm-warnings"
import { cn } from "@/lib/utils"

type Frame = { time: number; path: string }
type Maps = { host: string; radar: Frame[]; satellite: Frame[] }
type Layer = "wind" | "radar" | "satellite" | "warnings"

// Official UAE National Center of Meteorology (Ghaith / Al Bahar) portals. These
// government viewers block embedding, so they remain reference links below the live map.
const NCM_LINKS = [
  { label: "Radar Merge UAE", href: "https://ghaith.ncm.gov.ae/?lang=en#trajectory,radar-Merge-UAE", icon: Radar },
  { label: "COSMO-UAE Wind", href: "https://ghaith.ncm.gov.ae/?lang=en#cosmo-uae-wind", icon: Wind },
  { label: "Official Warnings", href: "https://www.ncm.gov.ae/maps-warnings?lang=en", icon: AlertTriangle },
  { label: "Satellite HD Global", href: "https://ghaith.ncm.gov.ae/?lang=en#satellite-hd-global", icon: Satellite },
] as const

// Al Bahar-style precipitation intensity scale (light → extreme). Matches the
// RainViewer "Rainbow @ SELEX-SI" colour scheme (index 7) used for the radar tiles.
const RADAR_SCALE = [
  { c: "#37c6ff", label: "Light" },
  { c: "#22e06a", label: "" },
  { c: "#0aa03c", label: "Moderate" },
  { c: "#e6e12b", label: "" },
  { c: "#f5a623", label: "Heavy" },
  { c: "#e8442a", label: "" },
  { c: "#b01d8f", label: "Violent" },
] as const

const CLOUD_SCALE = [
  { c: "#0b1b33", label: "Clear" },
  { c: "#2b3f5c", label: "" },
  { c: "#5a6f8c", label: "Low cloud" },
  { c: "#9aa8bd", label: "" },
  { c: "#d6dce6", label: "High / cold top" },
] as const

// Wind-speed legend (m/s) matching the Windy-style heatmap palette (calm → gale).
const WIND_SCALE = [
  { c: "#1a3a78", label: "Calm" },
  { c: "#1a96be", label: "" },
  { c: "#78c868", label: "Breeze" },
  { c: "#f0963c", label: "Strong" },
  { c: "#e4483a", label: "Gale" },
] as const

/** Format a local ISO timestamp like "2026-08-26T12:00" into "Wed 26/08/2026 · 12:00". */
function formatWindTime(iso?: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const wd = d.toLocaleDateString("en-GB", { weekday: "short" })
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  return `${wd} ${date} · ${time}`
}

const BANNER_TONE: Record<WarnLevel, string> = {
  green: "bg-alert-green/15 text-alert-green border-alert-green/40",
  yellow: "bg-alert-yellow text-black border-alert-yellow",
  orange: "bg-alert-orange text-black border-alert-orange",
  red: "bg-alert-red text-white border-alert-red",
}

export function NcmSources() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlayRef = useRef<any>(null)
  const windLayerRef = useRef<any>(null)
  const warnLayerRef = useRef<any>(null)
  const geoRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)

  const [maps, setMaps] = useState<Maps | null>(null)
  const [layer, setLayer] = useState<Layer>("warnings")
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [stamp, setStamp] = useState("")
  const [mapReady, setMapReady] = useState(false)
  const [windData, setWindData] = useState<WindFrames | null>(null)
  const [windIdx, setWindIdx] = useState(0)
  const [windPlaying, setWindPlaying] = useState(true)
  const [windSpeed, setWindSpeed] = useState<1 | 2>(1)
  const [warnings, setWarnings] = useState<EmirateWarning[] | null>(null)
  const [geoReady, setGeoReady] = useState(false)

  const frames = layer === "radar" ? (maps?.radar ?? []) : layer === "satellite" ? (maps?.satellite ?? []) : []

  // Live warnings (level above green). If none, fall back to a labelled SAMPLE set.
  const live = useMemo(() => (warnings ?? []).filter((w) => w.level !== "green"), [warnings])
  const isSample = warnings != null && live.length === 0
  const display = useMemo<EmirateWarning[]>(
    () => (isSample ? sampleWarnings() : live),
    [isSample, live],
  )
  const top = display[0] ?? null

  const frameUrl = (f: Frame) => {
    const host = maps?.host ?? "https://tilecache.rainviewer.com"
    return layer === "radar"
      ? `${host}${f.path}/512/{z}/{x}/{y}/7/1_1.png`
      : `${host}${f.path}/512/{z}/{x}/{y}/0/0_0.png`
  }

  // Load and refresh RainViewer frame catalogue every 5 minutes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json")
        if (!res.ok) return
        const json = await res.json()
        const radar: Frame[] = [...(json.radar?.past ?? []), ...(json.radar?.nowcast ?? [])].map((f: any) => ({
          time: f.time,
          path: f.path,
        }))
        const satellite: Frame[] = (json.satellite?.infrared ?? []).map((f: any) => ({ time: f.time, path: f.path }))
        if (!cancelled) setMaps({ host: json.host ?? "https://tilecache.rainviewer.com", radar, satellite })
      } catch (err) {
        console.log("[v0] ncm loops frames failed:", err instanceof Error ? err.message : err)
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Load and refresh the live UAE wind forecast every 10 minutes (Windy-style layer).
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
        if ((err as any)?.name !== "AbortError")
          console.log("[v0] wind field failed:", err instanceof Error ? err.message : err)
      }
    }
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  // Load live per-emirate warnings every 5 minutes.
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await fetchEmirateWarnings(controller.signal)
        setWarnings(data)
      } catch (err) {
        if ((err as any)?.name !== "AbortError")
          console.log("[v0] warnings failed:", err instanceof Error ? err.message : err)
        setWarnings([])
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  // Load the UAE emirate polygons once.
  useEffect(() => {
    let cancelled = false
    fetch("/geo/uae-emirates.geojson")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          geoRef.current = json
          setGeoReady(true)
        }
      })
      .catch((err) => console.log("[v0] uae geojson failed:", err instanceof Error ? err.message : err))
    return () => {
      cancelled = true
    }
  }, [])

  // Init the Leaflet map once, centred on the UAE like the NCM Al Bahar viewer.
  useEffect(() => {
    let cancelled = false
    async function init() {
      const L = (await import("leaflet")).default
      if (cancelled || !containerRef.current || mapRef.current) return
      leafletRef.current = L
      const map = L.map(containerRef.current, {
        center: [24.2, 55.2],
        zoom: 8,
        minZoom: 4,
        maxZoom: 12,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      })
      map.zoomControl.setPosition("bottomright")
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 12 }).addTo(map)
      mapRef.current = map
      if (!cancelled) setMapReady(true)
      setTimeout(() => map.invalidateSize(), 250)
    }
    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        overlayRef.current = null
        windLayerRef.current = null
        warnLayerRef.current = null
      }
    }
  }, [])

  // Jump to newest frame whenever the frame set or layer changes.
  useEffect(() => {
    if (frames.length > 0) setIdx(frames.length - 1)
  }, [frames, layer])

  // Manage the RainViewer tile overlay (radar / satellite only).
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return

    if ((layer !== "radar" && layer !== "satellite") || frames.length === 0) {
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current)
        overlayRef.current = null
      }
      return
    }

    const f = frames[Math.min(idx, frames.length - 1)]
    if (!f) return
    const url = frameUrl(f)
    if (overlayRef.current) {
      overlayRef.current.setUrl(url)
    } else {
      overlayRef.current = L.tileLayer(url, {
        opacity: layer === "radar" ? 0.85 : 0.62,
        maxZoom: 12,
        zIndex: 400,
      }).addTo(map)
    }
    setStamp(new Date(f.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    // Broadcast the active time so other map panels can sync.
    try {
      window.dispatchEvent(new CustomEvent('maps:time-sync', { detail: { source: 'ncm', time: f.time } }))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, frames, layer])

  // Reset the tile overlay when switching layers so scheme/opacity swaps cleanly.
  useEffect(() => {
    const map = mapRef.current
    if (map && overlayRef.current) {
      map.removeLayer(overlayRef.current)
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer])

  // Manage the Windy-style wind layer (heatmap + arrow grid), swapping the active forecast frame.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map || !mapReady) return

    const grid = windData?.frames[Math.min(windIdx, windData.frames.length - 1)]

    if (layer === "wind" && grid) {
      if (windLayerRef.current) {
        windLayerRef.current.setGrid(grid)
      } else {
        windLayerRef.current = createWindLayer(L, grid)
        windLayerRef.current.addTo(map)
      }
    } else if (windLayerRef.current) {
      map.removeLayer(windLayerRef.current)
      windLayerRef.current = null
    }
  }, [layer, windData, windIdx, mapReady])

  // Wind forecast animation timer (speed 1x/2x).
  useEffect(() => {
    if (layer !== "wind" || !windPlaying || !windData || windData.frames.length < 2) return
    const id = setInterval(() => setWindIdx((i) => (i + 1) % windData.frames.length), 900 / (windSpeed || 1))
    return () => clearInterval(id)
  }, [layer, windPlaying, windData, windSpeed])

  // Listen for time sync events from other panels and align index where possible
  useEffect(() => {
    function onSync(e: any) {
      try {
        const t = e?.detail?.time
        if (!t || !windData) return
        // Try to find a matching frame and update windIdx/frame index where appropriate
        const i = windData.frames.findIndex((f) => f.time === t)
        if (i >= 0) setWindIdx(i)
      } catch {}
    }
    window.addEventListener('maps:time-sync', onSync)
    return () => window.removeEventListener('maps:time-sync', onSync)
  }, [windData])

  // Manage the warnings polygon layer (NCM Al Bahar-style shaded emirates).
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return

    // Always rebuild so severity colours stay in sync.
    if (warnLayerRef.current) {
      map.removeLayer(warnLayerRef.current)
      warnLayerRef.current = null
    }

    if (layer !== "warnings" || !geoReady || !geoRef.current) return

    const levelByName = new Map<string, WarnLevel>()
    display.forEach((w) => levelByName.set(w.name, w.level))

    const group = L.layerGroup()
    // Navy sea/land tint to echo the NCM basemap without hiding labels.
    L.rectangle(
      [
        [12, 44],
        [32, 64],
      ],
      { stroke: false, fillColor: "#0b2545", fillOpacity: 0.4, interactive: false },
    ).addTo(group)

    L.geoJSON(geoRef.current, {
      style: (feature: any) => {
        const lvl = levelByName.get(feature.properties.name) ?? "green"
        const warned = lvl !== "green"
        return {
          color: warned ? "#ffffff" : "#6f8fb0",
          weight: warned ? 1.4 : 0.7,
          opacity: warned ? 0.9 : 0.5,
          fillColor: WARN_FILL[lvl],
          fillOpacity: warned ? 0.62 : 0.28,
        }
      },
      onEachFeature: (feature: any, lyr: any) => {
        const lvl = levelByName.get(feature.properties.name) ?? "green"
        const label = lvl === "green" ? "No warning" : lvl === "yellow" ? "Be Aware" : lvl === "orange" ? "Be Prepared" : "Take Action"
        lyr.bindTooltip(`${feature.properties.name} — ${label}`, { sticky: true, direction: "top" })
      },
    }).addTo(group)

    group.addTo(map)
    warnLayerRef.current = group
  }, [layer, geoReady, display])

  // Animation timer (radar / satellite frame loop).
  useEffect(() => {
    if ((layer !== "radar" && layer !== "satellite") || !playing || frames.length < 2) return
    const id = setInterval(() => setIdx((i) => (i + 1) % frames.length), 700)
    return () => clearInterval(id)
  }, [playing, frames, layer])

  const isWarnings = layer === "warnings"
  const scale = layer === "radar" ? RADAR_SCALE : layer === "satellite" ? CLOUD_SCALE : WIND_SCALE
  const legendTitle = layer === "radar" ? "Rain intensity" : layer === "satellite" ? "Cloud top" : "Wind speed"

  const tabs: { id: Layer; label: string; Icon: typeof Radar }[] = [
    { id: "warnings", label: "Warnings", Icon: ShieldAlert },
    { id: "wind", label: "Wind field", Icon: Wind },
    { id: "radar", label: "Rain radar", Icon: Radar },
    { id: "satellite", label: "Clouds / IR", Icon: CloudSun },
  ]

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2">
          <Satellite className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <h2 className="label-caps text-foreground/80">Live wind, radar, clouds &amp; warnings · UAE</h2>
        </span>
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          NCM Al Bahar style · live
        </span>
      </header>

      {/* Layer switcher (Al Bahar-style tabs) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">Layer</span>
        <div className="flex overflow-hidden rounded-md border border-border">
          {tabs.map(({ id, label, Icon }, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayer(id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-wider transition-colors",
                i > 0 && "border-l border-border",
                layer === id ? "bg-signal text-black" : "bg-card text-muted-foreground hover:bg-secondary",
              )}
              aria-pressed={layer === id}
            >
              <Icon className="h-3 w-3" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <a
          href="https://www.ncm.gov.ae/maps-warnings?lang=en"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-alert-orange/50 bg-alert-orange/10 px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-alert-orange transition-colors hover:bg-alert-orange/20"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" /> NCM warnings
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      {/* Big live map */}
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[80vh] min-h-[620px] w-full bg-panel"
          role="img"
          aria-label={
            isWarnings
              ? "UAE weather warnings map with emirates shaded by alert severity"
              : `Large animated ${layer === "radar" ? "precipitation radar" : layer === "satellite" ? "cloud / infrared satellite" : "surface wind"} map centred on the UAE`
          }
        />

        {/* ---------- WARNINGS OVERLAYS ---------- */}
        {isWarnings && (
          <>
            {/* Top warning banner */}
            <div
              className={cn(
                "absolute inset-x-3 top-3 z-[500] flex items-center gap-3 rounded-md border px-3 py-2 shadow-lg backdrop-blur-sm",
                BANNER_TONE[top?.level ?? "green"],
              )}
            >
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded bg-black/15 px-2 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-wider">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {top ? "Warning" : "All clear"}
              </span>
              <p className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
                {top
                  ? top.description
                  : "No active weather warnings across the Emirates. Conditions are calm."}
              </p>
              {isSample && (
                <span className="shrink-0 rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.5rem] font-bold uppercase tracking-widest">
                  Sample
                </span>
              )}
            </div>

            {/* Compass rose */}
            <div className="absolute right-3 top-16 z-[500] hidden h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/50 backdrop-blur sm:grid">
              <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden="true">
                <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                <polygon points="24,6 27,24 24,20 21,24" fill="#e8442a" />
                <polygon points="24,42 21,24 24,28 27,24" fill="rgba(255,255,255,0.55)" />
                <text x="24" y="16" textAnchor="middle" fontSize="7" fill="#fff" fontFamily="monospace">
                  N
                </text>
              </svg>
            </div>

            {/* Right sidebar warning cards */}
            <div className="absolute right-3 top-32 z-[500] flex max-h-[58%] w-60 flex-col gap-2 overflow-auto sm:w-64">
              <div className="rounded-md border border-white/15 bg-primary/90 px-3 py-2 text-center font-mono text-[0.625rem] uppercase tracking-wider text-primary-foreground shadow">
                {display.length ? `${display.length} active warning${display.length > 1 ? "s" : ""}` : "Show all warnings"}
              </div>
              {display.map((w) => (
                <article key={w.name} className="overflow-hidden rounded-md border border-border bg-card shadow">
                  <header className={cn("px-3 py-2 text-center text-xs font-bold leading-tight", BANNER_TONE[w.level])}>
                    {w.name}: {w.headline}
                  </header>
                  <div className="border-b border-border bg-secondary px-3 py-1 text-center font-mono text-[0.5625rem] uppercase tracking-wide text-muted-foreground">
                    From {w.from} to {w.to}
                  </div>
                  <p className="px-3 py-2 text-[0.6875rem] leading-relaxed text-foreground">{w.description}</p>
                </article>
              ))}
              {isSample && (
                <p className="rounded-md border border-dashed border-border bg-card/70 px-3 py-2 text-[0.625rem] leading-relaxed text-muted-foreground">
                  No live warnings right now — showing a sample so you can preview the alert view. Live severity updates
                  every 5 minutes.
                </p>
              )}
            </div>

            {/* Bottom severity legend */}
            <div className="absolute inset-x-3 bottom-3 z-[500] flex flex-wrap items-stretch gap-2 rounded-md bg-black/55 px-3 py-2 backdrop-blur">
              {WARN_LEGEND.map((l) => (
                <div key={l.level} className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: WARN_FILL[l.level] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 text-[0.625rem] leading-tight text-white/85">
                    <strong className="text-white">{l.label}:</strong> {l.note}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- NON-WARNINGS OVERLAYS ---------- */}
        {!isWarnings && (
          <>
            <span className="absolute left-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-white backdrop-blur">
              {layer === "radar" ? (
                <>
                  <Radar className="h-3.5 w-3.5 text-signal" aria-hidden="true" /> Live rain radar
                </>
              ) : layer === "satellite" ? (
                <>
                  <CloudSun className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Cloud / IR satellite
                </>
              ) : (
                <>
                  <Wind className="h-3.5 w-3.5 text-signal" aria-hidden="true" /> Live wind field
                </>
              )}
            </span>

            <div className="absolute left-3 top-14 z-[500] rounded-md bg-black/55 px-2.5 py-2 backdrop-blur">
              <p className="mb-1 font-mono text-[0.5625rem] uppercase tracking-wider text-white/70">{legendTitle}</p>
              <div className="flex h-2.5 w-40 overflow-hidden rounded-sm">
                {scale.map((s) => (
                  <span key={s.c} className="flex-1" style={{ backgroundColor: s.c }} aria-hidden="true" />
                ))}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[0.5rem] uppercase tracking-wide text-white/70">
                {scale
                  .filter((s) => s.label)
                  .map((s) => (
                    <span key={s.label}>{s.label}</span>
                  ))}
              </div>
            </div>

            {layer === "radar" && (
              <span className="absolute right-3 top-3 z-[500] inline-flex max-w-[13rem] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-right font-mono text-[0.5625rem] uppercase tracking-wide text-white/80 backdrop-blur">
                Rain paints only where detected — UAE is often dry
              </span>
            )}
            {layer === "wind" && (
              <span className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-md bg-signal/90 px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-wider text-black backdrop-blur">
                Forecast · 10 m surface wind
              </span>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
              {layer === "wind" ? (
                windData && windData.frames.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setWindPlaying((p) => !p)}
                      className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-alert-red text-white shadow transition-transform hover:scale-105"
                      aria-label={windPlaying ? "Pause forecast" : "Play forecast"}
                    >
                      {windPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-md border border-white/20 bg-black/55 p-0.5 backdrop-blur">
                      <button
                        type="button"
                        onClick={() => {
                          setWindPlaying(false)
                          setWindIdx((i) => (i - 1 + windData.frames.length) % windData.frames.length)
                        }}
                        className="grid h-6 w-6 place-items-center rounded text-white/80 hover:bg-white/10"
                        aria-label="Previous hour"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWindPlaying(false)
                          setWindIdx((i) => (i + 1) % windData.frames.length)
                        }}
                        className="grid h-6 w-6 place-items-center rounded text-white/80 hover:bg-white/10"
                        aria-label="Next hour"
                      >
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border border-white/20 bg-black/55 px-1.5 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-white/70 backdrop-blur">
                      <span>Speed</span>
                      {([1, 2] as const).map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => setWindSpeed(sp)}
                          className={cn(
                            "rounded px-1.5 py-0.5 transition-colors",
                            windSpeed === sp ? "bg-signal text-black" : "text-white/70 hover:bg-white/10",
                          )}
                          aria-pressed={windSpeed === sp}
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={windData.frames.length - 1}
                      value={Math.min(windIdx, windData.frames.length - 1)}
                      onChange={(e) => {
                        setWindPlaying(false)
                        setWindIdx(Number(e.target.value))
                      }}
                      aria-label="Scrub the wind forecast time"
                      className="pointer-events-auto h-1.5 flex-1 cursor-pointer accent-[var(--signal)]"
                    />
                    <span className="shrink-0 rounded-md bg-alert-red px-2.5 py-1 font-mono text-[0.6875rem] tabular-nums text-white shadow">
                      {formatWindTime(windData.times[Math.min(windIdx, windData.times.length - 1)])}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-wider text-white/90">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-signal" aria-hidden="true" />
                    Loading wind forecast…
                  </span>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/20 bg-black/55 px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-white backdrop-blur transition-colors hover:bg-black/75"
                    aria-label={playing ? "Pause loop" : "Play loop"}
                  >
                    {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                    {playing ? "Playing" : "Paused"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, frames.length - 1)}
                    value={Math.min(idx, Math.max(0, frames.length - 1))}
                    onChange={(e) => {
                      setPlaying(false)
                      setIdx(Number(e.target.value))
                    }}
                    disabled={frames.length === 0}
                    aria-label={`Scrub the ${layer} time loop`}
                    className="pointer-events-auto h-1.5 flex-1 cursor-pointer accent-[var(--signal)]"
                  />
                  <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums text-white/90">
                    {frames.length > 0 ? `${stamp} · ${idx + 1}/${frames.length}` : "loading…"}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Official NCM reference links */}
      <div className="border-t border-border px-4 py-3">
        <p className="mb-2 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          Official National Center of Meteorology views
        </p>
        <ul className="flex flex-wrap gap-2">
          {NCM_LINKS.map((l) => {
            const Icon = l.icon
            return (
              <li key={l.label}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5",
                    "text-xs text-foreground transition-colors hover:bg-secondary",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                  {l.label}
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="border-t border-border px-4 py-2 font-mono text-[0.5625rem] text-muted-foreground">
        Live wind &amp; warnings via Open-Meteo · radar &amp; cloud loops © RainViewer · basemap © CARTO / OSM · boundaries ©
        geoBoundaries · official imagery &amp; warnings via NCM Al Bahar (opens in a new tab)
      </div>
    </Panel>
  )
}
