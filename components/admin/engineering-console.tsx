"use client"

import { useState } from "react"
import { BellRing, Check, RotateCcw, Save, Square, Volume2 } from "lucide-react"
import { DEFAULT_RULES, ESCALATION_LEVELS, type EscalationRule } from "@/lib/escalation"
import { playBuzzerTest, stopBuzzerTest } from "@/lib/escalation-buzzer"
import type { AlertLevel } from "@/lib/weather"
import { cn } from "@/lib/utils"

const LEVEL_META: Record<AlertLevel, { name: string; dot: string; ring: string; text: string }> = {
  green: { name: "Green", dot: "bg-alert-green", ring: "border-alert-green/40 hover:bg-alert-green/10", text: "text-alert-green" },
  yellow: { name: "Yellow", dot: "bg-alert-yellow", ring: "border-alert-yellow/40 hover:bg-alert-yellow/10", text: "text-alert-yellow" },
  orange: { name: "Orange", dot: "bg-alert-orange", ring: "border-alert-orange/40 hover:bg-alert-orange/10", text: "text-alert-orange" },
  red: { name: "Red", dot: "bg-alert-red", ring: "border-alert-red/50 hover:bg-alert-red/10", text: "text-alert-red" },
}

export function EngineeringConsole({ initialRules }: { initialRules: EscalationRule[] }) {
  const [rules, setRules] = useState<EscalationRule[]>(initialRules)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<AlertLevel | null>(null)

  function update(level: AlertLevel, field: keyof EscalationRule, value: string) {
    setSaved(false)
    setRules((prev) => prev.map((r) => (r.level === level ? { ...r, [field]: value } : r)))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setRules(DEFAULT_RULES.map((r) => ({ ...r })))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/escalation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setRules(data.rules as EscalationRule[])
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function test(level: AlertLevel) {
    playBuzzerTest(level)
    setTesting(level)
    window.setTimeout(() => setTesting((cur) => (cur === level ? null : cur)), 2400)
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Buzzer test bench */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">Buzzer test bench</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Preview the level-tuned alarm for each escalation tier. Each button plays the exact tone the live banner
          sounds when it reaches that level.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ESCALATION_LEVELS.map((level) => {
            const meta = LEVEL_META[level]
            const active = testing === level
            return (
              <button
                key={level}
                type="button"
                onClick={() => test(level)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border bg-background/40 px-4 py-3 text-left transition-colors",
                  meta.ring,
                  active && "ring-2 ring-inset",
                  active && meta.text,
                )}
                aria-label={`Test ${meta.name} buzzer`}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full", meta.dot)} aria-hidden="true" />
                  <span className={cn("font-mono text-xs font-bold uppercase tracking-wide", meta.text)}>{meta.name}</span>
                </span>
                {active ? (
                  <Volume2 className={cn("h-4 w-4 animate-pulse", meta.text)} aria-hidden="true" />
                ) : (
                  <BellRing className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={stopBuzzerTest}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
        >
          <Square className="h-3 w-3" aria-hidden="true" />
          Stop tone
        </button>
      </section>

      {/* Editable escalation rules */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">Escalation rules</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetDefaults}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saved ? <Check className="h-3 w-3" aria-hidden="true" /> : <Save className="h-3 w-3" aria-hidden="true" />}
              {saving ? "Saving…" : saved ? "Saved" : "Save rules"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit the trigger criteria, proximity band and data sources for each tier. Saved rules apply immediately to the
          live warning banner across the app.
        </p>
        {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

        <div className="mt-4 flex flex-col gap-4">
          {rules.map((rule) => {
            const meta = LEVEL_META[rule.level]
            return (
              <div key={rule.level} className="rounded-lg border border-border/70 bg-background/30 p-4">
                <div className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full", meta.dot)} aria-hidden="true" />
                  <span className={cn("font-mono text-xs font-bold uppercase tracking-wide", meta.text)}>{meta.name}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Tier label" value={rule.label} onChange={(v) => update(rule.level, "label", v)} />
                  <Field label="Proximity band" value={rule.km} onChange={(v) => update(rule.level, "km", v)} />
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  <span className="label-caps text-muted-foreground">Trigger criteria</span>
                  <textarea
                    value={rule.triggers}
                    onChange={(e) => update(rule.level, "triggers", e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  />
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  <Field label="Data sources" value={rule.sources} onChange={(v) => update(rule.level, "sources", v)} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
    </label>
  )
}
