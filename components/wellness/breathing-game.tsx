"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Play, Pause, RotateCcw, Wind, Heart, Sparkles, Gauge } from "lucide-react"
import { Panel } from "@/components/station/panel"
import { cn } from "@/lib/utils"

type Phase = { key: "inhale" | "hold" | "exhale" | "rest"; label: string; seconds: number }
type LevelId = "beginner" | "easy" | "hard"

// Each level has its own pace. Beginner is a gentle even breath, Easy adds a short
// hold, and Hard is the advanced 4-7-8 relaxation cycle with a longer hold.
const LEVELS: { id: LevelId; label: string; note: string; cycle: Phase[] }[] = [
  {
    id: "beginner",
    label: "Beginner",
    note: "Gentle even breathing",
    cycle: [
      { key: "inhale", label: "Breathe in", seconds: 4 },
      { key: "exhale", label: "Breathe out", seconds: 4 },
      { key: "rest", label: "Relax", seconds: 2 },
    ],
  },
  {
    id: "easy",
    label: "Easy",
    note: "Short hold · 4-4-6",
    cycle: [
      { key: "inhale", label: "Breathe in", seconds: 4 },
      { key: "hold", label: "Hold", seconds: 4 },
      { key: "exhale", label: "Breathe out", seconds: 6 },
      { key: "rest", label: "Relax", seconds: 2 },
    ],
  },
  {
    id: "hard",
    label: "Hard",
    note: "Advanced 4-7-8",
    cycle: [
      { key: "inhale", label: "Breathe in", seconds: 4 },
      { key: "hold", label: "Hold", seconds: 7 },
      { key: "exhale", label: "Breathe out", seconds: 8 },
      { key: "rest", label: "Relax", seconds: 2 },
    ],
  },
]

const MASCOTS = ["/mascots/breeze.png", "/mascots/sunny.png", "/mascots/dewy.png"]

const CHEERS = [
  "You are doing great — keep that smile!",
  "Nice and slow, let the tension melt away.",
  "Every breath is a tiny reset. Lovely work!",
  "Feel your shoulders drop. You've got this.",
  "Calm mind, clear skies ahead.",
]

// A short congratulation shown after every completed step (phase).
const STEP_PRAISE: Record<Phase["key"], string> = {
  inhale: "Beautiful inhale!",
  hold: "Steady hold — well done!",
  exhale: "Smooth exhale, perfect!",
  rest: "Nicely relaxed!",
}

export function BreathingGame() {
  const [levelId, setLevelId] = useState<LevelId>("beginner")
  const cycle = LEVELS.find((l) => l.id === levelId)!.cycle

  const [running, setRunning] = useState(false)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remaining, setRemaining] = useState(cycle[0].seconds)
  const [cycles, setCycles] = useState(0)
  const [steps, setSteps] = useState(0)
  const [mascot, setMascot] = useState(0)
  const [cheer, setCheer] = useState(CHEERS[0])
  const [congrats, setCongrats] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const congratsRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const phase = cycle[phaseIndex]

  // Flash a celebratory message for the step that just finished, then auto-hide it.
  const celebrate = useCallback((finishedKey: Phase["key"]) => {
    setSteps((s) => s + 1)
    setCongrats(STEP_PRAISE[finishedKey])
    if (congratsRef.current) clearTimeout(congratsRef.current)
    congratsRef.current = setTimeout(() => setCongrats(null), 1400)
  }, [])

  const advance = useCallback(() => {
    setPhaseIndex((prev) => {
      celebrate(cycle[prev].key)
      const next = (prev + 1) % cycle.length
      if (next === 0) {
        setCycles((c) => c + 1)
        setMascot((m) => (m + 1) % MASCOTS.length)
        setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)])
      }
      setRemaining(cycle[next].seconds)
      return next
    })
  }, [cycle, celebrate])

  useEffect(() => {
    if (!running) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          advance()
          return cycle[(phaseIndex + 1) % cycle.length].seconds
        }
        return r - 1
      })
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [running, advance, phaseIndex, cycle])

  useEffect(() => {
    return () => {
      if (congratsRef.current) clearTimeout(congratsRef.current)
    }
  }, [])

  const reset = useCallback(() => {
    setRunning(false)
    setPhaseIndex(0)
    setRemaining(cycle[0].seconds)
    setCycles(0)
    setSteps(0)
    setCongrats(null)
  }, [cycle])

  const changeLevel = useCallback(
    (id: LevelId) => {
      const nextCycle = LEVELS.find((l) => l.id === id)!.cycle
      setLevelId(id)
      setRunning(false)
      setPhaseIndex(0)
      setRemaining(nextCycle[0].seconds)
      setCycles(0)
      setSteps(0)
      setCongrats(null)
    },
    [],
  )

  const scale =
    phase.key === "inhale" ? "scale-100" : phase.key === "hold" ? "scale-100" : phase.key === "exhale" ? "scale-50" : "scale-[0.45]"
  const duration =
    phase.key === "inhale"
      ? `duration-[${cycle[0].seconds * 1000}ms]`
      : phase.key === "exhale"
        ? "duration-[8000ms]"
        : "duration-1000"

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

      {/* Level selector: beginner / easy / hard */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          <Gauge className="h-3 w-3" aria-hidden="true" />
          Level
        </span>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => changeLevel(l.id)}
            aria-pressed={levelId === l.id}
            title={l.note}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-wider transition-colors",
              levelId === l.id
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        ))}
        <span className="hidden font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground sm:inline">
          {LEVELS.find((l) => l.id === levelId)?.note}
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
              <p className="font-mono text-3xl font-bold text-accent">{running ? remaining : cycle[0].seconds}</p>
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
          {/* Per-step congratulations burst */}
          {congrats ? (
            <div
              key={steps}
              className="congrats-pop absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-accent/50 bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground shadow-lg"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {congrats}
            </div>
          ) : null}
        </div>

        <p aria-live="polite" className="min-h-5 text-pretty text-center text-sm text-muted-foreground">
          {running ? cheer : "Pick a level, then follow the orb — inhale as it grows, exhale as it shrinks."}
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

        {/* Progress dots + steps-completed tally */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1.5">
            {cycle.map((p, i) => (
              <span
                key={p.key}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === phaseIndex && running ? "w-8 bg-accent" : "w-4 bg-border",
                )}
              />
            ))}
          </div>
          <span className="flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
            {steps} steps completed
          </span>
        </div>
      </div>
    </Panel>
  )
}
