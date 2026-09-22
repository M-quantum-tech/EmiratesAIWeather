"use client"

import { useState, useTransition } from "react"
import { Check, Loader2 } from "lucide-react"
import { updatePlanPrice } from "@/app/actions/pricing"
import type { PlanId } from "@/lib/plans"

export interface PriceRow {
  id: PlanId
  name: string
  cadenceLabel: string
  priceCents: number
}

export function PricingEditor({ rows }: { rows: PriceRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border px-5 py-3">
        <span className="label-caps">Plan</span>
        <span className="label-caps text-right">Price (USD)</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <PriceRowItem key={row.id} row={row} />
        ))}
      </ul>
    </div>
  )
}

function PriceRowItem({ row }: { row: PriceRow }) {
  const [dollars, setDollars] = useState((row.priceCents / 100).toString())
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    const value = Number.parseFloat(dollars)
    if (!Number.isFinite(value) || value < 0) {
      setError("Invalid amount")
      return
    }
    const cents = Math.round(value * 100)
    startTransition(async () => {
      try {
        await updatePlanPrice(row.id, cents)
        setDollars((cents / 100).toString())
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save")
      }
    })
  }

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
        <p className="text-xs text-muted-foreground">{row.cadenceLabel}</p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) save()
            }}
            aria-label={`Price for ${row.name} in dollars`}
            className="h-10 w-28 rounded-md border border-input bg-background pl-6 pr-3 text-sm tabular-nums text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex h-10 w-24 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : saved ? (
            <span className="inline-flex items-center gap-1">
              <Check className="h-4 w-4" aria-hidden="true" /> Saved
            </span>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </li>
  )
}
