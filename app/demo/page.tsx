import React from "react"
import { NcmSources } from "@/components/weather/ncm-sources"
import { MeasureMap } from "@/components/weather/measure-map"
import { WeatherProvider } from "@/components/weather/weather-provider"

export default function DemoPage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-[1400px] px-4">
        <h1 className="mb-2 text-xl font-semibold text-foreground">Live maps demo · Wind, Radar, Clouds & Measure</h1>
        <p className="mb-4 text-sm text-muted-foreground">Stacked panels for quick visual comparison — uses current Carto basemap reference (may show watermark).</p>
      </div>

      <WeatherProvider>
        <div className="mx-auto w-full max-w-[1400px] px-4">
          {/* Big NCM-style viewer (wind/radar/clouds/warnings) */}
          <NcmSources />
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-4">
          {/* Measure & forecast map below for point measurement and meteograms */}
          <MeasureMap />
        </div>
      </WeatherProvider>
    </div>
  )
}
