import { headers } from "next/headers"
import { and, desc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscription } from "@/lib/db/schema"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return Response.json({ authed: false, isPro: false, plan: null })
  }

  const rows = await db
    .select()
    .from(subscription)
    .where(and(eq(subscription.userId, session.user.id), eq(subscription.status, "active")))
    .orderBy(desc(subscription.createdAt))
    .limit(5)

  const now = Date.now()
  // Active if a recurring plan is active, or a time pass has not expired yet.
  const active = rows.find((row) => {
    if (row.interval === "minute") {
      return row.currentPeriodEnd ? new Date(row.currentPeriodEnd).getTime() > now : false
    }
    return true
  })

  return Response.json({
    authed: true,
    isPro: Boolean(active),
    plan: active?.plan ?? null,
  })
}
