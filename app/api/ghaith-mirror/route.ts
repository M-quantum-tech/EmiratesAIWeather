import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getGhaithMirror, pushGhaithMirror } from "@/lib/engineering"

export const dynamic = "force-dynamic"

function tokenMatches(given: string | null): boolean {
  const expected = process.env.GHAITH_MIRROR_TOKEN
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Public read — Escalation panel + Wind Event Monitor use this as their primary source. */
export async function GET() {
  const mirror = await getGhaithMirror()
  return NextResponse.json({ mirror, relayEnabled: Boolean(process.env.GHAITH_MIRROR_TOKEN) })
}

/**
 * Push mirrored Ghaith readings. Either an admin session (Engineering Console) or
 * `Authorization: Bearer <GHAITH_MIRROR_TOKEN>` from an automated UAE-side relay.
 */
export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization")
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null
    const via = tokenMatches(bearer) ? "relay" : "console"
    const body = await req.json()
    const mirror = await pushGhaithMirror(body, via)
    return NextResponse.json({ mirror })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
