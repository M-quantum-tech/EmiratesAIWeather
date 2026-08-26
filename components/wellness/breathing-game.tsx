"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Play, Pause, RotateCcw, Wind, Heart } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { cn } from "@/lib/utils"

type Phase = { key: "inhale" | "hold" | "exhale" | "rest"; label: string; seconds: number }

// 4-7-8 inspired calming cycle.
const CYCLE: Phase[] = [
  { key: "inhale", label: "Breathe in", seconds: 4 },
  { key: "hold", label: "Hold", seconds: 7 },
  { key: "exhale", label: "Breathe out", seconds: 8 },
  { key: "rest", label: "Relax", seconds: 2 },
]

const MASCOTS = ["/mascots/breeze.png", "/mascots/sunny.png", "/mascots/dewy.png"]

const CHEERS = [
  "You are doing great — keep that smile!",
  "Nice and slow, let the tension melt away.",
  "Every breath is a tiny reset. Lovely work!",
  "Feel your shoulders drop. You've got this.",
  "Calm mind, clear skies ahead.",
]

export function BreathingGame() {
  const [running, setRunning] = useState(false)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remaining, setRemaining] = useState(CYCLE[0].seconds)
  const [cycles, setCycles] = useState(0)
  const [mascot, setMascot] = useState(0)
  const [cheer, setCheer] = useState(CHEERS[0])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const phase = CYCLE[phaseIndex]

  const advance = useCallback(() => {
    setPhaseIndex((prev) => {
      const next = (prev + 1) % CYCLE.length
      if (next === 0) {
        setCycles((c) => c + 1)
        setMascot((m) => (m + 1) % MASCOTS.length)
        setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)])
      }
      setRemaining(CYCLE[next].seconds)
      return next
    })
  }, [])

  useEffect(() => {
    if (!running) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          advance()
          return CYCLE[(phaseIndex + 1) % CYCLE.length].seconds
        }
        return r - 1
      })
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [running, advance, phaseIndex])

  const reset = () => {
    setRunning(false)
    setPhaseIndex(0)
    setRemaining(CYCLE[0].seconds)
    setCycles(0)
  }

  const scale =
    phase.key === "inhale" ? "scale-100" : phase.key === "hold" ? "scale-100" : phase.key === "exhale" ? "scale-50" : "scale-[0.45]"
  const duration =
    phase.key === "inhale" ? "duration-[4000ms]" : phase.key === "exhale" ? "duration-[8000ms]" : "duration-1000"

  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="flex items-center gap-2 label-caps">
            <Wind className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Free calm zone
          </span>
          <h2 className="mt-1 text-balance text-lg font-semibold tracking-tight text-foreground">
            Breathing break
          </h2>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[0.625rem] text-accent">
          <Heart className="h-3 w-3" aria-hidden="true" />
          {cycles} cycles
        </span>
      </div>

      <div className="flex flex-col items-center gap-5 py-4">
        <div className="relative flex h-52 w-52 items-center justify-center">
          {/* Rings */}
          <div className="absolute inset-0 rounded-full border border-accent/20" />
          <div className="absolute inset-4 rounded-full border border-accent/15" />
          {/* Breathing orb */}
          <div
            className={cn(
              "flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-signal/30 transition-transform ease-in-out",
              running ? scale : "scale-75",
              running ? duration : "duration-700",
            )}
          >
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{running ? phase.label : "Ready"}</p>
              <p className="font-mono text-3xl font-bold text-accent">{running ? remaining : CYCLE[0].seconds}</p>
            </div>
          </div>
          {/* Mascot sticker */}
          <div className="absolute -right-2 -top-2 h-16 w-16 float-bob">
            <Image
              src={MASCOTS[mascot] || "/placeholder.svg"}
              alt="Encouraging mascot"
              fill
              sizes="64px"
              className="rounded-full object-cover shadow-lg"
            />
          </div>
        </div>

        <p aria-live="polite" className="min-h-5 text-pretty text-center text-sm text-muted-foreground">
          {running ? cheer : "Follow the orb — inhale as it grows, exhale as it shrinks."}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
        <div className="flex gap-1.5">
          {CYCLE.map((p, i) => (
            <span
              key={p.key}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === phaseIndex && running ? "w-8 bg-accent" : "w-4 bg-border",
              )}
            />
          ))}
        </div>
      </div>
    </Panel>
  )
}
