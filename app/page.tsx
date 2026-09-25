import type { Metadata } from "next"
import { SiteNav } from "@/components/site-nav"
import { LeftNav } from "@/components/left-nav"
import { WeatherProvider } from "@/components/weather/weather-provider"
import { AlertBanner } from "@/components/weather/alert-banner"
import { HourlyBreakdown } from "@/components/forecast/hourly-breakdown"
import { NcmSources } from "@/components/weather/ncm-sources"
import { Webcams } from "@/components/weather/webcams"
import { WebcamsCallout } from "@/components/weather/webcams-callout"
import { StationDashboard } from "@/components/station/station-dashboard"
import { LiveTrend } from "@/components/station/live-trend"
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

            {/* Cloud & sky cams — live UAE webcams callout, above the AI safety model */}
            <div className="mt-6">
              <WebcamsCallout />
            </div>

            {/* Live alert / AI safety model */}
            <div className="mt-6">
              <AlertBanner />
            </div>

            {/* 1 · Live trend + AI projection — normalized multi-metric forecast (24H / 14-day)
                    with predictive timing + measures, that drives the breakdown below */}
            <section id="forecast" className="mt-6 scroll-mt-6">
              <LiveTrend />
            </section>

            {/* 3 · The selected day's 24-hour breakdown. Scrub the trend or tap a day
                    in the panel above to drive this hour-by-hour panel. */}
            <section id="hourly" className="mt-6 scroll-mt-6">
              <HourlyBreakdown />
            </section>

            {/* 4 · Live observations */}
            <section id="observations" className="mt-6 scroll-mt-6">
              <StationDashboard />
            </section>

            {/* 4 · NCM live radar & satellite loops (zoom + time slider) */}
            <section id="radar" className="mt-6 scroll-mt-6">
              <NcmSources />
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
