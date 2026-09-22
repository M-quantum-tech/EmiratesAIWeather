"use client"

import { cn } from "@/lib/utils"

type ControlSliderProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue: number
  onChange: (value: number) => void
}

export function ControlSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  defaultValue,
  onChange,
}: ControlSliderProps) {
  const isModified = value !== defaultValue

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label-caps">{label}</label>
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className={cn(
            "font-mono text-[0.6875rem] tabular-nums transition-colors",
            isModified ? "text-accent hover:text-accent/80" : "text-muted-foreground",
          )}
          aria-label={`Reset ${label}`}
        >
          {value}
          {unit}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
    </div>
  )
}
