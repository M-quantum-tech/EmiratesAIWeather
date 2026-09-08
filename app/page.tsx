import type { Metadata } from "next"
import { SiteNav } from "@/components/site-nav"
import { LeftNav } from "@/components/left-nav"
import { HeroIntro } from "@/components/hero-intro"
import { WeatherProvider } from "@/components/weather/weather-provider"
import { AlertBanner } from "@/components/weather/alert-banner"
import { ForecastStrip } from "@/components/forecast/forecast-strip"
import { WeekMeteogram } from "@/components/forecast/week-meteogram"
import { MeasureMap } from "@/components/weather/measure-map"
import { NcmSources } from "@/components/weather/ncm-sources"
import { Webcams } from "@/components/weather/webcams"
import { StationDashboard } from "@/components/station/station-dashboard"
import { DeepDiveMap } from "@/components/analysis/deep-dive-map"
import { RegisterPanel } from "@/components/players/register-panel"
import { AdUnit } from "@/components/station/ad-unit"
import { ChessGame } from "@/components/games/chess-game"
import { BreathingGame } from "@/components/wellness/breathing-game"
import { WeatherAssistant } from "@/components/ai/weather-assistant"
import { TipsPopup } from "@/components/wellness/tips-popup"
import { Hero } from "@/components/hero"

export const metadata: Metadata = {
  title: "EmiratesAIWeather — 7-Day Forecast, EmiratesConsensus Model & Live Radar",
  description:
    "Free 7-day forecast with a selectable hourly meteogram, live UAE radar & satellite loops with zoom and a time slider, a large multi-model measure & forecast map with location search and the EmiratesConsensus blend, official NCM Al Bahar sources, name + phone player registration, and pass-and-play chess.",
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
            {/* Marketing hero */}
            <HeroIntro />

            {/* Live alert / AI safety model */}
            <div className="mt-6">
              <AlertBanner />
            </div>

            {/* Hero / landing */}
            <section id="hero" className="mt-3 scroll-mt-6">
              <Hero />
            </section>

            {/* 1 · 7-day forecast (drives the hourly meteogram) */}
            <section id="forecast" className="mt-6 scroll-mt-6">
              <ForecastStrip />
            </section>

            {/* 2 · Hourly breakdown / meteogram for the selected day */}
            <section id="hourly" className="mt-6 scroll-mt-6">
              <DeepDiveMap />
            </section>

            {/* 7-day multi-panel meteogram */}
            <div className="mt-6">
              <WeekMeteogram />
            </div>

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
