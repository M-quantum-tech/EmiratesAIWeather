import { NextResponse } from "next/server"
import { getWindMonitor, saveWindMonitor } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — the live Wind Event Monitor panel uses this as its threshold ladder. */
export async function GET() {
  const tiers = await getWindMonitor()
  return NextResponse.json({ tiers })
}

/** Admin-only write from the Engineering Console. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const tiers = await saveWindMonitor(body?.tiers)
    return NextResponse.json({ tiers })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
