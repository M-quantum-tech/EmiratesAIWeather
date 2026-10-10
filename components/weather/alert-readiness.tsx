"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { BellRing, ChevronDown, MonitorSmartphone, Volume2, VolumeX } from "lucide-react"
import { armAudio, getAudioState, subscribeAudioState } from "@/lib/escalation-buzzer"
import {
  getNotifyPermission,
  keepStationAwake,
  notifyStationAlarm,
  registerAlertWorker,
  requestNotifyPermission,
  type NotifyPermission,
} from "@/lib/alert-notify"
import { cn } from "@/lib/utils"

function useNotifyPermission(): [NotifyPermission, (p: NotifyPermission) => void] {
  const [perm, setPerm] = useState<NotifyPermission>("default")
  useEffect(() => {
    setPerm(getNotifyPermission())
    if (!("permissions" in navigator)) return
    let status: PermissionStatus | null = null
    const sync = () => setPerm(getNotifyPermission())
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s
        s.addEventListener("change", sync)
      })
      .catch(() => {})
    return () => status?.removeEventListener("change", sync)
  }, [])
  return [perm, setPerm]
}

/**
 * Shows whether this station can actually deliver an alarm with nobody touching it:
 * OS notifications (work with no click, in background tabs) and buzzer sound (browsers
 * need one gesture per page load unless autoplay is allowed for the site).
 */
export function AlertReadiness() {
  const audio = useSyncExternalStore(subscribeAudioState, getAudioState, () => "blocked" as const)
  const [notify, setNotify] = useNotifyPermission()
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    registerAlertWorker()
    keepStationAwake()
  }, [])

  const soundReady = audio === "running"
  const notifyReady = notify === "granted"
  const allReady = soundReady && notifyReady

  const arm = async () => {
    await armAudio()
    const next = await requestNotifyPermission()
    setNotify(next)
    if (next === "granted" && !notifyReady) {
      notifyStationAlarm({
        level: "yellow",
        title: "Station alerts armed",
        body: "This station will notify you on Yellow, Orange and Red even when the page is in the background.",
      })
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-2",
        allReady ? "border-border bg-panel" : "border-alert-orange/60 bg-alert-orange/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-foreground">
          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
          Alert delivery
        </span>
        <StatusChip
          ok={notifyReady}
          icon={MonitorSmartphone}
          label={
            notifyReady
              ? "Desktop alerts on"
              : notify === "denied"
                ? "Desktop alerts blocked"
                : notify === "unsupported"
                  ? "Desktop alerts unsupported"
                  : "Desktop alerts off"
          }
        />
        <StatusChip
          ok={soundReady}
          icon={soundReady ? Volume2 : VolumeX}
          label={soundReady ? "Buzzer sound armed" : "Buzzer sound blocked by browser"}
        />
        <span className="ml-auto flex items-center gap-2">
          {!allReady ? (
            <button
              type="button"
              onClick={arm}
              className="rounded-md bg-alert-orange px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Arm station alerts
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            aria-expanded={helpOpen}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Never miss an alert
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", helpOpen && "rotate-180")} aria-hidden="true" />
          </button>
        </span>
      </div>
      {!allReady ? (
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          Press <strong className="text-foreground">Arm station alerts</strong> once. Desktop alerts then pop up with the
          system sound on every Yellow, Orange and Red trip, with no click needed, even when this tab is hidden or
          minimised. Orange and Red stay on screen until dismissed.
        </p>
      ) : null}
      {helpOpen ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
          <p className="text-pretty">
            Browsers mute web audio until the page is clicked once after loading. To let the buzzer sound on its own
            after a reload, allow autoplay for this site once:
          </p>
          <ul className="flex flex-col gap-1 pl-4 [list-style:disc]">
            <li>
              <strong className="text-foreground">Edge:</strong> padlock in the address bar, then Permissions for this
              site, then Media autoplay: Allow.
            </li>
            <li>
              <strong className="text-foreground">Firefox:</strong> padlock, then Autoplay: Allow Audio and Video.
            </li>
            <li>
              <strong className="text-foreground">Chrome (control-room PC):</strong> launch with{" "}
              <code className="font-mono text-foreground">--autoplay-policy=no-user-gesture-required</code>, or have IT
              add this site to the <code className="font-mono text-foreground">AutoplayAllowlist</code> policy.
            </li>
            <li>
              If desktop alerts show as blocked, open the padlock, then set Notifications to Allow, and keep Windows
              Focus Assist / Do Not Disturb off on the station PC.
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function StatusChip({ ok, icon: Icon, label }: { ok: boolean; icon: typeof BellRing; label: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider",
        ok ? "border-alert-green/50 bg-alert-green/10 text-foreground" : "border-alert-orange/60 text-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-alert-green" : "bg-alert-orange tier-blink")} />
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}
