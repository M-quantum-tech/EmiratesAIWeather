// A custom Leaflet canvas layer that paints an NCM Ghaith COSMO-UAE "total clouds"
// style field: total cloud cover (0–100 %) rendered as soft white cloud masses over
// the dark basemap. Thin cloud reads as a faint blue-grey haze, thick overcast as
// bright opaque white — bilinear-upscaled from the coarse forecast grid.

/** A single forecast frame's total-cloud-cover grid (row-major from the NW corner). */
export type CloudGrid = {
  nx: number
  ny: number
  la1: number
  la2: number
  lo1: number
  lo2: number
  dx: number
  dy: number
  /** Total cloud cover (0–100 %). */
  cover: number[]
}

/** Cloud shade for a cover fraction (0..1): dark-transparent → blue-grey → white. */
function cloudRGBA(coverPct: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, coverPct / 100))
  // Below ~8% treat as clear sky (fully transparent) so the map/geography shows.
  if (t < 0.08) return [0, 0, 0, 0]
  // Ramp colour from cool grey (thin) to white (overcast).
  const r = Math.round(150 + 105 * t)
  const g = Math.round(165 + 90 * t)
  const b = Math.round(190 + 65 * t)
  // Alpha grows with cover so overcast dominates while thin cloud stays translucent.
  const a = Math.round(40 + 205 * Math.pow(t, 0.85))
  return [r, g, b, a]
}

export function createCloudLayer(L: any, grid: CloudGrid) {
  const CloudLayer = L.Layer.extend({
    initialize(this: any, g: CloudGrid) {
      this._grid = g
    },
    setGrid(this: any, g: CloudGrid) {
      this._grid = g
      if (this._map) this._draw()
    },
    onAdd(this: any, map: any) {
      this._map = map
      const pane = map.getPanes().overlayPane
      const c = (this._canvas = L.DomUtil.create("canvas", "leaflet-cloud-field leaflet-layer"))
      c.style.position = "absolute"
      const s = map.getSize()
      c.width = s.x
      c.height = s.y
      pane.appendChild(c)

      this._glue = () => this._reposition()
      this._settle = () => {
        this._reposition()
        this._draw()
      }
      map.on("move zoomanim", this._glue)
      map.on("moveend zoomend resize viewreset", this._settle)

      this._reposition()
      this._draw()
    },
    onRemove(this: any, map: any) {
      map.off("move zoomanim", this._glue)
      map.off("moveend zoomend resize viewreset", this._settle)
      L.DomUtil.remove(this._canvas)
    },
    _reposition(this: any) {
      const tl = this._map.containerPointToLayerPoint([0, 0])
      const s = this._map.getSize()
      const c = this._canvas
      L.DomUtil.setPosition(c, tl)
      if (c.width !== s.x) c.width = s.x
      if (c.height !== s.y) c.height = s.y
    },
    _draw(this: any) {
      const map = this._map
      const c = this._canvas
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
        const [r, gg, b, a] = cloudRGBA(g.cover[i])
        const p = i * 4
        img.data[p] = r
        img.data[p + 1] = gg
        img.data[p + 2] = b
        img.data[p + 3] = a
      }
      octx.putImageData(img, 0, 0)

      const nw = map.latLngToContainerPoint([g.la1, g.lo1])
      const se = map.latLngToContainerPoint([g.la2, g.lo2])
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.globalAlpha = 0.9
      ctx.drawImage(off, nw.x, nw.y, se.x - nw.x, se.y - nw.y)
      ctx.globalAlpha = 1
    },
  })
  return new CloudLayer(grid)
}
