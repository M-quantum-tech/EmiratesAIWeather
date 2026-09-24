// A custom Leaflet canvas layer that paints an NCM Ghaith COSMO-UAE "total clouds"
// style field: total cloud cover (0–100 %) rendered as soft, continuous white cloud
// masses over the dark basemap. Thin cloud reads as a faint blue-grey haze, thick
// overcast as bright opaque white. The coarse forecast grid is bilinear-upscaled to
// an intermediate buffer and then Gaussian-blurred so the result looks like real
// satellite cloud fields instead of blocky cells.

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

/** Cloud shade for a cover percentage (0..100): transparent → cool haze → bright white. */
function cloudRGBA(coverPct: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, coverPct / 100))
  // Below ~5% treat as clear sky (fully transparent) so the map/geography shows.
  if (t < 0.05) return [0, 0, 0, 0]
  // Thin cloud = cool blue-grey; overcast = near-pure white. Ease toward white so
  // mid-range cover already reads as a solid cloud mass (NCM total-clouds look).
  const w = Math.pow(t, 0.6)
  const r = Math.round(168 + 84 * w)
  const g = Math.round(184 + 70 * w)
  const b = Math.round(206 + 46 * w)
  // Alpha grows quickly so even moderate cover looks substantial, capping opaque.
  const a = Math.round(36 + 219 * Math.pow(t, 0.62))
  return [r, g, b, Math.min(255, a)]
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

      // 1) Paint the raw grid into a tiny offscreen (one texel per cell).
      const src = document.createElement("canvas")
      src.width = g.nx
      src.height = g.ny
      const sctx = src.getContext("2d")
      if (!sctx) return
      const img = sctx.createImageData(g.nx, g.ny)
      for (let i = 0; i < g.nx * g.ny; i++) {
        const [r, gg, b, a] = cloudRGBA(g.cover[i])
        const p = i * 4
        img.data[p] = r
        img.data[p + 1] = gg
        img.data[p + 2] = b
        img.data[p + 3] = a
      }
      sctx.putImageData(img, 0, 0)

      // 2) Upscale to an intermediate buffer with high-quality smoothing so the
      //    field is continuous before we blur it (kills the blocky cell look).
      const nw = map.latLngToContainerPoint([g.la1, g.lo1])
      const se = map.latLngToContainerPoint([g.la2, g.lo2])
      const destW = Math.max(1, Math.round(se.x - nw.x))
      const destH = Math.max(1, Math.round(se.y - nw.y))
      const scale = 0.5 // intermediate at half screen-res is plenty once blurred
      const mid = document.createElement("canvas")
      mid.width = Math.max(1, Math.round(destW * scale))
      mid.height = Math.max(1, Math.round(destH * scale))
      const mctx = mid.getContext("2d")
      if (!mctx) return
      mctx.imageSmoothingEnabled = true
      mctx.imageSmoothingQuality = "high"
      mctx.drawImage(src, 0, 0, mid.width, mid.height)

      // 3) Blit the intermediate onto the map canvas with a Gaussian blur sized to
      //    the on-screen cell so clouds bleed into soft, natural masses.
      const cellPx = (se.x - nw.x) / g.nx
      const blur = Math.max(2, Math.min(22, cellPx * 0.55))
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.filter = `blur(${blur.toFixed(1)}px)`
      ctx.globalAlpha = 0.96
      ctx.drawImage(mid, nw.x, nw.y, destW, destH)
      ctx.restore()
    },
  })
  return new CloudLayer(grid)
}
