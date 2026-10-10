"use client"

import { useEffect, useState } from "react"

/**
 * Wind Event Monitor test signal. The Engineering Console publishes a test at-site wind
 * value; the station safety panel feeds it through the live wiring (Wind Event Monitor,
 * live 15 s buzzer) instead of the real reading. Broadcast via localStorage like the
 * simulator so a test started in the console tab trips the station tab.
 */
export type WindMonitorTestState = { active: boolean; windMs: number | null }

const KEY = "eaw:wind-monitor-test"
const EVENT = "eaw:wind-monitor-test"
const OFF: WindMonitorTestState = { active: false, windMs: null }

function read(): WindMonitorTestState {
  if (typeof window === "undefined") return OFF
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return OFF
    const parsed = JSON.parse(raw) as Partial<WindMonitorTestState>
    const windMs = typeof parsed.windMs === "number" && Number.isFinite(parsed.windMs) ? parsed.windMs : null
    return { active: Boolean(parsed.active) && windMs !== null, windMs }
  } catch {
    return OFF
  }
}

export function setWindMonitorTest(state: WindMonitorTestState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Best-effort signalling only.
  }
  window.dispatchEvent(new CustomEvent<WindMonitorTestState>(EVENT, { detail: state }))
}

export function clearWindMonitorTest() {
  setWindMonitorTest(OFF)
}

export function useWindMonitorTest(): WindMonitorTestState {
  const [state, setState] = useState<WindMonitorTestState>(OFF)

  useEffect(() => {
    setState(read())
    const onCustom = (e: Event) => setState((e as CustomEvent<WindMonitorTestState>).detail ?? read())
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
