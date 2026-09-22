"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "@/lib/auth-client"

const LINKS = [
  { href: "/", label: "Weather Station" },
  { href: "/pricing", label: "Pricing" },
  { href: "/company", label: "Company Profile" },
]

export function SiteNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  async function handleSignOut() {
    await signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="EmiratesAIWeather home">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
            <Image
              src="/brand/m-quantum-tech.png"
              alt="M-Quantum-Tech logo"
              width={40}
              height={40}
              className="h-full w-full object-contain"
              priority
            />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Emirates<span className="text-accent">AI</span>Weather
            </span>
            <span className="label-caps">By M-Quantum-Tech</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "hidden rounded-md px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] transition-colors sm:block",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            )
          })}

          {role === "admin" ? (
            <Link
              href="/admin"
              aria-current={pathname === "/admin" ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] transition-colors",
                pathname === "/admin"
                  ? "bg-secondary text-foreground"
                  : "text-accent hover:bg-secondary/60",
              )}
            >
              Admin
            </Link>
          ) : null}

          {isPending ? null : session?.user ? (
            <div className="flex items-center gap-2 pl-1">
              <Link
                href="/account"
                className="rounded-md px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                Account
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-1">
              <Link
                href="/sign-in"
                className="rounded-md px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Go Pro
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
