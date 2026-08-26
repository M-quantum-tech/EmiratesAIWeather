"use client"

import { useEffect, useState } from "react"
import { Sparkles, X, ChevronRight } from "lucide-react"
import { useWeather } from "@/components/weather/weather-provider"
import { cn } from "@/lib/utils"

type Tip = { tag: "Beauty" | "Health" | "Weather care"; text: string }

const BASE_TIPS: Tip[] = [
  { tag: "Beauty", text: "Double-cleanse at night to lift sunscreen and city dust for a clear, glowing complexion." },
  { tag: "Health", text: "Sip water every hour — even mild dehydration shows up as tiredness and dull skin." },
  { tag: "Beauty", text: "Pat a hydrating serum on damp skin so it seals in more moisture than on dry skin." },
  { tag: "Health", text: "A 5-minute stretch each morning eases stiffness and boosts circulation for the day." },
  { tag: "Beauty", text: "Silk pillowcases reduce hair breakage and morning creases — a tiny luxury that pays off." },
  { tag: "Health", text: "Swap one coffee for green tea; the antioxidants support skin and steady your energy." },
]

export function TipsPopup() {
  const { payload } = useWeather()
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  // Blend weather-aware tips with the base set.
  const tips: Tip[] = (() => {
    const extra: Tip[] = []
    if (payload) {
      const uv = payload.daily[0]?.uvIndexMax ?? 0
      if (uv >= 6) extra.push({ tag: "Weather care", text: `UV peaks at ${uv.toFixed(0)} today — reapply SPF 30+ every two hours outdoors.` })
      if (payload.current.humidity >= 70)
        extra.push({ tag: "Beauty", text: "Humidity is high — a lightweight gel moisturiser keeps skin fresh without feeling sticky." })
      if (payload.current.humidity < 35)
        extra.push({ tag: "Beauty", text: "Dry air today — mist your face midday and add a richer night cream to lock in moisture." })
      if (payload.air?.aqi && payload.air.aqi > 100)
        extra.push({ tag: "Health", text: "Air quality is elevated — cleanse thoroughly tonight and keep indoor air filtered." })
    }
    return [...extra, ...BASE_TIPS]
  })()

  const tipCount = tips.length

  // First appearance, then gentle auto-rotation. Kept independent of the tips
  // array contents so a weather payload update never resets the schedule.
  useEffect(() => {
    if (dismissed) return
    const show = setTimeout(() => setVisible(true), 6000)
    const rotate = setInterval(() => {
      setIndex((i) => (i + 1) % Math.max(1, tipCount))
      setVisible(true)
    }, 22000)
    return () => {
      clearTimeout(show)
      clearInterval(rotate)
    }
  }, [dismissed, tipCount])

  if (dismissed) return null

  const tip = tips[index % tips.length]

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-40 w-[min(20rem,calc(100vw-2rem))] transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
      role="complementary"
      aria-label="Beauty and health tip"
    >
      <div className="overflow-hidden rounded-lg border border-accent/30 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-3 py-2">
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-accent">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {tip.tag} tip
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss tips"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-3 py-3">
          <p className="text-pretty text-sm leading-relaxed text-foreground">{tip.text}</p>
          <button
            type="button"
            onClick={() => {
              setIndex((i) => (i + 1) % tips.length)
              setVisible(true)
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent/80"
          >
            Next tip
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
