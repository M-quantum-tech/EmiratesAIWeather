"use client"

import { useState } from "react"
import useSWR from "swr"
import { CheckCircle2, Lock, ShieldQuestion, UserPlus, Users } from "lucide-react"
import { Panel } from "@/components/station/panel"

export type RosterPlayer = { id: string; name: string; phoneVerified: boolean }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Shared roster hook — SWR de-dupes this key across the register panel and chess board. */
export function useRoster() {
  const { data, mutate, isLoading } = useSWR<{ players: RosterPlayer[] }>("/api/players", fetcher, {
    revalidateOnFocus: false,
  })
  return { players: data?.players ?? [], mutate, isLoading }
}

export function RegisterPanel() {
  const { players, mutate, isLoading } = useRoster()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("saving")
    setMessage(null)
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus("error")
        setMessage(data.error ?? "Could not register.")
        return
      }
      setStatus("ok")
      setMessage(data.message ?? "Registered.")
      setName("")
      setPhone("")
      mutate()
    } catch {
      setStatus("error")
      setMessage("Network error — try again.")
    }
  }

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2">
          <UserPlus className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <h2 className="label-caps text-foreground/80">Register to play</h2>
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          <Users className="h-3 w-3" aria-hidden="true" />
          {players.length} registered
        </span>
      </header>

      <div className="grid gap-px bg-border md:grid-cols-2">
        {/* Registration form */}
        <form onSubmit={submit} className="flex flex-col gap-3 bg-card p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="reg-name" className="label-caps text-muted-foreground">
              Display name
            </label>
            <input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              required
              placeholder="e.g. Rashid_AD"
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none"
            />
            <p className="text-[0.625rem] text-muted-foreground">This is the only thing other players see.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reg-phone" className="label-caps text-muted-foreground">
              Phone number
            </label>
            <input
              id="reg-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              required
              placeholder="+971 50 123 4567"
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none"
            />
            <p className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
              Private — kept for verification only, never shown to opponents.
            </p>
          </div>

          <button
            type="submit"
            disabled={status === "saving"}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-signal px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {status === "saving" ? "Registering…" : "Register"}
          </button>

          {message ? (
            <p
              className={
                status === "error"
                  ? "text-xs text-destructive"
                  : "flex items-center gap-1.5 text-xs text-accent"
              }
              role="status"
            >
              {status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {message}
            </p>
          ) : null}

          <p className="flex items-start gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-2 text-[0.625rem] leading-relaxed text-muted-foreground">
            <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            SMS one-time-code verification is coming soon. For now your name is reserved instantly so you can play
            straight away.
          </p>
        </form>

        {/* Roster */}
        <div className="flex flex-col bg-card p-4">
          <p className="label-caps mb-2 text-muted-foreground">Registered players</p>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading roster…</p>
          ) : players.length === 0 ? (
            <p className="text-xs text-muted-foreground">No one yet — be the first to register.</p>
          ) : (
            <ul className="flex flex-wrap content-start gap-1.5 overflow-y-auto">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 text-xs text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${p.phoneVerified ? "bg-accent" : "bg-muted-foreground/50"}`}
                  />
                  {p.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-auto pt-3 text-[0.625rem] text-muted-foreground">
            Pick two of these names in the chess board below to play together — no phone numbers shared.
          </p>
        </div>
      </div>
    </Panel>
  )
}
