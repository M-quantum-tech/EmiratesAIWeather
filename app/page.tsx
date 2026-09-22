import type { Metadata } from "next"
import { SiteNav } from "@/components/site-nav"
import { LeftNav } from "@/components/left-nav"
import { WeatherProvider } from "@/components/weather/weather-provider"
import { AlertBanner } from "@/components/weather/alert-banner"
import { AiPrediction } from "@/components/forecast/ai-prediction"
import { DniForecast } from "@/components/solar/dni-forecast"
import { Outlook14Day } from "@/components/forecast/outlook-14day"
import { HourlyBreakdown } from "@/components/forecast/hourly-breakdown"
import { MeasureMap } from "@/components/weather/measure-map"
import { NcmSources } from "@/components/weather/ncm-sources"
import { Webcams } from "@/components/weather/webcams"
import { StationDashboard } from "@/components/station/station-dashboard"
import { RegisterPanel } from "@/components/players/register-panel"
import { AdUnit } from "@/components/station/ad-unit"
import { ChessGame } from "@/components/games/chess-game"
import { BreathingGame } from "@/components/wellness/breathing-game"
import { WeatherAssistant } from "@/components/ai/weather-assistant"
import { TipsPopup } from "@/components/wellness/tips-popup"
import { Hero } from "@/components/hero"

export const metadata: Metadata = {
  title: "EmiratesAIWeather — AI Prediction, EmiratesConsensus Model & Live Radar",
  description:
    "AI weather prediction with a trendable 24-hour and 14-day multi-model outlook (ECMWF, DWD, NOAA, Météo-France, JMA, KMA, UK Met Office, BOM), a selectable hourly breakdown, live UAE radar & satellite loops, a multi-model measure & forecast map, official NCM Al Bahar sources, player registration, and pass-and-play chess.",
}

export default function Page() {
  return (
    <WeatherProvider>
      <div className="min-h-dvh bg-background">
        <SiteNav />
        <div className="mx-auto flex max-w-[1800px] gap-6 px-4 py-6 sm:px-6 lg:py-8">
          {/* Left section navigation (desktop) */}
          <aside className="hidden w-52 shrink-0 xl:block">
            <div className="sticky top-6">
              <LeftNav />
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            {/* Hero / landing */}
            <section id="hero" className="scroll-mt-6">
              <Hero />
            </section>

            {/* Live alert / AI safety model */}
            <div className="mt-6">
              <AlertBanner />
            </div>

            {/* 1 · AI prediction — trendable multi-model forecast (24H / 14-day) that drives the breakdown below */}
            <section id="forecast" className="mt-6 scroll-mt-6">
              <AiPrediction />
            </section>

            {/* 1b · DNI solar forecast + the selected day's 24-hour breakdown, merged into one block.
                    Scrub the trend or tap a day above to drive the hour-by-hour panel below. */}
            <section id="solar" className="mt-6 scroll-mt-6">
              <div className="flex flex-col gap-6">
                <DniForecast />
                <div id="hourly" className="scroll-mt-6">
                  <HourlyBreakdown />
                </div>
              </div>
            </section>

            {/* 14-day multi-model outlook — synced to the shared selected day */}
            <section id="outlook" className="mt-6 scroll-mt-6">
              <Outlook14Day />
            </section>

            {/* 3 · Live observations */}
            <section id="observations" className="mt-6 scroll-mt-6">
              <StationDashboard />
            </section>

            {/* 4 · NCM live radar & satellite loops (zoom + time slider) */}
            <section id="radar" className="mt-6 scroll-mt-6">
              <NcmSources />
            </section>

            {/* 5 · Big multi-model measure & forecast map */}
            <section id="map" className="mt-6 scroll-mt-6">
              <MeasureMap />
            </section>

            {/* 6 · Local webcams */}
            <section id="webcams" className="mt-6 scroll-mt-6">
              <Webcams />
            </section>

            {/* 7 · Register + play chess together by name, flanked by vertical ad rails */}
            <section id="play" className="mt-6 scroll-mt-6">
              <RegisterPanel />
              <div className="mt-6 grid gap-6 xl:grid-cols-[180px_minmax(0,1fr)_180px]">
                <aside className="hidden xl:block">
                  <div className="sticky top-6">
                    <AdUnit label="Sponsored" orientation="vertical" />
                  </div>
                </aside>
                <div>
                  <ChessGame />
                </div>
                <aside className="hidden xl:block">
                  <div className="sticky top-6">
                    <AdUnit label="Sponsored" orientation="vertical" />
                  </div>
                </aside>
              </div>
            </section>

            {/* Wellness break */}
            <div className="mt-6">
              <BreathingGame />
            </div>
          </main>
        </div>
        <WeatherAssistant />
        <TipsPopup />
      </div>
    </WeatherProvider>
  )
}
