import { NextResponse } from "next/server"
import { getNcmWarnings, saveNcmWarnings } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — the live warnings map mirrors this NCM bulletin for every visitor. */
export async function GET() {
  const warnings = await getNcmWarnings()
  return NextResponse.json({ warnings })
}

/** Admin-only write from the Engineering Console. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const warnings = await saveNcmWarnings(body?.warnings)
    return NextResponse.json({ warnings })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
