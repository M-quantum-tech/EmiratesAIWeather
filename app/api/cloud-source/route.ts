import { NextResponse } from "next/server"
import { getCloudSource, saveCloudSource } from "@/lib/engineering"

export const dynamic = "force-dynamic"

/** Public read — the live banner links the cloud / satellite readout to this source. */
export async function GET() {
  const source = await getCloudSource()
  return NextResponse.json({ source })
}

/** Admin-only write from the Engineering Console. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const source = await saveCloudSource(body?.source)
    return NextResponse.json({ source })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed"
    const status = message === "Forbidden" ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
