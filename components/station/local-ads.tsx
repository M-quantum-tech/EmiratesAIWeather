"use client"

import { useMemo } from "react"
import { ArrowUpRight, MapPin, Tag } from "lucide-react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { rankLocalAds } from "@/lib/local-ads"
import { describeCode, type WeatherPayload } from "@/lib/weather"

export function LocalAds({ data }: { data: WeatherPayload }) {
  const stationName = data.location.name
  const group = describeCode(data.current.weatherCode).group
  // Rank on Celsius so the hot/cold bias is unit-independent.
  const temperatureC = data.units === "metric" ? data.current.temperature : ((data.current.temperature - 32) * 5) / 9

  const ads = useMemo(
    () => rankLocalAds(stationName, group, temperatureC),
    [stationName, group, temperatureC],
  )

  const hasLocal = ads.some((ad) => ad.local)

  return (
    <Panel>
      <PanelHeader title="Near you" meta={hasLocal ? stationName : "Sponsored offers"} />
      <ul className="divide-y divide-border">
        {ads.map((ad) => (
          <li key={ad.id}>
            <a
              href={ad.url}
              target="_blank"
              rel="nofollow sponsored noopener noreferrer"
              className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-signal"
              >
                <Tag className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{ad.business}</span>
                  {ad.local ? (
                    <span className="inline-flex items-center gap-0.5 rounded-sm bg-signal/15 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-signal">
                      <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
                      Local
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">{ad.headline}</span>
                <span className="mt-0.5 text-xs font-medium text-accent">{ad.offer}</span>
              </span>
              <ArrowUpRight
                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2 text-[0.625rem] leading-relaxed text-muted-foreground">
        Offers are curated and matched to current conditions. Advertise here to reach local viewers.
      </p>
    </Panel>
  )
}
