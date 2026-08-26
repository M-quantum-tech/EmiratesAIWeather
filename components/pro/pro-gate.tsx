"use client"

import { Lock } from "lucide-react"
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
  const { isPro, isLoading } = usePro()

  if (isPro || isLoading) {
    return <div className={isLoading ? "opacity-95" : undefined}>{children}</div>
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
