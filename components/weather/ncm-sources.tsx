"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudSun,
  LineChart,
  MapPin,
  Pause,
  Play,
  Radar,
  Ruler,
  Satellite,
  ShieldAlert,
  Trash2,
  Wind,
} from "lucide-react"
import { Panel } from "@/components/station/panel"
import { fetchWindFrames, type WindFrames } from "@/lib/wind-field"
import { createWindLayer } from "@/lib/wind-layer"

 import { createCloudLayer } from "@/lib/cloud-layer"
import { createStationLayer, type StationMode } from "@/lib/station-layer"
import { stationReadings } from "@/lib/stations"
import {
  fetchWarningFrames,
  fmtNcmTime,
  NCM_WARNINGS,
  WARN_FILL,
  WARN_LEGEND,
  type EmirateWarning,
  type WarningFrames,
  type WarnLevel,
} from "@/lib/ncm-warnings"
import { cn } from "@/lib/utils"
import { useWeather } from "@/components/weather/weather-provider"

type Frame = { time: number; path: string }
type Maps = { host: string; radar: Frame[]; satellite: Frame[] }
type Layer = "wind" | "radar" | "satellite" | "clouds" | "warnings"
type LatLng = { lat: number; lng: number }

/** Great-circle distance (Haversine) in kilometres between two lat/lng points. */
function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return R * 2 * Math.asin(Math.sqrt(h))
}

// Warnings layer uses the COLOURED, Google-Maps-style Esri World Street Map
// (keyless, colored land/water/roads with English/Latin labels baked in) so it reads
// like the NCM live map instead of a washed-out white canvas. Its own labels are in
// English, so the separate Esri reference-label layer is hidden on the warnings view
// to avoid doubled names. Animated radar/cloud/wind layers use the Esri DARK canvas
// so colours pop, with the dark English reference labels on top.
const BASE_WARN =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
const REF_LIGHT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
const BASE_DARK =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
const REF_DARK =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"

// Official UAE National Center of Meteorology (Ghaith / Al Bahar) portals plus the
// meteoblue satellite view and the Open-Meteo trend source used for AI prediction.
// These government viewers block embedding, so they remain deep-link references below
// the live map.
const NCM_LINKS = [
  { label: "Official Warnings", href: "https://www.ncm.gov.ae/maps-warnings?lang=en", icon: AlertTriangle },
  { label: "Diverging Winds · COSMO-UAE", href: "https://ghaith.ncm.gov.ae/?lang=en#cosmo-uae-wind", icon: Wind },
  {
    label: "Radar-Merge Sat · Trajectory",
    href: "https://ghaith.ncm.gov.ae/?lang=en#radar-Merge-Sat,trajectory",
    icon: Radar,
  },
  { label: "Cloud Tops · IR", href: "https://ghaith.ncm.gov.ae/?lang=en#satellite-IR", icon: CloudSun },
  { label: "Rain / Hail Radar · GCC", href: "https://ghaith.ncm.gov.ae/?lang=en#radar-Merge-GCC,hail", icon: Radar },
  {
    label: "meteoblue Satellite",
    href: "https://www.meteoblue.com/en/weather/maps#map=satellite~radar~none~none~none&coords=4.51/24.4/54.4",
    icon: Satellite,
  },
  { label: "Open-Meteo Trend + AI", href: "https://open-meteo.com/", icon: LineChart },
] as const

// NCM Al Bahar-style reflectivity scale (light → extreme): green for moderate rain,
// red for heavy, magenta/white for violent cores. Matches the RainViewer "NEXRAD
// Level III" colour scheme (index 6) used for the radar tiles.
const RADAR_SCALE = [
  { c: "#04e9e7", label: "Light" },
  { c: "#0300f4", label: "" },
  { c: "#02fd02", label: "Moderate" },
  { c: "#fdf802", label: "" },
  { c: "#fd9500", label: "Heavy" },
  { c: "#fd0000", label: "" },
  { c: "#f800fd", label: "Violent" },
] as const

// Radar-Merge-Sat legend: grey IR cloud field with vivid radar reflectivity
// cells (green → yellow → red → magenta) painted on top.
const CLOUD_SCALE = [
  { c: "#3a4a63", label: "Cloud" },
  { c: "#02fd02", label: "Rain" },
  { c: "#fdf802", label: "" },
  { c: "#fd9500", label: "Heavy" },
  { c: "#fd0000", label: "" },
  { c: "#f800fd", label: "Intense" },
] as const

// Total-cloud-cover legend (%) matching the COSMO-UAE total-clouds palette in
// lib/cloud-layer: clear (dark) → thin blue-grey haze → bright overcast white.
const CLOUD_COVER_SCALE = [
  { c: "#1a2436", label: "0" },
  { c: "#3a4a63", label: "" },
  { c: "#7c8aa0", label: "50" },
  { c: "#c3ccd9", label: "" },
  { c: "#f5f8fc", label: "100" },
] as const

