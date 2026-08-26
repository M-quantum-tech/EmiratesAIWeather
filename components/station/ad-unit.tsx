"use client"

import { useEffect, useRef } from "react"
import { Panel, PanelHeader } from "@/components/station/panel"

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * A single responsive AdSense display unit rendered inside a station panel so
 * sponsored content matches the instrument-panel chrome. Falls back to a house
 * placeholder when the publisher/slot env vars are not configured.
 */
export function AdUnit({
  label = "Sponsored",
  orientation = "horizontal",
}: {
  label?: string
  orientation?: "horizontal" | "vertical"
}) {
  const pushed = useRef(false)
  const vertical = orientation === "vertical"

  useEffect(() => {
    if (!CLIENT || !SLOT || pushed.current) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch (error) {
      console.log("[v0] adsense push failed:", error instanceof Error ? error.message : error)
    }
  }, [])

  return (
    <Panel>
      <PanelHeader title="Advertisement" meta={label} />
      <div className="px-4 py-4">
        {CLIENT && SLOT ? (
          <ins
            className="adsbygoogle block"
            style={{ display: "block", minHeight: vertical ? 500 : 100 }}
            data-ad-client={CLIENT}
            data-ad-slot={SLOT}
            data-ad-format={vertical ? "vertical" : "auto"}
            data-full-width-responsive="true"
          />
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center ${
              vertical ? "min-h-[500px]" : "min-h-[100px]"
            }`}
          >
            <span className="label-caps text-muted-foreground">Ad slot</span>
            <span className="text-xs text-muted-foreground">
              {vertical ? "Vertical skyscraper" : "Set AdSense keys to serve live ads."}
            </span>
          </div>
        )}
      </div>
    </Panel>
  )
}
