import type { NextRequest } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { player } from "@/lib/db/schema"

// Public directory: names only. Phone numbers are NEVER returned to clients.
export async function GET() {
  try {
    const rows = await db
      .select({ id: player.id, name: player.name, phoneVerified: player.phoneVerified })
      .from(player)
      .orderBy(asc(player.name))
      .limit(200)
    return Response.json({ players: rows })
  } catch (error) {
    console.log("[v0] players GET error:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not load players." }, { status: 502 })
  }
}

function normalizePhone(raw: string) {
  const trimmed = raw.trim()
  // Keep a leading +, strip everything else that isn't a digit.
  const plus = trimmed.startsWith("+") ? "+" : ""
  const digits = trimmed.replace(/[^\d]/g, "")
  return { display: plus + digits, digits }
}

export async function POST(request: NextRequest) {
  let body: { name?: unknown; phone?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const phoneRaw = typeof body.phone === "string" ? body.phone : ""

  if (name.length < 2 || name.length > 32) {
    return Response.json({ error: "Name must be 2–32 characters." }, { status: 400 })
  }
  const { display: phone, digits } = normalizePhone(phoneRaw)
  if (digits.length < 7 || digits.length > 15) {
    return Response.json({ error: "Enter a valid phone number (7–15 digits)." }, { status: 400 })
  }

  const nameKey = name.toLowerCase().replace(/\s+/g, " ")

  try {
    const existing = await db.select({ id: player.id }).from(player).where(eq(player.nameKey, nameKey)).limit(1)
    if (existing.length > 0) {
      return Response.json({ error: "That name is already taken. Choose another." }, { status: 409 })
    }

    const id = crypto.randomUUID()
    await db.insert(player).values({ id, name, nameKey, phone, phoneVerified: false })

    // SMS OTP verification is stubbed for now — record is created unverified.
    // Once an SMS provider (e.g. Twilio) is connected, send a code here and
    // flip phoneVerified after the user confirms it.
    return Response.json({
      player: { id, name, phoneVerified: false },
      verification: "pending",
      message: "Registered. Phone verification by SMS will be enabled soon.",
    })
  } catch (error) {
    console.log("[v0] players POST error:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not register right now." }, { status: 502 })
  }
}
