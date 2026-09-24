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

/** DNI colour ramp (W/m²): night slate → cool → warm gold → hot orange. */
function solarColor(dni: number): string {
  if (dni < 10) return "#5a6884"
  if (dni < 200) return "#6b83b0"
  if (dni < 450) return "#f2c14e"
  if (dni < 700) return "#f59e2c"
  return "#ec6a2c"
}

function markerHtml(r: StationReading, mode: StationMode): string {
  const isWind = mode === "wind"
  const value = isWind ? r.windKmh : r.dni
  const color = isWind ? windColor(r.windKmh) : solarColor(r.dni)
  // Dark text on the light/warm fills keeps the number legible.
  const textColor = "#0b1220"
  const arrow = isWind
    ? `<div style="position:absolute;inset:0;transform:rotate(${r.flowDeg.toFixed(0)}deg);">
         <div style="position:absolute;left:50%;top:-1px;transform:translateX(-50%);width:0;height:0;
           border-left:5px solid transparent;border-right:5px solid transparent;
           border-bottom:8px solid ${color};filter:drop-shadow(0 0 1px rgba(0,0,0,0.5));"></div>
       </div>`
    : ""
  return `<div style="position:relative;width:46px;height:46px;pointer-events:none;">
      ${arrow}
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:26px;height:26px;border-radius:9999px;background:${color};
        border:1.5px solid rgba(255,255,255,0.9);box-shadow:0 1px 4px rgba(0,0,0,0.45);
        display:flex;align-items:center;justify-content:center;">
        <span style="font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:${textColor};line-height:1;">${value}</span>
      </div>
      <div style="position:absolute;left:50%;top:47px;transform:translateX(-50%);white-space:nowrap;
        font:600 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.04em;
        color:rgba(255,255,255,0.92);text-shadow:0 1px 2px rgba(0,0,0,0.85);">${r.name}</div>
    </div>`
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
