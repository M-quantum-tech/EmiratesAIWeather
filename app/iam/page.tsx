import Link from "next/link"
import { Activity, Check, Cpu, LineChart, Lock, Radio, ShieldCheck, X } from "lucide-react"
import { listIamUsers, requireIamUser } from "@/lib/iam-server"
import { IamRosterReadonly } from "@/components/iam/iam-roster-readonly"
import { CAPABILITY_LABELS, IAM_ROLES, iamCan, type IamCapability } from "@/lib/iam"
import { SiteNav } from "@/components/site-nav"
import { WeatherProvider } from "@/components/weather/weather-provider"
import { LiveSnapshot } from "@/components/iam/live-snapshot"

export const metadata = { title: "Control dashboard — EmiratesAIWeather" }

export default async function IamDashboardPage() {
  const me = await requireIamUser("/iam")
  const roster = await listIamUsers()
  const role = IAM_ROLES[me.role]
  const canTrends = me.isAdmin || iamCan(me.role, "deepTrends")
  const capabilities = Object.keys(CAPABILITY_LABELS) as IamCapability[]

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="label-caps">Control dashboard · {role.scadaRole}</span>
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">{me.username}</h1>
            <p className="text-sm text-muted-foreground">{me.title}</p>
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <span className="inline-flex w-fit items-center rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Role · {role.code}
            </span>
            <span className="text-sm text-muted-foreground">{role.controlLevel}</span>
          </div>
        </header>

        <WeatherProvider>
          <LiveSnapshot />
        </WeatherProvider>

        <div className="grid gap-4 md:grid-cols-3">
          <ModuleTile
            href="/"
            icon={<Radio className="h-5 w-5" aria-hidden="true" />}
            title="Live weather station"
            body="Real-time site conditions, escalation banner and NCM warnings."
          />
          {canTrends ? (
            <ModuleTile
              href="/iam/trends"
              icon={<LineChart className="h-5 w-5" aria-hidden="true" />}
              title="Deep trend analysis"
              body="Multi-day trends, statistics and threshold exceedance per metric."
            />
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-secondary/30 p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-foreground">Deep trend analysis</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Not available for the {role.code} role. Contact a supervisor for trend reports.
              </p>
            </div>
          )}
          {me.isAdmin ? (
            <ModuleTile
              href="/admin/engineering"
              icon={<Cpu className="h-5 w-5" aria-hidden="true" />}
              title="Engineering console"
              body="Escalation rules, alarm tuning and user management."
            />
          ) : (
            <ModuleTile
              href="/#alerts"
              icon={<Activity className="h-5 w-5" aria-hidden="true" />}
              title="Alarm panel"
              body={
                iamCan(me.role, "alarmAck")
                  ? "Acknowledge active escalation alarms."
                  : "View active escalation alarms (read-only)."
              }
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <span className="label-caps">Access rights · {role.title}</span>
          </div>
          <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            {capabilities.map((cap) => {
              const allowed = me.isAdmin || iamCan(me.role, cap)
              return (
                <li key={cap} className="flex items-center justify-between gap-3 border-border px-5 py-3 sm:border-b">
                  <span className={allowed ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
                    {CAPABILITY_LABELS[cap]}
                  </span>
                  {allowed ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.12em] text-alert-green">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Granted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      No access
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <IamRosterReadonly users={roster} />
      </section>
    </main>
  )
}

function ModuleTile({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-accent/60"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-accent">
        {icon}
      </span>
      <p className="text-sm font-semibold text-foreground group-hover:text-accent">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </Link>
  )
}
