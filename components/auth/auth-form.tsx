"use client"

import type React from "react"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn, signUp } from "@/lib/auth-client"
import { choosePlan } from "@/app/actions/subscription"
import { PLANS, type PlanId } from "@/lib/plans"
import { Button } from "@/components/ui/button"

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter()
  const params = useSearchParams()
  const planParam = params.get("plan")
  const plan = planParam && planParam in PLANS ? (planParam as PlanId) : null
  const redirectTo = params.get("redirect") ?? "/account"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === "sign-up"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const res = await signUp.email({ email, password, name })
        if (res.error) {
          setError(res.error.message ?? "Could not create your account.")
          setLoading(false)
          return
        }
        if (plan) {
          try {
            await choosePlan(plan)
          } catch {
            // Non-fatal: they can pick a plan again from the account page.
          }
        }
      } else {
        const res = await signIn.email({ email, password })
        if (res.error) {
          setError(res.error.message ?? "Invalid email or password.")
          setLoading(false)
          return
        }
      }
      router.push(redirectTo)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  const otherHref = isSignUp
    ? `/sign-in${plan ? `?plan=${plan}` : ""}`
    : `/sign-up${plan ? `?plan=${plan}` : ""}`

  return (
    <div className="w-full max-w-md">
      <div className="rounded-xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col gap-1">
          <span className="label-caps">{isSignUp ? "Create account" : "Member sign in"}</span>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
            {isSignUp ? "Start your Pro subscription" : "Welcome back"}
          </h1>
          {plan ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Selected plan:{" "}
              <span className="font-medium text-accent">{PLANS[plan].name}</span> —{" "}
              {PLANS[plan].priceLabel} {PLANS[plan].cadenceLabel}
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp ? (
            <Field label="Full name">
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Aisha Al Marri"
              />
            </Field>
          ) : null}

          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@company.ae"
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={loading} className="mt-1 h-11 w-full text-sm font-semibold">
            {loading
              ? "Please wait…"
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account? " : "New to EmiratesAIWeather? "}
          <Link href={otherHref} className="font-medium text-accent hover:underline">
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </div>
  )
}

const inputClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/40"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
    </label>
  )
}
