import "server-only"

import { db } from "@/lib/db"
import { planPrice } from "@/lib/db/schema"
import { formatCents, PLANS, type Plan, type PlanId } from "@/lib/plans"

/** Map of planId -> overridden price in cents, from the admin-editable table. */
export async function getPriceOverrides(): Promise<Partial<Record<PlanId, number>>> {
  try {
    const rows = await db.select().from(planPrice)
    const map: Partial<Record<PlanId, number>> = {}
    for (const r of rows) {
      if (r.planId in PLANS) map[r.planId as PlanId] = r.priceCents
    }
    return map
  } catch {
    // If the table isn't there yet, fall back to static defaults.
    return {}
  }
}

function withOverride(plan: Plan, cents: number | undefined): Plan {
  if (cents == null || cents === plan.priceCents) return plan
  return { ...plan, priceCents: cents, priceLabel: formatCents(cents) }
}

/** All plans with any admin price overrides applied. */
export async function getEffectivePlans(): Promise<Record<PlanId, Plan>> {
  const overrides = await getPriceOverrides()
  const out = {} as Record<PlanId, Plan>
  for (const id of Object.keys(PLANS) as PlanId[]) {
    out[id] = withOverride(PLANS[id], overrides[id])
  }
  return out
}

/** A single plan with its admin price override applied. */
export async function getEffectivePlan(id: PlanId): Promise<Plan> {
  const overrides = await getPriceOverrides()
  return withOverride(PLANS[id], overrides[id])
}
