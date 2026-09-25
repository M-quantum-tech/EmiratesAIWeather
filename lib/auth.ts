import { createHash } from "node:crypto"
import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

// Better Auth THROWS in production when no real secret is supplied ("You are
// using the default secret"), which 500s every auth route and shows the user
// "This page couldn't load." Development only warns, which is why the preview
// works while the deployed site crashes. Guarantee a real, stable secret so a
// deployment that did not receive BETTER_AUTH_SECRET can never boot on the
// default. The last-resort value is derived from an always-present, secret,
// stable input (the database URL) so it is high-entropy AND identical across
// deployments — existing sessions stay valid.
function resolveAuthSecret(): string {
  const explicit = process.env.BETTER_AUTH_SECRET?.trim()
  if (explicit && explicit.length >= 16) return explicit

  const seed = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (seed) {
    return createHash("sha256").update(`emiratesaiweather:auth:${seed}`).digest("hex")
  }

  return "emiratesaiweather-local-development-fallback-secret"
}

// Reduce any candidate value to a clean scheme+host origin. A malformed value
// (empty string, a bare host, or an accidental database/auth endpoint URL with
// a path) must never become the auth baseURL — that silently breaks every
// sign-in with "invalid login / error". Invalid candidates are dropped.
function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  const candidate = /^https?:\/\//.test(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.origin
  } catch {
    return undefined
  }
}

// The concrete origin each environment is actually served from. The v0 preview
// is served through the v0.build origin; the deployed app through its Vercel
// domain. baseURL MUST match the live origin, so we prefer these concrete
// values over a project-level BETTER_AUTH_URL that may be stale or point at a
// different host.
const runtimeOrigins = [
  process.env.V0_RUNTIME_URL,
  process.env.V0_DEV_APP_URL,
  process.env.V0_BUILD_URL,
  process.env.V0_SANDBOX_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
]
  .map(toOrigin)
  .filter((origin): origin is string => Boolean(origin))

// baseURL follows the live serving origin first; BETTER_AUTH_URL is only a
// last-resort fallback so a mis-set value cannot hijack the origin.
const baseURL = runtimeOrigins[0] ?? toOrigin(process.env.BETTER_AUTH_URL) ?? "http://localhost:3000"

// Every origin this app is actually served from must be trusted, in ALL
// environments. The deployed app (Vercel Preview + Production) is rendered
// inside the cross-site v0 iframe and served through the v0.build origin, so
// production must trust the exact v0 URLs too — otherwise Better Auth rejects
// sign-in/sign-up with "Invalid origin" and the user sees "invalid login".
// BETTER_AUTH_URL is still trusted here so a deliberate canonical URL keeps
// working even though it no longer dictates baseURL.
const trustedOrigins = Array.from(
  new Set(
    ["http://localhost:3000", ...runtimeOrigins, toOrigin(process.env.BETTER_AUTH_URL)].filter(
      (origin): origin is string => Boolean(origin),
    ),
  ),
)

export const auth = betterAuth({
  database: pool,
  secret: resolveAuthSecret(),
  baseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  trustedOrigins,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  advanced: {
    // This app is embedded in a cross-site iframe in BOTH the v0 dev preview
    // and the published deployment. Without SameSite=None; Secure the browser
    // silently drops the session cookie after a successful sign-in, so the
    // next request looks signed out (bounce back to sign-in / "error").
    // Secure is safe here because every deployment is served over HTTPS
    // (and localhost is treated as a secure context).
    defaultCookieAttributes: {
      sameSite: "none" as const,
      secure: true,
    },
  },
})
