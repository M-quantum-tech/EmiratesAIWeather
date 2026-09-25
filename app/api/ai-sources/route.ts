import { NextResponse } from "next/server"
import { getAiSources, saveAiSources } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — the AI assistant blends every enabled source into its context. */
export async function GET() {
  const sources = await getAiSources()
  return NextResponse.json({ sources })
}

/** Admin-only write from the Engineering Console. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const sources = await saveAiSources(body?.sources)
    return NextResponse.json({ sources })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
