"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { PlanId } from "@/lib/plans"
import { CheckoutDialog } from "@/components/pro/checkout-dialog"

/**
 * Pricing CTA. Signed-in users open the Stripe embedded checkout for the plan;
 * signed-out users are routed to sign-up carrying the selected plan.
 */
export function CheckoutButton({
  planId,
  isAuthed,
  label,
  featured,
}: {
  planId: PlanId
  isAuthed: boolean
  label: string
  featured?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function handleClick() {
    if (!isAuthed) {
      router.push(`/sign-up?plan=${planId}`)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "mt-8 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors",
          featured
            ? "bg-accent text-accent-foreground hover:bg-accent/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {label}
      </button>

      {open ? (
        <CheckoutDialog
          planId={planId}
          onClose={() => setOpen(false)}
          onComplete={() => {
            setOpen(false)
            router.push("/account")
          }}
        />
      ) : null}
    </>
  )
}
