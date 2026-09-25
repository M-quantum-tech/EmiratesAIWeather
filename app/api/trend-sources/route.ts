import { NextResponse } from "next/server"
import { getTrendSources, saveTrendSources } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — the Live Trend panels use this as their reference-source map. */
export async function GET() {
  const groups = await getTrendSources()
  return NextResponse.json({ groups })
}

/** Admin-only write from the Engineering Console. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const groups = await saveTrendSources(body?.groups)
    return NextResponse.json({ groups })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
