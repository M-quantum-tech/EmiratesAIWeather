import Link from "next/link"
import { ArrowLeft, Cpu, UserCheck, Users } from "lucide-react"
import { ensureUserAccessColumns, getAdminMembers, requireAdmin } from "@/lib/admin"
import { SiteNav } from "@/components/site-nav"
import { AccessControls, MembersTable, ServiceWindow } from "@/components/admin/members-table"

export const metadata = { title: "User management — EmiratesAIWeather" }

export default async function AdminUsersPage() {
  const sessionUser = await requireAdmin("/admin/users")

  await ensureUserAccessColumns()
  const members = await getAdminMembers()
  const pending = members.filter((m) => m.accessStatus === "pending")

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to admin console
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="label-caps">User management</span>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              Members &amp; access requests
            </h1>
            <p className="text-sm text-muted-foreground">
              Approve or deny new sign-ins, set service windows, manage roles and reset passwords.
            </p>
          </div>
          <Link
            href="/admin/engineering"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-background/60"
          >
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            Engineering console
          </Link>
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
              Access requests
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
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">Members</h2>
          </div>
          <MembersTable members={members} currentUserId={sessionUser.id} />
        </div>
      </section>
    </main>
  )
}
