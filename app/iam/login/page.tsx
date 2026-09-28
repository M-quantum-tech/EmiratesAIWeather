import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { ShieldCheck } from "lucide-react"
import { auth } from "@/lib/auth"
import { ensureIamUsersSeeded } from "@/lib/iam-server"
import { SiteNav } from "@/components/site-nav"
import { IamLoginForm } from "@/components/iam/iam-login-form"

export const metadata = { title: "Plant IAM sign in — EmiratesAIWeather" }

function safeRedirect(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw
  return "/iam"
}

export default async function IamLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[]; disabled?: string }>
}) {
  await ensureIamUsersSeeded().catch(() => {})
  const { redirect: redirectParam, disabled } = await searchParams
  const redirectTo = safeRedirect(redirectParam)

  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user && !disabled) redirect(redirectTo)

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="label-caps">Identity & Access Management</span>
          </div>
          <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground">
            Plant control sign in
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Your dashboard opens with the controls assigned to your role.
          </p>
          <div className="mt-6">
            <IamLoginForm redirectTo={redirectTo} disabled={Boolean(disabled)} />
          </div>
        </div>
      </div>
    </main>
  )
}
