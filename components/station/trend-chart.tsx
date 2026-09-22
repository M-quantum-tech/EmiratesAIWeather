"use client"

import { useCallback, useId, useMemo, useRef, useState } from "react"

export type TrendPoint = {
  label: string
  value: number
  /** Optional degrees for directional series (wind direction). */
  direction?: number
}

type TrendChartProps = {
  points: TrendPoint[]
  unit?: string
  /** Format a value for the tooltip / axis. */
  format?: (value: number) => string
  height?: number
  /** Fill/stroke accent — a CSS color value or var(). */
  color?: string
  /** Render directional arrows under the axis (for wind direction). */
  showDirection?: boolean
  /** Persisted selection — shows a locked marker and reads back after the cursor leaves. */
  selectedIndex?: number | null
  /** Fired when the cursor is released / tapped on a point, or the chart is keyboard-navigated. */
  onSelect?: (index: number) => void
}

export function TrendChart({
  points,
  unit = "",
  format = (v) => `${Math.round(v)}`,
  height = 140,
  color = "var(--color-signal)",
  showDirection = false,
  selectedIndex = null,
  onSelect,
}: TrendChartProps) {
  const gradientId = useId()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { path, area, min, max, coords } = useMemo(() => {
    const values = points.map((p) => p.value)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const span = hi - lo || 1
    const pad = span * 0.15
    const yMin = lo - pad
    const yMax = hi + pad
    const range = yMax - yMin || 1
    const w = 100
    const h = 100
    const step = points.length > 1 ? w / (points.length - 1) : 0
    const pts = points.map((p, i) => {
      const x = points.length > 1 ? i * step : w / 2
      const y = h - ((p.value - yMin) / range) * h
      return { x, y }
    })
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")
    const fill = `${line} L${pts[pts.length - 1]?.x.toFixed(2)},${h} L${pts[0]?.x.toFixed(2)},${h} Z`
    return { path: line, area: fill, min: lo, max: hi, coords: pts }
  }, [points])

  const interactive = onSelect != null

  // Map a client X to the nearest data-point index by scrubbing the full width.
  const indexFromClientX = useCallback(
    (clientX: number) => {
      const svg = svgRef.current
      if (!svg || points.length === 0) return 0
      const rect = svg.getBoundingClientRect()
      const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
      const clamped = Math.min(1, Math.max(0, fraction))
      return Math.round(clamped * (points.length - 1))
    },
    [points.length],
  )

  if (points.length === 0) {
    return <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No data</div>
  }

  // What the header + cursor reflect: live hover first, then the locked selection, then the latest point.
  const cursorIndex =
    hover != null ? hover : selectedIndex != null && selectedIndex < points.length ? selectedIndex : null
  const readoutIndex = cursorIndex != null ? cursorIndex : points.length - 1
  const readoutPoint = points[readoutIndex]
  const cursor = cursorIndex != null ? coords[cursorIndex] : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold text-foreground">
          {format(readoutPoint.value)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
          {cursorIndex != null ? (
            <span className="ml-2 font-sans text-xs font-medium text-signal">{points[cursorIndex].label}</span>
          ) : null}
        </span>
        <span className="font-mono text-[0.625rem] text-muted-foreground">
          {format(min)}&ndash;{format(max)} {unit}
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={interactive ? "h-full w-full overflow-visible touch-none" : "h-full w-full overflow-visible"}
          role={interactive ? "slider" : "img"}
          aria-label={
            interactive
              ? "Scrub the trend to preview a day, release to load its breakdown"
              : `Trend chart ranging from ${format(min)} to ${format(max)} ${unit}`
          }
          aria-valuemin={interactive ? 0 : undefined}
          aria-valuemax={interactive ? points.length - 1 : undefined}
          aria-valuenow={interactive && cursorIndex != null ? cursorIndex : undefined}
          aria-valuetext={
            interactive && cursorIndex != null
              ? `${points[cursorIndex].label}, ${format(points[cursorIndex].value)} ${unit}`
              : undefined
          }
          tabIndex={interactive ? 0 : undefined}
          onPointerDown={
            interactive
              ? (e) => {
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  setHover(indexFromClientX(e.clientX))
                }
              : undefined
          }
          onPointerMove={
            interactive
              ? (e) => {
                  if (e.buttons === 0 && e.pointerType === "mouse") {
                    setHover(indexFromClientX(e.clientX))
                    return
                  }
                  setHover(indexFromClientX(e.clientX))
                }
              : undefined
          }
          onPointerUp={
            interactive
              ? (e) => {
                  onSelect?.(indexFromClientX(e.clientX))
                  setHover(null)
                }
              : undefined
          }
          onPointerLeave={interactive ? () => setHover(null) : undefined}
          onKeyDown={
            interactive
              ? (e) => {
                  const base = cursorIndex ?? points.length - 1
                  if (e.key === "ArrowRight") {
                    e.preventDefault()
                    onSelect?.(Math.min(points.length - 1, base + 1))
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault()
                    onSelect?.(Math.max(0, base - 1))
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect?.(base)
                  }
                }
              : undefined
          }
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

          {/* Non-interactive fallback: keep the original per-point hover targets. */}
          {!interactive
            ? coords.map((c, i) => (
                <g key={i}>
                  <rect
                    x={c.x - (coords.length > 1 ? 50 / coords.length : 50)}
                    y={0}
                    width={coords.length > 1 ? 100 / coords.length : 100}
                    height={100}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                  {hover === i ? <circle cx={c.x} cy={c.y} r="2" fill={color} vectorEffect="non-scaling-stroke" /> : null}
                </g>
              ))
            : null}

          {/* Vertical scrub cursor spanning the full day/trend height. */}
          {cursor ? (
            <line
              x1={cursor.x}
              y1={0}
              x2={cursor.x}
              y2={100}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {cursor ? (
            <circle cx={cursor.x} cy={cursor.y} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>

        {/* Value bubble that rides the cursor. */}
        {interactive && cursor ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded border border-border bg-popover px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold tabular-nums text-foreground shadow-sm"
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          >
            {format(readoutPoint.value)}
          </div>
        ) : null}
      </div>

      <div className="flex justify-between font-mono text-[0.5625rem] text-muted-foreground">
        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
            <span key={i} className="flex flex-col items-center gap-0.5">
              {showDirection && p.direction != null ? (
                <span
                  aria-hidden="true"
                  className="text-foreground"
                  style={{ display: "inline-block", transform: `rotate(${p.direction}deg)` }}
                >
                  ↓
                </span>
              ) : null}
              {p.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}
