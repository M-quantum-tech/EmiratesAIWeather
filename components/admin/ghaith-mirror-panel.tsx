"use client"

import { useState } from "react"
import { Check, ExternalLink, Radio, Send, Trash2 } from "lucide-react"
import { SITE_KEYS, type SiteKey, type SiteReadings } from "@/lib/escalation"
import { GHAITH_FEEDS, isFresh, type GhaithMirror } from "@/lib/ghaith-mirror"

type Draft = Record<keyof SiteReadings, string>
const FIELDS: { key: keyof SiteReadings; label: string; unit: string }[] = [
  { key: "windMs", label: "Wind speed", unit: "m/s" },
  { key: "gustMs", label: "Wind gust", unit: "m/s" },
  { key: "rainMm", label: "Rainfall", unit: "mm" },
  { key: "cloudPct", label: "Cloud cover", unit: "%" },
]
const SITE_TITLE: Record<SiteKey, string> = { atSite: "At site", farSite: "Far site" }

function toDraft(r: SiteReadings | null | undefined): Draft {
  return {
    windMs: r ? String(r.windMs) : "",
    gustMs: r ? String(r.gustMs) : "",
    rainMm: r ? String(r.rainMm) : "",
    cloudPct: r ? String(r.cloudPct) : "",
  }
}

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

export function GhaithMirrorPanel({
  mirror,
  source,
  relayEnabled,
  onPushed,
}: {
  mirror: GhaithMirror | null
  source: Record<SiteKey, "ghaith" | "grid">
  relayEnabled: boolean
  onPushed: (m: GhaithMirror) => void
}) {
  const [drafts, setDrafts] = useState<Record<SiteKey, Draft>>(() => ({
    atSite: toDraft(mirror?.atSite),
    farSite: toDraft(mirror?.farSite),
  }))
  const [ttl, setTtl] = useState(String(mirror?.ttlMin ?? 15))
  const [busy, setBusy] = useState<SiteKey | "ttl" | null>(null)
  const [done, setDone] = useState<SiteKey | "ttl" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function push(body: Record<string, unknown>, tag: SiteKey | "ttl") {
    setBusy(tag)
    setError(null)
    try {
      const res = await fetch("/api/ghaith-mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Push failed")
      onPushed(data.mirror)
      setDone(tag)
      setTimeout(() => setDone(null), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed")
    } finally {
      setBusy(null)
    }
  }

  function pushSite(key: SiteKey) {
    const d = drafts[key]
    push({ [key]: { ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(d[f.key] || 0)])), observedAt: new Date().toISOString() } }, key)
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            Ghaith mirror · primary source
          </h2>
        </div>
        <span
          className={`rounded-md border px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${
            relayEnabled ? "border-alert-green/40 text-alert-green" : "border-border text-muted-foreground"
          }`}
        >
          {relayEnabled ? "Relay token active" : "Relay token not set"}
        </span>
      </div>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
        Ghaith has no public API and blocks server requests, so its values are mirrored indirectly. Read the values off Ghaith
        and push them here, or let a UAE-side relay POST them automatically. While a site&apos;s mirror is fresh, the Escalation
        panel, Wind Event Monitor and auto buzzer all use it. Once it goes stale, they fall back to the model grid.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {SITE_KEYS.map((key) => {
          const m = mirror?.[key] ?? null
          const fresh = mirror ? isFresh(m, mirror.ttlMin) : false
          return (
            <div key={key} className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="label-caps text-foreground">{SITE_TITLE[key]}</span>
                  <a
                    href={GHAITH_FEEDS[key].url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
                  >
                    {GHAITH_FEEDS[key].url.replace("https://", "")}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                    source[key] === "ghaith" ? "bg-alert-green/15 text-alert-green" : "bg-alert-orange/15 text-alert-orange"
                  }`}
                >
                  {source[key] === "ghaith" ? "Live · Ghaith" : "Fallback · grid"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {m ? `Last push ${ago(m.observedAt)} via ${m.via}${fresh ? "" : " · stale"}` : "No mirrored values yet"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="label-caps text-muted-foreground">{f.label}</span>
                    <span className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.1"
                        value={drafts[key][f.key]}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [key]: { ...d[key], [f.key]: e.target.value } }))
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 pr-11 font-mono text-sm text-foreground outline-none focus:border-accent"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                        {f.unit}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pushSite(key)}
                  disabled={busy != null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {done === key ? <Check className="h-3 w-3" aria-hidden="true" /> : <Send className="h-3 w-3" aria-hidden="true" />}
                  {busy === key ? "Pushing…" : done === key ? "Mirrored" : "Push to mirror"}
                </button>
                {m ? (
                  <button
                    type="button"
                    onClick={() => push({ [key]: null }, key)}
                    disabled={busy != null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Freshness window (min)</span>
          <input
            type="number"
            min={1}
            max={1440}
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            className="w-32 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={() => push({ ttlMin: Number(ttl) }, "ttl")}
          disabled={busy != null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background/60"
        >
          {done === "ttl" ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
          {done === "ttl" ? "Saved" : "Save window"}
        </button>
        <p className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-muted-foreground">
          Relay: POST /api/ghaith-mirror · Authorization: Bearer GHAITH_MIRROR_TOKEN · {"{ atSite: { windMs, gustMs, rainMm, cloudPct }, farSite: {...} }"}
        </p>
      </div>
    </section>
  )
}
