import { NextResponse } from "next/server"
import { getMirrorPushPermission } from "@/lib/iam-server"

export const dynamic = "force-dynamic"

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    return NextResponse.json(await getMirrorPushPermission(), { headers })
  } catch {
    return NextResponse.json({ signedIn: false, allowed: false, isAdmin: false }, { headers })
  }
}
