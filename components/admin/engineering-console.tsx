"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { BellRing, Check, Cloud, Database, ExternalLink, FlaskConical, LineChart, Link2, Plus, Power, RotateCcw, Save, Square, Trash2, Volume2, Wind } from "lucide-react"
import {
  DEFAULT_AI_SOURCES,
  DEFAULT_CLOUD_SOURCE,
  DEFAULT_RULES,
  DEFAULT_SITE_CONFIG,
  DEFAULT_TREND_SOURCES,
  DEFAULT_WIND_MONITOR,
  DEFAULT_WIND_SOURCE,
  ESCALATION_LEVELS,
  SITE_KEYS,
  SITE_META,
  SITE_METRIC_KEYS,
  SITE_METRIC_META,
  evaluateSite,
  evaluateWindMonitor,
  type AiPredictionSource,
  type CloudSourceConfig,
  type EscalationRule,
  type MetricRange,
  type SiteConfig,
  type SiteKey,
  type SiteMetricKey,
  type SiteReadings,
  type SourceLink,
  type TierDeadbands,
  type TrendSourceGroup,
  type WindMonitorTier,
  type WindSourceConfig,
} from "@/lib/escalation"
import { playBuzzerTest, stopBuzzerTest } from "@/lib/escalation-buzzer"
import { ALERT_RADII_KM, offsetLocation, type AlertLevel, type WeatherPayload } from "@/lib/weather"
import { computeSiteReadings } from "@/lib/site-readings"
import { useWeather } from "@/components/weather/weather-provider"
import { cn } from "@/lib/utils"

async function weatherFetcher(url: string): Promise<WeatherPayload> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? "Reading failed.")
  }
  return response.json()
}

const LEVEL_META: Record<
  AlertLevel,
  { name: string; dot: string; ring: string; text: string; ringActive: string; border: string; fill: string }
> = {
  green: { name: "Green", dot: "bg-alert-green", ring: "border-alert-green/40 hover:bg-alert-green/10", text: "text-alert-green", ringActive: "ring-alert-green/50", border: "border-alert-green/40", fill: "bg-alert-green/10" },
  yellow: { name: "Yellow", dot: "bg-alert-yellow", ring: "border-alert-yellow/40 hover:bg-alert-yellow/10", text: "text-alert-yellow", ringActive: "ring-alert-yellow/50", border: "border-alert-yellow/40", fill: "bg-alert-yellow/10" },
  orange: { name: "Orange", dot: "bg-alert-orange", ring: "border-alert-orange/40 hover:bg-alert-orange/10", text: "text-alert-orange", ringActive: "ring-alert-orange/60", border: "border-alert-orange/50", fill: "bg-alert-orange/15" },
  red: { name: "Red", dot: "bg-alert-red", ring: "border-alert-red/50 hover:bg-alert-red/10", text: "text-alert-red", ringActive: "ring-alert-red/60", border: "border-alert-red/50", fill: "bg-alert-red/15" },
}

/**
 * Representative test readings per tier for the Simulator. Values are chosen to land in each
 * level's severity band so operators can preview the exact green → yellow → orange → red
 * cascade the live stations would produce, without waiting for real weather.
 */
const SIM_PRESETS: Record<AlertLevel, SiteReadings> = {
  green: { windMs: 6, gustMs: 9, rainMm: 0, cloudPct: 20 },
  yellow: { windMs: 15, gustMs: 20, rainMm: 3, cloudPct: 55 },
  orange: { windMs: 20, gustMs: 26, rainMm: 12, cloudPct: 70 },
  red: { windMs: 25, gustMs: 32, rainMm: 32, cloudPct: 90 },
}

let uid = 0
const nextId = () => `wm-${Date.now().toString(36)}-${(uid++).toString(36)}`

