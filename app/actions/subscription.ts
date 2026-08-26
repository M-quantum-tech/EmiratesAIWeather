"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscription } from "@/lib/db/schema"
import { PLANS, type PlanId } from "@/lib/plans"
import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

/** Read the current user's most recent subscription, if any. */
export async function getMySubscription() {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .orderBy(desc(subscription.createdAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Record a plan selection. This is the "pricing UI only" flow — no real
 * charge is made; it simply stores the chosen plan against the user so the
 * member area and admin dashboard reflect it.
 */
export async function choosePlan(planId: PlanId) {
  const userId = await getUserId()
  const plan = PLANS[planId]
  if (!plan) throw new Error("Unknown plan")

  const now = new Date()
  const periodEnd = new Date(now)
  if (plan.interval === "month") periodEnd.setMonth(periodEnd.getMonth() + 1)
  else if (plan.interval === "day") periodEnd.setDate(periodEnd.getDate() + 1)
  else periodEnd.setMinutes(periodEnd.getMinutes() + (plan.durationMinutes ?? 0))

  await db.insert(subscription).values({
    id: crypto.randomUUID(),
    userId,
    plan: plan.id,
    status: "active",
    priceCents: plan.priceCents,
    interval: plan.interval,
    currentPeriodEnd: periodEnd,
  })

  revalidatePath("/account")
  revalidatePath("/admin")
}

/**
 * Fulfilment after a verified, paid Stripe checkout. Records the purchased plan
 * against the user (same effect as choosePlan, but only called server-side once
 * Stripe confirms payment).
 */
export async function recordPurchasedPlan(planId: PlanId) {
  await choosePlan(planId)
}
