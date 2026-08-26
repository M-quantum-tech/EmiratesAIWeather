import { Suspense } from "react"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { SiteNav } from "@/components/site-nav"
import { AuthForm } from "@/components/auth/auth-form"

export const metadata = {
  title: "Create account — EmiratesAIWeather",
}

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/account")

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-16 sm:px-6">
        <Suspense fallback={null}>
          <AuthForm mode="sign-up" />
        </Suspense>
      </div>
    </main>
  )
}
