import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import {
  DEFAULT_AI_SOURCES,
  DEFAULT_CLOUD_SOURCE,
  DEFAULT_RULES,
  DEFAULT_TREND_SOURCES,
  DEFAULT_WIND_MONITOR,
  DEFAULT_WIND_SOURCE,
  parseAiSources,
  parseCloudSource,
  parseRules,
  parseTrendSources,
  parseWindMonitor,
  parseWindSource,
  type AiPredictionSource,
  type CloudSourceConfig,
  type EscalationRule,
  type TrendSourceGroup,
  type WindMonitorTier,
  type WindSourceConfig,
} from "@/lib/escalation"
import { DEFAULT_NCM_WARNINGS, parseNcmWarnings, type NcmWarning } from "@/lib/ncm-warnings"
import { isAdmin } from "@/lib/admin"

const ESCALATION_KEY = "escalation_rules"
const NCM_WARNINGS_KEY = "ncm_warnings"
const WIND_MONITOR_KEY = "wind_monitor_tiers"
const WIND_SOURCE_KEY = "wind_source_config"
const CLOUD_SOURCE_KEY = "cloud_source_config"
const TREND_SOURCES_KEY = "live_trend_sources"
const AI_SOURCES_KEY = "ai_prediction_sources"

/**
 * Idempotently create the key/value settings table used by the Engineering
 * Console. Mirrors the ensure pattern used for the admin access columns so a
 * fresh database self-heals without a manual migration.
 */
let settingsReady: Promise<void> | null = null
function ensureSettingsTable(): Promise<void> {
  if (!settingsReady) {
    settingsReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "app_setting" (
          "key" text PRIMARY KEY,
          "value" jsonb NOT NULL,
          "updatedAt" timestamp NOT NULL DEFAULT now()
        )
      `)
    })().catch((err) => {
      settingsReady = null
      throw err
    })
  }
  return settingsReady
}

/** Effective escalation ladder — persisted overrides, or the built-in defaults. */
export async function getEscalationRules(): Promise<EscalationRule[]> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${ESCALATION_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_RULES
    const parsed = parseRules(row.value)
    return parsed ?? DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

/** Persist a new escalation ladder — admin only. */
export async function saveEscalationRules(rules: unknown): Promise<EscalationRule[]> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseRules(rules)
  if (!clean) throw new Error("Invalid escalation rules")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${ESCALATION_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}

/** Effective NCM warnings bulletin — persisted admin edits, or the built-in seed. */
export async function getNcmWarnings(): Promise<NcmWarning[]> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${NCM_WARNINGS_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_NCM_WARNINGS
    const parsed = parseNcmWarnings(row.value)
    // null → malformed stored value: fall back to the seed. An empty array is a
    // valid state (admin cleared all warnings) and is returned as-is.
    return parsed ?? DEFAULT_NCM_WARNINGS
  } catch {
    return DEFAULT_NCM_WARNINGS
  }
}

/** Persist the NCM warnings bulletin — admin only. */
export async function saveNcmWarnings(value: unknown): Promise<NcmWarning[]> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseNcmWarnings(value)
  if (!clean) throw new Error("Invalid NCM warnings")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${NCM_WARNINGS_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}

/** Effective Wind Event Monitor ladder — persisted overrides, or defaults. */
export async function getWindMonitor(): Promise<WindMonitorTier[]> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${WIND_MONITOR_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_WIND_MONITOR
    const parsed = parseWindMonitor(row.value)
    return parsed ?? DEFAULT_WIND_MONITOR
  } catch {
    return DEFAULT_WIND_MONITOR
  }
}

/** Persist a new Wind Event Monitor ladder — admin only. */
export async function saveWindMonitor(tiers: unknown): Promise<WindMonitorTier[]> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseWindMonitor(tiers)
  if (!clean) throw new Error("Invalid wind monitor tiers")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${WIND_MONITOR_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}

/** Effective wind speed & gust source link — persisted override, or the NCM default. */
export async function getWindSource(): Promise<WindSourceConfig> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${WIND_SOURCE_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_WIND_SOURCE
    const parsed = parseWindSource(row.value)
    return parsed ?? DEFAULT_WIND_SOURCE
  } catch {
    return DEFAULT_WIND_SOURCE
  }
}

/** Persist the wind speed & gust source link — admin only. */
export async function saveWindSource(value: unknown): Promise<WindSourceConfig> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseWindSource(value)
  if (!clean) throw new Error("Invalid wind source")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${WIND_SOURCE_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}

/** Effective NCM cloud / satellite source link — persisted override, or the NCM default. */
export async function getCloudSource(): Promise<CloudSourceConfig> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${CLOUD_SOURCE_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_CLOUD_SOURCE
    const parsed = parseCloudSource(row.value)
    return parsed ?? DEFAULT_CLOUD_SOURCE
  } catch {
    return DEFAULT_CLOUD_SOURCE
  }
}

/** Persist the NCM cloud / satellite source link — admin only. */
export async function saveCloudSource(value: unknown): Promise<CloudSourceConfig> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseCloudSource(value)
  if (!clean) throw new Error("Invalid cloud source")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${CLOUD_SOURCE_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}

/** Effective Live Trend + AI Projection source map — persisted overrides, or empty panels. */
export async function getTrendSources(): Promise<TrendSourceGroup[]> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${TREND_SOURCES_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_TREND_SOURCES
    const parsed = parseTrendSources(row.value)
    return parsed ?? DEFAULT_TREND_SOURCES
  } catch {
    return DEFAULT_TREND_SOURCES
  }
}

/** Persist the Live Trend + AI Projection source map — admin only. */
export async function saveTrendSources(value: unknown): Promise<TrendSourceGroup[]> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseTrendSources(value)
  if (!clean) throw new Error("Invalid trend sources")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${TREND_SOURCES_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}

/** Effective AI prediction data-source pool — persisted overrides, or defaults. */
export async function getAiSources(): Promise<AiPredictionSource[]> {
  try {
    await ensureSettingsTable()
    const res = await db.execute(sql`SELECT value FROM "app_setting" WHERE key = ${AI_SOURCES_KEY}`)
    const row = (res.rows as { value: unknown }[])[0]
    if (!row) return DEFAULT_AI_SOURCES
    const parsed = parseAiSources(row.value)
    return parsed ?? DEFAULT_AI_SOURCES
  } catch {
    return DEFAULT_AI_SOURCES
  }
}

/** Persist the AI prediction data-source pool — admin only. */
export async function saveAiSources(value: unknown): Promise<AiPredictionSource[]> {
  if (!(await isAdmin())) throw new Error("Forbidden")
  const clean = parseAiSources(value)
  if (!clean) throw new Error("Invalid AI sources")
  await ensureSettingsTable()
  const json = JSON.stringify(clean)
  await db.execute(sql`
    INSERT INTO "app_setting" ("key", "value", "updatedAt")
    VALUES (${AI_SOURCES_KEY}, ${json}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = ${json}::jsonb, "updatedAt" = now()
  `)
  return clean
}
