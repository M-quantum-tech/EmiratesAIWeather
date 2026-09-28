import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, LineChart } from "lucide-react"
import { requireIamUser } from "@/lib/iam-server"
import { iamCan } from "@/lib/iam"
import { SiteNav } from "@/components/site-nav"
import { WeatherProvider } from "@/components/weather/weather-provider"
import { DeepTrends } from "@/components/iam/deep-trends"

export const metadata = { title: "Deep trend analysis — EmiratesAIWeather" }

export default async function DeepTrendsPage() {
  const me = await requireIamUser("/iam/trends")
  // CRO-level accounts have no trend access — enforced server-side.
  if (!me.isAdmin && !iamCan(me.role, "deepTrends")) redirect("/iam")

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link
            href="/iam"
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to control dashboard
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <LineChart className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="label-caps">Deep trend analysis · {me.username}</span>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
            Multi-day site trends & threshold exceedance
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Hourly series across the 7-day window, with statistics and hours spent in each escalation tier.
          </p>
        </div>
        <WeatherProvider>
          <DeepTrends />
        </WeatherProvider>
      </section>
    </main>
  )
}
