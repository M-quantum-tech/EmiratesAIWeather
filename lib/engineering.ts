import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import {
  DEFAULT_RULES,
  DEFAULT_WIND_MONITOR,
  DEFAULT_WIND_SOURCE,
  parseRules,
  parseWindMonitor,
  parseWindSource,
  type EscalationRule,
  type WindMonitorTier,
  type WindSourceConfig,
} from "@/lib/escalation"
import { isAdmin } from "@/lib/admin"

const ESCALATION_KEY = "escalation_rules"
const WIND_MONITOR_KEY = "wind_monitor_tiers"
const WIND_SOURCE_KEY = "wind_source_config"

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
