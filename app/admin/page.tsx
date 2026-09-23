import { redirect } from "next/navigation"
import { Building2, Clock, Tag, Ticket, TrendingUp, User, UserCheck, Users } from "lucide-react"
import { computeStats, ensureUserAccessColumns, getAdminMembers, getSessionUser } from "@/lib/admin"
import { formatCents } from "@/lib/plans"
import { getEffectivePlans } from "@/lib/pricing"
import { SiteNav } from "@/components/site-nav"
import { AccessControls, MembersTable, ServiceWindow } from "@/components/admin/members-table"
import { PricingEditor, type PriceRow } from "@/components/admin/pricing-editor"

export const metadata = { title: "Admin dashboard — EmiratesAIWeather" }

export default async function AdminPage() {
  const sessionUser = await getSessionUser()
  if (!sessionUser) redirect("/sign-in?redirect=/admin")
  if (sessionUser.role !== "admin") redirect("/account")

  await ensureUserAccessColumns()
  const members = await getAdminMembers()
  const pending = members.filter((m) => m.accessStatus === "pending")
  const stats = computeStats(members)
  const plans = await getEffectivePlans()
  const priceRows: PriceRow[] = [
    plans.company,
    plans.personal,
    plans.pass_10m,
    plans.pass_30m,
    plans.pass_60m,
  ].map((p) => ({ id: p.id, name: p.name, cadenceLabel: p.cadenceLabel, priceCents: p.priceCents }))

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-1">
          <span className="label-caps">Admin console</span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
            Operations dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Members, subscriptions and revenue across EmiratesAIWeather.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={TrendingUp}
            label="Monthly recurring revenue"
            value={formatCents(stats.mrrCents)}
            hint="Daily plans normalised to 30 days"
            emphasis
          />
          <StatCard
            icon={Ticket}
            label="Access pass revenue"
            value={formatCents(stats.passRevenueCents)}
            hint={`${stats.passCount} passes sold (one-time)`}
          />
          <StatCard icon={Users} label="Total members" value={String(stats.totalMembers)} hint={`${stats.activeSubs} active subscriptions`} />
          <StatCard
            icon={Building2}
            label="Company Pro"
            value={String(stats.companyCount)}
            hint={`${plans.company.priceLabel} / month each`}
          />
          <StatCard
            icon={User}
            label="Personal Pro"
            value={String(stats.personalCount)}
            hint={`${plans.personal.priceLabel} / day each`}
          />
          <StatCard
            icon={Clock}
            label="Time passes"
            value={String(stats.passCount)}
            hint={`${plans.pass_10m.priceLabel} / ${plans.pass_30m.priceLabel} / ${plans.pass_60m.priceLabel} tiers`}
          />
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">Plan pricing</h2>
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">
            Update any plan or pass price. Changes apply instantly across the pricing page and checkout.
          </p>
          <PricingEditor rows={priceRows} />
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
              User requests
            </h2>
            {pending.length > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                {pending.length} pending
              </span>
            ) : null}
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">
            New sign-ins land here as pending. Allow or deny access and set an optional service window.
          </p>
          {pending.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
              No pending requests. New sign-ups will appear here for approval.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pending.map((m) => (
                <div key={m.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.email}</span>
                  </div>
                  <AccessControls member={m} />
                  <ServiceWindow member={m} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            Members
          </h2>
          <MembersTable members={members} currentUserId={sessionUser.id} />
        </div>
      </section>
    </main>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-xl border border-accent/50 bg-accent/10 p-5 ring-1 ring-accent/20"
          : "rounded-xl border border-border bg-card p-5"
      }
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={emphasis ? "h-4 w-4 text-accent" : "h-4 w-4"} aria-hidden="true" />
        <span className="label-caps">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
