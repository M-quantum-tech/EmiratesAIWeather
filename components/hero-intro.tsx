"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, Map, Radar, Satellite, Sparkles, Video } from "lucide-react"

const FEATURES = [
  { icon: Radar, label: "Live radar" },
  { icon: Satellite, label: "Cloud / IR" },
  { icon: Video, label: "Webcams" },
  { icon: Sparkles, label: "AI safety model" },
]

/**
 * Marketing hero for the UAE weather platform. Mirrors the weather-monitoring-system
 * layout: bold headline, product subcopy, primary "Open Map" CTA (scrolls to the map
 * section), an "Upgrade" link to pricing, and a cinematic weather visual.
 */
export function HeroIntro() {
  return (
    <section
      aria-label="EmiratesAIWeather introduction"
      className="station-rise overflow-hidden rounded-xl border border-border bg-panel"
    >
      <div className="grid items-stretch gap-0 lg:grid-cols-2">
        {/* Copy */}
        <div className="flex flex-col justify-center gap-5 p-6 sm:p-8 lg:p-10">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-signal/40 bg-signal/10 px-3 py-1 font-mono text-[0.625rem] uppercase tracking-widest text-signal">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
            </span>
            EmiratesConsensus model · live
          </span>

          <h1 className="text-balance text-3xl font-black leading-[1.05] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            AI-driven UAE weather — <span className="text-signal">accurate, local, and realtime</span>
          </h1>

          <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Forecasts, live radar, webcams and station telemetry, fused by the EmiratesConsensus model into one
            instrument-grade view of the Emirates sky.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="#map"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-transform hover:scale-[1.02]"
            >
              <Map className="h-4 w-4" aria-hidden="true" />
              Open Map
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Upgrade
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <f.icon className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                {f.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Visual */}
        <div className="relative min-h-[240px] overflow-hidden border-t border-border lg:min-h-full lg:border-l lg:border-t-0">
          <Image
            src="/hero/uae-weather.png"
            alt="Storm system approaching the Dubai and Abu Dhabi coastline at dusk with radar and wind overlays"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-panel via-panel/25 to-transparent lg:from-panel/80"
          />
        </div>
      </div>
    </section>
  )
}
