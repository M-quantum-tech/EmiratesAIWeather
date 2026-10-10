"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useSWRConfig } from "swr"
import { Check, ExternalLink, LogIn, Send, X } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import type { SiteKey, SiteReadings } from "@/lib/escalation"
import { GHAITH_FEEDS } from "@/lib/ghaith-mirror"

type Draft = Record<keyof SiteReadings, string>

const FIELDS: { key: keyof SiteReadings; label: string; unit: string }[] = [
  { key: "windMs", label: "Wind", unit: "m/s" },
  { key: "gustMs", label: "Gust", unit: "m/s" },
  { key: "rainMm", label: "Rain", unit: "mm" },
  { key: "cloudPct", label: "Cloud", unit: "%" },
]

const SITES: { key: SiteKey; label: string }[] = [
  { key: "atSite", label: "AWS Wind · At site" },
  { key: "farSite", label: "COSMO Wind · Far site" },
]

function toDraft(r: SiteReadings | undefined): Draft {
  const f = (n: number | undefined) => (n == null || !Number.isFinite(n) ? "" : String(Math.round(n * 10) / 10))
  return { windMs: f(r?.windMs), gustMs: f(r?.gustMs), rainMm: f(r?.rainMm), cloudPct: f(r?.cloudPct) }
}

/**
 * Station-side Ghaith mirror push. Signed-in users can read the values off Ghaith
 * (#aws-wind / #cosmo-uae-wind) and push them; guests only see a sign-in prompt.
 */
export function StationMirrorPush({
  readings,
  source,
}: {
  readings: Record<SiteKey, SiteReadings>
  source: Record<SiteKey, "ghaith" | "grid">
}) {
  const { data: session, isPending } = useSession()
  const pathname = usePathname()
  const { mutate } = useSWRConfig()
  const [open, setOpen] = useState<SiteKey | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(undefined))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<SiteKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggle(key: SiteKey) {
    setError(null)
    if (open === key) return setOpen(null)
    setDraft(toDraft(readings[key]))
    setOpen(key)
  }

  async function push(key: SiteKey) {
    const values = Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key] || 0)]))
    if (Object.values(values).some((v) => !Number.isFinite(v) || v < 0)) {
      setError("Enter positive numbers only")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/ghaith-mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: { ...values, observedAt: new Date().toISOString() } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Push failed")
      await mutate("/api/ghaith-mirror")
      setDone(key)
      setOpen(null)
      setTimeout(() => setDone(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed")
    } finally {
      setBusy(false)
    }
  }

  if (isPending) return null

  if (!session?.user) {
    return (
      <a
        href={`/sign-in?redirect=${encodeURIComponent(pathname || "/")}`}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogIn className="h-3 w-3" aria-hidden="true" />
        Sign in to push to mirror
      </a>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Push Ghaith wind to mirror">
        {SITES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            aria-expanded={open === s.key}
            aria-controls="station-mirror-form"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              open === s.key && "ring-2 ring-accent/40 ring-offset-2 ring-offset-background",
            )}
          >
            {done === s.key ? <Check className="h-3 w-3" aria-hidden="true" /> : <Send className="h-3 w-3" aria-hidden="true" />}
            {done === s.key ? "Mirrored" : s.label}
            <span
              className={cn(
                "ml-0.5 h-1.5 w-1.5 rounded-full",
                source[s.key] === "ghaith" ? "bg-alert-green" : "bg-alert-orange",
              )}
              aria-label={source[s.key] === "ghaith" ? "mirror live" : "grid fallback"}
            />
          </button>
        ))}
      </div>

      {open ? (
        <form
          id="station-mirror-form"
          onSubmit={(e) => {
            e.preventDefault()
            push(open)
          }}
          className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-foreground">
              Push to mirror · {SITES.find((s) => s.key === open)?.label}
            </span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <a
            href={GHAITH_FEEDS[open].url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[0.6875rem] text-accent hover:underline"
          >
            Read values on {GHAITH_FEEDS[open].label}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                <span className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    required
                    value={draft[f.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 pr-10 font-mono text-sm text-foreground outline-none focus:border-accent"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[0.625rem] text-muted-foreground">
                    {f.unit}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {error ? <p className="text-xs text-alert-red">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Send className="h-3 w-3" aria-hidden="true" />
            {busy ? "Pushing…" : "Push to mirror"}
          </button>
        </form>
      ) : null}
    </div>
  )
}
