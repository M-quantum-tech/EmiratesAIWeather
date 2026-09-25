"use client"

import { useState } from "react"
import { BellRing, Check, Cloud, Compass, LineChart, Link2, MapPin, Plus, RotateCcw, Save, Square, Trash2, Volume2, Wind } from "lucide-react"
import {
  DEFAULT_CLOUD_SOURCE,
  DEFAULT_RULES,
  DEFAULT_TREND_SOURCES,
  DEFAULT_WIND_DIRECTION_SOURCE,
  DEFAULT_WIND_MONITOR,
  DEFAULT_WIND_SOURCE,
  ESCALATION_LEVELS,
  SITE_FACTOR_KEYS,
  SITE_FACTOR_META,
  SITE_SCOPE_LABELS,
  defaultSites,
  type CloudSourceConfig,
  type EscalationRule,
  type SeverityRange,
  type SiteConfig,
  type SiteFactorKey,
  type SiteScope,
  type SourceLink,
  type TierDeadbands,
  type TrendSourceGroup,
  type WindMonitorTier,
  type WindSourceConfig,
} from "@/lib/escalation"
import { playBuzzerTest, stopBuzzerTest } from "@/lib/escalation-buzzer"
import type { AlertLevel } from "@/lib/weather"
import { cn } from "@/lib/utils"

const LEVEL_META: Record<AlertLevel, { name: string; dot: string; ring: string; text: string }> = {
  green: { name: "Green", dot: "bg-alert-green", ring: "border-alert-green/40 hover:bg-alert-green/10", text: "text-alert-green" },
  yellow: { name: "Yellow", dot: "bg-alert-yellow", ring: "border-alert-yellow/40 hover:bg-alert-yellow/10", text: "text-alert-yellow" },
  orange: { name: "Orange", dot: "bg-alert-orange", ring: "border-alert-orange/40 hover:bg-alert-orange/10", text: "text-alert-orange" },
  red: { name: "Red", dot: "bg-alert-red", ring: "border-alert-red/50 hover:bg-alert-red/10", text: "text-alert-red" },
}

let uid = 0
const nextId = () => `wm-${Date.now().toString(36)}-${(uid++).toString(36)}`