// Wind-speed legend (km/h) matching the COSMO-UAE heatmap palette in lib/wind-layer.
// Numeric ticks (km/h) mirror the NCM diverging-winds scale calm → gale.
const WIND_SCALE = [
  { c: "#2642a8", label: "0" },
  { c: "#1ea5cd", label: "18" },
  { c: "#2ec39e", label: "36" },
  { c: "#80d26c", label: "54" },
  { c: "#e8d658", label: "72" },
  { c: "#f69c3c", label: "90" },
  { c: "#e84a3a", label: "108+" },
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
  const { units } = useWeather()
  const unitsRef = useRef(units)
  unitsRef.current = units

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlayRef = useRef<any>(null)
  const mergeRef = useRef<any>(null)
  const basemapRef = useRef<any>(null)
  const referenceRef = useRef<any>(null)
  const windLayerRef = useRef<any>(null)
  const stationLayerRef = useRef<any>(null)
  const warnLayerRef = useRef<any>(null)
  const geoRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const warnScrollRef = useRef<HTMLDivElement>(null)

  const [maps, setMaps] = useState<Maps | null>(null)
  const [layer, setLayer] = useState<Layer>("warnings")
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [stamp, setStamp] = useState("")
  const [mapReady, setMapReady] = useState(false)
  const [windData, setWindData] = useState<WindFrames | null>(null)
  const [windIdx, setWindIdx] = useState(0)
  const [windPlaying, setWindPlaying] = useState(true)
  const [windSpeed, setWindSpeed] = useState<0.5 | 1 | 2>(1)
  // NCM AWS station overlay: wind km/h on the wind tab, live DNI (W/m²) on the clouds tab.
  const [showStations, setShowStations] = useState(true)
  // Wind forecast horizon: "live" = next 24 h, "7day" = 7-day outlook (3-hourly steps).
  const [windRange, setWindRange] = useState<"live" | "7day">("live")
  const [cloudIdx, setCloudIdx] = useState(0)
  const [cloudPlaying, setCloudPlaying] = useState(true)
  const [warnFrames, setWarnFrames] = useState<WarningFrames | null>(null)
  const [warnIdx, setWarnIdx] = useState(0)
  const [warnPlaying, setWarnPlaying] = useState(true)
  const [geoReady, setGeoReady] = useState(false)

  // Trajectory / distance measuring tool (NCM Ghaith-style): click multiple points
  // on the live map to build a route and read per-segment + total great-circle distance.
  const cloudLayerRef = useRef<any>(null)
  const measureGroupRef = useRef<any>(null)
  const measurePtsRef = useRef<LatLng[]>([])
  const measuringRef = useRef(false)
  const [measuring, setMeasuring] = useState(false)
  const [measurePts, setMeasurePts] = useState<LatLng[]>([])
  measuringRef.current = measuring

  const measureKm = useMemo(() => {
    let sum = 0
    for (let i = 1; i < measurePts.length; i++) sum += haversineKm(measurePts[i - 1], measurePts[i])
    return sum
  }, [measurePts])

  const frames = layer === "radar" ? (maps?.radar ?? []) : layer === "satellite" ? (maps?.satellite ?? []) : []

  // Index of the forecast frame nearest to the current UAE time (Asia/Dubai = UTC+4,
  // no DST). Used to pin the DNI station overlay to the live reading, so the numbers
  // reflect "now" and never animate/blink with the cloud field.
  const liveWindIdx = useMemo(() => {
    if (!windData || windData.times.length === 0) return 0
    const now = Date.now()
    let best = 0
    let bestDiff = Number.POSITIVE_INFINITY
    windData.times.forEach((t, i) => {
      const ms = new Date(`${t}:00+04:00`).getTime()
      const diff = Math.abs(ms - now)
      if (diff < bestDiff) {
        bestDiff = diff
        best = i
      }
    })
    return best
  }, [windData])

  // Real forecast warnings for the currently displayed hour (frame). No fabricated data.
  const frameCount = warnFrames?.frames.length ?? 0
  const safeIdx = frameCount ? Math.min(warnIdx, frameCount - 1) : 0
  const display = useMemo<EmirateWarning[]>(
    () => warnFrames?.frames[safeIdx] ?? [],
    [warnFrames, safeIdx],
  )
  const top = display[0] ?? null
  const warnTime = warnFrames?.times[safeIdx]
  const totalWarnCards = (NCM_WARNINGS.length > 0 ? 1 : 0) + display.length

  const frameUrl = (f: Frame) => {
    const host = maps?.host ?? "https://tilecache.rainviewer.com"
    return layer === "radar"
      ? `${host}${f.path}/512/{z}/{x}/{y}/6/1_1.png`
      : `${host}${f.path}/512/{z}/{x}/{y}/0/0_0.png`
  }

  // NCM "radar-Merge-Sat": vivid radar reflectivity cells (colour scheme 6,
  // green→yellow→red→magenta) painted over the IR cloud field.
  const radarMergeUrl = (f: Frame) => {
    const host = maps?.host ?? "https://tilecache.rainviewer.com"
    return `${host}${f.path}/512/{z}/{x}/{y}/6/1_1.png`
  }

  // Load and refresh RainViewer frame catalogue every minute (single unified cycle).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" })
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
    const id = setInterval(load, 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Load and refresh the live UAE wind forecast every minute (Windy-style layer).
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await fetchWindFrames(windRange, controller.signal)
        if (data) {
          setWindData(data)
          setWindIdx(0)
          setCloudIdx(0)
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError")
          console.log("[v0] wind field failed:", err instanceof Error ? err.message : err)
      }
    }
    load()
    const id = setInterval(load, 60 * 1000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
    // Refetch whenever the horizon changes so "7 days" pulls the full 7-day grid.
  }, [windRange])

  // The total-cloud-cover field is carried on the same wind forecast frames
  // (fetched in a single Open-Meteo request), so no separate cloud fetch is needed.

  // Load the real hourly-forecast warning timeline; refresh every minute (unified cycle).
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await fetchWarningFrames(controller.signal, 24)
        setWarnFrames(data)
        setWarnIdx(0)
      } catch (err) {
        if ((err as any)?.name !== "AbortError")
          console.log("[v0] warnings failed:", err instanceof Error ? err.message : err)
        setWarnFrames({ frames: [[]], times: [new Date().toISOString().slice(0, 16)], issued: Date.now() })
      }
    }
    load()
    const id = setInterval(load, 60 * 1000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  // Animate the warning timeline: advance one forecast hour every 2 seconds.
  useEffect(() => {
    if (layer !== "warnings" || !warnPlaying || frameCount < 2) return
    const id = setInterval(() => setWarnIdx((i) => (i + 1) % frameCount), 2000)
    return () => clearInterval(id)
  }, [layer, warnPlaying, frameCount])

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
        maxZoom: 15,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      })
      map.zoomControl.setPosition("bottomright")
      // Start on the coloured Google-Maps-style canvas (warnings is the default layer).
      basemapRef.current = L.tileLayer(BASE_WARN, {
        maxZoom: 19,
        attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap contributors",
      }).addTo(map)
      // High-z pane so city labels sit above the shaded warning polygons (NCM look).
      map.createPane("labels")
      const labelsPane = map.getPane("labels")
      if (labelsPane) {
        labelsPane.style.zIndex = "650"
        labelsPane.style.pointerEvents = "none"
      }
      // SINGLE English reference-label source on the top pane. All emirate/city
      // names come from here only, so labels never render twice.
      referenceRef.current = L.tileLayer(REF_LIGHT, { maxZoom: 16, pane: "labels" }).addTo(map)
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
      if (mergeRef.current) {
        map.removeLayer(mergeRef.current)
        mergeRef.current = null
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
        // Clouds/IR rendered near-opaque and radar bold so the imagery reads big and
        // vivid (NCM Radar-Merge-Sat look), not a faint wash over the basemap.
        opacity: layer === "radar" ? 0.95 : 0.92,
        maxZoom: 15,
        maxNativeZoom: 12,
        zIndex: 400,
      }).addTo(map)
    }

    // Clouds/IR = NCM radar-Merge-Sat: overlay vivid radar cells on the IR field.
    if (layer === "satellite" && maps?.radar && maps.radar.length > 0) {
      const rf = maps.radar[maps.radar.length - 1]
      const rurl = radarMergeUrl(rf)
      if (mergeRef.current) {
        mergeRef.current.setUrl(rurl)
      } else {
        mergeRef.current = L.tileLayer(rurl, {
          opacity: 0.95,
          maxZoom: 15,
          maxNativeZoom: 12,
          zIndex: 410,
        }).addTo(map)
      }
    } else if (mergeRef.current) {
      map.removeLayer(mergeRef.current)
      mergeRef.current = null
    }
    setStamp(new Date(f.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    // Broadcast the active time so other map panels can sync.
    try {
      window.dispatchEvent(new CustomEvent('maps:time-sync', { detail: { source: 'ncm', time: f.time } }))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, frames, layer])

  // Reset the tile overlay when switching layers so scheme/opacity swaps cleanly.
  // Also fade the dark basemap on radar/clouds so the navy container tint shows
  // through as NCM Al Bahar-style blue-grey water (never a bleak-black empty map).
  useEffect(() => {
    const map = mapRef.current
    if (map && overlayRef.current) {
      map.removeLayer(overlayRef.current)
      overlayRef.current = null
    }
    if (map && mergeRef.current) {
      map.removeLayer(mergeRef.current)
      mergeRef.current = null
    }
    if (basemapRef.current && referenceRef.current) {
      // Warnings → coloured Google-Maps-style canvas (World Street Map ships its own
      // English labels, so the separate reference layer is hidden to avoid doubling).
      // Radar/clouds/wind → DARK canvas with the dark English reference labels on top.
      const light = layer === "warnings"
      basemapRef.current.setUrl(light ? BASE_WARN : BASE_DARK)
      referenceRef.current.setUrl(light ? REF_LIGHT : REF_DARK)
      referenceRef.current.setOpacity(light ? 0 : 1)
      // Fade the basemap harder under radar/clouds so the coloured imagery dominates
      // the frame (bigger, bolder cloud field) rather than competing with map detail.
      basemapRef.current.setOpacity(layer === "radar" || layer === "satellite" ? 0.4 : 1)
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

  // Manage the NCM-style AWS station overlay: wind km/h + flow arrow on the wind tab,
  // live direct-normal-irradiance (W/m²) on the Total Clouds tab. Sampled from our grid.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map || !mapReady) return

    const stationMode: StationMode = layer === "clouds" ? "solar" : "wind"
    // DNI stations read the live frame (nearest to now) so their numbers stay put and
    // never blink as the cloud-cover field animates. Wind stations track the frame.
    const activeIdx = layer === "clouds" ? liveWindIdx : windIdx
    const grid = windData?.frames[Math.min(activeIdx, windData.frames.length - 1)]
    const onStationTab = layer === "wind" || layer === "clouds"
    if (onStationTab && showStations && grid) {
      const readings = stationReadings(grid)
      if (stationLayerRef.current) {
        stationLayerRef.current.setData(readings, stationMode)
      } else {
        stationLayerRef.current = createStationLayer(L, readings, stationMode)
        stationLayerRef.current.addTo(map)
      }
    } else if (stationLayerRef.current) {
      map.removeLayer(stationLayerRef.current)
      stationLayerRef.current = null
    }
  }, [layer, windData, windIdx, liveWindIdx, mapReady, showStations])

  // Manage the total-cloud-cover field layer, swapping the active forecast frame.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map || !mapReady) return

    const wf = windData?.frames[Math.min(cloudIdx, windData.frames.length - 1)]
    const grid = wf
      ? {
          nx: wf.nx,
          ny: wf.ny,
          la1: wf.la1,
          la2: wf.la2,
          lo1: wf.lo1,
          lo2: wf.lo2,
          dx: wf.dx,
          dy: wf.dy,
          cover: wf.cover,
        }
      : null

    if (layer === "clouds" && grid) {
      if (cloudLayerRef.current) {
        cloudLayerRef.current.setGrid(grid)
      } else {
        cloudLayerRef.current = createCloudLayer(L, grid)
        cloudLayerRef.current.addTo(map)
      }
    } else if (cloudLayerRef.current) {
      map.removeLayer(cloudLayerRef.current)
      cloudLayerRef.current = null
    }
  }, [layer, windData, cloudIdx, mapReady])

  // Total-cloud forecast animation timer (shares the wind 1x/2x speed control).
  useEffect(() => {
    if (layer !== "clouds" || !cloudPlaying || !windData || windData.frames.length < 2) return
    const id = setInterval(() => setCloudIdx((i) => (i + 1) % windData.frames.length), 900 / (windSpeed || 1))
    return () => clearInterval(id)
  }, [layer, cloudPlaying, windData, windSpeed])

  // Draw the measuring trajectory: a dashed route with a vertex dot per point and a
  // sticky tooltip on each vertex showing the cumulative distance from the start.
  const drawMeasure = (pts: LatLng[]) => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (measureGroupRef.current) {
      map.removeLayer(measureGroupRef.current)
      measureGroupRef.current = null
    }
    if (pts.length === 0) return
    const group = L.layerGroup()
    if (pts.length >= 2) {
      L.polyline(
        pts.map((p) => [p.lat, p.lng]),
        { color: "#f5b642", weight: 2.5, opacity: 0.95, dashArray: "6 6" },
      ).addTo(group)
    }
    let cum = 0
    pts.forEach((p, i) => {
      if (i > 0) cum += haversineKm(pts[i - 1], p)
      const dot = L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: "#0b0f14",
        weight: 2,
        fillColor: "#f5b642",
        fillOpacity: 1,
      })
      const label = i === 0 ? "Start" : `${cum.toFixed(1)} km`
      dot.bindTooltip(label, { permanent: true, direction: "top", className: "measure-tip", offset: [0, -6] })
      dot.addTo(group)
    })
    group.addTo(map)
    measureGroupRef.current = group
  }

  const clearMeasure = () => {
    measurePtsRef.current = []
    setMeasurePts([])
    if (measureGroupRef.current && mapRef.current) {
      mapRef.current.removeLayer(measureGroupRef.current)
      measureGroupRef.current = null
    }
  }

  // Attach a single map click handler that only accumulates points while the
  // measuring tool is active, so it never interferes with normal map interaction.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const onClick = (e: any) => {
      if (!measuringRef.current) return
      const next = [...measurePtsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]
      measurePtsRef.current = next
      setMeasurePts(next)
      drawMeasure(next)
    }
    map.on("click", onClick)
    return () => map.off("click", onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady])

  // Listen for time sync events from other panels and align index where possible
  useEffect(() => {
    function onSync(e: any) {
      try {
        const t = e?.detail?.time
        if (!t || !windData) return
        // Try to find a matching frame and update windIdx/frame index where appropriate
        const i = windData.times.findIndex((ft) => ft === t)
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

    // Clean look: no blue water/land wash — the dark cartographic basemap shows through.
    // Unwarned emirates keep only a subtle outline; warned emirates are shaded by
    // severity (yellow / orange / red) over the basemap.
    const geoLayer = L.geoJSON(geoRef.current, {
      style: (feature: any) => {
        const lvl = levelByName.get(feature.properties.name) ?? "green"
        const warned = lvl !== "green"
        // Dark outlines read on the light-grey canvas; warned emirates shaded by severity.
        return {
          color: warned ? "#0f172a" : "#94a3b8",
          weight: warned ? 2 : 0.9,
          opacity: warned ? 0.9 : 0.6,
          fillColor: warned ? WARN_FILL[lvl] : "transparent",
          fillOpacity: warned ? 0.55 : 0,
        }
      },
      onEachFeature: (feature: any, lyr: any) => {
        const lvl = levelByName.get(feature.properties.name) ?? "green"
        const label = lvl === "green" ? "No warning" : lvl === "yellow" ? "Be Aware" : lvl === "orange" ? "Be Prepared" : "Take Action"
        lyr.bindTooltip(`${feature.properties.name} — ${label}`, { sticky: true, direction: "top" })
      },
    })

    // Only the shaded emirate polygons go in the group. Every emirate/city name
    // comes solely from the Esri reference-label tiles added at init, so names
    // never render twice (fixes the doubled-label issue).
    geoLayer.addTo(group)
    group.addTo(map)
    warnLayerRef.current = group

    // Zoom handler: emphasise boundaries at higher zoom for the Al-Bahar look.
    function onZoom() {
      try {
        const z = map.getZoom()
        const strong = z >= 9
        geoLayer.setStyle((feature: any) => {
          const lvl = levelByName.get(feature.properties.name) ?? "green"
          const warned = lvl !== "green"
          return {
            color: warned ? "#0f172a" : "#94a3b8",
            weight: warned ? (strong ? 2.4 : 2) : strong ? 1.1 : 0.9,
            opacity: warned ? 0.9 : strong ? 0.65 : 0.55,
            fillColor: warned ? WARN_FILL[lvl] : "transparent",
            fillOpacity: warned ? 0.55 : 0,
          }
        })
      } catch {}
    }
    map.on('zoomend', onZoom)
    // run once on init
    onZoom()

    // cleanup on unmount
    const cleanup = () => {
      try {
        map.off('zoomend', onZoom)
      } catch {}
    }

    // attach cleanup to the return so React will remove handlers and layers on unmount
    return cleanup
  }, [layer, geoReady, display])

  // Animation timer (radar / satellite frame loop).
  useEffect(() => {
    if ((layer !== "radar" && layer !== "satellite") || !playing || frames.length < 2) return
    const id = setInterval(() => setIdx((i) => (i + 1) % frames.length), 700)
    return () => clearInterval(id)
  }, [playing, frames, layer])

  const isWarnings = layer === "warnings"

  // Auto-scroll the warnings sidebar so every alert can be read one by one.
  // Gently steps down the list, pauses at the bottom, then loops back to the top.
  // Pauses while the user is hovering so they can read at their own pace.
  useEffect(() => {
    const el = warnScrollRef.current
    if (!isWarnings || !el) return
    let paused = false
    const onEnter = () => {
      paused = true
    }
    const onLeave = () => {
      paused = false
    }
    el.addEventListener("pointerenter", onEnter)
    el.addEventListener("pointerleave", onLeave)

    let dir = 1
    let holdTicks = 0
    const timer = window.setInterval(() => {
      if (paused) return
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll <= 4) return // nothing to scroll
      if (holdTicks > 0) {
        holdTicks -= 1
        return
      }
      let next = el.scrollTop + dir // 1px per tick
      if (next >= maxScroll) {
        next = maxScroll
        dir = -1
        holdTicks = 60 // pause ~1.8s at the bottom
      } else if (next <= 0) {
        next = 0
        dir = 1
        holdTicks = 60 // pause ~1.8s at the top
      }
      el.scrollTop = next
    }, 30)

    return () => {
      window.clearInterval(timer)
      el.removeEventListener("pointerenter", onEnter)
      el.removeEventListener("pointerleave", onLeave)
    }
  }, [isWarnings, totalWarnCards, safeIdx])

  // Forecast-field layers (wind + total clouds) share one hourly playback control set.
  const isField = layer === "wind" || layer === "clouds"
  const fieldData = layer === "wind" || layer === "clouds" ? windData : null
  const fieldIdx = layer === "wind" ? windIdx : cloudIdx
  const setFieldIdx = layer === "wind" ? setWindIdx : setCloudIdx
  const fieldPlaying = layer === "wind" ? windPlaying : cloudPlaying
  const setFieldPlaying = layer === "wind" ? setWindPlaying : setCloudPlaying
  const fieldLabel = layer === "clouds" ? "cloud" : "wind"
  const scale =
    layer === "radar"
      ? RADAR_SCALE
      : layer === "satellite"
        ? CLOUD_SCALE
        : layer === "clouds"
          ? CLOUD_COVER_SCALE
          : WIND_SCALE
  const legendTitle =
    layer === "radar"
      ? "Rain intensity"
      : layer === "satellite"
        ? "Cloud top"
        : layer === "clouds"
          ? "Cloud cover"
          : "Wind speed"

  const tabs: { id: Layer; label: string; Icon: typeof Radar }[] = [
    { id: "warnings", label: "Warnings", Icon: ShieldAlert },
    { id: "wind", label: "Wind field", Icon: Wind },
    { id: "radar", label: "Rain radar", Icon: Radar },
    { id: "clouds", label: "Total clouds", Icon: Cloud },
  ]

  return (
    <>
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
        className="h-[80vh] min-h-[620px] w-full"
        style={{ backgroundColor: layer === "warnings" ? "#0d1626" : "#3a4a63" }}
          role="img"
          aria-label={
            isWarnings
              ? "UAE weather warnings map with emirates shaded by alert severity"
              : `Large animated ${layer === "radar" ? "precipitation radar" : layer === "satellite" ? "cloud / infrared satellite" : "surface wind"} map centred on the UAE`
          }
        />

        {/* ---------- TRAJECTORY / DISTANCE MEASURE TOOL (all layers) ---------- */}
        <div className="absolute left-3 top-1/2 z-[600] flex -translate-y-1/2 flex-col items-start gap-2">
          <div className="flex flex-col overflow-hidden rounded-full border border-white/20 bg-black/60 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => {
                setMeasuring((m) => {
                  const next = !m
                  if (!next) clearMeasure()
                  return next
                })
              }}
              className={cn(
                "grid h-10 w-10 place-items-center transition-colors",
                measuring ? "bg-signal text-black" : "text-white/85 hover:bg-white/10",
              )}
              aria-pressed={measuring}
              aria-label={measuring ? "Stop measuring distance" : "Measure distance between points"}
              title={measuring ? "Stop measuring" : "Measure distance"}
            >
              <Ruler className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearMeasure}
              disabled={measurePts.length === 0}
              className="grid h-10 w-10 place-items-center border-t border-white/15 text-white/85 transition-colors hover:bg-white/10 disabled:opacity-40"
              aria-label="Clear measured trajectory"
              title="Clear trajectory"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {measuring && (
            <div className="max-w-[13rem] rounded-md border border-signal/40 bg-black/70 px-2.5 py-1.5 font-mono text-[0.625rem] leading-relaxed text-white/85 backdrop-blur">
              {measurePts.length < 2 ? (
                <span>Click points on the map to trace a route.</span>
              ) : (
                <>
                  <span className="text-signal">
                    {measureKm.toFixed(1)} km
                  </span>{" "}
                  <span className="text-white/60">
                    · {(measureKm * 0.539957).toFixed(1)} nmi · {measurePts.length} pts
                  </span>
                </>
              )}
            </div>
          )}
        </div>

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
                  : "No active weather warnings for this hour across the Emirates. Conditions are calm."}
              </p>
              <span className="shrink-0 rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.5rem] font-bold uppercase tracking-widest">
                Forecast
              </span>
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
            <div
              ref={warnScrollRef}
              className="absolute right-3 top-32 z-[500] flex max-h-[64%] w-60 flex-col gap-2 overflow-y-auto scroll-smooth pr-0.5 sm:w-64"
            >
              {/* Official NCM bulletin — always visible, mirrored from ncm.gov.ae and combined with Open-Meteo. */}
              {NCM_WARNINGS.length > 0 && (
                <article className="shrink-0 overflow-hidden rounded-md border border-alert-yellow/60 bg-card shadow">
                  <header className="flex items-center justify-center gap-1.5 border-b border-border bg-primary px-3 py-1.5 font-mono text-[0.625rem] font-bold uppercase tracking-wider text-primary-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> NCM Official Warnings
                  </header>
                  {NCM_WARNINGS.map((w) => (
                    <div key={w.id} className="border-b border-border px-3 py-2 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground">{w.type}</span>
                        <span className={cn("rounded px-1.5 py-0.5 font-mono text-[0.5rem] font-bold uppercase tracking-wider", BANNER_TONE[w.level])}>
                          {w.level === "yellow" ? "Be Aware" : w.level === "orange" ? "Be Prepared" : w.level === "red" ? "Take Action" : "Advisory"}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[0.5625rem] uppercase tracking-wide text-muted-foreground">
                        From {fmtNcmTime(w.from)} to {fmtNcmTime(w.to)}
                      </div>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-foreground">{w.description}</p>
                      <p className="mt-1 font-mono text-[0.5rem] uppercase tracking-wide text-muted-foreground">
                        Source: ncm.gov.ae · combined with Open-Meteo
                      </p>
                    </div>
                  ))}
                </article>
              )}

              <div className="shrink-0 rounded-md border border-white/15 bg-primary/90 px-3 py-2 text-center font-mono text-[0.625rem] uppercase tracking-wider text-primary-foreground shadow">
                {display.length
                  ? `${display.length} warning${display.length > 1 ? "s" : ""} this hour`
                  : "No warnings this hour"}
              </div>
              {display.map((w) => (
                <article key={w.name} className="shrink-0 overflow-hidden rounded-md border border-border bg-card shadow">
                  <header className={cn("px-3 py-2 text-center text-xs font-bold leading-tight", BANNER_TONE[w.level])}>
                    {w.name}: {w.headline}
                  </header>
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary px-3 py-1 font-mono text-[0.5625rem] uppercase tracking-wide text-muted-foreground">
                    <span>From {w.from} to {w.to}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 font-bold tracking-wider",
                        w.source === "NCM"
                          ? "bg-alert-yellow text-black"
                          : w.source === "NCM + Open-Meteo"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {w.source}
                    </span>
                  </div>
                  <p className="px-3 py-2 text-[0.6875rem] leading-relaxed text-foreground">{w.description}</p>
                </article>
              ))}
              <p className="shrink-0 rounded-md border border-dashed border-border bg-card/70 px-3 py-2 text-[0.625rem] leading-relaxed text-muted-foreground">
                Combined feed: official NCM warnings (mirrored from ncm.gov.ae) plus a real 24-hour timeline derived from
                live Open-Meteo forecast for the seven emirates, playing one hour every 2 seconds. Refreshes every minute.
              </p>
            </div>

            {/* Animated forecast playback (one real forecast hour every 2s) */}
            {frameCount > 1 && (
              <div className="absolute inset-x-3 bottom-16 z-[500] flex items-center gap-2 rounded-md bg-black/55 px-3 py-2 backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[36rem] sm:max-w-[calc(100%-1.5rem)] sm:-translate-x-1/2">
                <button
                  type="button"
                  onClick={() => setWarnPlaying((p) => !p)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-alert-red text-white shadow transition-transform hover:scale-105"
                  aria-label={warnPlaying ? "Pause warning forecast" : "Play warning forecast"}
                >
                  {warnPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={frameCount - 1}
                  value={safeIdx}
                  onChange={(e) => {
                    setWarnPlaying(false)
                    setWarnIdx(Number(e.target.value))
                  }}
                  aria-label="Scrub the warning forecast time"
                  className="h-1.5 flex-1 cursor-pointer accent-[var(--signal)]"
                />
                <span className="shrink-0 rounded-md bg-alert-red px-2.5 py-1 font-mono text-[0.6875rem] tabular-nums text-white shadow">
                  {formatWindTime(warnTime)}
                </span>
              </div>
            )}

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
              ) : layer === "clouds" ? (
                <>
                  <Cloud className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Total cloud cover
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
              {/* Wind field shows a clean colour ramp with only low/high anchors — the
                  dense numeric ticks are dropped per NCM's diverging-wind look. Radar and
                  cloud legends keep their intensity labels. */}
              {layer === "wind" ? (
                <div className="mt-1 flex justify-between font-mono text-[0.5rem] uppercase tracking-wide text-white/70">
                  <span>Calm</span>
                  <span>Strong</span>
                </div>
              ) : layer === "clouds" ? (
                <div className="mt-1 flex justify-between font-mono text-[0.5rem] uppercase tracking-wide text-white/70">
                  <span>Clear</span>
                  <span>Overcast</span>
                </div>
              ) : (
                <div className="mt-1 flex justify-between font-mono text-[0.5rem] uppercase tracking-wide text-white/70">
                  {scale
                    .filter((s) => s.label)
                    .map((s) => (
                      <span key={s.label}>{s.label}</span>
                    ))}
                </div>
              )}
            </div>

            {layer === "radar" && (
              <span className="absolute right-3 top-3 z-[500] inline-flex max-w-[13rem] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-right font-mono text-[0.5625rem] uppercase tracking-wide text-white/80 backdrop-blur">
                Rain paints only where detected — UAE is often dry
              </span>
            )}
            {layer === "wind" && (
              <span className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-md bg-signal/90 px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-wider text-black backdrop-blur">
                {windRange === "7day" ? "7-day forecast · 10 m surface wind" : "Live · 10 m surface wind"}
              </span>
            )}
            {(layer === "wind" || layer === "clouds") && (
              <div className="absolute right-3 top-12 z-[500] flex flex-col items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowStations((s) => !s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-wider backdrop-blur transition-colors",
                    showStations
                      ? "border-white/25 bg-black/60 text-white hover:bg-black/70"
                      : "border-white/15 bg-black/40 text-white/60 hover:bg-black/55",
                  )}
                  aria-pressed={showStations}
                >
                  <MapPin className="h-3 w-3" aria-hidden="true" />{" "}
                  {layer === "clouds" ? "DNI stations" : "AWS stations"} {showStations ? "on" : "off"}
                </button>
                {layer === "wind" && (
                  <div className="flex overflow-hidden rounded-md border border-white/20 bg-black/60 backdrop-blur">
                    {(["live", "7day"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setWindRange(r)}
                        className={cn(
                          "px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-wider transition-colors",
                          r === "7day" && "border-l border-white/15",
                          windRange === r ? "bg-signal text-black" : "text-white/70 hover:bg-white/10",
                        )}
                        aria-pressed={windRange === r}
                      >
                        {r === "live" ? "Live" : "7 days"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {layer === "clouds" && (
              <span className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-md bg-accent/90 px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-wider text-black backdrop-blur">
                Total cloud cover · live DNI stations
              </span>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent py-3 pl-4 pr-16">
              {layer === "wind" ? (
                fieldData && fieldData.frames.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFieldPlaying((p) => !p)}
                      className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-alert-red text-white shadow transition-transform hover:scale-105"
                      aria-label={fieldPlaying ? "Pause forecast" : "Play forecast"}
                    >
                      {fieldPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-md border border-white/20 bg-black/55 p-0.5 backdrop-blur">
                      <button
                        type="button"
                        onClick={() => {
                          setFieldPlaying(false)
                          setFieldIdx((i) => (i - 1 + fieldData.frames.length) % fieldData.frames.length)
                        }}
                        className="grid h-6 w-6 place-items-center rounded text-white/80 hover:bg-white/10"
                        aria-label="Previous hour"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFieldPlaying(false)
                          setFieldIdx((i) => (i + 1) % fieldData.frames.length)
                        }}
                        className="grid h-6 w-6 place-items-center rounded text-white/80 hover:bg-white/10"
                        aria-label="Next hour"
                      >
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border border-white/20 bg-black/55 px-1.5 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-white/70 backdrop-blur">
                      <span>Speed</span>
                      {([0.5, 1, 2] as const).map((sp) => (
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
                      max={fieldData.frames.length - 1}
                      value={Math.min(fieldIdx, fieldData.frames.length - 1)}
                      onChange={(e) => {
                        setFieldPlaying(false)
                        setFieldIdx(Number(e.target.value))
                      }}
                      aria-label={`Scrub the ${fieldLabel} forecast time`}
                      className="pointer-events-auto h-1.5 flex-1 cursor-pointer accent-[var(--signal)]"
                    />
                    <span className="shrink-0 rounded-md bg-alert-red px-2.5 py-1 font-mono text-[0.6875rem] tabular-nums text-white shadow">
                      {formatWindTime(fieldData.times[Math.min(fieldIdx, fieldData.times.length - 1)])}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-wider text-white/90">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-signal" aria-hidden="true" />
                    Loading {fieldLabel} forecast…
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
    </>
  )
}
