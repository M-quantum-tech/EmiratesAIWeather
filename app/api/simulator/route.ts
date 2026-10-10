import { NextResponse } from "next/server"
import { getSimulatorState, saveSimulatorState } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — every visitor's safety panel follows the active drill. */
export async function GET() {
  const state = await getSimulatorState()
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } })
}

/** Admin-only write from the Engineering Console simulator. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const state = await saveSimulatorState(body?.state)
    return NextResponse.json({ state })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
