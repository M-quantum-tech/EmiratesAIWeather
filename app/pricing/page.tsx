import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { PASS_LIST, PLAN_LIST } from "@/lib/plans"
import { SiteNav } from "@/components/site-nav"
import { PricingCards } from "@/components/pricing/pricing-cards"

export const metadata = {
  title: "Plans & Passes — EmiratesAIWeather",
  description:
    "EmiratesAIWeather pricing: Company Pro at $100/month, Personal Pro at $10/day, or one-time access passes — 10 min for $3, 30 min for $5, 1 hour for $7.",
}

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const isAuthed = Boolean(session?.user)

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="label-caps">Pro subscriptions</span>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Precision climate intelligence, priced for how you work
          </h1>
          <p className="mt-4 text-pretty text-muted-foreground">
            Unlock AI forecasting, severe-weather alerts and analytics. Choose a company plan for your
            team or a personal plan billed by the day.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <PricingCards plans={PLAN_LIST} isAuthed={isAuthed} columns={2} />
        </div>

        <div className="mx-auto mt-20 max-w-2xl text-center">
          <span className="label-caps">Pay-as-you-go</span>
          <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Time-based access passes
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Need Pro power for just a moment? Buy a one-time pass and get full access for a set
            window &mdash; no subscription, no commitment.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-5xl">
          <PricingCards plans={PASS_LIST} isAuthed={isAuthed} columns={3} />
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs text-muted-foreground">
          Prices shown in USD. This is a demonstration checkout flow &mdash; selecting a plan or pass
          records it to your account but does not process a real payment yet.
        </p>
      </section>
    </main>
  )
}
