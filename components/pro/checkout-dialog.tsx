"use client"

import { useCallback, useEffect, useState } from "react"
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { X, ShieldCheck, CreditCard } from "lucide-react"
import { PLANS, formatCents, type PlanId } from "@/lib/plans"
import { startCheckoutSession, fulfillCheckout } from "@/app/actions/stripe"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string)

type Status = "form" | "done"

export function CheckoutDialog({
  planId,
  onClose,
  onComplete,
}: {
  planId: PlanId
  onClose: () => void
  onComplete: () => void
}) {
  const plan = PLANS[planId]
  const [status, setStatus] = useState<Status>("form")
  const [error, setError] = useState<string | null>(null)

  const fetchClientSecret = useCallback(async () => {
    const secret = await startCheckoutSession(planId)
    if (!secret) throw new Error("Could not start checkout.")
    return secret
  }, [planId])

  const handleComplete = useCallback(async () => {
    try {
      const result = await fulfillCheckout()
      if (!result.ok) {
        setError(result.message)
        return
      }
      setStatus("done")
      onComplete()
    } catch (err) {
      console.log("[v0] checkout complete handler error:", err)
      setError(err instanceof Error ? err.message : "Could not confirm your payment.")
    }
  }, [onComplete])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Checkout for ${plan.name}`}
    >
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="label-caps text-signal">Secure checkout</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{plan.name}</h2>
            <p className="text-sm text-muted-foreground">
              {formatCents(plan.priceCents)} {plan.cadenceLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close checkout"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : status === "done" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-alert-green/15 text-alert-green">
                <ShieldCheck className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Payment received</h3>
              <p className="max-w-xs text-sm text-muted-foreground">
                Your {plan.name} is now active. Enjoy full Pro access across the platform.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <CreditCard className="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
                All major global &amp; local debit / credit cards accepted. Payments are processed
                securely by Stripe.
              </p>
              <div id="checkout" className="[color-scheme:light]">
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ fetchClientSecret, onComplete: handleComplete }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