export function EngineeringConsole({
  initialRules,
  initialWindMonitor,
  initialWindSource,
  initialCloudSource,
  initialTrendSources,
  initialAiSources,
}: {
  initialRules: EscalationRule[]
  initialWindMonitor: WindMonitorTier[]
  initialWindSource: WindSourceConfig
  initialCloudSource: CloudSourceConfig
  initialTrendSources: TrendSourceGroup[]
  initialAiSources: AiPredictionSource[]
}) {
  const [rules, setRules] = useState<EscalationRule[]>(initialRules)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<AlertLevel | null>(null)
  // Simulator — when a level is active the At-site / Far-site indicators and the active tier
  // are driven from these test readings instead of the live stations, so operators can rehearse
  // the full green → red escalation on demand. null = live data.
  const [simLevel, setSimLevel] = useState<AlertLevel | null>(null)
  const [simValues, setSimValues] = useState<SiteReadings>({ ...SIM_PRESETS.green })

  // Live wiring — identical to the warning banner: the on-site station reading plus a
  // 50 km upwind ("far site") sample, both pushed through the shared computeSiteReadings
  // helper. Every tier's At-site / Far-site button is evaluated against these numbers with
  // the exact same evaluateSite() used on the public banner, so a range edited here lights
  // the same indicator here and on the station.
  const { payload } = useWeather()
  const farPoint = useMemo(
    () =>
      payload
        ? offsetLocation(
            payload.location.latitude,
            payload.location.longitude,
            payload.current.windDirection,
            ALERT_RADII_KM.yellow,
          )
        : null,
    [payload],
  )
  const farKey =
    farPoint && payload
      ? `/api/weather?lat=${farPoint.lat.toFixed(3)}&lon=${farPoint.lon.toFixed(3)}&units=${payload.units}`
      : null
  const { data: farData } = useSWR(farKey, weatherFetcher, {
    refreshInterval: 60 * 1000,
    keepPreviousData: true,
  })
  const siteReadings = useMemo<Record<SiteKey, SiteReadings>>(
    () => computeSiteReadings(payload?.units ?? "metric", payload?.current, farData?.current),
    [payload?.units, payload?.current, farData?.current],
  )
  const live = payload != null
  // When the Simulator is active, the test readings replace the live station numbers for both
  // sites so every downstream evaluator (evaluateSite + evaluateWindMonitor) lights the same
  // indicators it would from real data. Otherwise the live readings flow through untouched.
  const effectiveReadings = useMemo<Record<SiteKey, SiteReadings>>(
    () => (simLevel ? { atSite: { ...simValues }, farSite: { ...simValues } } : siteReadings),
    [simLevel, simValues, siteReadings],
  )
  const effectiveLive = live || simLevel != null
  // Wind Event Monitor trigger — evaluated against the effective on-site wind through the
  // same shared helper the banner uses. Below every alerting threshold it stays green;
  // once the wind reaches a tier it lights the At-site button red alongside the range check.
  const windEval = useMemo(
    () => evaluateWindMonitor(effectiveReadings.atSite.windMs, initialWindMonitor),
    [effectiveReadings.atSite.windMs, initialWindMonitor],
  )

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

  function updateSiteKm(level: AlertLevel, siteKey: SiteKey, value: string) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) => (r.level === level ? { ...r, [siteKey]: { ...r[siteKey], km: value } } : r)),
    )
  }

  function updateSiteSource(level: AlertLevel, siteKey: SiteKey, patch: Partial<SourceLink>) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) =>
        r.level === level ? { ...r, [siteKey]: { ...r[siteKey], source: { ...r[siteKey].source, ...patch } } } : r,
      ),
    )
  }

  function updateRange(
    level: AlertLevel,
    siteKey: SiteKey,
    metric: SiteMetricKey,
    index: number,
    patch: Partial<MetricRange>,
  ) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) => {
        if (r.level !== level) return r
        const site = r[siteKey]
        return {
          ...r,
          [siteKey]: { ...site, [metric]: site[metric].map((rg, i) => (i === index ? { ...rg, ...patch } : rg)) },
        }
      }),
    )
  }

  function addRange(level: AlertLevel, siteKey: SiteKey, metric: SiteMetricKey) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) => {
        if (r.level !== level) return r
        const site = r[siteKey]
        return { ...r, [siteKey]: { ...site, [metric]: [...site[metric], { min: 0, max: null, label: "" }] } }
      }),
    )
  }

  function removeRange(level: AlertLevel, siteKey: SiteKey, metric: SiteMetricKey, index: number) {
    setSaved(false)
    setRules((prev) =>
      prev.map((r) => {
        if (r.level !== level) return r
        const site = r[siteKey]
        return { ...r, [siteKey]: { ...site, [metric]: site[metric].filter((_, i) => i !== index) } }
      }),
    )
  }

  function cloneSite(site: SiteConfig): SiteConfig {
    return {
      ...site,
      windMs: site.windMs.map((r) => ({ ...r })),
      gustMs: site.gustMs.map((r) => ({ ...r })),
      rainMm: site.rainMm.map((r) => ({ ...r })),
      cloudPct: site.cloudPct.map((r) => ({ ...r })),
      source: { ...site.source },
    }
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setRules(
      DEFAULT_RULES.map((r) => ({
        ...r,
        sourceLinks: r.sourceLinks.map((s) => ({ ...s })),
        deadbands: { ...r.deadbands },
        atSite: cloneSite(DEFAULT_SITE_CONFIG[r.level].atSite),
        farSite: cloneSite(DEFAULT_SITE_CONFIG[r.level].farSite),
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

  function simulate(level: AlertLevel) {
    setSimLevel(level)
    setSimValues({ ...SIM_PRESETS[level] })
  }

  function updateSimValue(key: keyof SiteReadings, value: string) {
    const n = value === "" ? 0 : Number(value)
    if (!Number.isFinite(n) || n < 0) return
    // Editing a value implies a simulation is running — default to green if none is active yet.
    setSimLevel((cur) => cur ?? "green")
    setSimValues((prev) => ({ ...prev, [key]: n }))
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

      {/* Wind speed & gust source link (NCM COSMO-UAE wind) */}
      <WindSourceEditor initialSource={initialWindSource} />

      {/* NCM cloud / satellite source link (intensifying clouds) */}
      <CloudSourceEditor initialSource={initialCloudSource} />

      {/* Live Trend + AI Projection reference sources (per panel) */}
      <TrendSourceEditor initialGroups={initialTrendSources} />

      {/* AI prediction multi-source data pool */}
      <AiSourceEditor initialSources={initialAiSources} />

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

        {/* Simulator — drive the At-site / Far-site indicators and the active tier from test readings */}
        <div className="mt-4 rounded-lg border border-border/70 bg-background/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="label-caps text-foreground">Simulator</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide",
                  simLevel
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-border bg-background/60 text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    simLevel ? "bg-accent tier-blink" : "bg-muted-foreground/50",
                  )}
                  aria-hidden="true"
                />
                {simLevel ? "ON" : "OFF"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSimLevel(null)}
              disabled={simLevel === null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Turn off · back to live
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground/80">
            Push test readings through the exact same wiring as the live stations. Pick a level to watch the At-site
            and Far-site indicators and the active tier switch from green up to red, or type your own values in the row
            below.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {ESCALATION_LEVELS.map((level) => {
              const meta = LEVEL_META[level]
              const active = simLevel === level
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => simulate(level)}
                  aria-pressed={active}
                  aria-label={`Simulate ${meta.name}`}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2.5 text-left transition-colors",
                    meta.ring,
                    active && cn("ring-2 ring-inset", meta.ringActive),
                  )}
                >
                  <span
                    className={cn("h-3 w-3 rounded-full", meta.dot, active && level !== "green" && "tier-blink")}
                    aria-hidden="true"
                  />
                  <span className={cn("font-mono text-xs font-bold uppercase tracking-wide", meta.text)}>
                    {meta.name}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <span className="label-caps text-muted-foreground">Test live values — applied to both sites</span>
            <div className="grid gap-3 sm:grid-cols-4">
              <NumberField label="Wind speed" unit="m/s" value={simValues.windMs} onChange={(v) => updateSimValue("windMs", v)} />
              <NumberField label="Wind gust" unit="m/s" value={simValues.gustMs} onChange={(v) => updateSimValue("gustMs", v)} />
              <NumberField label="Rainfall" unit="mm" value={simValues.rainMm} onChange={(v) => updateSimValue("rainMm", v)} />
              <NumberField label="Intensive cloud coverage" unit="%" value={simValues.cloudPct} onChange={(v) => updateSimValue("cloudPct", v)} />
            </div>
          </div>
          {simLevel ? (
            <p className={cn("mt-2 text-xs font-medium", LEVEL_META[simLevel].text)}>
              Simulating {LEVEL_META[simLevel].name} — the indicators below reflect these test readings, not the live
              stations. Press &ldquo;Back to live&rdquo; to resume real data.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground/70">Live — indicators reflect real station readings.</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {rules.map((rule) => {
            const meta = LEVEL_META[rule.level]
            return (
              <div
                key={rule.level}
                className={cn(
                  "rounded-lg border border-border/70 bg-background/30 p-4 transition-shadow",
                  simLevel === rule.level && cn("ring-2 ring-inset", meta.ringActive),
                )}
              >
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
                  <div className="grid gap-3 sm:grid-cols-3">
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
                      label="Rainfall"
                      unit="mm"
                      value={rule.deadbands.rainMm}
                      onChange={(v) => updateDeadband(rule.level, "rainMm", v)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    Wind direction is not set here — it is recorded live and shown on the Wind Direction &amp; Speed
                    panel, read from whichever site reports the highest wind speed.
                  </p>
                </div>
                {/* At site / Far site detection panels */}
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="label-caps text-foreground">Site detection · at site vs far site</span>
                    <p className="text-xs text-muted-foreground/80">
                      {rule.level === "green"
                        ? "Green stays on its at-site ranges; far-site stations are watched, and a reading in the far-site ranges escalates to the next tier."
                        : "At-site ranges confirm this tier here; far-site ranges are the early-warning watch that escalates to the next tier."}{" "}
                      Wind direction is not set here — it is read live from whichever site reports the highest wind speed.
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {SITE_KEYS.map((siteKey) => (
                      <SitePanel
                        key={siteKey}
                        siteKey={siteKey}
                        site={rule[siteKey]}
                        accent={meta.text}
                        readings={effectiveReadings[siteKey]}
                        live={effectiveLive}
                        simLevel={simLevel}
                        windMet={siteKey === "atSite" && windEval.met}
                        windReason={siteKey === "atSite" ? windEval.reason : null}
                        onKm={(v) => updateSiteKm(rule.level, siteKey, v)}
                        onSource={(patch) => updateSiteSource(rule.level, siteKey, patch)}
                        onRangeChange={(metric, i, patch) => updateRange(rule.level, siteKey, metric, i, patch)}
                        onRangeAdd={(metric) => addRange(rule.level, siteKey, metric)}
                        onRangeRemove={(metric, i) => removeRange(rule.level, siteKey, metric, i)}
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

function AiSourceEditor({ initialSources }: { initialSources: AiPredictionSource[] }) {
  const [sources, setSources] = useState<AiPredictionSource[]>(initialSources.map((s) => ({ ...s })))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enabledCount = sources.filter((s) => s.enabled).length

  function update(index: number, patch: Partial<AiPredictionSource>) {
    setSaved(false)
    setSources((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function add() {
    setSaved(false)
    setSources((prev) => [...prev, { label: "", url: "", enabled: true }])
  }

  function remove(index: number) {
    setSaved(false)
    setSources((prev) => prev.filter((_, i) => i !== index))
  }

  function resetDefaults() {
    setSaved(false)
    setError(null)
    setSources(DEFAULT_AI_SOURCES.map((s) => ({ ...s })))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/ai-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Save failed")
      setSources((data.sources as AiPredictionSource[]).map((s) => ({ ...s })))
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
          <Database className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            AI prediction data sources
          </h2>
          <span className="rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
            {enabledCount}/{sources.length} active
          </span>
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
        Register every feed the AI prediction engine should read from — NCM warnings, Ghaith COSMO-UAE, Open-Meteo, a
        satellite feed or any custom link. Add a source now and toggle it on when you want it in the mix; only sources
        switched <strong className="text-foreground">on</strong> are blended into the assistant&apos;s live context and cited in its answers.
      </p>
      {error ? <p className="mt-2 text-sm text-alert-red">{error}</p> : null}

      <div className="mt-4 flex flex-col gap-2">
        {sources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-background/30 px-3 py-6 text-center text-xs text-muted-foreground/70">
            No sources yet — add a feed for the AI to read from.
          </p>
        ) : (
          sources.map((src, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center",
                src.enabled ? "border-accent/40 bg-background/40" : "border-border/70 bg-background/20 opacity-70",
              )}
            >
              <button
                type="button"
                onClick={() => update(i, { enabled: !src.enabled })}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-2 font-mono text-[0.6875rem] uppercase tracking-wider transition-colors",
                  src.enabled
                    ? "border-signal/50 bg-signal/15 text-signal"
                    : "border-border bg-background text-muted-foreground hover:bg-background/60",
                )}
                aria-pressed={src.enabled}
                aria-label={src.enabled ? "Disable source" : "Enable source"}
              >
                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                {src.enabled ? "On" : "Off"}
              </button>
              <input
                type="text"
                value={src.label}
                placeholder="Source name"
                onChange={(e) => update(i, { label: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent sm:w-1/3"
              />
              <span className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="url"
                  inputMode="url"
                  value={src.url}
                  placeholder="https://link-to-feed"
                  onChange={(e) => update(i, { url: e.target.value })}
                  className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
                />
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                    aria-label={`Open ${src.label || "source"} in a new tab`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
                  aria-label="Remove source"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60"
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
        Add source
      </button>
    </section>
  )
}

function SitePanel({
  siteKey,
  site,
  accent,
  readings,
  live,
  simLevel,
  windMet,
  windReason,
  onKm,
  onSource,
  onRangeChange,
  onRangeAdd,
  onRangeRemove,
}: {
  siteKey: SiteKey
  site: SiteConfig
  accent: string
  readings: SiteReadings
  live: boolean
  simLevel: AlertLevel | null
  windMet: boolean
  windReason: string | null
  onKm: (v: string) => void
  onSource: (patch: Partial<SourceLink>) => void
  onRangeChange: (metric: SiteMetricKey, index: number, patch: Partial<MetricRange>) => void
  onRangeAdd: (metric: SiteMetricKey) => void
  onRangeRemove: (metric: SiteMetricKey, index: number) => void
}) {
  const info = SITE_META[siteKey]
  // Live status — same wiring as the public banner: green until a configured range is met,
  // then red. Only reflects a real condition when live station data is present.
  const ev = live ? evaluateSite(site, readings) : { met: false, reason: null }
  // On-site button also trips on a met Wind Event Monitor threshold, so the console
  // reflects the same three-condition wiring (at-site range · far-site range · wind event).
  const rangeReason = ev.met ? ev.reason : windMet ? windReason : null
  const met = live && (ev.met || windMet)
  // Tone drives the indicator colour. Under simulation it follows the chosen tier so the
  // operator sees the full green → yellow → orange → red cascade; otherwise it stays the
  // live binary (green until a range trips, then red).
  const simActive = simLevel != null
  const simName = simLevel ? LEVEL_META[simLevel].name : ""
  const tone: AlertLevel | "off" = !live ? "off" : simLevel ?? (met ? "red" : "green")
  const toneMeta = tone === "off" ? null : LEVEL_META[tone]
  const blink = tone === "yellow" || tone === "orange" || tone === "red"
  const containerTone = toneMeta ? cn(toneMeta.border, toneMeta.fill) : "border-border bg-background/60"
  const statusWord = tone === "off" ? "Awaiting data" : simActive ? `Simulated ${simName}` : met ? "In range" : "Clear"
  const statusTitle =
    tone === "off"
      ? `${info.name}: waiting for live station data`
      : simActive
        ? `${info.name}: SIMULATED ${simName}${rangeReason ? ` — ${rangeReason}` : ""}`
        : met
          ? `${info.name}: IN RANGE — ${rangeReason}`
          : `${info.name}: within limits`
  const statusButton = (
    <>
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-full",
          toneMeta ? toneMeta.dot : "bg-muted-foreground/40",
          blink && "tier-blink",
        )}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col text-left leading-tight">
        <span
          className={cn(
            "font-mono text-sm font-bold uppercase tracking-wide",
            toneMeta ? toneMeta.text : "text-muted-foreground",
          )}
        >
          {siteKey === "atSite" ? "At site" : "Far site"}
        </span>
        <span className="truncate text-[0.6875rem] font-medium text-muted-foreground">{statusWord}</span>
      </span>
      {site.source.url ? (
        <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </>
  )
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex flex-col gap-0.5">
        <span className={cn("font-mono text-xs font-bold uppercase tracking-wide", accent)}>{info.name}</span>
        <span className="text-[0.6875rem] leading-snug text-muted-foreground/80">{info.hint}</span>
      </div>

      {/* Live status indicator — bigger, roomy tap target that switches green → red */}
      {site.source.url ? (
        <a
          href={site.source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={statusTitle}
          aria-label={statusTitle}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
            met
              ? "border-alert-red/50 bg-alert-red/15"
              : live
                ? "border-alert-green/40 bg-alert-green/10 hover:bg-alert-green/15"
                : "border-border bg-background/60",
          )}
        >
          {statusButton}
        </a>
      ) : (
        <div
          title={statusTitle}
          aria-label={statusTitle}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3",
            met
              ? "border-alert-red/50 bg-alert-red/15"
              : live
                ? "border-alert-green/40 bg-alert-green/10"
                : "border-border bg-background/60",
          )}
        >
          {statusButton}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="label-caps text-muted-foreground">Detection band (KM range)</span>
        <input
          type="text"
          value={site.km}
          placeholder="0–20 km"
          onChange={(e) => onKm(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </label>

      {SITE_METRIC_KEYS.map((metric) => (
        <RangeEditor
          key={metric}
          metric={metric}
          ranges={site[metric]}
          onChange={(i, patch) => onRangeChange(metric, i, patch)}
          onAdd={() => onRangeAdd(metric)}
          onRemove={(i) => onRangeRemove(metric, i)}
        />
      ))}

      <div className="flex flex-col gap-1.5">
        <span className="label-caps text-muted-foreground">Data source link</span>
        <input
          type="text"
          value={site.source.label}
          placeholder="Station feed name"
          onChange={(e) => onSource({ label: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <span className="relative">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="url"
            inputMode="url"
            value={site.source.url ?? ""}
            placeholder="https://link-to-weather-station (optional)"
            onChange={(e) => onSource({ url: e.target.value })}
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-accent"
          />
        </span>
      </div>
    </div>
  )
}

function RangeEditor({
  metric,
  ranges,
  onChange,
  onAdd,
  onRemove,
}: {
  metric: SiteMetricKey
  ranges: MetricRange[]
  onChange: (index: number, patch: Partial<MetricRange>) => void
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const meta = SITE_METRIC_META[metric]
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-background/30 p-2.5">
      <div className="flex items-center justify-between">
        <span className="label-caps text-muted-foreground">
          {meta.label} <span className="text-muted-foreground/60">({meta.unit})</span>
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground transition-colors hover:bg-background/60"
        >
          <Plus className="h-2.5 w-2.5" aria-hidden="true" />
          Range
        </button>
      </div>
      {ranges.length === 0 ? (
        <p className="text-[0.6875rem] text-muted-foreground/70">No ranges — add one.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {ranges.map((rg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={meta.max}
                value={rg.min}
                aria-label={`${meta.label} range ${i + 1} minimum`}
                onChange={(e) => onChange(i, { min: e.target.value === "" ? 0 : Number(e.target.value) })}
                className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-accent"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="number"
                min={0}
                max={meta.max}
                value={rg.max ?? ""}
                placeholder="∞"
                aria-label={`${meta.label} range ${i + 1} maximum (blank = open-ended)`}
                onChange={(e) => onChange(i, { max: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-accent"
              />
              <input
                type="text"
                value={rg.label}
                placeholder="Severity"
                aria-label={`${meta.label} range ${i + 1} severity label`}
                onChange={(e) => onChange(i, { label: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-alert-red/50 hover:text-alert-red"
                aria-label={`Remove ${meta.label} range ${i + 1}`}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
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
