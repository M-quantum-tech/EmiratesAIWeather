"use client"

import { useTransition } from "react"
import { Building2, Clock, Timer, User, Zap } from "lucide-react"
import type { AdminMember } from "@/lib/admin"
import { PLANS, formatCents, type PlanId } from "@/lib/plans"
import { updateRole } from "@/app/actions/admin"
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
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <Th>Member</Th>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Billing</Th>
            <Th>Role</Th>
            <Th>Joined</Th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <Row key={m.id} member={m} isSelf={m.id === currentUserId} />
          ))}
          {members.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{member.name}</span>
          <span className="text-xs text-muted-foreground">{member.email}</span>
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
      <td className="px-4 py-3">
        {member.status ? (
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
              member.status === "active"
                ? "bg-accent/15 text-accent"
                : "bg-muted text-muted-foreground",
            )}
          >
            {member.status}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
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
      <td className="px-4 py-3 text-muted-foreground">
        {new Date(member.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
    </tr>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </th>
  )
}
