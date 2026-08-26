// A custom Leaflet canvas layer that paints a Windy-style wind map:
//   1) a smooth wind-speed heatmap (bilinear-upscaled from a coarse grid)
//   2) a uniform screen grid of small white direction arrows
// It is created client-side after Leaflet is dynamically imported.

import type { WindGrid } from "./wind-field"

// Windy-like speed palette (m/s): deep blue calm → teal → green → yellow → orange → red → magenta.
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [26, 58, 120]],
  [3, [32, 96, 176]],
  [6, [26, 150, 190]],
  [9, [42, 182, 150]],
  [12, [120, 200, 104]],
  [15, [224, 208, 86]],
  [18, [240, 150, 60]],
  [23, [228, 72, 58]],
  [30, [150, 42, 120]],
]

export function windColor(s: number): [number, number, number] {
  if (s <= STOPS[0][0]) return STOPS[0][1]
  const last = STOPS[STOPS.length - 1]
  if (s >= last[0]) return last[1]
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i]
    const [b, cb] = STOPS[i + 1]
    if (s >= a && s <= b) {
      const t = (s - a) / (b - a)
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * t),
        Math.round(ca[1] + (cb[1] - ca[1]) * t),
        Math.round(ca[2] + (cb[2] - ca[2]) * t),
      ]
    }
  }
  return last[1]
}

/** Bilinear sample of the grid at a geographic point. */
function sample(g: WindGrid, lat: number, lon: number) {
  let fx = (lon - g.lo1) / g.dx
  let fy = (g.la1 - lat) / g.dy
  fx = Math.max(0, Math.min(g.nx - 1, fx))
  fy = Math.max(0, Math.min(g.ny - 1, fy))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, g.nx - 1)
  const y1 = Math.min(y0 + 1, g.ny - 1)
  const tx = fx - x0
  const ty = fy - y0
  const bil = (arr: number[]) => {
    const a = arr[y0 * g.nx + x0]
    const b = arr[y0 * g.nx + x1]
    const c = arr[y1 * g.nx + x0]
    const d = arr[y1 * g.nx + x1]
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
  }
  return { speed: bil(g.speed), u: bil(g.u), v: bil(g.v) }
}

export function createWindLayer(L: any, grid: WindGrid) {
  const WindLayer = L.Layer.extend({
    initialize(this: any, g: WindGrid) {
      this._grid = g
    },
    setGrid(this: any, g: WindGrid) {
      this._grid = g
      if (this._map) this._render()
    },
    onAdd(this: any, map: any) {
      this._map = map
      const c = (this._canvas = L.DomUtil.create("canvas", "leaflet-wind-canvas leaflet-layer"))
      c.style.position = "absolute"
      const s = map.getSize()
      c.width = s.x
      c.height = s.y
      map.getPanes().overlayPane.appendChild(c)
      this._glue = () => this._reposition()
      this._draw = () => {
        this._reposition()
        this._render()
      }
      // Keep the canvas glued to geography during pan/zoom; full redraw when settled.
      map.on("move zoomanim", this._glue)
      map.on("moveend zoomend resize viewreset", this._draw)
      this._reposition()
      this._render()
    },
    onRemove(this: any, map: any) {
      map.off("move zoomanim", this._glue)
      map.off("moveend zoomend resize viewreset", this._draw)
      L.DomUtil.remove(this._canvas)
    },
    _reposition(this: any) {
      const tl = this._map.containerPointToLayerPoint([0, 0])
      L.DomUtil.setPosition(this._canvas, tl)
      const s = this._map.getSize()
      if (this._canvas.width !== s.x) this._canvas.width = s.x
      if (this._canvas.height !== s.y) this._canvas.height = s.y
    },
    _render(this: any) {
      const map = this._map
      const c = this._canvas
      const g = this._grid
      if (!map || !c || !g) return
      const ctx = c.getContext("2d")
      if (!ctx) return
      const s = map.getSize()
      ctx.clearRect(0, 0, s.x, s.y)

      // 1) Heatmap — paint the coarse grid into a tiny canvas, then bilinear-upscale.
      const off = document.createElement("canvas")
      off.width = g.nx
      off.height = g.ny
      const octx = off.getContext("2d")
      if (!octx) return
      const img = octx.createImageData(g.nx, g.ny)
      for (let i = 0; i < g.nx * g.ny; i++) {
        const [r, gg, b] = windColor(g.speed[i])
        const p = i * 4
        img.data[p] = r
        img.data[p + 1] = gg
        img.data[p + 2] = b
        img.data[p + 3] = 255
      }
      octx.putImageData(img, 0, 0)
      const nw = map.latLngToContainerPoint([g.la1, g.lo1])
      const se = map.latLngToContainerPoint([g.la2, g.lo2])
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.globalAlpha = 0.6
      ctx.drawImage(off, nw.x, nw.y, se.x - nw.x, se.y - nw.y)
      ctx.globalAlpha = 1

      // 2) Uniform arrow grid — direction only, fixed size (speed is shown by the heatmap).
      const step = 40
      const len = 6
      const head = 4
      ctx.lineWidth = 1.1
      ctx.strokeStyle = "rgba(255,255,255,0.82)"
      ctx.fillStyle = "rgba(255,255,255,0.82)"
      for (let y = step / 2; y < s.y; y += step) {
        for (let x = step / 2; x < s.x; x += step) {
          const ll = map.containerPointToLatLng([x, y])
          if (ll.lng < g.lo1 || ll.lng > g.lo2 || ll.lat > g.la1 || ll.lat < g.la2) continue
          const sm = sample(g, ll.lat, ll.lng)
          if (sm.speed < 0.4) continue
          // Screen coords: x = east, y = down, so use -v for the northward part.
          const ang = Math.atan2(-sm.v, sm.u)
          const dx = Math.cos(ang)
          const dy = Math.sin(ang)
          const hx = x + dx * len
          const hy = y + dy * len
          ctx.beginPath()
          ctx.moveTo(x - dx * len, y - dy * len)
          ctx.lineTo(hx, hy)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(hx, hy)
          ctx.lineTo(hx + Math.cos(ang + 2.6) * head, hy + Math.sin(ang + 2.6) * head)
          ctx.lineTo(hx + Math.cos(ang - 2.6) * head, hy + Math.sin(ang - 2.6) * head)
          ctx.closePath()
          ctx.fill()
        }
      }
    },
  })
  return new WindLayer(grid)
}
