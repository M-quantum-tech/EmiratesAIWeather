import { Suspense } from "react"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { ensureAdminsSeeded, isDesignatedAdmin } from "@/lib/admin"
import { SiteNav } from "@/components/site-nav"
import { AuthForm } from "@/components/auth/auth-form"

export const metadata = {
  title: "Admin sign in — EmiratesAIWeather",
}

export default async function AdminLoginPage() {
  // Guarantee the designated owner accounts exist on every deployment so this
  // console is always reachable, even against a brand-new database.
  await ensureAdminsSeeded().catch(() => {})

  const session = await auth.api.getSession({ headers: await headers() })
  const u = session?.user as { role?: string; email?: string } | undefined
  if (u) {
    // Already an admin (or a designated owner): go straight to the console.
    if (u.role === "admin" || isDesignatedAdmin(u.email)) redirect("/admin")
    // Signed in but not an admin: send them to their member area, not here.
    redirect("/account")
  }

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-16 sm:px-6">
        <Suspense fallback={null}>
          <AuthForm mode="sign-in" variant="admin" redirectTo="/admin" />
        </Suspense>
      </div>
    </main>
  )
}
