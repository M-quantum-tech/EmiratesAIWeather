"use client"

import { useEffect, useState } from "react"
import type { AlertLevel } from "@/lib/weather"
import type { SiteKey, SiteReadings } from "@/lib/escalation"

/**
 * Shared "simulator mode" signal. The Engineering Console runs the simulator on its own
 * route, but the public safety panel lives elsewhere, so the active state is broadcast
 * through localStorage: a custom event updates listeners in the same tab and the native
 * `storage` event updates other tabs (operator drives the drill in one tab, the public
 * dashboard shows the banner in another). This carries no user data — only the on/off
 * flag, the tier being rehearsed, and the per-site test readings so the safety panel can
 * run the drill through the exact same At-site / Far-site wiring the live stations use.
 */
export type SimulatorState = {
  active: boolean
  level: AlertLevel | null
  readings: Record<SiteKey, SiteReadings> | null
}

const KEY = "eaw:simulator-mode"
const EVENT = "eaw:simulator-mode"
const OFF: SimulatorState = { active: false, level: null, readings: null }

function read(): SimulatorState {
  if (typeof window === "undefined") return OFF
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return OFF
    const parsed = JSON.parse(raw) as Partial<SimulatorState>
    return {
      active: Boolean(parsed.active),
      level: (parsed.level as AlertLevel | null) ?? null,
      readings:
        parsed.readings && typeof parsed.readings === "object"
          ? (parsed.readings as Record<SiteKey, SiteReadings>)
          : null,
    }
  } catch {
    return OFF
  }
}

/** Publish the current simulator state to every listener (this tab and others). */
export function setSimulatorMode(state: SimulatorState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures — the badge is best-effort signalling, not persistence.
  }
  window.dispatchEvent(new CustomEvent<SimulatorState>(EVENT, { detail: state }))
}

/** Subscribe to the shared simulator state. Returns `{ active: false }` until hydrated. */
export function useSimulatorMode(): SimulatorState {
  const [state, setState] = useState<SimulatorState>(OFF)

  useEffect(() => {
    setState(read())
    const onCustom = (e: Event) => setState((e as CustomEvent<SimulatorState>).detail ?? read())
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(read())
    }
    window.addEventListener(EVENT, onCustom)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(EVENT, onCustom)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return state
}
