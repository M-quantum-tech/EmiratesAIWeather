"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { choosePlan } from "@/app/actions/subscription"
import { PLANS, type PlanId } from "@/lib/plans"

/**
 * When an authenticated user arrives at /account?plan=xxx (from the pricing
 * page), auto-record the selected plan once, then clean the URL.
 */
export function ConfirmPlan() {
  const params = useSearchParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<PlanId | null>(null)
  const handled = useRef(false)

  const planParam = params.get("plan")
  const plan = planParam && planParam in PLANS ? (planParam as PlanId) : null

  useEffect(() => {
    if (!plan || handled.current) return
    handled.current = true
    startTransition(async () => {
      try {
        await choosePlan(plan)
        setDone(plan)
      } catch {
        // ignore — surfaced by the page state
      }
      router.replace("/account")
      router.refresh()
    })
  }, [plan, router])

  if (!plan && !done) return null

  return (
    <div
      role="status"
      className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground"
    >
      {pending
        ? "Activating your plan…"
        : done
          ? `${PLANS[done].name} is now active on your account.`
          : null}
    </div>
  )
}
