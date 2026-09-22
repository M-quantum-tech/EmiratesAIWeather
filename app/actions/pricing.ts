"use server"

import { db, pool } from "@/lib/db"
import { planPrice } from "@/lib/db/schema"
import { isAdmin } from "@/lib/admin"
import { PLANS, type PlanId } from "@/lib/plans"
import { revalidatePath } from "next/cache"

// Create the price table on first write. Avoids a separate migration step —
// reads fall back to static defaults until a price is first saved here.
async function ensurePlanPriceTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS "plan_price" (
    "planId" text PRIMARY KEY,
    "priceCents" integer NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  );`)
}

/** Update a plan's price (in cents). Admin only. */
export async function updatePlanPrice(planId: PlanId, priceCents: number) {
  if (!(await isAdmin())) throw new Error("Forbidden")
  if (!(planId in PLANS)) throw new Error("Unknown plan")
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_00) {
    throw new Error("Enter a price between $0 and $100,000")
  }

  await ensurePlanPriceTable()
  const now = new Date()
  await db
    .insert(planPrice)
    .values({ planId, priceCents, updatedAt: now })
    .onConflictDoUpdate({ target: planPrice.planId, set: { priceCents, updatedAt: now } })

  revalidatePath("/pricing")
  revalidatePath("/admin")
  revalidatePath("/")
  return { ok: true as const, priceCents }
}
