"use client"

import { useEffect, useState } from "react"
import {
  CalendarDays,
  Camera,
  Gauge,
  LineChart,
  type LucideIcon,
  Map as MapIcon,
  Satellite,
  Sparkles,
  Swords,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavItem = { id: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { id: "forecast", label: "7-Day Weather", icon: CalendarDays },
  { id: "hourly", label: "Hourly Meteogram", icon: LineChart },
  { id: "ai-prediction", label: "AI Prediction", icon: Sparkles },
  { id: "observations", label: "Live Observations", icon: Gauge },
  { id: "radar", label: "Radar & Satellite", icon: Satellite },
  { id: "map", label: "Weather Map", icon: MapIcon },
  { id: "webcams", label: "Webcams", icon: Camera },
  { id: "play", label: "Register & Play", icon: Swords },
]

export function LeftNav() {
  const [active, setActive] = useState<string>("forecast")

  // Highlight the section currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    )
    for (const item of NAV_ITEMS) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <nav aria-label="Page sections" className="flex flex-col gap-0.5">
      <p className="label-caps mb-2 px-3 text-muted-foreground">Sections</p>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = active === item.id
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-signal/15 font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon
              className={cn("h-4 w-4 shrink-0", isActive ? "text-signal" : "text-muted-foreground")}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
