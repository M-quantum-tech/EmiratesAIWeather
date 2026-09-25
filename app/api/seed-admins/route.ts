import { NextResponse } from "next/server"
import { ADMIN_ACCOUNTS, ensureAdminsSeeded } from "@/lib/admin"

/**
 * Idempotently seed the M-Quantum-Tech admin accounts. Safe to call repeatedly.
 * Seeding also happens automatically when the sign-in page loads, so this
 * endpoint is a manual fallback / health check rather than a required step.
 */
export async function GET() {
  try {
    await ensureAdminsSeeded()
    return NextResponse.json({
      ok: true,
      admins: ADMIN_ACCOUNTS.map((a) => ({ email: a.email, status: "ensured" })),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
