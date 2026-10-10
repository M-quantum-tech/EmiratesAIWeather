import type { AlertLevel } from "@/lib/weather"

export type NotifyPermission = NotificationPermission | "unsupported"

const ALARM_TAG = "station-alarm"
const ENABLED_KEY = "station-alerts-enabled"
let workerPromise: Promise<ServiceWorkerRegistration | null> | null = null

// Per-device switch for this station display. Defaults to ON so a fresh PC never misses an alarm.
const enabledListeners = new Set<() => void>()

export function getAlertsEnabled(): boolean {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem(ENABLED_KEY) !== "off"
}

export function setAlertsEnabled(on: boolean) {
  window.localStorage.setItem(ENABLED_KEY, on ? "on" : "off")
  enabledListeners.forEach((fn) => fn())
}

export function subscribeAlertsEnabled(fn: () => void) {
  enabledListeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === ENABLED_KEY) fn()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    enabledListeners.delete(fn)
    window.removeEventListener("storage", onStorage)
  }
}

function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window
}

export function registerAlertWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null)
  if (!workerPromise) {
    workerPromise = navigator.serviceWorker
      .register("/alert-sw.js")
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null)
  }
  return workerPromise
}

export function getNotifyPermission(): NotifyPermission {
  return notifySupported() ? Notification.permission : "unsupported"
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!notifySupported()) return "unsupported"
  if (Notification.permission !== "default") return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

type AlarmNotification = { level: AlertLevel; title: string; body: string }

/**
 * OS-level alarm notification. It plays the system alert sound and shows on screen even
 * when nobody has touched the page and the tab is hidden. Orange / Red stay on screen
 * until someone dismisses them, so an unattended alarm cannot scroll away.
 */
export async function notifyStationAlarm({ level, title, body }: AlarmNotification) {
  if (!getAlertsEnabled() || getNotifyPermission() !== "granted") return
  const critical = level === "orange" || level === "red"
  const options = {
    body,
    tag: ALARM_TAG,
    renotify: true,
    requireInteraction: critical,
    silent: false,
    icon: "/apple-icon.png",
    badge: "/icon-light-32x32.png",
    vibrate: critical ? [400, 150, 400, 150, 400] : [250, 120, 250],
    data: { url: window.location.href },
  } as NotificationOptions
  const reg = await registerAlertWorker()
  try {
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    // Some browsers only allow worker notifications; nothing else to fall back to.
  }
}

export async function clearStationAlarm() {
  const reg = await registerAlertWorker()
  if (!reg) return
  const open = await reg.getNotifications({ tag: ALARM_TAG })
  open.forEach((n) => n.close())
}

let flashTimer: ReturnType<typeof setInterval> | null = null
let baseTitle = ""

/** Flash the tab title so an alarm shows in the taskbar even when the window isn't in front. */
export function startTitleFlash(text: string) {
  if (typeof document === "undefined") return
  stopTitleFlash()
  baseTitle = document.title
  let on = false
  flashTimer = setInterval(() => {
    on = !on
    document.title = on ? text : baseTitle
  }, 1000)
}

export function stopTitleFlash() {
  if (flashTimer) clearInterval(flashTimer)
  flashTimer = null
  if (baseTitle && typeof document !== "undefined") document.title = baseTitle
}

type WakeLockSentinelLike = { release: () => Promise<void> }
let wakeLock: WakeLockSentinelLike | null = null
let wakeInstalled = false

/** Keep the station display awake so the screen never sleeps through an alarm. */
export function keepStationAwake() {
  if (wakeInstalled || typeof navigator === "undefined") return
  const api = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } })
    .wakeLock
  if (!api) return
  wakeInstalled = true
  const acquire = () => {
    if (document.visibilityState !== "visible") return
    api
      .request("screen")
      .then((lock) => {
        wakeLock = lock
      })
      .catch(() => {})
  }
  acquire()
  document.addEventListener("visibilitychange", acquire)
}

export function isStationAwake() {
  return wakeLock != null
}
