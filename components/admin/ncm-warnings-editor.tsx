"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Check, ExternalLink, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import {
  DEFAULT_NCM_WARNINGS,
  EMIRATE_NAMES,
  WARN_LEVELS,
  type NcmWarning,
  type WarnLevel,
} from "@/lib/ncm-warnings"
import { cn } from "@/lib/utils"

const LEVEL_TONE: Record<WarnLevel, string> = {
  green: "border-alert-green/50 text-alert-green",
  yellow: "border-alert-yellow/60 text-alert-yellow",
  orange: "border-alert-orange/60 text-alert-orange",
  red: "border-alert-red/60 text-alert-red",
}

const LEVEL_LABEL: Record<WarnLevel, string> = {
  green: "Advisory",
  yellow: "Be Aware",
  orange: "Be Prepared",
  red: "Take Action",
}

function blankWarning(): NcmWarning {
  return {
    id: `ncm-${Date.now()}`,
    type: "Fog",
    level: "yellow",
    emirates: [],
    headline: "",
    description: "",
    from: "",
    to: "",
  }
}

/**
 * Admin editor for the official NCM warnings bulletin. Loads the live list from
 * /api/ncm-warnings (DB-backed) and saves admin edits back. Because the public
 * warnings map polls the same endpoint, a save here propagates to every open
 * session within a minute — no code change or redeploy needed.
 */
export function NcmWarningsEditor() {
  const { data, mutate } = useSWR<{ warnings: NcmWarning[] }>(
    "/api/ncm-warnings",
    (url: string) => fetch(url).then((r) => r.json()),
  )

  const [warnings, setWarnings] = useState<NcmWarning[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed local edit state from the server list once it arrives (and when it changes
  // externally) — but never clobber unsaved local edits.
  useEffect(() => {
    if (data?.warnings && !dirty) setWarnings(data.warnings)
  }, [data, dirty])

  function edit(index: number, patch: Partial<NcmWarning>) {
    setSaved(false)
    setDirty(true)
    setWarnings((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)))
  }

  function toggleEmirate(index: number, name: string) {
    setSaved(false)
    setDirty(true)
    setWarnings((prev) =>
      prev.map((w, i) => {
        if (i !== index) return w
        const has = w.emirates.includes(name)
        return { ...w, emirates: has ? w.emirates.filter((e) => e !== name) : [...w.emirates, name] }
      }),
    )
  }

  function addWarning() {
    setSaved(false)
    setDirty(true)
    setWarnings((prev) => [...prev, blankWarning()])
  }

  function removeWarning(index: number) {
    setSaved(false)
    setDirty(true)
    setWarnings((prev) => prev.filter((_, i) => i !== index))
  }

  function resetSeed() {
    setSaved(false)
    setDirty(true)
    setWarnings(DEFAULT_NCM_WARNINGS.map((w) => ({ ...w, emirates: [...w.emirates] })))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/ncm-warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warnings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Save failed")
      setWarnings(json.warnings as NcmWarning[])
      setDirty(false)
      setSaved(true)
      mutate(json, { revalidate: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-alert-yellow" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">NCM official warnings</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://www.ncm.gov.ae/maps-warnings?lang=en"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open NCM
          </a>
          <button
            type="button"
            onClick={resetSeed}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset to seed
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              dirty
                ? "bg-accent text-accent-foreground hover:opacity-90"
                : "border border-border text-muted-foreground",
            )}
          >
            {saved ? <Check className="h-3 w-3" aria-hidden="true" /> : <Save className="h-3 w-3" aria-hidden="true" />}
            {saving ? "Saving…" : saved ? "Saved" : "Save & publish"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Mirror the current bulletin from ncm.gov.ae. NCM offers no public feed, so keep this in sync manually — saving
        publishes instantly to the live warnings map for every visitor and combines with the Open-Meteo timeline.
      </p>

      {error ? (
        <p className="mt-3 rounded-md border border-alert-red/50 bg-alert-red/10 px-3 py-2 text-xs font-medium text-alert-red">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        {warnings.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No active NCM warnings. Add one to mirror the current bulletin, or leave empty to show none.
          </p>
        ) : null}

        {warnings.map((w, i) => (
          <div key={w.id} className={cn("rounded-lg border bg-background/40 p-4", LEVEL_TONE[w.level])}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Type</span>
                <input
                  value={w.type}
                  onChange={(e) => edit(i, { type: e.target.value })}
                  placeholder="Fog"
                  className={cn(inputClass, "w-32")}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Level</span>
                <select
                  value={w.level}
                  onChange={(e) => edit(i, { level: e.target.value as WarnLevel })}
                  className={cn(inputClass, "w-40")}
                >
                  {WARN_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl.charAt(0).toUpperCase() + lvl.slice(1)} · {LEVEL_LABEL[lvl]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">From</span>
                <input
                  type="datetime-local"
                  value={w.from}
                  onChange={(e) => edit(i, { from: e.target.value })}
                  className={cn(inputClass, "w-52")}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">To</span>
                <input
                  type="datetime-local"
                  value={w.to}
                  onChange={(e) => edit(i, { to: e.target.value })}
                  className={cn(inputClass, "w-52")}
                />
              </label>
              <button
                type="button"
                onClick={() => removeWarning(i)}
                aria-label={`Remove ${w.type} warning`}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Headline</span>
              <input
                value={w.headline}
                onChange={(e) => edit(i, { headline: e.target.value })}
                placeholder="Fog / low visibility"
                className={inputClass}
              />
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                Description
              </span>
              <textarea
                value={w.description}
                onChange={(e) => edit(i, { description: e.target.value })}
                rows={2}
                placeholder="A chance of fog formation with a deterioration in horizontal visibility…"
                className={cn(inputClass, "resize-y leading-relaxed")}
              />
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                Affected emirates
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EMIRATE_NAMES.map((name) => {
                  const on = w.emirates.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleEmirate(i, name)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border text-muted-foreground hover:bg-background/60",
                      )}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addWarning}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add warning
        </button>
      </div>
    </section>
  )
}
