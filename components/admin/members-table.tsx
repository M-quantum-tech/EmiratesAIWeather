"use client"

import { useState, useTransition } from "react"
import { Building2, Check, Clock, KeyRound, Timer, User, X, Zap } from "lucide-react"
import type { AccessStatus, AdminMember } from "@/lib/admin"
import { PLANS, formatCents, type PlanId } from "@/lib/plans"
import { resetUserPassword, updateAccess, updateRole, updateServiceWindow } from "@/app/actions/admin"
import { cn } from "@/lib/utils"

const PLAN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  company: Building2,
  personal: User,
  pass_10m: Clock,
  pass_30m: Timer,
  pass_60m: Zap,
}

export function MembersTable({ members, currentUserId }: { members: AdminMember[]; currentUserId: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <Th>Member</Th>
            <Th>Plan</Th>
            <Th>Billing</Th>
            <Th>Access</Th>
            <Th>Service window</Th>
            <Th>Role</Th>
            <Th>Password</Th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <Row key={m.id} member={m} isSelf={m.id === currentUserId} />
          ))}
          {members.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                No members yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function Row({ member, isSelf }: { member: AdminMember; isSelf: boolean }) {
  const [pending, startTransition] = useTransition()
  const planDef = member.plan && member.plan in PLANS ? PLANS[member.plan as PlanId] : null
  const PlanIcon = member.plan ? (PLAN_ICONS[member.plan] ?? null) : null

  function toggleRole() {
    const next = member.role === "admin" ? "user" : "admin"
    startTransition(() => updateRole(member.id, next))
  }

  return (
    <tr className="border-b border-border/60 last:border-0 align-top">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{member.name}</span>
          <span className="text-xs text-muted-foreground">{member.email}</span>
          <span className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            Joined{" "}
            {new Date(member.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {member.plan ? (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            {PlanIcon ? <PlanIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> : null}
            {planDef?.name ?? member.plan}
          </span>
        ) : (
          <span className="text-muted-foreground">Free</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {member.priceCents != null
          ? planDef?.kind === "pass"
            ? `${formatCents(member.priceCents)} · ${planDef.cadenceLabel}`
            : `${formatCents(member.priceCents)} / ${member.interval}`
          : "—"}
      </td>
      <td className="px-4 py-3">
        <AccessControls member={member} />
      </td>
      <td className="px-4 py-3">
        <ServiceWindow member={member} />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={toggleRole}
          disabled={pending || isSelf}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-50",
            member.role === "admin"
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-border bg-secondary text-foreground hover:bg-secondary/70",
          )}
          title={isSelf ? "You cannot change your own role" : "Toggle admin role"}
        >
          {pending ? "…" : member.role}
        </button>
      </td>
      <td className="px-4 py-3">
        <PasswordReset member={member} />
      </td>
    </tr>
  )
}

export function PasswordReset({ member }: { member: AdminMember }) {
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  function save() {
    setMsg(null)
    startTransition(async () => {
      try {
        await resetUserPassword(member.id, value)
        setValue("")
        setMsg("Updated")
      } catch (err) {
        setMsg((err as Error).message)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New password"
          className="w-36 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || value.length < 8}
          className="w-fit rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
          title="Set a new password (min 8 characters)"
        >
          {pending ? "Saving…" : "Set password"}
        </button>
        {msg ? (
          <span
            className={cn(
              "text-[0.6875rem]",
              msg === "Updated" ? "text-emerald-400" : "text-red-400",
            )}
          >
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  )
}

const ACCESS_BADGE: Record<AccessStatus, string> = {
  allowed: "bg-emerald-500/15 text-emerald-400",
  denied: "bg-red-500/15 text-red-400",
  pending: "bg-amber-500/15 text-amber-400",
}

export function AccessControls({ member }: { member: AdminMember }) {
  const [pending, startTransition] = useTransition()
  function set(status: AccessStatus) {
    startTransition(() => updateAccess(member.id, status))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={cn(
          "inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
          ACCESS_BADGE[member.accessStatus],
        )}
      >
        {pending ? "…" : member.accessStatus}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set("allowed")}
          disabled={pending || member.accessStatus === "allowed"}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
        >
          <Check className="h-3 w-3" aria-hidden="true" /> Allow
        </button>
        <button
          type="button"
          onClick={() => set("denied")}
          disabled={pending || member.accessStatus === "denied"}
          className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40"
        >
          <X className="h-3 w-3" aria-hidden="true" /> Deny
        </button>
      </div>
    </div>
  )
}

function toInputValue(d: Date | null): string {
  if (!d) return ""
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ""
  // yyyy-MM-dd for <input type="date">
  return dt.toISOString().slice(0, 10)
}

export function ServiceWindow({ member }: { member: AdminMember }) {
  const [pending, startTransition] = useTransition()
  const [start, setStart] = useState(toInputValue(member.serviceStart))
  const [end, setEnd] = useState(toInputValue(member.serviceEnd))

  function save() {
    startTransition(() =>
      updateServiceWindow(member.id, start ? new Date(start).toISOString() : null, end ? new Date(end).toISOString() : null),
    )
  }
  const dirty =
    start !== toInputValue(member.serviceStart) || end !== toInputValue(member.serviceEnd)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">Start</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">End</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="w-fit rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save dates"}
      </button>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </th>
  )
}
