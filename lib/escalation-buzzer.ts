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
    // Layer fundamental + detuned twin + sub-octave into one master gain so higher
    // tiers read as a big, loud danger horn rather than a thin beep.
    const master = audio.createGain()
    master.gain.setValueAtTime(0.0001, at)
    master.gain.exponentialRampToValueAtTime(tone.gain, at + 0.02)
    master.gain.setValueAtTime(tone.gain, at + dur * 0.7)
    master.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    master.connect(audio.destination)

    const voice = (f: number, detune: number, level: number) => {
      const osc = audio.createOscillator()
      const g = audio.createGain()
      osc.type = tone.type
      osc.frequency.value = f
      if (detune) osc.detune.value = detune
      g.gain.value = level
      osc.connect(g).connect(master)
      osc.start(at)
      osc.stop(at + dur)
    }
    voice(freq, 0, 1)
    if (tone.detune) voice(freq, tone.detune, 0.9)
    if (tone.sub) voice(freq / 2, 0, 0.7)
  }
  const cycle = () => {
    const t = audio.currentTime
    const hold = tone.hold ?? 0.2
    tone.pattern.forEach((freq, i) => beep(freq, t + i * tone.step, hold))
  }
  cycle()
  loopTimer = setInterval(cycle, tone.interval)
  stopTimer = setTimeout(stopBuzzerTest, durationMs)
}
