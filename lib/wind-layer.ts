// A custom Leaflet canvas layer that paints an NCM Ghaith COSMO-UAE style wind map:
//   1) a dim, smooth wind-speed field (bilinear-upscaled from a coarse grid)
//   2) animated particle streamlines that flow along the wind vectors and fade into trails
// It is created client-side after Leaflet is dynamically imported.

import type { WindGrid } from "./wind-field"

// NCM Cosmo-UAE speed palette (m/s): rich royal blue calm → teal → green → yellow → orange → red → magenta.
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [38, 66, 168]],
  [3, [40, 110, 205]],
  [6, [30, 165, 205]],
  [9, [46, 195, 158]],
  [12, [128, 210, 108]],
  [15, [232, 214, 88]],
  [18, [246, 156, 60]],
  [23, [232, 74, 58]],
  [30, [156, 44, 126]],
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

type Particle = { x: number; y: number; age: number; life: number }

export function createWindLayer(L: any, grid: WindGrid) {
  const WindLayer = L.Layer.extend({
    initialize(this: any, g: WindGrid) {
      this._grid = g
      this._particles = [] as Particle[]
    },
    setGrid(this: any, g: WindGrid) {
      this._grid = g
      if (this._map) {
        this._drawHeat()
        this._seed()
      }
    },
    onAdd(this: any, map: any) {
      this._map = map
      const pane = map.getPanes().overlayPane

      // Underlay: static-ish speed field, redrawn only when the view settles.
      const heat = (this._heat = L.DomUtil.create("canvas", "leaflet-wind-heat leaflet-layer"))
      heat.style.position = "absolute"
      // Overlay: animated particle trails, redrawn every frame.
      const part = (this._part = L.DomUtil.create("canvas", "leaflet-wind-part leaflet-layer"))
      part.style.position = "absolute"

      const s = map.getSize()
      for (const c of [heat, part]) {
        c.width = s.x
        c.height = s.y
        pane.appendChild(c)
      }

      this._glue = () => this._reposition()
      this._settle = () => {
        this._reposition()
        this._drawHeat()
        this._seed()
      }
      // Keep both canvases glued to geography during motion; rebuild when settled.
      map.on("move zoomanim", this._glue)
      map.on("moveend zoomend resize viewreset", this._settle)
      // Suspend the particle sim mid-gesture so trails do not smear across a moving frame.
      map.on("movestart zoomstart", () => {
        this._moving = true
      })
      map.on("moveend zoomend", () => {
        this._moving = false
      })

      this._reposition()
      this._drawHeat()
      this._seed()
      this._running = true
      this._loop()
    },
    onRemove(this: any, map: any) {
      this._running = false
      if (this._raf) cancelAnimationFrame(this._raf)
      map.off("move zoomanim", this._glue)
      map.off("moveend zoomend resize viewreset", this._settle)
      L.DomUtil.remove(this._heat)
      L.DomUtil.remove(this._part)
    },
    _reposition(this: any) {
      const tl = this._map.containerPointToLayerPoint([0, 0])
      const s = this._map.getSize()
      for (const c of [this._heat, this._part]) {
        L.DomUtil.setPosition(c, tl)
        if (c.width !== s.x) c.width = s.x
        if (c.height !== s.y) c.height = s.y
      }
    },
    _inGrid(this: any, lat: number, lng: number) {
      const g = this._grid
      return lng >= g.lo1 && lng <= g.lo2 && lat <= g.la1 && lat >= g.la2
    },
    // Paint the coarse grid into a tiny canvas, then bilinear-upscale it dimly.
    _drawHeat(this: any) {
      const map = this._map
      const c = this._heat
      const g = this._grid
      if (!map || !c || !g) return
      const ctx = c.getContext("2d")
      if (!ctx) return
      const s = map.getSize()
      ctx.clearRect(0, 0, s.x, s.y)

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
      // Vivid colour field matching the NCM COSMO-UAE render; the bright particle
      // trails still read as the primary animated layer on top.
      ctx.globalAlpha = 0.8
      ctx.drawImage(off, nw.x, nw.y, se.x - nw.x, se.y - nw.y)
      ctx.globalAlpha = 1
    },
    _count(this: any) {
      const s = this._map.getSize()
      // Dense streamlines for the NCM COSMO-UAE flow (~1 particle per 620 px²),
      // capped for performance.
      return Math.max(700, Math.min(6000, Math.round((s.x * s.y) / 620)))
    },
    _spawn(this: any): Particle {
      const map = this._map
      const s = map.getSize()
      // Rejection-sample screen points that fall inside the wind grid.
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.random() * s.x
        const y = Math.random() * s.y
        const ll = map.containerPointToLatLng([x, y])
        if (this._inGrid(ll.lat, ll.lng)) {
          return { x, y, age: 0, life: 40 + Math.random() * 90 }
        }
      }
      return { x: Math.random() * s.x, y: Math.random() * s.y, age: 0, life: 40 + Math.random() * 90 }
    },
    _seed(this: any) {
      const n = this._count()
      const arr: Particle[] = []
      for (let i = 0; i < n; i++) arr.push(this._spawn())
      this._particles = arr
      // Clear any lingering trails from the previous view.
      const pctx = this._part?.getContext("2d")
      if (pctx) pctx.clearRect(0, 0, this._part.width, this._part.height)
    },
    _loop(this: any) {
      if (!this._running) return
      this._raf = requestAnimationFrame(() => this._loop())
      const map = this._map
      const part = this._part
      const g = this._grid
      if (!map || !part || !g) return
      const ctx = part.getContext("2d")
      if (!ctx) return
      const s = map.getSize()

      // Do not advance the sim while the map is being dragged/zoomed.
      if (this._moving) return

      // Fade existing trails without darkening the heatmap beneath (transparent erase).
      // A softer erase leaves longer, comet-like streamlines — the NCM COSMO-UAE look.
      ctx.globalCompositeOperation = "destination-out"
      ctx.fillStyle = "rgba(0,0,0,0.075)"
      ctx.fillRect(0, 0, s.x, s.y)
      ctx.globalCompositeOperation = "source-over"

      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      const particles: Particle[] = this._particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const ll = map.containerPointToLatLng([p.x, p.y])
        if (!this._inGrid(ll.lat, ll.lng) || p.age > p.life) {
          particles[i] = this._spawn()
          continue
        }
        const sm = sample(g, ll.lat, ll.lng)
        const spd = sm.speed
        // Screen coords: x east, y down → use -v for the northward component.
        const ang = Math.atan2(-sm.v, sm.u)
        // Step length scales gently with speed for a lively but readable flow.
        const step = 0.7 + Math.min(spd, 30) * 0.24
        const nx = p.x + Math.cos(ang) * step
        const ny = p.y + Math.sin(ang) * step

        const [r, gg, b] = windColor(spd)
        // Brighten toward white for contrast, blended with the speed color.
        const cr = Math.round(r + (255 - r) * 0.55)
        const cg = Math.round(gg + (255 - gg) * 0.55)
        const cb = Math.round(b + (255 - b) * 0.55)
        // Faster air draws slightly thicker, brighter streaks.
        ctx.lineWidth = 1.1 + Math.min(spd, 24) * 0.05
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.95)`
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(nx, ny)
        ctx.stroke()

        p.x = nx
        p.y = ny
        p.age += 1
      }
    },
  })
  return new WindLayer(grid)
}
