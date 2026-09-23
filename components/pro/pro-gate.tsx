"use client"

import { Clock, Lock, ShieldX } from "lucide-react"
import type { ReactNode } from "react"
import { usePro } from "@/components/pro/use-pro"
import { UnlockPro } from "@/components/pro/unlock-pro"

type ProGateProps = {
  children: ReactNode
  /** Fraction of the content revealed to free users (0-1). Default 0.45. */
  freeFraction?: number
  title?: string
  blurb?: string
}

/**
 * Reveals `freeFraction` of the content to everyone, then blurs the remaining
 * depth behind an unlock overlay for non-Pro users. Pro users see everything.
 */
export function ProGate({
  children,
  freeFraction = 0.45,
  title = "Unlock the full analysis",
  blurb = "Free view shows the first 45%. Go Pro for the complete depth — every trend, forecast band and expert breakdown.",
}: ProGateProps) {
  const { isPro, isLoading, access } = usePro()

  if (isPro || isLoading) {
    return <div className={isLoading ? "opacity-95" : undefined}>{children}</div>
  }

  // Admin-controlled access gate takes precedence over the paywall: a denied,
  // pending, expired or not-yet-started account cannot see the paid depth at all.
  if (access === "denied" || access === "pending" || access === "expired" || access === "scheduled") {
    const copy: Record<string, { title: string; blurb: string }> = {
      denied: {
        title: "Access denied",
        blurb: "An administrator has denied access to this content. Contact your administrator if you believe this is a mistake.",
      },
      pending: {
        title: "Access pending approval",
        blurb: "Your account is awaiting administrator approval. You'll gain access as soon as it's allowed.",
      },
      expired: {
        title: "Service period ended",
        blurb: "Your service window has ended. Contact your administrator to renew access.",
      },
      scheduled: {
        title: "Service not started yet",
        blurb: "Your access is scheduled to begin on the start date set by your administrator.",
      },
    }
    const { title: gTitle, blurb: gBlurb } = copy[access]
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
            {access === "expired" || access === "scheduled" ? (
              <Clock className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShieldX className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <h3 className="text-balance text-lg font-semibold tracking-tight text-foreground">{gTitle}</h3>
          <p className="max-w-md text-pretty text-sm text-muted-foreground">{gBlurb}</p>
        </div>
      </div>
    )
  }

  const revealPct = Math.round(freeFraction * 100)

  return (
    <div className="relative overflow-hidden">
      <div
        className="[mask-image:linear-gradient(to_bottom,black_0%,black_var(--reveal),transparent_calc(var(--reveal)+18%))]"
        style={{ ["--reveal" as string]: `${revealPct}%` }}
      >
        <div aria-hidden="true" className="pointer-events-none select-none">
          {children}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-background via-background/95 to-transparent px-6 pb-6 pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-accent">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {revealPct}% free · Pro depth locked
        </span>
        <h3 className="text-balance text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="max-w-md text-pretty text-sm text-muted-foreground">{blurb}</p>
        <UnlockPro />
      </div>
    </div>
  )
}
