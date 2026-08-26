import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { Calendar, CreditCard, Crown, ShieldCheck } from "lucide-react"
import { auth } from "@/lib/auth"
import { getMySubscription } from "@/app/actions/subscription"
import { PLANS, formatCents, type PlanId } from "@/lib/plans"
import { SiteNav } from "@/components/site-nav"
import { ConfirmPlan } from "@/components/account/confirm-plan"

export const metadata = { title: "Your account — EmiratesAIWeather" }

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in?redirect=/account")

  const sub = await getMySubscription()
  const plan = sub && sub.plan in PLANS ? PLANS[sub.plan as PlanId] : null
  const user = session.user as { name: string; email: string; role?: string }

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-1">
          <span className="label-caps">Member area</span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
            Welcome, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <Suspense fallback={null}>
            <ConfirmPlan />
          </Suspense>

          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-accent" aria-hidden="true" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
                Subscription
              </h2>
            </div>

            {plan ? (
              <div className="mt-5 flex flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold text-foreground">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{plan.audience}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {sub?.status}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={CreditCard} label="Billing">
                    {formatCents(plan.priceCents)} {plan.cadenceLabel}
                  </InfoRow>
                  <InfoRow icon={Calendar} label={plan.kind === "pass" ? "Access until" : "Renews"}>
                    {sub?.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          ...(plan.kind === "pass"
                            ? { hour: "2-digit", minute: "2-digit" }
                            : {}),
                        })
                      : "—"}
                  </InfoRow>
                </div>

                <Link
                  href="/pricing"
                  className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  Change plan
                </Link>
              </div>
            ) : (
              <div className="mt-5 flex flex-col items-start gap-4">
                <p className="text-sm text-muted-foreground">
                  You are on the free tier. Upgrade to unlock AI forecasting and alerts.
                </p>
                <Link
                  href="/pricing"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  View Pro plans
                </Link>
              </div>
            )}
          </div>

          <Link href="/" className="text-sm text-accent hover:underline">
            Go to the weather station
          </Link>
        </div>
      </section>
    </main>
  )
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="label-caps">{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-foreground">{children}</p>
    </div>
  )
}
