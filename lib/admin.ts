import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { account, subscription, user } from "@/lib/db/schema"
import { hashPassword } from "better-auth/crypto"
import { and, desc, eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export type AccessStatus = "pending" | "allowed" | "denied"

/**
 * The designated administrator accounts for EmiratesAIWeather. These accounts
 * must ALWAYS be able to reach the admin + engineering consoles on every
 * deployment, regardless of database state. Password is managed by Better Auth
 * (hashed via its own sign-up flow) and only used for the initial seed.
 */
export const ADMIN_ACCOUNTS = [
  { email: "m-quantum-tech@mquantum.tech", password: "Imax@1993", name: "M-Quantum-Tech" },
  { email: "m-quantum-tech007@mquantum.tech", password: "Imax@2026", name: "M-Quantum-Tech007" },
] as const

const ADMIN_EMAILS = new Set(ADMIN_ACCOUNTS.map((a) => a.email.toLowerCase()))

/** True when the email belongs to a designated administrator account. */
export function isDesignatedAdmin(email: string | null | undefined): boolean {
  return Boolean(email) && ADMIN_EMAILS.has((email as string).toLowerCase())
}

/** The credential issuer Better Auth uses for email/password accounts. */
const CREDENTIAL_ISSUER = "local:credential"

/**
 * Deterministically upsert one designated admin so that, after this runs, the
 * account is GUARANTEED to exist with the admin role, allowed access, and the
 * exact known password — no matter what state the database was in. This is the
 * core of "the admin console must always work after every deployment":
 *
 *  - Creates the `user` row if missing, or promotes it to admin/allowed.
 *  - Creates the `credential` account row if missing, or resets its password
 *    hash — so even a half-seeded or drifted credential is repaired.
 *
 * Rows are written directly (not via Better Auth's sign-up flow) because
 * sign-up only works when the account is absent and can't repair an existing
 * broken credential, which is what made the console intermittently fail.
 */
async function upsertAdminAccount(admin: (typeof ADMIN_ACCOUNTS)[number]): Promise<void> {
  const existing = await db.select().from(user).where(eq(user.email, admin.email)).limit(1)
  let userId: string
  if (existing.length === 0) {
    userId = randomUUID()
    await db.insert(user).values({
      id: userId,
      name: admin.name,
      email: admin.email,
      emailVerified: true,
      role: "admin",
      accessStatus: "allowed",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } else {
    userId = existing[0].id
    await db
      .update(user)
      .set({ role: "admin", accessStatus: "allowed", emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, userId))
  }

  const hashed = await hashPassword(admin.password)
  const cred = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1)
  if (cred.length === 0) {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      issuer: CREDENTIAL_ISSUER,
      userId,
      password: hashed,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } else {
    await db
      .update(account)
      .set({ password: hashed, issuer: CREDENTIAL_ISSUER, accountId: userId, updatedAt: new Date() })
      .where(eq(account.id, cred[0].id))
  }
}

/**
 * Idempotently ensure the designated admin accounts exist with the admin role,
 * allowed access, and their known passwords. Cached per server instance (cheap
 * on repeat calls) but retries after a failure. This is what makes the admin
 * console work on a brand-new deployment without any manual step: the sign-in
 * pages call it on load, so the accounts are always present and usable.
 */
let adminsSeeded: Promise<void> | null = null
export function ensureAdminsSeeded(): Promise<void> {
  if (!adminsSeeded) {
    adminsSeeded = (async () => {
      await ensureUserAccessColumns()
      await ensureAccountIssuerColumn()
      for (const admin of ADMIN_ACCOUNTS) {
        await upsertAdminAccount(admin)
      }
    })().catch((err) => {
      adminsSeeded = null
      throw err
    })
  }
  return adminsSeeded
}

/**
 * Ensure the `account.issuer` column exists. Better Auth's credential sign-in
 * matches on it, so a fresh database created before this column was added must
 * gain it before we write credential rows.
 */
let issuerColumnReady: Promise<void> | null = null
export function ensureAccountIssuerColumn(): Promise<void> {
  if (!issuerColumnReady) {
    issuerColumnReady = (async () => {
      await db.execute(sql`ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text`)
    })().catch((err) => {
      issuerColumnReady = null
      throw err
    })
  }
  return issuerColumnReady
}

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
  if (!u) return false
  if (u.role === "admin") return true
  // Self-heal: a designated admin email is always an admin, even if the DB role
  // was never set on this deployment.
  if (isDesignatedAdmin(u.email)) {
    await promoteToAdmin(u.id)
    return true
  }
  return false
}

/** Promote a user to admin + allowed access. Idempotent. */
async function promoteToAdmin(userId: string): Promise<void> {
  await ensureUserAccessColumns()
  await db
    .update(user)
    .set({ role: "admin", accessStatus: "allowed", updatedAt: new Date() })
    .where(eq(user.id, userId))
}

/**
 * Page guard for the admin + engineering consoles. Redirects to sign-in when
 * signed out, and to /account for non-admins. A designated admin email is
 * self-healed to the admin role on the spot, so the console ALWAYS works for
 * those accounts on every deployment — even against a fresh database where the
 * role was never persisted. Returns the (admin) session user.
 */
export async function requireAdmin(redirectPath: string): Promise<SessionUser> {
  const sessionUser = await getSessionUser()
  if (!sessionUser) redirect(`/sign-in?redirect=${encodeURIComponent(redirectPath)}`)
  if (sessionUser.role === "admin") return sessionUser
  if (isDesignatedAdmin(sessionUser.email)) {
    await promoteToAdmin(sessionUser.id)
    return { ...sessionUser, role: "admin" }
  }
  redirect("/account")
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
