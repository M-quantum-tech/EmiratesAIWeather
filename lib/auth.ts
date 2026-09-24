import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

// Every origin this app is actually served from must be trusted, in ALL
// environments. The deployed app (Vercel Preview + Production) is rendered
// inside the cross-site v0 iframe and served through the v0.build origin, so
// production must trust the exact v0 URLs too — otherwise Better Auth rejects
// sign-in/sign-up with "Invalid origin" and the user sees "invalid login".
const trustedOrigins = Array.from(
  new Set(
    [
      "http://localhost:3000",
      process.env.V0_RUNTIME_URL,
      process.env.V0_DEV_APP_URL,
      process.env.V0_BUILD_URL,
      process.env.V0_SANDBOX_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
      process.env.BETTER_AUTH_URL,
    ].filter((origin): origin is string => Boolean(origin)),
  ),
)

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
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
