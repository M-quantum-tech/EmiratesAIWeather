"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { BellOff, BellRing, ChevronDown, MonitorSmartphone, Volume2, VolumeX } from "lucide-react"
import { armAudio, getAudioState, stopLiveBuzzer, subscribeAudioState } from "@/lib/escalation-buzzer"
import {
  clearStationAlarm,
  getAlertsEnabled,
  getNotifyPermission,
  keepStationAwake,
  notifyStationAlarm,
  registerAlertWorker,
  requestNotifyPermission,
  setAlertsEnabled,
  stopTitleFlash,
  subscribeAlertsEnabled,
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
 * ON/OFF switch for this station display. ON arms the buzzer and asks for desktop alerts
 * in the same click (browsers need one gesture); OFF silences buzzer, desktop alerts and
 * the flashing tab title on this PC only.
 */
export function AlertReadiness() {
  const enabled = useSyncExternalStore(subscribeAlertsEnabled, getAlertsEnabled, () => true)
  const audio = useSyncExternalStore(subscribeAudioState, getAudioState, () => "blocked" as const)
  const [notify, setNotify] = useNotifyPermission()
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    registerAlertWorker()
    keepStationAwake()
  }, [])

  const soundReady = audio === "running"
  const notifyReady = notify === "granted"
  const needsAttention = enabled && !(soundReady && notifyReady)

  // Browser permission / audio-resume promises can stay pending indefinitely (embedded
  // views, ignored prompts), so the switch flips immediately and never awaits them.
  const armBrowser = (confirm: boolean) => {
    void armAudio()
    void requestNotifyPermission().then((next) => {
      setNotify(next)
      if (confirm && next === "granted") {
        notifyStationAlarm({
          level: "yellow",
          title: "Station alerts ON",
          body: "This station will alert on Yellow, Orange and Red even when the page is in the background.",
        })
      }
    })
  }

  const turnOn = () => {
    setAlertsEnabled(true)
    armBrowser(true)
  }

  const turnOff = () => {
    setAlertsEnabled(false)
    stopLiveBuzzer()
    stopTitleFlash()
    clearStationAlarm()
  }

  const toggle = () => (enabled ? turnOff() : turnOn())

  const rearm = () => armBrowser(false)

  return (
    <div
      role="region"
      aria-label="Station alert delivery"
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-2",
        !enabled
          ? "border-alert-red/60 bg-alert-red/10"
          : needsAttention
            ? "border-alert-orange/60 bg-alert-orange/10"
            : "border-border bg-panel",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="order-last ml-auto flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Station alerts"
            onClick={toggle}
            className={cn(
              "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              enabled ? "border-alert-green bg-alert-green" : "border-border bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute font-mono text-[0.5625rem] font-bold uppercase",
                enabled ? "left-2 text-background" : "right-2 text-muted-foreground",
              )}
            >
              {enabled ? "On" : "Off"}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                enabled ? "translate-x-8" : "translate-x-1",
              )}
            />
          </button>
          <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-foreground">
            {enabled ? (
              <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Station alerts {enabled ? "on" : "off"}
          </span>
        </div>

        {enabled ? (
          <>
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
              label={soundReady ? "Buzzer sound ready" : "Buzzer needs one click"}
            />
          </>
        ) : null}

        <span className="flex items-center gap-3">
          {needsAttention && notify !== "denied" && notify !== "unsupported" ? (
            <button
              type="button"
              onClick={rearm}
              className="rounded-md border border-alert-orange/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-alert-orange/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Re-arm
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

      <p role="status" aria-live="polite" className="text-pretty text-xs leading-relaxed text-muted-foreground">
        {!enabled ? (
          <>
            Alerts are <strong className="text-foreground">OFF on this PC</strong>: no buzzer, desktop alert or tab flash
            will fire here. Switch ON to resume.
          </>
        ) : notify === "denied" ? (
          <>
            The browser has blocked desktop alerts for this site. Open the padlock in the address bar, set Notifications
            to Allow, then reload. The on-page buzzer still works.
          </>
        ) : notify === "unsupported" ? (
          <>
            This view cannot show desktop alerts (embedded preview or unsupported browser). Open the station in its own
            browser tab for desktop alerts; the on-page buzzer still works.
          </>
        ) : needsAttention ? (
          <>
            Alerts are ON. Press <strong className="text-foreground">Re-arm</strong> (or click anywhere) once after a
            reload so the browser lets the buzzer sound unattended.
          </>
        ) : (
          <>Alerts are ON. Yellow, Orange and Red will sound and pop up with no click needed, even when this tab is hidden.</>
        )}
      </p>

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
