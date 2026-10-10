import { BUZZER_TONE, type BuzzerTone } from "@/lib/escalation"
import type { AlertLevel } from "@/lib/weather"

let ctx: AudioContext | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let loopTimer: ReturnType<typeof setInterval> | null = null
let liveTimer: ReturnType<typeof setInterval> | null = null
let liveLevel: AlertLevel | null = null
let unlockInstalled = false

export type AudioState = "running" | "blocked" | "unsupported"
const audioListeners = new Set<() => void>()
const emitAudio = () => audioListeners.forEach((fn) => fn())

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    ctx.onstatechange = emitAudio
  }
  if (ctx.state === "suspended") ctx.resume().then(emitAudio).catch(() => {})
  return ctx
}

/** "running" once the browser lets this page make sound without a fresh click. */
export function getAudioState(): AudioState {
  if (typeof window === "undefined") return "blocked"
  const audio = getCtx()
  if (!audio) return "unsupported"
  return audio.state === "running" ? "running" : "blocked"
}

export function subscribeAudioState(fn: () => void) {
  audioListeners.add(fn)
  return () => {
    audioListeners.delete(fn)
  }
}

/** Resume audio from inside a click handler (the one gesture browsers require). */
export async function armAudio(): Promise<AudioState> {
  const audio = getCtx()
  if (!audio) return "unsupported"
  try {
    await audio.resume()
  } catch {}
  emitAudio()
  return audio.state === "running" ? "running" : "blocked"
}

/**
 * Browsers keep audio muted until the page receives a user gesture. Resume the shared
 * context on the first click / tap / key press so a live alarm that trips later — with
 * nobody touching the screen — is actually heard on the station display.
 */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === "undefined") return
  unlockInstalled = true
  const unlock = () => {
    const audio = getCtx()
    if (audio && audio.state === "running") {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
      window.removeEventListener("touchstart", unlock)
    }
  }
  window.addEventListener("pointerdown", unlock)
  window.addEventListener("keydown", unlock)
  window.addEventListener("touchstart", unlock, { passive: true })
}

/** Whether a tier makes any sound at all (Green is silent). */
export function toneIsAudible(tone: BuzzerTone) {
  return tone.pattern.length > 0 && tone.gain > 0
}

function scheduleNote(audio: AudioContext, tone: BuzzerTone, freq: number, at: number, dur: number) {
  const master = audio.createGain()
  master.gain.setValueAtTime(0.0001, at)
  if (tone.bell) {
    master.gain.exponentialRampToValueAtTime(tone.gain, at + 0.005)
    master.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  } else {
    master.gain.exponentialRampToValueAtTime(tone.gain, at + 0.02)
    master.gain.setValueAtTime(tone.gain, at + dur * 0.7)
    master.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  }
  master.connect(audio.destination)

  const voice = (f: number, detune: number, level: number, type: OscillatorType = tone.type) => {
    const osc = audio.createOscillator()
    const g = audio.createGain()
    osc.type = type
    osc.frequency.value = f
    if (detune) osc.detune.value = detune
    g.gain.value = level
    osc.connect(g).connect(master)
    osc.start(at)
    osc.stop(at + dur)
  }
  voice(freq, 0, 1)
  if (tone.overtone) voice(freq * 2, 0, tone.overtone, "sine")
  if (tone.detune) voice(freq, tone.detune, 0.9)
  if (tone.sub) voice(freq / 2, 0, 0.7)
}

/** Schedule one full cycle of a tier's pattern starting now. */
export function playToneCycle(audio: AudioContext, tone: BuzzerTone) {
  if (!toneIsAudible(tone)) return
  const t = audio.currentTime
  const hold = tone.hold ?? 0.2
  tone.pattern.forEach((freq, i) => scheduleNote(audio, tone, freq, t + i * tone.step, hold))
}

/** Stop any test tone currently playing. */
export function stopBuzzerTest() {
  if (stopTimer) clearTimeout(stopTimer)
  if (loopTimer) clearInterval(loopTimer)
  stopTimer = null
  loopTimer = null
}

/**
 * Play the level-tuned alarm. By default it runs as a short ~2.4s preview so an
 * operator can sample a tier from the console. Pass `durationMs = null` to sound
 * it continuously (looping) until `stopBuzzerTest()` is called — this is how the
 * Simulator holds the alarm on for the active tier until it is silenced or the
 * test values fall back below the limit.
 */
export function playBuzzerTest(level: AlertLevel, durationMs: number | null = 2400) {
  stopBuzzerTest()
  const tone = BUZZER_TONE[level]
  if (!toneIsAudible(tone)) return
  const audio = getCtx()
  if (!audio) return
  playToneCycle(audio, tone)
  loopTimer = setInterval(() => playToneCycle(audio, tone), tone.interval)
  if (durationMs != null) stopTimer = setTimeout(stopBuzzerTest, durationMs)
}

/** Stop the live station alarm. */
export function stopLiveBuzzer() {
  if (liveTimer) clearInterval(liveTimer)
  liveTimer = null
  liveLevel = null
}

/**
 * Sound the live station alarm for a tier, looping until stopped. Green stops it.
 * Switching tier swaps the tone immediately (e.g. Yellow chime → Red pulse), and
 * re-calling with the same tier is a no-op so React re-renders never restart it.
 */
export function startLiveBuzzer(level: AlertLevel) {
  const tone = BUZZER_TONE[level]
  if (!toneIsAudible(tone)) {
    stopLiveBuzzer()
    return
  }
  if (liveLevel === level && liveTimer) return
  stopLiveBuzzer()
  const audio = getCtx()
  if (!audio) return
  playToneCycle(audio, tone)
  liveTimer = setInterval(() => playToneCycle(audio, tone), tone.interval)
  liveLevel = level
}
