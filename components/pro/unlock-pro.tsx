"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Check } from "lucide-react"
import { PASS_LIST, PLAN_LIST, formatCents, type PlanId } from "@/lib/plans"
import { usePro } from "@/components/pro/use-pro"
import { CheckoutDialog } from "@/components/pro/checkout-dialog"

/**
 * "Unlock Pro" entry point. Signed-in users get an inline plan picker that opens
 * the Stripe embedded checkout; signed-out users are routed to sign-up first.
 */
export function UnlockPro({ label = "Unlock Pro" }: { label?: string }) {
  const router = useRouter()
  const { authed, isLoading, refresh } = usePro()
  const [picker, setPicker] = useState(false)
  const [planId, setPlanId] = useState<PlanId | null>(null)

  function handleClick() {
    if (isLoading) return
    if (!authed) {
      router.push("/sign-up?next=/")
      return
    }
    setPicker(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="mt-1 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>

      {picker ? (
        <div
          className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a plan"
          onClick={() => setPicker(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="label-caps text-signal">Choose your access</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Unlock full Pro depth</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Subscribe, or grab a one-time time pass. All global &amp; local cards accepted.
            </p>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscriptions</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLAN_LIST.map((p) => (
                  <PlanRow key={p.id} id={p.id} name={p.name} price={`${formatCents(p.priceCents)} ${p.cadenceLabel}`} onPick={setPlanId} />
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time passes</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {PASS_LIST.map((p) => (
                  <PlanRow key={p.id} id={p.id} name={p.name} price={`${formatCents(p.priceCents)} · ${p.cadenceLabel.replace("one-time · ", "")}`} onPick={setPlanId} />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPicker(false)}
              className="mt-4 w-full rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
            >
              Maybe later
            </button>
          </div>
        </div>
      ) : null}

      {planId ? (
        <CheckoutDialog
          planId={planId}
          onClose={() => setPlanId(null)}
          onComplete={() => {
            refresh()
            setPicker(false)
          }}
        />
      ) : null}
    </>
  )
}

function PlanRow({
  id,
  name,
  price,
  onPick,
}: {
  id: PlanId
  name: string
  price: string
  onPick: (id: PlanId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className="group flex flex-col items-start gap-0.5 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
    >
      <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-foreground">
        {name}
        <Check className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </span>
      <span className="text-xs text-muted-foreground">{price}</span>
    </button>
  )
}
