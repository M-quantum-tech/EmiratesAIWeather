import { randomUUID } from "node:crypto"
import { and, asc, eq, isNotNull, sql } from "drizzle-orm"
import { hashPassword } from "better-auth/crypto"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { account, session, user } from "@/lib/db/schema"
import {
  ensureAccountIssuerColumn,
  ensureUserAccessColumns,
  getSessionUser,
  isDesignatedAdmin,
  type AccessStatus,
} from "@/lib/admin"
import { IAM_SEED_USERS, iamEmailFor, isIamRoleCode, type IamRoleCode } from "@/lib/iam"

const CREDENTIAL_ISSUER = "local:credential"

/** Initial password for seeded plant accounts. Override with IAM_DEFAULT_PASSWORD. */
function defaultIamPassword(): string {
  return process.env.IAM_DEFAULT_PASSWORD?.trim() || "NE1CSP12345"
}

let iamColumnsReady: Promise<void> | null = null
export function ensureIamColumns(): Promise<void> {
  if (!iamColumnsReady) {
    iamColumnsReady = (async () => {
      await ensureUserAccessColumns()
      await ensureAccountIssuerColumn()
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "iamRole" text`)
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "iamUsername" text`)
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "iamTitle" text`)
      await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "iamCsvExport" boolean NOT NULL DEFAULT true`)
    })().catch((err) => {
      iamColumnsReady = null
      throw err
    })
  }
  return iamColumnsReady
}

async function writeCredential(userId: string, password: string): Promise<void> {
  const hashed = await hashPassword(password)
  const cred = await db
    .select({ id: account.id })
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

async function createIamAccount(username: string, title: string, role: IamRoleCode, password: string) {
  const id = randomUUID()
  await db.insert(user).values({
    id,
    name: username,
    email: iamEmailFor(username),
    emailVerified: true,
    role: "user",
    accessStatus: "allowed",
    iamRole: role,
    iamUsername: username,
    iamTitle: title,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await writeCredential(id, password)
  return id
}

/**
 * Create any missing roster accounts. Existing accounts are never touched, so
 * password resets, role changes and disables made in User Management persist.
 */
let iamSeeded: Promise<void> | null = null
export function ensureIamUsersSeeded(): Promise<void> {
  if (!iamSeeded) {
    iamSeeded = (async () => {
      await ensureIamColumns()
      const existing = await db.select({ email: user.email }).from(user)
      const emails = new Set(existing.map((u) => u.email.toLowerCase()))
      const password = defaultIamPassword()
      for (const seed of IAM_SEED_USERS) {
        if (emails.has(iamEmailFor(seed.username))) continue
        await createIamAccount(seed.username, seed.title, seed.role, password)
      }
    })().catch((err) => {
      iamSeeded = null
      throw err
    })
  }
  return iamSeeded
}

export interface IamSessionUser {
  id: string
  username: string
  title: string
  role: IamRoleCode
  isAdmin: boolean
}

/**
 * Page guard for plant IAM pages. Admins get full access (acting as OM-level
 * with every capability visible). Disabled accounts are bounced to the login.
 */
export async function requireIamUser(redirectPath: string): Promise<IamSessionUser> {
  const sessionUser = await getSessionUser()
  if (!sessionUser) redirect(`/iam/login?redirect=${encodeURIComponent(redirectPath)}`)
  await ensureIamColumns()

  const [row] = await db.select().from(user).where(eq(user.id, sessionUser.id)).limit(1)
  const admin = row?.role === "admin" || isDesignatedAdmin(sessionUser.email)

  if (row && isIamRoleCode(row.iamRole)) {
    if (row.accessStatus === "denied") redirect("/iam/login?disabled=1")
    return {
      id: row.id,
      username: row.iamUsername ?? row.name,
      title: row.iamTitle ?? row.name,
      role: row.iamRole,
      isAdmin: admin,
    }
  }
  if (admin) {
    return { id: sessionUser.id, username: sessionUser.name, title: "System Administrator", role: "OM", isAdmin: true }
  }
  redirect("/account")
}

export interface IamUserRow {
  id: string
  username: string
  title: string
  role: IamRoleCode
  accessStatus: AccessStatus
  csvExport: boolean
  lastSignIn: Date | null
}

export interface CsvPermission {
  signedIn: boolean
  allowed: boolean
}

/**
 * Trend CSV export is a signed-in, IAM-managed privilege: admins always may,
 * enabled plant logins may when their CSV export flag is on, everyone else may not.
 */
export async function getCsvPermission(): Promise<CsvPermission> {
  const sessionUser = await getSessionUser()
  if (!sessionUser) return { signedIn: false, allowed: false }
  if (sessionUser.role === "admin" || isDesignatedAdmin(sessionUser.email)) return { signedIn: true, allowed: true }
  await ensureIamColumns()
  const [row] = await db
    .select({ iamRole: user.iamRole, accessStatus: user.accessStatus, iamCsvExport: user.iamCsvExport })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1)
  const allowed = Boolean(row && isIamRoleCode(row.iamRole) && row.accessStatus !== "denied" && row.iamCsvExport)
  return { signedIn: true, allowed }
}

export async function listIamUsers(): Promise<IamUserRow[]> {
  await ensureIamUsersSeeded()
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      iamUsername: user.iamUsername,
      iamTitle: user.iamTitle,
      iamRole: user.iamRole,
      accessStatus: user.accessStatus,
      iamCsvExport: user.iamCsvExport,
      lastSignIn: sql<Date | null>`(select max(s."createdAt") from "session" s where s."userId" = ${user.id})`,
    })
    .from(user)
    .where(isNotNull(user.iamRole))
    .orderBy(asc(user.createdAt))

  return rows
    .filter((r) => isIamRoleCode(r.iamRole))
    .map((r) => ({
      id: r.id,
      username: r.iamUsername ?? r.name,
      title: r.iamTitle ?? "",
      role: r.iamRole as IamRoleCode,
      accessStatus: (r.accessStatus ?? "allowed") as AccessStatus,
      csvExport: r.iamCsvExport !== false,
      lastSignIn: r.lastSignIn ? new Date(r.lastSignIn) : null,
    }))
}

