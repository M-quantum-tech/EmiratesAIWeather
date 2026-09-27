"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, UserRound } from "lucide-react"
import { signIn } from "@/lib/auth-client"
import { iamEmailFor } from "@/lib/iam"
import { Button } from "@/components/ui/button"

export function IamLoginForm({ redirectTo, disabled }: { redirectTo: string; disabled?: boolean }) {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(
    disabled ? "This account has been disabled. Contact your system administrator." : null,
  )
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await signIn.email({ email: iamEmailFor(username), password })
      if (res.error) {
        setError("Invalid username or password.")
        setLoading(false)
        return
      }
      router.push(redirectTo)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="iam-username" className="label-caps">
          Username / role code
        </label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="iam-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            placeholder="e.g. PGM, Supervisor 3, CRO 1"
            className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="iam-password" className="label-caps">
          Password
        </label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="iam-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading || !username.trim() || !password} className="h-11">
        {loading ? "Authenticating…" : "Sign in to control dashboard"}
      </Button>
    </form>
  )
}
