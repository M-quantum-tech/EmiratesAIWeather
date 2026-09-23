import { headers } from "next/headers"
import { and, desc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscription, user } from "@/lib/db/schema"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return Response.json({ authed: false, isPro: false, plan: null, access: "signed-out" })
  }

  // Admin-controlled access gate: evaluate allow/deny plus the optional
  // service window. Admins always have access regardless of the gate.
  const [profile] = await db
    .select({
      role: user.role,
      accessStatus: user.accessStatus,
      serviceStart: user.serviceStart,
      serviceEnd: user.serviceEnd,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  const nowMs = Date.now()
  const isAdminUser = profile?.role === "admin"
  let access: "allowed" | "pending" | "denied" | "expired" | "scheduled" = "allowed"
  if (!isAdminUser) {
    if (profile?.accessStatus === "denied") access = "denied"
    else if (profile?.accessStatus !== "allowed") access = "pending"
    else if (profile?.serviceStart && new Date(profile.serviceStart).getTime() > nowMs) access = "scheduled"
    else if (profile?.serviceEnd && new Date(profile.serviceEnd).getTime() < nowMs) access = "expired"
  }
  const hasAccess = access === "allowed"

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
    isPro: hasAccess && Boolean(active),
    plan: active?.plan ?? null,
    access,
    isAdmin: isAdminUser,
    serviceStart: profile?.serviceStart ?? null,
    serviceEnd: profile?.serviceEnd ?? null,
  })
}
