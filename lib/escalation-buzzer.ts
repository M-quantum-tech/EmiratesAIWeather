import { BUZZER_TONE } from "@/lib/escalation"
import type { AlertLevel } from "@/lib/weather"

let ctx: AudioContext | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let loopTimer: ReturnType<typeof setInterval> | null = null

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === "suspended") ctx.resume().catch(() => {})
  return ctx
}

/** Stop any test tone currently playing. */
export function stopBuzzerTest() {
  if (stopTimer) clearTimeout(stopTimer)
  if (loopTimer) clearInterval(loopTimer)
  stopTimer = null
  loopTimer = null
}

/**
 * Play the level-tuned alarm as a short test (default ~2.4s) so an operator can
 * preview exactly what each escalation tier sounds like from the console.
 */
export function playBuzzerTest(level: AlertLevel, durationMs = 2400) {
  stopBuzzerTest()
  const audio = getCtx()
  if (!audio) return
  const tone = BUZZER_TONE[level]

  const beep = (freq: number, at: number, dur: number) => {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = tone.type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(tone.gain, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain).connect(audio.destination)
    osc.start(at)
    osc.stop(at + dur)
  }
  const cycle = () => {
    const t = audio.currentTime
    tone.pattern.forEach((freq, i) => beep(freq, t + i * tone.step, 0.2))
  }
  cycle()
  loopTimer = setInterval(cycle, tone.interval)
  stopTimer = setTimeout(stopBuzzerTest, durationMs)
}
