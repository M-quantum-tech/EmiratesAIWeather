"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import type { SiteKey, SiteReadings } from "@/lib/escalation"
import { applyMirror, type GhaithMirror } from "@/lib/ghaith-mirror"

type MirrorResponse = { mirror: GhaithMirror; relayEnabled: boolean }

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Mirror ${r.status}`)
    return r.json() as Promise<MirrorResponse>
  })

/**
 * Ghaith mirror as the PRIMARY reading source: fresh mirrored values replace the
 * model-grid readings per site; stale or missing sites fall back to the grid.
 */
export function useGhaithMirror(grid: Record<SiteKey, SiteReadings>) {
  const { data, mutate } = useSWR<MirrorResponse>("/api/ghaith-mirror", fetcher, {
    refreshInterval: 30_000,
    refreshWhenHidden: true,
    keepPreviousData: true,
  })
  // Re-evaluate freshness each 30 s so a stale mirror hands over to the grid on time.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const applied = useMemo(() => applyMirror(grid, data?.mirror, now), [grid, data?.mirror, now])
  return { ...applied, mirror: data?.mirror ?? null, relayEnabled: data?.relayEnabled ?? false, mutate }
}