export function EngineeringConsole({
  initialRules,
  initialWindMonitor,
  initialWindSource,
  initialWindDirectionSource,
  initialCloudSource,
  initialTrendSources,
}: {
  initialRules: EscalationRule[]
  initialWindMonitor: WindMonitorTier[]
  initialWindSource: WindSourceConfig
  initialWindDirectionSource: WindSourceConfig
  initialCloudSource: CloudSourceConfig
  initialTrendSources: TrendSourceGroup[]
}) {
  const [rules, setRules] = useState<EscalationRule[]>(initialRules)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<AlertLevel | null>(null)

  function update(level: AlertLevel, field: "label" | "km" | "triggers", value: string) {
    setSaved(false)
    setRules((prev) => prev.map((r) => (r.level === level ? { ...r, [field]: value } : r)))
  }

  function updateDeadband(level: AlertLevel, field: keyof TierDeadbands, value: string) {
    setSaved(false)
    const n = value === "" ? 0 : Number(value)
    if (!Number.isFinite(n) || n < 0) return
    setRules((prev) =>
      prev.map((r) => (r.level === level ? { ...r, deadbands: { ...r.deadbands, [field]: n } } : r)),
    )
  }

  function mapSite(
    level: AlertLevel,
    scope: SiteScope,
    fn: (site: SiteConfig) => SiteConfig,
  ) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) =>
        r.level === level
          ? { ...r, sites: r.sites.map((s) => (s.scope === scope ? fn(s) : s)) }
          : r,
      ),
    )
  }

  function updateSiteKm(level: AlertLevel, scope: SiteScope, km: string) {
    mapSite(level, scope, (s) => ({ ...s, km }))
  }

  function updateRange(
    level: AlertLevel,
    scope: SiteScope,
    factor: SiteFactorKey,
    id: string,
    patch: Partial<SeverityRange>,
  ) {
    mapSite(level, scope, (s) => ({
      ...s,
      [factor]: s[factor].map((rng) => (rng.id === id ? { ...rng, ...patch } : rng)),
    }))
  }

  function addRange(level: AlertLevel, scope: SiteScope, factor: SiteFactorKey) {
    mapSite(level, scope, (s) => {
      const last = s[factor][s[factor].length - 1]
      const min = last ? (last.max ?? last.min) : 0
      const next: SeverityRange = { id: `${level}-${scope}-${factor}-${Date.now()}`, min, max: null, severity: "" }
      return { ...s, [factor]: [...s[factor], next] }
    })
  }

  function removeRange(level: AlertLevel, scope: SiteScope, factor: SiteFactorKey, id: string) {
    mapSite(level, scope, (s) => ({ ...s, [factor]: s[factor].filter((rng) => rng.id !== id) }))
  }

  function updateSiteSource(level: AlertLevel, scope: SiteScope, index: number, patch: Partial<SourceLink>) {
    mapSite(level, scope, (s) => ({
      ...s,
      sources: s.sources.map((src, i) => (i === index ? { ...src, ...patch } : src)),
    }))
  }

  function addSiteSource(level: AlertLevel, scope: SiteScope) {
    mapSite(level, scope, (s) => ({ ...s, sources: [...s.sources, { label: "", url: "" }] }))
  }

  function removeSiteSource(level: AlertLevel, scope: SiteScope, index: number) {
    mapSite(level, scope, (s) => ({ ...s, sources: s.sources.filter((_, i) => i !== index) }))
  }

  function resetSites(level: AlertLevel) {
    setSaved(false)
    setRules((prev) => prev.map((r) => (r.level === level ? { ...r, sites: defaultSites(level) } : r)))
  }

  function updateSource(level: AlertLevel, index: number, patch: Partial<SourceLink>) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) =>
        r.level === level
          ? { ...r, sourceLinks: r.sourceLinks.map((s, i) => (i === index ? { ...s, ...patch } : s)) }
          : r,
      ),
    )
  }

  function addSource(level: AlertLevel) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) => (r.level === level ? { ...r, sourceLinks: [...r.sourceLinks, { label: "", url: "" }] } : r)),
    )
  }

  function removeSource(level: AlertLevel, index: number) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) => (r.level === level ? { ...r, sourceLinks: r.sourceLinks.filter((_, i) => i !== index) } : r)),
    )
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setRules(
      DEFAULT_RULES.map((r) => ({
        ...r,
        sourceLinks: r.sourceLinks.map((s) => ({ ...s })),
        deadbands: { ...r.deadbands },
        sites: defaultSites(r.level),
      })),
    )
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // Keep the plain-text summary in sync with the structured links before saving.
      const payload = rules.map((r) => ({
        ...r,
        sources: r.sourceLinks.map((s) => s.label || s.url || "").filter(Boolean).join(" · "),
      }))
      const res = await fetch("/api/escalation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: payload }),
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

      {/* Wind Event Monitor thresholds */}
      <WindMonitorEditor initialTiers={initialWindMonitor} />

      {/* Wind speed & gust source link (NCM AWS wind) */}
      <WindSourceEditor initialSource={initialWindSource} />

      {/* Wind direction source link (NCM COSMO-UAE wind) — feeds the 0–360° scanner */}
      <WindDirectionSourceEditor initialSource={initialWindDirectionSource} />

      {/* NCM cloud / satellite source link (intensifying clouds) */}
      <CloudSourceEditor initialSource={initialCloudSource} />

      {/* Live Trend + AI Projection reference sources (per panel) */}
      <TrendSourceEditor initialGroups={initialTrendSources} />

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
          Edit the trigger criteria, proximity band and data sources for each tier. Add as many data sources as you
          need — paste a link and it renders as a live, clickable source on the warning banner. Saved rules apply
          immediately across the app.
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
                  <Field label="Proximity band (KM range)" value={rule.km} onChange={(v) => update(rule.level, "km", v)} />
                </div>

                {/* Dead bands — hysteresis gates paired with the KM range above */}
                <div className="mt-3 flex flex-col gap-2">
                  <span className="label-caps text-muted-foreground">
                    Dead bands · active hysteresis — tier holds until readings drop past these margins
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberField
                      label="Wind speed"
                      unit="m/s"
                      value={rule.deadbands.windMs}
                      onChange={(v) => updateDeadband(rule.level, "windMs", v)}
                    />
                    <NumberField
                      label="Wind gust"
                      unit="m/s"
                      value={rule.deadbands.gustMs}
                      onChange={(v) => updateDeadband(rule.level, "gustMs", v)}
                    />
                    <NumberField
                      label="Wind direction"
                      unit="°"
                      value={rule.deadbands.directionDeg}
                      onChange={(v) => updateDeadband(rule.level, "directionDeg", v)}
                    />
                    <NumberField
                      label="Rainfall"
                      unit="mm"
                      value={rule.deadbands.rainMm}
                      onChange={(v) => updateDeadband(rule.level, "rainMm", v)}
                    />
                  </div>
                </div>
                {/* At-site / Far-site detection combinations */}
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-muted-foreground">
                      Site detection · At site + Far site combination
                    </span>
                    <button
                      type="button"
                      onClick={() => resetSites(rule.level)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-background/60"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Reset sites
                    </button>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {rule.sites.map((site) => (
                      <SiteEditor
                        key={site.scope}
                        level={rule.level}
                        site={site}
                        onKm={(v) => updateSiteKm(rule.level, site.scope, v)}
                        onRange={(factor, id, patch) => updateRange(rule.level, site.scope, factor, id, patch)}
                        onAddRange={(factor) => addRange(rule.level, site.scope, factor)}
                        onRemoveRange={(factor, id) => removeRange(rule.level, site.scope, factor, id)}
                        onSource={(i, patch) => updateSiteSource(rule.level, site.scope, i, patch)}
                        onAddSource={() => addSiteSource(rule.level, site.scope)}
                        onRemoveSource={(i) => removeSiteSource(rule.level, site.scope, i)}
                      />
                    ))}
                  </div>
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

                {/* Data sources — repeatable label + optional link */}
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-muted-foreground">Data sources</span>
                    <button
                      type="button"
                      onClick={() => addSource(rule.level)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-background/60"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      Add source
                    </button>
                  </div>
                  {rule.sourceLinks.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70">No data sources yet — add one.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {rule.sourceLinks.map((src, i) => (
                        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={src.label}
                            placeholder="Source name (e.g. NCM Al Bahar)"
                            onChange={(e) => updateSource(rule.level, i, { label: e.target.value })}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent sm:w-2/5"
                          />
                          <div className="flex flex-1 items-center gap-2">
                            <span className="relative flex-1">
                              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                              <input
                                type="url"
                                inputMode="url"
                                value={src.url ?? ""}
                                placeholder="https://link-to-feed (optional)"
                                onChange={(e) => updateSource(rule.level, i, { url: e.target.value })}
                                className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
                              />
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSource(rule.level, i)}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
                              aria-label="Remove data source"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function WindMonitorEditor({ initialTiers }: { initialTiers: WindMonitorTier[] }) {
  const [tiers, setTiers] = useState<WindMonitorTier[]>(initialTiers.map((t) => ({ ...t })))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(id: string, patch: Partial<WindMonitorTier>) {
    setSaved(false)
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function addTier() {
    setSaved(false)
    setTiers((prev) => [...prev, { id: nextId(), minSpeed: 10, level: "yellow", label: "High", note: "Level 2 warning" }])
  }

  function removeTier(id: string) {
    setSaved(false)
    setTiers((prev) => prev.filter((t) => t.id !== id))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setTiers(DEFAULT_WIND_MONITOR.map((t) => ({ ...t })))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/wind-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setTiers((data.tiers as WindMonitorTier[]).map((t) => ({ ...t })))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wind className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">Wind Event Monitor</h2>
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
            {saving ? "Saving…" : saved ? "Saved" : "Save thresholds"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Wind-speed thresholds that drive the live Wind Event Monitor panel. When on-site sustained wind reaches a
        threshold, that tier becomes the active event. Fully editable for future parameter changes.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 flex flex-col gap-3">
        <div className="hidden gap-3 px-1 sm:grid sm:grid-cols-[7rem_8rem_1fr_1fr_2.25rem]">
          <span className="label-caps text-muted-foreground">Wind ≥ (m/s)</span>
          <span className="label-caps text-muted-foreground">Alert level</span>
          <span className="label-caps text-muted-foreground">Severity label</span>
          <span className="label-caps text-muted-foreground">Note</span>
          <span className="sr-only">Remove</span>
        </div>
        {tiers.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">No thresholds yet — add one.</p>
        ) : (
          tiers.map((tier) => {
            const meta = LEVEL_META[tier.level]
            return (
              <div
                key={tier.id}
                className="grid items-center gap-3 rounded-lg border border-border/70 bg-background/30 p-3 sm:grid-cols-[7rem_8rem_1fr_1fr_2.25rem] sm:border-0 sm:bg-transparent sm:p-1"
              >
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={0.5}
                  value={tier.minSpeed}
                  onChange={(e) => update(tier.id, { minSpeed: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground outline-none focus:border-accent"
                  aria-label="Wind threshold in metres per second"
                />
                <span className="relative">
                  <span className={cn("pointer-events-none absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full", meta.dot)} aria-hidden="true" />
                  <select
                    value={tier.level}
                    onChange={(e) => update(tier.id, { level: e.target.value as AlertLevel })}
                    className="w-full appearance-none rounded-md border border-border bg-background py-2 pl-7 pr-3 text-sm text-foreground outline-none focus:border-accent"
                    aria-label="Alert level"
                  >
                    {ESCALATION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {LEVEL_META[lvl].name}
                      </option>
                    ))}
                  </select>
                </span>
                <input
                  type="text"
                  value={tier.label}
                  placeholder="High · High · High"
                  onChange={(e) => update(tier.id, { label: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  aria-label="Severity label"
                />
                <input
                  type="text"
                  value={tier.note}
                  placeholder="Level 3 alert"
                  onChange={(e) => update(tier.id, { note: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  aria-label="Operator note"
                />
                <button
                  type="button"
                  onClick={() => removeTier(tier.id)}
                  className="grid h-9 w-9 shrink-0 place-items-center justify-self-end rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
                  aria-label="Remove threshold"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )
          })
        )}
        <button
          type="button"
          onClick={addTier}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add threshold
        </button>
      </div>
    </section>
  )
}

function NumberField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string
  unit: string
  value: number
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps text-muted-foreground">{label}</span>
      <span className="relative">
        <input
          type="number"
          min={0}
          step={0.1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background py-2 pl-3 pr-12 text-sm tabular-nums text-foreground outline-none focus:border-accent"
          aria-label={`${label} dead band in ${unit}`}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {unit}
        </span>
      </span>
    </label>
  )
}

function CloudSourceEditor({ initialSource }: { initialSource: CloudSourceConfig }) {
  const [source, setSource] = useState<CloudSourceConfig>({ ...initialSource })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<CloudSourceConfig>) {
    setSaved(false)
    setSource((prev) => ({ ...prev, ...patch }))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setSource({ ...DEFAULT_CLOUD_SOURCE })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/cloud-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setSource({ ...(data.source as CloudSourceConfig) })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            NCM cloud / satellite source
          </h2>
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
            {saving ? "Saving…" : saved ? "Saved" : "Save source"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Cloud / satellite feed that tracks intensifying convection. Each tier&apos;s KM proximity band is read against
        this imagery. Defaults to the NCM Ghaith viewer — paste any official NCM cloud link and it becomes the
        connected source on the live banner.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_3fr]">
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Source name</span>
          <input
            type="text"
            value={source.label}
            placeholder={DEFAULT_CLOUD_SOURCE.label}
            onChange={(e) => update({ label: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Source link (paste NCM cloud link)</span>
          <span className="relative">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="url"
              inputMode="url"
              value={source.url}
              placeholder={DEFAULT_CLOUD_SOURCE.url}
              onChange={(e) => update({ url: e.target.value })}
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </span>
        </label>
      </div>
    </section>
  )
}

function WindSourceEditor({ initialSource }: { initialSource: WindSourceConfig }) {
  const [source, setSource] = useState<WindSourceConfig>({ ...initialSource })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<WindSourceConfig>) {
    setSaved(false)
    setSource((prev) => ({ ...prev, ...patch }))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setSource({ ...DEFAULT_WIND_SOURCE })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/wind-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setSource({ ...(data.source as WindSourceConfig) })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            Wind speed & gust source
          </h2>
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
            {saving ? "Saving…" : saved ? "Saved" : "Save source"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Feed that every live Wind Speed & Wind Gust readout links back to. Defaults to the NCM Ghaith COSMO-UAE
        surface-wind viewer. Paste any official wind link and it becomes the connected source across the dashboard.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_3fr]">
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Source name</span>
          <input
            type="text"
            value={source.label}
            placeholder={DEFAULT_WIND_SOURCE.label}
            onChange={(e) => update({ label: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Source link</span>
          <span className="relative">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="url"
              inputMode="url"
              value={source.url}
              placeholder={DEFAULT_WIND_SOURCE.url}
              onChange={(e) => update({ url: e.target.value })}
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </span>
        </label>
      </div>
    </section>
  )
}

function SiteEditor({
  level,
  site,
  onKm,
  onRange,
  onAddRange,
  onRemoveRange,
  onSource,
  onAddSource,
  onRemoveSource,
}: {
  level: AlertLevel
  site: SiteConfig
  onKm: (value: string) => void
  onRange: (factor: SiteFactorKey, id: string, patch: Partial<SeverityRange>) => void
  onAddRange: (factor: SiteFactorKey) => void
  onRemoveRange: (factor: SiteFactorKey, id: string) => void
  onSource: (index: number, patch: Partial<SourceLink>) => void
  onAddSource: () => void
  onRemoveSource: (index: number) => void
}) {
  const meta = LEVEL_META[level]
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <MapPin className={cn("h-3.5 w-3.5", meta.text)} aria-hidden="true" />
        <span className="font-mono text-xs font-bold uppercase tracking-wide text-foreground">
          {SITE_SCOPE_LABELS[site.scope]}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="label-caps text-muted-foreground">KM detection band</span>
        <input
          type="text"
          value={site.km}
          placeholder="e.g. 0–20 km"
          onChange={(e) => onKm(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </label>

      {SITE_FACTOR_KEYS.map((factor) => (
        <RangeEditor
          key={factor}
          factor={factor}
          ranges={site[factor]}
          onChange={(id, patch) => onRange(factor, id, patch)}
          onAdd={() => onAddRange(factor)}
          onRemove={(id) => onRemoveRange(factor, id)}
        />
      ))}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label-caps text-muted-foreground">Data source link</span>
          <button
            type="button"
            onClick={onAddSource}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-background/60"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add link
          </button>
        </div>
        {site.sources.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">No link yet — paste a source to fetch data from.</p>
        ) : (
          site.sources.map((src, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <input
                type="text"
                value={src.label}
                placeholder="Source name (e.g. NCM AWS Wind)"
                onChange={(e) => onSource(i, { label: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              />
              <div className="flex items-center gap-2">
                <span className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="url"
                    inputMode="url"
                    value={src.url ?? ""}
                    placeholder="https://link-to-feed"
                    onChange={(e) => onSource(i, { url: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSource(i)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
                  aria-label="Remove data source"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RangeEditor({
  factor,
  ranges,
  onChange,
  onAdd,
  onRemove,
}: {
  factor: SiteFactorKey
  ranges: SeverityRange[]
  onChange: (id: string, patch: Partial<SeverityRange>) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const { label, unit } = SITE_FACTOR_META[factor]
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-background/30 p-2.5">
      <div className="flex items-center justify-between">
        <span className="label-caps text-muted-foreground">
          {label} <span className="font-normal normal-case text-muted-foreground/70">({unit})</span> severity ranges
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-background/60"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Range
        </button>
      </div>
      {ranges.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">No ranges — add one.</p>
      ) : (
        ranges.map((rng) => (
          <div key={rng.id} className="grid grid-cols-[1fr_1fr_1.4fr_2rem] items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={0.5}
              value={rng.min}
              onChange={(e) => onChange(rng.id, { min: Number(e.target.value) })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs tabular-nums text-foreground outline-none focus:border-accent"
              aria-label={`${label} minimum ${unit}`}
              placeholder="min"
            />
            <input
              type="number"
              min={0}
              step={0.5}
              value={rng.max ?? ""}
              onChange={(e) => onChange(rng.id, { max: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs tabular-nums text-foreground outline-none focus:border-accent"
              aria-label={`${label} maximum ${unit} (blank = and above)`}
              placeholder="max / ∞"
            />
            <input
              type="text"
              value={rng.severity}
              onChange={(e) => onChange(rng.id, { severity: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              aria-label={`${label} severity label`}
              placeholder="severity"
            />
            <button
              type="button"
              onClick={() => onRemove(rng.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
              aria-label={`Remove ${label} range`}
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ))
      )}
    </div>
  )
}

function WindDirectionSourceEditor({ initialSource }: { initialSource: WindSourceConfig }) {
  const [source, setSource] = useState<WindSourceConfig>({ ...initialSource })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<WindSourceConfig>) {
    setSaved(false)
    setSource((prev) => ({ ...prev, ...patch }))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setSource({ ...DEFAULT_WIND_DIRECTION_SOURCE })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/wind-direction-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setSource({ ...(data.source as WindSourceConfig) })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            Wind direction source
          </h2>
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
            {saving ? "Saving…" : saved ? "Saved" : "Save source"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Feed for the 0–360° wind-direction scanner. The scanner always cross-checks wind speed and direction together.
        Defaults to the NCM Ghaith COSMO-UAE wind viewer — paste any official wind-direction link and it becomes the
        connected source across the dashboard.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_3fr]">
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Source name</span>
          <input
            type="text"
            value={source.label}
            placeholder={DEFAULT_WIND_DIRECTION_SOURCE.label}
            onChange={(e) => update({ label: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps text-muted-foreground">Source link (paste NCM wind-direction link)</span>
          <span className="relative">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="url"
              inputMode="url"
              value={source.url}
              placeholder={DEFAULT_WIND_DIRECTION_SOURCE.url}
              onChange={(e) => update({ url: e.target.value })}
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </span>
        </label>
      </div>
    </section>
  )
}

function TrendSourceEditor({ initialGroups }: { initialGroups: TrendSourceGroup[] }) {
  const [groups, setGroups] = useState<TrendSourceGroup[]>(
    initialGroups.map((g) => ({ ...g, links: g.links.map((l) => ({ ...l })) })),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateLink(key: string, index: number, patch: Partial<SourceLink>) {
    setSaved(false)
    setGroups((prev) =>
      prev.map((g) =>
        g.key === key ? { ...g, links: g.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) } : g,
      ),
    )
  }

  function addLink(key: string) {
    setSaved(false)
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, links: [...g.links, { label: "", url: "" }] } : g)))
  }

  function removeLink(key: string, index: number) {
    setSaved(false)
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, links: g.links.filter((_, i) => i !== index) } : g)))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setGroups(DEFAULT_TREND_SOURCES.map((g) => ({ ...g, links: g.links.map((l) => ({ ...l })) })))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/trend-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setGroups((data.groups as TrendSourceGroup[]).map((g) => ({ ...g, links: g.links.map((l) => ({ ...l })) })))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            Live Trend + AI Projection sources
          </h2>
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
            {saving ? "Saving…" : saved ? "Saved" : "Save sources"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Assign the reference feeds behind each Live Trend panel — Temperature &amp; comfort, Wind &amp; air, Sky &amp;
        rainfall and Solar DNI. Add as many source rows as you need now, or leave rows ready to assign links in future.
        Paste a link and it renders as a live, clickable source.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col rounded-lg border border-border/70 bg-background/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wide text-foreground">{group.label}</span>
              <button
                type="button"
                onClick={() => addLink(group.key)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-background/60"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Add link
              </button>
            </div>
            {group.links.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground/70">No sources yet — add a row to assign later.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {group.links.map((src, i) => (
                  <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={src.label}
                      placeholder="Source name"
                      onChange={(e) => updateLink(group.key, i, { label: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent sm:w-2/5"
                    />
                    <div className="flex flex-1 items-center gap-2">
                      <span className="relative flex-1">
                        <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <input
                          type="url"
                          inputMode="url"
                          value={src.url ?? ""}
                          placeholder="https://link-to-feed (optional)"
                          onChange={(e) => updateLink(group.key, i, { url: e.target.value })}
                          className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLink(group.key, i)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
                        aria-label="Remove source"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
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
