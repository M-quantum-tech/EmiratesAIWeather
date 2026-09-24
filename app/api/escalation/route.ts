import { NextResponse } from "next/server"
import { getEscalationRules, saveEscalationRules } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — the live alert banner uses this as its escalation ladder. */
export async function GET() {
  const rules = await getEscalationRules()
  return NextResponse.json({ rules })
}

/** Admin-only write from the Engineering Console. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rules = await saveEscalationRules(body?.rules)
    return NextResponse.json({ rules })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
