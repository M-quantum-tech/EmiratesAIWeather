import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Cpu } from "lucide-react"
import { getSessionUser } from "@/lib/admin"
import { getEscalationRules } from "@/lib/engineering"
import { SiteNav } from "@/components/site-nav"
import { EngineeringConsole } from "@/components/admin/engineering-console"

export const metadata = { title: "Engineering console — EmiratesAIWeather" }

export default async function EngineeringPage() {
  const sessionUser = await getSessionUser()
  if (!sessionUser) redirect("/sign-in?redirect=/admin/engineering")
  if (sessionUser.role !== "admin") redirect("/account")

  const rules = await getEscalationRules()

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to admin console
        </Link>
        <div className="mt-4 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
          <span className="label-caps">Engineering console</span>
        </div>
        <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-foreground">
          Escalation rules & alarm tuning
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the escalation ladder that drives the live warning banner and test the buzzer for each level.
        </p>

        <div className="mt-8">
          <EngineeringConsole initialRules={rules} />
        </div>
      </section>
    </main>
  )
}
