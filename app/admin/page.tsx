import { redirect } from "next/navigation"
import { Building2, Clock, Ticket, TrendingUp, User, Users } from "lucide-react"
import { computeStats, getAdminMembers, getSessionUser } from "@/lib/admin"
import { formatCents } from "@/lib/plans"
import { SiteNav } from "@/components/site-nav"
import { MembersTable } from "@/components/admin/members-table"

export const metadata = { title: "Admin dashboard — EmiratesAIWeather" }

export default async function AdminPage() {
  const sessionUser = await getSessionUser()
  if (!sessionUser) redirect("/sign-in?redirect=/admin")
  if (sessionUser.role !== "admin") redirect("/account")

  const members = await getAdminMembers()
  const stats = computeStats(members)

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
          <StatCard icon={Building2} label="Company Pro" value={String(stats.companyCount)} hint="$100 / month each" />
          <StatCard icon={User} label="Personal Pro" value={String(stats.personalCount)} hint="$10 / day each" />
          <StatCard icon={Clock} label="Time passes" value={String(stats.passCount)} hint="$3 / $5 / $7 tiers" />
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
