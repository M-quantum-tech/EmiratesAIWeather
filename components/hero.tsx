"use client"

import Image from "next/image"
import Link from "next/link"
import { Activity, MapPin, Radar, ShieldCheck } from "lucide-react"

const BADGES = [
  { icon: Radar, label: "Live radar" },
  { icon: Activity, label: "Station telemetry" },
  { icon: ShieldCheck, label: "4-tier safety AI" },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-secondary/40 via-transparent to-transparent">
      {/* soft glow accents behind the mockup */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-[32rem] w-[32rem] translate-x-1/3 -translate-y-1/4 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="lg:max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/40 bg-signal/10 px-3 py-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-signal">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
              </span>
              EmiratesConsensus model · live
            </span>
            <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              AI-driven UAE weather — <span className="text-accent">accurate, local, and realtime</span>
            </h1>
            <p className="mt-5 text-pretty text-lg text-muted-foreground sm:text-xl">
              Forecasts, live radar, webcams and station telemetry, fused into one instrument-grade view
              of the Emirates sky — with a 4-tier proximity safety model that tracks hazards closing on
              your location.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="#map"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Open Map
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-md border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50"
              >
                Upgrade
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              {BADGES.map((badge) => {
                const Icon = badge.icon
                return (
                  <li
                    key={badge.label}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  >
                    <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
                    {badge.label}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="relative w-full lg:max-w-2xl xl:max-w-3xl">
            <div className="pointer-events-none select-none overflow-hidden rounded-2xl border border-border bg-card shadow-2xl ring-1 ring-accent/10 station-rise">
              <Image
                src="/hero/weather-hero.png"
                alt="AI-driven UAE weather intelligence dashboard with radar sweep, wind flow and 7-day forecast"
                width={1280}
                height={720}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
