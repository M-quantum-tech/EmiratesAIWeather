import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { ensureUserAccessColumns } from "@/lib/admin"
import { eq } from "drizzle-orm"

/**
 * Idempotently seed the two M-Quantum-Tech admin accounts. Safe to call
 * repeatedly: existing accounts are promoted to admin/allowed rather than
 * duplicated. Passwords are managed by Better Auth (hashed via its own flow).
 */
const ADMINS = [
  { username: "M-Quantum-Tech", email: "m-quantum-tech@mquantum.tech", password: "Imax@1993", name: "M-Quantum-Tech" },
  { username: "M-Quantum-Tech1", email: "m-quantum-tech1@mquantum.tech", password: "Imax@2026", name: "M-Quantum-Tech1" },
]

export async function GET() {
  await ensureUserAccessColumns()
  const results: { email: string; status: string }[] = []

  for (const admin of ADMINS) {
    const existing = await db.select().from(user).where(eq(user.email, admin.email)).limit(1)
    if (existing.length === 0) {
      try {
        await auth.api.signUpEmail({
          body: { email: admin.email, password: admin.password, name: admin.name },
        })
        results.push({ email: admin.email, status: "created" })
      } catch (err) {
        results.push({ email: admin.email, status: `error: ${(err as Error).message}` })
        continue
      }
    } else {
      results.push({ email: admin.email, status: "exists" })
    }
    // Ensure admin role + immediate access regardless of prior state.
    await db
      .update(user)
      .set({ role: "admin", accessStatus: "allowed", updatedAt: new Date() })
      .where(eq(user.email, admin.email))
  }

  return NextResponse.json({ ok: true, admins: results })
}
