"use client"

import { useId, useMemo, useState } from "react"

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
}

export function TrendChart({
  points,
  unit = "",
  format = (v) => `${Math.round(v)}`,
  height = 140,
  color = "var(--color-signal)",
  showDirection = false,
}: TrendChartProps) {
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)

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

  if (points.length === 0) {
    return <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No data</div>
  }

  const activePoint = active != null ? points[active] : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold text-foreground">
          {activePoint ? format(activePoint.value) : format(points[points.length - 1].value)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
        </span>
        <span className="font-mono text-[0.625rem] text-muted-foreground">
          {format(min)}&ndash;{format(max)} {unit}
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`Trend chart ranging from ${format(min)} to ${format(max)} ${unit}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {coords.map((c, i) => (
            <g key={i}>
              <rect
                x={c.x - (coords.length > 1 ? 50 / coords.length : 50)}
                y={0}
                width={coords.length > 1 ? 100 / coords.length : 100}
                height={100}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
              {active === i ? (
                <circle cx={c.x} cy={c.y} r="2" fill={color} vectorEffect="non-scaling-stroke" />
              ) : null}
            </g>
          ))}
        </svg>
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
