import { NextResponse } from "next/server"
import { getCsvPermission } from "@/lib/iam-server"

export async function GET() {
  try {
    const permission = await getCsvPermission()
    return NextResponse.json(permission, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ signedIn: false, allowed: false }, { headers: { "Cache-Control": "private, no-store" } })
  }
}
