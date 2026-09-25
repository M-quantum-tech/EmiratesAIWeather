import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { ShieldCheck } from "lucide-react"
import { auth } from "@/lib/auth"
import { ensureAdminsSeeded } from "@/lib/admin"
import { SiteNav } from "@/components/site-nav"
import { AuthForm } from "@/components/auth/auth-form"

export const metadata = {
  title: "Sign in — EmiratesAIWeather",
}

export default async function SignInPage() {
  // Guarantee the designated admin accounts exist on every deployment so the
  // admin + engineering consoles are always reachable. Never let a seeding
  // hiccup block the sign-in page from rendering.
  await ensureAdminsSeeded().catch(() => {})

  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/account")

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-16 sm:px-6">
        <Suspense fallback={null}>
          <AuthForm mode="sign-in" />
        </Suspense>

        <div className="mt-6 w-full max-w-md rounded-xl border border-border bg-secondary/40 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-accent">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Administrator portal</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage members and update plan pricing. Sign in with an admin account to open the console.
              </p>
              <Link
                href="/sign-in?redirect=/admin"
                className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-accent/60 bg-card px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Continue to admin console
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
