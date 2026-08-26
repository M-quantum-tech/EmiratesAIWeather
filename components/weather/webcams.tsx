"use client"

import Image from "next/image"
import { Camera, Circle } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { useWeather } from "@/components/weather/weather-provider"

const CAMS = [
  { src: "/webcams/skyline.png", label: "City skyline", angle: "NE facing" },
  { src: "/webcams/coast.png", label: "Coastal corniche", angle: "SW facing" },
  { src: "/webcams/desert.png", label: "Desert highway", angle: "E facing" },
]

export function Webcams() {
  const { location } = useWeather()
  const place = location?.name ?? "your area"

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 label-caps">
          <Camera className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          Local webcams · {place}
        </span>
        <span className="flex items-center gap-1 font-mono text-[0.625rem] uppercase text-alert-red">
          <Circle className="h-2 w-2 fill-current station-pulse" aria-hidden="true" />
          live
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {CAMS.map((cam, i) => (
          <figure key={cam.label} className="group relative overflow-hidden rounded-md border border-border">
            <div className="relative aspect-[4/3]">
              <Image
                src={cam.src}
                alt={`${cam.label} weather webcam view near ${place}`}
                fill
                priority={i === 0}
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wide text-alert-red">
                <Circle className="h-1.5 w-1.5 fill-current" aria-hidden="true" />
                rec
              </span>
            </div>
            <figcaption className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-medium text-foreground">{cam.label}</span>
              <span className="font-mono text-[0.5625rem] text-muted-foreground">{cam.angle}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-2 font-mono text-[0.5625rem] text-muted-foreground">
        Representative camera views. Licensed city feeds unlock with local station partners.
      </p>
    </Panel>
  )
}
