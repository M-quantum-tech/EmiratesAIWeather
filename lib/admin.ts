import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscription, user } from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"

export type AccessStatus = "pending" | "allowed" | "denied"

/**
 * Idempotently add the admin access-control columns to the user table. Runs on
 * demand from the admin page so a fresh database gets the columns without a
 * manual migration (mirrors the plan_price ensure pattern).
 */
let accessColumnsReady: Promise<void> | null = null
export function ensureUserAccessColumns(): Promise<void> {
  if (!accessColumnsReady) {
    accessColumnsReady = (async () => {
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accessStatus" text NOT NULL DEFAULT 'pending'`)
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "serviceStart" timestamp`)
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "serviceEnd" timestamp`)
    })().catch((err) => {
      accessColumnsReady = null
      throw err
    })
  }
  return accessColumnsReady
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role?: string | null
}

/** Returns the current session's user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return session.user as SessionUser
}

export async function isAdmin() {
  const u = await getSessionUser()
  return u?.role === "admin"
}

export interface AdminMember {
  id: string
  name: string
  email: string
  role: string
  createdAt: Date
  plan: string | null
  status: string | null
  priceCents: number | null
  interval: string | null
  accessStatus: AccessStatus
  serviceStart: Date | null
  serviceEnd: Date | null
}

/**
 * Every user joined with their latest subscription. Admin-only aggregate —
 * the caller (admin page) is responsible for enforcing the admin gate first.
 */
export async function getAdminMembers(): Promise<AdminMember[]> {
  const users = await db.select().from(user).orderBy(desc(user.createdAt))
  const subs = await db.select().from(subscription).orderBy(desc(subscription.createdAt))

  const latestByUser = new Map<string, (typeof subs)[number]>()
  for (const s of subs) {
    if (!latestByUser.has(s.userId)) latestByUser.set(s.userId, s)
  }

  return users.map((u) => {
    const s = latestByUser.get(u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      plan: s?.plan ?? null,
      status: s?.status ?? null,
      priceCents: s?.priceCents ?? null,
      interval: s?.interval ?? null,
      accessStatus: (u.accessStatus ?? "pending") as AccessStatus,
      serviceStart: u.serviceStart ?? null,
      serviceEnd: u.serviceEnd ?? null,
    }
  })
}

/** True when the user is allowed AND inside their (optional) service window. */
export function hasActiveAccess(m: {
  accessStatus: AccessStatus
  serviceStart: Date | null
  serviceEnd: Date | null
}): boolean {
  if (m.accessStatus !== "allowed") return false
  const now = Date.now()
  if (m.serviceStart && now < new Date(m.serviceStart).getTime()) return false
  if (m.serviceEnd && now > new Date(m.serviceEnd).getTime()) return false
  return true
}

export interface AdminStats {
  totalMembers: number
  activeSubs: number
  companyCount: number
  personalCount: number
  passCount: number
  /** Monthly recurring revenue in cents — daily plans normalised to ~30 days. */
  mrrCents: number
  /** One-time revenue from time-based access passes, in cents. */
  passRevenueCents: number
}

export function computeStats(members: AdminMember[]): AdminStats {
  let companyCount = 0
  let personalCount = 0
  let passCount = 0
  let mrrCents = 0
  let passRevenueCents = 0
  let activeSubs = 0

  for (const m of members) {
    if (!m.plan || m.priceCents == null) continue
    if (m.plan === "company") {
      if (m.status !== "active") continue
      activeSubs++
      companyCount++
      mrrCents += m.priceCents
    } else if (m.plan === "personal") {
      if (m.status !== "active") continue
      activeSubs++
      personalCount++
      mrrCents += m.priceCents * 30
    } else if (m.interval === "minute") {
      // One-time access pass — count revenue regardless of expiry.
      passCount++
      passRevenueCents += m.priceCents
    }
  }

  return {
    totalMembers: members.length,
    activeSubs,
    companyCount,
    personalCount,
    passCount,
    mrrCents,
    passRevenueCents,
  }
}

/** Promote/demote a user's role — admin only. */
export async function setUserRole(userId: string, role: "admin" | "user") {
  if (!(await isAdmin())) throw new Error("Forbidden")
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId))
}

/** Allow / deny / reset a user's access request — admin only. */
export async function setUserAccess(userId: string, accessStatus: AccessStatus) {
  if (!(await isAdmin())) throw new Error("Forbidden")
  await ensureUserAccessColumns()
  await db.update(user).set({ accessStatus, updatedAt: new Date() }).where(eq(user.id, userId))
}

/** Set (or clear) a user's service start/end window — admin only. */
export async function setServiceWindow(userId: string, start: Date | null, end: Date | null) {
  if (!(await isAdmin())) throw new Error("Forbidden")
  await ensureUserAccessColumns()
  await db
    .update(user)
    .set({ serviceStart: start, serviceEnd: end, updatedAt: new Date() })
    .where(eq(user.id, userId))
}
