"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { isAdmin, setServiceWindow, setUserAccess, setUserRole, type AccessStatus } from "@/lib/admin"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { account } from "@/lib/db/schema"

export async function updateRole(userId: string, role: "admin" | "user") {
  if (!(await isAdmin())) throw new Error("Forbidden")
  await setUserRole(userId, role)
  revalidatePath("/admin")
}

export async function updateAccess(userId: string, accessStatus: AccessStatus) {
  if (!(await isAdmin())) throw new Error("Forbidden")
  await setUserAccess(userId, accessStatus)
  revalidatePath("/admin")
}

export async function updateServiceWindow(userId: string, startISO: string | null, endISO: string | null) {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const start = startISO ? new Date(startISO) : null
  const end = endISO ? new Date(endISO) : null
  if (start && Number.isNaN(start.getTime())) throw new Error("Invalid start date")
  if (end && Number.isNaN(end.getTime())) throw new Error("Invalid end date")
  if (start && end && end.getTime() < start.getTime()) throw new Error("End date must be after start date")
  await setServiceWindow(userId, start, end)
  revalidatePath("/admin")
}

/**
 * Admin-set a member's password. Hashes with Better Auth's own hasher and writes
 * to the credential account row, so the new password works on the next sign-in.
 */
export async function resetUserPassword(userId: string, newPassword: string) {
  if (!(await isAdmin())) throw new Error("Forbidden")
  if (!newPassword || newPassword.length < 8) throw new Error("Password must be at least 8 characters")
  const ctx = await auth.$context
  const hash = await ctx.password.hash(newPassword)
  const updated = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(eq(account.userId, userId))
    .returning({ id: account.id })
  if (updated.length === 0) throw new Error("No credential account for this user")
  revalidatePath("/admin")
}
