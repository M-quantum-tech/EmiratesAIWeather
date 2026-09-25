import { auth } from "@/lib/auth"
import { ensureAdminsSeeded } from "@/lib/admin"
import { toNextJsHandler } from "better-auth/next-js"

// Force per-request execution so the seed below always runs in production and
// is never baked into a build-time snapshot.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const handler = toNextJsHandler(auth)

export const GET = handler.GET

// Wrap the auth POST (which handles sign-in/sign-up) so that BEFORE Better Auth
// verifies any credentials, the designated owner accounts are guaranteed to
// exist with the admin role and their exact known passwords. This makes the
// admin login work on EVERY deployment regardless of build caching, a fresh
// database, or a drifted credential row — the #1 cause of the intermittent
// "Invalid email or password" on the admin console. Seeding failures are
// swallowed so a normal member sign-in is never blocked.
export async function POST(request: Request): Promise<Response> {
  await ensureAdminsSeeded().catch(() => {})
  return handler.POST(request)
}
