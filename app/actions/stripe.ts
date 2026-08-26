"use server"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { PLANS, type PlanId } from "@/lib/plans"
import { stripe } from "@/lib/stripe"

const INTERVAL_MAP = { month: "month", day: "day" } as const

export async function startCheckoutSession(planId: PlanId) {
  const plan = PLANS[planId]
  if (!plan) throw new Error(`Unknown plan "${planId}"`)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    throw new Error("Please sign in before purchasing.")
  }

  const isSubscription = plan.kind === "subscription"

  const checkout = await stripe.checkout.sessions.create({
    // `embedded_page` replaced `embedded` in stripe-node v21+ (this project is v22).
    ui_mode: "embedded_page",
    redirect_on_completion: "never",
    mode: isSubscription ? "subscription" : "payment",
    customer_email: session.user.email,
    client_reference_id: session.user.id,
    metadata: { planId, userId: session.user.id },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `EmiratesAIWeather — ${plan.name}`,
            description: plan.tagline,
          },
          unit_amount: plan.priceCents,
          ...(isSubscription
            ? {
                recurring: {
                  interval: INTERVAL_MAP[plan.interval as "month" | "day"],
                },
              }
            : {}),
        },
        quantity: 1,
      },
    ],
    ...(isSubscription ? { subscription_data: { metadata: { planId, userId: session.user.id } } } : {}),
  })

  return checkout.client_secret
}

/**
 * Verify the current user's most recent checkout server-side, then fulfil it
 * (records the subscription). Called after the embedded checkout reports
 * completion. Finds the latest paid session for this user via metadata.
 */
export async function fulfillCheckout() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Not authenticated.")

  // Find this user's most recent completed checkout session.
  const list = await stripe.checkout.sessions.list({ limit: 10 })
  const mine = list.data.find(
    (s) =>
      s.metadata?.userId === session.user.id &&
      (s.payment_status === "paid" || s.status === "complete"),
  )
  if (!mine) {
    return { ok: false as const, message: "No completed payment found yet." }
  }

  const planId = mine.metadata?.planId as PlanId | undefined
  if (!planId || !PLANS[planId]) throw new Error("Missing plan on checkout.")

  const { recordPurchasedPlan } = await import("@/app/actions/subscription")
  await recordPurchasedPlan(planId)
  return { ok: true as const }
}
