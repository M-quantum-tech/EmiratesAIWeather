"use client"

import Image from "next/image"
import Link from "next/link"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-secondary/40 via-transparent to-transparent">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="lg:max-w-2xl">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
              AI-driven UAE weather — accurate, local, and realtime
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Forecasts, live radar, webcams and station telemetry, fused by the EmiratesConsensus model.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="#map"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
              >
                Open Map
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/50"
              >
                Upgrade
              </Link>
            </div>
          </div>

          <div className="relative mt-6 w-full max-w-xl lg:mt-0 lg:ml-8">
            <div className="pointer-events-none hidden select-none sm:block">
              <Image
                src="/hero/weather-hero.png"
                alt="Weather map preview"
                width={720}
                height={420}
                className="rounded-xl shadow-2xl object-cover station-rise"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
