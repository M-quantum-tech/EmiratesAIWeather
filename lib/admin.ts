import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscription, user } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"

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
    }
  })
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
