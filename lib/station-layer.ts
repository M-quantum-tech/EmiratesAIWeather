// Leaflet layer that plots UAE AWS station readings as NCM Ghaith-style pins:
// a colour-coded circle carrying the value, plus a rotated direction arrow in
// wind mode. Two modes — "wind" (km/h + flow arrow, like aws-wind) and "solar"
// (DNI W/m², like aws-solar-radiation).

import type { StationReading } from "@/lib/stations"

export type StationMode = "wind" | "solar"

/** Wind-speed colour ramp (km/h): teal → slate → orange → red, matching NCM. */
function windColor(kmh: number): string {
  if (kmh < 14) return "#3fb59a"
  if (kmh < 22) return "#8f95ab"
  if (kmh < 32) return "#f2a63c"
  return "#e5563a"
}

/** DNI colour ramp (W/m²) matching the NCM aws-solar-radiation labels:
 *  dim night → cool → green → yellow-green → gold → bright yellow. */
function solarColor(dni: number): string {
  if (dni < 10) return "#8a94a6"
  if (dni < 250) return "#7dd3fc"
  if (dni < 500) return "#86efac"
  if (dni < 700) return "#d9f99d"
  if (dni < 820) return "#fde047"
  return "#fbbf24"
}

function windMarkerHtml(r: StationReading): string {
  const color = windColor(r.windKmh)
  const textColor = "#0b1220"
  const arrow = `<div style="position:absolute;inset:0;transform:rotate(${r.flowDeg.toFixed(0)}deg);">
         <div style="position:absolute;left:50%;top:-1px;transform:translateX(-50%);width:0;height:0;
           border-left:5px solid transparent;border-right:5px solid transparent;
           border-bottom:8px solid ${color};filter:drop-shadow(0 0 1px rgba(0,0,0,0.5));"></div>
       </div>`
  return `<div style="position:relative;width:46px;height:46px;pointer-events:none;">
      ${arrow}
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:26px;height:26px;border-radius:9999px;background:${color};
        border:1.5px solid rgba(255,255,255,0.9);box-shadow:0 1px 4px rgba(0,0,0,0.45);
        display:flex;align-items:center;justify-content:center;">
        <span style="font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:${textColor};line-height:1;">${r.windKmh}</span>
      </div>
      <div style="position:absolute;left:50%;top:47px;transform:translateX(-50%);white-space:nowrap;
        font:600 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.04em;
        color:rgba(255,255,255,0.92);text-shadow:0 1px 2px rgba(0,0,0,0.85);">${r.name}</div>
    </div>`
}

// NCM aws-solar-radiation look: bare colour-coded DNI value (W/m²), no pin — a bold
// number with a dark halo so it reads cleanly over the dark map, name beneath.
function solarMarkerHtml(r: StationReading): string {
  const color = solarColor(r.dni)
  return `<div style="position:relative;width:46px;height:34px;pointer-events:none;
      display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <span style="font:800 15px ui-monospace,SFMono-Regular,Menlo,monospace;color:${color};line-height:1;
        text-shadow:0 0 3px rgba(0,0,0,0.95),0 1px 2px rgba(0,0,0,0.9);">${r.dni}</span>
      <span style="margin-top:2px;white-space:nowrap;
        font:600 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.04em;
        color:rgba(255,255,255,0.82);text-shadow:0 1px 2px rgba(0,0,0,0.85);">${r.name}</span>
    </div>`
}

function markerHtml(r: StationReading, mode: StationMode): string {
  return mode === "wind" ? windMarkerHtml(r) : solarMarkerHtml(r)
}

export function createStationLayer(L: any, readings: StationReading[], mode: StationMode) {
  const group = L.layerGroup()
  const render = (rs: StationReading[], m: StationMode) => {
    group.clearLayers()
    for (const r of rs) {
      const icon = L.divIcon({
        className: "ncm-station-icon",
        html: markerHtml(r, m),
        iconSize: [46, 46],
        iconAnchor: [23, 23],
      })
      L.marker([r.lat, r.lon], { icon, interactive: false, keyboard: false }).addTo(group)
    }
  }
  render(readings, mode)
  // Expose an imperative updater so the animation timer can swap frames cheaply.
  ;(group as any).setData = (rs: StationReading[], m: StationMode) => render(rs, m)
  return group
}