async function revokeSessions(userId: string) {
  await db.delete(session).where(eq(session.userId, userId))
}

async function assertIamUser(userId: string) {
  const [row] = await db.select({ iamRole: user.iamRole }).from(user).where(eq(user.id, userId)).limit(1)
  if (!row || !isIamRoleCode(row.iamRole)) throw new Error("Not a plant IAM account.")
}

export async function updateIamUser(
  userId: string,
  patch: {
    role?: IamRoleCode
    title?: string
    accessStatus?: "allowed" | "denied"
    username?: string
    csvExport?: boolean
  },
) {
  await ensureIamColumns()
  await assertIamUser(userId)
  let renamed = false
  if (patch.username !== undefined) {
    const email = iamEmailFor(patch.username)
    const [clash] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
    if (clash && clash.id !== userId) throw new Error("A user with that username already exists.")
    const [current] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)
    renamed = current?.email !== email
  }
  await db
    .update(user)
    .set({
      ...(patch.username !== undefined
        ? { iamUsername: patch.username, name: patch.username, email: iamEmailFor(patch.username) }
        : {}),
      ...(patch.role ? { iamRole: patch.role } : {}),
      ...(patch.title !== undefined ? { iamTitle: patch.title } : {}),
      ...(patch.accessStatus ? { accessStatus: patch.accessStatus } : {}),
      ...(patch.csvExport !== undefined ? { iamCsvExport: patch.csvExport } : {}),
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
  // Role or access changes take effect immediately: force a fresh sign-in.
  if (patch.role || patch.accessStatus === "denied" || renamed) await revokeSessions(userId)
}

export async function resetIamPassword(userId: string, password: string) {
  await ensureIamColumns()
  await assertIamUser(userId)
  await writeCredential(userId, password)
  await revokeSessions(userId)
}

export async function addIamUser(username: string, title: string, role: IamRoleCode, password: string) {
  await ensureIamColumns()
  const email = iamEmailFor(username)
  const exists = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  if (exists.length > 0) throw new Error("A user with that username already exists.")
  await createIamAccount(username, title, role, password)
}

export async function deleteIamUser(userId: string) {
  await assertIamUser(userId)
  await db.delete(user).where(eq(user.id, userId))
}
