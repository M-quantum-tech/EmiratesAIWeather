"use client"

import { useEffect, useRef, useState } from "react"
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
 *
 * The parent toggles rails with `hidden`/`xl:hidden`, so at any viewport at least
 * one AdUnit is display:none. AdSense's `push({})` is page-global and throws
 * "No slot size for availableWidth=0" if it encounters a zero-width <ins>. To avoid
 * that we only mount the <ins> once THIS unit's container is actually laid out
 * (visible with a real width), then push exactly once for that element.
 */
export function AdUnit({
  label = "Sponsored",
  orientation = "horizontal",
}: {
  label?: string
  orientation?: "horizontal" | "vertical"
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pushed = useRef(false)
  const [visible, setVisible] = useState(false)
  const vertical = orientation === "vertical"
  const hasAds = Boolean(CLIENT && SLOT)

  // Mount the <ins> only when the container is on-screen with a measurable width.
  useEffect(() => {
    if (!hasAds) return
    const el = wrapRef.current
    if (!el) return
    const check = () => {
      if (el.offsetParent !== null && el.clientWidth > 0) {
        setVisible(true)
        return true
      }
      return false
    }
    if (check()) return
    const ro = new ResizeObserver(() => {
      if (check()) ro.disconnect()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasAds])

  // Once the <ins> is in the DOM (visible), request a fill exactly once.
  useEffect(() => {
    if (!hasAds || !visible || pushed.current) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch (error) {
      console.log("[v0] adsense push failed:", error instanceof Error ? error.message : error)
    }
    pushed.current = true
  }, [hasAds, visible])

  return (
    <Panel>
      <PanelHeader title="Advertisement" meta={label} />
      <div ref={wrapRef} className="px-4 py-4">
        {hasAds ? (
          visible ? (
            <ins
              className="adsbygoogle block"
              style={{ display: "block", minHeight: vertical ? 500 : 100 }}
              data-ad-client={CLIENT}
              data-ad-slot={SLOT}
              data-ad-format={vertical ? "vertical" : "auto"}
              data-full-width-responsive="true"
            />
          ) : (
            <div style={{ minHeight: vertical ? 500 : 100 }} aria-hidden="true" />
          )
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
