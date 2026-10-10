"use client"

import useSWR, { mutate } from "swr"
import type { AlertLevel } from "@/lib/weather"
import type { SiteKey, SiteReadings } from "@/lib/escalation"

/**
 * Shared "simulator mode" signal, stored server-side so a drill started in the Engineering
 * Console reaches every visitor's safety panel, not just the operator's browser. The console
 * writes through /api/simulator (admin only); every station polls it. The server expires a
 * drill after 30 minutes so a forgotten simulator can't keep alarming the public.
 */
export type SimulatorState = {
  active: boolean
  level: AlertLevel | null
  readings: Record<SiteKey, SiteReadings> | null
}

const KEY = "/api/simulator"
const OFF: SimulatorState = { active: false, level: null, readings: null }
const WRITE_DEBOUNCE_MS = 400

let pending: ReturnType<typeof setTimeout> | null = null
let lastSent = JSON.stringify(OFF)

async function fetchState(url: string): Promise<SimulatorState> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return OFF
  const data = (await res.json()) as { state?: SimulatorState }
  return data.state ?? OFF
}

/** Publish the simulator state to every visitor. Typing in test values is debounced. */
export function setSimulatorMode(state: SimulatorState) {
  if (typeof window === "undefined") return
  const json = JSON.stringify(state)
  // The console re-publishes on mount; don't overwrite a running drill with "off" for nothing.
  if (json === lastSent) return
  mutate(KEY, state, { revalidate: false })
  if (pending) clearTimeout(pending)
  pending = setTimeout(async () => {
    pending = null
    try {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      })
      if (res.ok) lastSent = json
    } catch {
      // Network blip — the next change or poll will reconcile.
    }
  }, WRITE_DEBOUNCE_MS)
}

/** Subscribe to the shared simulator state. Returns `{ active: false }` until loaded. */
export function useSimulatorMode(): SimulatorState {
  const { data } = useSWR<SimulatorState>(KEY, fetchState, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  })
  return data ?? OFF
}
